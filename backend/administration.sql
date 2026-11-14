-- Names are optional private account data, never inferred from email or gift recipients.
alter table wishlist_private.family_members add column first_name text not null default '' check(length(first_name)<=80);
create or replace function wishlist_private.editor_list_members() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',f.email,'first_name',f.first_name,'role',f.role,'active',f.active,'revision',f.revision,
 'invitation_status',case when f.invitation_status='sending' and f.invitation_attempted_at<now()-interval '2 minutes' then 'unknown' else f.invitation_status end,
 'invitation_sent_at',f.invitation_sent_at,'invitation_attempted_at',f.invitation_attempted_at,
 'has_signed_in',exists(select 1 from auth.users u where lower(u.email)=f.email and u.last_sign_in_at is not null)) order by f.email)
 from wishlist_private.family_members f),'[]'::jsonb);
end; $$;
create function wishlist_private.get_administration() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
 actor_role=wishlist_private.member_role();
 if coalesce(actor_role,'') not in ('owner','editor') then raise exception 'Administration requires editor or owner access.' using errcode='42501'; end if;
 return jsonb_build_object('account',jsonb_build_object('role',actor_role),'members',wishlist_private.editor_list_members());
end; $$;
create function wishlist_private.admin_save_member(p_email text,p_first_name text,p_role text,p_active boolean,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare actor_role text; target wishlist_private.family_members%rowtype; normalized text; given_name text;
begin
 lock table wishlist_private.family_members in share row exclusive mode;
 actor_role=wishlist_private.member_role();
 if coalesce(actor_role,'') not in ('owner','editor') then raise exception 'Administration requires editor or owner access.' using errcode='42501'; end if;
 normalized=lower(btrim(p_email));given_name=btrim(coalesce(p_first_name,''));
 if length(given_name)>80 or given_name ~ '[[:cntrl:]]' then raise exception 'Enter a name of up to 80 characters without line breaks.'; end if;
 select * into target from wishlist_private.family_members where email=normalized;
 if found and target.role='owner' then
  if actor_role<>'owner' or p_role is distinct from 'owner' or p_active is distinct from true then raise exception 'Owner access cannot be changed.' using errcode='42501'; end if;
  if p_revision is distinct from target.revision then raise exception 'This account changed. Refresh before saving.' using errcode='40001'; end if;
  update wishlist_private.family_members set first_name=given_name,revision=revision+1 where email=normalized;
 else
  perform wishlist_private.editor_set_member(normalized,p_role,p_active,p_revision);
  update wishlist_private.family_members set first_name=given_name where email=normalized;
 end if;
end; $$;
create function public.get_administration() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.get_administration();$$;
create function public.admin_save_member(p_email text,p_first_name text,p_role text,p_active boolean,p_revision integer) returns void language sql security invoker set search_path='' as $$select wishlist_private.admin_save_member(p_email,p_first_name,p_role,p_active,p_revision);$$;
revoke all on function wishlist_private.get_administration(),public.get_administration(),wishlist_private.admin_save_member(text,text,text,boolean,integer),public.admin_save_member(text,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function wishlist_private.get_administration(),public.get_administration(),wishlist_private.admin_save_member(text,text,text,boolean,integer),public.admin_save_member(text,text,text,boolean,integer) to authenticated;
notify pgrst,'reload schema';
