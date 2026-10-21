# B-105a / KR-1 – sluttrapport

## Status 21.10.2026

B-105a del 1 (bildeopplasting, avledede filer, proxy/original) og del 2 (Story Lab-prompter på serveren) er ferdige og testet. KR-1 er utført. **Ett avvik:** bildepromptene er ikke flyttet til serveren (se «Avvik»). Migrasjon 0078 ble rettet etter lokal DB-test (se «Migrasjon»).

## Del 1 – én felles vei for bilder

- Ren logikk: `src/core/library/image-ingest.ts` (størrelsesplan, `imageFileForUse`, `versionImagePath`, `derivedFilesError`). Nettleserdel: `src/adapters/browser/image-ingest.ts`.
- Alle opplastingsinnganger går via `uploadAssetImage` → `ingestImage`: AssetDetail, LayerImageDialog, ReuploadDialog, CutoutDialog, image-actions, mts-actions og MouthShapeEditor. Ingen app-kode laster opp bilder til `source/` utenom denne funksjonen (kontrollert med søk).
- Filer som allerede ligger i lagringen (mobilimport, AI-resultater, gjenoppretting via `mediaFromStoredFile`) får proxy og miniatyr i bakgrunnen første gang de vises (`src/app/library/derived-backfill.ts`), uten å blokkere.
- Originalen lagres uendret. TIFF: versjonen er en renderbar PNG, og den rå TIFF-fila bevares som `derivedFiles.originalRaw`.
- Avledede filer valideres i kjernen (`derivedFilesError`) og i databasen (`private.derived_files_ok`). De følger med i sikkerhetskopi, global publisering/kopiering og `purge_*`.
- Visning og forhåndsvisning bruker proxy; eksport (video, ProRes, PNG/alfa), rigg-PDF og zoom over 100 % bruker originalen. Eldre versjoner uten avledede filer bruker alltid originalen.
- `ImageCache` er uendret; konturbufferet er LRU 64 med test.

## Del 2 – Story Lab-prompter på serveren

- `src/adapters/ai/story-prompts.server.ts`: zod-validert forespørsel (character, analyst, sceneAnalysis, lineCheck, profileGenerator, interview, interviewNodes, contextLink, materialUpdate). Prompten bygges fra prosjektdata.
- `src/adapters/ai/story-text.functions.ts`: `generateStoryText` og `estimateStoryPrompt` krever innlogging og leser prosjektet med brukerens tilgang (`loadProjectState(context.supabase, …)`, RLS). Bruker `runTextGeneration`, så kostnadsgodkjenning, kvoter og kvitteringer er som før. Estimatet returnerer bare tegnantall. Prompter og nøkler logges ikke.
- Klienten sender bare oppgavetype og ID-er/parametere, aldri systemtekst.
- Arkitekturvakt: `tests/architecture/server-prompts.test.ts` (ingen promptbyggere, `system:` eller rå tekstkall i klientkode).

## Migrasjon 0078

`db/migrations/0078_b105a_derived_files.sql`, additiv, med 0077 som utgangspunkt:
- ny kolonne `derived_files` (jsonb, nullable) på `asset_versions` og `global_asset_versions`;
- **ny** hjelpefunksjon `private.valid_derived_files(p_files jsonb, p_prefix text)` (immutable, `search_path = ''`, execute for authenticated og service_role). CHECK kaller den med `project_id::text || '/'` for prosjektversjoner og `'global/' || workspace_id::text || '/'` for globale versjoner;
- erstatter `purge_project_assets` (0072), `purge_removed_assets` (0072) og `global_add_version` (0074). Diffene mot 0072/0074 er uendret, bortsett fra at purge-funksjonene bare tar med avledede stier under eget prosjekt uten «..» (ekstra forsvar);
- skjemaversjon 78.

**Retting etter Claudes kontroll (21.10):**
1. Delspørringer i CHECK er flyttet til `private.valid_derived_files` (Postgres avviser dem direkte i CHECK).
2. Sikkerhetshull lukket: en sti i `derived_files` må starte med radens prefiks og kan ikke inneholde «..». Det samme valideres på serveren i `AddAssetVersion` og `SetAssetVersionDerived` (`derivedFilesError(d, "<prosjekt-id>/")`). Global kopiering kopierer bare avledede filer fra eget prosjekt eller egen gruppe.
3. Kontrollert lokalt: 0001–0077 kjørt, så hele 0078 i én transaksjon (`psql -1 -v ON_ERROR_STOP=1`): OK, skjemaversjon 77 → 78.

## Tester (kjørt én om gangen)

- Full Vitest: **2225 bestått, 10 hoppet over, 0 feilet** etter rettingen (ny enhetstest for prefiks og «..»).
- DB lokalt: **154/154**. 0078-testen dekker avvist ukjent nøkkel, avvist sti til et annet prosjekt, avvist «..», avvist sti uten prefiks, global CHECK med gruppeprefiks, RLS, ingen direkte klientskriving, at purge tar med egne avledede stier, og at purge ikke tar med en fremmed sti selv om CHECK er fjernet (i en transaksjon som rulles tilbake). 0077-testen sjekket `=== 77` og ble endret til `>= 77`, som de andre versjonstestene.
- i18n: `check.mjs` 0 tekster uten engelsk; ingen nye språkstrenger.
- Nye enhetstester: `b105a-image-ingest` 10/10, `b105a-image-use` 8/8, `b105a-server-prompts` 6/6, arkitekturvakt grønn.
- Regresjon: export-e2e film og scene (videofil > 0 byte), rigg-r4 12/12, u5-screens 63/63, scene-panels-ui 39/39, storylab-ui 32/32, storylab-scene-ui 18/18, t2-writing-ui 69/69, job-read 8/8. Også rigg-r1 12/12, rigg-r2 17/17, rigg-r3 15/15.
- Testendringer: export-e2e velger norsk eksplisitt (standardspråket er engelsk etter B-111); storylab-suitene mocker de nye serverfunksjonene; `schema-version.mjs` er 78.
- Tidligere feil i t2/u5 skyldtes testkjøreren min, som tvang `UI_LANG=nb` også på de engelske scenarioene. Uten den er begge grønne.

## Produksjonsbygg (`npx vite build`)

- `.map`-filer: **0**.
- Klientbunter: 175 JS-filer; hver av de 19 rutefilene har egen bunt (18 navngitte + index).
- Promptsignaturer i klientbunten: 0 (prompttekst finnes bare i serverbunten).

## KR-1

- REQ-0005: produktnavn From Pen to Glass (B-104), verifisert med b104-product-name.
- REQ-0571: Implementert – ikke verifisert (GP1–GP5 bygget, egen akseptansetest mangler).
- REQ-0430: Utgått, erstattet av B-111/B-107.
- REQ-0882–0891 (A4–A13): Verifisert med print-pdf, print-contour, print-measure og rigg-r1–r4.
- A1–A3, A14–A15 (REQ-0879–0881, 0892–0893) er rigg runde 5. A16 (REQ-0894) uendret.
- Nye krav REQ-0916–0924 for B-100, B-097, B-098, B-099, B-104, B-107, B-109, B-110, B-111.
- `build_docs.py` kjørt; `check_kb.py`: OK (924 krav).

## Avvik / åpne spørsmål

- **Bildeprompter er ikke flyttet til serveren.** I GenerateImagePanel og de andre bildepanelene er prompten en tekst brukeren ser og kan redigere, og den forrige prompten huskes (Mars 13.10). Det finnes ingen skjult systemtekst. Hvis prompten bygges på serveren, kan brukeren ikke lenger se og redigere den før kjøringen. Det er en produktendring, så jeg har ikke valgt den selv. **Spørsmål:** skal bildepromptene bygges på serveren, med en forhåndsvisning hentet derfra?
