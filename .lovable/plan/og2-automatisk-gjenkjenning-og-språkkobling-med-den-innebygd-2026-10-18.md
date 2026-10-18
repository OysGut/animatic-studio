# OG2 – Automatisk gjenkjenning og språkkobling med den innebygde AI-en (B-047, B-048)

Ingen nye pakker. Krever migrasjon 0041 (skrives, kjøres av Claude). Ressurser og koblinger opprettes aldri automatisk.

## 1. Serverfunksjon `analyzeScriptEntities`
Fil: `src/adapters/ai/entity-analysis.functions.ts` (+ `entity-analysis.server.ts` for selve kallet).
- Inndata: `{ projectId, scope: "all" | { sceneIds: string[] } }`. Validerer UUID-er, maks 500 scene-ID-er. Ingen fri tekst fra klienten.
- Tilgang: `requireSupabaseAuth` + redaktør/eier i prosjektet (samme sjekk som andre AI-funksjoner).
- Serveren laster prosjekttilstanden selv (`project-rows.ts`), kjører `librarySuggestions` + `classifySuggestion` per scene, og bygger prompten med eksisterende `classifyEntitiesPrompt` (300 tegn per utdrag, `maxPromptChars`).
- Egen intern vei `lovableTextInternal(...)` i `text.functions.ts`-modulen eksportert fra en `.server.ts` (den eksisterende `lovableText` gjenbrukes, ikke kopieres). Tvinger leverandør `lovable` og `LOVABLE_API_KEY`; leser aldri `ai_provider_keys` eller `ui_prefs.aiText`.
- Tak: 20 kjøringer per prosjekt per døgn (telles i `generation_jobs`), pluss maks 40 scener per kjøring (større manus deles i flere kjøringer som telles samlet som én «analyse» per import, se åpne spørsmål).
- Logging: én rad i `generation_jobs` (kind `text`, task `entity_analysis`, `key_owner = null` som betyr tjenesten, `cost_usd`), uten prompt eller svar. Kolonnen `key_owner` er uuid i dag, så «lovable» uttrykkes som null + task.
- Svar: `{ ok, analyzedScenes, newSuggestions, usedRules: boolean }` eller `{ ok:false, reason }` med tospråklig melding.
- Ny task i `generateText`-listen trengs ikke; dette er en egen intern vei (avvik fra «ett inngangspunkt» i animatic-ai-tekst, begrunnet i B-047 – må bekreftes, se åpne spørsmål).

## 2. Lagring – migrasjon `0041_script_entity_analysis.sql`
Tabell `public.script_entity_analysis`:
- `id`, `project_id`, `scene_id` (fk `scenes` on delete restrict), `content_hash text`, `result jsonb` (check: størrelse ≤ 64 kB), `model text`, `analyzed_at`, `created_by`, `removed bool default false`, `revision`, `created_at`. Unik `(project_id, scene_id)`.
- RLS: medlemmer leser (`private.is_project_member`); ingen klientskriving. Bare service role skriver (arbeidslogg-mønsteret, ikke `apply_changes`).
- Ikke i `v_tables` (skrives ikke via kommandoer). Utvid `delete_project`, `purge_project_assets` og `purge_removed_assets` (kopiert ordrett fra siste definisjon i 0040), slett før `scenes`.
- `schema_version` → 41 og `EXPECTED_SCHEMA_VERSION`.
- Backup: tas ikke med (avledet data, regenereres) – foreslått, se åpne spørsmål.
- Lasting: ny lesefunksjon `listEntityAnalysis({ projectId })` (ikke en del av `ProjectState`).
- DB-tester i `tests/db/run-db-tests.ts`: medlem leser, ikke-medlem ser ingenting, klient kan ikke skrive, `delete_project` og purge sletter radene.

## 3. Når analysen kjøres
Klientkrok `src/app/library/use-entity-analysis.ts`, montert i prosjektskallet:
- etter vellykket manusimport (`scope: "all"`);
- etter Story Lab-overføringer som lager manustekst (SL6/SL7 «Opprett scene i manuset», scenetekstutkast) – de endrede scene-ID-ene sendes;
- inkrementelt: 30 s debounce etter siste manusendring; `sceneContentHash(scene)` i `src/core/library/analysis-hash.ts` (ren, deterministisk hash av overskrift + blokktekster i rekkefølge) sammenlignes med lagret `content_hash`; bare avvikende scener sendes. Serveren regner hashen på nytt og hopper over uendrede.
- Alltid i bakgrunnen, én kjøring om gangen per fane (ikke blokkerende).
- Status i forslagsknappen: «Analyserer manuset …» → «12 nye forslag» / feilmerknad, med `L()`.

## 4. Bruk av resultatet
- `librarySuggestions` får valgfritt `analysis`-argument; AI-type, sikkerhet, begrunnelse og `aliasOf` overstyrer regelbasert resultat når hashen stemmer. Ellers brukes regelsignalene (som i OG1).
- SuggestionsDialog: «Forbedre med AI …» erstattes av «Analyser på nytt» (kaller `analyzeScriptEntities`, ingen kostnadsdialog). Merknad «Typene er satt av den innebygde AI-en» / regelbasert hvis AI manglet.
- Ingen ressurser opprettes automatisk; «Legg til valgte» som før.
- Manusutforskeren og SceneAssetsPanel leser samme data, ingen nye kall.

## 5. Språkkobling `alignTranslationWithAi`
Fil: `src/adapters/ai/translation-align.functions.ts`; kjerne `src/core/translation/align-prompt.ts` (`alignmentPrompt`, `alignmentFromJson`).
- Dagens kobling skjer i nettleseren i `TranslationImportDialog` (`alignTranslation`/`alignLines`); det finnes ingen lagret import-ID. Forslag: inndata `{ projectId, versionId, items: [{ importedSceneIndex, candidateSceneIds, importedLines: string[] }] }` der serveren selv henter norske utdrag fra databasen og klipper importerte utdrag til 300 tegn, maks 60 usikre scener og 400 linjer. Importert tekst må komme fra klienten (filen er ikke lagret) – begrenset og bare brukt i en fast prompt.
- Kjøres automatisk etter regelbasert kobling, bare for `uncertain`/manglende scener og linjer.
- Svar JSON `{ scenes: [{ imported, norwegianSceneId|null, confidence, reason }], lines: [...] }`, validert; ukjente ID-er forkastes.
- Resultatet fyller forslag i den eksisterende godkjenningen. AI-«sikker» blir fortsatt markert for gjennomgang hvis regelkoblingen var usikker (ingen stille godkjenning). Norsk manus endres aldri (REQ-0331).
- Samme tak (deler døgnkvoten) og logging (task `translation_align`).

## 6. Tester
- Unit: `analysis-hash` (stabil, endres ved tekstendring, uavhengig av scenenummer), promptøyeblikksbilder for begge promptbyggere (bare manusutdrag, ingen Story Lab-hemmeligheter/notater, lengdegrenser), `alignmentFromJson` tåler ugyldig JSON, sammenslåing AI → forslag, regelreserve.
- Server: taklogikk som ren funksjon i kjernen (`dailyQuotaError`).
- DB: se punkt 2.
- Nettleser (Claude kjører): `tests/visual/entity-analysis-ui.mjs` (import utløser analyse, status i knappen, typer uten kostnadsdialog, «Analyser på nytt», engelsk visning) og `tests/visual/translation-ai-align-ui.mjs` (AI-koblinger vises som forslag og må godkjennes). Mocket AI og serverfunksjoner.

## 7. Risikoer og åpne spørsmål
1. Avvik fra animatic-ai-tekst «ett inngangspunkt» og «kostnadsbekreftelse alltid»: B-047 gjør dette bevisst. Bekreft at intern vei utenfor `generateText` er ønsket.
2. Kostnadstak: 20 kjøringer/prosjekt/døgn + scenetak per kjøring. Skal det i tillegg finnes et samlet månedstak for tjenesten?
3. Innebygd AI utilgjengelig (402/403/429/5xx): regelbaserte forslag brukes, diskret merknad, ingen automatisk ny kjøring før neste manusendring eller «Analyser på nytt». 402/403 lagres som pausetilstand per prosjekt i ett døgn (ingen kolonne – telles via feilet jobb i `generation_jobs`).
4. Backup: skal analysen tas med eller regenereres etter gjenoppretting? (Forslag: regenereres.)
5. Språkkobling krever at importert tekst sendes fra klienten; er det akseptabelt, eller skal importfilen lagres først?
6. Personvern: manusutdrag sendes til AI uten brukerens valg – bekreft at dette dekkes av B-047.
7. Samtidige redaktører kan trigge samme analyse; serveren hopper over scener med lik hash, og en lås per prosjekt (siste jobb < 60 s) hindrer dobbeltkjøring.

## Filer
Nye: `db/migrations/0041_script_entity_analysis.sql`, `src/adapters/ai/entity-analysis.functions.ts`, `entity-analysis.server.ts`, `translation-align.functions.ts`, `src/core/library/analysis-hash.ts`, `src/core/translation/align-prompt.ts`, `src/app/library/use-entity-analysis.ts`, unit-/DB-/nettlesertester.
Endres: `text.functions.ts` (eksponere intern lovable-vei), `suggest.ts`, `SuggestionsDialog.tsx`, `TranslationImportDialog.tsx`, Story Lab-overføringene, `project-rows.ts` (skjemaversjon), `tests/db/run-db-tests.ts`, i18n-katalog.
