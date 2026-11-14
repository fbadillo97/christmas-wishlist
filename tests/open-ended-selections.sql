-- Transactional synthetic fixtures only; never send Auth emails.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-000000000a01','wishlist-test-a@example.invalid',now()),
 ('00000000-0000-4000-8000-000000000a02','wishlist-test-b@example.invalid',now()),
 ('00000000-0000-4000-8000-000000000a03','wishlist-test-unlisted@example.invalid',now());
insert into wishlist_private.family_members(email,role,active) values('wishlist-test-a@example.invalid','viewer',true),('wishlist-test-b@example.invalid','viewer',true);
insert into wishlist_private.wishlist_people(id,name,symbol,sort_order) values('test-open-person','Test recipient','*',9999);
insert into wishlist_private.gift_catalog(id,kind,quantity,reservation_mode,details) values
 ('test-open','idea',1,'open-ended','{"id":"test-open","person":"test-open-person","title":"Synthetic idea"}'),
 ('test-limited','product',1,'limited','{"id":"test-limited","person":"test-open-person","title":"Synthetic product"}'),
 ('test-inspiration','idea',1,'inspiration-only','{"id":"test-inspiration","person":"test-open-person","title":"Synthetic inspiration"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select public.set_idea_selection('test-open','reserved','Only A can read this');
select public.set_gift_unit_status('test-limited',1,'reserved');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select public.set_idea_selection('test-open','purchased','Only B can read this');
do $$declare v jsonb;begin
 v=public.get_my_selections();
 if v::text like '%Only A%' or v::text not like '%Only B%' then raise exception 'Private note isolation failed';end if;
 if exists(select 1 from public.list_gift_units() where gift_id='test-open') then raise exception 'Idea exposed as limited units';end if;
 if public.get_wishlist()::text like '%Only A%' or public.get_wishlist()::text like '%Only B%' then raise exception 'Notes leaked to wishlist';end if;
 begin perform public.set_gift_unit_status('test-limited',1,'purchased');raise exception 'Claim stealing allowed';exception when raise_exception then if sqlerrm='Claim stealing allowed' then raise;end if;end;
 begin perform public.set_gift_unit_status('test-limited',1,'available');raise exception 'Other owner undo allowed';exception when raise_exception then if sqlerrm='Other owner undo allowed' then raise;end if;end;
 begin perform public.set_gift_unit_status('test-open',1,'reserved');raise exception 'Legacy idea reserve allowed';exception when raise_exception then if sqlerrm='Legacy idea reserve allowed' then raise;end if;end;
 begin perform public.set_idea_selection('test-inspiration','reserved','');raise exception 'Inspiration selection allowed';exception when raise_exception then if sqlerrm='Inspiration selection allowed' then raise;end if;end;
 begin perform public.set_idea_selection('test-open','reserved',repeat('x',2001));raise exception 'Oversized note allowed';exception when raise_exception then if sqlerrm='Oversized note allowed' then raise;end if;end;
 begin perform 1 from wishlist_private.idea_selections;raise exception 'Direct access allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select set_config('request.jwt.claim.sub',(select u.id::text from auth.users u join wishlist_private.family_members f on f.email=lower(u.email) where f.role='owner' and f.active limit 1),true);
set local role authenticated;
do $$begin
 if public.admin_gift_tracking()::text like '%Only A%' or public.admin_gift_tracking()::text like '%Only B%' then raise exception 'Private notes leaked to owner tracking';end if;
end;$$;
reset role;
update wishlist_private.family_members set role='editor' where email='wishlist-test-b@example.invalid';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
set local role authenticated;
do $$declare payload jsonb;rev integer;begin
 payload='{"kind":"idea","quantity":1,"person":"test-open-person","title":"Synthetic idea","used":true,"match":"similar","reservation_mode":"limited"}';
 select (g->>'revision')::integer into rev from jsonb_array_elements(public.editor_list_gifts()) g where g->>'id'='test-open';
 begin perform public.editor_save_gift('test-open',rev,payload);raise exception 'Selected mode change allowed';exception when raise_exception then if sqlerrm='Selected mode change allowed' then raise;end if;end;
 payload=payload||'{"reservation_mode":"open-ended"}'::jsonb;
 begin perform public.editor_save_gift('test-open',rev-1,payload);raise exception 'Stale edit allowed';exception when serialization_failure then null;end;
 perform public.editor_save_gift('test-open',rev,payload);
end;$$;
select public.set_idea_selection('test-open','available','');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
do $$begin
 if public.get_my_selections()::text not like '%Only A%' then raise exception 'Other member undo removed my selection';end if;
end;$$;
select public.set_idea_selection('test-open','purchased','Updated A note');
reset role;
update wishlist_private.gift_catalog set archived=true where id='test-open';
set local role authenticated;
do $$begin
 if public.get_my_selections()::text not like '%Updated A note%' then raise exception 'Archived selection missing';end if;
 begin perform public.set_idea_selection('test-open','reserved','');raise exception 'Archived selection allowed';exception when raise_exception then if sqlerrm='Archived selection allowed' then raise;end if;end;
end;$$;
select public.set_idea_selection('test-open','available','');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
do $$begin
 begin perform public.set_idea_selection('test-open','reserved','');raise exception 'Unlisted user allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_my_selections();raise exception 'Unlisted read allowed';exception when insufficient_privilege then null;end;
end;$$;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.set_idea_selection('test-open','reserved','');raise exception 'Unauthenticated allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local role anon;
do $$begin
 begin perform public.set_idea_selection('test-open','reserved','');raise exception 'Anon execution allowed';exception when insufficient_privilege then null;end;
end;$$;
reset role;
select 'Independent selections, privacy, ownership, limited contention, archive, validation, and authorization passed' as result;
rollback;
