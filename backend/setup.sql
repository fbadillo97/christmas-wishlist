-- Fresh-project schema. Already applied to the connected project; do not rerun there.
-- Private family emails must never be committed.
create schema wishlist_private;
revoke all on schema wishlist_private from public,anon;
grant usage on schema wishlist_private to authenticated;
create table wishlist_private.family_members(email text primary key check(email=lower(email)));
create table wishlist_private.gift_catalog(id text primary key);
create table wishlist_private.gift_claims(
gift_id text primary key references wishlist_private.gift_catalog(id) on delete cascade,
owner_id uuid not null references auth.users(id) on delete cascade,
status text not null check(status in ('reserved','purchased')));
create index gift_claims_owner_idx on wishlist_private.gift_claims(owner_id);
alter table wishlist_private.family_members enable row level security;
alter table wishlist_private.gift_catalog enable row level security;
alter table wishlist_private.gift_claims enable row level security;
revoke all on all tables in schema wishlist_private from public,anon,authenticated;
create function wishlist_private.is_family_member() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
create function wishlist_private.list_gift_statuses() returns table(gift_id text,status text,mine boolean) language plpgsql security definer set search_path='' as $$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return query select g.id,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from wishlist_private.gift_catalog g left join wishlist_private.gift_claims c on c.gift_id=g.id;
end;$$;
create function wishlist_private.set_gift_status(p_gift_id text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
if p_status='available' then
delete from wishlist_private.gift_claims where gift_id=p_gift_id and owner_id=auth.uid();
else
insert into wishlist_private.gift_claims as c(gift_id,owner_id,status) values(p_gift_id,auth.uid(),p_status)
on conflict(gift_id) do update set status=excluded.status where c.owner_id=auth.uid();
end if;
get diagnostics affected=row_count;
if affected=0 then raise exception 'This gift changed or belongs to someone else. Refresh and check availability.';end if;
end;$$;
create function public.list_gift_statuses() returns table(gift_id text,status text,mine boolean) language sql security invoker set search_path='' as $$select * from wishlist_private.list_gift_statuses();$$;
create function public.set_gift_status(p_gift_id text,p_status text) returns void language sql security invoker set search_path='' as $$select wishlist_private.set_gift_status(p_gift_id,p_status);$$;
revoke all on function wishlist_private.is_family_member(),wishlist_private.list_gift_statuses(),wishlist_private.set_gift_status(text,text) from public,anon,authenticated;
grant execute on function wishlist_private.list_gift_statuses(),wishlist_private.set_gift_status(text,text) to authenticated;
revoke all on function public.list_gift_statuses(),public.set_gift_status(text,text) from public,anon,authenticated;
grant execute on function public.list_gift_statuses(),public.set_gift_status(text,text) to authenticated;
notify pgrst,'reload schema';
-- Add family emails privately: insert into wishlist_private.family_members(email) values ('your-email@example.com') on conflict do nothing;
-- Register gift IDs from data/wishlist.json in wishlist_private.gift_catalog.
