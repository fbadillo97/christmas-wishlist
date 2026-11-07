-- Small private display image only; never commit photo bytes or real image seeds.
create table wishlist_private.family_media (
 id text primary key check (id='family-photo'),
 content_type text not null check (content_type='image/jpeg'),
 image_bytes bytea not null check (octet_length(image_bytes) between 1 and 250000)
);
alter table wishlist_private.family_media enable row level security;
revoke all on wishlist_private.family_media from public,anon,authenticated;
create function wishlist_private.get_family_photo()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or wishlist_private.member_role() is null then
  raise exception 'Family access required' using errcode='42501';
 end if;
 perform set_config('response.headers','[{"Cache-Control":"no-store, private"}]',true);
 return (select jsonb_build_object('content_type',m.content_type,'base64',encode(m.image_bytes,'base64')) from wishlist_private.family_media m where m.id='family-photo');
end $$;
revoke all on function wishlist_private.get_family_photo() from public,anon;
grant execute on function wishlist_private.get_family_photo() to authenticated;
create function public.get_family_photo()
returns jsonb language sql security invoker set search_path='' as $$ select wishlist_private.get_family_photo() $$;
revoke all on function public.get_family_photo() from public,anon;
grant execute on function public.get_family_photo() to authenticated;
notify pgrst,'reload schema';