# PHASE3 PTG: «From Pen to Glass», utveksling med produksjonsprogrammene

*Spesifikasjon v1, skrevet av Claude 21.10.2026 etter instruksen `docs/development/INSTRUKS_PEN_TO_GLASS_UTVEKSLING.md` (Øystein). Beslutning B-102. Dette dokumentet erstatter tidligere planer for After Effects-eksport, som nå er del F. Lottie holdes utenfor.*

**Status:** utkast til Øystein. Ingenting er sendt til Lovable. Standardvalgene i §11 brukes til han svarer.

## 1. Mål
Animatic Studio skal være broen inn i produksjonen:
- en godkjent animatic skal kunne tas med inn i Dragonframe, klippe- og compositingprogrammer og produksjonsstyring uten at noe gjøres på nytt;
- det som skytes eller animeres, skal kunne komme tilbake som nye versjoner av scenene, så regissøren alltid ser hele filmen, med en blanding av ferdige skudd og animatic.

Målgruppen er små og mellomstore studioer, med vekt på stop motion (dukker, leire, utklipp og papir på glassplater) og 2D/motion.

## 2. Slik er koden i dag (undersøkt 21.10, HEAD f8da11f)
Fakta som spesifikasjonen bygger på. Tall og navn er fra koden, ikke antatt.

- **Kamera** (`model.ts`, `composition/render.ts`):
  - `Composition.camera.shots: CameraShot{ startFrame, endFrame, from, to: CameraFrame{x, y, zoom, rotation}, curve (kubisk Bézier i rommet) | null, easing }`;
  - x og y er i scenepiksler, zoom er relativ (1 = hele formatet), og rotasjon er i grader;
  - easing er navngitt (linear, ease-in, ease-out, ease-in-out, hold). Det finnes ingen keyframes per egenskap og **ingen brennvidde eller synsvinkel** på det digitale kameraet.
- **Multiplan:**
  - `CompositionLayer.parallax` (0–4, standard 0,3, 0,65, 1,4 og 1) styrer parallaksen;
  - riggen (B-087, `src/core/rig/multiplane.ts`) har sensor, brennvidde og kamerahøyde i mm, plater med høyde i mm og kalibrering;
  - laget har `rigPlateId` og `rigPlateDepthMm`;
  - `plateParallax = dRef/d`. Å koble et lag til en plate endrer ikke `parallax`.
- **Laganimasjon:**
  - `Keyframe{frame, property (x, y, scaleX, scaleY, rotation, opacity, maskX/Y/W/H), value, easing, easeOut, easeIn}`. easeIn og easeOut er «influence» 0–1, som i After Effects;
  - `MotionPath{points{x, y, smooth}, startFrame, endFrame, easeOut, easeIn, tempo}` har ingen eksplisitte tangenter;
  - grupper er ett nivå med `anchor`;
  - `LayerMask` er rektangel, ellipse eller klippelag;
  - `ImageSwap{frame, versjon, crossfade}`;
  - `Composition.step` gir animasjon på toere.
- **Lyd og dialog:**
  - `AudioClip.kind` er dialogue, narration, sfx, ambience eller music;
  - tid er i ms, med `volumeKeys{t, db}`, `characterAssetId`, `language` og `speechLanguage`;
  - lydversjoner ligger i `dialogue_versions`;
  - ordtider (`WordAlignment`) ligger på lydfilens versjon.
- **Takes:**
  - `Take{occurrenceId, kind: composition2d | ai_video | imported_film | still | audio_only, status: reference | in_progress | approved, media{fps, durationMs, …}}`;
  - importert film blir en `Take` med `SetSceneEdit` som aktiv take på sceneforekomsten;
  - filens fps brukes ikke til omregning (tid i sekunder).
- **Tid** (`time.ts`): `Rational` fps, `secondsToFrames` (nærmeste, halvveis opp), `formatTimecode` (uten drop-frame).
- **Eksport** (`src/engine/export/`):
  - MP4 (H.264) og WebM, ProRes og MOV, og alfa (PNG-sekvens i zip);
  - `zip.ts` strømmer til fil eller OPFS uten komprimering, med grense på omtrent 4,2 GB (**ikke ZIP64**), og lager `MANGLER.txt`;
  - lydstem: **én** WAV med all dialog, og **ingen stems per karakter**;
  - eksportpakkene har ingen LESMEG.
- **Navn og identitet:**
  - det finnes **ingen egen skudd-entitet**;
  - `sceneNumberOf` gir visningsnummeret;
  - `ProductionSegment` brukes til generering;
  - `file-names.ts` gjelder bare biblioteket.
- **Språk:** `FilmLanguage{dialogue, subtitles}`. `languageState` og `filmAudio(lang)` brukes ved eksport.
- **Leppesynk:**
  - `LipsyncResult{spans{frame, endFrame, viseme}, overrides, source: rhubarb | rule}` med munnformene A–H og X (Rhubarb);
  - `rhubarb-lip-sync-wasm` 0.1.8 (MIT, B-059), med regelbasert reserve fra ordtider og lydenergi;
  - det finnes et tegneark for munnformer (`mouth-sheet.ts`);
  - det finnes ikke noe eget munnspor.
- **Status:** `productionStatus()` beregner done, film, animatic, missing eller inactive. Det lagres ikke.
- **Arkitekturtest:** `eksport-uten-ai.test.ts` stopper import av `src/adapters/ai/` fra `src/core`, `src/engine` og eksportdialogene.

## 3. Formater (undersøkt på nett 21.10, kilder i §12)
| Mål | Format vi skriver | Status og forbehold |
|---|---|---|
| Dragonframe referanse | MP4 H.264 og PNG-sekvens | Dokumentert. |
| Dragonframe lyd | WAV 48 kHz, ett spor per karakter, pluss miks | WAV er dokumentert. Antall samtidige spor er ikke dokumentert. |
| Dragonframe X-sheet | PDF og CSV fra oss | Dragonframe har X-sheet-import fra CSV, men kolonnene er ikke dokumentert. Vi lager vår egen CSV og PDF og prøver import mot ekte Dragonframe. |
| Dragonframe sporlesing | **Ikke mulig nå** | Formatet er ikke offentlig dokumentert. Reserveløsningen er X-sheet pluss referansefilm med munnavn påført. |
| Dragonframe kamera (Arc) | FBX ASCII 7.4 | DF5 importerer FBX med virtuelle akser. Enheter og noder er ikke dokumentert, så dette er **eksperimentelt** til det er prøvd på en ekte rigg. |
| After Effects | `.jsx` (ExtendScript, ES3) | Sikkert. AE-kamera via zoom = bredde × f / filmbredde. AE sin FBX-import er beta, og glTF mister brennvidde, så vi bruker ikke det mot AE. |
| Nuke | `.nk` med Camera og kurver | Nuke leser også FBX-kamera. Non-Commercial har begrensninger (1080p, kryptert .nknc). |
| Fusion | `.comp` (Lua-tabeller) | FBX-import finnes også. |
| Klipp | OTIO (Resolve og Avid 2025.6+), **FCP7-XML (xmeml) for Premiere**, CMX 3600 EDL | Premiere leser ikke `.fcpxml`, og OTIO er i beta der. FCPXML kan vente. **Dette avviker fra instruksen:** FCP7-XML erstatter FCPXML i første versjon. |
| Produksjonsstyring | CSV med profiler for Flow, ftrack og Kitsu, og EDL | Flow «Import Cut» og Kitsu leser EDL. Kolonnenavnene i ftrack og Kitsu er ikke fullt dokumentert. |
| Leppesynk | Munnformene A–X (Rhubarb), og Moho `.dat` og JSON | NB Uttale (Språkbanken) er **CC0** og har bokmål. eSpeak NG er GPLv3 og skal ikke bygges inn. |

## 4. Grunnprinsipp: én utvekslingsmodell
Alle eksporter leser fra én ren modell i `src/core/interchange/`. Ingen eksportør regner ut kamera, tid eller navn selv.

```
InterchangeDoc {
  project: { id, code, name }, production: { id, name }, language: { dialogue, subtitles|null },
  fps: Rational (opptakets bildefrekvens), sourceFps: Rational (prosjektets),
  shots: Shot[], references: FileRef[], namingVersion: "1"
}
Shot { id (sceneforekomstens id), sceneId, sceneNumber (visning), shotNumber, name,
       startFrame, lengthFrames, timecodeIn, timecodeOut,
       layers: LayerTrack[], camera: CameraTrack | null, audio: AudioTrack[], dialogue: DialogueLine[] }
```

- **Skudd = sceneforekomst** i valgt produksjon. Første versjon gir ett skudd per scene (`SH010`). Senere kan et skudd deles på kameraskudd (`CameraShot`) eller produksjonssegmenter (`SH010`, `SH020`). Det er åpent spørsmål S7.
- **Avrunding (én regel):** grensene mellom skudd rundes, ikke lengdene. For hvert skudd regnes start og slutt i sekunder langs filmen, og hver grense blir `secondsToFrames(t, fps)`. Lengden er differansen. Da blir summen alltid filmens lengde i bilder, og ingen feil hoper seg opp. Det samme gjelder tider inne i skuddet (ord og lyd).
- **Bytte av bildefrekvens:** prosjektet kan være 24 og opptaket 12 (toere) eller 25. Modellen har både `fps` og `sourceFps`, og all omregning skjer bare i modellen.
- **Kamera i fysiske enheter (fra PTG3):**
  - kameraet regnes ut fra scenens rigg (B-087). Synsfeltet på referanseplaten er `sensor/m`, og zoom z gir synsfelt `W0/z`;
  - i modusen «fysisk kamera» gir det ny kamerahøyde etter linseformelen. I modusen «fast kamera» står kamerahøyden fast, og zoomen ligger i figurstørrelsen (B-090);
  - panorering i piksler gjøres om til mm med `pxPerMm` på referanseplaten, og rotasjon blir rull;
  - både 3D-tolkning (plater på z) og 2D-tolkning (parallakse) avledes. Kameraet får aldri egne mål ved siden av riggens.
- **Myking:** lagenes `easeIn` og `easeOut` (influence) blir AE sin `KeyframeEase(speed, influence × 100)`. Navngitt easing blir standard influence. Banens tangenter regnes fra samme spline som `transformAt`, slik at AE- og Nuke-banen ligger på samme sted.
- **Navn:** `PROSJEKT_SC012_SH010_v003`.
  - `PROSJEKT` er en kort prosjektkode (A–Z, 0–9, høyst 8 tegn) som foreslås fra navnet og kan endres;
  - `SC` er visningsnummeret med tre sifre, og tillegg som `42A` beholdes som `SC042A`;
  - `SH` er skuddnummeret i trinn på 10;
  - `v` er utvekslingsversjonen, som øker for hver eksport av skuddet og lagres i eksportloggen;
  - navnet er det samme i alle formater, mappenavn og filnavn. Det er nøkkelen for rundturen tilbake.
- **Pakker:**
  - zip via eksisterende strømming (OPFS der det finnes), med `LESMEG.txt` på norsk og engelsk;
  - **ZIP64 legges til** (PTG1), fordi referansefilmer for en hel film kan bli over 4 GB.
- **Utvalg:** én produksjon, ett språk og ett utvalg scener, som i filmeksporten.
- **Tilgang:** som dagens eksport.

## 5. Krav (REQ-0916 og videre; Lovable bekrefter nummerne mot `requirements.yaml`)

### A. Modell og skuddliste (PTG1)
- **PTG-A1:** `src/core/interchange/` bygger `InterchangeDoc` for en produksjon, et språk og et utvalg. Ren TypeScript uten nettleser-API.
- **PTG-A2:** avrundingsregelen fra §4. Gyldne tester for 12, 24, 25 og 30 bilder/s, og for bytte av bildefrekvens: summen av skuddene er lik filmens lengde, og tidskode inn og ut er riktig.
- **PTG-A3:** navnekonvensjonen fra §4, med prosjektkode, versjonsteller i eksportloggen og tester for tillegg (42A), spinoff og språk.
- **PTG-A4:** skuddliste som CSV og JSON med kolonnene Sequence, Shot (code), Description, Frame In, Frame Out, Cut In, Cut Out, NB Frames, Duration (tid), Characters, Sets, Props, Dialogue, Status og Thumbnail (relativ sti). Den har profiler for Flow (`code`, `sg_sequence`, `sg_cut_in`, `sg_cut_out`), ftrack og Kitsu (`Sequence`, `Name`, `NB Frames`, `Frame IN`, `Frame Out`).
- **PTG-A5:** ZIP64 i `zip.ts`, og `LESMEG.txt` i alle pakker.
- **PTG-A6:** eksportdialogen får seksjonen «Til produksjonen», som viser hvilke pakker som finnes.

### B. Send til Dragonframe (PTG2, kamera i PTG3)
- **PTG-B1:** én pakke for valgte scener, med én mappe per skudd, navngitt etter §4.
- **PTG-B2:** referansefilm i opptakets bildefrekvens, bildenøyaktig. MP4 H.264, og valgfritt PNG-sekvens. Påskrift kan velges: skuddnavn, bildenummer og tidskode, og munnavn fra PTG4.
- **PTG-B3:** lyd per karakter som WAV 48 kHz 24-bit, pluss atmosfære, musikk og effekter, og en samlet miks. Alle er like lange som skuddet, med volumpunkter bakt inn. Dette krever en ny stem-funksjon per karakter.
- **PTG-B4:** X-sheet som PDF (A4 og Letter) og CSV, med én rad per bilde. Kolonnene er bilde, tidskode, replikk med karakter (ordene på sine bilder), munnform (fra PTG4), handling fra manus, kamera og lag (start/slutt på bevegelser) og notater.
- **PTG-B5:** kamera som FBX ASCII 7.4 når skuddet har kamerabevegelse (PTG3). Merkes «eksperimentell» til det er prøvd i ekte Dragonframe.
- **PTG-B6:** sporlesing i Dragonframes eget format lages ikke før formatet er dokumentert. Det registreres som KI.

### C. Leppesynk og munnliste (PTG4)
- **PTG-C1:** munnsett per karakter. Standard er Rhubarbs A–H og X, og Preston Blair kan velges. Hver munnform kan kobles til en variant i biblioteket.
- **PTG-C2:** tekststyrt utkast:
  - ordene i replikken slås opp i NB Uttale (CC0);
  - NoFAbet gjøres om til munnformer;
  - lydene fordeles innenfor kjente ordtider, med minste varighet og hold, og rundes til bilder etter §4;
  - Rhubarb («phonetic») kan brukes som valgfri finjustering fra lyden;
  - det redigeres for hånd i et munnspor i den sammenslåtte Scene-tidslinjen (B-100).
- **PTG-C3:** munnliste per karakter: hvilke munner som trengs, hvor ofte de brukes og i hvilke skudd. Den kan skrives ut, og kobles senere til utskrift og 3D-print.
- **PTG-C4:** endres replikken eller lyden, merkes munnsporet som utdatert, etter samme mønster som avvik mellom manus og lyd (DV7).
- **PTG-C5:** eksport av munnsporet som Moho `.dat` og JSON i pakken.

### D. Rundtur fra Dragonframe (PTG5)
- **PTG-D1:** import av en Dragonframe-take (mappe med `take.xml` og bildefiler `*_X1_*`) eller en eksportert film. Rekkefølgen og skjulte bilder leses fra `take.xml` (`scen:edl`), ikke ved å telle filer.
- **PTG-D2:** skuddet gjenkjennes på navnekonvensjonen. Er gjenkjenningen usikker, velger brukeren. Det blir en ny `Take` (`imported_film` eller bildesekvens) på riktig sceneforekomst, med riktig bildefrekvens og lengde, og blir **ikke** aktiv uten bekreftelse.
- **PTG-D3:** opptak på toere oppdages og vises riktig. Er skuddet for kort eller for langt, varsles det, og ingenting klippes i stillhet. Delvis ferdige skudd vises som delvis ferdige.
- **PTG-D4:** monteringen viser en blanding av ferdige skudd og animatic. Produksjonsstatusen følger av `productionStatus()`, og det lagres ingen ny statuskolonne.

### E. Klipp (PTG6)
- **PTG-E1:** OTIO (JSON), FCP7-XML (xmeml) og CMX 3600 EDL. Mediereferansene er relative, og klippnavnene følger §4.
- **PTG-E2:** EDL-begrensninger: ett videospor, reelnavn på 8 tegn (avledet og listet i en tabell i LESMEG) og tidskode uten drop-frame.
- **PTG-E3:** validert ved import i DaVinci Resolve (gratis), som Claude eller Øystein gjør. Premiere og Avid prøves når noen har dem.

### F. Compositing (PTG3 for AE, PTG7 for Nuke og Fusion)
- **PTG-F1 (AE):**
  - zip med bilder, lyd og `bygg.jsx` (ES3);
  - én komposisjon per skudd og en hovedkomposisjon;
  - lag med transformasjoner og nøkkelbilder;
  - myking etter §4;
  - baner som romlige tangenter;
  - bildeskifter som tidsremapping eller sekvens;
  - grupper som null-foreldre;
  - masker som `Shape`;
  - lyd med volumpunkter;
  - kamera enten som AE-kamera (3D, plater på z) eller som 2D-parallakse med null-lag, valgt ved eksport;
  - overganger mellom scener er utenfor.
- **PTG-F2 (Nuke):** `.nk` med Read → Card3D per plate → Camera (kurver) → ScanlineRender, og lagene i riktig dybde.
- **PTG-F3 (Fusion):** `.comp` med tilsvarende innhold.

## 6. Ikke-funksjonelle krav
- Alle eksporter virker helt uten AI (`eksport-uten-ai.test.ts` utvides med de nye filene).
- Pakkene strømmes og tåler en lang film uten å bygge alt i minnet der OPFS finnes.
- Alle nye tekster går via `t()` (nb og en).
- Ingen betalte kall.
- Det lagres ingen manustekst utenfor prosjektets egne data. Pakkene inneholder bare det brukeren eksporterer.

## 7. Akseptkriterier og testing
- Gyldne tester i Vitest for modellen: lengde, tidskode, avrunding, navn og at summen er lik filmen, ved 12, 24, 25 og 30 bilder/s og ved bytte av bildefrekvens.
- **Kamera:** FBX-filen leses inn igjen i Blender i sandkassen (Claude), og posisjon og synsfelt per bilde sammenlignes med appens egen visning, innenfor 0,1 mm og 0,01°.
- **Referansefilm:** kontrolleres bilde for bilde mot monteringen med samme mediabunny-metode som dagens eksporttester.
- **Rundtur:** testes med en kunstig Dragonframe-mappe med `take.xml`, toere, for korte og for lange skudd og skjulte bilder.
- **Klipp:** OTIO, EDL og xmeml importeres i Resolve. Det noteres hva som er prøvd i ekte program og hva som bare er testet mot formatet.
- Skjermbilder av nye dialoger. Kodegjennomgang med underagent etter hver runde.

## 8. Utenfor
- direkte lesing av `.aep`;
- Lottie;
- styring av motion control eller lys;
- import av OTIO og andre klippeformater tilbake;
- 3D-print av munner (TODO_3D_PRINT);
- Dragonframes sporlesingsformat (PTG-B6).

## 9. Avhengigheter
- **PTG3 og B-087:** kameraet trenger rigg runde 1 (finnes) og helst at platenivå og parallakse er avklart.
- **PTG4 og B-100:** munnsporet bør ligge i den sammenslåtte Scene-tidslinjen. PTG4 bør derfor komme etter B-100.
- **Prosjektkode og versjonsteller:** trolig en liten additiv migrasjon i PTG1 (`projects.code`; versjonstelleren kan ligge i eksportloggen).

## 10. Risiko
- Dragonframes FBX og X-sheet er ikke dokumentert offentlig. Uten et ekte Dragonframe-oppsett kan vi ikke garantere import (S4).
- Rhubarb-pakkens lisens er oppgitt som MIT i B-059. Lisensen til selve Rhubarb-prosjektet skal bekreftes før PTG4.
- Nuke Non-Commercial kan ha problemer med å åpne vanlige `.nk` (usikkert).
- Pakker over 4 GB krever ZIP64. Uten det feiler lange filmer.

## 11. Åpne spørsmål til Øystein (standardvalg i parentes)
1. **S1 Rekkefølge:** utklipp og papir på glassplater først, eller dukker og leire? *(Standard: rekkefølgen i byggeplanen. Utklipp flytter PTG3 fram, dukker flytter PTG4 fram.)*
2. **S2 Navn:** `PROSJEKT_SC012_SH010_v003`, med prosjektkode på høyst 8 tegn? *(Standard: ja.)*
3. **S3 Bildefrekvens for opptak:** *(standard 24, valgbar per prosjekt; 12 betyr toere)*.
4. **S4 Ekte prøving:** finnes et studio eller en animatør med Dragonframe og After Effects som kan prøve pakkene? *(Uten det merkes Dragonframe-kamera og X-sheet-import «ikke prøvd i ekte program».)*
5. **S5 Hvem kan eksportere:** *(standard: som dagens eksport)*.
6. **S6 Utvalg:** hovedfilm, spinoffer og språkversjoner? *(Standard: valgt produksjon og språk, som filmeksporten.)*
7. **S7 Skudd:** ett skudd per scene i første versjon, eller dele på kameraskudd allerede nå? *(Standard: ett per scene, deling senere.)*
8. **S8 Klipp:** FCP7-XML for Premiere i stedet for FCPXML, som Premiere ikke leser? *(Standard: ja, FCPXML senere.)*

## 12. Kilder (utdrag; hele listen ligger i undersøkelsesnotatet fra 21.10)
- Dragonframe:
  - Using Dragonframe 4 og 5 (dragonframe.com/download, film-media.dartmouth.edu);
  - FAQ om lydformater, bildeimport, Maya til DF (Arc FBX) og EDL/`take.xml` (dragonframe.com/ufaqs);
  - mappestruktur (helpwiki.evergreen.edu).
- FBX: Blender PR 105019 og 104500 (tid og akser), FBX SDK KFbxCamera (FilmWidth i tommer, FocalLength i mm).
- After Effects:
  - 3D-import-FAQ (helpx.adobe.com);
  - scripting-guide (ae-scripting.docsforadobe.dev: LayerCollection, Property, KeyframeEase og Shape).
- Nuke: ReadGeo og formatliste (learn.foundry.com), Non-Commercial-begrensninger.
- OTIO-filformat (opentimelineio.readthedocs.io), otio-cmx3600-adapter, Avid 2025.6, Premiere OTIO-beta (community.adobe.com) og Resolve FCPXML (forum.blackmagicdesign.com).
- NB Uttale (nb.no/sprakbanken, CC0), eSpeak NG (GPLv3) og papagayo-ng (GPL).
- Flow «Import Cut» (help.autodesk.com), ftrack import (help.ftrack-studio) og Kitsu import (kitsu.cg-wire.com).
