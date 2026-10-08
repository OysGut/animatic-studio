---
name: database-domain-modeling
description: Arbeidsmetode for Postgres-skjemaet i Lovable Cloud (Supabase) som realiserer domenemodellen (DOMAIN_MODEL.md, DATA_RELATIONSHIPS.md) – tabeller, permanente UUID-er, uforanderlige versjonstabeller (script_block_revisions m.fl.), revision-kolonne og revisjonskonflikt, RLS med bare lesing via private.is_project_member, all skriving via serverfunksjonen runCommand som kjører domenekjernen og lagrer endringssettet med apply_changes (bare service_role, DEC-0022), change_log, migrasjoner i db/migrations (bare nye filer, schema_version, lokal test med tests/db), Storage-referanser, produksjonsspesifikke overstyringer (owner_production_id, continuity_overrides), historikk og ingen cascade-sletting. Bruk ved SQL, migrasjoner, RLS, Storage-policyer, RPC-er, indekser eller endrede entiteter (Scene, SceneOccurrence, SceneVariant, ProductionSegment, Take, ScriptBlock, ContinuityEvent). Triggere – migrasjon, skjema, tabell, RLS, policy, RPC, database, Supabase, Postgres, revisjonskonflikt.
metadata:
  version: "0.2.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# database-domain-modeling

Hvordan domenemodellen blir et trygt, sporbart Postgres-skjema i Lovable Cloud. Skillen lager ikke produktkrav; tabellutkastet i `DATA_RELATIONSHIPS.md` er utgangspunktet.

## 1. Ansvar
**Eier:** tabeller, kolonner, nøkler og indekser; uforanderlighet og historikk i databasen; revisjonskontroll; RLS- og Storage-policyer; lagringsfunksjonen `public.apply_changes` (atomisk lagring av endringssett med revisjonskontroll) og de få klient-RPC-ene (`create_project`, `create_invitation`, `accept_invitation`); migrasjonsfiler og `schema_version`; skjemagjennomgang.
**Eier ikke:**
- Hva kommandoene gjør og invariantlogikken – den finnes bare i `src/core` (DEC-0022) → `scene-sync-invariants` / `architecture-guardian`. Databasen har ingen SQL-funksjon per kommando.
- Hvordan Mars får kjørt migrasjonene i Lovable → `lovable-development` (`docs/development/LOVABLE_SYNC.md`).
- Generelle sikkerhetskrav (hemmeligheter, opplasting, logging) → `secure-development`.
- Testoppsett for RLS-/integrasjonstester → `test-quality-engineering` (denne skillen sier *hva* som må testes).
- Manusformat og importtolkning → `screenplay-engineering`.

## 2. Når den brukes
- Ny eller endret tabell, kolonne, indeks, constraint, trigger, funksjon eller policy.
- Ny kommando som berører en tabell `apply_changes` ennå ikke skriver til, eller endring i `apply_changes`/klient-RPC-ene.
- Storage-bøtter, filstier og mediereferanser.
- Feilsøking av tilgang (RLS), revisjonskonflikter, trege spørringer.
- Gjennomgang av en migrasjon før commit.

## 3. Les først
- `docs/architecture/DOMAIN_MODEL.md` (entiteter, §0 begrepsavklaringer) og `docs/architecture/DATA_RELATIONSHIPS.md` (tabellutkast, viktige spørringer, Storage-struktur).
- `docs/architecture/INVARIANTS.md`: særlig INV-01, INV-02, INV-04, INV-07, INV-12, INV-13, INV-14, INV-C1, INV-C2.
- ADR-0002 (Lovable Cloud, migrasjoner kjøres ikke fra Git), ADR-0004 (RLS, roller, revisjon), ADR-0005 (kommandologg), ADR-0006 (tid i heltall bilder); DEC-0003, DEC-0008, DEC-0010, DEC-0011.
- `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` §2 (Git-synk), §4 (RLS, Storage), §7 (medlemskap/Realtime-mønstre).
- Krav: REQ-0034–REQ-0043 (identitet, transaksjoner), REQ-0409–REQ-0415 (lagring), REQ-0520–REQ-0529 (samarbeid), REQ-0316, REQ-0505.
- `docs/development/LOVABLE_SYNC.md` før en migrasjon leveres.
- DEC-0022 (skrivevei – erstatter DEC-0020 pkt. 1 og 3) og faktisk kode: `db/migrations/0001_core.sql`, `src/core/patch.ts`, `src/core/commands/apply.ts`, `src/adapters/storage/commands.functions.ts`.
- DEC-0020 (hjelpefunksjoner i `private`, `P0409`, lagringssti, blokkrevisjoner, take-gjenbruk, `continuity_overrides`, `merged_into`, ingen `UNIQUE(production_id, scene_id)`).
- Referanser: [MIGRATION_RULES](references/MIGRATION_RULES.md), [RLS_PATTERNS](references/RLS_PATTERNS.md), [SCHEMA_REVIEW_CHECKLIST](references/SCHEMA_REVIEW_CHECKLIST.md).

## 4. Arbeidsprosedyre
1. **Start i domenet.** Finn entiteten i `DOMAIN_MODEL.md` og kravene. Endres modellen, oppdater `DOMAIN_MODEL.md`/`DATA_RELATIONSHIPS.md` i samme leveranse (via `architecture-guardian`).
2. **Les eksisterende migrasjoner** i `db/migrations/` (rør aldri `drizzle/`, som eies av Lovable). Bygg aldri på antakelser om hva databasen inneholder; les siste `schema_version`.
3. **Ny migrasjonsfil** etter [MIGRATION_RULES](references/MIGRATION_RULES.md): én fil `db/migrations/NNNN_navn.sql` (neste løpenummer), avsluttes med ny rad i `schema_version`. Endre aldri en fil som kan være kjørt.
4. **Felles kolonner** på alle prosjekttabeller: `id uuid primary key`, `project_id uuid not null references public.projects(id)`, `created_at`, `created_by`, `revision int not null default 1` (redigerbare), `archived_at` i stedet for sletting.
5. **Identitet:** UUID (v7 generert i `src/core` gir sortering og idempotente kommandoer). Scenenummer (`production_numbering`) er tekst uten unik nøkkel og uten fremmednøkkel (INV-02).
6. **Uforanderlighet:** versjonstabeller (`screenplay_versions`, `resource_versions`, `imported_documents`, `export_versions`, `change_log`, filpekere i `takes`, `generation_prompts`, `script_block_revisions`) får trigger som avviser `update`/`delete`, og ingen skrivepolicy. **Blokkrevisjoner (DEC-0020 pkt. 5):** `script_block_revisions(block_id, rev, text, author, created_at)` og `script_blocks.current_rev`; `takes.produced_from.blockRevisions` viser til `rev`. `revision` på rader er bare samtidighetskontroll.
7. **RLS på alle tabeller** med mønstrene i [RLS_PATTERNS](references/RLS_PATTERNS.md): bare select-policy via `private.is_project_member`; `insert/update/delete` revoket for `authenticated`; skriving bare via `runCommand` → `public.apply_changes` (rolle ≥ editor, prosjekttilhørighet og revisjon per rad). Storage-policy etter prosjekt-ID i stien (kanonisk sti og bøtter i `DATA_RELATIONSHIPS.md` «Lagringsstruktur»).
8. **Skrivevei (DEC-0022, erstatter DEC-0020 pkt. 1 og 3):** klienten kaller serverfunksjonen `runCommand` (`src/adapters/storage/commands.functions.ts`). Den sjekker medlemskap/rolle (≥ editor), laster prosjektet med admin-klienten, kjører `applyCommand` i kjernen (validering + invarianter), lager endringssett med `diffStates` og lagrer det atomisk via `public.apply_changes(p_project, p_actor, p_command_id, p_command, p_inverse, p_changes)`. `apply_changes` kan bare kalles av `service_role`; den sjekker at `p_actor` har rolle ≥ editor, at alle rader tilhører prosjektet og revisjon per rad (avvik → SQLSTATE `P0409`), og skriver `change_log` med `inverse`. Ingen SQL-funksjon per kommando; de eneste RPC-ene klienten kan kalle er `public.create_project`, `public.create_invitation` og `public.accept_invitation`. Ny skrivbar tabell → utvid `v_tables` i `apply_changes` (ny migrasjon) og `TABLE_ORDER` i `src/core/patch.ts`.
9. **Produksjonsspesifikke overstyringer:** `scene_variants.owner_production_id` (null = delt), `continuity_events.production_id` (null = hovedfilm). Håndhev at en sceneforekomst bare peker på variant av samme scene som er delt eller eid av samme produksjon (sammensatt FK + trigger). Endring i spinoff skal aldri treffe delt rad (INV-04). Spinoffens `active_take_id` kan peke på hovedfilmens take (DEC-0020 pkt. 7); lokal kontinuitet via `continuity_overrides` (pkt. 8). Ingen `UNIQUE(production_id, scene_id)` (pkt. 10).
10. **Ingen cascade:** fremmednøkler med standard `no action`/`restrict`. Prosjektsletting er en egen eieroperasjon.
11. **Indekser** for `project_id`, alle fremmednøkler, kolonner policyer filtrerer på, og `(production_id, order_key)`; `order_key` med `collate "C"` (fraksjonelle nøkler sorteres bytevis).
12. **Gå gjennom** [SCHEMA_REVIEW_CHECKLIST](references/SCHEMA_REVIEW_CHECKLIST.md) og skriv RLS-/integrasjonstester (rollematrise, to brukere, revisjonskonflikt).
13. **Test lokalt** med `bun tests/db/run-db-tests.ts` (lokal Postgres + `tests/db/supabase-emulation.sql`).
14. **Lever** migrasjonen med synkmelding til Mars (Lovable kjører SQL-filen uendret, LOVABLE_SYNC.md) og øk `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/project-rows.ts`.

## 5. Leveranse
- `db/migrations/NNNN_<beskrivelse>.sql` + databasetester i `tests/db/run-db-tests.ts` (senere ev. `tests/rls/` og `tests/integration/`).
- Oppdatert `DATA_RELATIONSHIPS.md` ved skjemaendring; forventet skjemaversjon i adapterlaget.
- Til Mars: én kort norsk melding om at en databaseoppdatering må kjøres i Lovable (ferdig tekst fra LOVABLE_SYNC.md) – ingen SQL-forklaring.

## 6. Kontrollpunkter
- [ ] Ny fil, ingen endring i tidligere migrasjoner; `schema_version` oppdatert.
- [ ] RLS aktivert med select-policy for hver nye tabell, skriving revoket for `authenticated`; ingen `using (true)` på prosjektdata.
- [ ] `security definer`-funksjoner har `set search_path = ''` og fullt kvalifiserte navn. Klient-RPC-er sjekker `auth.uid()` og har `execute` bare for `authenticated`; `apply_changes` har `execute` bare for `service_role` og sjekker `p_actor` med `private.member_role_rank`.
- [ ] Revisjonssjekk per rad i `apply_changes` (INV-C1); konflikt gir `P0409`.
- [ ] Ingen `on delete cascade`, ingen hard sletting av produksjonsdata (INV-14, REQ-0316).
- [ ] Ingen nøkkel/relasjon på scenenummer (INV-02).
- [ ] Versjonstabeller er uforanderlige (INV-07, INV-13).
- [ ] Mediefiler refereres med Storage-sti + `sha256`; aldri bytes i tabeller, aldri overskriving av objekt (ny sti per innhold).
- [ ] Strukturkommandoer endrer én rekkefølge (`scene_occurrences.order_key`); ingen separat tidslinjerekkefølge (INV-01).
- [ ] Tid lagres som heltall bilder + rasjonell bildefrekvens (ADR-0006).

## 7. Typiske feil som må unngås
- Redigere en migrasjon som allerede er kjørt i Lovable Cloud i stedet for å lage en ny.
- Anta at Lovable kjører migrasjoner eller deployer funksjoner ved Git-synk (det gjør den ikke – ADR-0002).
- Skrive domenelogikk eller validering per kommando i SQL (dupliserer kjernen; DEC-0022).
- Legge migrasjoner i `supabase/migrations/` eller `drizzle/`.
- RLS-policy som spør `project_members` direkte fra en policy på `project_members` (rekursjon, feil 42P17).
- `security definer` uten `search_path = ''` eller med ukvalifiserte tabellnavn.
- Bruke `auth.uid()` ukapslet i policyer på store tabeller (bruk `(select auth.uid())`).
- Bruke service role i klienten, eller i serverkode uten egen tilgangssjekk.
- `update ... set revision = revision + 1` uten `where revision = expected`.
- Lagre «aktiv versjon» som status på takes i stedet for peker (`scene_occurrences.active_take_id`, DEC-0015).
- Kopiere delte scenevarianter til spinoff ved oppretting (gjenbruk er referanse; ny variant først ved lokal endring).
- Stole på at Postgres-versjonen i Cloud har en bestemt funksjon (f.eks. innebygd UUID v7) uten å sjekke `select version()`.

## 8. Akseptansekriterier / tester
- `tests/rls/role-matrix`: for hver tabell og rolle (ikke-medlem, viewer, commenter, editor, owner) – forventet lese/skrive-resultat (INV-C2).
- `invC1-revision-conflict`: to klienter, samme objekt, utdatert revisjon avvises, ingen data tapt.
- Uforanderlighet: `update`/`delete` på versjonstabeller feiler også for eier.
- Ingen cascade: statisk sjekk av migrasjonene (grep etter `cascade`) i testsuiten.
- INV-02 statisk: ingen FK/unik indeks inneholder `numbering`-kolonner.
- `apply_changes`: feil midt i endringssettet gir full tilbakerulling (ingen delvise rader, ingen `change_log`-rad); klienten kan ikke kalle `apply_changes` (42501).

## 9. Dokumentasjon og sporbarhet
- `docs/product/requirements.yaml`: `implementation` (migrasjonsfil, funksjonsnavn), `verification` (testfil + dato), `status` → `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py`.
- `docs/architecture/DATA_RELATIONSHIPS.md` ved enhver skjemaendring; ADR-0004/ADR-0005 ved endret mønster.
- `DECISION_LOG.md` (Teknisk anbefaling) for nye mønstre, f.eks. hjelpefunksjoner i eget `private`-skjema i stedet for `public` som ADR-0004 nevner.
- `docs/development/IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md` (hvilken migrasjon venter på kjøring), `KNOWN_ISSUES.md` (uverifiserte Cloud-egenskaper).

## Eksterne kilder
`supabase-postgres-best-practices` (supabase/agent-skills, MIT, v1.1.1) er vurdert som nyttig generell Postgres/RLS-veiledning (`docs/references/technical/SKILLS_ASSESSMENT.md` §2.16). Bruk den som referanse, eller installer den først etter `EXTERNAL_SKILLS_POLICY.md` (DEC-0016: kilde, lisens, pinnet versjon). Supabase-MCP med SQL-tilgang brukes bare mot et dev-prosjekt. Ved konflikt har denne skillen forrang, fordi den bærer prosjektets invarianter. Ikke kopier tekst ordrett.
