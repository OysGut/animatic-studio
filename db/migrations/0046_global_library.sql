-- =====================================================================================
-- Animatic Studio – migrasjon 0046: globalt ressursbibliotek (GP2, Fase 3 global pakke, spes. §2–16, G1–G10).
-- 1. public.global_assets, public.global_asset_variants og public.global_asset_versions, eid av en
--    arbeidsgruppe (0045). Versjonene er uforanderlige (bare insert). Global ressurs, prosjektressurs og
--    sceneforekomst er tre ulike objekter (§4).
-- 2. Rettigheter (§15): member bruker og forhåndsviser; editor legger til ressurser, varianter og versjoner og
--    endrer metadata; owner arkiverer. Lesing via RLS for gruppemedlemmer. Klienten skriver aldri direkte;
--    all skriving går via security definer-funksjonene under (ikke apply_changes – dette er ikke prosjektdata).
-- 3. Prosjektkobling (bare metadata, ingen fremmednøkkel, §16): assets.source_global_asset_id og
--    asset_versions.source_global_asset_id / source_global_variant_id / source_global_version_id. Filene er
--    prosjektets egne kopier (kopiert på serveren), så prosjektet – også en gjenoppretting fra
--    sikkerhetskopi – virker uten medlemskap i gruppen. apply_changes endres ikke: kolonnelistene hentes
--    dynamisk med private.table_columns. delete_project og purge_* endres ikke (ingen ny prosjekttabell).
-- 4. public.global_asset_projects: «brukt i prosjekter» (§10) – bare prosjekter den som spør selv er med i.
-- Filene ligger i lagringsbøtten «assets» under global/<gruppe>/<ressurs>/<sha256>.<ext>. Den første delen av
-- stien er ikke et prosjekt, så eksisterende lagringsregler gir ingen klient tilgang; serverfunksjonene
-- sjekker medlemskap og bruker service role. Ingen SQL mot lagringen (storage).
-- Kjøres ÉN gang i Lovable Cloud etter 0045. Endres aldri etter kjøring.
-- =====================================================================================

create table public.global_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  kind text not null check (kind in ('logo', 'character', 'team_figure', 'object', 'environment', 'sound', 'template', 'other')),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 4000),
  categories text[] not null default '{}' check (cardinality(categories) <= 30),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index global_assets_ws_idx on public.global_assets (workspace_id);

create table public.global_asset_variants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  global_asset_id uuid not null references public.global_assets (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 200),
  style text not null default 'reference'
    check (style in ('reference', 'illustrated', 'realistic', 'animatic', 'poster', 'other')),
  appearance text not null default '' check (length(appearance) <= 500),
  archived_at timestamptz,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index global_asset_variants_asset_idx on public.global_asset_variants (global_asset_id);

create table public.global_asset_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  global_asset_id uuid not null references public.global_assets (id) on delete restrict,
  variant_id uuid not null references public.global_asset_variants (id) on delete restrict,
  number integer not null check (number >= 1),
  storage_key text not null check (length(storage_key) <= 600),
  mime_type text not null check (length(mime_type) <= 100),
  width integer check (width is null or width between 1 and 100000),
  height integer check (height is null or height between 1 and 100000),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 2147483648),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  duration_ms integer check (duration_ms is null or duration_ms > 0),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  unique (variant_id, number)
);
create index global_asset_versions_asset_idx on public.global_asset_versions (global_asset_id);

-- Versjonene endres aldri (§8–9)
create function private.global_versions_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Globale versjoner kan ikke endres eller slettes' using errcode = '42501';
end $$;
create trigger global_asset_versions_immutable before update or delete on public.global_asset_versions
  for each row execute function private.global_versions_immutable();

-- ---------- Prosjektkobling (bare metadata) ----------
alter table public.assets add column if not exists source_global_asset_id uuid;
alter table public.asset_versions add column if not exists source_global_asset_id uuid;
alter table public.asset_versions add column if not exists source_global_variant_id uuid;
alter table public.asset_versions add column if not exists source_global_version_id uuid;
create index if not exists assets_global_idx on public.assets (source_global_asset_id)
  where source_global_asset_id is not null;
comment on column public.assets.source_global_asset_id is
  'GP2: global ressurs prosjektressursen er hentet fra. Bare metadata; ingen fremmednøkkel.';
comment on column public.asset_versions.source_global_version_id is
  'GP2: global versjon filen er kopiert fra. Bare metadata; filen er prosjektets egen kopi.';

-- ---------- Tilgang: bare lesing for gruppemedlemmer ----------
grant select on public.global_assets, public.global_asset_variants, public.global_asset_versions to authenticated;
grant all on public.global_assets, public.global_asset_variants, public.global_asset_versions to service_role;
revoke insert, update, delete on public.global_assets, public.global_asset_variants, public.global_asset_versions
  from authenticated, anon;

alter table public.global_assets enable row level security;
alter table public.global_asset_variants enable row level security;
alter table public.global_asset_versions enable row level security;

create policy global_assets_read on public.global_assets for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy global_asset_variants_read on public.global_asset_variants for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy global_asset_versions_read on public.global_asset_versions for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- ---------- Ressurser ----------
create function public.global_create_asset(
  p_workspace uuid, p_kind text, p_name text, p_description text, p_categories text[], p_tags text[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if not exists (select 1 from public.workspaces where id = p_workspace and archived_at is null) then
    raise exception 'Gruppen finnes ikke' using errcode = '22023';
  end if;
  if not private.has_workspace_role(p_workspace, 'editor') then
    raise exception 'Bare eier og redaktør kan legge til i det globale biblioteket' using errcode = '42501';
  end if;
  insert into public.global_assets (workspace_id, kind, name, description, categories, tags, created_by)
    values (p_workspace, p_kind, btrim(p_name), coalesce(p_description, ''),
            coalesce(p_categories, '{}'), coalesce(p_tags, '{}'), (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_create_asset(uuid, text, text, text, text[], text[]) from public, anon;
grant execute on function public.global_create_asset(uuid, text, text, text, text[], text[]) to authenticated;

create function public.global_update_asset(
  p_asset uuid, p_revision integer, p_name text, p_description text, p_categories text[], p_tags text[]
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_a public.global_assets;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_a from public.global_assets where id = p_asset for update;
  if not found then raise exception 'Ressursen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_a.workspace_id, 'editor') then
    raise exception 'Bare eier og redaktør kan endre ressursen' using errcode = '42501';
  end if;
  if v_a.revision <> p_revision then
    raise exception 'Ugyldig revisjon: ressursen er endret av noen andre' using errcode = 'P0409';
  end if;
  update public.global_assets
    set name = btrim(p_name), description = coalesce(p_description, ''),
        categories = coalesce(p_categories, '{}'), tags = coalesce(p_tags, '{}'), revision = revision + 1
    where id = p_asset;
  return v_a.revision + 1;
end $$;
revoke all on function public.global_update_asset(uuid, integer, text, text, text[], text[]) from public, anon;
grant execute on function public.global_update_asset(uuid, integer, text, text, text[], text[]) to authenticated;

-- Arkivering (§16): ressursen skjules i biblioteket; prosjektene beholder sine kopier. Ingenting slettes.
create function public.global_set_asset_archived(p_asset uuid, p_archived boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.global_assets where id = p_asset for update;
  if v_ws is null then raise exception 'Ressursen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_ws, 'owner') then
    raise exception 'Bare gruppens eier kan arkivere' using errcode = '42501';
  end if;
  update public.global_assets
    set archived_at = case when p_archived then coalesce(archived_at, now()) else null end,
        revision = revision + 1
    where id = p_asset;
end $$;
revoke all on function public.global_set_asset_archived(uuid, boolean) from public, anon;
grant execute on function public.global_set_asset_archived(uuid, boolean) to authenticated;

-- ---------- Varianter og versjoner ----------
create function public.global_create_variant(p_asset uuid, p_name text, p_style text, p_appearance text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.global_assets where id = p_asset and archived_at is null;
  if v_ws is null then raise exception 'Ressursen finnes ikke eller er arkivert' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_ws, 'editor') then
    raise exception 'Bare eier og redaktør kan legge til varianter' using errcode = '42501';
  end if;
  insert into public.global_asset_variants (workspace_id, global_asset_id, name, style, appearance, created_by)
    values (v_ws, p_asset, btrim(p_name), coalesce(p_style, 'reference'), coalesce(p_appearance, ''),
            (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_create_variant(uuid, text, text, text) from public, anon;
grant execute on function public.global_create_variant(uuid, text, text, text) to authenticated;

-- Ny versjon (§9): legges til, endrer aldri prosjekter. Filen må ligge under gruppens og ressursens sti.
create function public.global_add_version(
  p_variant uuid, p_storage_key text, p_mime text, p_width integer, p_height integer, p_bytes bigint,
  p_sha256 text, p_duration_ms integer, p_note text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_var public.global_asset_variants;
  v_number integer;
  v_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_var from public.global_asset_variants where id = p_variant for update;
  if not found then raise exception 'Varianten finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_var.workspace_id, 'editor') then
    raise exception 'Bare eier og redaktør kan publisere nye versjoner' using errcode = '42501';
  end if;
  if p_storage_key is null
     or p_storage_key !~ ('^global/' || v_var.workspace_id::text || '/' || v_var.global_asset_id::text
                          || '/[0-9a-f]{64}\.[a-z0-9]{1,8}$') then
    raise exception 'Ugyldig lagringssti' using errcode = '22023';
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.global_asset_versions where variant_id = p_variant;
  insert into public.global_asset_versions (workspace_id, global_asset_id, variant_id, number, storage_key,
      mime_type, width, height, byte_size, sha256, duration_ms, note, created_by)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, v_number, p_storage_key, p_mime, p_width,
            p_height, p_bytes, p_sha256, p_duration_ms, coalesce(p_note, ''), (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text)
  from public, anon;
grant execute on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text)
  to authenticated;

-- «Brukt i prosjekter» (§10): bare prosjekter den som spør er aktivt medlem av.
create function public.global_asset_projects(p_asset uuid)
returns table (project_id uuid, project_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid;
begin
  select workspace_id into v_ws from public.global_assets where id = p_asset;
  if v_ws is null or not private.is_workspace_member(v_ws) then
    raise exception 'Ingen tilgang til ressursen' using errcode = '42501';
  end if;
  return query
    select distinct p.id, p.name
    from public.assets a
    join public.projects p on p.id = a.project_id and p.deleted_at is null
    where a.source_global_asset_id = p_asset and coalesce(a.removed, false) = false
      and private.is_project_member(p.id)
    order by p.name;
end $$;
revoke all on function public.global_asset_projects(uuid) from public, anon;
grant execute on function public.global_asset_projects(uuid) to authenticated;

insert into public.schema_version (version, description)
  values (46, '0046_global_library: globalt ressursbibliotek per arbeidsgruppe og kobling fra prosjektressurser (GP2)');
