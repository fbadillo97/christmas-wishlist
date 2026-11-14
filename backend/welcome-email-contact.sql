create table wishlist_private.welcome_email_settings (
 singleton boolean primary key default true check(singleton),
 contact_email text not null check(length(contact_email)<=254 and contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
);
alter table wishlist_private.welcome_email_settings enable row level security;
revoke all on wishlist_private.welcome_email_settings from public,anon,authenticated;

create or replace function wishlist_private.begin_invitation(p_actor uuid,p_email text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor_role text; target wishlist_private.family_members%rowtype; attempt uuid; contact text;
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
 select contact_email into contact from wishlist_private.welcome_email_settings where singleton;
 if contact is null then raise exception 'Welcome email contact is not configured.';end if;
 attempt=gen_random_uuid();
 update wishlist_private.family_members set invitation_status='sending',invitation_attempt_id=attempt,invitation_attempted_at=now() where email=target.email;
 return jsonb_build_object('attempt',attempt,'email',target.email,'first_name',target.first_name,'contact_email',contact,'existing_user',exists(select 1 from auth.users where lower(email)=target.email));
end; $$;
