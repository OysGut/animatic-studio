-- =====================================================================================
-- Animatic Studio – migrasjon 0011: slette og forlate prosjekt (DEC-0046), importert film og overganger
-- (M4 del 3, DEC-0047).
-- 1. Sletting av prosjekt: projects.deleted_at/deleted_by. public.delete_project (bare service_role, kalt
--    fra serverfunksjonen etter kontroll av eier og bekreftelse) sletter alt innhold i prosjektet unntatt
--    ressursene (assets, asset_variants, asset_versions) og loggen over AI-generering. Andre medlemmer
--    mister tilgangen; eierne beholder den, så ressursene kan lastes ned eller slettes for godt med
--    public.purge_project_assets (egen operasjon). Takes og historikk er ellers vernet mot sletting
--    (INV-07, INV-13); vernet slippes bare i transaksjonen som sletter hele prosjektet.
-- 2. Et slettet prosjekt kan ikke endres: private.member_role_rank gir 0 for slettede prosjekter, så
--    apply_changes, opplasting og invitasjoner avvises der.
-- 3. public.leave_project: et medlem forlater prosjektet (en eier bare hvis det finnes en annen eier).
-- 4. takes.metadata (importert film: filnavn, format, oppløsning, bildefrekvens, lengde) og
--    scene_occurrences.transition_kind/transition_frames (overgang inn i scenen: kutt, overtoning, via svart).
-- Ingen SQL mot lagringen (storage); filene slettes av serverfunksjonen. Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0010. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.projects add column if not exists deleted_at timestamptz;
alter table public.projects add column if not exists deleted_by uuid references auth.users (id);

alter table public.takes add column if not exists metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(metadata) = 'object' and length(metadata::text) <= 4000);
-- Filen til en versjon må ligge i prosjektets egen mappe (gjelder nye og endrede rader)
alter table public.takes add constraint takes_media_ref_in_project
  check (media_ref is null or (split_part(media_ref, '/', 1) = project_id::text and position('..' in media_ref) = 0)) not valid;

alter table public.scene_occurrences add column if not exists transition_kind text not null default 'cut'
  check (transition_kind in ('cut', 'dissolve', 'dip'));
alter table public.scene_occurrences add column if not exists transition_frames integer not null default 0
  check (transition_frames between 0 and 600);

-- ---------- Vernet mot sletting slippes bare under sletting av hele prosjektet ----------
create or replace function private.purging(p_project text) returns boolean
language sql stable set search_path = '' as $$
  select p_project is not null and coalesce(current_setting('animatic.purge_project', true), '') = p_project
$$;

create or replace function private.protect_takes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if private.purging(old.project_id::text) then return old; end if;
    raise exception 'Produsert materiale kan ikke slettes (INV-07)' using errcode = 'P0001';
  end if;
  if new.occurrence_id <> old.occurrence_id or new.produced_from <> old.produced_from
     or new.media_ref is distinct from old.media_ref or new.kind <> old.kind
     or new.metadata <> old.metadata then
    raise exception 'Produsert materiale kan ikke overskrives (INV-07)' using errcode = 'P0001';
  end if;
  return new;
end $$;

create or replace function private.protect_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.purging(to_jsonb(old) ->> 'project_id') then
    return old;
  end if;
  raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
end $$;

-- ---------- Ingen skriving i slettede prosjekter ----------
create or replace function private.member_role_rank(p_project uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.projects p where p.id = p_project and p.deleted_at is not null)
    then 0
    else (select coalesce(max(private.role_rank(m.role)), 0) from public.project_members m
          where m.project_id = p_project and m.user_id = p_user and m.removed_at is null)
  end
$$;

create or replace function private.is_active_owner(p_project uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = p_user and m.role = 'owner' and m.removed_at is null
  )
$$;

-- ---------- Slett prosjekt (innholdet; ressursene blir liggende) ----------
create or replace function public.delete_project(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sources text[];
  v_films text[];
  v_removed integer;
begin
  -- Lås prosjektraden: skriving som pågår (holder nøkkellås via fremmednøkler) blir ferdig først,
  -- og innholdet den lagret, slettes med resten
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is null) then
    raise exception 'Prosjektet finnes ikke eller er allerede slettet' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette prosjektet' using errcode = '42501';
  end if;
  -- Filene i lagringen slettes av serverfunksjonen etterpå
  select coalesce(array_agg(storage_key), '{}') into v_sources
    from public.imported_documents where project_id = p_project;
  select coalesce(array_agg(media_ref), '{}') into v_films
    from public.takes where project_id = p_project and media_ref is not null
      and split_part(media_ref, '/', 1) = p_project::text;

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Rekkefølge etter fremmednøkler (barn først)
  delete from public.audio_clips where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  delete from public.scenes where project_id = p_project;
  delete from public.imported_documents where project_id = p_project;
  delete from public.script_versions where project_id = p_project;
  delete from public.productions where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  perform set_config('animatic.purge_project', '', true);

  update public.project_members set removed_at = now()
    where project_id = p_project and role <> 'owner' and removed_at is null;
  get diagnostics v_removed = row_count;
  update public.projects set deleted_at = now(), deleted_by = p_actor where id = p_project;
  return jsonb_build_object('sources', to_jsonb(v_sources), 'films', to_jsonb(v_films), 'removed_members', v_removed);
end $$;
revoke all on function public.delete_project(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_project(uuid, uuid) to service_role;

-- ---------- Slett ressursene i et slettet prosjekt for godt (egen operasjon) ----------
create or replace function public.purge_project_assets(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is not null) then
    raise exception 'Prosjektet må være slettet før ressursene kan slettes' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette ressursene' using errcode = '42501';
  end if;
  select coalesce(array_agg(p), '{}') into v_paths from (
    select media_path as p from public.asset_versions where project_id = p_project
    union select result_path from public.generation_jobs where project_id = p_project and result_path is not null
  ) x;

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Innhold som ble lagret samtidig med slettingen av prosjektet, fjernes også her
  delete from public.audio_clips where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  delete from public.scenes where project_id = p_project;
  delete from public.imported_documents where project_id = p_project;
  delete from public.script_versions where project_id = p_project;
  delete from public.productions where project_id = p_project;
  delete from public.generation_jobs where project_id = p_project;
  update public.asset_variants set approved_version_id = null where project_id = p_project;
  delete from public.asset_versions where project_id = p_project;
  delete from public.asset_variants where project_id = p_project;
  delete from public.assets where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  delete from public.project_members where project_id = p_project;
  delete from public.projects where id = p_project;
  perform set_config('animatic.purge_project', '', true);
  return jsonb_build_object('paths', to_jsonb(v_paths));
end $$;
revoke all on function public.purge_project_assets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_project_assets(uuid, uuid) to service_role;

-- ---------- Forlat prosjekt ----------
create or replace function public.leave_project(p_project uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select role into v_role from public.project_members
    where project_id = p_project and user_id = v_user and removed_at is null;
  if v_role is null then
    raise exception 'Du er ikke medlem av prosjektet' using errcode = '22023';
  end if;
  if v_role = 'owner' and not exists (
    select 1 from public.project_members
    where project_id = p_project and role = 'owner' and removed_at is null and user_id <> v_user
  ) then
    raise exception 'Prosjektets eneste eier kan ikke forlate det. Slett prosjektet, eller gjør en annen til eier først.'
      using errcode = '42501';
  end if;
  update public.project_members set removed_at = now()
    where project_id = p_project and user_id = v_user;
end $$;
revoke all on function public.leave_project(uuid) from public, anon;
grant execute on function public.leave_project(uuid) to authenticated;

insert into public.schema_version (version, description) values (11, '0011_project_delete_film: slette og forlate prosjekt, importert film, overganger');
