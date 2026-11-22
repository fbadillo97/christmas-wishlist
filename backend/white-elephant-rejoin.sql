create function white_elephant.active_host_games()
returns table(id uuid, player_count integer, turn_no integer, player text, paused boolean)
language sql stable security definer set search_path='' as $$
  select g.id, cardinality(g.lineup), (g.state->>'turn')::integer,
    g.lineup[(g.state->>'active')::integer], g.paused
  from white_elephant.games g
  where wishlist_private.is_family_member() and auth.uid()=any(g.hosts)
    and g.state->>'phase' not in ('done','cancelled')
  order by g.id
$$;
create function public.we_active_host_games()
returns table(id uuid, player_count integer, turn_no integer, player text, paused boolean)
language sql stable security invoker set search_path='' as $$
  select * from white_elephant.active_host_games()
$$;
revoke all on function white_elephant.active_host_games(), public.we_active_host_games() from public,anon,authenticated;
grant execute on function white_elephant.active_host_games(), public.we_active_host_games() to authenticated;
