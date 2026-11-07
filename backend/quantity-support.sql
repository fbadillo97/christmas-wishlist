alter table wishlist_private.gift_catalog add column kind text not null default 'product' check(kind in ('product','idea')), add column quantity integer not null default 1 check(quantity between 1 and 100);
update wishlist_private.gift_catalog set kind=case when nullif(details->>'url','') is null then 'idea' else 'product' end;
alter table wishlist_private.gift_claims add column unit_no integer not null default 1 check(unit_no>=1);
alter table wishlist_private.gift_claims drop constraint gift_claims_pkey;
alter table wishlist_private.gift_claims add primary key(gift_id,unit_no);
create function wishlist_private.normalize_gift() returns trigger language plpgsql set search_path='' as $$
begin
if new.details is not null then
if new.details->>'match' is not null and new.details->>'match' not in ('exact','similar') then raise exception 'Invalid match preference';end if;
if new.details->'used' is not null and new.details->'used'<>'null'::jsonb and jsonb_typeof(new.details->'used')<>'boolean' then raise exception 'Used preference must be boolean';end if;
if new.details->>'person' is null or not exists(select 1 from wishlist_private.wishlist_people where id=new.details->>'person') then raise exception 'Unknown recipient';end if;
if nullif(btrim(new.details->>'title'),'') is null then raise exception 'A title is required';end if;
new.details=new.details||jsonb_build_object('match',coalesce(new.details->>'match',case when new.kind='idea' then 'similar' else 'exact' end),'used',coalesce(nullif(new.details->'used','null'::jsonb),'true'::jsonb),'notes',coalesce(new.details->>'notes',''));
end if;
if tg_op='UPDATE' and new.quantity<old.quantity and exists(select 1 from wishlist_private.gift_claims where gift_id=old.id and unit_no>new.quantity) then raise exception 'Cannot reduce quantity below an existing selection. Resolve selections first.';end if;
return new;
end;$$;
revoke all on function wishlist_private.normalize_gift() from public,anon,authenticated;
create trigger normalize_wishlist_gift before insert or update on wishlist_private.gift_catalog for each row execute function wishlist_private.normalize_gift();
update wishlist_private.gift_catalog set details=details;
create function wishlist_private.list_gift_units() returns table(gift_id text,unit_no integer,status text,mine boolean) language plpgsql security definer set search_path='' as $$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return query select g.id,u.n,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from wishlist_private.gift_catalog g cross join lateral generate_series(1,g.quantity) as u(n) left join wishlist_private.gift_claims c on c.gift_id=g.id and c.unit_no=u.n;
end;$$;
create function wishlist_private.set_gift_unit_status(p_gift_id text,p_unit_no integer,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare capacity integer;affected integer;
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
select quantity into capacity from wishlist_private.gift_catalog where id=p_gift_id for update;
if not found or p_unit_no is null or p_unit_no<1 or p_unit_no>capacity then raise exception 'This requested item does not exist';end if;
if p_status='available' then
delete from wishlist_private.gift_claims where gift_id=p_gift_id and unit_no=p_unit_no and owner_id=auth.uid();
else
insert into wishlist_private.gift_claims as c(gift_id,unit_no,owner_id,status) values(p_gift_id,p_unit_no,auth.uid(),p_status)
on conflict(gift_id,unit_no) do update set status=excluded.status where c.owner_id=auth.uid();
end if;
get diagnostics affected=row_count;
if affected=0 then raise exception 'Someone else selected this item. Refresh and choose an available one.';end if;
end;$$;
create function public.list_gift_units() returns table(gift_id text,unit_no integer,status text,mine boolean) language sql security invoker set search_path='' as $$select * from wishlist_private.list_gift_units();$$;
create function public.set_gift_unit_status(p_gift_id text,p_unit_no integer,p_status text) returns void language sql security invoker set search_path='' as $$select wishlist_private.set_gift_unit_status(p_gift_id,p_unit_no,p_status);$$;
create or replace function wishlist_private.list_gift_statuses() returns table(gift_id text,status text,mine boolean) language sql security definer set search_path='' as $$select gift_id,status,mine from wishlist_private.list_gift_units() where unit_no=1;$$;
create or replace function wishlist_private.set_gift_status(p_gift_id text,p_status text) returns void language sql security definer set search_path='' as $$select wishlist_private.set_gift_unit_status(p_gift_id,1,p_status);$$;
create or replace function wishlist_private.get_wishlist() returns jsonb language plpgsql security definer set search_path='' as $$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return jsonb_build_object('people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'symbol',p.symbol) order by p.sort_order,p.id) from wishlist_private.wishlist_people p),'[]'::jsonb),'gifts',coalesce((select jsonb_agg(g.details||jsonb_build_object('kind',g.kind,'quantity',g.quantity) order by g.id) from wishlist_private.gift_catalog g where g.details is not null),'[]'::jsonb));
end;$$;
revoke all on function wishlist_private.list_gift_units(),wishlist_private.set_gift_unit_status(text,integer,text),public.list_gift_units(),public.set_gift_unit_status(text,integer,text) from public,anon,authenticated;
grant execute on function wishlist_private.list_gift_units(),wishlist_private.set_gift_unit_status(text,integer,text),public.list_gift_units(),public.set_gift_unit_status(text,integer,text) to authenticated;
notify pgrst,'reload schema';
