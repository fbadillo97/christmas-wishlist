-- Personal welcome links disclose a greeting only; email/passkey verification is still required.
create table wishlist_private.welcome_links (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 email text not null references wishlist_private.family_members(email) on delete cascade,
 created_at timestamptz not null default now()
);
create index welcome_links_email_idx on wishlist_private.welcome_links(email);
alter table wishlist_private.welcome_links enable row level security;
revoke all on wishlist_private.welcome_links from public,anon,authenticated;
create function wishlist_private.begin_personal_welcome(p_actor uuid,p_email text,p_revision integer,p_token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid welcome link.';end if;
 result=wishlist_private.begin_invitation(p_actor,p_email,p_revision);
 insert into wishlist_private.welcome_links(token_hash,email) values(p_token_hash,result->>'email');
 return result;
end; $$;
create function wishlist_private.resolve_welcome_link(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null;end if;
 select jsonb_build_object('email',f.email,'first_name',f.first_name) into result
 from wishlist_private.welcome_links l join wishlist_private.family_members f on f.email=l.email
 where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and f.active;
 return result;
end; $$;
create function public.wishlist_begin_personal_welcome(p_actor uuid,p_email text,p_revision integer,p_token_hash text) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.begin_personal_welcome(p_actor,p_email,p_revision,p_token_hash);$$;
create function public.wishlist_resolve_welcome_link(p_token text) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.resolve_welcome_link(p_token);$$;
revoke all on function wishlist_private.begin_personal_welcome(uuid,text,integer,text),public.wishlist_begin_personal_welcome(uuid,text,integer,text),wishlist_private.resolve_welcome_link(text),public.wishlist_resolve_welcome_link(text) from public,anon,authenticated;
grant execute on function wishlist_private.begin_personal_welcome(uuid,text,integer,text),public.wishlist_begin_personal_welcome(uuid,text,integer,text),wishlist_private.resolve_welcome_link(text),public.wishlist_resolve_welcome_link(text) to service_role;
create function wishlist_private.get_wishlist_account() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_role text;
begin
 v_role=wishlist_private.member_role();if v_role is null then raise exception 'Approved family access is required.' using errcode='42501';end if;
 return jsonb_build_object('account',jsonb_build_object('role',v_role));
end; $$;
create function public.get_wishlist_account() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.get_wishlist_account();$$;
revoke all on function wishlist_private.get_wishlist_account(),public.get_wishlist_account() from public,anon,authenticated;
grant execute on function wishlist_private.get_wishlist_account(),public.get_wishlist_account() to authenticated;
notify pgrst,'reload schema';
