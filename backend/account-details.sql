alter table wishlist_private.family_members add column account_id uuid not null default gen_random_uuid();
create unique index family_members_account_id_unique on wishlist_private.family_members(account_id);
-- last_name already exists; preserve the imported account names.
create or replace function wishlist_private.editor_list_members() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'account_id',f.account_id,'email',f.email,'first_name',f.first_name,'last_name',f.last_name,'role',f.role,'active',f.active,'revision',f.revision,
 'invitation_status',case when f.invitation_status='sending' and f.invitation_attempted_at<now()-interval '2 minutes' then 'unknown' else f.invitation_status end,
 'invitation_sent_at',f.invitation_sent_at,'invitation_attempted_at',f.invitation_attempted_at,
 'has_signed_in',a.last_sign_in_at is not null,'last_sign_in_at',a.last_sign_in_at,'has_passkey',a.passkey_count>0,'passkey_count',a.passkey_count
 ) order by lower(coalesce(f.last_name,'')),lower(f.first_name),f.email)
 from wishlist_private.family_members f cross join lateral (
  select (select max(u.last_sign_in_at) from auth.users u where lower(u.email)=f.email) as last_sign_in_at,
  (select count(*) from auth.webauthn_credentials c join auth.users u on u.id=c.user_id where lower(u.email)=f.email) as passkey_count
 ) a),'[]'::jsonb);
end; $$;
create function wishlist_private.admin_save_account(p_email text,p_first_name text,p_last_name text,p_role text,p_active boolean,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare family_name text;
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Administration requires editor or owner access.' using errcode='42501';end if;
 family_name=btrim(coalesce(p_last_name,''));
 if length(family_name)>80 or family_name ~ '[[:cntrl:]]' then raise exception 'Enter a last name of up to 80 characters without line breaks.';end if;
 perform wishlist_private.admin_save_member(p_email,p_first_name,p_role,p_active,p_revision);
 update wishlist_private.family_members set last_name=family_name where email=lower(btrim(p_email));
end; $$;
create function public.admin_save_account(p_email text,p_first_name text,p_last_name text,p_role text,p_active boolean,p_revision integer) returns void language sql security invoker set search_path='' as $$select wishlist_private.admin_save_account(p_email,p_first_name,p_last_name,p_role,p_active,p_revision);$$;
revoke all on function wishlist_private.admin_save_account(text,text,text,text,boolean,integer),public.admin_save_account(text,text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function wishlist_private.admin_save_account(text,text,text,text,boolean,integer),public.admin_save_account(text,text,text,text,boolean,integer) to authenticated;
notify pgrst,'reload schema';
