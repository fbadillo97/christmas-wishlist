-- Open-ended selections are independent of limited unit reservations.
-- Existing unit claims remain intact; equivalent idea selections are copied below.
alter table wishlist_private.gift_catalog add column reservation_mode text;
update wishlist_private.gift_catalog set reservation_mode=case when kind='idea' then 'open-ended' else 'limited' end;
alter table wishlist_private.gift_catalog alter column reservation_mode set not null;
alter table wishlist_private.gift_catalog add constraint reservation_mode_valid check(reservation_mode in ('limited','open-ended','inspiration-only'));
create table wishlist_private.idea_selections (
 gift_id text not null references wishlist_private.gift_catalog(id),
 owner_id uuid not null references auth.users(id),
 status text not null check(status in ('reserved','purchased')),
 private_note text not null default '' check(length(private_note)<=2000),
 updated_at timestamptz,
 primary key(gift_id,owner_id)
);
alter table wishlist_private.idea_selections enable row level security;
revoke all on wishlist_private.idea_selections from public,anon,authenticated;
insert into wishlist_private.idea_selections(gift_id,owner_id,status,updated_at)
select c.gift_id,c.owner_id,case when bool_or(c.status='purchased') then 'purchased' else 'reserved' end,max(c.updated_at)
from wishlist_private.gift_claims c join wishlist_private.gift_catalog g on g.id=c.gift_id
where g.reservation_mode='open-ended' group by c.gift_id,c.owner_id;

CREATE OR REPLACE FUNCTION wishlist_private.get_wishlist()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return jsonb_build_object('account',jsonb_build_object('role',v_role),'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'symbol',p.symbol) order by p.sort_order,p.id) from wishlist_private.wishlist_people p),'[]'::jsonb),'gifts',coalesce((select jsonb_agg(g.details||jsonb_build_object('reservation_mode',g.reservation_mode,'kind',g.kind,'quantity',g.quantity,'revision',g.revision) order by g.id) from wishlist_private.gift_catalog g where g.details is not null and not g.archived),'[]'::jsonb));
end;$function$
;

CREATE OR REPLACE FUNCTION wishlist_private.editor_list_gifts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
v_role=wishlist_private.member_role();if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(details||jsonb_build_object('reservation_mode',reservation_mode,'kind',kind,'quantity',quantity,'revision',revision,'archived',archived) order by id) from wishlist_private.gift_catalog where details is not null),'[]'::jsonb);
end;$function$
;

CREATE OR REPLACE FUNCTION wishlist_private.editor_save_gift(p_id text, p_revision integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing wishlist_private.gift_catalog%rowtype;new_id text;v_kind text;v_quantity integer;v_details jsonb;v_role text;v_revision integer;v_mode text;
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
v_mode=coalesce(p_payload->>'reservation_mode',existing.reservation_mode,case when v_kind='idea' then 'open-ended' else 'limited' end);
if v_mode not in ('limited','open-ended','inspiration-only') then raise exception 'Choose a valid selection mode.';end if;
if p_id is not null and (existing.reservation_mode is distinct from v_mode or existing.details->>'person' is distinct from p_payload->>'person') and
 (exists(select 1 from wishlist_private.gift_claims where gift_id=p_id) or exists(select 1 from wishlist_private.idea_selections where gift_id=p_id)) then
 raise exception 'Undo existing selections before changing selection mode or recipient.';end if;
v_details=coalesce(existing.details,'{}'::jsonb)||jsonb_build_object('id',new_id,'person',p_payload->>'person','title',btrim(p_payload->>'title'),'url',coalesce(p_payload->>'url',''),'image',coalesce(p_payload->>'image',''),'notes',coalesce(p_payload->>'notes',''),'match',p_payload->>'match','used',p_payload->'used');
if p_id is null then
 insert into wishlist_private.gift_catalog(id,kind,quantity,details,reservation_mode) values(new_id,v_kind,v_quantity,v_details,v_mode) returning revision into v_revision;
else
 update wishlist_private.gift_catalog set kind=v_kind,quantity=v_quantity,details=v_details,reservation_mode=v_mode where id=new_id returning revision into v_revision;
end if;
return jsonb_build_object('id',new_id,'revision',v_revision);
end;$function$
;

CREATE OR REPLACE FUNCTION wishlist_private.list_gift_units()
 RETURNS TABLE(gift_id text, unit_no integer, status text, mine boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return query select g.id,u.n,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from wishlist_private.gift_catalog g cross join lateral generate_series(1,g.quantity) as u(n) left join wishlist_private.gift_claims c on c.gift_id=g.id and c.unit_no=u.n where not g.archived and g.reservation_mode='limited';
end;$function$
;

CREATE OR REPLACE FUNCTION wishlist_private.set_gift_unit_status(p_gift_id text, p_unit_no integer, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare capacity integer;affected integer;is_archived boolean;v_mode text;
begin
if not wishlist_private.is_family_member() then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
select quantity,archived,reservation_mode into capacity,is_archived,v_mode from wishlist_private.gift_catalog where id=p_gift_id for update;
if not found or p_unit_no is null or p_unit_no<1 or p_unit_no>capacity then raise exception 'This requested item does not exist';end if;
if v_mode<>'limited' then raise exception 'Use independent idea selections for this entry.';end if;
if is_archived and p_status<>'available' then raise exception 'This gift is archived and cannot receive new selections.';end if;
if p_status='available' then
delete from wishlist_private.gift_claims where gift_id=p_gift_id and unit_no=p_unit_no and owner_id=auth.uid();
else
insert into wishlist_private.gift_claims as c(gift_id,unit_no,owner_id,status) values(p_gift_id,p_unit_no,auth.uid(),p_status)
on conflict(gift_id,unit_no) do update set status=excluded.status where c.owner_id=auth.uid();
end if;
get diagnostics affected=row_count;
if affected=0 then raise exception 'Someone else selected this item. Refresh and choose an available one.';end if;
end;$function$
;

create or replace function wishlist_private.get_my_selections() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if wishlist_private.member_role() is null then raise exception 'Family access required' using errcode='42501';end if;
 return jsonb_build_object(
 'gifts',coalesce((select jsonb_agg(g.details||jsonb_build_object('id',g.id,'kind',g.kind,'quantity',g.quantity,'reservation_mode',g.reservation_mode,'revision',g.revision,'archived',g.archived) order by g.id)
 from wishlist_private.gift_catalog g where
 (g.reservation_mode='limited' and exists(select 1 from wishlist_private.gift_claims c where c.gift_id=g.id and c.owner_id=auth.uid())) or
 exists(select 1 from wishlist_private.idea_selections s where s.gift_id=g.id and s.owner_id=auth.uid())),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(x.item order by x.gift_id,x.unit_no) from (
 select c.gift_id,c.unit_no,jsonb_build_object('gift_id',c.gift_id,'unit_no',c.unit_no,'status',c.status,'mine',true) item
 from wishlist_private.gift_claims c join wishlist_private.gift_catalog g on g.id=c.gift_id where c.owner_id=auth.uid() and g.reservation_mode='limited'
 union all select s.gift_id,0,jsonb_build_object('gift_id',s.gift_id,'unit_no',0,'status',s.status,'mine',true,'private_note',s.private_note)
 from wishlist_private.idea_selections s where s.owner_id=auth.uid()) x),'[]'::jsonb));
end;$$;
create function wishlist_private.set_idea_selection(p_gift_id text,p_status text,p_private_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare g wishlist_private.gift_catalog%rowtype;
begin
 if not wishlist_private.is_family_member() then raise exception 'Family access required' using errcode='42501';end if;
 if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
 if length(coalesce(p_private_note,''))>2000 then raise exception 'Keep your private note to 2000 characters.';end if;
 select * into g from wishlist_private.gift_catalog where id=p_gift_id for update;
 if not found or g.reservation_mode<>'open-ended' then raise exception 'This entry does not accept independent selections.';end if;
 if g.archived and p_status<>'available' then raise exception 'This gift is archived. You can undo your selection.';end if;
 if p_status='available' then
  delete from wishlist_private.idea_selections where gift_id=p_gift_id and owner_id=auth.uid();
  -- Remove only this user's preserved legacy idea claims when they explicitly undo.
  delete from wishlist_private.gift_claims where gift_id=p_gift_id and owner_id=auth.uid();
 else
  insert into wishlist_private.idea_selections(gift_id,owner_id,status,private_note,updated_at)
  values(p_gift_id,auth.uid(),p_status,coalesce(p_private_note,''),clock_timestamp())
  on conflict(gift_id,owner_id) do update set status=excluded.status,private_note=excluded.private_note,updated_at=excluded.updated_at;
 end if;
end;$$;
create function public.set_idea_selection(p_gift_id text,p_status text,p_private_note text default '') returns void language sql security invoker set search_path='' as $$select wishlist_private.set_idea_selection(p_gift_id,p_status,p_private_note);$$;
revoke all on function wishlist_private.set_idea_selection(text,text,text),public.set_idea_selection(text,text,text) from public,anon,authenticated;
grant execute on function wishlist_private.set_idea_selection(text,text,text),public.set_idea_selection(text,text,text) to authenticated;
notify pgrst,'reload schema';

-- Owner tracking includes independent selections, but never private notes.
create or replace function wishlist_private.admin_gift_tracking() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if wishlist_private.member_role() is distinct from 'owner' then raise exception 'Only the owner can view gift tracking.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'gift_id',g.id,'title',g.details->>'title','recipient_id',g.details->>'person','recipient',coalesce(p.name,'Unknown recipient'),
 'unit_no',c.unit_no,'reservation_mode',g.reservation_mode,'status',c.status,'archived',g.archived,'selected_by_email',u.email,'selected_by_name',nullif(btrim(f.first_name),''),'updated_at',c.updated_at
 ) order by p.sort_order,g.details->>'title',c.unit_no)
 from (select c.gift_id,c.unit_no,c.owner_id,c.status,c.updated_at from wishlist_private.gift_claims c join wishlist_private.gift_catalog k on k.id=c.gift_id where k.reservation_mode='limited' union all select gift_id,0,owner_id,status,updated_at from wishlist_private.idea_selections) c join wishlist_private.gift_catalog g on g.id=c.gift_id
 left join wishlist_private.wishlist_people p on p.id=g.details->>'person'
 left join auth.users u on u.id=c.owner_id left join wishlist_private.family_members f on f.email=lower(u.email)
 where c.status in ('reserved','purchased')),'[]'::jsonb);
end; $$;
