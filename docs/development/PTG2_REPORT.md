# PTG2 – «Send til Dragonframe» (B-102, PTG-B1–B4 og B6)

## Hva er bygget
- **Modell** `src/core/interchange/dragonframe.ts` (ren TypeScript, uten nettleser og uten KI):
  - `shotWindow`, `exposureOf`, `shotExposures`: skuddets vindu med håndtak `[frameIn, frameOut)` og eksponeringene i det. Rutenettet følger klippet, likt med kamerasporet i PTG3.
  - `referenceFrames`: ett videobilde per opptaksbilde. Hvert bilde peker på monteringsbildet for sin eksponering, så på toere vises hver eksponering to bilder. Bildefrekvensen regnes bare om her, via `secondsToFrames(framesToSeconds())`, som i PTG1.
  - `buildXsheets`: én rad per eksponering med bilde, skuddbilde, tidskode, karakter, replikk, munn (tom til PTG4), handling fra manus, start og slutt på lagbevegelser og notater. Hvert ord står på eksponeringen der det starter. Replikker uten ordtider står på replikkens start. Løste notater er ikke med.
  - `xsheetCsv`, `xsheetLayout` (A4 og Letter i mm), `stemGroups`, `shotSamples`, `wav24` og `dragonframePaths`.
- **Eksport** `src/engine/export/dragonframe.ts`. Hver skuddmappe (PTG1-navn) inneholder:
  - `<skudd>_ref.mp4`: H.264 i opptakets bildefrekvens, lages med `exportAnimatic`;
  - `png/<skudd>_0001.png …` (valgfritt): samme lerret som videobildet;
  - `audio/<skudd>_DIA_<KARAKTER>.wav`, `_DIA_FORTELLER`, `_AMB`, `_MUS`, `_SFX` og `_MIX`: 48 kHz, 24 bit, stereo, like lange som skuddet med håndtak. Volumpunkter og fade er bakt inn av den samme mikseren som avspillingen bruker. Lyden følger valgt språkversjon;
  - `<skudd>_xsheet.csv`, `_xsheet_A4.pdf` og `_xsheet_Letter.pdf`;
  - `<skudd>_camera.fbx` når skuddet har rigg.
  - LESMEG på nb og en forklarer pakken og import i Dragonframe (Video Assist og referanselag, lyd, X-Sheet), og at KI kan brukes til sporlesing (PTG-B6) men ikke trengs. Kameraavsnittet fra PTG3 er også med.
- **`exportAnimatic`** har tre nye valg: `frames` (bildeliste fra modellen), `overlay` (påskrift) og `onFrame` (PNG av samme bilde). Eksisterende bruk er uendret.
- **Påskrift** (på som standard): skuddnavn, bildenummer og tidskode, og en plass til munnavn («Munn –») som fylles i PTG4.
- **Grensesnitt**: «Til produksjonen» har fått «PNG-sekvens» (av), «Påskrift» (på) og knappen «Send til Dragonframe». Eksportloggen får `format: "dragonframe"` med valgene.
- **Tekster**: 18 `ptg2.*`-nøkler på alle ti språk. fr, es, de, it, pt-BR, ru, ja og ko er maskinoversatt og merket `review: machine`.
- **Migrasjon**: ikke nødvendig. Eksportloggens `settings` er fri JSON.

## Tester
- `tests/unit/ptg2-dragonframe.test.ts`, 8/8: enere, toere (125 eksponeringer, hvert bilde to ganger), 25 bilder/s fra 24, X-sheet-rader og ordplassering, lagbevegelse start/slutt, tom munn-kolonne, CSV-rader, PDF-oppsett for A4 og Letter, lydstemmer, WAV 24 bit (topptekst, lengde og fortegn) og mappenavn.
- `tests/visual/ptg2-dragonframe.mjs`: nb 20/20 og en 20/20. Testen bruker et 25 bilder/s-prosjekt med opptak på toere. Den sjekker ZIP-strukturen, at alle WAV-filer er 48 kHz/24 bit med lengde lik antall bilder × 2000 prøver, at X-sheet har én rad per eksponering, PDF i A4 og Letter, og at FBX bare finnes for skuddet med rigg. Referansefilmen dekodes med mediabunny og sammenlignes bilde for bilde med PNG-sekvensen, som er monteringens egne bilder: bildeantallet og 24 bilder/s stemmer, og største avvik er under 7 av 255.
- Regresjon: se svaret (ptg1-shotlist, ptg3-camera, full Vitest, DB og i18n).

## Begrensninger og åpne punkter
- PDF bruker standardfonten Helvetica. Den dekker latinske tegn (også æøå), men ikke japansk, koreansk eller kyrillisk. CSV-en har alle tegn.
- PNG-sekvensen har ett bilde per videobilde. På toere står hver eksponering derfor som to like filer.
- Ekte import i Dragonframe er ikke prøvd. Det må kontrolleres eksternt.
- Bildekontrollen sammenligner dekodet video med PNG-ene fra samme lerret. At PNG-ene viser riktig monteringsbilde, er dekket av modelltesten for `referenceFrames`.
