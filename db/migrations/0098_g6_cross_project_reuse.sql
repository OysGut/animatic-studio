-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0098: G-6 gjenbruk på tvers av prosjekter.
-- Ny fil; 0097 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0097.
-- 1. Globale karakterer: public.global_character_bundles – et uforanderlig, versjonert knippe per global
--    ressurs av kind='character' (0046): stemmeprofil (assets.voice), faktaark med tekstversjoner
--    (assets.brief_versions + active_brief_id), munnsett (mouth_sets), riggoppsett (rig_setups.spec) og
--    godkjente bildeversjoner (henvisninger til global_asset_versions). Bildene selv ligger i de globale
--    versjonene fra før; kopiering av filer skjer i serverfunksjonene (0046-mønsteret), ingen SQL mot storage.
--    Kniplene er uforanderlige som de globale versjonene: endringer publiseres som et nytt nummer, og
--    prosjektene tar dem inn som nye versjoner – aldri automatisk, alltid etter bekreftelse (G-6 pkt 1).
-- 2. Profiler på arbeidsgruppen: public.workspace_profiles (kind: style | quality | font | template).
--    Prosjektene arver dem med lokale overstyringer; oppløsningen (prosjekt før arbeidsgruppe) skjer i
--    kjernen (src/core/global/workspace-profiles.ts), samme forrangsprinsipp som resolveSettings (G-3).
-- 3. Tilgang (pkt 3): bare aktive medlemmer leser (RLS som 0046); skriving bare via security
--    definer-funksjonene, som krever eier/redaktør. Leser (member) kan aldri publisere.
-- 4. Prosjektkobling: assets.global_bundle_number – hvilket knippenummer prosjektressursen sist tok inn.
--    Bare metadata, ingen fremmednøkkel (samme løsning som source_global_asset_id i 0046). apply_changes
--    endres ikke: kolonnene hentes dynamisk med private.table_columns. Backup tar med knippeinnholdet
--    fordi det tas inn som vanlige prosjektrader (assets, mouth_sets, rig_setups) – filene er prosjektets
--    egne kopier, så prosjektet kan gjenopprettes alene (pkt 4).
-- Alle security definer-funksjoner har set search_path = ''. Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. Globale karakterknipper ----------
create table public.global_character_bundles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  global_asset_id uuid not null references public.global_assets (id) on delete restrict,
  number integer not null check (number >= 1),
  -- Stemmeprofil (samme form som assets.voice, 0026)
  voice jsonb check (voice is null or (jsonb_typeof(voice) = 'object' and pg_column_size(voice) <= 4096)),
  -- Faktaark: tekstversjoner (samme form som assets.brief_versions, 0089) og hvilken som er aktiv
  brief_versions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(brief_versions) = 'array' and jsonb_array_length(brief_versions) <= 50
           and pg_column_size(brief_versions) <= 2000000),
  active_brief_id text check (active_brief_id is null or length(active_brief_id) between 1 and 64),
  -- Munnsett: liste av {system, variants} (samme form som mouth_sets, 0084)
  mouth_sets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(mouth_sets) = 'array' and pg_column_size(mouth_sets) <= 200000),
  -- Riggoppsett (samme form som rig_setups.spec, 0071); null = karakteren har ingen egen rigg
  rig_setup jsonb check (rig_setup is null or (jsonb_typeof(rig_setup) = 'object' and pg_column_size(rig_setup) <= 65536)),
  -- Godkjente bildeversjoner: henvisninger til global_asset_versions for denne ressursen
  approved_version_ids uuid[] not null default '{}' check (cardinality(approved_version_ids) <= 200),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  unique (global_asset_id, number)
);
create index global_character_bundles_asset_idx on public.global_character_bundles (global_asset_id);

-- Kniplene endres aldri (samme vern som globale versjoner, 0046)
create trigger global_character_bundles_immutable before update or delete on public.global_character_bundles
  for each row execute function private.global_versions_immutable();

grant select on public.global_character_bundles to authenticated;
grant all on public.global_character_bundles to service_role;
revoke insert, update, delete on public.global_character_bundles from authenticated, anon;
alter table public.global_character_bundles enable row level security;
create policy global_character_bundles_read on public.global_character_bundles for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Publiser et nytt knippe (neste nummer). Redaktør/eier; ressursen må være en ikke-arkivert karakter,
-- og de godkjente versjonene må tilhøre ressursen.
create function public.global_publish_character_bundle(
  p_global_asset uuid, p_voice jsonb, p_brief_versions jsonb, p_active_brief_id text,
  p_mouth_sets jsonb, p_rig_setup jsonb, p_approved_version_ids uuid[], p_note text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_asset public.global_assets;
  v_number integer;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_asset from public.global_assets where id = p_global_asset for update;
  if not found then raise exception 'Ressursen finnes ikke' using errcode = '22023'; end if;
  if v_asset.kind <> 'character' then
    raise exception 'Bare karakterer kan ha et karakterknippe' using errcode = '22023';
  end if;
  if v_asset.archived_at is not null then
    raise exception 'Ressursen er arkivert' using errcode = '22023';
  end if;
  if not private.has_workspace_role(v_asset.workspace_id, 'editor') then
    raise exception 'Bare eier og redaktør kan publisere karakterknipper' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_approved_version_ids, '{}')) as v(id)
    where not exists (
      select 1 from public.global_asset_versions gav
      where gav.id = v.id and gav.global_asset_id = p_global_asset
    )
  ) then
    raise exception 'En godkjent versjon tilhører ikke karakteren' using errcode = '22023';
  end if;
  select coalesce(max(number), 0) + 1 into v_number
    from public.global_character_bundles where global_asset_id = p_global_asset;
  insert into public.global_character_bundles (
      workspace_id, global_asset_id, number, voice, brief_versions, active_brief_id,
      mouth_sets, rig_setup, approved_version_ids, note, created_by)
    values (v_asset.workspace_id, p_global_asset, v_number, p_voice,
            coalesce(p_brief_versions, '[]'::jsonb), p_active_brief_id,
            coalesce(p_mouth_sets, '[]'::jsonb), p_rig_setup,
            coalesce(p_approved_version_ids, '{}'), coalesce(p_note, ''), (select auth.uid()));
  return v_number;
end $$;
revoke all on function public.global_publish_character_bundle(uuid, jsonb, jsonb, text, jsonb, jsonb, uuid[], text)
  from public, anon;
grant execute on function public.global_publish_character_bundle(uuid, jsonb, jsonb, text, jsonb, jsonb, uuid[], text)
  to authenticated;

-- Les ett knippe (siste som standard). Bare gruppemedlemmer.
create function public.global_character_bundle(p_global_asset uuid, p_number integer default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_row public.global_character_bundles;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.global_assets where id = p_global_asset;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'Ingen tilgang til ressursen' using errcode = '42501';
  end if;
  select * into v_row from public.global_character_bundles
    where global_asset_id = p_global_asset
      and number = coalesce(p_number, (select max(number) from public.global_character_bundles
                                       where global_asset_id = p_global_asset));
  if not found then return null; end if;
  return to_jsonb(v_row);
end $$;
revoke all on function public.global_character_bundle(uuid, integer) from public, anon;
grant execute on function public.global_character_bundle(uuid, integer) to authenticated;

-- Hvilket knippenummer prosjektressursen sist tok inn (bare metadata, ingen fremmednøkkel)
alter table public.assets add column if not exists global_bundle_number integer;
comment on column public.assets.global_bundle_number is
  'G-6: siste globale karakterknippe prosjektressursen tok inn. Bare metadata; lokale overstyringer bevares.';

-- ---------- 2. Profiler på arbeidsgruppen ----------
create table public.workspace_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  kind text not null check (kind in ('style', 'quality', 'font', 'template')),
  name text not null check (length(btrim(name)) between 1 and 120),
  spec jsonb not null check (jsonb_typeof(spec) = 'object' and pg_column_size(spec) <= 200000),
  is_default boolean not null default false,
  archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index workspace_profiles_ws_idx on public.workspace_profiles (workspace_id);
-- Høyst én standardprofil per gruppe og type (også ved samtidige brukere)
create unique index workspace_profiles_one_default on public.workspace_profiles (workspace_id, kind)
  where is_default and archived_at is null;

grant select on public.workspace_profiles to authenticated;
grant all on public.workspace_profiles to service_role;
revoke insert, update, delete on public.workspace_profiles from authenticated, anon;
alter table public.workspace_profiles enable row level security;
create policy workspace_profiles_read on public.workspace_profiles for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Lagre (p_id null = ny) eller endre en profil. Revisjonssjekk som 0046; ny standard erstatter den gamle.
create function public.workspace_save_profile(
  p_workspace uuid, p_id uuid, p_kind text, p_name text, p_spec jsonb, p_is_default boolean, p_revision integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.workspace_profiles;
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspaces where id = p_workspace and archived_at is null) then
    raise exception 'Gruppen finnes ikke' using errcode = '22023';
  end if;
  if not private.has_workspace_role(p_workspace, 'editor') then
    raise exception 'Bare eier og redaktør kan endre gruppens profiler' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('style', 'quality', 'font', 'template') then
    raise exception 'Ukjent profiltype' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Navnet må ha 1–120 tegn' using errcode = '22023';
  end if;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or pg_column_size(p_spec) > 200000 then
    raise exception 'Ugyldig profilinnhold' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.workspace_profiles (workspace_id, kind, name, spec, is_default, created_by)
      values (p_workspace, p_kind, btrim(p_name), p_spec, coalesce(p_is_default, false), (select auth.uid()))
      returning id into v_id;
  else
    select * into v_row from public.workspace_profiles
      where id = p_id and workspace_id = p_workspace for update;
    if not found then raise exception 'Profilen finnes ikke' using errcode = '22023'; end if;
    if v_row.revision <> p_revision then
      raise exception 'Ugyldig revisjon: profilen er endret av noen andre' using errcode = 'P0409';
    end if;
    update public.workspace_profiles
      set kind = p_kind, name = btrim(p_name), spec = p_spec,
          is_default = coalesce(p_is_default, false), revision = revision + 1
      where id = p_id;
    v_id := p_id;
  end if;
  if coalesce(p_is_default, false) then
    update public.workspace_profiles set is_default = false
      where workspace_id = p_workspace and kind = p_kind and id <> v_id and is_default;
  end if;
  return v_id;
end $$;
revoke all on function public.workspace_save_profile(uuid, uuid, text, text, jsonb, boolean, integer)
  from public, anon;
grant execute on function public.workspace_save_profile(uuid, uuid, text, text, jsonb, boolean, integer)
  to authenticated;

create function public.workspace_archive_profile(p_profile uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.workspace_profiles where id = p_profile for update;
  if v_ws is null then raise exception 'Profilen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_ws, 'editor') then
    raise exception 'Bare eier og redaktør kan arkivere gruppens profiler' using errcode = '42501';
  end if;
  update public.workspace_profiles
    set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
        revision = revision + 1
    where id = p_profile;
end $$;
revoke all on function public.workspace_archive_profile(uuid, boolean) from public, anon;
grant execute on function public.workspace_archive_profile(uuid, boolean) to authenticated;

insert into public.schema_version (version, description) values
  (98, '0098_g6_cross_project_reuse: globale karakterknipper, arbeidsgruppeprofiler (stil/kvalitet/font/mal) og sporing av innhentet knippe');
