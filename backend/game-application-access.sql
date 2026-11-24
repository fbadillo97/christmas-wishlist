alter table white_elephant.games add column completed_at timestamptz;
update white_elephant.games set completed_at=(ceremony->>'start')::timestamptz where state->>'phase'='done' and ceremony ? 'start';
CREATE OR REPLACE FUNCTION white_elephant.can_upload(path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select (wishlist_private.app_role('game') is not null) and exists(select 1 from white_elephant.games g
 where auth.uid()=any(g.hosts) and g.id::text=split_part(path,'/',1) and (exists(select 1 from jsonb_each(g.state->'gifts') where value->>'id'=split_part(path,'/',2)) or exists(select 1 from jsonb_array_elements(white_elephant.portraits(g,false)) p where p->>'id'=split_part(path,'/',2)))
 and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$')
$function$;


CREATE OR REPLACE FUNCTION white_elephant.attach_photo(game uuid, gift uuid, previous uuid, photo uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g white_elephant.games;
begin
 select * into g from white_elephant.games where id=game and auth.uid()=any(hosts) for update;
 if not found or not (wishlist_private.app_role('game') is not null) then raise exception 'Host access required' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_each(g.state->'gifts') where value->>'id'=gift::text) and not exists(select 1 from jsonb_array_elements(white_elephant.portraits(g,false)) p where p->>'id'=gift::text) then raise exception 'Player or gift unavailable'; end if;
 if g.photos->>gift::text=photo::text then return; end if;
 if (g.photos->>gift::text) is distinct from previous::text then raise exception 'Photo changed. Refresh and retry.' using errcode='PT409'; end if;
 if not exists(select 1 from storage.objects where bucket_id='we-gift-photos' and name=game::text||'/'||gift::text||'/'||photo::text||'.jpg') then raise exception 'Upload incomplete'; end if;
 update white_elephant.games set photos=jsonb_set(photos,array[gift::text],to_jsonb(photo)) where id=game;
end;
$function$;


CREATE OR REPLACE FUNCTION white_elephant.cohost_choices()
 RETURNS TABLE(account uuid, email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(wishlist_private.app_role('game'),'') not in ('owner','editor') then
   raise exception 'Organizer access required' using errcode='42501';
 end if;
 return query select u.id,f.email::text from wishlist_private.family_members f
 join auth.users u on lower(u.email)=f.email where f.game_access and f.active and u.email_confirmed_at is not null and u.id<>auth.uid() order by f.email;
end;
$function$;


CREATE OR REPLACE FUNCTION white_elephant.account_portrait(id uuid, image text, write_photo boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare bytes bytea;
begin
 if coalesce(wishlist_private.app_role('game'),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 if write_photo then
   if image is null or length(image)>699052 then raise exception 'Invalid photo size'; end if;
   bytes:=decode(image,'base64');
   if substring(bytes from 1 for 3)<>decode('ffd8ff','hex') or octet_length(bytes)>524288 then raise exception 'JPEG required'; end if;
   update wishlist_private.family_members set game_portrait=bytes where account_id=id and active;
   if not found then raise exception 'Account unavailable'; end if;
   return null;
 end if;
 select game_portrait into bytes from wishlist_private.family_members where account_id=id and active;
 return replace(encode(bytes,'base64'),chr(10),'');
end;$function$;


CREATE OR REPLACE FUNCTION white_elephant.active_host_games()
 RETURNS TABLE(id uuid, player_count integer, turn_no integer, player text, paused boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select g.id, cardinality(g.lineup), (g.state->>'turn')::integer,
    g.lineup[(g.state->>'active')::integer], g.paused
  from white_elephant.games g
  where (wishlist_private.app_role('game') is not null) and auth.uid()=any(g.hosts)
    and g.state->>'phase' not in ('done','cancelled')
  order by g.id
$function$;


CREATE OR REPLACE FUNCTION white_elephant.host_action(game uuid, expected bigint, command text, move_type text, target text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g white_elephant.games; next_state jsonb; last_move white_elephant.history;
begin
  if wishlist_private.app_role('game') is null then raise exception 'Host access required' using errcode='42501'; end if;
  if command = 'read' then
    select * into g from white_elephant.games where id=game and auth.uid()=any(hosts);
  else
    select * into g from white_elephant.games where id=game and auth.uid()=any(hosts) for update;
  end if;
  if not found then raise exception 'Host access required' using errcode='42501'; end if;
  if command = 'read' then return white_elephant.snapshot(g); end if;
  if expected is distinct from g.revision then raise exception 'Refresh game state' using errcode='PT409'; end if;
  if g.state->>'phase'='cancelled' then raise exception 'Game cancelled'; end if;
  if command='rename_gift' then
    if not (g.state->'gifts' ? move_type) or move_type is null then raise exception 'Gift unavailable'; end if;
    target:=btrim(target);
    if target is null or length(target) not between 1 and 160 or target ~ '[[:cntrl:]]' then
      raise exception 'Enter a gift name of 1 to 160 characters on one line.';
    end if;
    update white_elephant.games set revision=g.revision+1,
      gift_titles=jsonb_set(g.gift_titles,array[coalesce(g.state->'gifts'->move_type->>'id',move_type)],to_jsonb(target))
      where id=game returning * into g;
    return white_elephant.snapshot(g);
  end if;
  if command in ('awards_next','awards_replay','awards_skip') then
    if g.state->>'phase'<>'done' then raise exception 'Game still active'; end if;
    update white_elephant.games set revision=g.revision+1,
      ceremony=case command when 'awards_skip' then '{"skip":true}'::jsonb
      when 'awards_replay' then jsonb_build_object('start',statement_timestamp(),'next','[]'::jsonb)
      else jsonb_set(g.ceremony,'{next}',coalesce(g.ceremony->'next','[]') || to_jsonb(statement_timestamp())) end
      where id=game returning * into g;
    return white_elephant.snapshot(g);
  end if;
  case command
    when 'cancel_game' then
      if g.state->>'phase'='done' then raise exception 'Game already complete'; end if;
      g.pending := null;
      g.paused := false;
      g.state := g.state || '{"phase":"cancelled","active":null}'::jsonb;
    when 'propose' then
      if g.paused or g.pending is not null then raise exception 'Game paused or move pending'; end if;
      perform white_elephant.move(g.state,cardinality(g.lineup),move_type,target);
      g.pending := jsonb_build_object('type',move_type,'target',target);
    when 'confirm' then
      if g.paused or g.pending is null then raise exception 'No confirmable move'; end if;
      next_state := white_elephant.move(g.state,cardinality(g.lineup),g.pending->>'type',g.pending->>'target');
      if g.pending->>'type'='open' then
        next_state:=jsonb_set(next_state,array['gifts',g.state->>'turn','id'],to_jsonb(gen_random_uuid()));
      end if;
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
  update white_elephant.games set revision=g.revision+1, completed_at=case when g.state->>'phase'<>'done' then null when command='confirm' then statement_timestamp() else g.completed_at end, ceremony=case when command='confirm' and g.state->>'phase'='done'
      then jsonb_build_object('start',statement_timestamp(),'next','[]'::jsonb) else g.ceremony end,
    state=g.state, pending=g.pending, paused=g.paused
    where id=game returning * into g;
  return white_elephant.snapshot(g);
end;
$function$;


CREATE OR REPLACE FUNCTION white_elephant.recipient_names()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(wishlist_private.app_role('game'),'') not in ('editor','owner') then
   raise exception 'Organizer access required' using errcode='42501';
 end if;
 return query select coalesce(nullif(btrim(concat_ws(' ',f.first_name,f.last_name)),''),'Family member ' || left(f.account_id::text,6))
 from wishlist_private.family_members f where f.active

 order by 1;
end;$function$;


CREATE OR REPLACE FUNCTION white_elephant.start_game(request_id uuid, names text[], cohosts uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  g white_elephant.games;
  roster text[];
  host_ids uuid[];
  payload jsonb;
begin
  if coalesce(wishlist_private.app_role('game'),'') not in ('editor','owner') then
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
      where u.id = selected.id and u.email_confirmed_at is not null and f.game_access and f.active
    )
  ) then
    -- Raising here rolls back the new game. Replays above retain their saved state.
    raise exception 'Each co-host must be an active, verified family member' using errcode='22023';
  end if;
  return white_elephant.snapshot(g);
end;
$function$;


CREATE OR REPLACE FUNCTION white_elephant.pair_tv(game uuid, enable boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare token uuid;
begin
  if wishlist_private.app_role('game') is null then
    raise exception 'Host access required' using errcode='42501';
  end if;
  if enable then token := gen_random_uuid(); end if;
  update white_elephant.games set tv_digest=sha256(uuid_send(token))
    where id=game and auth.uid()=any(hosts);
  if not found then raise exception 'Host access required' using errcode='42501'; end if;
  return token;
end;
$function$;


CREATE OR REPLACE FUNCTION white_elephant.viewer_choices()
 RETURNS TABLE(id uuid, name text, has_photo boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(wishlist_private.app_role('game'),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 return query select f.account_id,coalesce(nullif(btrim(concat_ws(' ',f.first_name,f.last_name)),''),'Family member ' || left(f.account_id::text,6)),f.game_portrait is not null
 from wishlist_private.family_members f where f.active order by 2;
end;$function$;


create function public.we_recent_results() returns table(id uuid,player_count integer,completed_at timestamptz)
language sql stable security definer set search_path='' as $$
 select g.id,cardinality(g.lineup),g.completed_at from white_elephant.games g
 where wishlist_private.app_role('game') is not null and auth.uid()=any(g.hosts) and g.state->>'phase'='done'
 order by 3 desc nulls last,g.id limit 10
$$;
revoke all on function public.we_recent_results() from public,anon;
grant execute on function public.we_recent_results() to authenticated;

