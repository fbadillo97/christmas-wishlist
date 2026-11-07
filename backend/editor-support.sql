alter table wishlist_private.family_members add column role text not null default 'viewer' check(role in ('viewer','editor','owner')), add column active boolean not null default true, add column revision integer not null default 1;
create unique index one_family_owner on wishlist_private.family_members(role) where role='owner';
alter table wishlist_private.gift_catalog add column archived boolean not null default false, add column revision integer not null default 1;
create or replace function wishlist_private.is_family_member() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null and f.active);
$$;
create function wishlist_private.member_role() returns text language sql stable security definer set search_path='' as $$
select f.role from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email where u.id=auth.uid() and u.email_confirmed_at is not null and f.active;
$$;
revoke all on function wishlist_private.member_role() from public,anon,authenticated;
create function wishlist_private.stamp_gift_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision=case when tg_op='INSERT' then 1 else old.revision+1 end;return new;end;$$;
revoke all on function wishlist_private.stamp_gift_revision() from public,anon,authenticated;
create trigger stamp_gift_revision before insert or update on wishlist_private.gift_catalog for each row execute function wishlist_private.stamp_gift_revision();
create function wishlist_private.editor_save_gift(p_id text,p_revision integer,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare existing wishlist_private.gift_catalog%rowtype;new_id text;v_kind text;v_quantity integer;v_details jsonb;v_role text;v_revision integer;
begin
v_role=wishlist_private.member_role();if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Gift information is required.';end if;
v_kind=p_payload->>'kind';if v_kind is null or v_kind not in ('product','idea') then raise exception 'Choose an entry type.';end if;
if p_payload->>'quantity' is null or p_payload->>'quantity' !~ '^[0-9]{1,3}$' then raise exception 'Quantity must be a whole number from 1 to 100.';end if;
v_quantity=(p_payload->>'quantity')::integer;if v_quantity<1 or v_quantity>100 then raise exception 'Quantity must be from 1 to 100.';end if;
if nullif(btrim(p_payload->>'title'),'') is null or length(p_payload->>'title')>160 then raise exception 'Title is required and must be at most 160 characters.';end if;
if length(coalesce(p_payload->>'notes',''))>4000 then raise exception 'Notes must be at most 4000 characters.';end if;
if nullif(p_payload->>'url','') is not null and ((p_payload->>'url') !~* '^https://[^[:space:]]+$' or length(p_payload->>'url')>2048) then raise exception 'Product link must be a valid HTTPS address.';end if;
if nullif(p_payload->>'image','') is not null and ((p_payload->>'image') !~* '^https://[^[:space:]]+$' or length(p_payload->>'image')>2048) then raise exception 'Image link must be a valid HTTPS address.';end if;
if p_payload->>'match' is null or p_payload->>'match' not in ('exact','similar') then raise exception 'Choose a product preference.';end if;
if jsonb_typeof(p_payload->'used') is distinct from 'boolean' then raise exception 'Choose a condition preference.';end if;
if not exists(select 1 from wishlist_private.wishlist_people where id=p_payload->>'person') then raise exception 'Choose a recipient.';end if;
if p_id is null then
 if p_revision is not null then raise exception 'New gifts must not include a revision.';end if;
 new_id=pg_catalog.gen_random_uuid()::text;
else
 select * into existing from wishlist_private.gift_catalog where id=p_id for update;
 if not found then raise exception 'This gift no longer exists.';end if;
 if p_revision is distinct from existing.revision then raise exception 'This gift changed since you opened it. Close and reopen the form to review the latest version.' using errcode='40001';end if;
 if existing.details->>'person' is distinct from p_payload->>'person' and exists(select 1 from wishlist_private.gift_claims where gift_id=p_id) then raise exception 'A selected gift cannot move to another recipient.';end if;
 new_id=p_id;
end if;
v_details=coalesce(existing.details,'{}'::jsonb)||jsonb_build_object('id',new_id,'person',p_payload->>'person','title',btrim(p_payload->>'title'),'url',coalesce(p_payload->>'url',''),'image',coalesce(p_payload->>'image',''),'notes',coalesce(p_payload->>'notes',''),'match',p_payload->>'match','used',p_payload->'used');
if p_id is null then
 insert into wishlist_private.gift_catalog(id,kind,quantity,details) values(new_id,v_kind,v_quantity,v_details) returning revision into v_revision;
else
 update wishlist_private.gift_catalog set kind=v_kind,quantity=v_quantity,details=v_details where id=new_id returning revision into v_revision;
end if;
return jsonb_build_object('id',new_id,'revision',v_revision);
end;$$;
create function wishlist_private.editor_archive_gift(p_id text,p_revision integer,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
declare current_revision integer;v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
if p_archived is null then raise exception 'Choose archive or restore.';end if;
select revision into current_revision from wishlist_private.gift_catalog where id=p_id for update;
if not found then raise exception 'This gift no longer exists.';end if;
if p_revision is distinct from current_revision then raise exception 'This gift changed. Refresh before archiving or restoring it.' using errcode='40001';end if;
update wishlist_private.gift_catalog set archived=p_archived where id=p_id;
end;$$;
create function wishlist_private.editor_list_gifts() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(details||jsonb_build_object('kind',kind,'quantity',quantity,'revision',revision,'archived',archived) order by id) from wishlist_private.gift_catalog where details is not null),'[]'::jsonb);
end;$$;
create function wishlist_private.editor_list_members() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(jsonb_build_object('email',email,'role',role,'active',active,'revision',revision) order by email) from wishlist_private.family_members),'[]'::jsonb);
end;$$;
create function wishlist_private.editor_set_member(p_email text,p_role text,p_active boolean,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare target wishlist_private.family_members%rowtype;actor_role text;normalized text;
begin
lock table wishlist_private.family_members in share row exclusive mode;
actor_role=wishlist_private.member_role();
if actor_role is null or actor_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
normalized=lower(btrim(p_email));
if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.';end if;
if p_role is null or p_role not in ('viewer','editor') or p_active is null then raise exception 'Choose a valid role and access status.';end if;
select * into target from wishlist_private.family_members where email=normalized;
if found then
 if target.role='owner' then raise exception 'The owner account cannot be changed here.' using errcode='42501';end if;
 if p_revision is distinct from target.revision then raise exception 'This account changed. Refresh the access list before editing it.' using errcode='40001';end if;
 if actor_role<>'owner' and (target.role<>'viewer' or p_role<>'viewer') then raise exception 'Only the owner can change editor permissions.' using errcode='42501';end if;
 update wishlist_private.family_members set role=p_role,active=p_active,revision=revision+1 where email=normalized;
else
 if p_revision is not null then raise exception 'This account no longer exists.';end if;
 if actor_role<>'owner' and p_role<>'viewer' then raise exception 'Only the owner can grant editor access.' using errcode='42501';end if;
 insert into wishlist_private.family_members(email,role,active) values(normalized,p_role,p_active);
end if;
end;$$;
create or replace function wishlist_private.get_wishlist() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return jsonb_build_object('account',jsonb_build_object('role',v_role),'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'symbol',p.symbol) order by p.sort_order,p.id) from wishlist_private.wishlist_people p),'[]'::jsonb),'gifts',coalesce((select jsonb_agg(g.details||jsonb_build_object('kind',g.kind,'quantity',g.quantity,'revision',g.revision) order by g.id) from wishlist_private.gift_catalog g where g.details is not null and not g.archived),'[]'::jsonb));
end;$$;
create or replace function wishlist_private.list_gift_units() returns table(gift_id text,unit_no integer,status text,mine boolean) language plpgsql security definer set search_path='' as $$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return query select g.id,u.n,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from wishlist_private.gift_catalog g cross join lateral generate_series(1,g.quantity) as u(n) left join wishlist_private.gift_claims c on c.gift_id=g.id and c.unit_no=u.n where not g.archived;
end;$$;
create or replace function wishlist_private.set_gift_unit_status(p_gift_id text,p_unit_no integer,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare capacity integer;affected integer;is_archived boolean;
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
select quantity,archived into capacity,is_archived from wishlist_private.gift_catalog where id=p_gift_id for update;
if not found or p_unit_no is null or p_unit_no<1 or p_unit_no>capacity then raise exception 'This requested item does not exist';end if;
if is_archived and p_status<>'available' then raise exception 'This gift is archived and cannot receive new selections.';end if;
if p_status='available' then
delete from wishlist_private.gift_claims where gift_id=p_gift_id and unit_no=p_unit_no and owner_id=auth.uid();
else
insert into wishlist_private.gift_claims as c(gift_id,unit_no,owner_id,status) values(p_gift_id,p_unit_no,auth.uid(),p_status)
on conflict(gift_id,unit_no) do update set status=excluded.status where c.owner_id=auth.uid();
end if;
get diagnostics affected=row_count;
if affected=0 then raise exception 'Someone else selected this item. Refresh and choose an available one.';end if;
end;$$;
create function public.editor_save_gift(p_id text,p_revision integer,p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.editor_save_gift(p_id,p_revision,p_payload);$$;
revoke all on function wishlist_private.editor_save_gift(text,integer,jsonb),public.editor_save_gift(text,integer,jsonb) from public,anon,authenticated;
grant execute on function wishlist_private.editor_save_gift(text,integer,jsonb),public.editor_save_gift(text,integer,jsonb) to authenticated;
create function public.editor_archive_gift(p_id text,p_revision integer,p_archived boolean) returns void language sql security invoker set search_path='' as $$select wishlist_private.editor_archive_gift(p_id,p_revision,p_archived);$$;
revoke all on function wishlist_private.editor_archive_gift(text,integer,boolean),public.editor_archive_gift(text,integer,boolean) from public,anon,authenticated;
grant execute on function wishlist_private.editor_archive_gift(text,integer,boolean),public.editor_archive_gift(text,integer,boolean) to authenticated;
create function public.editor_list_gifts() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.editor_list_gifts();$$;
revoke all on function wishlist_private.editor_list_gifts(),public.editor_list_gifts() from public,anon,authenticated;
grant execute on function wishlist_private.editor_list_gifts(),public.editor_list_gifts() to authenticated;
create function public.editor_list_members() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.editor_list_members();$$;
revoke all on function wishlist_private.editor_list_members(),public.editor_list_members() from public,anon,authenticated;
grant execute on function wishlist_private.editor_list_members(),public.editor_list_members() to authenticated;
create function public.editor_set_member(p_email text,p_role text,p_active boolean,p_revision integer) returns void language sql security invoker set search_path='' as $$select wishlist_private.editor_set_member(p_email,p_role,p_active,p_revision);$$;
revoke all on function wishlist_private.editor_set_member(text,text,boolean,integer),public.editor_set_member(text,text,boolean,integer) from public,anon,authenticated;
grant execute on function wishlist_private.editor_set_member(text,text,boolean,integer),public.editor_set_member(text,text,boolean,integer) to authenticated;
notify pgrst,'reload schema';

