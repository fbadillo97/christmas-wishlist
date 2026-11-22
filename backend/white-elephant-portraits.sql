-- Portrait identifiers are scoped to one immutable event roster.
create function white_elephant.portraits(g white_elephant.games, active_only boolean) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('title',name,'id',id,'photo',g.photos->id) order by lower(name)),'[]')
 from (select name, md5(g.id::text||name)::uuid::text as id from unnest(g.lineup) name
 where not active_only or name=g.lineup[(g.state->>'active')::integer]) p
$$;
revoke all on function white_elephant.portraits(white_elephant.games,boolean) from public,anon,authenticated;
create function white_elephant.recipient_names() returns setof text language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Organizer access required' using errcode='42501'; end if;
 return query select distinct p.name::text from wishlist_private.wishlist_people p order by 1;
end;$$;
create function public.we_recipient_names() returns setof text language sql stable security invoker set search_path='' as $$select * from white_elephant.recipient_names()$$;
revoke all on function public.we_recipient_names(),white_elephant.recipient_names() from public,anon,authenticated;
grant execute on function public.we_recipient_names(),white_elephant.recipient_names() to authenticated;
create or replace function white_elephant.snapshot(g white_elephant.games) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',g.id,'revision',g.revision,'paused',g.paused,'pending',g.pending,
    'portraits',white_elephant.portraits(g,false),'state',jsonb_set(g.state,'{gifts}',white_elephant.display_gifts(g)),'revealed',g.lineup[1:(g.state->>'turn')::integer],'player_count',cardinality(g.lineup))
$$;
create or replace function white_elephant.tv_board(game uuid, token uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare board jsonb;
begin
  select jsonb_build_object('revision', revision, 'paused', paused, 'phase', state->'phase',
    'portraits',white_elephant.portraits(g,true),'turn', state->'turn','active',state->'active','gifts',white_elephant.display_gifts(g),
    'revealed',lineup[1:(state->>'turn')::integer], 'player_count',cardinality(lineup))
    into board from white_elephant.games g where id=game and tv_digest=sha256(uuid_send(token));
  if not found then raise exception 'TV link is unavailable' using errcode='42501'; end if;
  return board;
end;
$$;
create or replace function white_elephant.can_upload(path text) returns boolean language sql stable security definer set search_path='' as $$
 select wishlist_private.is_family_member() and exists(select 1 from white_elephant.games g
 where auth.uid()=any(g.hosts) and g.id::text=split_part(path,'/',1) and (exists(select 1 from jsonb_each(g.state->'gifts') where value->>'id'=split_part(path,'/',2)) or exists(select 1 from jsonb_array_elements(white_elephant.portraits(g,false)) p where p->>'id'=split_part(path,'/',2)))
 and path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]jpg$')
$$;
create or replace function white_elephant.attach_photo(game uuid,gift uuid,previous uuid,photo uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g white_elephant.games;
begin
 select * into g from white_elephant.games where id=game and auth.uid()=any(hosts) for update;
 if not found or not wishlist_private.is_family_member() then raise exception 'Host access required' using errcode='42501'; end if;
 if not exists(select 1 from jsonb_each(g.state->'gifts') where value->>'id'=gift::text) and not exists(select 1 from jsonb_array_elements(white_elephant.portraits(g,false)) p where p->>'id'=gift::text) then raise exception 'Player or gift unavailable'; end if;
 if g.photos->>gift::text=photo::text then return; end if;
 if (g.photos->>gift::text) is distinct from previous::text then raise exception 'Photo changed. Refresh and retry.' using errcode='PT409'; end if;
 if not exists(select 1 from storage.objects where bucket_id='we-gift-photos' and name=game::text||'/'||gift::text||'/'||photo::text||'.jpg') then raise exception 'Upload incomplete'; end if;
 update white_elephant.games set photos=jsonb_set(photos,array[gift::text],to_jsonb(photo)) where id=game;
end;
$$;