# PTG3-rapport: Kamera i fysiske enheter, FBX og After Effects-pakke (B-102)

Dato: 22.10.2026. Grunnlag: `docs/development/PHASE3_PTG_SPEC.md` §4 og PTG-F1, rigg/kamera fra B-087/B-090.

## Hva ble bygget

1. **CameraTrack i InterchangeDoc** (`src/core/interchange/types.ts`, `camera.ts`, `index.ts`)
   - Per bilde på opptakets bildefrekvens: pan i mm, høyde (dolly) i mm, rull i grader, brennvidde i mm, sensorbredde/-høyde i mm, plategeometri med parallaksefaktor.
   - Fast kamera (`fixed`) og fysisk kamera (`moving`) støttes; kalibrert rigg overstyrer teoretisk geometri. Scene uten rigg gir `camera: null`. Toere beholdes som `exposureStep: 2` på 24 bilder/s-tidslinjen.
   - Ren TypeScript i `src/core/interchange/`; ingen nettleser-API.
2. **FBX ASCII 7.4, eksperimentell** (`src/core/interchange/fbx.ts`)
   - Kamera-animasjon per bilde; KTime 46 186 158 000 tiks/s; FilmWidth/FilmHeight i tommer (mm/25,4); FocalLength i mm; verdensenheter i cm; null-objekter (Null-noder) for hver plate med parallakse-justert dybde. PreRotation X −90° for Y-opp-konvensjonen.
   - Merket som eksperimentelt i UI og LESMEG.
3. **After Effects-pakke** (`src/core/interchange/ae-jsx.ts`, `src/engine/export/ae-export.ts`)
   - ZIP med ES3 `bygg.jsx`: én komp per skudd og en hovedkomp; posisjons-/skalerings-/rotasjons-/uigjennomsiktighetsnøkler med myke inn-/uttangenter, romlige tangenter for baner, bildeskifter (hold-nøkler), grupper som pre-komper, masker (rect/ellipse/lag-matte) og lydvolum.
   - Velgbart AE-kamera (3D med pan/høyde/rull/brennvidde) eller 2D-parallakse (lag skalert etter dybde). Overganger mellom scener er utenfor (PTG-F1) og dokumentert i scriptkommentaren.
4. **Eksportdialog** (`src/app/assembly/ShotlistExport.tsx`, `src/engine/export/camera-export.ts`)
   - Ny seksjon «Til produksjonen» har nå også «Kamera (FBX, eksperimentell)» og «After Effects-pakke» med kameramodusvalg (AE-kamera / 2D-parallakse).
   - Begge eksportene reserverer versjon via `reserveInterchangeExport`/`completeInterchangeExport` og vises i eksportloggen (`ExportHistory.tsx`) med egne etiketter.
5. **Pakker**: strømmes via `zip.ts` (ZIP64 fra PTG1) med `LESMEG.txt` på nb og en. FBX-pakken inneholder én `.fbx` per skudd; AE-pakken inneholder `bygg.jsx` og refererte mediefiler.
6. **Tekster**: åtte nye `ptg3.*`-nøkler i `authored.json` og alle ti språkfiler; språk utenom nb/en er maskinoversatt og merket `review` med sourceHash.

## Tester og verifisering

- `tests/unit/ptg3-camera.test.ts` — 6/6: kamerautledning per bilde, begge moduser, parallakse, toere, 25 fps-opptak, manglende rigg → null.
- `tests/unit/ptg3-fbx.test.ts` — 6/6: parserbasert kontroll av KTime, enheter (tommer/mm/cm), pan/høyde/rull, null-objekter og null-kamera. **Begrensning:** testen validerer vår egen formatterer/parser, ikke en ekstern FBX-importer. Eksempel-FBX ligger i `tests/fixtures/ptg3/example.fbx` (én nøkkel per bilde, låst med test).
- `tests/unit/ptg3-ae.test.ts` — 8/8: ES3-mock som «kjører» scriptet mot en After Effects-modell og kontrollerer komper, nøkler, baner, bildeskifter, masker, lyd og begge kameramoduser. **Begrensning:** mocken fanger syntaks- og strukturfeil, men ikke faktisk AE-oppførsel (maskekeyframes sampler siste verdi; matte-lag settes som lag men ikke koblet som track matte — kjent forenkling).
- `tests/architecture/eksport-uten-ai.test.ts` — utvidet med PTG3-kjerne og eksportører; eksportene virker uten AI.
- `tsc --noEmit` (NODE_OPTIONS=--max-old-space-size=6144): grønn.
- `node scripts/i18n/check.mjs`: grønn (0 tekster uten engelsk).
- Full Vitest: **2 300 bestått / 10 hoppet over / 0 feilet**.
- Bygg (dev-server): OK.

## Ikke kjørt / gjenstår (Claude)

- **Visuell suite `tests/visual/ptg3-camera.mjs` (nb/en)** og regresjonene ptg1-shotlist, export-e2e og p4: ikke kjørt her fordi `playwright` ikke er en prosjektavhengighet i dette miljøet (mts-harness importerer `playwright` fra node_modules). Suiten er skrevet etter samme mønster som ptg1-shotlist og bør kjøres i Claudes miljø.
- **DB-tester:** ingen databaseendring i PTG3; ingen ny migrasjon (punkt 6 i oppdraget: migrasjon bare om nødvendig — ikke nødvendig, kameramodus er et eksportvalg, ikke prosjektdata).
- **PTG1-rettinger (etter Claudes verifisering):** 0081 sin siste linje setter nå `description` (ordrett som kjørt i Cloud). DB-testen for PTG1 har `created_by`, `fps_num/fps_den` og `origin_production_id`, og lager den ufullstendige batchen med en lovlig insert (batchSize 2, én rad) i stedet for `update` på den uforanderlige eksportloggen; `complete_interchange_export` gir 22023.
- **0082 rettet:** nøkkelen `ui.test-languages` brøt `features_key_check` (bindestrek ikke tillatt) og er endret til `ui.test_languages` i migrasjon og kode; 0082 setter nå skjemaversjon 82. C0-testen sjekker bare `community.*`-nøkler.
- **Lokal Postgres satt opp på nytt** (PostgreSQL 17, port 54329, egen ikke-root-bruker). DB-suiten: **157 bestått, 0 feilet**. Full Vitest 2300 bestått/10 hoppet over; i18n-sjekk grønn.
- Ekte import av `example.fbx` i Blender/Maya og kjøring av `bygg.jsx` i After Effects er ikke verifisert; FBX-eksporten er derfor merket eksperimentell.

## Avvik

- AE-masker: lag-matte er representert som eget lag, men ikke koblet som Track Matte i den genererte koden (mock-testen dekker laget, ikke matte-koblingen).
- AE-maskekeyframes bruker siste verdi per maske (statisk form), ikke animerte maskepunkter.
- FBX-kommentarer og genererte AE-identifikatorer er på engelsk (krav fra i18n-vakten om at kildekode ikke skal inneholde norsk uten engelsk par).

## Åpne spørsmål

- Skal matte-kobling og animerte maskepunkter i AE-scriptet bygges ut nå, eller vente på tilbakemelding fra faktisk AE-bruk?
- Skal FBX forbli eksperimentell frem til noen har importert `example.fbx` i et ekte DCC-verktøy?

## Endrede filer

- `src/core/interchange/types.ts` — CameraFrameSample/CameraPlate/CameraTrack, Shot.camera, InterchangeDoc.frameSize.
- `src/core/interchange/camera.ts` — ny: buildCameraTrack.
- `src/core/interchange/index.ts` — kamera i InterchangeDoc.
- `src/core/interchange/fbx.ts` — ny: FBX ASCII 7.4-generator.
- `src/core/interchange/ae-jsx.ts` — ny: ES3 bygg.jsx-generator.
- `src/engine/export/camera-export.ts` — ny: FBX ZIP-eksport.
- `src/engine/export/ae-export.ts` — ny: AE ZIP-eksport.
- `src/app/assembly/ShotlistExport.tsx` — nye eksportvalg og kameramodus.
- `src/app/projects/ExportHistory.tsx` — etiketter for FBX/AE.
- `tests/architecture/eksport-uten-ai.test.ts` — nye APP_ENTRIES.
- `src/core/i18n/authored.json` + `src/core/i18n/locales/*.json` — ptg3.* på alle språk.
- `tests/unit/ptg3-camera.test.ts`, `tests/unit/ptg3-fbx.test.ts`, `tests/unit/ptg3-ae.test.ts` — nye tester.
- `tests/visual/ptg3-camera.mjs` — ny suite (ikke kjørt her).
- `tests/fixtures/ptg3/example.fbx` — generert eksempel.
- `scripts/i18n/references.v1.json`, `scripts/i18n/candidates.v1.json` — regenerert inventar.
- `docs/development/PTG3_REPORT.md` — denne rapporten.

## Rettinger etter Claudes verifisering (22.10)
- `tests/visual/ptg3-camera.mjs`: fixturen har nå en gyldig rigg (B-087, modus «moving», kalibrert) for scenen «Stua – åpning» med zoom og panorering. AE-modus må gi `addCamera`, 2D-parallakse må gi `PAR_`; egen kontroll for skudd uten rigg (navn og årsak i LESMEG, «camera omitted» i bygg.jsx). nb 30/30, en 30/30.
- LESMEG: «Kamera er null i PTG1» er erstattet. Nytt avsnitt forklarer kameramodusene og nøkkeltettheten; skudd uten kamera listes med navn og årsak (`cameraMissing`: ingen 2D-komposisjon, ingen rigg, ugyldig rigg). FBX-pakken sier at mange programmer, Blender blant dem, bare leser binær FBX. Binær variant er ikke bygget (se TODO).
- Nøkkeltetthet: ekte eksport gir én prøve per eksponering (testet i `ptg3-camera.test.ts`: 250/250 på enere, 125 på toere), og FBX skriver én nøkkel per prøve (96 nøkler i den visuelle testen). `example.fbx` er laget på nytt av eksportøren: 1 s på 24 bilder/s, 25 nøkler, og en test sjekker at filen er identisk med eksportørens utdata.
