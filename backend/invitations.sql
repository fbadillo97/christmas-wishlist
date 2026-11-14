-- Saving remains editor_set_member only: no Auth/email calls or email triggers.
alter table wishlist_private.family_members
 add column invitation_status text not null default 'not_sent' check (invitation_status in ('not_sent','sending','sent','failed','unknown')),
 add column invitation_attempt_id uuid,
 add column invitation_attempted_at timestamptz,
 add column invitation_sent_at timestamptz;

create or replace function wishlist_private.editor_list_members() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',f.email,'role',f.role,'active',f.active,'revision',f.revision,
 'invitation_status',case when f.invitation_status='sending' and f.invitation_attempted_at<now()-interval '2 minutes' then 'unknown' else f.invitation_status end,
 'invitation_sent_at',f.invitation_sent_at,'invitation_attempted_at',f.invitation_attempted_at,
 'has_signed_in',exists(select 1 from auth.users u where lower(u.email)=f.email and u.last_sign_in_at is not null)) order by f.email)
 from wishlist_private.family_members f),'[]'::jsonb);
end; $$;

-- Only the Edge Function's server credential may call this, after Auth /user verification.
create function wishlist_private.begin_invitation(p_actor uuid,p_email text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_role text; target wishlist_private.family_members%rowtype; attempt uuid;
begin
 lock table wishlist_private.family_members in share row exclusive mode;
 select f.role into actor_role from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email
 where u.id=p_actor and u.email_confirmed_at is not null and f.active;
 if coalesce(actor_role,'') not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501'; end if;
 select * into target from wishlist_private.family_members where email=lower(btrim(p_email)) for update;
 if not found or not target.active then raise exception 'Save and enable this account before sending an invitation.'; end if;
 if target.role='owner' or (actor_role<>'owner' and target.role<>'viewer') then raise exception 'You cannot invite this account.' using errcode='42501'; end if;
 if target.revision is distinct from p_revision then raise exception 'This account changed. Refresh before sending.' using errcode='40001'; end if;
 if target.invitation_attempted_at>now()-interval '2 minutes' then raise exception 'Wait two minutes before sending again.' using errcode='40001'; end if;
 attempt=gen_random_uuid();
 update wishlist_private.family_members set invitation_status='sending',invitation_attempt_id=attempt,invitation_attempted_at=now() where email=target.email;
 return jsonb_build_object('attempt',attempt,'email',target.email,'existing_user',exists(select 1 from auth.users where lower(email)=target.email));
end; $$;
create function wishlist_private.finish_invitation(p_attempt uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_status not in ('sent','failed','unknown') or p_status is null then raise exception 'Invalid invitation status'; end if;
 update wishlist_private.family_members set invitation_status=p_status,invitation_sent_at=case when p_status='sent' then now() else invitation_sent_at end
 where invitation_attempt_id=p_attempt and invitation_status='sending';
 if not found then raise exception 'Invitation attempt changed.'; end if;
end; $$;
create function public.wishlist_begin_invitation(p_actor uuid,p_email text,p_revision integer) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.begin_invitation(p_actor,p_email,p_revision);$$;
create function public.wishlist_finish_invitation(p_attempt uuid,p_status text) returns void language sql security invoker set search_path='' as $$select wishlist_private.finish_invitation(p_attempt,p_status);$$;
revoke all on function wishlist_private.begin_invitation(uuid,text,integer),wishlist_private.finish_invitation(uuid,text),public.wishlist_begin_invitation(uuid,text,integer),public.wishlist_finish_invitation(uuid,text) from public,anon,authenticated;
grant usage on schema wishlist_private to service_role;
grant execute on function wishlist_private.begin_invitation(uuid,text,integer),wishlist_private.finish_invitation(uuid,text),public.wishlist_begin_invitation(uuid,text,integer),public.wishlist_finish_invitation(uuid,text) to service_role;
notify pgrst,'reload schema';

-- Correct legacy email validation to use an unambiguous literal dot.
create or replace function wishlist_private.editor_set_member(p_email text,p_role text,p_active boolean,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare target wishlist_private.family_members%rowtype;actor_role text;normalized text;
begin
lock table wishlist_private.family_members in share row exclusive mode;
actor_role=wishlist_private.member_role();
if actor_role is null or actor_role not in ('editor','owner') then raise exception 'Editor access is required.' using errcode='42501';end if;
normalized=lower(btrim(p_email));
if normalized is null or length(normalized)>254 or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email address.';end if;
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
