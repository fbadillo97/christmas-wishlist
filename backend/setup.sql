-- Run once in a NEW Supabase project. Do not put real emails in the public repo.
begin;
create table public.family_members (email text primary key check(email=lower(email)));
create table public.gift_catalog (id text primary key);
create table public.gift_claims (
 gift_id text primary key references public.gift_catalog(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 status text not null check(status in ('reserved','purchased'))
);
alter table public.family_members enable row level security;
alter table public.gift_catalog enable row level security;
alter table public.gift_claims enable row level security;
revoke all on public.family_members,public.gift_catalog,public.gift_claims from anon,authenticated;
create function public.is_family_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.family_members f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
create function public.list_gift_statuses() returns table(gift_id text,status text,mine boolean) language plpgsql security definer set search_path='' as $$
begin
 if not public.is_family_member() then raise exception 'This email is not on the family invitation list.'; end if;
 return query select g.id,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from public.gift_catalog g left join public.gift_claims c on c.gift_id=g.id;
end;
$$;
create function public.set_gift_status(p_gift_id text,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if not public.is_family_member() then raise exception 'This email is not on the family invitation list.'; end if;
 if p_status not in ('available','reserved','purchased') or p_status is null then raise exception 'Invalid status'; end if;
 if p_status='available' then
  delete from public.gift_claims where gift_id=p_gift_id and owner_id=auth.uid();
 else
  insert into public.gift_claims as c(gift_id,owner_id,status) values(p_gift_id,auth.uid(),p_status)
  on conflict(gift_id) do update set status=excluded.status where c.owner_id=auth.uid();
 end if;
 get diagnostics affected=row_count;
 if affected=0 then raise exception 'This gift changed or belongs to someone else. Refresh and check availability.';end if;
end;
$$;
revoke all on function public.is_family_member(),public.list_gift_statuses(),public.set_gift_status(text,text) from public,anon;
grant execute on function public.is_family_member(),public.list_gift_statuses(),public.set_gift_status(text,text) to authenticated;
commit;
-- Privately add family emails in the SQL editor, for example:
-- insert into public.family_members(email) values ('your-email@example.com');
-- When adding REAL gifts, register each stable ID:
-- insert into public.gift_catalog(id) values ('2026-livia-001') on conflict do nothing;
