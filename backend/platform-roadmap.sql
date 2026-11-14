-- Owner-only planning data for future platform work. No future wishlist/game
-- functionality is implemented by this schema.
create table wishlist_private.platform_roadmap_features (
 feature_id text primary key check (feature_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 title text not null check (length(btrim(title)) between 1 and 120),
 description text not null default '' check (length(description) <= 2000),
 priority text not null default 'medium' check (priority in ('high','medium','low')),
 complexity text not null default 'medium' check (complexity in ('low','medium','high')),
 effort_estimate text not null default '' check (length(effort_estimate) <= 120),
 phase smallint not null default 1 check (phase between 1 and 4),
 status text not null default 'idea' check (status in ('idea','planned','in_progress','testing','completed','on_hold','archived')),
 dependencies text[] not null default '{}',
 parent_feature_id text references wishlist_private.platform_roadmap_features(feature_id) on delete restrict deferrable initially deferred,
 technical_notes text not null default '' check (length(technical_notes) <= 8000),
 decision_notes text not null default '' check (length(decision_notes) <= 8000),
 open_questions text not null default '' check (length(open_questions) <= 8000),
 documentation_path text not null check (documentation_path like 'docs/platform-roadmap/features/%' and length(documentation_path) <= 240),
 implementation_refs text[] not null default '{}',
 completion_date date,
 revision integer not null default 1 check (revision >= 1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create index platform_roadmap_status_phase_idx on wishlist_private.platform_roadmap_features(status,phase);
create index platform_roadmap_parent_idx on wishlist_private.platform_roadmap_features(parent_feature_id);
alter table wishlist_private.platform_roadmap_features enable row level security;
revoke all on wishlist_private.platform_roadmap_features from public, anon, authenticated;

create table wishlist_private.platform_roadmap_history (
 id bigint generated always as identity primary key,
 feature_id text not null references wishlist_private.platform_roadmap_features(feature_id) on delete restrict,
 actor_id uuid,
 action text not null check (action in ('created','updated','completed','reopened','archived')),
 before_state jsonb,
 after_state jsonb not null,
 created_at timestamptz not null default now()
);
alter table wishlist_private.platform_roadmap_history enable row level security;
revoke all on wishlist_private.platform_roadmap_history from public, anon, authenticated;
create index platform_roadmap_history_feature_created_idx on wishlist_private.platform_roadmap_history(feature_id,created_at desc);

create function wishlist_private.platform_roadmap_touch() returns trigger
language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp();
 new.revision=old.revision+1;
 return new;
end; $$;
revoke all on function wishlist_private.platform_roadmap_touch() from public,anon,authenticated;
create trigger platform_roadmap_touch before update on wishlist_private.platform_roadmap_features
for each row execute function wishlist_private.platform_roadmap_touch();

create function wishlist_private.get_platform_roadmap() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if wishlist_private.member_role() is distinct from 'owner' then
  raise exception 'Only the owner can manage the platform roadmap.' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'feature_id',f.feature_id,'title',f.title,'description',f.description,'priority',f.priority,
  'complexity',f.complexity,'effort_estimate',f.effort_estimate,'phase',f.phase,'status',f.status,
  'dependencies',to_jsonb(f.dependencies),'parent_feature_id',f.parent_feature_id,
  'technical_notes',f.technical_notes,'decision_notes',f.decision_notes,'open_questions',f.open_questions,
  'documentation_path',f.documentation_path,'implementation_refs',to_jsonb(f.implementation_refs),
  'completion_date',f.completion_date,'revision',f.revision,'created_at',f.created_at,'updated_at',f.updated_at,
  'history',coalesce((select jsonb_agg(jsonb_build_object('action',h.action,'before_state',h.before_state,
   'after_state',h.after_state,'created_at',h.created_at) order by h.created_at desc)
   from wishlist_private.platform_roadmap_history h where h.feature_id=f.feature_id),'[]'::jsonb)
 ) order by f.phase,case f.priority when 'high' then 1 when 'medium' then 2 else 3 end,f.title)
 from wishlist_private.platform_roadmap_features f),'[]'::jsonb);
end; $$;

create function wishlist_private.save_platform_roadmap_feature(p_feature jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 fid text; old_row wishlist_private.platform_roadmap_features%rowtype; new_row wishlist_private.platform_roadmap_features%rowtype;
 deps text[]; refs text[]; action_name text; before_json jsonb;
begin
 if wishlist_private.member_role() is distinct from 'owner' then raise exception 'Only the owner can manage the platform roadmap.' using errcode='42501'; end if;
 if jsonb_typeof(p_feature) is distinct from 'object' then raise exception 'Feature data must be an object.'; end if;
 fid=btrim(coalesce(p_feature->>'feature_id',''));
 if fid !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Use a stable lowercase feature ID with hyphens.'; end if;
 if p_feature->>'status'='archived' then raise exception 'Use the Archive action to preserve the archive history.'; end if;
 if jsonb_typeof(coalesce(p_feature->'dependencies','[]'::jsonb)) is distinct from 'array' or jsonb_typeof(coalesce(p_feature->'implementation_refs','[]'::jsonb)) is distinct from 'array' then raise exception 'Dependencies and implementation references must be lists.'; end if;
 select coalesce(array_agg(x), '{}') into deps from jsonb_array_elements_text(coalesce(p_feature->'dependencies','[]'::jsonb)) as e(x);
 select coalesce(array_agg(x), '{}') into refs from jsonb_array_elements_text(coalesce(p_feature->'implementation_refs','[]'::jsonb)) as e(x);
 if cardinality(deps)>30 or cardinality(refs)>30 or exists(select 1 from unnest(deps) as dep(value) where dep.value=fid) then raise exception 'Dependencies or references are invalid.'; end if;
 if nullif(btrim(coalesce(p_feature->>'documentation_path','')),'') is null or p_feature->>'documentation_path' not like 'docs/platform-roadmap/features/%' then raise exception 'Documentation path must point under docs/platform-roadmap/features/.'; end if;
 select * into old_row from wishlist_private.platform_roadmap_features where feature_id=fid for update;
 if found then
  if p_revision is distinct from old_row.revision then raise exception 'This feature changed. Refresh before saving.' using errcode='40001'; end if;
  before_json=to_jsonb(old_row);
  update wishlist_private.platform_roadmap_features set
   title=btrim(coalesce(p_feature->>'title','')),description=btrim(coalesce(p_feature->>'description','')),
   priority=coalesce(p_feature->>'priority','medium'),complexity=coalesce(p_feature->>'complexity','medium'),
   effort_estimate=btrim(coalesce(p_feature->>'effort_estimate','')),
   phase=(p_feature->>'phase')::smallint,status=coalesce(p_feature->>'status','idea'),
   dependencies=deps,parent_feature_id=nullif(btrim(coalesce(p_feature->>'parent_feature_id','')),''),
   technical_notes=coalesce(p_feature->>'technical_notes',''),decision_notes=coalesce(p_feature->>'decision_notes',''),
   open_questions=coalesce(p_feature->>'open_questions',''),documentation_path=btrim(p_feature->>'documentation_path'),
   implementation_refs=refs,
   completion_date=case when coalesce(p_feature->>'status','idea')='completed' and old_row.status<>'completed' then current_date
     when coalesce(p_feature->>'status','idea')='completed' then old_row.completion_date else old_row.completion_date end
   where feature_id=fid returning * into new_row;
  action_name=case when old_row.status<>'completed' and new_row.status='completed' then 'completed'
   when old_row.status='completed' and new_row.status<>'completed' then 'reopened'
   else 'updated' end;
 else
  if p_revision is not null then raise exception 'This feature no longer exists. Refresh before saving.' using errcode='40001'; end if;
  insert into wishlist_private.platform_roadmap_features(feature_id,title,description,priority,complexity,effort_estimate,phase,status,dependencies,parent_feature_id,technical_notes,decision_notes,open_questions,documentation_path,implementation_refs,completion_date)
  values(fid,btrim(coalesce(p_feature->>'title','')),btrim(coalesce(p_feature->>'description','')),coalesce(p_feature->>'priority','medium'),coalesce(p_feature->>'complexity','medium'),btrim(coalesce(p_feature->>'effort_estimate','')),(p_feature->>'phase')::smallint,coalesce(p_feature->>'status','idea'),deps,nullif(btrim(coalesce(p_feature->>'parent_feature_id','')),''),coalesce(p_feature->>'technical_notes',''),coalesce(p_feature->>'decision_notes',''),coalesce(p_feature->>'open_questions',''),btrim(p_feature->>'documentation_path'),refs,case when p_feature->>'status'='completed' then current_date else null end)
  returning * into new_row;
  action_name=case when new_row.status='completed' then 'completed' else 'created' end;
 end if;
 if new_row.parent_feature_id=fid or exists(select 1 from unnest(deps) as dep(value) where not exists(select 1 from wishlist_private.platform_roadmap_features x where x.feature_id=dep.value)) then raise exception 'Parent and dependency features must exist and cannot reference this feature.'; end if;
 if new_row.parent_feature_id is not null and not exists(select 1 from wishlist_private.platform_roadmap_features p where p.feature_id=new_row.parent_feature_id) then raise exception 'Parent feature does not exist.'; end if;
 if new_row.parent_feature_id is not null and exists(
  with recursive parents(feature_id,parent_feature_id,path) as (
   select p.feature_id,p.parent_feature_id,array[p.feature_id] from wishlist_private.platform_roadmap_features p where p.feature_id=new_row.parent_feature_id
   union all
   select p.feature_id,p.parent_feature_id,a.path||p.feature_id from parents a join wishlist_private.platform_roadmap_features p on p.feature_id=a.parent_feature_id where not p.feature_id=any(a.path)
  ) select 1 from parents where feature_id=fid
 ) then raise exception 'Parent relationship would create a cycle.'; end if;
 insert into wishlist_private.platform_roadmap_history(feature_id,actor_id,action,before_state,after_state)
 values(fid,auth.uid(),action_name,before_json,to_jsonb(new_row));
 return jsonb_build_object('feature_id',fid,'revision',new_row.revision,'status',new_row.status);
end; $$;

create function wishlist_private.archive_platform_roadmap_feature(p_feature_id text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare old_row wishlist_private.platform_roadmap_features%rowtype; new_row wishlist_private.platform_roadmap_features%rowtype;
begin
 if wishlist_private.member_role() is distinct from 'owner' then raise exception 'Only the owner can manage the platform roadmap.' using errcode='42501'; end if;
 select * into old_row from wishlist_private.platform_roadmap_features where feature_id=p_feature_id for update;
 if not found then raise exception 'Feature not found.'; end if;
 if old_row.revision is distinct from p_revision then raise exception 'This feature changed. Refresh before archiving.' using errcode='40001'; end if;
 if old_row.status='archived' then return; end if;
 update wishlist_private.platform_roadmap_features set status='archived' where feature_id=p_feature_id returning * into new_row;
 insert into wishlist_private.platform_roadmap_history(feature_id,actor_id,action,before_state,after_state)
 values(p_feature_id,auth.uid(),'archived',to_jsonb(old_row),to_jsonb(new_row));
end; $$;

create function public.save_platform_roadmap_feature(p_feature jsonb,p_revision integer default null) returns jsonb language sql security invoker set search_path='' as $$select wishlist_private.save_platform_roadmap_feature(p_feature,p_revision);$$;
create function public.archive_platform_roadmap_feature(p_feature_id text,p_revision integer) returns void language sql security invoker set search_path='' as $$select wishlist_private.archive_platform_roadmap_feature(p_feature_id,p_revision);$$;
revoke all on function wishlist_private.get_platform_roadmap(),wishlist_private.save_platform_roadmap_feature(jsonb,integer),wishlist_private.archive_platform_roadmap_feature(text,integer),public.save_platform_roadmap_feature(jsonb,integer),public.archive_platform_roadmap_feature(text,integer) from public,anon,authenticated;
grant execute on function wishlist_private.get_platform_roadmap(),wishlist_private.save_platform_roadmap_feature(jsonb,integer),wishlist_private.archive_platform_roadmap_feature(text,integer),public.save_platform_roadmap_feature(jsonb,integer),public.archive_platform_roadmap_feature(text,integer) to authenticated;

insert into wishlist_private.platform_roadmap_features(feature_id,title,description,priority,complexity,effort_estimate,phase,status,dependencies,parent_feature_id,technical_notes,decision_notes,open_questions,documentation_path) values
('family-gift-suggestions','Family Gift Suggestions','Let family members submit gift ideas to an owner/editor approval queue before they appear on a wishlist.','high','medium','',1,'idea','{}',null,'','Proposed feature. Submissions should not publish directly to recipient lists.','Who may suggest, and can a submitter see review status?','docs/platform-roadmap/features/family-gift-suggestions.md'),
('recipient-profiles','Recipient Profiles','Shared recipient information such as interests, sizes, preferences, and gifting guidance.','high','low','',1,'idea','{}',null,'','Proposed feature. Never add ages or birthdays to recipient profiles.','Which profile fields are useful and who may edit them?','docs/platform-roadmap/features/recipient-profiles.md'),
('smarter-gift-discovery','Smarter Gift Discovery','Make growing wishlists easier to browse through categories, filters, search, and optional recommendations.','high','high','',2,'idea',array['recipient-profiles'],null,'','Initial priority and complexity are planning assumptions, not validated estimates.','Which filters matter most? Should “Surprise me” be included?','docs/platform-roadmap/features/smarter-gift-discovery.md'),
('personal-gift-planner','Personal Gift Planner','Give each buyer a private place to plan purchases, notes, budget and preparation.','medium','medium','',2,'idea',array['recipient-profiles'],null,'','Purchase details must remain private to the buyer and owner only where explicitly intended.','Which costs and gift-preparation fields are worth tracking?','docs/platform-roadmap/features/personal-gift-planner.md'),
('multiple-occasions','Multiple Occasions','Expand the family registry to birthdays and other events while retaining shared accounts and useful history.','high','high','',3,'idea',array['recipient-profiles'],null,'','Major redesign candidate; user expects to revisit after the 2026 holidays.','How should seasons, recipient lists, archive and gift history work?','docs/platform-roadmap/features/multiple-occasions.md'),
('secret-santa','Secret Santa Organizer','Organize participants, budgets and deadlines; privately distribute assignments with exclusions and wishlist links.','medium','medium','',3,'idea',array['multiple-occasions'],null,'','Concept only; assignment secrecy and valid draws need careful design.','How should withdrawals, redraws and prior-year exclusions work?','docs/platform-roadmap/features/secret-santa.md'),
('white-elephant-setup','White Elephant — Event Setup','Set up an exchange, invite participants, and configure house rules before play.','medium','medium','',3,'idea',array['multiple-occasions'],null,'','Future module concept. Do not treat rule defaults as final requirements.','Can guests join without accounts? Which event data should be retained?','docs/platform-roadmap/features/white-elephant-setup.md'),
('white-elephant-game','White Elephant — Interactive Game','Run a hybrid TV, host and player game with synchronized state, validated turns, and recovery controls.','medium','high','',4,'idea',array['white-elephant-setup'],null,'Game rules should be configurable in Administration where safe, including validated live edits.','Agreed concept: hybrid host and player experience; the host remains authoritative.','Which rules may change during play, and what requires a pause or host confirmation?','docs/platform-roadmap/features/white-elephant-game.md'),
('ai-gift-recommendations','AI Gift Recommendations','Explore optional gift suggestions using approved recipient preferences and current wishlist context.','low','high','',4,'idea',array['recipient-profiles','smarter-gift-discovery'],null,'','Use only approved data; clearly label generated ideas and avoid purchase claims.','Should recommendations call an external model, and what data may be shared?','docs/platform-roadmap/features/ai-gift-recommendations.md'),
('white-elephant-enhancements','White Elephant Enhancements','Potential live-game polish such as animations, sound, reactions, statistics and hosting tools.','low','medium','',4,'idea',array['white-elephant-game'], 'white-elephant-game','','Enhancements remain out of scope until the core live game is proven.','Which enhancements improve the room experience without distracting players?','docs/platform-roadmap/features/white-elephant-enhancements.md');

insert into wishlist_private.platform_roadmap_history(feature_id,actor_id,action,after_state)
select feature_id,null,'created',to_jsonb(f) from wishlist_private.platform_roadmap_features f;

create or replace function wishlist_private.get_administration() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor_role text; result jsonb;
begin
 actor_role=wishlist_private.member_role();
 if coalesce(actor_role,'') not in ('owner','editor') then raise exception 'Administration requires editor or owner access.' using errcode='42501'; end if;
 result=jsonb_build_object('account',jsonb_build_object('role',actor_role),'members',wishlist_private.editor_list_members());
 if actor_role='owner' then result=result||jsonb_build_object('gift_tracking',wishlist_private.admin_gift_tracking(),'platform_roadmap',wishlist_private.get_platform_roadmap());end if;
 return result;
end; $$;
notify pgrst,'reload schema';
