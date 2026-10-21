-- =====================================================================================
-- Animatic Studio – migrasjon 0068: R3 (global publisering fra stilharmonisering til en ressurs som
-- allerede er global, med angre = trekk tilbake og gjør om = publiser igjen).
-- Erstatter ingen funksjoner. apply_changes (0067), create_project (0067), delete_project (0066),
-- purge_project_assets (0067) og purge_removed_assets (0065) er uendret.
-- Bare additiv:
--   * ny tabell global_version_withdrawals: én rad per tilbaketrukket global versjon. Versjonen selv
--     (global_asset_versions) og filen endres aldri (§8–9); tilbaketrekkingen er en egen rad som slettes
--     igjen ved «gjør om». Gruppemedlemmer kan lese; ingen klient kan skrive direkte.
--   * ny funksjon global_set_version_withdrawn(p_version, p_withdrawn): eier og redaktør i gruppen.
-- Prosjekter som har kopiert versjonen, beholder kopien; ingen prosjektrader endres.
-- Ingen nye filstier lagres (referansesjekken for oppryddingen er uendret).
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- =====================================================================================

create table public.global_version_withdrawals (
  version_id uuid primary key references public.global_asset_versions (id) on delete restrict,
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  withdrawn_at timestamptz not null default now(),
  withdrawn_by uuid not null
);
create index global_version_withdrawals_ws_idx on public.global_version_withdrawals (workspace_id);
comment on table public.global_version_withdrawals is
  'R3 (0068): globale versjoner som er trukket tilbake. Versjonen og filen beholdes; skjules for ny bruk.';

revoke all on public.global_version_withdrawals from anon, authenticated;
grant select on public.global_version_withdrawals to authenticated;
grant all on public.global_version_withdrawals to service_role;
alter table public.global_version_withdrawals enable row level security;
create policy global_version_withdrawals_read on public.global_version_withdrawals for select to authenticated
  using (private.is_workspace_member(workspace_id));

-- Trekk tilbake (p_withdrawn = true) eller publiser igjen (false). Idempotent; gir true når noe ble endret.
create function public.global_set_version_withdrawn(p_version uuid, p_withdrawn boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
  v_n integer;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.global_asset_versions where id = p_version;
  if v_ws is null then raise exception 'Versjonen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(v_ws, 'editor') then
    raise exception 'Bare eier og redaktør kan trekke tilbake eller publisere versjoner' using errcode = '42501';
  end if;
  if p_withdrawn then
    insert into public.global_version_withdrawals (version_id, workspace_id, withdrawn_by)
      values (p_version, v_ws, (select auth.uid()))
      on conflict (version_id) do nothing;
  else
    delete from public.global_version_withdrawals where version_id = p_version;
  end if;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function public.global_set_version_withdrawn(uuid, boolean) from public, anon;
grant execute on function public.global_set_version_withdrawn(uuid, boolean) to authenticated;

insert into public.schema_version(version,description) values (68,'0068_global_withdrawals: R3 tilbaketrekking av globale versjoner');
