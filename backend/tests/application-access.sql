-- Use a rollback transaction. Only randomly named fixture accounts are modified.
set local plpgsql.check_asserts=on;
do $test$
declare
 editor uuid:=gen_random_uuid(); viewer uuid:=gen_random_uuid();
 editor_email text:=editor::text||'@example.invalid'; viewer_email text:=viewer::text||'@example.invalid';
 w boolean; g boolean; rev integer; state jsonb; visible boolean;
begin
 insert into auth.users(id,email,email_confirmed_at) values(editor,editor_email,now()),(viewer,viewer_email,now());
 insert into wishlist_private.family_members(email,role,active) values(editor_email,'editor',true);
 perform set_config('request.jwt.claim.sub',editor::text,true);
 perform public.admin_save_account_access(viewer_email,'Fixture','User','viewer',true,null,true,true);
 state:=public.we_start_game(gen_random_uuid(),array['Amber','Blue'],array[viewer]);
 foreach w in array array[false,true] loop
  foreach g in array array[false,true] loop
   perform set_config('request.jwt.claim.sub',editor::text,true);
   select revision into strict rev from wishlist_private.family_members where email=viewer_email;
   perform public.admin_save_account_access(viewer_email,'Fixture','User','viewer',true,rev,w,g);
   perform set_config('request.jwt.claim.sub',viewer::text,true);
   assert public.family_app_access()=jsonb_build_object('wishlist',w,'game',g,'role','viewer');
   visible:=true;
   begin perform public.get_wishlist(); exception when insufficient_privilege then visible:=false; end;
   assert visible=w,'Wishlist access mismatch';
   visible:=true;
   begin perform public.we_host_action((state->>'id')::uuid,null,'read'); exception when insufficient_privilege then visible:=false; end;
   assert visible=g,'Game access mismatch';
   begin perform public.admin_save_account_access(viewer_email,'Fixture','User','viewer',true,rev,true,true);
    raise exception 'Viewer changed access'; exception when insufficient_privilege then null; end;
  end loop;
 end loop;
 update wishlist_private.family_members set active=false where email=viewer_email;
 assert public.family_app_access()=jsonb_build_object('wishlist',false,'game',false,'role',null::text);
end;$test$;
