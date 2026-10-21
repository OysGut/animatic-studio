# Byggeplan PTG («From Pen to Glass», B-102)

Grunnlag: `PHASE3_PTG_SPEC.md`. Rundene legges i LOVABLE_KO **etter** det som allerede står der, med mindre Øystein sier noe annet. Hver runde er liten nok til grundig verifisering. Standardvalgene i spesifikasjonen §11 gjelder til Øystein har svart.

| Runde | Innhold | Migrasjon |
|---|---|---|
| PTG1 | Utvekslingsmodell, avrunding, navn, prosjektkode, skuddliste, ZIP64 og LESMEG | 0076 (`projects.code`) |
| PTG2 | Dragonframe-pakke uten kamera: referansefilm, lyd per karakter og X-sheet | nei |
| PTG3 | Kamera i fysiske enheter, FBX for Dragonframe og After Effects-pakke | trolig nei |
| PTG4 | Leppesynk: munnsett, tekststyrt utkast, munnspor, munnliste og Moho .dat | ja, sannsynligvis (munnsett) |
| PTG5 | Rundtur fra Dragonframe (`take.xml`) | avhenger av bildesekvens som take |
| PTG6 | OTIO, FCP7-XML og EDL | nei |
| PTG7 | Nuke og Fusion, og profiler for Flow, ftrack og Kitsu | nei |

Migrasjonsnumrene forutsetter køen i dag (0073 B-097, 0074 B-098, 0075 rigg runde 5) og justeres når rundene sendes. PTG4 kommer etter B-100 (munnsporet i den sammenslåtte tidslinjen).

## Felles for alle runder (tas med i hver melding)
> - Skriv rapport og verktøybeskrivelser på norsk bokmål. Ikke endre database eller kode utenfor oppdraget, og spør Claude hvis du er usikker.
> - Alle eksportører leser fra `src/core/interchange/`. Ingen regner ut tid, kamera eller navn selv.
> - Eksportene virker uten AI. Utvid `tests/architecture/eksport-uten-ai.test.ts` med de nye filene.
> - Nye tekster via `t()` på nb og en. Pakker strømmes via `zip.ts` (OPFS der det finnes) med `LESMEG.txt` på nb og en.
> - Kjør suitene én om gangen. Full vitest og DB skal være grønne.

## Oppdrag PTG1 (klar)
> Bygg PTG1 av «From Pen to Glass» (B-102, spesifikasjonen ligger vedlagt som `docs/product/phase3/PTG_SPEC.md`; legg den inn ordrett) helt ferdig.
> 1. **`src/core/interchange/`:** `buildInterchange(state, {productionId, language, occurrenceIds, captureFps})` gir `InterchangeDoc` etter spesifikasjonen §4.
>    - Skudd = sceneforekomst.
>    - Lag, lyd og dialog tas med slik de finnes i dag. Kamera kommer i PTG3, så feltet er `null` nå.
>    - Ren TypeScript. Ingen nettleser-API.
> 2. **Avrunding:** grensene mellom skudd rundes med `secondsToFrames` langs filmen. Lengden er differansen. Samme regel gjelder ord- og lydtider. Gyldne tester for 12, 24, 25 og 30 bilder/s og for bytte (prosjekt 24, opptak 12 og 25):
>    - summen av skuddene er lik filmens lengde;
>    - tidskode inn og ut er riktig;
>    - en tom og en svært kort scene (under ett bilde) er håndtert og dokumentert.
> 3. **Navn:** `PROSJEKT_SC012_SH010_v003`.
>    - Prosjektkoden er A–Z og 0–9, høyst 8 tegn, og foreslås fra prosjektnavnet (æ → AE, ø → OE, å → AA).
>    - `SC` er `sceneNumberOf` med tre sifre, med tillegg som `SC042A`.
>    - `SH010`.
>    - Versjonen øker per eksport av skuddet og lagres i eksportloggen (`export-records`).
>    - Tester for tillegg, spinoff, språk og kollisjon.
> 4. **Migrasjon 0076 (bare additiv):**
>    - `projects.code text null` med check `^[A-Z0-9]{1,8}$`;
>    - kommando og angring via `apply_changes` (oppdatering av prosjektraden);
>    - ta utgangspunkt i siste migrasjon som er kjørt i Cloud, og oppgi alle funksjoner som erstattes;
>    - Claude kjører migrasjonen i Cloud.
> 5. **Skuddliste:**
>    - CSV (UTF-8 med BOM) og JSON med kolonnene i spesifikasjonen PTG-A4;
>    - profiler for Flow, ftrack og Kitsu (bare navn og rekkefølge på kolonnene);
>    - miniatyrer som PNG i pakken, med relativ sti.
> 6. **`zip.ts`:**
>    - ZIP64, slik at pakker over 4 GB virker. Tester med syntetisk stor oppføring uten å skrive 4 GB til disk, for eksempel ved å teste hodene;
>    - `LESMEG.txt` på nb og en i alle pakker.
> 7. **Eksportdialogen:** ny seksjon «Til produksjonen» med «Skuddliste (CSV/JSON)». Prosjektkoden vises og kan endres der og i prosjektinnstillingene.
> 8. **Tester:**
>    - gyldne tester som over;
>    - ny suite `ptg1-shotlist.mjs` på nb og med `UI_LANG=en`: last ned skuddlisten og kontroller kolonner, navn og summen av lengdene;
>    - regresjon på export-e2e og p4;
>    - full vitest og DB.
>
> Rapporter på norsk i `docs/development/PTG1_REPORT.md`.

## Oppdrag PTG2 (klar)
> Bygg PTG2: «Send til Dragonframe» uten kamera (spesifikasjonen PTG-B1–B4 og B6).
> 1. **Pakke** for valgte scener, med én mappe per skudd navngitt etter PTG1.
> 2. **Referansefilm** i opptakets bildefrekvens, bildenøyaktig. MP4 H.264, og valgfritt PNG-sekvens.
>    - Valgfri påskrift: skuddnavn, bildenummer og tidskode. Plass til munnavn fra PTG4.
>    - Gjenbruk `exportAnimatic`. Omregning av bildefrekvens skjer bare via modellen.
> 3. **Lyd:**
>    - ny stem-funksjon per karakter (`characterAssetId`), pluss atmosfære, musikk og effekter hver for seg, og en samlet miks;
>    - WAV 48 kHz 24-bit, like lange som skuddet, med volumpunkter og fade bakt inn;
>    - riktig språkversjon.
> 4. **X-sheet** som PDF (A4 og Letter) og CSV, med én rad per bilde:
>    - bilde og tidskode;
>    - karakter og replikk, der hvert ord står på bildet det starter;
>    - en tom kolonne for munn (fylles i PTG4);
>    - handling fra manus;
>    - start og slutt på lagbevegelser;
>    - notater.
> 5. **LESMEG** forklarer import i Dragonframe: referanselag, lyd og X-sheet-import. KI for sporlesing (PTG-B6).
> 6. **Tester:**
>    - referansefilmen kontrolleres bilde for bilde mot monteringen (mediabunny);
>    - lengden på lydfilene er lik skuddet;
>    - X-sheet-radene er lik antall bilder;
>    - ny suite `ptg2-dragonframe.mjs` på nb og en;
>    - full vitest.
>
> Rapport: `PTG2_REPORT.md`.

## Oppdrag PTG3 (skisse, fullføres når PTG1 er verifisert)
- **Kameraet i fysiske enheter etter spesifikasjonen §4:**
  - kamerahøyde eller synsfelt per bilde fra zoom og rigg;
  - panorering i mm via `pxPerMm`;
  - rotasjon blir rull;
  - begge modusene («fast» og «fysisk»).
- **FBX ASCII 7.4** med den gamle tidsenheten (46 186 158 000) for Dragonframe, med FilmWidth i tommer og FocalLength i mm. Merkes eksperimentell.
- **After Effects-pakke (`bygg.jsx`, ES3)** etter PTG-F1. Kamera som AE-kamera, med zoom = bredde × f / filmbredde, eller som 2D-parallakse med null-lag.
- **Kontroll:** Claude leser FBX-filen inn i Blender i sandkassen og sammenligner med appen.

## Oppdrag PTG4–PTG7 (skisser)
- **PTG4:**
  - munnsett (A–X og Preston Blair) med kobling til biblioteksvarianter;
  - NB Uttale (CC0) som datafil;
  - NoFAbet gjøres om til munnformer;
  - fordeling innenfor ordtider, og Rhubarb som valgfri finjustering;
  - munnspor i den sammenslåtte tidslinjen (etter B-100);
  - munnliste;
  - avvik ved endring;
  - Moho `.dat` og JSON;
  - munnkolonnen i X-sheet og påskrift på referansefilm.
- **PTG5:**
  - import av en Dragonframe-take fra mappe, via `take.xml` og bildefiler `*_X1_*`, eller fra eksportert film;
  - gjenkjenning på navn;
  - ny `Take` som ikke aktiveres automatisk;
  - toere, for kort eller for lang, og delvis ferdig;
  - blanding i monteringen;
  - testmappe som fixtur.
- **PTG6:**
  - OTIO (Timeline.1 med Stack, Track og Clip, og ExternalReference);
  - FCP7-XML (xmeml) for Premiere;
  - CMX 3600 EDL med reelnavn på 8 tegn og en tabell i LESMEG;
  - import i Resolve kontrolleres.
- **PTG7:**
  - Nuke `.nk` med Read → Card3D per plate → Camera → ScanlineRender og kurver;
  - Fusion `.comp`;
  - ferdige profiler for Flow, ftrack og Kitsu, og EDL til «Import Cut».
