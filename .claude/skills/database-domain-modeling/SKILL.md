---
name: database-domain-modeling
description: Arbeidsmetode for Postgres-skjemaet i Lovable Cloud (Supabase) som realiserer domenemodellen (DOMAIN_MODEL.md, DATA_RELATIONSHIPS.md) – tabeller, permanente UUID-er, uforanderlige versjonstabeller (script_block_revisions m.fl.), revision-kolonne og revisjonskonflikt, RLS med bare lesing via private.is_project_member, all skriving via apply_command → private.cmd_* (DEC-0020), change_log, migrasjoner i supabase/migrations (bare nye filer, schema_version), Storage-referanser, produksjonsspesifikke overstyringer (owner_production_id, continuity_overrides), historikk og ingen cascade-sletting. Bruk ved SQL, migrasjoner, RLS, Storage-policyer, RPC-er, indekser eller endrede entiteter (Scene, SceneOccurrence, SceneVariant, ProductionSegment, Take, ScriptBlock, ContinuityEvent). Triggere – migrasjon, skjema, tabell, RLS, policy, RPC, database, Supabase, Postgres, revisjonskonflikt.
metadata:
  version: "0.2.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# database-domain-modeling

Hvordan domenemodellen blir et trygt, sporbart Postgres-skjema i Lovable Cloud. Skillen lager ikke produktkrav; tabellutkastet i `DATA_RELATIONSHIPS.md` er utgangspunktet.

## 1. Ansvar
**Eier:** tabeller, kolonner, nøkler og indekser; uforanderlighet og historikk i databasen; revisjonskontroll; RLS- og Storage-policyer; transaksjonelle RPC-er som speiler kommandoene i `src/core/commands`; migrasjonsfiler og `schema_version`; skjemagjennomgang.
**Eier ikke:**
- Hva kommandoene gjør og invariantlogikken i TypeScript → `scene-sync-invariants` / `architecture-guardian`.
- Hvordan Mars får kjørt migrasjonene i Lovable → `lovable-development` (`docs/development/LOVABLE_SYNC.md`).
- Generelle sikkerhetskrav (hemmeligheter, opplasting, logging) → `secure-development`.
- Testoppsett for RLS-/integrasjonstester → `test-quality-engineering` (denne skillen sier *hva* som må testes).
- Manusformat og importtolkning → `screenplay-engineering`.

## 2. Når den brukes
- Ny eller endret tabell, kolonne, indeks, constraint, trigger, funksjon eller policy.
- Ny kommando som trenger en RPC, eller endring i en eksisterende.
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
- DEC-0020 (skrivevei, hjelpefunksjoner i `private`, `P0409`, lagringssti, blokkrevisjoner, take-gjenbruk, `continuity_overrides`, `merged_into`, ingen `UNIQUE(production_id, scene_id)`).
- Referanser: [MIGRATION_RULES](references/MIGRATION_RULES.md), [RLS_PATTERNS](references/RLS_PATTERNS.md), [SCHEMA_REVIEW_CHECKLIST](references/SCHEMA_REVIEW_CHECKLIST.md).

## 4. Arbeidsprosedyre
1. **Start i domenet.** Finn entiteten i `DOMAIN_MODEL.md` og kravene. Endres modellen, oppdater `DOMAIN_MODEL.md`/`DATA_RELATIONSHIPS.md` i samme leveranse (via `architecture-guardian`).
2. **Les eksisterende migrasjoner** i `supabase/migrations/` (også filer Lovable kan ha laget). Bygg aldri på antakelser om hva databasen inneholder; les siste `schema_version`.
3. **Ny migrasjonsfil** etter [MIGRATION_RULES](references/MIGRATION_RULES.md): én fil, tidsstempel, beskrivende navn, avsluttes med ny rad i `schema_version`. Endre aldri en fil som kan være kjørt.
4. **Felles kolonner** på alle prosjekttabeller: `id uuid primary key`, `project_id uuid not null references public.projects(id)`, `created_at`, `created_by`, `revision int not null default 1` (redigerbare), `archived_at` i stedet for sletting.
5. **Identitet:** UUID (v7 generert i `src/core` gir sortering og idempotente kommandoer). Scenenummer (`production_numbering`) er tekst uten unik nøkkel og uten fremmednøkkel (INV-02).
6. **Uforanderlighet:** versjonstabeller (`screenplay_versions`, `resource_versions`, `imported_documents`, `export_versions`, `change_log`, filpekere i `takes`, `generation_prompts`, `script_block_revisions`) får trigger som avviser `update`/`delete`, og ingen skrivepolicy. **Blokkrevisjoner (DEC-0020 pkt. 5):** `script_block_revisions(block_id, rev, text, author, created_at)` og `script_blocks.current_rev`; `takes.produced_from.blockRevisions` viser til `rev`. `revision` på rader er bare samtidighetskontroll.
7. **RLS på alle tabeller** med mønstrene i [RLS_PATTERNS](references/RLS_PATTERNS.md): bare select-policy via `private.is_project_member`; `insert/update/delete` revoket for `authenticated`; skriving bare via `public.apply_command` som sjekker `private.has_project_role` og revisjon. Storage-policy etter prosjekt-ID i stien (kanonisk sti og bøtter i `DATA_RELATIONSHIPS.md` «Lagringsstruktur»).
8. **Én RPC-stil (DEC-0020 pkt. 1):** `public.apply_command(project_id, command, base_revisions)` med dispatch til interne `private.cmd_<kommando>`; ingen klienteksponerte RPC-er per kommando. Sjekk `auth.uid()`, medlemskap/rolle, lås rader (`for update`), sammenlign `base_revisions`, valider, utfør alt i én transaksjon, skriv `change_log` med `inverse`, returner nye revisjoner; konflikt → SQLSTATE `P0409`. Kommando-ID unik → trygt å prøve igjen.
9. **Produksjonsspesifikke overstyringer:** `scene_variants.owner_production_id` (null = delt), `continuity_events.production_id` (null = hovedfilm). Håndhev at en sceneforekomst bare peker på variant av samme scene som er delt eller eid av samme produksjon (sammensatt FK + trigger). Endring i spinoff skal aldri treffe delt rad (INV-04). Spinoffens `active_take_id` kan peke på hovedfilmens take (DEC-0020 pkt. 7); lokal kontinuitet via `continuity_overrides` (pkt. 8). Ingen `UNIQUE(production_id, scene_id)` (pkt. 10).
10. **Ingen cascade:** fremmednøkler med standard `no action`/`restrict`. Prosjektsletting er en egen eieroperasjon.
11. **Indekser** for `project_id`, alle fremmednøkler, kolonner policyer filtrerer på, og `(production_id, order_key)`; `order_key` med `collate "C"` (fraksjonelle nøkler sorteres bytevis).
12. **Gå gjennom** [SCHEMA_REVIEW_CHECKLIST](references/SCHEMA_REVIEW_CHECKLIST.md) og skriv RLS-/integrasjonstester (rollematrise, to brukere, revisjonskonflikt).
13. **Lever** migrasjonen med synkmelding til Mars (LOVABLE_SYNC.md) og øk forventet skjemaversjon i klienten (`src/adapters/storage/`).

## 5. Leveranse
- `supabase/migrations/<tidsstempel>_<beskrivelse>.sql` + tester i `tests/rls/` og `tests/integration/`.
- Oppdatert `DATA_RELATIONSHIPS.md` ved skjemaendring; forventet skjemaversjon i adapterlaget.
- Til Mars: én kort norsk melding om at en databaseoppdatering må kjøres i Lovable (ferdig tekst fra LOVABLE_SYNC.md) – ingen SQL-forklaring.

## 6. Kontrollpunkter
- [ ] Ny fil, ingen endring i tidligere migrasjoner; `schema_version` oppdatert.
- [ ] RLS aktivert med select-policy for hver nye tabell, skriving revoket for `authenticated`; ingen `using (true)` på prosjektdata.
- [ ] `security definer`-funksjoner har `set search_path = ''`, fullt kvalifiserte navn, sjekker `auth.uid()` og har `execute` bare for `authenticated`.
- [ ] Revisjonssjekk i hver skrivende RPC (INV-C1); konflikt gir egen feilkode.
- [ ] Ingen `on delete cascade`, ingen hard sletting av produksjonsdata (INV-14, REQ-0316).
- [ ] Ingen nøkkel/relasjon på scenenummer (INV-02).
- [ ] Versjonstabeller er uforanderlige (INV-07, INV-13).
- [ ] Mediefiler refereres med Storage-sti + `sha256`; aldri bytes i tabeller, aldri overskriving av objekt (ny sti per innhold).
- [ ] Strukturkommandoer endrer én rekkefølge (`scene_occurrences.order_key`); ingen separat tidslinjerekkefølge (INV-01).
- [ ] Tid lagres som heltall bilder + rasjonell bildefrekvens (ADR-0006).

## 7. Typiske feil som må unngås
- Redigere en migrasjon som allerede er kjørt i Lovable Cloud i stedet for å lage en ny.
- Anta at Lovable kjører migrasjoner eller deployer funksjoner ved Git-synk (det gjør den ikke – ADR-0002).
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
- Kommando-RPC: feil midt i gir full tilbakerulling (ingen delvise rader, ingen `change_log`-rad).

## 9. Dokumentasjon og sporbarhet
- `docs/product/requirements.yaml`: `implementation` (migrasjonsfil, RPC-navn), `verification` (testfil + dato), `status` → `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py`.
- `docs/architecture/DATA_RELATIONSHIPS.md` ved enhver skjemaendring; ADR-0004/ADR-0005 ved endret mønster.
- `DECISION_LOG.md` (Teknisk anbefaling) for nye mønstre, f.eks. hjelpefunksjoner i eget `private`-skjema i stedet for `public` som ADR-0004 nevner.
- `docs/development/IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md` (hvilken migrasjon venter på kjøring), `KNOWN_ISSUES.md` (uverifiserte Cloud-egenskaper).

## Eksterne kilder
`supabase-postgres-best-practices` (supabase/agent-skills, MIT, v1.1.1) er vurdert som nyttig generell Postgres/RLS-veiledning (`docs/references/technical/SKILLS_ASSESSMENT.md` §2.16). Bruk den som referanse, eller installer den først etter `EXTERNAL_SKILLS_POLICY.md` (DEC-0016: kilde, lisens, pinnet versjon). Supabase-MCP med SQL-tilgang brukes bare mot et dev-prosjekt. Ved konflikt har denne skillen forrang, fordi den bærer prosjektets invarianter. Ikke kopier tekst ordrett.
