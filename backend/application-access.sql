-- Independent application entitlements. Account activity and administrative role remain separate.
alter table wishlist_private.family_members
  add column wishlist_access boolean not null default true,
  add column game_access boolean not null default true;

create function wishlist_private.app_role(app text) returns text
language sql stable security definer set search_path='' as $$
 select f.role from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email
 where u.id=auth.uid() and u.email_confirmed_at is not null and f.active
 and case app when 'wishlist' then f.wishlist_access when 'game' then f.game_access else false end
$$;
revoke all on function wishlist_private.app_role(text) from public,anon,authenticated;

create function public.family_app_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('wishlist',wishlist_private.app_role('wishlist') is not null,
 'game',wishlist_private.app_role('game') is not null,'role',wishlist_private.member_role())
$$;
revoke all on function public.family_app_access() from public,anon;
grant execute on function public.family_app_access() to authenticated;

