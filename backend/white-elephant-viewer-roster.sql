-- Also correct existing clients that still call the earlier picker RPC.
create or replace function white_elephant.recipient_names() returns setof text
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then
   raise exception 'Organizer access required' using errcode='42501';
 end if;
 return query select btrim(concat_ws(' ',nullif(btrim(f.first_name),''),nullif(btrim(f.last_name),'')))
 from wishlist_private.family_members f where f.active and f.role='viewer'
 and coalesce(nullif(btrim(f.first_name),''),nullif(btrim(f.last_name),'')) is not null
 order by 1;
end;$$;
create function public.we_viewer_player_names() returns setof text language sql stable security invoker
set search_path='' as $$select * from white_elephant.recipient_names()$$;
revoke all on function public.we_viewer_player_names() from public,anon,authenticated;
grant execute on function public.we_viewer_player_names() to authenticated;

-- Private reusable account portrait. Game portraits are independent copies.
alter table wishlist_private.family_members add column game_portrait bytea
 check(octet_length(game_portrait)<=524288);
create function white_elephant.account_portrait(id uuid, image text, write_photo boolean)
returns text language plpgsql security definer set search_path='' as $$
declare bytes bytea;
begin
 if coalesce(wishlist_private.member_role(),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 if write_photo then
   if image is null or length(image)>699052 then raise exception 'Invalid photo size'; end if;
   bytes:=decode(image,'base64');
   if substring(bytes from 1 for 3)<>decode('ffd8ff','hex') or octet_length(bytes)>524288 then raise exception 'JPEG required'; end if;
   update wishlist_private.family_members set game_portrait=bytes where account_id=id and active and role='viewer';
   if not found then raise exception 'Viewer unavailable'; end if;
   return null;
 end if;
 select game_portrait into bytes from wishlist_private.family_members where account_id=id and active and role='viewer';
 return replace(encode(bytes,'base64'),chr(10),'');
end;$$;
create function public.we_account_portrait(id uuid,image text default null,write_photo boolean default false)
returns text language sql security invoker set search_path='' as $$select white_elephant.account_portrait(id,image,write_photo)$$;
create function white_elephant.viewer_choices() returns table(id uuid,name text,has_photo boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 return query select f.account_id,btrim(concat_ws(' ',nullif(btrim(f.first_name),''),nullif(btrim(f.last_name),''))),f.game_portrait is not null
 from wishlist_private.family_members f where f.active and f.role='viewer' and coalesce(nullif(btrim(f.first_name),''),nullif(btrim(f.last_name),'')) is not null order by 2;
end;$$;
create function public.we_viewer_choices() returns table(id uuid,name text,has_photo boolean) language sql stable security invoker set search_path='' as $$select * from white_elephant.viewer_choices()$$;
revoke all on function white_elephant.viewer_choices(),public.we_viewer_choices(),white_elephant.account_portrait(uuid,text,boolean),public.we_account_portrait(uuid,text,boolean) from public,anon,authenticated;
grant execute on function white_elephant.viewer_choices(),public.we_viewer_choices(),white_elephant.account_portrait(uuid,text,boolean),public.we_account_portrait(uuid,text,boolean) to authenticated;
