# RLS-, RPC- og Storage-mønstre

Grunnlag: ADR-0004, DEC-0010, DEC-0020, `LOVABLE_PLATFORM_NOTES.md` §7 (Supabase RLS-veiledning: én policy per operasjon, `to authenticated`, security definer-funksjoner med `search_path = ''` mot rekursjon, `(select auth.uid())` for ytelse). Eksemplene er mønstre, ikke ferdige migrasjoner – tilpass og test.

## 1. Roller og hjelpefunksjoner (DEC-0020 pkt. 2)
Hjelpefunksjonene ligger i skjemaet `private`, som ikke eksponeres via API-et: `private.is_project_member(uuid)`, `private.has_project_role(uuid, text)` og `private.can_approve_costs(uuid)` – alle `security definer` med `search_path = ''` (ADR-0004, presisert av DEC-0020).

```sql
create schema if not exists private;
create type public.project_role as enum ('viewer', 'commenter', 'editor', 'owner');

create or replace function private.role_rank(r public.project_role)
returns int language sql immutable set search_path = '' as $$
  select case r when 'viewer' then 1 when 'commenter' then 2 when 'editor' then 3 when 'owner' then 4 end
$$;

create or replace function private.is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
      and m.removed_at is null
  )
$$;

create or replace function private.has_project_role(p_project_id uuid, p_min text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
      and m.removed_at is null
      and private.role_rank(m.role) >= private.role_rank(p_min::public.project_role)
  )
$$;

create or replace function private.can_approve_costs(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id
      and m.user_id = (select auth.uid())
      and m.removed_at is null
      and m.can_approve_costs
  )
$$;

revoke all on function private.is_project_member(uuid) from public, anon;
grant execute on function private.is_project_member(uuid) to authenticated;
-- tilsvarende for private.has_project_role(uuid, text) og private.can_approve_costs(uuid)
```
`removed_at` i stedet for sletting av medlemskap (REQ-0529).

## 2. Policyer på prosjekttabeller
```sql
alter table public.scene_occurrences enable row level security;

create policy scene_occurrences_select on public.scene_occurrences
  for select to authenticated
  using (private.is_project_member(project_id));

-- Ingen insert/update/delete-policy: skriving skjer bare via public.apply_command (DEC-0020 pkt. 1).
revoke insert, update, delete on public.scene_occurrences from anon, authenticated;
create index on public.scene_occurrences (project_id);
```
Klienten har dermed bare lesetilgang til prosjekttabeller. Eneste unntak er rene brukerinnstillinger (f.eks. per-bruker visningsfiltre), som listes eksplisitt og får egne policyer med `with check (user_id = (select auth.uid()) and private.is_project_member(project_id))`.

## 3. Uforanderlige tabeller
```sql
create or replace function private.reject_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Tabellen % er uforanderlig', tg_table_name using errcode = 'P0001';
end $$;

create trigger screenplay_versions_immutable
  before update or delete on public.screenplay_versions
  for each row execute function private.reject_mutation();
```
Samme trigger på `script_block_revisions` (bare insert, DEC-0020 pkt. 5). For `takes`: tillat endring av `status`, men avvis endring av filpekere (`media_asset_id`, `composition_id`, `generation_job_id`, `produced_from`) med en trigger som sammenligner `old` og `new`.

## 4. Kommando-RPC med revisjonskontroll (INV-C1, ADR-0005, DEC-0020 pkt. 1 og 3)
Én RPC-stil: klienten kaller bare `public.apply_command(project_id, command jsonb, base_revisions jsonb)`. Den sjekker innlogging, medlemskap og rolle, gjør idempotenssjekk på kommando-ID og sender videre til den interne funksjonen `private.cmd_<kommando>` (f.eks. `private.cmd_move_occurrence`), som låser rader, sammenligner revisjoner, utfører endringen og skriver `change_log`. `private.cmd_*` kan ikke kalles direkte av klienten (skjemaet er ikke eksponert, og `execute` er ikke gitt til `authenticated`).

```sql
create or replace function public.apply_command(
  p_project_id uuid, p_command jsonb, p_base_revisions jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_type text := p_command->>'type';
  v_command_id uuid := (p_command->>'id')::uuid;
begin
  if (select auth.uid()) is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.has_project_role(p_project_id, 'editor') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- idempotens: samme kommando to ganger gir samme svar
  if exists (select 1 from public.change_log where id = v_command_id) then
    return jsonb_build_object('status', 'duplicate', 'command_id', v_command_id);
  end if;
  case v_type
    when 'MoveOccurrence' then return private.cmd_move_occurrence(v_command_id, p_project_id, p_command->'payload', p_base_revisions);
    -- when 'EditBlockText' then return private.cmd_edit_block_text(...);
    else raise exception 'unknown_command %', v_type using errcode = '22023';
  end case;
end $$;

revoke all on function public.apply_command(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.apply_command(uuid, jsonb, jsonb) to authenticated;

create or replace function private.cmd_move_occurrence(
  p_command_id uuid, p_project_id uuid, p_payload jsonb, p_base_revisions jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_occ uuid := (p_payload->>'occurrenceId')::uuid;
  v_new_key text := p_payload->>'orderKey';
  v_expected int := (p_base_revisions->>(p_payload->>'occurrenceId'))::int;
  v_old record;
begin
  select * into v_old from public.scene_occurrences
   where id = v_occ and project_id = p_project_id
   for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if v_expected is null or v_old.revision <> v_expected then
    raise exception 'revision_conflict'
      using errcode = 'P0409',
            detail = jsonb_build_object('id', v_occ, 'current', v_old.revision)::text;
  end if;

  update public.scene_occurrences
     set order_key = v_new_key, revision = revision + 1
   where id = v_occ;

  insert into public.change_log (id, project_id, production_id, author, command_type, payload, inverse, affected_ids, base_revisions)
  values (p_command_id, p_project_id, v_old.production_id, (select auth.uid()), 'MoveOccurrence',
          p_payload,
          jsonb_build_object('occurrenceId', v_occ, 'orderKey', v_old.order_key),
          array[v_occ], p_base_revisions);

  return jsonb_build_object('status', 'ok', 'revisions', jsonb_build_object(v_occ::text, v_old.revision + 1));
end $$;

revoke all on function private.cmd_move_occurrence(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
```
Kommandonavn i `change_log.command_type` er de kanoniske fra `DOMAIN_MODEL.md` §3 (`MoveOccurrence`, ikke «MoveSceneOccurrence»). For `EditBlockText` ligger revisjonskontrollen på `script_blocks.revision` (ikke på varianten), og `private.cmd_edit_block_text` setter inn en ny rad i `script_block_revisions` og oppdaterer `script_blocks.current_rev` (DEC-0020 pkt. 5). `revision` er bare samtidighetskontroll; innholdsversjonen er `rev`.

Feilkoder er en kontrakt med `src/adapters/storage/` (`P0409` → `RevisionConflict`, `42501` → `Forbidden`). Hold listen i adapterens feilmapping og test den. Egendefinerte SQLSTATE-koder må følge Postgres-formatet (5 tegn); verifiser at klientbiblioteket eksponerer `code`.

## 5. Variant- og produksjonsregler (INV-04)
```sql
alter table public.scene_variants add constraint scene_variants_id_scene unique (id, scene_id);
alter table public.scene_occurrences
  add constraint occ_variant_same_scene foreign key (variant_id, scene_id)
  references public.scene_variants (id, scene_id);
-- Trigger: variant.owner_production_id is null or = occurrence.production_id
```
Det finnes ingen `UNIQUE(production_id, scene_id)` på `scene_occurrences`: samme scene kan forekomme flere ganger i én produksjon (DEC-0020 pkt. 10).

`active_take_id` kan i en spinoff peke på en take som eies av hovedfilmens forekomst (referanse, ingen kopi; DEC-0020 pkt. 7). Triggeren skal derfor bare kreve at taken tilhører samme prosjekt og samme `scene_id`, ikke samme forekomst. Trim/utdrag lagres på spinoffens forekomst; avvik for en gjenbrukt take i spinoff-kontekst har spinoffens forekomst som mål.

Kontinuitet for produksjon P (DEC-0020 pkt. 8): `where character_id = $c and (production_id is null or production_id = $p)` minus hendelser som har `continuity_overrides(production_id = $p, action = 'disable')`, og med `replacement_event_id` i stedet for hendelser med `action = 'replace'`. Lokale hendelser vinner ved samme `story_order` (regel dokumenteres i core og testes). `continuity_overrides` har samme RLS (select for medlemmer, skriving via `apply_command`).

## 6. Storage
Kanonisk sti og bøtteliste står i `docs/architecture/DATA_RELATIONSHIPS.md` «Lagringsstruktur» (DEC-0020 pkt. 4) – kopier ikke en egen variant hit. Policyen leser prosjekt-ID fra første mappe etter bøttenavnet.
```sql
-- Bøttelisten skal være identisk med DATA_RELATIONSHIPS.md (alle private).
create policy media_read on storage.objects for select to authenticated
  using (bucket_id in ('sources','resources','generated','renders-tmp','exports','backups')
         and private.is_project_member(private.safe_uuid((storage.foldername(name))[1])));
```
`private.safe_uuid(text)` returnerer `null` for ugyldig tekst i stedet for å kaste feil. Skriving: bare `editor`+ (`private.has_project_role`) og bare ny sti (innholdsadressert – samme sha256 = samme fil; ingen `update`-policy, slik at objekter ikke kan overskrives). `sources/` (originalmanus, importert film) har aldri slettepolicy; `renders-tmp/` kan ryddes av medietjenesten (service role); `backups/` skrives bare av server.

## 7. Realtime
Postgres Changes respekterer RLS (ikke for DELETE – vi sletter ikke). Presence/Broadcast på private kanaler `project:<id>` med policy på `realtime.messages` som bruker `private.is_project_member`. Ikke kjør `enable row level security` på `realtime.messages` (Supabase-dokumentasjonen advarer om at det feiler). Om dette er konfigurerbart i Lovable Cloud er **ikke verifisert**.
