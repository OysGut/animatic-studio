# RLS-, RPC- og Storage-mønstre

Grunnlag: ADR-0004, DEC-0010, DEC-0020, DEC-0022 (skrivevei), `db/migrations/0001_core.sql` (faktisk kode), `LOVABLE_PLATFORM_NOTES.md` §7 (Supabase RLS-veiledning: én policy per operasjon, `to authenticated`, security definer-funksjoner med `search_path = ''` mot rekursjon, `(select auth.uid())` for ytelse). Seksjon 1–4 viser det som faktisk står i 0001; seksjon 5–7 er mønstre for senere migrasjoner – tilpass og test.

## 1. Roller og hjelpefunksjoner (DEC-0020 pkt. 2)
Hjelpefunksjonene ligger i skjemaet `private`, som ikke eksponeres via API-et: `private.is_project_member(uuid)`, `private.has_project_role(uuid, text)` og `private.can_approve_costs(uuid)` bruker innlogget bruker (`auth.uid()`); `private.member_role_rank(uuid, uuid)` tar bruker-ID eksplisitt og brukes av `public.apply_changes`, som kalles med service role (der `auth.uid()` er tom). Alle er `security definer` med `search_path = ''`. Rollen er `text` med `check`, ikke en enum. Slik står det i `db/migrations/0001_core.sql`:

```sql
create schema if not exists private;

-- project_members.role text not null check (role in ('owner', 'editor', 'commenter', 'viewer'))

create function private.role_rank(p_role text) returns integer
language sql immutable set search_path = '' as $$
  select case p_role when 'owner' then 4 when 'editor' then 3 when 'commenter' then 2 when 'viewer' then 1 else 0 end
$$;

create function private.is_project_member(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid()) and m.removed_at is null
  )
$$;

create function private.member_role_rank(p_project uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(private.role_rank(m.role)), 0) from public.project_members m
  where m.project_id = p_project and m.user_id = p_user and m.removed_at is null
$$;

create function private.has_project_role(p_project uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.member_role_rank(p_project, (select auth.uid())) >= private.role_rank(p_min_role)
$$;

create function private.can_approve_costs(p_project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p_project and m.user_id = (select auth.uid()) and m.removed_at is null and m.can_approve_costs
  )
$$;
```
`removed_at` i stedet for sletting av medlemskap (REQ-0529). Nye migrasjoner bruker `create function` (ikke `create or replace`) for nye objekter, slik at en dobbeltkjøring feiler tydelig.

## 2. Policyer på prosjekttabeller
0001 setter opp alle prosjekttabeller i én løkke – samme mønster brukes for nye tabeller:
```sql
do $$
declare t text;
begin
  foreach t in array array['productions','scenes','scene_variants','script_blocks','script_block_revisions',
                           'scene_occurrences','production_segments','takes','change_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_project_member(project_id))', t || '_read', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
```
Ingen insert/update/delete-policy: skriving skjer bare via serverfunksjonen `runCommand` → `public.apply_changes` (DEC-0022). Unntak med egne regler i 0001: `projects` (policy på `id`), `project_invitations` (bare eier leser, `private.has_project_role(project_id, 'owner')`), `schema_version` (lesbar for `anon, authenticated`). Indekser på `project_id`/FK-er legges i samme fil som tabellen.

Klienten har dermed bare lesetilgang. Eneste mulige unntak er rene brukerinnstillinger (f.eks. per-bruker visningsfiltre), som listes eksplisitt og får egne policyer med `with check (user_id = (select auth.uid()) and private.is_project_member(project_id))`.

## 3. Uforanderlige tabeller (INV-07, INV-13)
Fra 0001:
```sql
create function private.protect_history() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Historikk kan ikke endres eller slettes (INV-13)' using errcode = 'P0001';
end $$;
create trigger block_revisions_immutable before update on public.script_block_revisions
  for each row execute function private.protect_history();
create trigger change_log_immutable before update or delete on public.change_log
  for each row execute function private.protect_history();

-- Takes kan aldri slettes eller få endret kildepeker (INV-07). Status kan endres.
create function private.protect_takes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Produsert materiale kan ikke slettes (INV-07)' using errcode = 'P0001';
  end if;
  if new.occurrence_id <> old.occurrence_id or new.produced_from <> old.produced_from
     or new.media_ref is distinct from old.media_ref or new.kind <> old.kind then
    raise exception 'Produsert materiale kan ikke overskrives (INV-07)' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger takes_protect before update or delete on public.takes
  for each row execute function private.protect_takes();
```
Triggerne gjelder også service role, altså også `apply_changes`. Senere versjonstabeller (`screenplay_versions`, `resource_versions`, `export_versions` …) får `private.protect_history()` på `update or delete`.

## 4. Skrivevei med revisjonskontroll (INV-C1, ADR-0005, DEC-0022)
DEC-0022 erstatter skriveveien i DEC-0020 pkt. 1 og 3. Domenelogikken finnes bare i `src/core`; databasen har **ingen** SQL-funksjon per kommando og ingen RPC som klienten kaller for å skrive prosjektdata.

1. Klienten kaller serverfunksjonen `runCommand` (`src/adapters/storage/commands.functions.ts`, TanStack Start `createServerFn` med `requireSupabaseAuth`) med `{ projectId, command, baseRevisions? }`.
2. Serveren sjekker medlemskap og rolle ≥ `editor`, laster prosjektet med admin-klienten (`loadProjectState`), og kjører `applyCommand` i kjernen (`src/core/commands/apply.ts`: `baseRevisions`, validering, `checkInvariants`, invers).
3. `diffStates` (`src/core/patch.ts`) lager et endringssett `{ inserts, updates, deletes, blockRevisions }` i lagringsformat (snake_case). I `updates` er `revision` ny revisjon og `expected_revision` den gamle.
4. Endringssettet lagres atomisk med `public.apply_changes`, som **bare** `service_role` kan kalle.

Utdrag fra 0001 (se filen for hele funksjonen):
```sql
create function public.apply_changes(
  p_project uuid, p_actor uuid, p_command_id uuid, p_command jsonb, p_inverse jsonb, p_changes jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tables text[] := array['productions','scenes','scene_variants','script_blocks','scene_occurrences','production_segments','takes'];
  -- …
begin
  if private.member_role_rank(p_project, p_actor) < private.role_rank('editor') then
    raise exception 'Brukeren har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  -- 1) inserts i FK-rekkefølge; hver rad må ha project_id = p_project (ellers 42501); created_by = p_actor
  -- 2) updates: krever revision = expected_revision + 1 (ellers 22023), og
  --      update … where t.id = … and t.project_id = p_project and t.revision = expected_revision
  --    0 rader → raise exception 'Revisjonskonflikt' using errcode = 'P0409', detail = <id>
  -- 3) deletes (bare ved angre av opprettelse), motsatt rekkefølge, samme revisjonssjekk → P0409
  -- 4) blockRevisions → insert i script_block_revisions (project_id = p_project og author = p_actor, ellers 42501)
  -- 5) change_log
  insert into public.change_log (id, project_id, actor, command_type, command, inverse, affected_ids)
    values (p_command_id, p_project, p_actor, p_command ->> 'type', p_command, p_inverse, v_affected);
  return jsonb_build_object('ok', true, 'changeId', p_command_id, 'affected', to_jsonb(v_affected));
end $$;
revoke all on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb) to service_role;
```
Regler:
- Revisjonskontrollen skjer i `where`-leddet i samme `update` (ingen separat `for update`-lesing); hele funksjonen er én transaksjon, så én konflikt ruller tilbake alt.
- Kolonnelisten hentes fra `information_schema` (`private.table_columns`). En ny prosjekttabell som skal kunne skrives, må legges inn i `v_tables` og i `TABLE_ORDER` (`src/core/patch.ts`) i FK-rekkefølge – det krever en ny migrasjon som erstatter `apply_changes`.
- `change_log.id` er kommando-ID-en (primærnøkkel); serveren lager den (`newId`). `command_type` er det kanoniske kommandonavnet fra `DOMAIN_MODEL.md` §3 (`MoveOccurrence`, ikke «MoveSceneOccurrence»).
- Tekst (`EditBlockText`): revisjonskontrollen ligger på `script_blocks.revision`, og kjernen lager en ny rad i `script_block_revisions` og oppdaterer `script_blocks.current_rev` (DEC-0020 pkt. 5). `revision` er bare samtidighetskontroll; innholdsversjonen er `rev`.

Andre RPC-er klienten kan kalle (alle `security definer`, `execute` bare til `authenticated`): `public.create_project(text, integer, integer)`, `public.create_invitation(uuid, text, text)` (bare eier) og `public.accept_invitation(text)`. De skriver selv sin `change_log`-rad der det er relevant.

Feilkoder er en kontrakt med `runCommand`: `P0409` → `revision_conflict`; andre databasefeil → `storage_error` (logges uten hemmeligheter). Manglende rolle avvises før databasen (`forbidden`), og kjernen gir egne koder (`not_found`, `invalid`, `duplicate_id`, `revision_conflict`, `must_fork_variant`, `referenced`, `invariant_violation`). Egendefinerte SQLSTATE-koder må ha 5 tegn.

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

Kontinuitet for produksjon P (DEC-0020 pkt. 8): `where character_id = $c and (production_id is null or production_id = $p)` minus hendelser som har `continuity_overrides(production_id = $p, action = 'disable')`, og med `replacement_event_id` i stedet for hendelser med `action = 'replace'`. Lokale hendelser vinner ved samme `story_order` (regel dokumenteres i core og testes). `continuity_overrides` har samme RLS (select for medlemmer, skriving via `runCommand` → `public.apply_changes`).

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
