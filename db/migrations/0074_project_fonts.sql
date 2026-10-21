-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0074: fonter fra Google Fonts i prosjektet (B-098).
-- En font er en ressurs med kind 'font'. Hver versjon har én fil, fontpakken
-- (mime 'application/x-ptg-fontpack': woff2 per skriftsystem og ttf for PDF), og metadata i font_spec
-- (familie, vekter, stiler, skriftsystemer, lisens, kilde-URL og versjon; høyst 64 kB).
-- 1. assets.kind får 'font' (som 0049, med 'font' lagt til).
-- 2. asset_versions_mime_type_check får fontpakken (som 0009, med den nye typen lagt til).
-- 3. asset_versions.font_spec (jsonb, nullable).
-- 4. Globalt bibliotek (samme mønster som malene i 0052): global_assets.kind får 'font',
--    global_asset_versions.font_spec, og global_add_version får valgfri p_font_spec.
-- Erstatter:
--   * global_add_version (0052): kopiert ordrett, med bare p_font_spec lagt til (default null) og
--     font_spec i insert. Den gamle signaturen slettes, som i 0052. GRANT som før (bare authenticated).
-- apply_changes, delete_project og purge_* er uendret: apply_changes skriver kolonnene radene har
-- (font_spec tas med automatisk), og fontressurser slettes som andre ressurser. Fontpakken er en vanlig
-- ressursfil (media_path), så opprydding og referansesjekk dekker den uten endring.
-- Bare additiv: ingen data endres, ingen tilbakefylling. Ingen SQL mot storage.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Kjøres ÉN gang etter 0073.
-- =====================================================================================

-- ---------- 1. Ressurstypen ----------
alter table public.assets drop constraint if exists assets_kind_check;
alter table public.assets add constraint assets_kind_check
  check (kind in ('character','object','location','animal','environment','other','sound','template','font'));

-- ---------- 2. Filtypen ----------
alter table public.asset_versions drop constraint if exists asset_versions_mime_type_check;
alter table public.asset_versions add constraint asset_versions_mime_type_check
  check (mime_type in ('image/png','image/jpeg','image/webp','image/gif',
                       'audio/mpeg','audio/wav','audio/x-wav','audio/wave','audio/ogg','audio/webm',
                       'audio/mp4','audio/x-m4a','audio/aac','audio/flac','audio/x-flac',
                       'application/x-ptg-fontpack'));

-- ---------- 3. Fontmetadata ----------
alter table public.asset_versions add column if not exists font_spec jsonb
  check (font_spec is null or (jsonb_typeof(font_spec) = 'object' and pg_column_size(font_spec) <= 65536));

-- ---------- 4. Globalt bibliotek ----------
alter table public.global_assets drop constraint if exists global_assets_kind_check;
alter table public.global_assets add constraint global_assets_kind_check
  check (kind in ('logo', 'character', 'team_figure', 'object', 'environment', 'sound', 'template', 'font', 'other'));

alter table public.global_asset_versions add column if not exists font_spec jsonb
  check (font_spec is null or (jsonb_typeof(font_spec) = 'object' and pg_column_size(font_spec) <= 65536));

drop function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb);

create function public.global_add_version(
  p_variant uuid, p_storage_key text, p_mime text, p_width integer, p_height integer, p_bytes bigint,
  p_sha256 text, p_duration_ms integer, p_note text, p_template_spec jsonb default null,
  p_font_spec jsonb default null
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
      mime_type, width, height, byte_size, sha256, duration_ms, note, created_by, template_spec, font_spec)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, v_number, p_storage_key, p_mime, p_width,
            p_height, p_bytes, p_sha256, p_duration_ms, coalesce(p_note, ''), (select auth.uid()), p_template_spec,
            p_font_spec)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb, jsonb)
  to authenticated;

insert into public.schema_version (version, description)
  values (74, '0074_project_fonts: B-098 fonter fra Google Fonts (assets.kind font, font_spec, global_add_version)');
