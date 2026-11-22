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
    'portraits',white_elephant.portraits(g,true),'turn', state->'turn','active',state->'active','gifts',white_elephant.display_gifts(g),
    'revealed',lineup[1:(state->>'turn')::integer], 'player_count',cardinality(lineup))
    into board from white_elephant.games g where id=game and tv_digest=sha256(uuid_send(token));
  if not found then raise exception 'TV link is unavailable' using errcode='42501'; end if;
  return board;
end;
$$;
