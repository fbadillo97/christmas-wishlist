-- Run against a configured Supabase test project as a privileged SQL role.
-- All feature mutations are rolled back; no real wishlist data is used.
begin;
do $$
declare
 owner_id uuid;
 feature jsonb;
 result jsonb;
 revision_no integer;
 before_count bigint;
 denied boolean:=false;
begin
 select count(*) into before_count from wishlist_private.platform_roadmap_features;
 if before_count<>10 then raise exception 'Expected 10 seeded roadmap features; found %',before_count; end if;
 if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='wishlist_private' and c.relname='platform_roadmap_features') then raise exception 'Roadmap RLS is not enabled'; end if;
 if has_table_privilege('authenticated','wishlist_private.platform_roadmap_features','select') or has_table_privilege('anon','wishlist_private.platform_roadmap_features','select') then raise exception 'Roadmap table is directly readable'; end if;

 perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000001','role','authenticated')::text,true);
 begin perform wishlist_private.get_platform_roadmap(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-owner unexpectedly read roadmap data'; end if;

 select u.id into owner_id from wishlist_private.family_members f join auth.users u on lower(u.email)=f.email where f.role='owner' and f.active limit 1;
 if owner_id is null then raise exception 'An active owner account is required for this rollback-only test'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id::text,'role','authenticated')::text,true);
 feature:=jsonb_build_object('feature_id','roadmap-test-smoke','title','Temporary roadmap test','description','Rollback-only test record','priority','high','complexity','low','effort_estimate','','phase',1,'status','idea','dependencies','[]'::jsonb,'parent_feature_id','','technical_notes','','decision_notes','Test decision','open_questions','Test question','documentation_path','docs/platform-roadmap/features/roadmap-test-smoke.md','implementation_refs','[]'::jsonb);
 result:=wishlist_private.save_platform_roadmap_feature(feature,null);revision_no:=(result->>'revision')::integer;
 feature:=jsonb_set(feature,'{status}','"testing"');result:=wishlist_private.save_platform_roadmap_feature(feature,revision_no);revision_no:=(result->>'revision')::integer;
 feature:=jsonb_set(feature,'{status}','"completed"');result:=wishlist_private.save_platform_roadmap_feature(feature,revision_no);revision_no:=(result->>'revision')::integer;
 if (select completion_date is null from wishlist_private.platform_roadmap_features where feature_id='roadmap-test-smoke') then raise exception 'Completion date was not set'; end if;
 feature:=jsonb_set(feature,'{status}','"planned"');result:=wishlist_private.save_platform_roadmap_feature(feature,revision_no);revision_no:=(result->>'revision')::integer;
 perform wishlist_private.archive_platform_roadmap_feature('roadmap-test-smoke',revision_no);
 if (select status from wishlist_private.platform_roadmap_features where feature_id='roadmap-test-smoke')<>'archived' then raise exception 'Archive transition failed'; end if;
 if (select count(*) from wishlist_private.platform_roadmap_history where feature_id='roadmap-test-smoke')<>5 then raise exception 'Expected a complete five-step history'; end if;
end $$;
rollback;
