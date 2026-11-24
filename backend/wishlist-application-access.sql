create function public.admin_save_account_access(p_email text,p_first_name text,p_last_name text,p_role text,
 p_active boolean,p_revision integer,p_wishlist boolean,p_game boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform wishlist_private.admin_save_account(p_email,p_first_name,p_last_name,p_role,p_active,p_revision);
 update wishlist_private.family_members set wishlist_access=p_wishlist,game_access=p_game where email=lower(btrim(p_email));
end;$$;
revoke all on function public.admin_save_account_access(text,text,text,text,boolean,integer,boolean,boolean) from public,anon;
grant execute on function public.admin_save_account_access(text,text,text,text,boolean,integer,boolean,boolean) to authenticated;


CREATE OR REPLACE FUNCTION wishlist_private.editor_archive_gift(p_id text, p_revision integer, p_archived boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_revision integer;v_role text;
begin
v_role=wishlist_private.app_role('wishlist');if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
if p_archived is null then raise exception 'Choose archive or restore.';end if;
select revision into current_revision from wishlist_private.gift_catalog where id=p_id for update;
if not found then raise exception 'This gift no longer exists.';end if;
if p_revision is distinct from current_revision then raise exception 'This gift changed. Refresh before archiving or restoring it.' using errcode='40001';end if;
update wishlist_private.gift_catalog set archived=p_archived where id=p_id;
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.editor_list_members()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'account_id',f.account_id,'email',f.email,'first_name',f.first_name,'last_name',f.last_name,'role',f.role,'active',f.active,'wishlist_access',f.wishlist_access,'game_access',f.game_access,'revision',f.revision,
 'invitation_status',case when f.invitation_status='sending' and f.invitation_attempted_at<now()-interval '2 minutes' then 'unknown' else f.invitation_status end,
 'invitation_sent_at',f.invitation_sent_at,'invitation_attempted_at',f.invitation_attempted_at,
 'has_signed_in',a.last_sign_in_at is not null,'last_sign_in_at',a.last_sign_in_at,'has_passkey',a.passkey_count>0,'passkey_count',a.passkey_count
 ) order by lower(coalesce(f.last_name,'')),lower(f.first_name),f.email)
 from wishlist_private.family_members f cross join lateral (
  select (select max(u.last_sign_in_at) from auth.users u where lower(u.email)=f.email) as last_sign_in_at,
  (select count(*) from auth.webauthn_credentials c join auth.users u on u.id=c.user_id where lower(u.email)=f.email) as passkey_count
 ) a),'[]'::jsonb);
end; $function$;


CREATE OR REPLACE FUNCTION wishlist_private.editor_list_gifts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
v_role=wishlist_private.app_role('wishlist');if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
return coalesce((select jsonb_agg(details||jsonb_build_object('reservation_mode',reservation_mode,'kind',kind,'quantity',quantity,'revision',revision,'archived',archived) order by id) from wishlist_private.gift_catalog where details is not null),'[]'::jsonb);
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.editor_save_gift(p_id text, p_revision integer, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing wishlist_private.gift_catalog%rowtype;new_id text;v_kind text;v_quantity integer;v_details jsonb;v_role text;v_revision integer;v_mode text;
begin
v_role=wishlist_private.app_role('wishlist');if v_role is null or v_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
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
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.admin_gift_tracking()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if wishlist_private.app_role('wishlist') is distinct from 'owner' then raise exception 'Only the owner can view gift tracking.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'gift_id',g.id,'title',g.details->>'title','recipient_id',g.details->>'person','recipient',coalesce(p.name,'Unknown recipient'),
 'unit_no',c.unit_no,'reservation_mode',g.reservation_mode,'status',c.status,'archived',g.archived,'selected_by_email',u.email,'selected_by_name',nullif(btrim(f.first_name),''),'updated_at',c.updated_at
 ) order by p.sort_order,g.details->>'title',c.unit_no)
 from (select c.gift_id,c.unit_no,c.owner_id,c.status,c.updated_at from wishlist_private.gift_claims c join wishlist_private.gift_catalog k on k.id=c.gift_id where k.reservation_mode='limited' union all select gift_id,0,owner_id,status,updated_at from wishlist_private.idea_selections) c join wishlist_private.gift_catalog g on g.id=c.gift_id
 left join wishlist_private.wishlist_people p on p.id=g.details->>'person'
 left join auth.users u on u.id=c.owner_id left join wishlist_private.family_members f on f.email=lower(u.email)
 where c.status in ('reserved','purchased')),'[]'::jsonb);
end; $function$;


CREATE OR REPLACE FUNCTION wishlist_private.get_wishlist()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_role text;
begin
v_role=wishlist_private.app_role('wishlist');if v_role is null then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return jsonb_build_object('account',jsonb_build_object('role',v_role),'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'symbol',p.symbol) order by p.sort_order,p.id) from wishlist_private.wishlist_people p),'[]'::jsonb),'gifts',coalesce((select jsonb_agg(g.details||jsonb_build_object('reservation_mode',g.reservation_mode,'kind',g.kind,'quantity',g.quantity,'revision',g.revision) order by g.id) from wishlist_private.gift_catalog g where g.details is not null and not g.archived),'[]'::jsonb));
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.list_gift_units()
 RETURNS TABLE(gift_id text, unit_no integer, status text, mine boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
if not (wishlist_private.app_role('wishlist') is not null) then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
return query select g.id,u.n,coalesce(c.status,'available'),coalesce(c.owner_id=auth.uid(),false) from wishlist_private.gift_catalog g cross join lateral generate_series(1,g.quantity) as u(n) left join wishlist_private.gift_claims c on c.gift_id=g.id and c.unit_no=u.n where not g.archived and g.reservation_mode='limited';
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.get_family_photo()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or wishlist_private.app_role('wishlist') is null then
  raise exception 'Family access required' using errcode='42501';
 end if;
 perform set_config('response.headers','[{"Cache-Control":"no-store, private"}]',true);
 return (select jsonb_build_object('content_type',m.content_type,'base64',encode(m.image_bytes,'base64')) from wishlist_private.family_media m where m.id='family-photo');
end $function$;


CREATE OR REPLACE FUNCTION wishlist_private.get_administration()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor_role text; result jsonb;
begin
 actor_role=wishlist_private.member_role();
 if coalesce(actor_role,'') not in ('owner','editor') then raise exception 'Administration requires editor or owner access.' using errcode='42501'; end if;
 result=jsonb_build_object('account',jsonb_build_object('role',actor_role),'members',wishlist_private.editor_list_members());
 if actor_role='owner' then result=result||jsonb_build_object('gift_tracking',case when wishlist_private.app_role('wishlist') is not null then wishlist_private.admin_gift_tracking() else '[]'::jsonb end,'platform_roadmap',wishlist_private.get_platform_roadmap());end if;
 return result;
end; $function$;


CREATE OR REPLACE FUNCTION wishlist_private.get_my_selections()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if wishlist_private.app_role('wishlist') is null then raise exception 'Family access required' using errcode='42501';end if;
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
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.set_gift_unit_status(p_gift_id text, p_unit_no integer, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare capacity integer;affected integer;is_archived boolean;v_mode text;
begin
if not (wishlist_private.app_role('wishlist') is not null) then raise exception 'This email is not on the family invitation list.' using errcode='42501';end if;
if p_status is null or p_status not in ('available','reserved','purchased') then raise exception 'Invalid status';end if;
select quantity,archived,reservation_mode into capacity,is_archived,v_mode from wishlist_private.gift_catalog where id=p_gift_id for update;
if not found or p_unit_no is null or p_unit_no<1 or p_unit_no>capacity then raise exception 'This requested item does not exist';end if;
if v_mode<>'limited' then raise exception 'Use independent idea selections for this entry.';end if;
if is_archived and p_status<>'available' then raise exception 'This gift is archived and cannot receive new selections.';end if;
if p_status='reserved' and exists (select 1 from wishlist_private.gift_claims c where c.gift_id=p_gift_id and c.unit_no=p_unit_no and c.owner_id=auth.uid() and c.status='purchased') then
 raise exception 'This gift was already purchased. Undo your selection before reserving it again.';
end if;
if p_status='available' then
delete from wishlist_private.gift_claims where gift_id=p_gift_id and unit_no=p_unit_no and owner_id=auth.uid();
else
insert into wishlist_private.gift_claims as c(gift_id,unit_no,owner_id,status) values(p_gift_id,p_unit_no,auth.uid(),p_status)
on conflict(gift_id,unit_no) do update set status=excluded.status where c.owner_id=auth.uid();
end if;
get diagnostics affected=row_count;
if affected=0 then raise exception 'Someone else selected this item. Refresh and choose an available one.';end if;
end;$function$;


CREATE OR REPLACE FUNCTION wishlist_private.set_idea_selection(p_gift_id text, p_status text, p_private_note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare g wishlist_private.gift_catalog%rowtype;
begin
 if not (wishlist_private.app_role('wishlist') is not null) then raise exception 'Family access required' using errcode='42501';end if;
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
end;$function$;

