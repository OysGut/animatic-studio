-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0095: G-3 del 2, budsjettperioder i tidssone.
-- Ny fil; 0094 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0094.
-- Endrer ingen eksisterende data. apply_changes, delete_project og purge_* er UENDRET.
-- 1. private.user_time_zone / private.user_period_start: brukerens tidssone (profilen), ellers UTC.
-- 2. Kvotefunksjonene er kopiert ordrett fra siste definisjon (0063/0065/0024); eneste endring er at
--    UTC-månedsstarten er byttet med private.budget_period_start (arbeidsgruppens tidssone, ellers
--    eierens, ellers UTC) for prosjektbudsjettene, og private.user_time_zone for ai_spend (kontonivå).
-- 3. public.project_period_start / public.user_period_start: hjelpefunksjoner for server og klient,
--    så visning og kontroll bruker samme periodelengde som databasen.
-- =====================================================================================

create or replace function private.user_time_zone(p_user uuid) returns text
  language sql stable security definer set search_path = public, pg_catalog
as $$ select coalesce(
    (select pr.time_zone from public.profiles pr
      where pr.user_id = p_user and private.is_iana_time_zone(pr.time_zone)),
    'UTC') $$;

create or replace function private.user_period_start(p_user uuid, p_unit text, p_at timestamptz default now())
  returns timestamptz
  language plpgsql stable security definer set search_path = public, pg_catalog
as $$
declare v_tz text := private.user_time_zone(p_user);
begin
  if p_unit not in ('day', 'month') then raise exception 'budget_period_unit'; end if;
  return date_trunc(p_unit, p_at at time zone v_tz) at time zone v_tz;
end $$;

revoke all on function private.user_time_zone(uuid) from public, anon;
revoke all on function private.user_period_start(uuid, text, timestamptz) from public, anon;
grant execute on function private.user_time_zone(uuid) to service_role;
grant execute on function private.user_period_start(uuid, text, timestamptz) to service_role;

create or replace function public.project_period_start(p_project uuid, p_unit text) returns timestamptz
  language sql stable security definer set search_path = public, pg_catalog
as $$ select private.budget_period_start(p_project, p_unit, now()) $$;
revoke all on function public.project_period_start(uuid, text) from public, anon;
grant execute on function public.project_period_start(uuid, text) to authenticated, service_role;

create or replace function public.user_period_start(p_user uuid, p_unit text) returns timestamptz
  language plpgsql stable security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then raise exception 'not_self' using errcode = '42501'; end if;
  return private.user_period_start(p_user, p_unit, now());
end $$;
revoke all on function public.user_period_start(uuid, text) from public, anon;
grant execute on function public.user_period_start(uuid, text) to authenticated, service_role;

-- Lokal dato for periodestarten (ai_spend.month er en date i brukerens tidssone).
create or replace function public.user_period_start_date(p_user uuid, p_unit text) returns date
  language plpgsql stable security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user then raise exception 'not_self' using errcode = '42501'; end if;
  return date_trunc(p_unit, now() at time zone private.user_time_zone(p_user))::date;
end $$;
revoke all on function public.user_period_start_date(uuid, text) from public, anon;
grant execute on function public.user_period_start_date(uuid, text) to authenticated, service_role;

create or replace function private.guard_quality_profile_job() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_profile public.quality_profiles; v_used integer; v_limit integer; v_id uuid;
begin
  if TG_OP = 'UPDATE' and new.params->'qualityProfile' is distinct from old.params->'qualityProfile'
    and old.params->'qualityProfile' is not null and old.params->'qualityProfile' <> 'null'::jsonb then
    raise exception 'Quality profile snapshot is immutable' using errcode='22023';
  end if;
  if new.params->'qualityProfile' is null or new.params->'qualityProfile' = 'null'::jsonb
    or new.kind in ('text','prompt') then return new; end if;
  -- Existing reservations can finalize even after the profile is edited/removed.
  if TG_OP='UPDATE' and old.status <> 'failed' then return new; end if;
  perform 1 from public.projects where id=new.project_id and deleted_at is null for update;
  if not found then raise exception 'Project not found' using errcode='42501'; end if;
  v_id := (new.params->'qualityProfile'->>'id')::uuid;
  select * into v_profile from public.quality_profiles where id=v_id and project_id=new.project_id;
  if not found then raise exception 'Profile does not belong to project' using errcode='42501'; end if;
  if TG_OP = 'INSERT' then
    if v_profile.removed then raise exception 'Profile removed' using errcode='22023'; end if;
    if new.params->'qualityProfile' is distinct from jsonb_build_object('id',v_profile.id,'name',v_profile.name,'spec',v_profile.spec) then
      raise exception 'Profile changed; approve again' using errcode='22023';
    end if;
    new.params := new.params || jsonb_build_object('qualityProfileId',v_id);
  end if;
  v_limit := (v_profile.spec->>'budgetLimit')::integer;
  if v_limit is null or new.status='failed' then return new; end if;
  select count(*) into v_used from public.generation_jobs
    where project_id=new.project_id and id<>new.id and status<>'failed' and kind not in ('text','prompt')
    and params->'qualityProfile'->>'id'=v_id::text
    and created_at >= private.budget_period_start(new.project_id, 'month', now());
  if v_used+1 > v_limit then raise exception 'Quality profile monthly budget exceeded' using errcode='22023'; end if;
  return new;
end $$;

create or replace function public.create_dialogue_batch(p_project uuid, p_actor uuid, p_request uuid, p_character uuid, p_voice jsonb, p_items jsonb, p_key uuid, p_key_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_position integer := 0; v_limit integer; v_used integer;
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for update;
  if not found or private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select id into v_id from public.dialogue_batches where project_id = p_project and request_id = p_request;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 1000 then raise exception 'Invalid items' using errcode = '22023'; end if;
  if not exists(select 1 from public.assets where id=p_character and project_id=p_project and not removed and kind in ('character','animal','other')) then raise exception 'Invalid character' using errcode='22023'; end if;
  if jsonb_typeof(p_voice) <> 'object' or p_voice->>'provider' <> 'elevenlabs' or length(coalesce(p_voice->>'voiceId','')) not between 1 and 200 then raise exception 'Invalid voice' using errcode='22023'; end if;
  if not exists(select 1 from public.ai_provider_keys where id=p_key and user_id=p_key_owner and provider='elevenlabs' and status <> 'failed') then raise exception 'Invalid provider key' using errcode='42501'; end if;
  select ai_month_limit into v_limit from public.projects where id=p_project;
  select count(*) into v_used from public.generation_jobs where project_id=p_project and status <> 'failed' and kind not in ('text','prompt') and created_at >= private.budget_period_start(p_project, 'month', now());
  if v_limit is not null and v_used+jsonb_array_length(p_items)>v_limit then raise exception 'Project generation budget exceeded' using errcode='22023'; end if;
  v_id := gen_random_uuid();
  insert into public.dialogue_batches(id,project_id,request_id,character_id,voice,created_by) values(v_id,p_project,p_request,p_character,p_voice,p_actor);
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.script_blocks b join public.scene_occurrences o on o.variant_id = b.variant_id and o.project_id = b.project_id where b.id = (v_item->>'block_id')::uuid and o.id = (v_item->>'occurrence_id')::uuid and b.project_id = p_project and b.kind = 'dialogue' and not b.removed and o.active and b.current_rev = (v_item->>'script_revision')::integer) then raise exception 'Invalid line' using errcode = '22023'; end if;
    if length(coalesce(v_item->>'language','')) not between 2 and 100 or (v_item->>'cost')::numeric < 0 then raise exception 'Invalid estimate or language'; end if;
    insert into public.generation_jobs(id,project_id,kind,provider,model,prompt,status,created_by,cost_usd,params,provider_key_id,key_owner)
    values((v_item->>'job_id')::uuid,p_project,'sound','elevenlabs',coalesce(p_voice->>'modelId','eleven_v3'),'','queued',p_actor,(v_item->>'cost')::numeric,jsonb_build_object('kind','dialogue_batch','batchId',v_id,'blockId',v_item->>'block_id','language',v_item->>'language') || case when p_voice->'qualityProfile' is not null and p_voice->'qualityProfile'<>'null'::jsonb then jsonb_build_object('qualityProfile',p_voice->'qualityProfile') else '{}'::jsonb end,p_key,p_key_owner);
    insert into public.dialogue_batch_items(id,batch_id,project_id,job_id,occurrence_id,block_id,script_revision,language,position,variant_id,version_id,clip_id,dialogue_version_id,composition_id,command_id,created_by)
    values((v_item->>'id')::uuid,v_id,p_project,(v_item->>'job_id')::uuid,(v_item->>'occurrence_id')::uuid,(v_item->>'block_id')::uuid,(v_item->>'script_revision')::integer,v_item->>'language',v_position,(v_item->>'variant_id')::uuid,(v_item->>'version_id')::uuid,(v_item->>'clip_id')::uuid,(v_item->>'dialogue_version_id')::uuid,(v_item->>'composition_id')::uuid,(v_item->>'command_id')::uuid,p_actor);
    v_position := v_position + 1;
  end loop;
  return v_id;
end $$;

create or replace function public.create_harmonize_batch(p_project uuid, p_actor uuid, p_request uuid, p_style_profile uuid, p_reference_version uuid, p_provider text, p_model text, p_size text, p_quality_profile jsonb, p_items jsonb, p_key uuid, p_key_owner uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item jsonb; v_position integer := 0; v_limit integer; v_used integer;
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for update;
  if not found or private.member_role_rank(p_project,p_actor) < private.role_rank('editor') then raise exception 'Forbidden' using errcode = '42501'; end if;
  select id into v_id from public.harmonize_batches where project_id = p_project and request_id = p_request;
  if found then return v_id; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 200 then raise exception 'Invalid items' using errcode = '22023'; end if;
  if p_style_profile is null and p_reference_version is null then raise exception 'Invalid style source' using errcode = '22023'; end if;
  if p_style_profile is not null and not exists(select 1 from public.style_profiles where id = p_style_profile and project_id = p_project and not removed) then raise exception 'Invalid style profile' using errcode = '22023'; end if;
  if p_reference_version is not null and not exists(select 1 from public.asset_versions where id = p_reference_version and project_id = p_project and mime_type like 'image/%') then raise exception 'Invalid reference image' using errcode = '22023'; end if;
  if char_length(coalesce(p_provider,'')) not between 1 and 100 or char_length(coalesce(p_model,'')) not between 1 and 200 then raise exception 'Invalid model' using errcode = '22023'; end if;
  if p_key is null then
    if p_provider <> 'lovable' then raise exception 'Invalid provider key' using errcode = '42501'; end if;
  elsif not exists(select 1 from public.ai_provider_keys where id = p_key and user_id = p_key_owner and provider = p_provider and status <> 'failed') then raise exception 'Invalid provider key' using errcode = '42501'; end if;
  select ai_month_limit into v_limit from public.projects where id = p_project;
  select count(*) into v_used from public.generation_jobs where project_id = p_project and status <> 'failed' and kind not in ('text','prompt') and created_at >= private.budget_period_start(p_project, 'month', now());
  if v_limit is not null and v_used + jsonb_array_length(p_items) > v_limit then raise exception 'Project generation budget exceeded' using errcode = '22023'; end if;
  v_id := gen_random_uuid();
  insert into public.harmonize_batches(id,project_id,request_id,style_profile_id,reference_version_id,provider,model,size,created_by)
    values(v_id,p_project,p_request,p_style_profile,p_reference_version,p_provider,p_model,p_size,p_actor);
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists(select 1 from public.assets a where a.id = (v_item->>'asset_id')::uuid and a.project_id = p_project and not a.removed) then raise exception 'Invalid asset' using errcode = '22023'; end if;
    if not exists(select 1 from public.asset_versions v join public.asset_variants va on va.id = v.variant_id where v.id = (v_item->>'source_version_id')::uuid and v.project_id = p_project and va.asset_id = (v_item->>'asset_id')::uuid and v.mime_type like 'image/%') then raise exception 'Invalid source image' using errcode = '22023'; end if;
    if (v_item->>'cost')::numeric < 0 then raise exception 'Invalid estimate' using errcode = '22023'; end if;
    insert into public.generation_jobs(id,project_id,kind,provider,model,prompt,status,created_by,cost_usd,params,provider_key_id,key_owner)
    values((v_item->>'job_id')::uuid,p_project,'image',p_provider,p_model,'(stilharmonisering – beskrivelsen bygges når jobben kjøres)','queued',p_actor,(v_item->>'cost')::numeric,jsonb_build_object('kind','harmonize_batch','batchId',v_id,'assetId',v_item->>'asset_id','sourceVersionId',v_item->>'source_version_id') || case when p_quality_profile is not null and p_quality_profile <> 'null'::jsonb then jsonb_build_object('qualityProfile',p_quality_profile) else '{}'::jsonb end,p_key,p_key_owner);
    insert into public.harmonize_batch_items(id,batch_id,project_id,job_id,asset_id,source_version_id,position,variant_id,version_id,harmonization_id,command_id,created_by)
    values((v_item->>'id')::uuid,v_id,p_project,(v_item->>'job_id')::uuid,(v_item->>'asset_id')::uuid,(v_item->>'source_version_id')::uuid,v_position,(v_item->>'variant_id')::uuid,(v_item->>'version_id')::uuid,(v_item->>'harmonization_id')::uuid,(v_item->>'command_id')::uuid,p_actor);
    v_position := v_position + 1;
  end loop;
  return v_id;
end $$;

create or replace function private.keep_ai_spend()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('animatic.purge_project', true), '') <> ''
     and old.key_owner is not null and old.cost_usd is not null and old.status <> 'failed' then
    insert into public.ai_spend (key_owner, month, usd)
      values (old.key_owner, date_trunc('month', old.created_at at time zone private.user_time_zone(old.key_owner))::date, old.cost_usd)
      on conflict (key_owner, month) do update set usd = public.ai_spend.usd + excluded.usd;
  end if;
  return old;
end;
$$;

revoke all on function private.guard_quality_profile_job() from public,anon,authenticated;
revoke all on function public.create_dialogue_batch(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_dialogue_batch(uuid,uuid,uuid,uuid,jsonb,jsonb,uuid,uuid) to service_role;
revoke all on function public.create_harmonize_batch(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_harmonize_batch(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb,jsonb,uuid,uuid) to service_role;
revoke all on function private.keep_ai_spend() from public;

insert into public.schema_version (version, description)
  values (95, '0095_g3_budget_timezones: kvoter og budsjetter følger arbeidsgruppens/brukerens tidssone');
