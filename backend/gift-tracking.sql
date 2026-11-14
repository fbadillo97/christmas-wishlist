-- Historical claims remain undated. Only new or materially changed claims are stamped.
alter table wishlist_private.gift_claims add column updated_at timestamptz;
create function wishlist_private.stamp_claim_updated_at() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then new.updated_at=clock_timestamp();
 elsif new.status is distinct from old.status or new.owner_id is distinct from old.owner_id then new.updated_at=clock_timestamp();
 else new.updated_at=old.updated_at;
 end if;
 return new;
end; $$;
revoke all on function wishlist_private.stamp_claim_updated_at() from public,anon,authenticated;
create trigger stamp_claim_updated_at before insert or update on wishlist_private.gift_claims for each row execute function wishlist_private.stamp_claim_updated_at();
create function wishlist_private.admin_gift_tracking() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if wishlist_private.member_role() is distinct from 'owner' then raise exception 'Only the owner can view gift tracking.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
 'gift_id',g.id,'title',g.details->>'title','recipient_id',g.details->>'person','recipient',coalesce(p.name,'Unknown recipient'),
 'unit_no',c.unit_no,'status',c.status,'archived',g.archived,'selected_by_email',u.email,'selected_by_name',nullif(btrim(f.first_name),''),'updated_at',c.updated_at
 ) order by p.sort_order,g.details->>'title',c.unit_no)
 from wishlist_private.gift_claims c join wishlist_private.gift_catalog g on g.id=c.gift_id
 left join wishlist_private.wishlist_people p on p.id=g.details->>'person'
 left join auth.users u on u.id=c.owner_id left join wishlist_private.family_members f on f.email=lower(u.email)
 where c.status in ('reserved','purchased')),'[]'::jsonb);
end; $$;
create function public.admin_gift_tracking() returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.admin_gift_tracking();$$;
revoke all on function wishlist_private.admin_gift_tracking(),public.admin_gift_tracking() from public,anon,authenticated;
grant execute on function wishlist_private.admin_gift_tracking(),public.admin_gift_tracking() to authenticated;
create or replace function wishlist_private.get_administration() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; result jsonb;
begin
 actor_role=wishlist_private.member_role();
 if coalesce(actor_role,'') not in ('owner','editor') then raise exception 'Administration requires editor or owner access.' using errcode='42501'; end if;
 result=jsonb_build_object('account',jsonb_build_object('role',actor_role),'members',wishlist_private.editor_list_members());
 if actor_role='owner' then result=result||jsonb_build_object('gift_tracking',wishlist_private.admin_gift_tracking());end if;
 return result;
end; $$;
notify pgrst,'reload schema';
