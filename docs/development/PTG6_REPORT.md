# PTG6 – klippefiler: OTIO, FCP7-XML og EDL

## Leveranse

«Til produksjonen» har nå «Klippefiler (OTIO, XML, EDL)» og valg om å inkludere medier. ZIP64-pakken inneholder tre klippefiler og LESMEG på norsk og engelsk, med reel → skuddnavn → videofil og lydtabell. Uten medier peker filene på de samme relative stiene som pakken med medier bruker.

- OTIO: Timeline.1, Stack.1, ett videospor og ett MIX-lydspor, Clip.2 med ExternalReference.1 og RationalTime på utvekslingsmodellens opptaks-/leveransefrekvens. Overlapp gir Transition.1 med midtpunktklipp og håndtak.
- Premiere XML: xmeml v5, relative mediestier, rate/timebase/ntsc, videostørrelse, stereolyd og overgangselementer.
- CMX 3600: ett videospor, NDF-tidskode, faste kolonner og stabile unike reelnavn på maksimalt åtte tegn. Kollisjoner får base36-suffiks; fullstendige navn beholdes i kommentarer og LESMEG.
- Medier: referansefilm og WAV MIX per skudd, inkludert håndtak. Aktiv take følger eksisterende monteringsmodell; andre skudd beholder animatic. Hvert skudd rendres alene, så naboens bildeovergang ikke bakes inn før klippeprogrammet legger den til. Lydens språkvalg, volum og fade følger eksisterende lydmotor; WAV er 48 kHz / 24 bit stereo.
- Toere: videoen beholder 24 bilder/s med gjentatte eksponeringer. Navn og tid beregnes kun i `src/core/interchange/`. Ingen AI eller betalte tjenester.
- Eksporten bruker eksisterende versjonsreservasjon og fullføring av eksportlogg. Ingen ny migrasjon, ingen erstattede databasefunksjoner, ingen automatisk aktivering av takes.

## Verifisering

| Kontroll | Resultat |
|---|---|
| Full Vitest, `bunx vitest run --maxWorkers=3` | 2346 bestått, 0 feilet, 10 eksisterende hoppet over; 289 testfiler bestått, 2 eksisterende hoppet over |
| PTG6 enhetstester | 10 bestått, inkludert gyldne 24/25/30/toere-filer, sum av klipp, XML, OTIO, EDL-kolonner/reels og aktiv take |
| Lokal DB-suite | 158 bestått, 0 feilet |
| i18n check, validate og release-check | Bestått; ingen tekst uten engelsk, ingen manglende/utdaterte registrerte oversettelser |
| ptg6-editorial nb / en | 23/23 på hvert språk; ekte ZIP med/uten medier, videolengde/bildefrekvens, aktiv testtake bilde for bilde, WAV-format/lengde, ingen AI/aktivering |
| ptg1-shotlist nb / en | 35/35 på hvert språk |
| ptg2-dragonframe nb / en | 21/21 på hvert språk |
| ptg5-roundtrip nb / en | 18/18 på hvert språk |
| OpenTimelineIO 0.18.1 + FCP7-/CMX-adaptere | 12/12 filer lest og kontrollert; varighet 43/45/54/43 bilder, to klipp og én overgang |
| Forhåndsvisning | Siste automatiske kontroll: build OK; norsk og engelsk eksportfelt visuelt kontrollert |

Nettlesersuitene ble kjørt sekvensielt, med faste fixturer og mockede tjenester. PTG6-testfilmen lages i nettleseren; ingen lokal `/tmp`-mediefil kreves av suiten. Hele testsamlingen bestod etter begrensning til tre samtidige arbeidere: første ubegrensede kjøring fikk en tidsavbrutt i18n-test under høy belastning, ikke en endret testforventning. En arkitekturfeil fra ordet «document.» i en kommentar ble rettet i koden; arkitekturtestene er uendret.

## Språk

Sju PTG6-nøkler er skrevet på nb og en og lagt inn samtidig på fr, es, ru, ja, pt-BR, de, it og ko. De åtte sistnevnte er maskinoversatt og merket for gjennomlesing med oppdatert engelsk kildehash. EN-XA er regenerert. Eksportformatenes schemaord, mediestier og brukerens manusinnhold oversettes ikke.

## Gjenstående ekstern kontroll

Ekte import i Resolve, Premiere og Avid er ikke prøvd her og står i TODO.md. Adapterparsing alene bekrefter ikke programimport. Ekte prosjektlagring/medieopplasting i Cloud er heller ikke kontrollert av de mockede nettlesertestene. Chromium i dette testmiljøet mangler H.264-koder/-dekoder; eksisterende eksportmotor velger en tilgjengelig MP4-kompatibel koder. H.264-kompatibilitet må derfor inngå i den manuelle importprøven på produksjonsmaskinene.

## Nøyaktige filer endret eller opprettet i PTG6

- `AGENTS.md`
- `TODO.md`
- `roadmap.md`
- `docs/development/PTG6_REPORT.md`
- `src/core/interchange/editorial.ts`
- `src/engine/export/editorial.ts`
- `src/app/assembly/ShotlistExport.tsx`
- `tests/unit/ptg6-editorial.test.ts`
- `tests/visual/ptg6-editorial.mjs`
- `tests/fixtures/ptg6/generate.ts`
- `tests/fixtures/ptg6/verify.py`
- `tests/fixtures/ptg6/24.otio`
- `tests/fixtures/ptg6/24.xml`
- `tests/fixtures/ptg6/24.edl`
- `tests/fixtures/ptg6/24.timing.json`
- `tests/fixtures/ptg6/25.otio`
- `tests/fixtures/ptg6/25.xml`
- `tests/fixtures/ptg6/25.edl`
- `tests/fixtures/ptg6/25.timing.json`
- `tests/fixtures/ptg6/30.otio`
- `tests/fixtures/ptg6/30.xml`
- `tests/fixtures/ptg6/30.edl`
- `tests/fixtures/ptg6/30.timing.json`
- `tests/fixtures/ptg6/twos.otio`
- `tests/fixtures/ptg6/twos.xml`
- `tests/fixtures/ptg6/twos.edl`
- `tests/fixtures/ptg6/twos.timing.json`
- `src/core/i18n/authored.json`
- `src/core/i18n/runtime.gen.json`
- `src/core/i18n/locales/nb.json`
- `src/core/i18n/locales/en.json`
- `src/core/i18n/locales/en-XA.json`
- `src/core/i18n/locales/fr.json`
- `src/core/i18n/locales/es.json`
- `src/core/i18n/locales/ru.json`
- `src/core/i18n/locales/ja.json`
- `src/core/i18n/locales/pt-BR.json`
- `src/core/i18n/locales/de.json`
- `src/core/i18n/locales/it.json`
- `src/core/i18n/locales/ko.json`
- `scripts/i18n/mapping.v1.json`
- `scripts/i18n/references.v1.json`
- `scripts/i18n/candidates.v1.json`
- `scripts/i18n/inventory-report.json`

Prosjektminnet ble også oppdatert med den bekreftede PTG6-regelen; det er ikke kildekode.