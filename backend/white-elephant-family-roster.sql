create or replace function white_elephant.recipient_names() returns setof text
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('editor','owner') then
   raise exception 'Organizer access required' using errcode='42501';
 end if;
 return query select coalesce(nullif(btrim(concat_ws(' ',f.first_name,f.last_name)),''),'Family member ' || left(f.account_id::text,6))
 from wishlist_private.family_members f where f.active

 order by 1;
end;$$;
create or replace function white_elephant.account_portrait(id uuid, image text, write_photo boolean)
returns text language plpgsql security definer set search_path='' as $$
declare bytes bytea;
begin
 if coalesce(wishlist_private.member_role(),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 if write_photo then
   if image is null or length(image)>699052 then raise exception 'Invalid photo size'; end if;
   bytes:=decode(image,'base64');
   if substring(bytes from 1 for 3)<>decode('ffd8ff','hex') or octet_length(bytes)>524288 then raise exception 'JPEG required'; end if;
   update wishlist_private.family_members set game_portrait=bytes where account_id=id and active;
   if not found then raise exception 'Account unavailable'; end if;
   return null;
 end if;
 select game_portrait into bytes from wishlist_private.family_members where account_id=id and active;
 return replace(encode(bytes,'base64'),chr(10),'');
end;$$;
create or replace function white_elephant.viewer_choices() returns table(id uuid,name text,has_photo boolean)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(wishlist_private.member_role(),'') not in ('owner','editor') then raise exception 'Organizer required' using errcode='42501'; end if;
 return query select f.account_id,coalesce(nullif(btrim(concat_ws(' ',f.first_name,f.last_name)),''),'Family member ' || left(f.account_id::text,6)),f.game_portrait is not null
 from wishlist_private.family_members f where f.active order by 2;
end;$$;