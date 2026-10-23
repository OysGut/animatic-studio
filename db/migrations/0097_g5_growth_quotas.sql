-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0097: G-5 vekst og misbruk.
-- Ny fil; 0096 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0096.
-- 1. Endringslogg-oppbevaring: service_settings får change_log_retention_days (standard 90) og
--    change_log_max_rows (standard 20 000). public.prune_change_logs() sletter rader som både er
--    eldre enn fristen OG utenfor de nyeste N per prosjekt; gjeldende tilstand ligger i
--    domene­tabellene og project_snapshot (0093), så klienter som ligger etter får full innlasting
--    via G-2-reserven. private.protect_change_log er kopiert ordrett fra 0073 med ETT nytt unntak:
--    sletting når øktvariabelen animatic.prune_change_log = 'on' (settes bare av prune_change_logs).
--    Jobben eies av den eksisterende cron-adressen /api/public/cron/ai-jobs og av admin-knappen.
-- 2. Kvoter: public.usage_quotas (arbeidsgruppe ELLER bruker; null = ubegrenset per mål).
--    Håndheving i databasen: create_project (antall prosjekter, kopiert ordrett fra 0063 med
--    kvotesjekk lagt til), triggere på change_log (radtak), asset_versions og mobile_imports
--    (lagringsbyte og opplastinger per time). Feilkoder PTG11–PTG14 oversettes i klienten.
--    Admin leser og setter kvoter via admin_usage_quotas / admin_set_usage_quota /
--    admin_delete_usage_quota og oppbevaring via admin_set_change_log_retention /
--    admin_change_log_stats.
-- 3. film_shares.token: klartekst fjernes (testlenker kan gjøres ugyldige, jf. oppdraget). Nye
--    delinger har aldri klartekst (0070); oppslag og QR-gjenvisning bruker token_digest og den
--    avledede nøkkelen, så ingen kryptering trengs. Kolonnen merkes DEPRECATED.
-- 4. jsonb-tak: pg_column_size-sjekk på de 41 brukerstyrte jsonb-kolonnene som manglet tak
--    (de øvrige 55 hadde tak fra før). Takene er misbrukstak, ikke faglige grenser.
-- apply_changes, delete_project og purge_* er UENDRET (unntatt create_project, se pkt. 2).
-- =====================================================================================

-- ---------- 1a. Oppbevaring: innstillinger ----------
alter table public.service_settings
  add column if not exists change_log_retention_days integer not null default 90
    check (change_log_retention_days between 1 and 3650),
  add column if not exists change_log_max_rows integer not null default 20000
    check (change_log_max_rows between 100 and 10000000);

-- Kopiert ordrett fra 0073; eneste tillegg er DELETE-unntaket under en godkjent rydding.
create or replace function private.protect_change_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.purging(to_jsonb(old) ->> 'project_id') then
    return old;
  end if;
  if tg_op = 'DELETE' and current_setting('animatic.prune_change_log', true) = 'on' then
    return old;
  end if;
  if tg_op = 'UPDATE' and old.scene_ids is null
     and (to_jsonb(new) - 'scene_ids') = (to_jsonb(old) - 'scene_ids') then
    return new;
  end if;
  raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
end $$;
revoke all on function private.protect_change_log() from public;

-- ---------- 1b. Rydding (service_role fra cron, eller administrator) ----------
create or replace function public.prune_change_logs()
returns table (project_id uuid, removed bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_days integer;
  v_max integer;
  v_proj uuid;
  v_removed bigint;
begin
  if (select auth.uid()) is not null and not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  select s.change_log_retention_days, s.change_log_max_rows into v_days, v_max
    from public.service_settings s where s.id;
  set local animatic.prune_change_log = 'on';
  for v_proj in select c.project_id from public.change_log c group by c.project_id
  loop
    delete from public.change_log c
    where c.project_id = v_proj
      and c.project_seq is not null
      and c.created_at < pg_catalog.now() - pg_catalog.make_interval(days => v_days)
      and c.project_seq <= (select pg_catalog.max(c2.project_seq) - v_max
                            from public.change_log c2 where c2.project_id = v_proj);
    get diagnostics v_removed = row_count;
    if v_removed > 0 then
      project_id := v_proj;
      removed := v_removed;
      return next;
    end if;
  end loop;
  return;
end $$;
revoke all on function public.prune_change_logs() from public, anon;
grant execute on function public.prune_change_logs() to authenticated, service_role;

create or replace function public.admin_set_change_log_retention(p_days integer, p_max_rows integer)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 3650
     or p_max_rows is null or p_max_rows not between 100 and 10000000 then
    raise exception 'Ugyldige verdier' using errcode = '22023';
  end if;
  update public.service_settings
    set change_log_retention_days = p_days, change_log_max_rows = p_max_rows,
        changed_at = pg_catalog.now(), changed_by = (select auth.uid())
    where id;
end $$;
revoke all on function public.admin_set_change_log_retention(integer, integer) from public, anon;
grant execute on function public.admin_set_change_log_retention(integer, integer) to authenticated;

create or replace function public.admin_change_log_stats()
returns table (project_id uuid, project_name text, rows bigint, oldest_at timestamptz,
               newest_at timestamptz, total_bytes bigint, retention_days integer, max_rows integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return query
    select c.project_id, p.name, count(*)::bigint, pg_catalog.min(c.created_at),
           pg_catalog.max(c.created_at),
           pg_catalog.sum(pg_column_size(c.command) + coalesce(pg_column_size(c.inverse), 0))::bigint,
           s.change_log_retention_days, s.change_log_max_rows
    from public.change_log c
    join public.projects p on p.id = c.project_id
    cross join public.service_settings s
    where s.id
    group by c.project_id, p.name, s.change_log_retention_days, s.change_log_max_rows
    order by count(*) desc;
end $$;
revoke all on function public.admin_change_log_stats() from public, anon;
grant execute on function public.admin_change_log_stats() to authenticated;

-- ---------- 2a. Kvotetabell ----------
create table public.usage_quotas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid,
  max_storage_bytes bigint check (max_storage_bytes is null or max_storage_bytes >= 0),
  max_projects integer check (max_projects is null or max_projects between 0 and 100000),
  max_change_log_rows integer check (max_change_log_rows is null or max_change_log_rows between 100 and 10000000),
  max_uploads_per_hour integer check (max_uploads_per_hour is null or max_uploads_per_hour between 1 and 1000000),
  set_by uuid,
  updated_at timestamptz not null default pg_catalog.now(),
  check (pg_catalog.num_nonnulls(workspace_id, user_id) = 1)
);
create unique index usage_quotas_workspace_key on public.usage_quotas (workspace_id) where workspace_id is not null;
create unique index usage_quotas_user_key on public.usage_quotas (user_id) where user_id is not null;
comment on table public.usage_quotas is 'G-5: brukskvoter per arbeidsgruppe eller per bruker uten arbeidsgruppe. null = ubegrenset. Skrives bare av administrator.';
revoke all on public.usage_quotas from public, anon, authenticated;
grant all on public.usage_quotas to service_role;
alter table public.usage_quotas enable row level security;
-- Ingen policyer: klienter når tabellen bare gjennom admin-funksjonene.

-- Omfanget et prosjekt teller under: arbeidsgruppen, ellers eieren.
create or replace function private.quota_scope(p_project uuid, out workspace_id uuid, out user_id uuid)
language sql stable security definer set search_path = '' as $$
  select p.workspace_id, case when p.workspace_id is null then p.created_by end
  from public.projects p where p.id = p_project
$$;
revoke all on function private.quota_scope(uuid) from public, anon, authenticated;
grant execute on function private.quota_scope(uuid) to service_role;

-- ---------- 2b. Håndheving: prosjektantall (create_project kopiert ordrett fra 0063 + kvotesjekk) ----------
create or replace function public.create_project(p_name text, p_fps_num integer default 25, p_fps_den integer default 1)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_project uuid := gen_random_uuid();
  v_main uuid := gen_random_uuid();
  v_draft uuid := gen_random_uuid();
  v_limit integer;
  v_count bigint;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select q.max_projects into v_limit from public.usage_quotas q where q.user_id = v_user;
  if v_limit is not null then
    select count(*) into v_count from public.projects p
      where p.created_by = v_user and p.deleted_at is null;
    if v_count >= v_limit then
      raise exception 'Kvote for antall prosjekter er nådd' using errcode = 'PTG11';
    end if;
  end if;
  insert into public.projects (id, name, fps_num, fps_den, created_by, active_quality_profile_id) values (v_project, btrim(p_name), p_fps_num, p_fps_den, v_user, v_draft);
  insert into public.project_members (project_id, user_id, role, can_approve_costs) values (v_project, v_user, 'owner', true);
  insert into public.productions (id, project_id, kind, name, fps_num, fps_den, created_by)
    values (v_main, v_project, 'main', 'Hovedfilm', p_fps_num, p_fps_den, v_user);
  insert into public.quality_profiles (id, project_id, name, spec, created_by) values
    (v_draft, v_project, 'Utkast', '{"effort":"fast","variants":1,"resolution":"1K","export":{"format":"mp4","bitrateKbps":4000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Gjennomgang', '{"effort":"balanced","variants":2,"resolution":"2K","export":{"format":"mp4","bitrateKbps":8000}}'::jsonb, v_user),
    (gen_random_uuid(), v_project, 'Endelig', '{"effort":"premium","variants":2,"resolution":"4K","export":{"format":"mp4","bitrateKbps":16000}}'::jsonb, v_user);
  insert into public.change_log (id, project_id, actor, command_type, command, affected_ids)
    values (gen_random_uuid(), v_project, v_user, 'CreateProject',
            jsonb_build_object('name', btrim(p_name), 'mainProductionId', v_main), array[v_project, v_main]);
  return v_project;
end $$;
revoke all on function public.create_project(text, integer, integer) from public, anon;
grant execute on function public.create_project(text, integer, integer) to authenticated;

-- ---------- 2c. Håndheving: rader i change_log ----------
create or replace function private.check_quota_change_log() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_user uuid;
  v_limit integer;
  v_count bigint;
begin
  select s.workspace_id, s.user_id into v_ws, v_user from private.quota_scope(new.project_id) s;
  select q.max_change_log_rows into v_limit from public.usage_quotas q
    where (v_ws is not null and q.workspace_id = v_ws)
       or (v_ws is null and q.user_id is not null and q.user_id = v_user)
    limit 1;
  if v_limit is null then return new; end if;
  select count(*) into v_count
    from public.change_log c join public.projects p on p.id = c.project_id
    where (v_ws is not null and p.workspace_id = v_ws)
       or (v_ws is null and p.workspace_id is null and p.created_by = v_user);
  if v_count >= v_limit then
    raise exception 'Kvote for endringsloggen er nådd' using errcode = 'PTG12';
  end if;
  return new;
end $$;
revoke all on function private.check_quota_change_log() from public;
create trigger change_log_quota before insert on public.change_log
  for each row execute function private.check_quota_change_log();

-- ---------- 2d. Håndheving: lagringsbyte og opplastinger per time ----------
create or replace function private.check_quota_upload(p_project uuid, p_bytes bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_user uuid;
  v_max_bytes bigint;
  v_max_uploads integer;
  v_used bigint;
  v_uploads bigint;
begin
  select s.workspace_id, s.user_id into v_ws, v_user from private.quota_scope(p_project) s;
  select q.max_storage_bytes, q.max_uploads_per_hour into v_max_bytes, v_max_uploads
    from public.usage_quotas q
    where (v_ws is not null and q.workspace_id = v_ws)
       or (v_ws is null and q.user_id is not null and q.user_id = v_user)
    limit 1;
  if v_max_bytes is null and v_max_uploads is null then return; end if;
  if v_max_bytes is not null then
    select (select coalesce(pg_catalog.sum(av.byte_size_big), 0)
              from public.asset_versions av join public.projects p on p.id = av.project_id
              where not av.removed
                and ((v_ws is not null and p.workspace_id = v_ws)
                  or (v_ws is null and p.workspace_id is null and p.created_by = v_user)))
         + (select coalesce(pg_catalog.sum(m.byte_size), 0)
              from public.mobile_imports m join public.projects p on p.id = m.project_id
              where (v_ws is not null and p.workspace_id = v_ws)
                 or (v_ws is null and p.workspace_id is null and p.created_by = v_user))
      into v_used;
    if v_used + coalesce(p_bytes, 0) > v_max_bytes then
      raise exception 'Lagringskvoten er nådd' using errcode = 'PTG13';
    end if;
  end if;
  if v_max_uploads is not null then
    select (select count(*) from public.asset_versions av join public.projects p on p.id = av.project_id
              where av.created_at > pg_catalog.now() - interval '1 hour'
                and ((v_ws is not null and p.workspace_id = v_ws)
                  or (v_ws is null and p.workspace_id is null and p.created_by = v_user)))
         + (select count(*) from public.mobile_imports m join public.projects p on p.id = m.project_id
              where m.created_at > pg_catalog.now() - interval '1 hour'
                and ((v_ws is not null and p.workspace_id = v_ws)
                  or (v_ws is null and p.workspace_id is null and p.created_by = v_user)))
      into v_uploads;
    if v_uploads >= v_max_uploads then
      raise exception 'For mange opplastinger den siste timen' using errcode = 'PTG14';
    end if;
  end if;
end $$;
revoke all on function private.check_quota_upload(uuid, bigint) from public, anon, authenticated;
grant execute on function private.check_quota_upload(uuid, bigint) to service_role;

create or replace function private.check_quota_asset_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_quota_upload(new.project_id, coalesce(new.byte_size_big, new.byte_size, 0)::bigint);
  return new;
end $$;
revoke all on function private.check_quota_asset_version() from public;
create trigger asset_versions_quota before insert on public.asset_versions
  for each row execute function private.check_quota_asset_version();

create or replace function private.check_quota_mobile_import() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_quota_upload(new.project_id, new.byte_size);
  return new;
end $$;
revoke all on function private.check_quota_mobile_import() from public;
create trigger mobile_imports_quota before insert on public.mobile_imports
  for each row execute function private.check_quota_mobile_import();

-- ---------- 2e. Admin: lese og sette kvoter ----------
create or replace function public.admin_set_usage_quota(
  p_workspace_id uuid default null,
  p_user_id uuid default null,
  p_max_storage_bytes bigint default null,
  p_max_projects integer default null,
  p_max_change_log_rows integer default null,
  p_max_uploads_per_hour integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if pg_catalog.num_nonnulls(p_workspace_id, p_user_id) <> 1 then
    raise exception 'Nøyaktig ett omfang (arbeidsgruppe eller bruker)' using errcode = '22023';
  end if;
  if p_workspace_id is not null and not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'Ukjent arbeidsgruppe' using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'Ukjent bruker' using errcode = '22023';
  end if;
  insert into public.usage_quotas
    (workspace_id, user_id, max_storage_bytes, max_projects, max_change_log_rows, max_uploads_per_hour, set_by, updated_at)
  values
    (p_workspace_id, p_user_id, p_max_storage_bytes, p_max_projects, p_max_change_log_rows, p_max_uploads_per_hour,
     (select auth.uid()), pg_catalog.now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    update public.usage_quotas q
      set max_storage_bytes = p_max_storage_bytes, max_projects = p_max_projects,
          max_change_log_rows = p_max_change_log_rows, max_uploads_per_hour = p_max_uploads_per_hour,
          set_by = (select auth.uid()), updated_at = pg_catalog.now()
      where (p_workspace_id is not null and q.workspace_id = p_workspace_id)
         or (p_user_id is not null and q.user_id = p_user_id)
    returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.admin_set_usage_quota(uuid, uuid, bigint, integer, integer, integer) from public, anon;
grant execute on function public.admin_set_usage_quota(uuid, uuid, bigint, integer, integer, integer) to authenticated;

create or replace function public.admin_delete_usage_quota(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  delete from public.usage_quotas q where q.id = p_id;
end $$;
revoke all on function public.admin_delete_usage_quota(uuid) from public, anon;
grant execute on function public.admin_delete_usage_quota(uuid) to authenticated;

create or replace function public.admin_usage_quotas()
returns table (quota_id uuid, workspace_id uuid, workspace_name text, user_id uuid, email text,
               max_storage_bytes bigint, max_projects integer, max_change_log_rows integer,
               max_uploads_per_hour integer, used_storage_bytes bigint, used_projects bigint,
               used_change_log_rows bigint, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return query
    select q.id, q.workspace_id, w.name, q.user_id, u.email::text,
           q.max_storage_bytes, q.max_projects, q.max_change_log_rows, q.max_uploads_per_hour,
           ((select coalesce(pg_catalog.sum(av.byte_size_big), 0)
               from public.asset_versions av join public.projects p on p.id = av.project_id
               where not av.removed and private.quota_in_scope(p.workspace_id, p.created_by, q.workspace_id, q.user_id))
          + (select coalesce(pg_catalog.sum(m.byte_size), 0)
               from public.mobile_imports m join public.projects p on p.id = m.project_id
               where private.quota_in_scope(p.workspace_id, p.created_by, q.workspace_id, q.user_id)))::bigint,
           (select count(*) from public.projects p
              where p.deleted_at is null
                and private.quota_in_scope(p.workspace_id, p.created_by, q.workspace_id, q.user_id))::bigint,
           (select count(*) from public.change_log c join public.projects p on p.id = c.project_id
              where private.quota_in_scope(p.workspace_id, p.created_by, q.workspace_id, q.user_id))::bigint,
           q.updated_at
    from public.usage_quotas q
    left join public.workspaces w on w.id = q.workspace_id
    left join auth.users u on u.id = q.user_id
    order by q.updated_at desc;
end $$;
revoke all on function public.admin_usage_quotas() from public, anon;
grant execute on function public.admin_usage_quotas() to authenticated;

-- Hjelper: hører prosjektet (workspace_id/created_by) til kvoteomfanget?
create or replace function private.quota_in_scope(p_project_ws uuid, p_owner uuid, q_ws uuid, q_user uuid)
returns boolean
language sql immutable set search_path = '' as $$
  select (q_ws is not null and p_project_ws = q_ws)
      or (q_ws is null and q_user is not null and p_project_ws is null and p_owner = q_user)
$$;
revoke all on function private.quota_in_scope(uuid, uuid, uuid, uuid) from public;

-- ---------- 3. Delingslenker: fjern klartekstnøkler (0070 lagrer aldri nye) ----------
update public.film_shares set token = null where token is not null;
comment on column public.film_shares.token is
  'DEPRECATED: klartekst lagres aldri (0070); fjernet i 0097. Oppslag via token_digest; QR vises med avledet nøkkel.';

-- ---------- 4. Tak på brukerstyrte jsonb-kolonner uten tak ----------
-- 4 MB: hele manusøyeblikksbilder
alter table public.script_versions add constraint script_versions_snapshot_g5cap
  check (pg_column_size(snapshot) <= 4194304) not valid;
alter table public.script_versions validate constraint script_versions_snapshot_g5cap;
-- 1 MB: store kommando- og spesifikasjonsfelt
alter table public.change_log add constraint change_log_command_g5cap
  check (pg_column_size(command) <= 1048576) not valid;
alter table public.change_log validate constraint change_log_command_g5cap;
alter table public.change_log add constraint change_log_inverse_g5cap
  check (inverse is null or pg_column_size(inverse) <= 1048576) not valid;
alter table public.change_log validate constraint change_log_inverse_g5cap;
alter table public.story_sessions add constraint story_sessions_turns_g5cap
  check (pg_column_size(turns) <= 1048576) not valid;
alter table public.story_sessions validate constraint story_sessions_turns_g5cap;
alter table public.assets add constraint assets_brief_versions_g5cap
  check (pg_column_size(brief_versions) <= 1048576) not valid;
alter table public.assets validate constraint assets_brief_versions_g5cap;
alter table public.animation_patterns add constraint animation_patterns_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.animation_patterns validate constraint animation_patterns_spec_g5cap;
alter table public.animation_rig_versions add constraint animation_rig_versions_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.animation_rig_versions validate constraint animation_rig_versions_spec_g5cap;
alter table public.animation_uses add constraint animation_uses_behavior_g5cap
  check (pg_column_size(behavior) <= 1048576) not valid;
alter table public.animation_uses validate constraint animation_uses_behavior_g5cap;
alter table public.global_animation_specs add constraint global_animation_specs_patterns_g5cap
  check (pg_column_size(patterns) <= 1048576) not valid;
alter table public.global_animation_specs validate constraint global_animation_specs_patterns_g5cap;
alter table public.global_animation_specs add constraint global_animation_specs_rig_spec_g5cap
  check (pg_column_size(rig_spec) <= 1048576) not valid;
alter table public.global_animation_specs validate constraint global_animation_specs_rig_spec_g5cap;
alter table public.lipsync_results add constraint lipsync_results_spans_g5cap
  check (pg_column_size(spans) <= 1048576) not valid;
alter table public.lipsync_results validate constraint lipsync_results_spans_g5cap;
alter table public.mouth_sets add constraint mouth_sets_variants_g5cap
  check (pg_column_size(variants) <= 1048576) not valid;
alter table public.mouth_sets validate constraint mouth_sets_variants_g5cap;
alter table public.mouth_tracks add constraint mouth_tracks_source_g5cap
  check (pg_column_size(source) <= 1048576) not valid;
alter table public.mouth_tracks validate constraint mouth_tracks_source_g5cap;
alter table public.mouth_tracks add constraint mouth_tracks_spans_g5cap
  check (pg_column_size(spans) <= 1048576) not valid;
alter table public.mouth_tracks validate constraint mouth_tracks_spans_g5cap;
alter table public.measure_sets add constraint measure_sets_markers_g5cap
  check (pg_column_size(markers) <= 1048576) not valid;
alter table public.measure_sets validate constraint measure_sets_markers_g5cap;
alter table public.takes add constraint takes_metadata_g5cap
  check (pg_column_size(metadata) <= 1048576) not valid;
alter table public.takes validate constraint takes_metadata_g5cap;
alter table public.takes add constraint takes_produced_from_g5cap
  check (produced_from is null or pg_column_size(produced_from) <= 1048576) not valid;
alter table public.takes validate constraint takes_produced_from_g5cap;
alter table public.showcase_reservations add constraint showcase_reservations_payload_g5cap
  check (pg_column_size(payload) <= 1048576) not valid;
alter table public.showcase_reservations validate constraint showcase_reservations_payload_g5cap;
alter table public.publications add constraint publications_scope_ref_g5cap
  check (scope_ref is null or pg_column_size(scope_ref) <= 1048576) not valid;
alter table public.publications validate constraint publications_scope_ref_g5cap;
alter table public.global_rig_templates add constraint global_rig_templates_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.global_rig_templates validate constraint global_rig_templates_spec_g5cap;
alter table public.quality_profiles add constraint quality_profiles_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.quality_profiles validate constraint quality_profiles_spec_g5cap;
alter table public.rig_setups add constraint rig_setups_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.rig_setups validate constraint rig_setups_spec_g5cap;
alter table public.rig_templates add constraint rig_templates_spec_g5cap
  check (pg_column_size(spec) <= 1048576) not valid;
alter table public.rig_templates validate constraint rig_templates_spec_g5cap;
alter table public.asset_versions add constraint asset_versions_derived_files_g5cap
  check (derived_files is null or pg_column_size(derived_files) <= 1048576) not valid;
alter table public.asset_versions validate constraint asset_versions_derived_files_g5cap;
alter table public.global_asset_versions add constraint global_asset_versions_derived_files_g5cap
  check (derived_files is null or pg_column_size(derived_files) <= 1048576) not valid;
alter table public.global_asset_versions validate constraint global_asset_versions_derived_files_g5cap;
-- 64 KB: små styringsfelt
alter table public.asset_versions add constraint asset_versions_rights_g5cap
  check (rights is null or pg_column_size(rights) <= 65536) not valid;
alter table public.asset_versions validate constraint asset_versions_rights_g5cap;
alter table public.assets add constraint assets_tags_g5cap
  check (pg_column_size(tags) <= 65536) not valid;
alter table public.assets validate constraint assets_tags_g5cap;
alter table public.audio_clips add constraint audio_clips_volume_keys_g5cap
  check (volume_keys is null or pg_column_size(volume_keys) <= 65536) not valid;
alter table public.audio_clips validate constraint audio_clips_volume_keys_g5cap;
alter table public.composition_layers add constraint composition_layers_anchor_g5cap
  check (anchor is null or pg_column_size(anchor) <= 65536) not valid;
alter table public.composition_layers validate constraint composition_layers_anchor_g5cap;
alter table public.composition_layers add constraint composition_layers_page_transition_g5cap
  check (page_transition is null or pg_column_size(page_transition) <= 65536) not valid;
alter table public.composition_layers validate constraint composition_layers_page_transition_g5cap;
alter table public.composition_layers add constraint composition_layers_transform_g5cap
  check (pg_column_size(transform) <= 65536) not valid;
alter table public.composition_layers validate constraint composition_layers_transform_g5cap;
alter table public.dialogue_versions add constraint dialogue_versions_settings_g5cap
  check (settings is null or pg_column_size(settings) <= 65536) not valid;
alter table public.dialogue_versions validate constraint dialogue_versions_settings_g5cap;
alter table public.dialogue_versions add constraint dialogue_versions_volume_keys_g5cap
  check (volume_keys is null or pg_column_size(volume_keys) <= 65536) not valid;
alter table public.dialogue_versions validate constraint dialogue_versions_volume_keys_g5cap;
alter table public.duration_estimates add constraint duration_estimates_assumptions_g5cap
  check (assumptions is null or pg_column_size(assumptions) <= 65536) not valid;
alter table public.duration_estimates validate constraint duration_estimates_assumptions_g5cap;
alter table public.lipsync_results add constraint lipsync_results_overrides_g5cap
  check (overrides is null or pg_column_size(overrides) <= 65536) not valid;
alter table public.lipsync_results validate constraint lipsync_results_overrides_g5cap;
alter table public.print_jobs add constraint print_jobs_settings_g5cap
  check (pg_column_size(settings) <= 65536) not valid;
alter table public.print_jobs validate constraint print_jobs_settings_g5cap;
alter table public.profiles add constraint profiles_profile_fields_g5cap
  check (profile_fields is null or pg_column_size(profile_fields) <= 65536) not valid;
alter table public.profiles validate constraint profiles_profile_fields_g5cap;
alter table public.projects add constraint projects_duration_assumptions_g5cap
  check (duration_assumptions is null or pg_column_size(duration_assumptions) <= 65536) not valid;
alter table public.projects validate constraint projects_duration_assumptions_g5cap;
alter table public.review_comments add constraint review_comments_region_g5cap
  check (region is null or pg_column_size(region) <= 65536) not valid;
alter table public.review_comments validate constraint review_comments_region_g5cap;
alter table public.script_blocks add constraint script_blocks_source_ref_g5cap
  check (source_ref is null or pg_column_size(source_ref) <= 65536) not valid;
alter table public.script_blocks validate constraint script_blocks_source_ref_g5cap;
alter table public.storage_cleanups add constraint storage_cleanups_paths_g5cap
  check (pg_column_size(paths) <= 65536) not valid;
alter table public.storage_cleanups validate constraint storage_cleanups_paths_g5cap;
alter table public.user_bookmarks add constraint user_bookmarks_target_g5cap
  check (pg_column_size(target) <= 65536) not valid;
alter table public.user_bookmarks validate constraint user_bookmarks_target_g5cap;

insert into public.schema_version (version, description) values
  (97, '0097_g5_growth_quotas: change_log-oppbevaring og rydding, brukskvoter med håndheving, film_shares uten klartekst, jsonb-tak');
