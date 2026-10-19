-- =====================================================================================
-- Animatic Studio – migrasjon 0057: globale animasjonsoppsett (CA7), krever 0056.
-- Ny arbeidsgruppetabell for publiserte rigg-oppsett med mønstre og karakteratferd. Radene er
-- uforanderlige og nummereres per global variant (låst versjon). Ingen prosjekttabeller endres, og
-- apply_changes, delete_project, purge_project_assets og purge_removed_assets er IKKE erstattet.
-- Ingen eksisterende data endres. Claude kjører filen etter lokale DB-tester.
-- =====================================================================================

create table public.global_animation_specs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  global_asset_id uuid not null references public.global_assets (id) on delete restrict,
  variant_id uuid not null references public.global_asset_variants (id) on delete restrict,
  number integer not null check (number >= 1),
  rig_spec jsonb not null check (jsonb_typeof(rig_spec) = 'object' and octet_length(rig_spec::text) <= 524288),
  patterns jsonb not null default '[]'::jsonb
    check (jsonb_typeof(patterns) = 'array' and jsonb_array_length(patterns) <= 100 and octet_length(patterns::text) <= 131072),
  note text not null default '' check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  unique (variant_id, number)
);
create index global_animation_specs_asset_idx on public.global_animation_specs (global_asset_id);

revoke all on public.global_animation_specs from anon, authenticated;
grant select on public.global_animation_specs to authenticated;
grant all on public.global_animation_specs to service_role;
alter table public.global_animation_specs enable row level security;
create policy global_animation_specs_read on public.global_animation_specs for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Publiserte oppsett endres aldri (låst versjon, CA7)
create trigger global_animation_specs_immutable before update or delete on public.global_animation_specs
  for each row execute function private.global_versions_immutable();

create function public.global_publish_animation(p_variant uuid, p_rig_spec jsonb, p_patterns jsonb, p_note text)
returns uuid
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
    raise exception 'Bare eier og redaktør kan publisere animasjonsoppsett' using errcode = '42501';
  end if;
  if p_rig_spec is null or jsonb_typeof(p_rig_spec) <> 'object' or p_rig_spec ->> 'format' is distinct from '1'
     or jsonb_typeof(p_rig_spec -> 'anchors') is distinct from 'object' then
    raise exception 'Ugyldig animasjonsoppsett' using errcode = '22023';
  end if;
  if p_patterns is null or jsonb_typeof(p_patterns) <> 'array' then
    raise exception 'Ugyldige mønstre' using errcode = '22023';
  end if;
  select coalesce(max(number), 0) + 1 into v_number from public.global_animation_specs where variant_id = p_variant;
  insert into public.global_animation_specs (workspace_id, global_asset_id, variant_id, number, rig_spec, patterns, note, created_by)
    values (v_var.workspace_id, v_var.global_asset_id, p_variant, v_number, p_rig_spec, p_patterns, coalesce(p_note, ''), (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.global_publish_animation(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.global_publish_animation(uuid, jsonb, jsonb, text) to authenticated;

insert into public.schema_version (version, description) values (57, '0057_global_animation: publiserte animasjonsoppsett i det globale biblioteket');
