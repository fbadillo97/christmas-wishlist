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
  update white_elephant.games set revision=g.revision+1, state=g.state, pending=g.pending, paused=g.paused
    where id=game returning * into g;
  return white_elephant.snapshot(g);
end;
$$;

create function white_elephant.guard_cancelled_game() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Game cancelled';
end;
$$;
revoke all on function white_elephant.guard_cancelled_game() from public, anon, authenticated;
create trigger guard_cancelled_game before update on white_elephant.games
for each row when (old.state->>'phase'='cancelled')
execute function white_elephant.guard_cancelled_game();
