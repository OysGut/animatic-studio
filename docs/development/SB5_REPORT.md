# SB-5 – Kobling til sceneeditoren

## Bygget
1. **Referansepanel** (`src/app/scene-editor/StoryboardReferencePanel.tsx`): nytt panel `storyboard` i sceneeditorens panelsystem (dokking, skjuling, rekkefølge og bredde huskes per bruker via eksisterende `useUiPref`). Viser scenens paneler med bilde (samme FilmViewer/storyboardFilm-pipeline som galleriet), figurer, lapper, piler, kamerainstruksjoner (utsnitt/vinkel/brennvidde/bevegelse), replikker, kommentarer, timing (arv) og status. Låst for redigering.
   - Følger avspillingshodet: `activePanelIdAtFrame` (ren kjerne, `src/core/storyboard/reference.ts`) regner scenens bilde om til storyboardfilmens tidslinje; aktivt panel markeres og rulles til.
   - Panelet scenen ble åpnet fra (?panel=) fremheves.
   - «Rediger storyboard» åpner panelet i storyboardet (SB-3 håndterer ny revisjon ved godkjent panel). «Tilbake til scenen» i storyboardets verktøylinje navigerer tilbake med scene+panel (felles posisjon fra SB-4).
   - «Forstørr» åpner stor dialog (ResizableDialogContent, sizeKey `storyboard-reference`). «Åpne i eget vindu» åpner ruten `/prosjekt/$projectId/storyboardref` med husket popup-geometri (egen nøkkel `sceneEditor.storyboardRef.popup`); popupen følger hovedvinduets delte posisjon via scenebussen.
   - Vindu-ID-er: V-172 (side), V-173 (oppsettsdialog), V-174 (stor dialog), tildelt med ui-ids-skriptet.
2. **«Opprett sceneoppsett fra storyboard»** (`planSceneSetup` i `src/core/storyboard/scene-setup.ts` + `SceneSetupDialog.tsx`): ren plan som kopierer ressurs-/form-/tekst-/gruppelag med ressurs-ID/-versjon, plassering, skala, rotasjon og lagrekkefølge, panelets bakgrunnsfarge, og kameramerket som kamerautgangspunkt (samme omregning som storyboardfilmen). Lapper, piler og kameramerkelag kopieres ikke som synlige objekter. Scene med innhold avvises («has_content»); brukeren må velge «nytt utkast», som legger lagene øverst som nytt lagsett uten å røre eksisterende lag, bakgrunn eller kamera. Forhåndsvisning før oppretting; kjøres som én angregruppe (runGroup). Panelvelger ved flere paneler.
3. **Storyboardstatus i toppen**: `StoryboardStatusBadge` ved siden av SceneMarkControls viser storyboard-fagområdets status for scenen.

## Database
Ingen DB-endringer nødvendig – alt bygger på eksisterende kommandoer (CreateComposition, AddLayers, UpdateComposition) og tabeller. Derfor ingen migrasjon 0106.

## Tester
- `tests/unit/sb5-scene-setup.test.ts` (6 tester): oppretting med riktige felter, kopiering med ID/versjon/transformasjon og hopp over lapp/pil/kameramerke, avvisning av scene med innhold + «nytt utkast» øverst uten å røre eksisterende, angre/gjør om via inverser, aktivt panel følger avspillingen, referanseinfo-oppsummering. Alle grønne.
- `tests/unit/scene-panels.test.ts` oppdatert med det nye panelet (10 tester grønne).
- `tests/architecture/ui-ids.test.ts` grønn.
- Typecheck: build OK (0 feil). i18n-sjekk grønn; 36 nye `sb5.*`-nøkler på nb/en + maskinoversatt (merket `review: "machine"`) til de, es, fr, it, ja, ko, pt-BR, ru.
- **Ved første SB-5-leveranse ikke kjørt**: full Vitest, DB-suite og visuell nb/en-test. Dette var en ufullstendig verifisering, ikke en grønn fullsuite.

### Retting og ny fullkontroll – 24.10.2026
- Claudes rapport fra `3c67d97e` med to språkfeil er fulgt opp etter SB-7-inventarrettingen. På dagens kode består begge navngitte regresjoner: «finner ingen norsk tekst uten engelsk i src/» og «every raw expression and template segment survives regeneration». Målrettet kjøring: **23 bestått, 0 feilet**.
- Inventaret er regenerert gjennom `node scripts/i18n/inventory.mjs` og kontrollert med `--check`. Regenereringen ga ingen nye filendringer: rettingen var allerede med i dagens inventar/kataloger. Ingen tekster eller tester er fjernet eller svekket.
- `checkKeyedCatalogs()` fra `scripts/i18n/validate.mjs` er kjørt uttrykkelig: **0 feil for alle registrerte språk**, inklusive kildehash og plassholderkontroll. `check.mjs`: **0 tekster uten engelsk i 0 filer**. Releasekontrollen består også.
- **Ny full Vitest-kjøring 24.10.2026 kl. 03:19:48 UTC: 2928 bestått, 0 feilet, 10 eksisterende hoppet over; 367 testfiler bestått, 2 hoppet over.** Varighet 142,21 sekunder. Dette er hele dagens kodebase, inklusive SB-7, ikke en historisk kjøring av `3c67d97e`.
- SB-5-overføringsregelen ble rettet under SB-7: bare ressurslag og deres relevante grupper følger med; form- og tekstlag blir værende som instrukser. De seks SB-5-testene inngår i den grønne fullkjøringen.
- Denne oppfølgingen endrer bare rapport og veikart. Ingen publisering eller databaseendring. Visuell SB-5-verifisering er fortsatt ikke bekreftet av denne kjøringen.

## Begrensninger / avvik
- «Ny variant» som alternativ til «nytt lagsett» er ikke bygget: ForkVariant endrer manusstrukturen og krever produktvalg. «Nytt lagsett» dekker «nytt utkast» uten å overskrive.
- Popupens avspillingsfølging bruker delt posisjon (panelet + tidspunkt), ikke et eget avspillingshode.
