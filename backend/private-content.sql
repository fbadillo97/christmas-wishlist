create table wishlist_private.wishlist_people(id text primary key, name text not null, symbol text not null default '🎁', sort_order integer not null default 0);
alter table wishlist_private.wishlist_people enable row level security;
revoke all on wishlist_private.wishlist_people from public,anon,authenticated;
alter table wishlist_private.gift_catalog add column details jsonb;
alter table wishlist_private.gift_catalog add constraint gift_details_object check(details is null or (jsonb_typeof(details)='object' and details->>'id'=id));
create function wishlist_private.get_wishlist() returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'symbol',p.symbol) order by p.sort_order,p.id) from wishlist_private.wishlist_people p),'[]'::jsonb),'gifts',coalesce((select jsonb_agg(g.details order by g.id) from wishlist_private.gift_catalog g where g.details is not null),'[]'::jsonb));
end;$$;
create function public.get_wishlist() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.get_wishlist();$$;
revoke all on function wishlist_private.get_wishlist(),public.get_wishlist() from public,anon,authenticated;
grant execute on function wishlist_private.get_wishlist(),public.get_wishlist() to authenticated;
notify pgrst,'reload schema';
