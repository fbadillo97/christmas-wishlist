-- A roadmap item is not Completed until deployment and verification evidence
-- is recorded. Keep the audited completion action separate from ordinary edits.
alter table wishlist_private.platform_roadmap_features
 add column verification_notes text not null default '' check (length(verification_notes) <= 8000);

create function wishlist_private.platform_roadmap_completion_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.status='completed' and nullif(btrim(new.verification_notes),'') is null then
  raise exception 'Add deployment and verification evidence before marking this feature completed.';
 end if;
 return new;
end; $$;
revoke all on function wishlist_private.platform_roadmap_completion_guard() from public,anon,authenticated;
create trigger platform_roadmap_completion_guard before insert or update on wishlist_private.platform_roadmap_features
for each row execute function wishlist_private.platform_roadmap_completion_guard();

create or replace function wishlist_private.get_platform_roadmap() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if wishlist_private.member_role() is distinct from 'owner' then
  raise exception 'Only the owner can manage the platform roadmap.' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'feature_id',f.feature_id,'title',f.title,'description',f.description,'priority',f.priority,
  'complexity',f.complexity,'effort_estimate',f.effort_estimate,'phase',f.phase,'status',f.status,
  'dependencies',to_jsonb(f.dependencies),'parent_feature_id',f.parent_feature_id,
  'technical_notes',f.technical_notes,'verification_notes',f.verification_notes,'decision_notes',f.decision_notes,'open_questions',f.open_questions,
  'documentation_path',f.documentation_path,'implementation_refs',to_jsonb(f.implementation_refs),
  'completion_date',f.completion_date,'revision',f.revision,'created_at',f.created_at,'updated_at',f.updated_at,
  'history',coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'before_state',h.before_state,
   'after_state',h.after_state,'created_at',h.created_at) order by h.created_at desc)
   from wishlist_private.platform_roadmap_history h where h.feature_id=f.feature_id),'[]'::jsonb)
 ) order by f.phase,case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,f.title)
 from wishlist_private.platform_roadmap_features f),'[]'::jsonb);
end; $$;

create function wishlist_private.complete_platform_roadmap_feature(p_feature_id text,p_revision integer,p_verification_notes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old_row wishlist_private.platform_roadmap_features%rowtype; new_row wishlist_private.platform_roadmap_features%rowtype; notes text; action_name text;
begin
 if wishlist_private.member_role() is distinct from 'owner' then raise exception 'Only the owner can manage the platform roadmap.' using errcode='42501'; end if;
 notes=btrim(coalesce(p_verification_notes,''));
 if notes='' or length(notes)>8000 or notes ~ '[[:cntrl:]]' then raise exception 'Add deployment and verification evidence of up to 8,000 characters without control characters.'; end if;
 select * into old_row from wishlist_private.platform_roadmap_features where feature_id=p_feature_id for update;
 if not found then raise exception 'Feature not found.'; end if;
 if old_row.revision is distinct from p_revision then raise exception 'This feature changed. Refresh before completing.' using errcode='40001'; end if;
 if old_row.status='archived' then raise exception 'Restore the feature before completing it.'; end if;
 action_name=case when old_row.status='completed' then 'updated' else 'completed' end;
 update wishlist_private.platform_roadmap_features set status='completed',verification_notes=notes,
  completion_date=case when old_row.status='completed' then coalesce(old_row.completion_date,current_date) else current_date end
  where feature_id=p_feature_id returning * into new_row;
 insert into wishlist_private.platform_roadmap_history(feature_id,actor_id,action,before_state,after_state)
 values(p_feature_id,auth.uid(),action_name,to_jsonb(old_row),to_jsonb(new_row));
 return jsonb_build_object('feature_id',p_feature_id,'revision',new_row.revision,'status',new_row.status,'completion_date',new_row.completion_date);
end; $$;

create function public.complete_platform_roadmap_feature(p_feature_id text,p_revision integer,p_verification_notes text) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.complete_platform_roadmap_feature(p_feature_id,p_revision,p_verification_notes);$$;
revoke all on function wishlist_private.complete_platform_roadmap_feature(text,integer,text),public.complete_platform_roadmap_feature(text,integer,text) from public,anon,authenticated;
grant execute on function wishlist_private.complete_platform_roadmap_feature(text,integer,text),public.complete_platform_roadmap_feature(text,integer,text) to authenticated;
notify pgrst,'reload schema';
