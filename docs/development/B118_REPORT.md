# B-118: Scenestatus og scenefarge (Øystein 22.10)

## Hva er bygget
- **Data per sceneforekomst** (status og farge hører til produksjonen): migrasjon `0083_scene_status_color.sql`, bare additiv.
  - `scene_occurrences.work_status text null`, check mot `setup, animating, review, retake, approved, post, done`.
  - `scene_occurrences.color text null`, check mot `red, orange, yellow, green, teal, blue, indigo, purple, pink, gray` (nøkler, aldri hex).
  - `apply_changes` henter kolonnene dynamisk via `private.table_columns`, så **ingen funksjoner er erstattet**. `delete_project`/`purge_*` er uendret (ingen nye tabeller).
  - `schema_version` 83; `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er 83.
- **Kjernen:** `src/core/assembly/scene-marks.ts` (listene, typer, `isWorkStatus`, `isSceneColor`, filterhjelp). `SceneOccurrence.workStatus` / `.color`.
- **Kommandoer med angring:** `SetOccurrenceWorkStatus` og `SetOccurrenceColor` (null fjerner). Inversen gir forrige verdi. Skrivingen går via `runCommand` → `apply_changes`. `runCommand` krever skjema 83 for de to kommandoene og redaktør/eier som før.
- **Statuser** i menyrekkefølge med eget lite ikon: Klar til oppsett, Under animasjon, Til kontroll, Retake, Godkjent, I etterarbeid, Ferdig (+ «Ingen status»).
- **Verktøytips** på status- og fargevelgeren: «… · endret {tid} av {navn}», fra endringsloggen (én spørring per prosjekt).
- **Felles scenemerke** `src/app/shell/SceneMark.tsx`: firkant + statusikon + navn, med tom plass av samme bredde når scenen mangler farge/status. Brukes i scenevelgeren i sceneeditoren (knappen og listen), scenelisten i manuset og scenelisten i eksportdialogen.
- **Stripe** (2 px, helt øverst) i sceneeditorens scene og på scenekortene i filmtidslinjen.
- **Toppmenyen i sceneeditoren:** status- og fargevelger for aktiv scene, og bryterne «Vis status» og «Vis farger» (lagres per bruker i `ui_prefs`). Av = ingen stripe, firkant eller statusikon; dataene beholdes.
- **Filter** i scenelisten i manuset: status og farge, også «Ingen status» / «Ingen farge».
- **Farger:** 10 designtokens `--scene-*` (oklch, mellomlys og mettet).
- **Tekster:** 38 nye `b118.*`-nøkler på alle ti språk.

## Tester
- tsc: ren.
- Vitest: full kjøring ga 2324 bestått, 2 feilet og 10 hoppet over. De to feilene var språktester, fordi språkregisteret ikke var regenerert etter den siste tekstendringen. Etter regenereringen er de 23/23 grønne, så resultatet er 2326 bestått og 0 feilet. Den nye testfilen `tests/unit/b118-scene-marks.test.ts` er 7/7. Sparkles-ikonet, som AI-ikontesten forbyr, er byttet ut med en pensel.
- DB: 158/158, med ny test «0083 (B-118)»: check-verdier, skriving via `apply_changes`, endringslogg med hvem, leser avvises (42501), men ser verdiene.
- i18n-sjekk og releasekontroll: grønne.
- Ny visuell suite `tests/visual/b118-scene-status.mjs`: nb 18/18 og en 18/18. Den sjekker 2 px-stripen øverst, at firkanten står foran navnet, at navn med og uten farge har samme venstre x (`boundingBox`), og at bryterne skjuler alt og lagres. `toolbar-more-ui.mjs`: 16/16 (regresjon).

## Avvik
- **Vanlige nedtrekkslister (`<select>`)** kan ikke vise en farget firkant i valgene. Det gjelder blant annet rigg, lageksport og opptaksdialogen. Scenemerket brukes i alle egne scenelister og i scenevelgeren. De vanlige nedtrekkslistene må bygges om til egne lister hvis de også skal ha merket.
- **Endret av og tidspunkt** vises i verktøytipset på velgerne i toppmenyen. Ikonene i listene viser bare statusnavnet, så listene ikke trenger egne oppslag per rad.
- **Bare mørkt tema finnes i dag.** Fargene er valgt slik at de også skal fungere på lys bakgrunn, men det er ikke testet.
- Navnene på bryterne står i verktøytips og skjermlesertekst, ikke som synlig tekst. Ellers ble toppmenyen for bred, og andre knapper ble flyttet inn i «Mer …».
- På 1280 px ligger sceneeditorens knapper for lag og AI-video i «Mer …», slik den overflyttingen alltid har virket ved plassmangel.

## Åpne spørsmål
1. Skal de vanlige nedtrekkslistene for scener bygges om, så de også viser scenemerket?
2. Claude kjører 0083 i Cloud.
