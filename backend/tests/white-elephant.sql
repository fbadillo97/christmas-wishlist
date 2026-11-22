-- Run in a transaction and roll back. Requires a privileged fixture connection.
set local plpgsql.check_asserts = on;
do $test$
declare
  s jsonb := '{"phase":"regular","turn":1,"active":1,"gifts":{}}';
  final_state jsonb;
  i integer;
  refused boolean;
begin
  for i in 1..3 loop
    s := white_elephant.move(s,4,'open',null);
  end loop;
  s := white_elephant.move(s,4,'steal','1');
  refused := false;
  begin perform white_elephant.move(s,4,'steal','1');
  exception when raise_exception then refused := true; end;
  assert refused, 'immediate steal-back accepted';
  foreach i in array array[2,1,3,1] loop
    s := white_elephant.move(s,4,'steal',i::text);
  end loop;
  assert s#>>'{gifts,1,steals}'='3' and s->>'turn'='4', 'repeat steal or lock count';
  s := white_elephant.move(s,4,'open','Fourth');
  assert s->>'phase'='final' and s->>'active'='1';
  assert white_elephant.move(s,4,'keep',null)->>'phase'='done';
  refused := false;
  begin perform white_elephant.move(s,4,'steal','1');
  exception when raise_exception then refused := true; end;
  assert refused, 'locked gift stolen during final';
  final_state := white_elephant.move(s,4,'steal','4');
  final_state := white_elephant.move(final_state,4,'steal','3');
  final_state := white_elephant.move(final_state,4,'take','2');
  assert final_state->>'phase'='done';
  assert (select count(distinct value->>'owner') from jsonb_each(final_state->'gifts'))=4;
end
$test$;

do $test$
declare
  host uuid := gen_random_uuid();
  peer uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  who uuid;
  email text;
  game uuid;
  snapshot jsonb;
  saved jsonb;
  refused boolean := false;
begin
  foreach who in array array[host,peer,outsider] loop
    email := who::text || '@example.invalid';
    insert into auth.users(id,email,email_confirmed_at) values(who,email,now());
    if who <> outsider then
      insert into wishlist_private.family_members(email,role) values(email,case when who=host then 'editor' else 'viewer' end);
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub',host::text,true);
  snapshot := public.we_start_game(array['Red','Blue','Green'],array[peer]);
  game := (snapshot->>'id')::uuid;
  assert jsonb_array_length(snapshot->'revealed')=1;
  saved := snapshot->'state';
  perform public.we_host_action(game,0,'propose','open','Parcel');
  perform set_config('request.jwt.claim.sub',peer::text,true);
  begin perform public.we_host_action(game,0,'propose','open','Second');
  exception when serialization_failure then refused := true; end;
  assert refused, 'stale proposal accepted';
  refused := false;
  begin perform public.we_host_action(game,1,'undo');
  exception when raise_exception then refused := true; end;
  assert refused, 'undo accepted while pending';
  perform public.we_host_action(game,1,'pause');
  refused := false;
  begin perform public.we_host_action(game,2,'confirm');
  exception when raise_exception then refused := true; end;
  assert refused, 'confirmed while paused';
  perform public.we_host_action(game,2,'resume');
  snapshot := public.we_host_action(game,3,'confirm');
  assert snapshot#>>'{state,gifts,1,title}'='Parcel' and snapshot#>>'{state,turn}'='2';
  snapshot := public.we_host_action(game,4,'undo');
  assert snapshot->'state'=saved and snapshot->>'revision'='5';
  perform public.we_host_action(game,5,'propose','open',null);
  snapshot := public.we_host_action(game,6,'cancel');
  assert snapshot->'state'=saved and snapshot->'pending'='null'::jsonb;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  refused := false;
  begin perform public.we_host_action(game,null,'read');
  exception when insufficient_privilege then refused := true; end;
  assert refused, 'unlisted account can read';
  insert into wishlist_private.family_members(email,role) values(outsider::text || '@example.invalid','viewer');
  refused := false;
  begin perform public.we_host_action(game,7,'propose','open',null);
  exception when insufficient_privilege then refused := true; end;
  assert refused, 'family nonhost can write';
  assert not has_function_privilege('anon','public.we_host_action(uuid,bigint,text,text,text)','execute');
  assert not has_table_privilege('authenticated','white_elephant.games','select');
end
$test$;

-- Exercise a full exchange at the intended party size, including a final chain.
do $test$
declare
  s jsonb := '{"phase":"regular","turn":1,"active":1,"gifts":{}}';
  previous jsonb;
  n integer;
  refused boolean := false;
begin
  for n in 1..18 loop
    assert (s->>'turn')::integer=n and (s->>'active')::integer=n;
    if n>1 then s := white_elephant.move(s,18,'steal',(n-1)::text); end if;
    s := white_elephant.move(s,18,'open',null);
    assert (select count(distinct value->>'owner') from jsonb_each(s->'gifts'))=n;
  end loop;
  previous := s;
  s := white_elephant.move(s,18,'steal','17');
  s := white_elephant.move(s,18,'steal','1');
  s := white_elephant.move(s,18,'take','18');
  assert s->>'phase'='done' and s->>'active' is null;
  assert (select count(distinct value->>'owner') from jsonb_each(s->'gifts'))=18;
  previous := jsonb_set(previous,'{gifts,18,steals}','3');
  begin perform white_elephant.move(previous,18,'steal','17');
  exception when raise_exception then refused := true; end;
  assert refused, 'Player 1 gave away a locked gift';
  assert white_elephant.move(previous,18,'keep',null)->>'phase'='done';
end
$test$;
