-- =====================================================================================
-- Animatic Studio – migrasjon 0052: globale maldefinisjoner (MTS MT9/GP6, M1–M5, AC).
-- Bevarer maldefinisjonen sammen med den uforanderlige globale versjonen og PNG-miniatyren.
-- global_add_version er kopiert fra 0046 med bare tillegg for valgfri template_spec.
-- Skrives her; kjøres av Claude etter verifisering. Ingen endring i apply_changes eller purge.
-- =====================================================================================

alter table public.global_asset_versions add column template_spec jsonb
  check (template_spec is null or (jsonb_typeof(template_spec) = 'object' and pg_column_size(template_spec) <= 262144));

drop function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text);

create function public.global_add_version(
  p_variant uuid, p_storage_key text, p_mime text, p_width integer, p_height integer, p_bytes bigint,
  p_sha256 text, p_duration_ms integer, p_note text, p_template_spec jsonb default null
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
      mime_type, width, height, byte_size, sha256, duration_ms, note, created_by, template_spec)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, v_number, p_storage_key, p_mime, p_width,
            p_height, p_bytes, p_sha256, p_duration_ms, coalesce(p_note, ''), (select auth.uid()), p_template_spec)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb)
  from public, anon;
grant execute on function public.global_add_version(uuid, text, text, integer, integer, bigint, text, integer, text, jsonb)
  to authenticated;

insert into public.schema_version (version, description)
  values (52, '0052_global_template_spec: maldefinisjoner i globale ressursversjoner (MT9/GP6)');
