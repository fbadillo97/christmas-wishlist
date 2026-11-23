alter table white_elephant.games add column ceremony jsonb not null default '{}';
create or replace function white_elephant.host_action(game uuid, expected bigint, command text, move_type text, target text)
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
  update white_elephant.games set revision=g.revision+1, ceremony=case when command='confirm' and g.state->>'phase'='done'
      then jsonb_build_object('start',statement_timestamp(),'next','[]'::jsonb) else g.ceremony end,
    state=g.state, pending=g.pending, paused=g.paused
    where id=game returning * into g;
  return white_elephant.snapshot(g);
end;
$$;


create or replace function white_elephant.tv_board(game uuid, token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare board jsonb;
begin
  select jsonb_build_object('revision', revision, 'paused', paused, 'phase', state->'phase',
    'last_move',(select jsonb_build_object('revision',h.revision,'kind',h.action->>'type',
      'actor',(h.previous_state->>'active')::integer,
      'gift',case when h.action->>'type'='open' then h.previous_state->>'turn' else h.action->>'target' end)
      from white_elephant.history h where h.game_id=g.id and h.undone_at is null
      order by h.revision desc limit 1),
    'portraits',white_elephant.portraits(g,state->>'phase'<>'done'),'turn', state->'turn','active',state->'active','gifts',white_elephant.display_gifts(g),
    'revealed',lineup[1:(state->>'turn')::integer], 'player_count',cardinality(lineup))
    || case when state->>'phase'='done' then jsonb_build_object('ceremony',g.ceremony,'clock',statement_timestamp(),
      'moves',(select coalesce(jsonb_agg(jsonb_build_object('kind',h.action->>'type',
        'actor',h.previous_state->'active','turn',h.previous_state->'turn','phase',h.previous_state->'phase',
        'displaced',h.previous_state->'gifts'->(h.action->>'target')->'owner') order by h.revision),'[]')
        from white_elephant.history h where h.game_id=g.id and h.undone_at is null)) else '{}'::jsonb end
    into board from white_elephant.games g where id=game and tv_digest=sha256(uuid_send(token));
  if not found then raise exception 'TV link is unavailable' using errcode='42501'; end if;
  return board;
end;
$$;

