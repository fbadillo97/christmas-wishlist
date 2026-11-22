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
