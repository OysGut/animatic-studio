-- =====================================================================================
-- Animatic Studio – migrasjon 0029: slettede objekter, lydhastighet og «animer på toere» (DEC-0079).
-- Funn fra Mars' testrunde 13.10.2026:
-- 1. assets.removed og asset_versions.removed: «Slett» flytter en ressurs eller et bilde til «Slettede
--    objekter», der det kan hentes inn igjen eller slettes for godt. Bildeversjoner er ellers uforanderlige
--    (REQ-0136): bare `removed` og `revision` kan endres; selve bildet og dataene endres aldri.
-- 2. audio_clips.speed: hastighet 0,25–4 (25–400 %) for et lydklipp. 1 = uendret.
-- 3. compositions.step: «animer på toere/treere» (1 = hvert bilde, 2 = hvert annet …): bevegelsen
--    oppdateres bare hvert n-te bilde, som i stop motion, mens filmen beholder bildefrekvensen sin.
-- 4. purge_removed_assets: sletter slettede ressurser og bilder for godt (rader), når ingenting i filmen
--    bruker dem lenger. Returnerer filstiene, som serveren sletter fra lagringen etterpå (migrasjonen rører
--    ikke lagringen). AI-jobbloggen beholdes, men kobles fra ressursen.
-- Ingen eksisterende data endres (nye kolonner har standardverdier som betyr «som før»).
-- apply_changes er uendret: nye kolonner i kjente tabeller tas med automatisk (private.table_columns).
-- Kjøres ÉN gang i Lovable Cloud etter 0028. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Slettede objekter ----------
alter table public.assets add column if not exists removed boolean not null default false;
alter table public.asset_versions add column if not exists removed boolean not null default false;

-- En bildeversjon endres aldri – bortsett fra merket «slettet» (og revisjonen som følger med)
create or replace function private.protect_asset_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'removed' - 'revision') is distinct from (to_jsonb(old) - 'removed' - 'revision') then
    raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function private.protect_asset_version() from public;
drop trigger if exists asset_versions_immutable on public.asset_versions;
create trigger asset_versions_immutable before update on public.asset_versions
  for each row execute function private.protect_asset_version();

-- ---------- 2. Hastighet for lydklipp ----------
alter table public.audio_clips add column if not exists speed numeric not null default 1
  check (speed >= 0.25 and speed <= 4);

-- ---------- 3. Animer på toere ----------
alter table public.compositions add column if not exists step smallint not null default 1
  check (step between 1 and 4);

-- ---------- 4. Slett for godt ----------
-- p_assets: ressurser som er slettet (removed); p_versions: bilder som er slettet. Alt som fortsatt brukes
-- (lag, lyd, relasjoner, godkjent bilde), avvises med en forklaring – ingenting slettes da.
create or replace function public.purge_removed_assets(
  p_project uuid, p_actor uuid, p_assets uuid[], p_versions uuid[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_assets uuid[] := coalesce(p_assets, '{}');
  v_versions uuid[];
  v_paths text[];
begin
  perform 1 from public.projects where id = p_project and deleted_at is null for key share;
  if not found then
    raise exception 'Prosjektet er slettet' using errcode = '42501';
  end if;
  if private.member_role_rank(p_project, p_actor) < private.role_rank('editor') then
    raise exception 'Brukeren har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(v_assets) a where not exists (
      select 1 from public.assets x where x.id = a and x.project_id = p_project and x.removed)) then
    raise exception 'Bare slettede ressurser kan slettes for godt' using errcode = '22023';
  end if;
  -- Alle bilder i ressursene, pluss enkeltbilder som er slettet
  select coalesce(array_agg(distinct v.id), '{}') into v_versions from public.asset_versions v
    join public.asset_variants va on va.id = v.variant_id
    where v.project_id = p_project and (va.asset_id = any (v_assets) or v.id = any (coalesce(p_versions, '{}')));
  if exists (select 1 from unnest(coalesce(p_versions, '{}')) x where not exists (
      select 1 from public.asset_versions v where v.id = x and v.project_id = p_project and v.removed)) then
    raise exception 'Bare slettede bilder kan slettes for godt' using errcode = '22023';
  end if;
  if exists (select 1 from public.composition_layers l where l.project_id = p_project
             and (l.asset_id = any (v_assets) or l.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt i en 2D-scene (også et slettet lag kan angres). Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.audio_clips c where c.project_id = p_project
             and (c.asset_id = any (v_assets) or c.version_id = any (v_versions))) then
    raise exception 'Brukes fortsatt som lyd i filmen. Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.asset_relations r where r.project_id = p_project
             and (r.from_asset_id = any (v_assets) or r.to_asset_id = any (v_assets))) then
    raise exception 'Har fortsatt relasjoner i karakterkartet. Fjern dem først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.asset_variants va where va.project_id = p_project
             and va.approved_version_id = any (v_versions) and not (va.asset_id = any (v_assets))) then
    raise exception 'Et av bildene er godkjent. Godkjenn et annet bilde først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.posters p where p.project_id = p_project
             and exists (select 1 from unnest(v_assets || v_versions) x where p.document::text like '%' || x::text || '%')) then
    raise exception 'Brukes fortsatt på en plakat eller et karakterkart. Fjern bruken først.' using errcode = '23503';
  end if;
  if exists (select 1 from public.style_profiles sp where sp.project_id = p_project and not sp.removed
             and exists (select 1 from unnest(v_versions) x where sp.guide::text like '%' || x::text || '%')) then
    raise exception 'Er et forbildebilde i filmens visuelle stil. Fjern det der først.' using errcode = '23503';
  end if;

  select coalesce(array_agg(media_path), '{}') into v_paths from public.asset_versions where id = any (v_versions);
  -- AI-jobbloggen beholdes (kostnad og beskrivelse), men kobles fra ressursen som forsvinner
  update public.generation_jobs set asset_id = null where project_id = p_project and asset_id = any (v_assets);
  delete from public.continuity_events where project_id = p_project and asset_id = any (v_assets);
  update public.asset_variants set approved_version_id = null
    where project_id = p_project and approved_version_id = any (v_versions);
  delete from public.asset_versions where id = any (v_versions) and project_id = p_project;
  delete from public.asset_variants where project_id = p_project and asset_id = any (v_assets);
  delete from public.assets where id = any (v_assets) and project_id = p_project;
  return jsonb_build_object('paths', to_jsonb(v_paths), 'assets', cardinality(v_assets), 'versions', cardinality(v_versions));
end $$;
revoke all on function public.purge_removed_assets(uuid, uuid, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.purge_removed_assets(uuid, uuid, uuid[], uuid[]) to service_role;

insert into public.schema_version (version, description)
  values (29, '0029_trash_speed_step: slettede objekter, lydhastighet og animer på toere');
