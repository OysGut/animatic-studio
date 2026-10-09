-- =====================================================================================
-- Animatic Studio – migrasjon 0003: manusversjoner (mandat 2.2, 5.1, 5.2; REQ-0032, REQ-0069, REQ-0076–0078, REQ-0083).
-- En manusversjon er et uforanderlig øyeblikksbilde av én produksjons manus: scenerekkefølge, synlighet (aktiv),
-- scenenummer, overskrifter, tekst med revisjonsnummer og aktiv versjon av produsert materiale.
-- Øyeblikksbildet lages i databasen fra lagrede data (ikke fra klienten), så det alltid viser det som faktisk er lagret.
-- Kjøres ÉN gang i Lovable Cloud etter 0002. Endres aldri etter kjøring.
-- =====================================================================================

-- Fortløpende rekkefølge i endringsloggen (tidsstempler kan være like eller komme i feil rekkefølge)
alter table public.change_log add column if not exists seq bigint generated always as identity;
create index if not exists change_log_project_seq_idx on public.change_log (project_id, seq desc);

create table public.script_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id),
  number integer not null check (number >= 1),
  name text not null check (length(btrim(name)) between 1 and 200),
  note text check (length(note) <= 2000),
  parent_version_id uuid references public.script_versions (id),
  based_on_change_id uuid,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  constraint script_versions_number_unique unique (production_id, number)
);
create index script_versions_production_idx on public.script_versions (production_id, number desc);

alter table public.script_versions enable row level security;
create policy script_versions_read on public.script_versions for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.script_versions from anon, authenticated;
grant select on public.script_versions to authenticated;

-- Historiske versjoner kan aldri endres eller slettes (REQ-0032, INV-13)
create trigger script_versions_immutable before update or delete on public.script_versions
  for each row execute function private.protect_history();

-- Øyeblikksbilde av en produksjons manus. Samme format som snapshotFromState i src/core/screenplay/versions.ts.
create function private.script_snapshot(p_production uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', 1,
    'productionId', p_production,
    'scenes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'occurrenceId', o.id,
          'sceneId', o.scene_id,
          'variantId', o.variant_id,
          'number', o.production_number,
          'active', o.active,
          'activeTakeId', o.active_take_id,
          'heading', jsonb_build_object('intExt', v.heading_int_ext, 'location', v.heading_location, 'time', v.heading_time),
          'blocks', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', b.id, 'kind', b.kind, 'text', b.text, 'rev', b.current_rev)
              order by b.order_key collate "C")
            from public.script_blocks b
            where b.variant_id = o.variant_id and not b.removed
          ), '[]'::jsonb)
        )
        order by o.order_key collate "C")
      from public.scene_occurrences o
      join public.scene_variants v on v.id = o.variant_id
      where o.production_id = p_production
    ), '[]'::jsonb)
  )
$$;
revoke all on function private.script_snapshot(uuid) from public, anon, authenticated;

create function public.create_script_version(p_project uuid, p_production uuid, p_name text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_parent uuid;
  v_number integer;
begin
  if not private.has_project_role(p_project, 'editor') then
    raise exception 'Du har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  if not exists (select 1 from public.productions where id = p_production and project_id = p_project) then
    raise exception 'Produksjonen tilhører ikke prosjektet' using errcode = '22023';
  end if;
  if p_name is null or length(btrim(p_name)) = 0 or length(p_name) > 200 or length(coalesce(p_note, '')) > 2000 then
    raise exception 'Ugyldig navn eller merknad' using errcode = '22023';
  end if;
  -- Én versjon om gangen per produksjon (løpenummer uten hull)
  perform pg_advisory_xact_lock(hashtextextended(p_production::text, 0));
  select id, number into v_parent, v_number from public.script_versions
    where production_id = p_production order by number desc limit 1;
  -- Øyeblikksbildet og siste endring hentes i samme setning, så de viser nøyaktig samme lagrede tilstand
  insert into public.script_versions (id, project_id, production_id, number, name, note, parent_version_id, based_on_change_id, snapshot, created_by)
    select v_id, p_project, p_production, coalesce(v_number, 0) + 1, btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''),
           v_parent,
           (select c.id from public.change_log c where c.project_id = p_project order by c.seq desc limit 1),
           private.script_snapshot(p_production),
           (select auth.uid());
  return v_id;
end $$;
revoke all on function public.create_script_version(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_script_version(uuid, uuid, text, text) to authenticated;

-- ---------- Tilstedeværelse (hvem er i prosjektet nå) bare for medlemmer ----------
-- Appen bruker private Realtime-kanaler «presence-<prosjekt-id>». Bare medlemmer kan lytte og melde seg.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    execute $p$create policy presence_members_read on realtime.messages for select to authenticated
      using (
        realtime.messages.extension = 'presence'
        and (select realtime.topic()) like 'presence-%'
        and private.is_project_member(private.try_uuid(substr((select realtime.topic()), 10)))
      )$p$;
    execute $p$create policy presence_members_write on realtime.messages for insert to authenticated
      with check (
        realtime.messages.extension = 'presence'
        and (select realtime.topic()) like 'presence-%'
        and private.is_project_member(private.try_uuid(substr((select realtime.topic()), 10)))
      )$p$;
  end if;
end $$;

insert into public.schema_version (version, description) values (3, '0003_script_versions: manusversjoner (uforanderlige øyeblikksbilder), rekkefølge i endringsloggen, tilstedeværelse for medlemmer');
