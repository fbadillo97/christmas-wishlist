create or replace function wishlist_private.get_my_selections()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if wishlist_private.member_role() is null then raise exception 'Family access required' using errcode='42501'; end if;
 return jsonb_build_object(
 'gifts',coalesce((select jsonb_agg(g.details || jsonb_build_object('id',g.id,'kind',g.kind,'quantity',g.quantity,'revision',g.revision,'archived',g.archived) order by g.id) from wishlist_private.gift_catalog g where exists(select 1 from wishlist_private.gift_claims c where c.gift_id=g.id and c.owner_id=auth.uid())),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(jsonb_build_object('gift_id',c.gift_id,'unit_no',c.unit_no,'status',c.status,'mine',true) order by c.gift_id,c.unit_no) from wishlist_private.gift_claims c where c.owner_id=auth.uid()),'[]'::jsonb));
end $$;
revoke all on function wishlist_private.get_my_selections() from public,anon;
grant execute on function wishlist_private.get_my_selections() to authenticated;
create or replace function public.get_my_selections()
returns jsonb language sql security invoker set search_path = '' as $$ select wishlist_private.get_my_selections() $$;
revoke all on function public.get_my_selections() from public,anon;
grant execute on function public.get_my_selections() to authenticated;
notify pgrst, 'reload schema';