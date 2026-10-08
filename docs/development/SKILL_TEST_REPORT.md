# Testrapport for skills – Animatic Studio

**Dato:** 2026-10-08
**Testet:** de 12 prosjektskillene i `.claude/skills/` (alle v0.1.0) mot scenariene S1–S9 i `docs/development/SKILL_TEST_SCENARIOS.md`.
**Utført av:** uavhengig testansvarlig (Claude). Ingen filer er endret. Den eneste filen som er skrevet, er denne rapporten.

---

## 1. Sammendrag

| Resultat | Antall | Scenarier |
|---|---|---|
| BESTÅTT | 7 | S1, S2, S3, S4, S5, S6, S9 (S2, S4, S6 og S9 med merknader) |
| DELVIS | 2 | S7 (kostnad/budsjett), S8 (engelsk filmeksport) |
| IKKE BESTÅTT | 0 | – |

Kjernen av synk-reglene (identitet, én rekkefølge, deaktivering, spinoff-varianter, avvik i stedet for overskriving, kontinuitet etter fortellingstid) er godt dekket. `scene-sync-invariants/references/OPERATIONS_MATRIX.md` og `TEST_SCENARIOS.md` gir riktig svar i nesten alle tilfeller. Svakhetene er:

1. **To ansvarshull:** kostnadsporten (INV-12) har ingen skill som faktisk eier den (S7), og språkeksport/eksportkontroll (kap. 23.3–23.8 og 29.6) dekkes ikke av noen skill (S8).
2. **Aktiveringen** passer for implementeringsoppgaver, men ikke godt for scenarier beskrevet som brukeratferd. Dette gjelder særlig `architecture-guardian` (S2, S6, S7) og `scene-sync-invariants` ved samtidig redigering (S9).
3. **Motsigelser mellom skills og dokumenter** finnes på flere punkter: skjema `public` mot `private` for RLS-hjelpefunksjonene, skrivepolicyer mot «bare RPC», stier i Storage, kommando- og funksjonsnavn i DEC-0010 og DEC-0011, og tabeller og kolonner som mangler i `DATA_RELATIONSHIPS.md`.

Det er 21 funn: 2 høye, 9 middels og 10 lave (§6).

---

## 2. Metode

For hvert scenario gjorde jeg følgende:

1. **Aktiveringstest:** Jeg leste bare scenarioteksten (kolonnen «Scenario») og vurderte hver av de 12 `description`-feltene (frontmatter) slik en agent ville gjort det ved automatisk valg av skill. Hver skill fikk en av disse vurderingene:
   - **Sikker:** et eksplisitt trigger- eller domeneord i beskrivelsen treffer.
   - **Sannsynlig:** det er et semantisk treff i brødteksten i beskrivelsen.
   - **Usikker:** skillen trigges bare hvis oppgaven formuleres som implementering, for eksempel «ny kommando» eller «ny tabell».
   - **Nei:** ingen treff.

   Aktiverte skills som ikke er forventet, er notert, både de nyttige og de som bare gir støy.
2. **Anbefaling:** Jeg leste de aktiverte skillene og fulgte henvisningene deres (SKILL.md → `references/` → `docs/architecture/*`, ADR-er, `DECISION_LOG.md`, `OPEN_QUESTIONS.md` og relevante mandatkapitler i `MASTER_SPECIFICATION.md`). Ut fra dette skrev jeg den anbefalingen en utvikler som følger skillene, ville kommet frem til.
3. **Vurdering:** Anbefalingen ble holdt opp mot «Riktig svar må» og «Feil hvis svaret». Kriteriene:
   - **BESTÅTT:** alle punktene i «må» nås via skillene eller dokumentene de viser til, og ingen punkter i «feil hvis» er sannsynlige.
   - **DELVIS:** noen punkter i «må» nås bare indirekte, via generelle prosedyrer, eller ikke i det hele tatt.
   - **IKKE BESTÅTT:** skillene leder til et svar som er feil etter scenarioets definisjon.
4. **Konsistenskontroll:** Jeg søkte med grep i hele `docs/` og `.claude/` etter kommandonavn, tabell- og kolonnenavn, RPC- og funksjonsnavn, skjemanavn og Storage-stier, og sammenlignet med `DOMAIN_MODEL.md`, `DATA_RELATIONSHIPS.md`, ADR-0004, ADR-0005, ADR-0008 og `DECISION_LOG.md`.
5. **Kontroll:** `python3 scripts/kb/check_kb.py` gir `OK` (530 krav, 12 skills). Lengden på `description`-feltene ble målt; alle er ≤ 1024 tegn.

**Begrensning:** Aktiveringen er vurdert analytisk og ikke målt med gjentatte modellkjøringer. Resultatene bør derfor bekreftes med en eval, for eksempel med `skill-creator`-metoden (flere kjøringer per scenario, med og uten skill).

---

## 3. Resultat per scenario

| # | Scenario (kort) | Forventet aktivering | Vurdert aktivering | Innhold | Samlet |
|---|---|---|---|---|---|
| S1 | Ferdig scene omnummereres 42 → 45 ved eksport | screenplay-engineering, scene-sync-invariants | Begge sikre | Alle «må»-punktene nås. «Ingen avvik/ingen generering» er bare implisitt. | **BESTÅTT** |
| S2 | Scene flyttes i manus | scene-sync-invariants, architecture-guardian | scene-sync sikker; architecture-guardian usikker; ux-interaction-design og screenplay-engineering trigges i tillegg | Alle punktene nås via OPERATIONS_MATRIX. Kommandonavnet i DEC-0011 er feil. | **BESTÅTT** (merknad om aktivering) |
| S3 | Scene deaktiveres | scene-sync-invariants | Sikker | Alle punktene nås, også skillet mot `ViewFilter`. | **BESTÅTT** |
| S4 | Spinoff redigerer delt scene | scene-sync-invariants, database-domain-modeling | scene-sync sikker; database-domain-modeling sannsynlig | Alle punktene nås. Gjenbruk av hovedfilmens takes i spinoff er ikke modellert. | **BESTÅTT** (merknad) |
| S5 | Norsk dialog endres; ferdig film og engelsk oversettelse finnes | scene-sync-invariants, specification-guardian | Begge sannsynlige | Alle punktene nås. Lagring av blokkrevisjoner er udefinert i skjemaet. | **BESTÅTT** |
| S6 | Maja klipper håret midt i scene 30; scene 52 er flashback | scene-sync-invariants, architecture-guardian | scene-sync sikker (trigger «Maja», «flashback»); architecture-guardian usikker | Alle punktene nås. Standardverdien for `storyTime` ved flytting er uklar, og det finnes ingen modell for lokal «fjerning» av en hendelse i spinoff. | **BESTÅTT** (merknader) |
| S7 | AI-generering over lengdegrense og budsjett | secure-development, architecture-guardian (+ fremtidig ai-cost-quality-governance) | secure-development sannsynlig; architecture-guardian usikker; scene-sync trigges i tillegg («segment») | Segmentering og kostnadsport nås bare via `API_INTEGRATIONS.md`. Ingen skill eier kostnadsporten, og automatisk forslag om segmentering ved modellgrense er ikke beskrevet. | **DELVIS** |
| S8 | Eksportere engelsk filmversjon | screenplay-engineering, scene-sync-invariants, specification-guardian | Alle tre usikre eller svake; specification-guardian trigges bare via «ALLTID» | Ingen skill omtaler språkeksport, undertekster, timingkonflikter (23.6) eller eksportkontroll (29.6). Riktig svar må hentes direkte fra mandatet. | **DELVIS** |
| S9 | To medlemmer redigerer samme replikk samtidig | scene-sync-invariants, database-domain-modeling | database-domain-modeling sikker («revisjonskonflikt»); scene-sync usikker; ux-interaction-design trigges i tillegg | Alle punktene nås. TS-11 tester bare `MoveOccurrence`, ikke samtidig `EditBlockText`, og det er uklart hvilken rad som bærer revisjonen. | **BESTÅTT** (merknader) |

---

## 4. Aktiveringsanalyse

### 4.1 Matrise (scenariotekst mot `description`)

Tegnforklaring: **S** = sikker, **s** = sannsynlig, **u** = usikker (bare ved implementeringsoppgave), **–** = nei. Fet = forventet i SKILL_TEST_SCENARIOS.

| Skill | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|
| specification-guardian | u | u | u | u | **s** | u | u | **u** | u |
| requirements-traceability | – | – | – | – | – | – | – | – | – |
| architecture-guardian | – | **u** | – | u | – | **u** | **u** | – | s |
| scene-sync-invariants | **S** | **S** | **S** | **S** | **s** | **S** | s | **u** | **u** |
| database-domain-modeling | – | – | – | **s** | – | – | – | – | **S** |
| screenplay-engineering | **S** | S (støy) | – | – | s | – | – | **u** | – |
| react-typescript-engineering | – | – | – | – | – | – | – | – | – |
| test-quality-engineering | – | – | – | – | – | – | – | – | – |
| design-system-director | – | – | – | – | – | – | – | – | – |
| ux-interaction-design | – | S (nyttig) | – | – | – | – | – | s | s (nyttig) |
| lovable-development | – | – | – | – | – | – | – | – | – |
| secure-development | – | – | – | – | – | – | **s** | – | s |

### 4.2 Observasjoner

- **Riktige skills trigges** i S1, S3, S4 og S6. Beskrivelsen til `scene-sync-invariants` er den beste i biblioteket: den nevner kommandoene og domenebegrepene ved navn.
- **`architecture-guardian` trigges ikke av atferdsbeskrivelser.** Beskrivelsen er rettet mot utviklerhandlinger («ny modul, ny tabell, ny kommando …»). I S2, S6 og S7 trigges den derfor bare hvis oppgaven er formulert som «implementer …». Enten må scenariene presiseres, eller så må forventet aktivering justeres (funn F-12).
- **`scene-sync-invariants` mangler ord for samtidighet og språk.** Beskrivelsen dekker INV-01–INV-14, men ikke INV-C1. Ord som «samtidig», «konflikt», «replikk», «dialog» og «oversettelse» mangler. S5 trigges via «EditBlockText» og «avvik», mens S9 bare trigges indirekte (F-13).
- **Overtilpassede triggere:** `scene-sync-invariants` har «Maja» som trigger. Det er navnet fra testscenariet og ikke et domenebegrep. Reelle oppgaver vil nevne andre karakterer (F-17).
- **For brede triggere:** `screenplay-engineering` trigges av «manus». Ordet finnes i nesten alle oppgaver i dette prosjektet, og S2 aktiverer derfor skillen uten at den er nødvendig. Skillen gir ikke feil svar, men den øker konteksten (F-18).
- **Nyttige tilleggsaktiveringer som bør inn i forventet liste:**
  - `ux-interaction-design` i S2: drag-and-drop med samme kommando `MoveOccurrence`.
  - `ux-interaction-design` i S9: konfliktdialog og angre per bruker i `INTERACTION_PATTERNS.md` §4 og §6.
  - `scene-sync-invariants` i S7: `CreateSegments(reason: model_limit)`, TS-07.
- **Ingen feil skill trigges i noe scenario.** Det finnes ingen skill med regler som strider mot riktig svar for et scenario den aktiveres i.
- **Hull i aktiveringen for S8:** Ingen beskrivelse nevner «språkversjon», «engelsk film», «undertekster», «dialogspor» eller «eksportkontroll». Det henger sammen med at fagskillen `multilingual-localization` bare er planlagt (`.claude/skills/README.md`).
- **Liten plass til å utvide `database-domain-modeling`:** beskrivelsen er på 1019 av 1024 tegn. Nye triggere krever at teksten kortes ned først (F-21).

---

## 5. Vurdering per scenario

### S1 – Ferdig scene omnummereres 42 → 45 ved ny eksport · BESTÅTT

**Anbefaling etter skillene:**
- Omnummerering er bare visningsdata. `numberScenes(occurrences, {kind:'sequential'}, …)` lager en ny `ExportVersion.numbering_table` med `occurrenceId → 45`.
- `SceneOccurrence.productionNumbering` er fortsatt «42». Eksporten skriver ikke tilbake; eventuell låsing skjer bare via egen kommando (`LockSceneNumbers`, ikke vedtatt).
- `sceneId`, `occurrenceId`, `activeTakeId`, takes og `TimeLink` er uendret.
- I versjonssammenligning vises scenen som omnummerert, ikke som ny.

**Henvisninger:**
- `screenplay-engineering/references/NUMBERING_RULES.md` «Grunnregel» og «Sikker endring av productionNumbering»
- `screenplay-engineering/SKILL.md` §4 punkt 7
- `scene-sync-invariants/references/TEST_SCENARIOS.md` TS-02
- `DOMAIN_MODEL.md` §2 (ExportVersion) og §3 (ExportScreenplay)
- `INVARIANTS.md` INV-02, INV-03

**Mot kriteriene:**
- «Beholde ID/occurrence/take» er dekket.
- «Nummer bare i ExportVersion» er dekket.
- «Ingen avvik, ingen ny generering» følger av at `Discrepancy.cause` ikke har noen nummer-årsak, og av kontrollpunktet «Ingen betalt jobb startes som bivirkning» (`scene-sync-invariants` §6). Ingen av de to stedene sier det eksplisitt for omnummerering (F-19, lav).
- Ingen av feilmønstrene er sannsynlige: DEBT_SIGNALS D2 og SCHEMA_REVIEW_CHECKLIST B forbyr nummer som nøkkel.

### S2 – Scene flyttes i manus · BESTÅTT (merknad)

**Anbefaling:**
- Én kommando, `MoveOccurrence(occurrenceId, newOrderKey)`, endrer bare `scene_occurrences.order_key` (fraksjonell nøkkel).
- Manus og montering leser den samme listen.
- Absolutte tidskoder beregnes på nytt; `TimeLink` (lokal tid), ID, nummer, take og `assembly_items` er uendret.
- `inverse` gir angre. RPC-en har revisjonskontroll.
- Flytting fra tidslinjen bruker samme kommando.

**Henvisninger:**
- `OPERATIONS_MATRIX.md` «MoveOccurrence»
- TS-03
- `scene-sync-invariants/SKILL.md` §4 punkt 4 («Én kilde til rekkefølge»)
- `architecture-guardian/references/DEBT_SIGNALS.md` D1
- ADR-0005, ADR-0006
- `RLS_PATTERNS.md` §4 (`cmd_move_occurrence`)

**Mot kriteriene:** Alle «må»-punktene er dekket. «To separate rekkefølger» stoppes eksplisitt av D1 og av INV-01.

**Merknader:**
- `architecture-guardian` trigges usikkert (F-12).
- DEC-0011 kaller kommandoen `MoveSceneOccurrence`. Det strider mot `DOMAIN_MODEL.md` §3 og alle skillene (F-07).

### S3 – Scene deaktiveres · BESTÅTT

**Anbefaling:**
- `SetOccurrenceActive(false)` endrer bare `active`.
- Scenen utelates fra aktivt manus, avspilling, varighet og eksport (OMITTED bare når eksporten velger å ta med deaktiverte scener).
- Ingenting slettes, og `orderKey` beholdes, slik at scenen kan gjenaktiveres til identisk tilstand.
- `ViewFilter` er en egen mekanisme.

**Henvisninger:**
- `OPERATIONS_MATRIX.md` «SetOccurrenceActive»
- TS-04, inkludert kontrastpunktet om filter
- `DOMAIN_MODEL.md` §0
- DEC-0015
- `scene-sync-invariants/SKILL.md` §7 («Skjule scene i UI-filter …»)
- NUMBERING_RULES «Deaktiverte scener»

**Mot kriteriene:** Alt er dekket. Ingen risiko for at data slettes eller at filtrering og deaktivering blandes.

**Merknad (ikke S3-feil):** Anbefalingen for `MergeScenes` gjenbruker `active=false` pluss `mergedInto` for den sammenslåtte scenen. `mergedInto` finnes ikke i `DOMAIN_MODEL.md`. Uten feltet kan en sammenslått scene gjenaktiveres som en vanlig deaktivert scene, og innholdet blir da duplisert (F-16).

### S4 – Spinoff redigerer en delt scene · BESTÅTT (merknad)

**Anbefaling:**
- Redigeringen bruker `EditBlockText` i spinoff-kontekst.
- Er varianten delt (`owner_production_id IS NULL`), opprettes en ny `SceneVariant` med `based_on_variant_id = V0` og `owner_production_id = spinoff`, og spinoffens forekomst pekes dit.
- Senere redigeringer gjenbruker den nye varianten.
- Hovedfilmens variant, take og avvik er uendret.
- Tilbakeføring skjer bare via `PromoteVariant` etter eksplisitt valg av deler. «Behold alt uendret» gir null endring.
- I databasen sikres dette med en sammensatt FK `(variant_id, scene_id)` og en trigger som sjekker at varianten er delt eller eid av samme produksjon.

**Henvisninger:**
- `OPERATIONS_MATRIX.md` «EditInSpinoff» og «PromoteVariant»
- TS-05
- `database-domain-modeling/SKILL.md` §4 punkt 9
- `RLS_PATTERNS.md` §5
- `DOMAIN_MODEL.md` §3
- `architecture-guardian/references/DEBT_SIGNALS.md` D7, D12

**Mot kriteriene:** Alt er dekket. Feilmønstrene «endrer hovedfilmens variant» og «automatisk tilbakeføring» stoppes eksplisitt.

**Merknad:** Mandat 24.3 krever at spinoffen kan gjenbruke ferdige filmklipp som referanser. I `DATA_RELATIONSHIPS.md` hører `takes` til `scene_occurrences|production_segments`, altså én produksjon, og `active_take_id` sier ikke om den kan peke på en take fra en annen produksjons forekomst. Hva som skjer med et gjenbrukt hovedfilm-klipp når spinoffen lager en lokal variant, er heller ikke beskrevet. Avviket skal oppstå i spinoffen, ikke i hovedfilmen (F-10).

### S5 – Norsk dialog endres; ferdig film og engelsk oversettelse finnes · BESTÅTT

**Anbefaling:**
- `EditBlockText` lager en ny blokkrevisjon med samme `blockId`.
- `Discrepancy` opprettes bare på takes, segmenter og lydtakes der `producedFrom.blockRevisions` inneholder blokken. `TimeLink` gir presis avgrensning.
- `LineTranslation` får status `needs_review`.
- Ingen take endres, aktiv peker er uendret, og ingen generering startes.
- Brukeren får tre valg: godkjenn (registreres med versjoner), oppdater (ny take ved siden av, kostnad vises først) eller angre (selektiv invers).

**Henvisninger:**
- `OPERATIONS_MATRIX.md` «EditBlockText»
- TS-09 og TS-10
- `DOMAIN_MODEL.md` §2 (Discrepancy, LineTranslation, Take.producedFrom) og §3
- `scene-sync-invariants/SKILL.md` §4 punkt 5 («Innhold vs. struktur»)
- `DATA_RELATIONSHIPS.md` «Viktige spørringer» (berørt materiale)
- `specification-guardian` §4 (INV-06, INV-07, INV-08)

**Mot kriteriene:** Alt er dekket. «Flagger hele filmen» hindres av kravet om «bare de berørte (21.3, via TimeLink)».

**Merknad:** Ingen tabell i `DATA_RELATIONSHIPS.md` lagrer blokkrevisjoner. `script_blocks` har bare `text`, og den uforanderlige historikken ligger bare i `screenplay_versions.snapshot`. Både `blockRevisions` (avviksdeteksjon) og «ny blokkrevisjon» forutsetter et revisjonsbegrep per blokk. Et slikt begrep er ikke definert, og det blandes med samtidighetskolonnen `revision` (F-08).

### S6 – Maja klipper håret midt i scene 30; scene 52 er flashback · BESTÅTT (merknader)

**Anbefaling:**
- En godkjent `ContinuityEvent` (langt → kort) forankres i `{sceneId: 30, blockId}`.
- Systemet foreslår `CreateSegments(reason: continuity_change)` med ett segment før og ett etter blokken. Hvert segment får riktig karaktertilstand.
- Scene 30 beholder `sceneId`, nummer og manus. Det lages ingen ny scene og ikke noe «30A».
- Gjeldende utseende beregnes fra hendelser sortert på `storyTime`. Scene 52 har `storyTime.kind = flashback` med tidligere `order` og får derfor langt hår, uavhengig av plasseringen.
- Flytting av scene 52 endrer ikke resultatet.

**Henvisninger:**
- TS-06
- `OPERATIONS_MATRIX.md` «CreateSegments»
- `scene-sync-invariants/SKILL.md` §7
- `DOMAIN_MODEL.md` §2 (ContinuityEvent, Scene.storyTime)
- `DATA_RELATIONSHIPS.md` (spørringen om gjeldende utseende)
- `architecture-guardian/references/DEBT_SIGNALS.md` D8 og D15
- Mandat 10.6 og 10.7

**Mot kriteriene:** Alt er dekket. «Lager ny scene» stoppes av D8 og INV-10, og «manusrekkefølge for kontinuitet» stoppes av D15 og INV-09.

**Merknader:**
- (a) `DOMAIN_MODEL.md` sier at standardverdien for `storyTime` er «rekkefølge i hovedmanus». `OPERATIONS_MATRIX` sier at `MoveOccurrence` ikke endrer `Scene.storyTime`. Det er ikke avklart om en lineær scene uten overstyring skal følge med når den flyttes, eller hvilken standardverdi en scene som bare finnes i en spinoff får (F-09).
- (b) TS-06 og mandat 10.8 krever en spinoff der Maja *ikke* klipper håret. Modellen kan bare *legge til* lokale hendelser (`continuity_events.production_id`). Den kan ikke undertrykke en delt hendelse lokalt (F-11).

### S7 – AI-generering overstiger lengdegrensen og budsjettet · DELVIS

**Anbefaling (det en utvikler kommer frem til):**
- Lengdegrensen håndteres med `CreateSegments(reason: model_limit)`. Manus, nummer og `sceneId` er uendret (TS-07, `DOMAIN_MODEL.md` §0, `architecture-guardian/references/DEBT_SIGNALS.md` D8).
- Kostnaden følger `API_INTEGRATIONS.md` §2: estimat fra adapteren, deretter godkjenning fra et medlem med `can_approve_costs` (`cost_approval` lagres på jobben).
- Deretter kontrollerer server-RPC-en `start_job` alle budsjettnivåer (strengeste gjelder; brukt beløp og retries teller med). Jobben avvises hvis grensen overskrides.
- Dette står også i `secure-development/SKILL.md` §4 punkt 4, `SECURITY_CHECKLIST.md` §5 og `THREAT_MODEL.md` T4.

**Mot kriteriene:**
- Kostnadsestimat, stopp ved budsjett, godkjenning med kostnadsrett og at retries teller nås, men bare fordi `secure-development` viser til `API_INTEGRATIONS.md`.
- «Automatisk segmentering uten manusendring» nås bare hvis `scene-sync-invariants` eller `architecture-guardian` aktiveres. Ingen av de to er sikre fra scenarioteksten.

**Hvorfor DELVIS:**
1. **Ingen skill eier kostnadsporten.** `secure-development` §1 sier at «Kostnadsport-logikk (INV-12) → `scene-sync-invariants`/`architecture-guardian`». Ingen av de to har prosedyre, tester eller referanse for INV-12. De har bare én linje i en sjekkliste («Ingen betalt jobb startes som bivirkning», og «kostnader (INV-12)» i ARCHITECTURE_REVIEW_CHECKLIST A). Ansvaret faller mellom stolene til `ai-cost-quality-governance` finnes (F-02, høy).
2. **Prosessen ved overskridelse er ikke beskrevet.** Ingen skill beskriver at systemet *automatisk foreslår* segmentering når `capabilities().maks varighet` overskrides (mandat 18.1). Det er heller ikke beskrevet at N segmenter gir N jobber med samlet estimat og én godkjenning, eller hva som skjer når faktisk kostnad passerer budsjettet *under* en kjøring. `API_INTEGRATIONS.md` §2 punkt 4 sier bare at «avvik mot estimat vises».
3. **Jobbstatusen mangler en tilstand for venting.** `GenerationJob.status` har ingen tilstand for «venter på godkjenning» eller «stoppet av budsjett» (`DOMAIN_MODEL.md` §2). INV-12 håndheves derfor bare som en overgang fra `queued` til `generating`, uten en synlig tilstand brukeren kan forstå.

### S8 – Eksportere engelsk filmversjon · DELVIS

**Anbefaling (det en utvikler kommer frem til):**
- Via `specification-guardian` §4 finner utvikleren kravene i kap. 23.3–23.8, 29.4 og 29.6.
- Via `DOMAIN_MODEL.md` finner utvikleren `LanguageVersion` (`nb` er hovedspråk), `Assembly` per produksjon *og språk`, `LineTranslation.status` og `Discrepancy.cause ∈ {translation_outdated, timing_conflict}`.
- INV-05 og INV-06 forbyr endring av norsk tekst.
- Riktig svar kan derfor nås: samme sceneidentiteter og samme visuelle materiale, engelske dialogspor og undertekster, varsel om manglende oversettelser og timingkonflikter, eksportkontroll og ingen endring i norsk.

**Hvorfor DELVIS:**
1. **Aktiveringen er svak.** Ingen av de tre forventede skillene har ord for språkversjon, film-eksport eller undertekster. `screenplay-engineering` handler om *manus*-eksport, ikke film. `scene-sync-invariants` nevner ikke språk.
2. **Ingen skill omtaler eksportkontrollen** i mandat 29.6 (aktiv sceneorden, skjulte scener, manglende medier, uavklarte avvik, språkspor, varighet). Den eneste omtalen er én linje i `ux-interaction-design/references/INFORMATION_ARCHITECTURE.md`.
3. **Mandat 23.6 er ikke dekket.** Kravet om at «språkspesifikke timingendringer ikke automatisk endrer hovedfilmens timing» står bare i TS-10. Det finnes ingen kommando i OPERATIONS_MATRIX for språkspesifikk timing (F-03).

**Feilmønstre:** «Ny kopi av prosjektet» er lite sannsynlig, fordi `DOMAIN_MODEL.md` modellerer språk innenfor én produksjon. Men det er ingen skill som eksplisitt sier fra om risikoen. Produksjonstypen `alternative` kan feilaktig brukes til en engelsk versjon.

### S9 – To medlemmer redigerer samme replikk samtidig · BESTÅTT (merknader)

**Anbefaling:**
- Begge sender `EditBlockText` med `base_revisions`.
- RPC-en låser raden (`for update`) og sammenligner revisjonen. Den første skrivingen lykkes. Den andre avvises med `revision_conflict` (`P0409` → `RevisionConflict` i adapteren).
- Klienten henter gjeldende versjon og viser konflikten med valgene behold, bruk din på nytt eller flett manuelt. Ingenting forkastes stille.
- Angre er per bruker: inversen sendes som en ny kommando, og gir konflikt hvis andre har endret objektet.

**Henvisninger:**
- `database-domain-modeling/references/RLS_PATTERNS.md` §4
- `database-domain-modeling/SKILL.md` §6 og §7 («`update … set revision = revision + 1` uten `where revision = expected`»)
- ADR-0004 «Samtidighet» og «Angre er per bruker»
- `architecture-guardian/references/DEBT_SIGNALS.md` D10
- `ux-interaction-design/references/INTERACTION_PATTERNS.md` §4 og linje 80
- `react-typescript-engineering/references/STATE_AND_COMMANDS.md` §3
- TS-11

**Mot kriteriene:** Alt er dekket, og «siste skriving vinner» stoppes eksplisitt av D10.

**Merknader:**
- TS-11 og `scene-sync-invariants` §4 punkt 9 tester konflikten med `MoveOccurrence`. Det finnes ikke noe scenario for samtidig `EditBlockText` på *samme replikk*, eller på *ulike replikker i samme scene*. Det siste viser om revisjonen ligger på riktig nivå (F-14).
- Det er uklart om `revision` for tekst ligger på `script_blocks`, `dialogue_lines` eller `scene_variants` (se F-08).
- `secure-development` anbefaler skrivepolicyer for insert, update og delete, og ADR-0004 er tvetydig. Følger en utvikler den linjen, kan klienten skrive direkte og omgå revisjonssjekken (F-01, høy).

---

## 6. Funn

Alvorlighet:
- **Høy:** kan føre til brudd på en P0-invariant eller til at et P0-område mangler eier.
- **Middels:** motsigelse eller hull som gir sannsynlig feil eller ulik implementering.
- **Lav:** presisjon, vedlikehold eller støy.

Merk: `DECISION_LOG.md` sier at beslutninger aldri endres i ettertid. Der rettelsen gjelder en DEC, er forslaget derfor en ny DEC (Teknisk anbefaling) som presiserer, ikke redigering av den gamle.

| ID | Alv. | Fil(er) | Funn | Foreslått rettelse |
|---|---|---|---|---|
| F-01 | **Høy** | `secure-development/SKILL.md` §6 («Ny tabell har RLS aktivert + policyer for select/insert/update/delete»); `decisions/adr/ADR-0004-samarbeid-tilgang.md` («skriving krever rolle via `public.has_project_role`»); mot `DATA_RELATIONSHIPS.md` «Felles regler», `database-domain-modeling/references/RLS_PATTERNS.md` §2 og `SCHEMA_REVIEW_CHECKLIST.md` D («Ingen skrivepolicy … revoke») | Motsigelse om skrivepolicyer. Følger utvikleren `secure-development` og ADR-0004, får klienten lov til å `update` direkte med bare en rollesjekk. Da omgås revisjonskontrollen (INV-C1), `change_log` (ADR-0005) og validering i RPC. Det åpner for «siste skriving vinner» (S9). | Skriv eksplisitt i ADR-0004 (ny DEC som presiserer) og i `secure-development` §6 og `SECURITY_CHECKLIST.md` §2: «Prosjekttabeller har bare select-policy; insert/update/delete revokeres; skriving bare via security definer-RPC. Unntak (f.eks. per-bruker `ViewFilter`) listes eksplisitt.» Legg til en test i `tests/rls/` som bekrefter at direkte `update` feiler for owner. |
| F-02 | **Høy** | `secure-development/SKILL.md` §1 («Kostnadsport-logikk (INV-12) → scene-sync-invariants/architecture-guardian»); `scene-sync-invariants/SKILL.md`; `architecture-guardian/SKILL.md` | Kostnadsporten (INV-12, REQ-0528, mandat 19.5–19.6) har ingen eier. De to skillene som får ansvaret, har ingen prosedyre, referanse eller test for den. S7 består bare delvis. | Inntil `ai-cost-quality-governance` finnes: flytt eierskapet til `secure-development` (backend-håndheving) og legg til en kort referanse `references/COST_GATE.md`. Den bør dekke estimat, samlet godkjenning for alle segmenter i én jobbgruppe, `start_job`-sjekker, stopp når faktisk kostnad passerer grensen under kjøring, at retries teller, og `inv12-cost-approval`-testen. Oppdater §1 i begge skills. Legg til «budsjett», «kostnad» og «generering» i beskrivelsen til `secure-development`. |
| F-03 | Middels | Ingen skill (hull); `ux-interaction-design/references/INFORMATION_ARCHITECTURE.md` er eneste omtale | Språkeksport, undertekster, separate dialogspor, timingkonflikter (23.6) og eksportkontroll (29.6) mangler i skillene. S8 består bare delvis. | Legg til TS-13 «Engelsk filmeksport» i `scene-sync-invariants/references/TEST_SCENARIOS.md` (samme `sceneId`/takes, `Assembly` for `en`, `needs_review` gir varsel, `timing_conflict`, ingen endring i `nb`). Legg til en seksjon «Eksportkontroll (29.6)» i `screenplay-engineering` (manus) og en peker til den for film. Utvid beskrivelsene med «språkversjon, engelsk film, undertekster, eksportkontroll». Prioriter `multilingual-localization` i ROADMAP. |
| F-04 | Middels | `decisions/adr/ADR-0004-samarbeid-tilgang.md` og `secure-development/SKILL.md` §4 punkt 3 (`public.is_project_member`); mot `database-domain-modeling/references/RLS_PATTERNS.md` §1–§7, `MIGRATION_RULES.md` §3 og `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` (`private.`); `SECURITY_CHECKLIST.md` §2 («ikke-eksponert skjema *eller* begrenset execute») | Skjemaet for RLS-hjelpefunksjonene er uavklart. RLS_PATTERNS bruker `private.*` i alle eksempler og sier samtidig at valget først må registreres som DEC. Det er ikke gjort. To utviklere vil skrive ulike migrasjoner. | Ta beslutningen nå: ny DEC (Teknisk anbefaling) «Hjelpefunksjoner i `private`-skjema» og ny ADR-status eller tillegg for ADR-0004. Oppdater `secure-development` §4 punkt 3 og `SECURITY_CHECKLIST.md` §2 til `private.is_project_member` og `private.has_project_role`. |
| F-05 | Middels | `DATA_RELATIONSHIPS.md` «Lagringsstruktur» (`<bucket>/<project_id>/<entity_id>/<sha256>.<ext>`, bøttene `sources/resources/generated/renders-tmp/exports/backups`); `secure-development/SKILL.md` §4 punkt 6 (`<project_id>/<kategori>/…`); `SECURITY_CHECKLIST.md` §4 (`<project_id>/<source\|generated\|temp\|exports\|history>/<id>`); `RLS_PATTERNS.md` §6 (bøtteliste uten `renders-tmp`, `backups`) | Tre ulike stiskjemaer og ulike navn på bøttene. Storage-policyen leser prosjekt-ID fra `foldername(name)[1]`, så avvikende stier kan gi utilsiktet nektet eller manglende tilgang. Uten `sha256` i stien er også «ingen overskriving» (D5) svekket. | Bruk `DATA_RELATIONSHIPS.md` som fasit. Rett `secure-development` §4 punkt 6 og `SECURITY_CHECKLIST.md` §4 til samme mønster og samme bøttenavn. Utvid policyeksemplet i RLS_PATTERNS §6 med alle bøtter, eller begrunn hvorfor noen er utelatt. |
| F-06 | Middels | `DECISION_LOG.md` DEC-0010 (`is_project_member()`/`project_role()`); mot ADR-0004 og skillene (`has_project_role`) | Funksjonsnavnet i DEC-0010 stemmer ikke med ADR-0004 og skillene. | Ny DEC (Teknisk anbefaling) eller en merknad i ADR-0004 om at det kanoniske navnet er `has_project_role(project_id, min_role)`. Rediger ikke DEC-0010. |
| F-07 | Middels | `DECISION_LOG.md` DEC-0011 (`MoveSceneOccurrence`); mot `DOMAIN_MODEL.md` §3 og alle skills (`MoveOccurrence`) | Kommandonavnet er ulikt. En utvikler som starter i beslutningsloggen, kan lage et annet kommandonavn i `change_log.command_type`. | Som for F-06: presiser i ny DEC eller i ADR-0005 at kanoniske kommandonavn står i `DOMAIN_MODEL.md` §3 og `OPERATIONS_MATRIX.md`. |
| F-08 | Middels | `DATA_RELATIONSHIPS.md` (`script_blocks` uten revisjonshistorikk); `DOMAIN_MODEL.md` §2 (`Take.producedFrom.blockRevisions`, ScriptBlock «snapshot»); `OPERATIONS_MATRIX.md` «EditBlockText» («ny blokkrevisjon (samme blockId)») | «Blokkrevisjon» (innholdsversjon) er ikke modellert som tabell og blandes med samtidighetskolonnen `revision`. Avviksdeteksjon (S5) og revisjonskonflikt (S9) bygger begge på dette. | Definer i `DOMAIN_MODEL.md` og `DATA_RELATIONSHIPS.md`: enten `script_block_revisions(block_id, rev_no, text, created_by, …)` som bare tillater insert, med `script_blocks.current_rev`, eller at `script_blocks.revision` *er* blokkrevisjonen og historikken ligger i `change_log`. Skriv at `revision` for tekstredigering ligger på blokk- eller replikknivå (ikke variant), slik at redigering av ulike replikker i samme scene ikke gir konflikt. Legg til uforanderlighetstrigger i SCHEMA_REVIEW_CHECKLIST C. |
| F-09 | Middels | `DOMAIN_MODEL.md` §0 og §2 (`storyTime` standard = rekkefølge i hovedmanus); `OPERATIONS_MATRIX.md` «MoveOccurrence» («Skal IKKE endres: `Scene.storyTime`») | Det er uklart om `storyTime` er avledet eller lagret for scener uten overstyring. Etter flytting av en lineær scene kan kontinuiteten bli feil, enten fordi `storyTime` ikke følger med, eller fordi den uventet gjør det. Standardverdi for scener som bare finnes i spinoff, er ikke definert. | Presiser i DOMAIN_MODEL: `storyTime.overridden: boolean`. Er den `false`, avledes `order` fra hovedfilmens aktive rekkefølge (og for spinoff-scener fra spinoffens rekkefølge, eller ved innsettingspunkt). Er den `true`, lagres verdien fast. Oppdater OPERATIONS_MATRIX («MoveOccurrence endrer ikke lagret storyTime; avledet verdi følger ny rekkefølge») og legg til et testpunkt i TS-03 og TS-06. Hvis tolkningen påvirker hva brukeren ser, legg den inn som Q-11 i `OPEN_QUESTIONS.md`. |
| F-10 | Middels | `DATA_RELATIONSHIPS.md` (`takes` → `scene_occurrences\|production_segments`); `OPERATIONS_MATRIX.md` «EditInSpinoff»; mandat 24.3 | Gjenbruk av hovedfilmens ferdige klipp i spinoff «basert på referanser» er ikke modellert. Det er ikke beskrevet om spinoffens `active_take_id` kan peke på en take fra en annen forekomst, eller hva som skjer med den når en lokal variant lages. | Legg til i DOMAIN_MODEL: take eies av scene eller variant, ikke av forekomst. Alternativt: tillat referanse på tvers av produksjoner med FK-regel. Utvid «EditInSpinoff» med «gjenbrukt hovedfilm-take får `Discrepancy` *i spinoffens kontekst*, og hovedfilmen ingen». Legg til et punkt i TS-05. |
| F-11 | Middels | `DOMAIN_MODEL.md` (`ContinuityEvent.productionId`); `DATA_RELATIONSHIPS.md` (kontinuitetsspørring); TS-06 siste punkt; mandat 10.8 | En spinoff kan bare *legge til* lokale hendelser. Det finnes ingen mekanisme for å *undertrykke* en delt hendelse lokalt («Maja klipper ikke håret»). Det TS-06 krever, kan dermed ikke realiseres slik modellen er. | Legg til `continuity_overrides(production_id, event_id, action: suppress\|replace)` eller `ContinuityEvent.overridesEventId`. Oppdater spørringen i DATA_RELATIONSHIPS og RLS_PATTERNS §5. |
| F-12 | Middels | `docs/development/SKILL_TEST_SCENARIOS.md` (forventet aktivering); `architecture-guardian/SKILL.md` (`description`) | Forventet aktivering av `architecture-guardian` i S2, S6 og S7 forutsetter en implementeringsoppgave. Scenariotekstene beskriver brukeratferd, og aktiveringen er derfor usikker. | Enten: formuler scenariene som oppgaver («Implementer/vurder løsning for at …»). Eller: legg til ord for atferd i beskrivelsen («flytte/deaktivere/segmentere – ny eller endret kommando»). Legg i tillegg til `ux-interaction-design` som forventet i S2 og S9, og `scene-sync-invariants` i S7. |
| F-13 | Lav | `scene-sync-invariants/SKILL.md` (`description`) | Beskrivelsen mangler INV-C1 og ordene «replikk», «dialog», «oversettelse», «samtidig», «konflikt». S5 og S9 trigges derfor bare indirekte. | Bytt «Maja» (F-17) mot «replikkendring, oversettelse needs_review, samtidig redigering/revisjonskonflikt (INV-C1), kontinuitet/karaktertilstand». Det er ca. 130 tegn ledig. |
| F-14 | Middels | `scene-sync-invariants/references/TEST_SCENARIOS.md` TS-11; `scene-sync-invariants/SKILL.md` §4 punkt 9 | Samtidighet testes bare med `MoveOccurrence`. Det finnes ikke noe scenario for samtidig `EditBlockText` på samme replikk (S9), eller på ulike replikker i samme scene (granularitet). Angre per bruker etter at en annen har endret objektet, er heller ikke dekket. | Utvid TS-11 eller lag TS-14: (a) samme replikk gir konflikt, ingen tap og en konfliktdialog; (b) ulike replikker i samme scene gir to vellykkede skrivinger; (c) A angrer etter Bs endring og får konflikt, ikke en stille invers. |
| F-15 | Middels | `DATA_RELATIONSHIPS.md` mot skills og ADR-er | Skjemautkastet er ufullstendig i forhold til det skillene viser til: <br>• `render_jobs` mangler (ADR-0008, ARCHITECTURE §2, SECURITY_CHECKLIST §2) <br>• `change_log.production_id` mangler (ADR-0005, RLS_PATTERNS §4) <br>• `schema_version.description` mangler (MIGRATION_RULES §4) <br>• `project_members.removed_at` og `can_approve_costs` mangler (RLS_PATTERNS §1, ADR-0004) <br>• `production_segments.order_key` heter `orderInOccurrence` i DOMAIN_MODEL og OPERATIONS_MATRIX | Oppdater `DATA_RELATIONSHIPS.md` (og kolonnelisten for `project_members` i ADR-0004) slik at alle tabeller og kolonner skillene bruker, står der med samme navn. `database-domain-modeling` sier at DATA_RELATIONSHIPS er utgangspunktet, så den må være komplett. |
| F-16 | Lav | `scene-sync-invariants/references/OPERATIONS_MATRIX.md` «MergeScenes» (`mergedInto`, `active=false`); `DOMAIN_MODEL.md` | `mergedInto` finnes ikke i modellen. Gjenbruk av `active=false` gjør at en sammenslått scene kan gjenaktiveres som en vanlig deaktivert scene, og innholdet blir da duplisert. | Legg `mergedInto` inn i DOMAIN_MODEL (på `SceneOccurrence`) og si at `SetOccurrenceActive(true)` avvises når den er satt (bare angring av `MergeScenes` gjenoppretter). Vis til Q-07 i stedet for det generelle «Åpent». |
| F-17 | Lav | `scene-sync-invariants/SKILL.md` (`description`: «Maja») | Trigger hentet fra testscenariet, ikke et domenebegrep. Overtilpasset. | Erstatt med «kontinuitet, karaktertilstand, utseende». |
| F-18 | Lav | `screenplay-engineering/SKILL.md` (`description`: trigger «manus») | For bred trigger. Den aktiverer skillen i nesten alle oppgaver (f.eks. S2) og øker konteksten unødvendig. | Snevr inn til «manusimport, manusformat, manusvisning/paginering, manuseksport, scenenummer». |
| F-19 | Lav | `scene-sync-invariants/references/TEST_SCENARIOS.md` TS-02 | «Ingen `Discrepancy` og ingen `GenerationJob` ved omnummerering» er bare implisitt (S1). | Legg til «**Og** ingen avvik opprettes og ingen generering startes» i TS-02. |
| F-20 | Lav | `screenplay-engineering/references/NUMBERING_RULES.md` «Deaktiverte scener»; `docs/product/OPEN_QUESTIONS.md` Q-08 | NUMBERING_RULES sier «registrer i OPEN_QUESTIONS før implementering» og foreslår en annen midlertidig løsning (eksplisitt innstilling) enn Q-08 («utelates ved fortløpende»). | Vis til Q-08 og bruk den midlertidige løsningen der, eller oppdater Q-08. |
| F-21 | Lav | Flere skills | Vedlikehold og henvisninger: <br>• `database-domain-modeling` sin `description` er 1019/1024 tegn, så det er ikke plass til nye triggere. <br>• `SESSION_HANDOVER.md` og `CURRENT_WORK.md` vises til i nesten alle skills, men finnes ikke i `docs/development/`. <br>• `secure-development` §3 og `SECURITY_CHECKLIST.md` §9 sier «EXTERNAL_SKILLS_POLICY.md når den finnes», men filen finnes. <br>• `database-domain-modeling` §3 sier «LOVABLE_SYNC.md (hvis den finnes)», men den finnes. <br>• RPC-stil: `apply_command` (ARCHITECTURE §4, ROADMAP, `architecture-guardian`) mot `cmd_move_occurrence` per kommando (RLS_PATTERNS §4). <br>• `UNIQUE(production_id, scene_id)` hindrer at samme scene brukes to ganger i én produksjon, f.eks. to utdrag i en trailer (24.6) eller en gjentatt scene. | Kort ned beskrivelsen. Opprett malene for `SESSION_HANDOVER.md` og `CURRENT_WORK.md`, eller skriv «opprettes ved første økt». Fjern «når/hvis den finnes». Velg én RPC-stil (anbefaling: `apply_command` med dispatch til interne `cmd_*`-funksjoner) og skriv den i ADR-0005. Vurder unikhetsregelen mot 24.6 og legg den inn som åpent spørsmål hvis den begrenser produktet. |

---

## 7. Anbefalte endringer i `SKILL_TEST_SCENARIOS.md`

- **S2:** legg til `ux-interaction-design` (drag-and-drop med samme kommando).
- **S7:** legg til `scene-sync-invariants` (`CreateSegments(model_limit)`).
- **S9:** legg til `ux-interaction-design` (konfliktdialog, angre per bruker).
- **S8:** «Skal aktivere» bør si at det i dag ikke finnes noen dekkende skill (planlagt `multilingual-localization`). Alternativt bør F-03 rettes først.
- Presiser at scenariene testes som *oppgaver* («Hvordan skal dette implementeres/oppføre seg?»), slik at aktiveringen av utviklerrettede skills blir rettferdig vurdert (F-12).
- Nye scenarier:
  - S10: samtidig redigering av *ulike* replikker i samme scene (granularitet, F-08 og F-14).
  - S11: spinoff gjenbruker et ferdig klipp fra hovedfilmen og endrer så scenen (F-10).
  - S12: spinoff der en delt kontinuitetshendelse ikke skal gjelde (F-11).

## 8. Neste steg

1. Rett de to høye funnene først: F-01 (skrivepolicyer) og F-02 (eier av kostnadsporten). Begge bør være på plass før M1, der RLS og `apply_command` etableres (ROADMAP).
2. Avklar F-04, F-06, F-07 og F-15 i én «navne- og skjemaharmonisering» (ny DEC som Teknisk anbefaling + oppdatert `DATA_RELATIONSHIPS.md` og ADR-0004/0005). Kjør deretter `check_kb.py`.
3. Ta F-08–F-11 inn i domenemodellen før fase 1-skjemaet skrives. F-09 kan kreve et produktsvar fra Mars.
4. Kjør testen på nytt etter rettelsene, helst som en målt eval med flere kjøringer per scenario.

---

## 9. Retest etter DEC-0020 (versjon 0.2.0)

**Dato:** 2026-10-08
**Testet:** skillene etter rettelsene som følger DEC-0020 og funnene i §6. Endret til `metadata.version: "0.2.0"`: `secure-development`, `scene-sync-invariants`, `screenplay-engineering`, `architecture-guardian`, `database-domain-modeling`, `test-quality-engineering`, `specification-guardian`. I tillegg er `.claude/skills/README.md` og `SKILL_TEST_SCENARIOS.md` oppdatert (nye scenarier S10–S12, merknad om S8, oppgaveformulering, justert forventet aktivering i S2/S7/S9). `docs/product/*`, `docs/decisions/*`, `docs/architecture/*` og `CLAUDE.md` er ikke endret.
**Metode:** som i §2 (aktivering vurdert fra scenarioteksten mot `description`, innhold fra SKILL.md → `references/` → arkitekturdokumenter og DEC-0020). Scenariene er nå vurdert som oppgaver («hvordan skal dette implementeres/oppføre seg»), slik `SKILL_TEST_SCENARIOS.md` sier. `python3 scripts/kb/check_kb.py` gir `OK` (530 krav, 12 skills). Alle `description`-felt er ≤ 1000 tegn og inneholder ikke «: ».
**Begrensning:** fortsatt analytisk vurdering, ikke målt eval.

### 9.1 Resultat per scenario

| # | Scenario (kort) | Forventet aktivering | Vurdert aktivering | Innhold | Samlet |
|---|---|---|---|---|---|
| S1 | Omnummerering 42 → 45 ved eksport | screenplay-engineering, scene-sync-invariants | Begge sikre («eksportnummerering», «omnummerere») | TS-02 sier nå eksplisitt: ingen `Discrepancy`, ingen `GenerationJob`. | **BESTÅTT** |
| S2 | Scene flyttes i manus | scene-sync-invariants, architecture-guardian, ux-interaction-design | scene-sync sikker; ux sikker (dra-og-slipp, `MoveOccurrence`); architecture-guardian sannsynlig (atferd som berører både manus og film). screenplay-engineering trigges ikke lenger av «manus» alene | `MoveOccurrence` konsekvent; én RPC-stil; fortellingstid for lineære scener følger hovedfilmens rekkefølge (DEC-0020 pkt. 6). | **BESTÅTT** |
| S3 | Scene deaktiveres | scene-sync-invariants | Sikker | Uendret riktig. `MergeScenes` bruker nå `scenes.merged_into`; gjenaktivering avvises uten `UnmergeScene`. | **BESTÅTT** |
| S4 | Spinoff redigerer delt scene | scene-sync-invariants, database-domain-modeling | scene-sync sikker; database sannsynlig | Take-gjenbruk i spinoff og avvik i spinoffens kontekst er beskrevet (OPERATIONS_MATRIX, TS-05, RLS_PATTERNS §5). | **BESTÅTT** |
| S5 | Norsk dialog endres; film og engelsk finnes | scene-sync-invariants, specification-guardian | scene-sync sikker («endret replikk eller dialog», «oversettelse»); specification-guardian sannsynlig | `script_block_revisions` + `current_rev`; `revision` bare samtidighet; avvik når `producedFrom` har eldre `rev`. | **BESTÅTT** |
| S6 | Utseendeendring midt i scene 30; scene 52 flashback | scene-sync-invariants, architecture-guardian | scene-sync sikker («flashback», «karakterens utseendeendring midt i scene»; «Maja» er fjernet som trigger); architecture-guardian sannsynlig | Fortellingstidsregelen og lokal overstyring (`continuity_overrides`) er beskrevet; TS-06 bruker `disable`. | **BESTÅTT** |
| S7 | AI-generering over lengde og budsjett | secure-development, scene-sync-invariants, architecture-guardian (+ ai-cost-quality-governance fra M5) | secure-development sikker («budsjett», «kostnadsgodkjenning», «generering»); scene-sync sannsynlig («segment»); architecture-guardian sannsynlig | `secure-development` §4 punkt 4 eier kostnadsporten midlertidig: estimat, samlet godkjenning for jobbgruppe, `private.can_approve_costs`, alle budsjettnivåer i `start_job`, stopp under kjøring, retries teller. Automatisk forslag om segmentering ved `capabilities()`-grense står i `scene-sync-invariants` §4 punkt 10. | **BESTÅTT** (merknad) |
| S8 | Eksportere engelsk filmversjon | screenplay-engineering, scene-sync-invariants, specification-guardian (+ multilingual-localization fra M7) | scene-sync sannsynlig («språkversjon»); de to andre usikre | TS-13 dekker samme identiteter, `Assembly` for `en`, eksportkontroll og 23.6. Ingen skill eier språkeksport ennå. | **DELVIS** (forventet til M7) |
| S9 | To medlemmer redigerer samme replikk | scene-sync-invariants, database-domain-modeling, ux-interaction-design | scene-sync sikker («samtidig redigering», «revisjonskonflikt»); database sikker; ux sannsynlig | TS-11 (a)–(c) dekker samme blokk, ulike blokker og angring etter annens endring; ingen skrivepolicyer for klienten. | **BESTÅTT** |
| S10 | Ulike replikker i samme scene samtidig | scene-sync-invariants, database-domain-modeling | scene-sync sikker; database sannsynlig | Revisjon på blokknivå (OPERATIONS_MATRIX «EditBlockText», RLS_PATTERNS §4, TS-11 b): begge lykkes. | **BESTÅTT** |
| S11 | Spinoff gjenbruker hovedfilmens klipp og endrer scenen | scene-sync-invariants, database-domain-modeling | scene-sync sikker («spinoff»); database sannsynlig | Referanse uten kopi, trim på spinoffens forekomst, avvik bare i spinoffen (OPERATIONS_MATRIX «SetActiveTake»/«EditInSpinoff», TS-05, RLS_PATTERNS §5). | **BESTÅTT** |
| S12 | Delt kontinuitetshendelse skal ikke gjelde i spinoff | scene-sync-invariants, database-domain-modeling | scene-sync sikker («spinoff», kontinuitet); database sannsynlig | `continuity_overrides(action: disable|replace)` i OPERATIONS_MATRIX, TS-06, RLS_PATTERNS §5. | **BESTÅTT** (merknad) |

**Sammendrag:** 11 BESTÅTT (S7 og S12 med merknader), 1 DELVIS (S8, forventet til `multilingual-localization` finnes i M7), 0 IKKE BESTÅTT.

**Merknader:**
- S7: `GenerationJob.status` mangler fortsatt en synlig tilstand for «venter på godkjenning / stoppet av budsjett» i `DOMAIN_MODEL.md` (arkitekturdokument, utenfor denne rettelsen).
- S12: kommandonavnet `SetContinuityOverride` er en teknisk anbefaling i OPERATIONS_MATRIX og finnes ikke i `DOMAIN_MODEL.md` §3 ennå.

### 9.2 Aktiveringsmatrise (S1–S12)

Tegnforklaring som i §4.1. Fet = forventet.

| Skill | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| specification-guardian | u | u | u | u | **s** | u | u | **u** | u | u | u | u |
| architecture-guardian | – | **s** | – | u | – | **s** | **s** | – | s | – | u | u |
| scene-sync-invariants | **S** | **S** | **S** | **S** | **S** | **S** | **s** | **s** | **S** | **S** | **S** | **S** |
| database-domain-modeling | – | – | – | **s** | – | – | – | – | **S** | **s** | **s** | **s** |
| screenplay-engineering | **S** | – | – | – | – | – | – | **u** | – | – | – | – |
| ux-interaction-design | – | **S** | – | – | – | – | – | s | **s** | s | – | – |
| secure-development | – | – | – | – | – | – | **S** | – | s | – | – | – |
| øvrige (5) | – | – | – | – | – | – | – | – | – | – | – | – |

### 9.3 Status for funnene

| ID | Status | Kommentar |
|---|---|---|
| F-01 | **Lukket** | `secure-development` (SKILL §4/§6/§7/§8, SECURITY_CHECKLIST §2, THREAT_MODEL T3/T14), `database-domain-modeling` og `architecture-guardian`: bare select-policy, `insert/update/delete` revoket, skriving via `public.apply_command` → `private.cmd_*`. |
| F-02 | **Lukket** (midlertidig) | `secure-development` eier kostnadsporten inntil `ai-cost-quality-governance` (M5); `scene-sync-invariants` og `architecture-guardian` påstår ikke eierskap. |
| F-03 | **Åpen** (akseptert) | TS-13 og S8-merknad lagt til. Full dekning krever `multilingual-localization` (M7). Eksportkontroll (29.6) mangler fortsatt i `screenplay-engineering`. |
| F-04 | **Lukket** | `private.is_project_member`, `private.has_project_role`, `private.can_approve_costs` overalt i skillene. |
| F-05 | **Lukket** | Skillene viser til `DATA_RELATIONSHIPS.md` «Lagringsstruktur»; RLS_PATTERNS §6 har alle seks bøttene. |
| F-06 | **Lukket** | Løst i DEC-0020/DEC-0010; skillene bruker de kanoniske navnene. |
| F-07 | **Lukket** | `MoveOccurrence` konsekvent; OPERATIONS_MATRIX og RLS_PATTERNS nevner at «MoveSceneOccurrence» ikke brukes. |
| F-08 | **Lukket** | `script_block_revisions`/`current_rev` i OPERATIONS_MATRIX, RLS_PATTERNS, SCHEMA_REVIEW_CHECKLIST, ARCHITECTURE_REVIEW_CHECKLIST. |
| F-09 | **Lukket** | Fortellingstidsregelen (DEC-0020 pkt. 6) i OPERATIONS_MATRIX «MoveOccurrence», TS-03, INVARIANT_TESTING. |
| F-10 | **Lukket** | Take-gjenbruk i spinoff i OPERATIONS_MATRIX, TS-05, RLS_PATTERNS §5. |
| F-11 | **Lukket** | `continuity_overrides` i OPERATIONS_MATRIX, TS-06, RLS_PATTERNS §5. |
| F-12 | **Lukket** | Atferdsformuleringer i `architecture-guardian` (description + §2); scenariene testes som oppgaver; forventet aktivering justert. |
| F-13 | **Lukket** | `scene-sync-invariants` description har samtidig redigering, revisjonskonflikt, replikk/dialog, oversettelse/språkversjon og INV-C1. |
| F-14 | **Lukket** | TS-11 (a)–(c). |
| F-15 | **Delvis åpen** | `DATA_RELATIONSHIPS.md` er oppdatert (render_jobs, change_log.production_id, removed_at, can_approve_costs, order_key). `schema_version.description` (brukt i MIGRATION_RULES §4) mangler fortsatt i DATA_RELATIONSHIPS – må rettes i arkitekturdokumentet. |
| F-16 | **Lukket** | `merged_into` på `scenes` og `UnmergeScene` i OPERATIONS_MATRIX; Q-07 for fortellingstid/aktiv versjon. |
| F-17 | **Lukket** | «Maja» fjernet som trigger, erstattet med «karakterens utseendeendring midt i scene». |
| F-18 | **Lukket** | `screenplay-engineering` trigges av manusimport, manusformat, PDF-/DOCX-manus, scenenummerering, paginering, manuseksport m.m., ikke av «manus» alene. |
| F-19 | **Lukket** | TS-02 har eget «Og»-punkt. |
| F-20 | **Lukket** | NUMBERING_RULES følger Q-08 (OMITTED bare ved bevart/historisk; utelates ved fortløpende). |
| F-21 | **Delvis åpen** | Lukket: én RPC-stil, ingen `UNIQUE(production_id, scene_id)`, kort nok `database-domain-modeling`-beskrivelse (886 tegn), «når/hvis den finnes» fjernet for eksisterende filer. Åpent: `SESSION_HANDOVER.md` og `CURRENT_WORK.md` vises til, men finnes ikke i `docs/development/`. |

**Neste steg:** (1) rett `schema_version.description` og en ventetilstand for `GenerationJob.status` i arkitekturdokumentene; (2) opprett `SESSION_HANDOVER.md`/`CURRENT_WORK.md`; (3) opprett `ai-cost-quality-governance` (M5) og `multilingual-localization` (M7) og flytt kostnadsporten; (4) bekreft resultatene med en målt eval.
