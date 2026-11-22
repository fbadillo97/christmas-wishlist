-- Apply as a single transaction, after the wishlist family-role migration.
create schema white_elephant;
revoke all on schema white_elephant from public, anon, authenticated;
create table white_elephant.games (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  start_request uuid not null,
  start_payload jsonb not null,
  unique (created_by, start_request),
  hosts uuid[] not null,
  lineup text[] not null,
  state jsonb not null,
  revision bigint not null default 0,
  paused boolean not null default false,
  pending jsonb
);
create table white_elephant.history (
  game_id uuid not null references white_elephant.games,
  revision bigint not null,
  actor uuid not null,
  action jsonb not null,
  previous_state jsonb not null,
  undone_at bigint,
  primary key (game_id, revision)
);
alter table white_elephant.games enable row level security;
alter table white_elephant.history enable row level security;
revoke all on all tables in schema white_elephant from public, anon, authenticated;

-- Player numbers are one-based. Gift keys are the numbered turn on which they opened.
create function white_elephant.move(s jsonb, players integer, action text, target text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare
  phase text := s->>'phase';
  turn_no integer := (s->>'turn')::integer;
  actor integer := (s->>'active')::integer;
  gifts jsonb := s->'gifts';
  gift jsonb := gifts->target;
  mine text;
  displaced integer;
begin
  if phase = 'done' then raise exception 'Game is complete'; end if;
  if phase = 'final' then
    select key into strict mine from jsonb_each(gifts) where (value->>'owner')::integer = 1;
  end if;
  if action = 'keep' and phase = 'final' then
    phase := 'done';
  elsif action = 'open' and phase = 'regular' then
    gifts := gifts || jsonb_build_object(turn_no::text, jsonb_build_object(
      'title', coalesce(nullif(btrim(target), ''), 'Gift ' || turn_no), 'owner', actor, 'steals', 0));
    if length(target) > 160 then raise exception 'Gift title exceeds 160 characters'; end if;
    if turn_no < players then
      turn_no := turn_no + 1;
      actor := turn_no;
    else
      actor := 1;
      phase := 'final';
    end if;
    s := s - 'blocked';
  elsif action = 'steal' then
    displaced := (gift->>'owner')::integer;
    if displaced is null or displaced = actor or (gift->>'steals')::integer >= 3
       or target = s->>'blocked' then raise exception 'Gift cannot be stolen'; end if;
    if phase = 'final' then
      if (gifts->mine->>'steals')::integer >= 3 then raise exception 'Your gift is locked'; end if;
      gifts := jsonb_set(gifts, array[mine,'owner'], 'null');
      phase := 'replacement';
    end if;
    gifts := jsonb_set(gifts, array[target], gift || jsonb_build_object(
      'owner', actor, 'steals', (gift->>'steals')::integer + 1));
    actor := displaced;
    s := s || jsonb_build_object('blocked', target);
  elsif action = 'take' and phase = 'replacement' and gift->'owner' = 'null'::jsonb then
    gifts := jsonb_set(gifts, array[target,'owner'], to_jsonb(actor));
    phase := 'done';
  else
    raise exception 'Action unavailable in this phase';
  end if;
  if phase = 'done' then actor := null; s := s - 'blocked'; end if;
  return s || jsonb_build_object('phase',phase,'active',actor,'turn',turn_no,'gifts',gifts);
end;
$$;

create function white_elephant.snapshot(g white_elephant.games) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',g.id,'revision',g.revision,'paused',g.paused,'pending',g.pending,
    'state',g.state,'revealed',g.lineup[1:(g.state->>'turn')::integer],'player_count',cardinality(g.lineup))
$$;

create function white_elephant.start_game(request_id uuid, names text[], cohosts uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  g white_elephant.games;
  roster text[];
  host_ids uuid[];
  payload jsonb;
begin
  if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then
    raise exception 'Editor access required' using errcode='42501';
  end if;
  if request_id is null then raise exception 'Start request ID required'; end if;
  select array_agg(btrim(regexp_replace(n,'[[:space:]]+',' ','g')) order by position)
    into roster from unnest(names) with ordinality as entries(n, position);
  if cardinality(roster) is null or cardinality(roster) not between 2 and 100
     or exists(select 1 from unnest(roster) n where n is null or length(n) not between 1 and 80)
     then raise exception 'Supply 2 to 100 player names of 1 to 80 characters'; end if;
  if exists(select 1 from unnest(roster) n group by lower(n) having count(*) > 1)
     then raise exception 'Each player needs a distinct display name'; end if;

  if exists(select 1 from unnest(cohosts) h where h is null) then
    raise exception 'Each co-host must be an active, verified family member' using errcode='22023';
  end if;
  select array_agg(distinct h order by h) into host_ids
    from unnest(array_append(coalesce(cohosts,'{}'),auth.uid())) h where h is not null;
  payload := jsonb_build_object('names',roster,'hosts',host_ids);
  insert into white_elephant.games(created_by,start_request,start_payload,hosts,lineup,state)
    values(auth.uid(),request_id,payload,host_ids,
      array(select n from unnest(roster) n order by random()),
      '{"phase":"regular","turn":1,"active":1,"gifts":{}}')
    on conflict (created_by,start_request) do nothing returning * into g;
  if not found then
    select * into strict g from white_elephant.games
      where created_by=auth.uid() and start_request=request_id;
    if g.start_payload <> payload then raise exception 'Start request ID reused with different settings'; end if;
  elsif exists (
    select 1 from unnest(host_ids) as selected(id)
    where not exists (
      select 1 from auth.users u
      join wishlist_private.family_members f on f.email = lower(u.email)
      where u.id = selected.id and u.email_confirmed_at is not null and f.active
    )
  ) then
    -- Raising here rolls back the new game. Replays above retain their saved state.
    raise exception 'Each co-host must be an active, verified family member' using errcode='22023';
  end if;
  return white_elephant.snapshot(g);
end;
$$;

create function white_elephant.host_action(game uuid, expected bigint, command text, move_type text, target text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g white_elephant.games; next_state jsonb; last_move white_elephant.history;
begin
  if not wishlist_private.is_family_member() then raise exception 'Host access required' using errcode='42501'; end if;
  if command = 'read' then
    select * into g from white_elephant.games where id=game and auth.uid()=any(hosts);
  else
    select * into g from white_elephant.games where id=game and auth.uid()=any(hosts) for update;
  end if;
  if not found then raise exception 'Host access required' using errcode='42501'; end if;
  if command = 'read' then return white_elephant.snapshot(g); end if;
  if expected is distinct from g.revision then raise exception 'Refresh game state' using errcode='40001'; end if;
  case command
    when 'propose' then
      if g.paused or g.pending is not null then raise exception 'Game paused or move pending'; end if;
      perform white_elephant.move(g.state,cardinality(g.lineup),move_type,target);
      g.pending := jsonb_build_object('type',move_type,'target',target);
    when 'confirm' then
      if g.paused or g.pending is null then raise exception 'No confirmable move'; end if;
      next_state := white_elephant.move(g.state,cardinality(g.lineup),g.pending->>'type',g.pending->>'target');
      insert into white_elephant.history(game_id,revision,actor,action,previous_state)
        values(game,g.revision+1,auth.uid(),g.pending,g.state);
      g.state := next_state;
      g.pending := null;
    when 'cancel' then
      if g.pending is null then raise exception 'No pending move'; end if;
      g.pending := null;
    when 'pause' then g.paused := true;
    when 'resume' then g.paused := false;
    when 'undo' then
      if g.pending is not null then raise exception 'Cancel pending move before undo'; end if;
      select * into last_move from white_elephant.history where game_id=game and undone_at is null
        order by revision desc limit 1;
      if not found then raise exception 'No move to undo'; end if;
      g.state := last_move.previous_state;
      update white_elephant.history set undone_at=g.revision+1 where game_id=game and revision=last_move.revision;
    else raise exception 'Unknown host command';
  end case;
  update white_elephant.games set revision=g.revision+1, state=g.state, pending=g.pending, paused=g.paused
    where id=game returning * into g;
  return white_elephant.snapshot(g);
end;
$$;

create function public.we_start_game(request_id uuid, names text[], cohosts uuid[] default '{}') returns jsonb
language sql security invoker set search_path='' as $$select white_elephant.start_game(request_id,names,cohosts)$$;
create function public.we_host_action(game uuid, expected bigint, command text, move_type text default null, target text default null)
returns jsonb language sql security invoker set search_path='' as $$select white_elephant.host_action(game,expected,command,move_type,target)$$;
revoke all on all functions in schema white_elephant from public, anon, authenticated;
revoke all on function public.we_start_game(uuid,text[],uuid[]), public.we_host_action(uuid,bigint,text,text,text) from public, anon, authenticated;
grant usage on schema white_elephant to authenticated;
grant execute on function white_elephant.start_game(uuid,text[],uuid[]), white_elephant.host_action(uuid,bigint,text,text,text),
  public.we_start_game(uuid,text[],uuid[]), public.we_host_action(uuid,bigint,text,text,text) to authenticated;
