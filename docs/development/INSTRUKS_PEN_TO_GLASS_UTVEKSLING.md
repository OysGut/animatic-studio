# Oppdrag: «From Pen to Glass» – utveksling med produksjonsprogrammene (PTG)

*Fra Øystein 21.10.2026. Lim inn i samtalen der Claude styrer Lovable og har de utvidede rettighetene.*

## 1. Hva vi skal oppnå

Animatic Studio skal ikke være en blindvei ved siden av produksjonen, men broen inn i den. Når en animatic er godkjent, skal studioet kunne ta den med seg rett inn i programmene de faktisk produserer i, uten å gjøre arbeidet på nytt. Og det de skyter eller animerer, skal kunne komme tilbake inn i Animatic Studio som nye versjoner av scenene, slik at regissøren hele tiden ser hele filmen, med en blanding av ferdige skudd og animatic.

Målgruppen er små og mellomstore studioer, med særlig vekt på stop motion (dukker, leire, utklipp og papir under kamera på glassplater) og 2D/motion. Viktigste programmer:

- **Dragonframe** (opptak bilde for bilde, hjertet i nesten alle stop motion-produksjoner)
- **After Effects**, **Nuke** og **Fusion** (compositing og fjerning av rigger)
- **Premiere**, **Avid** og **DaVinci Resolve** (klipp)
- **Flow Production Tracking** (tidligere ShotGrid), **ftrack** og **Kitsu** (produksjonsstyring)

Dette erstatter og utvider B-100 (eksport til After Effects), som blir én del av denne pakken. Lottie (B-101) holdes utenfor og behandles for seg.

## 2. Din rolle og arbeidsreglene (gjelder som før)

- Du planlegger, styrer og kontrollerer. Lovable skriver koden og bruker Øysteins kreditter. Du skriver ikke koden selv.
- Lovable skal aldri endre database eller kode den ikke har fått beskjed om, og skal spørre deg når den er usikker.
- Migrasjoner kjøres aldri i Cloud før de er verifisert.
- Status sjekkes med `get_message` (store svar leses med jq), aldri med `get_project`.
- Ha neste oppdrag ferdig klargjort mens Lovable jobber, så den alltid har noe å gjøre. Verifiser forrige leveranse parallelt og legg funnene inn i oppdraget etter.
- Før en nummerert liste over egne avgjørelser i BESLUTNINGER-filen (neste ledige B-nummer, sjekk BESLUTNINGER_21-10 først).
- Nye ideer fra Øystein underveis legges i kø, med mindre han skriver «VIKTIG».
- Alle nye tekster i grensesnittet går via `t()` og må bestå i18n-sjekken (nb og en).
- Eksportene skal virke helt uten AI (jf. `tests/architecture/eksport-uten-ai.test.ts`).
- Køen med Lovable-oppdrag i LOVABLE_KO skal ikke forstyrres: PTG-rundene legges inn etter det som allerede står der, med mindre Øystein sier noe annet.

## 3. Første steg: undersøk før du spesifiserer

Ikke send noe til Lovable før dette er gjort.

1. **Les koden og spesifikasjonene som berøres**, og bekreft hvordan de faktisk ser ut i dag (ikke anta):
   - kameraet og multiplan-modellen (`src/core/composition/*`, `camera-overlay.ts`, `camera-handoff.ts`, `CameraPanel`), inkludert hvordan dybde og plateavstand er representert;
   - riggspesifikasjonen (`PHASE3_RIGG_3DPRINT_SPEC_v3.md` og `PHASE3_RIGG_BYGGEPLAN.md`): fysiske mål, linse, sensor, glassplateavstander og målestokk. PTG skal bruke de samme fysiske størrelsene, ikke finne opp egne;
   - lyd og dialog (DV-spesifikasjonen, `src/core/audio`, ord-for-ord-tider, replikker per karakter, lydversjoner);
   - film, takes og versjoner (`src/core/assembly/*`, `film-import.ts`, `film-video.ts`, `clip_parts`, `Take`);
   - eksportmotoren (`src/engine/export/*`: `animatic.ts` med mediabunny, `alpha`/ProRes, `zip.ts` med OPFS-strømming, `audio-stem.ts`);
   - stabile ID-er (oppgave 3, REQ-0037/0022/0518) og navneregler for filer (`file-names.ts`);
   - språkversjoner (N språk, B-049), siden eksport kan gjelde en bestemt språkversjon.
2. **Undersøk formatene på nett** og noter kilder i spesifikasjonen:
   - Dragonframe: hva det kan importere (referansefilm og bildesekvens, flere lydspor, kamera som FBX med virtuelle akser, eventuelle filer for sporlesing og X-sheet). Avklar om formatet for dialog- og sporlesing er dokumentert og kan skrives av oss. Hvis ikke, er reserveløsningen X-sheet som PDF og CSV pluss referansefilm med munnavn påført;
   - Dragonframes mappestruktur og filnavn for opptak (for rundturen tilbake);
   - FBX: om vi kan skrive ASCII-FBX (7.4) direkte i nettleseren for et animert kamera, eller om et annet format (for eksempel glTF eller USD) er tryggere og fortsatt leses av Dragonframe og After Effects/Nuke. Akser, enheter og brennvidde/sensor må stemme;
   - OpenTimelineIO (JSON), CMX 3600 EDL og FCPXML: minste gyldige versjon som Premiere, Avid og Resolve leser;
   - After Effects ExtendScript (.jsx), Nuke (.nk) og Fusion (.comp): hva som trengs for lag, kamera, nøkkelbilder og myking;
   - leppesynk: åpne verktøy (for eksempel Rhubarb Lip Sync, Papagayo) og lisens, og om de virker for norsk. Vi har allerede manusteksten og ord-for-ord-tider, så en tekstdrevet løsning (ord → lyder → munnstillinger, fordelt innenfor kjente ordtider) er trolig bedre og språkuavhengig. Vurder begge;
   - CSV-import i Flow, ftrack og Kitsu (kolonner og felt).
3. **Skriv to dokumenter**: `PHASE3_PTG_SPEC.md` (krav med REQ-numre, formater, akseptkriterier) og `PHASE3_PTG_BYGGEPLAN.md` (runder med oppdragstekster klare for Lovable). Legg rundene inn i LOVABLE_KO.
4. **Vis Øystein spesifikasjonen og listen over åpne spørsmål** (avsnitt 9) før PTG1 sendes. Du trenger ikke vente på svar for å forberede rundene, men bruk standardvalgene der han ikke har svart.

## 4. Grunnprinsippet: én felles utvekslingsmodell

Alle eksporter skal lese fra én ren, testbar modell i `src/core/interchange/` (navnet kan justeres). Ingen eksportør skal regne ut kamera, tider eller navn på egen hånd. Det hindrer at vi gjør arbeidet tre ganger og at formatene viser forskjellige ting.

Modellen beskriver, for en valgt produksjon, språkversjon og et utvalg scener:

- **Skudd**: stabil ID, scenenummer slik det vises (`sceneNumberOf`), navn, start og lengde i bilder, bildefrekvens for opptak (for eksempel 12, 24 eller 25) og hvordan animaticens tider rundes til hele bilder. Avrundingsregelen skal være én og dokumentert, og summen av skuddene skal alltid bli filmens lengde.
- **Lag**: navn fra bibliotek og manus, bilde og versjon, dybde/plate, transformasjoner per bilde, baner, grupper, masker og bildeskifter.
- **Kamera**: posisjon, retning, brennvidde, sensor og utsnitt per bilde, i fysiske enheter som stemmer med riggspesifikasjonen. Både 3D-tolkning (dybde) og 2D-tolkning (parallakse) skal kunne avledes.
- **Lyd**: klipp per karakter og type (dialog, atmosfære, musikk), med volumpunkter og språk.
- **Dialog**: replikker med ord og ordtider, og (fra PTG4) lyder og munnstillinger per bilde.
- **Referanser**: hvilke filer som må med, og relative stier i pakken.

**Navnekonvensjon** (forslag, bekreft med Øystein): `PROSJEKT_SC012_SH010_v003`. Den skal være lik i alle eksporter, i mappenavn i pakkene og i navn Dragonframe og klippeprogrammene ser. Det er den som gjør rundturen tilbake mulig.

**Pakkene** leveres som zip via eksisterende strømming (OPFS der det finnes), med en `LESMEG.txt` på norsk og engelsk som forklarer innholdet og hvordan det åpnes i det aktuelle programmet.

## 5. Delene

### A. Skuddliste og produksjonsstyring

- Skuddliste som CSV og JSON: skudd, lengde i bilder og tid, karakterer, kulisser, rekvisitter, replikker, status og miniatyr.
- Forhåndsvalg for kolonner til Flow, ftrack og Kitsu.
- Lages tidlig fordi den tester at utvekslingsmodellen og navnene er riktige.

### B. «Send til Dragonframe» (viktigst for stop motion)

Én pakke per scene eller for valgte scener, med en mappe per skudd:

- **Referansefilm** bildenøyaktig i opptakets bildefrekvens (MP4 H.264, og valgfritt PNG-sekvens). Valgfrie påskrifter: skuddnavn, bildenummer, tidskode og (fra PTG4) munnavn.
- **Lyd per karakter** som WAV 48 kHz, pluss en samlet miks, alle like lange som skuddet.
- **Kamera** som FBX (eller formatet undersøkelsen anbefaler) når skuddet har kamerabevegelse.
- **X-sheet** som PDF og CSV: én rad per bilde med dialog, lyd/munn, handling fra manus og kameranotater.
- Hvis Dragonframes format for sporlesing viser seg å være åpent: ferdig utfylt sporlesing i tillegg.

### C. Leppesynk og munnliste

- Munnsett per karakter: standardsett (for eksempel Preston Blair eller Rhubarbs A–X) som kan tilpasses, der hver munnstilling kan kobles til en variant i biblioteket (fysisk munn eller ansikt).
- Automatisk utkast til munnstilling per bilde fra replikkens tekst og ordtider, med minste varighet og hold, og som kan redigeres for hånd i en egen visning.
- **Munnliste**: hvilke munner hver karakter trenger, hvor ofte hver brukes og i hvilke skudd. Skal kunne skrives ut og kobles til utskrift og 3D-print i riggspesifikasjonen senere.
- Endres replikken eller lyden, merkes munnsporet som utdatert (bruk samme mønster som avvik ved manusendring).

### D. Rundtur: opptak tilbake inn i Animatic Studio

- Import av opptak (bildesekvens fra Dragonframes mapper eller eksportert film) som ny **Take** på riktig scene, gjenkjent på navnekonvensjonen, med samme bildefrekvens og lengde.
- Håndtere opptak på «toere» (hvert bilde vist to ganger), skudd som er kortere eller lengre enn planlagt (varsle, ikke klipp stille), og delvis ferdige skudd.
- Monteringen kan vise en blanding av ferdige skudd og animatic, og produksjonsstatusen oppdateres.
- Bygg på eksisterende filmimport og versjoner; ikke lag et parallelt system.

### E. Klipp

- OpenTimelineIO (JSON) som hovedformat, i tillegg CMX 3600 EDL og FCPXML.
- Mediereferanser relativt til pakken, så klipperen kan bytte animatic-skudd mot ferdige skudd med samme navn.
- Import av OTIO tilbake er utenfor første versjon.

### F. Compositing

- **After Effects** (tidligere B-100): zip med bilder, lyd og `bygg.jsx` (ExtendScript). Skriptet importerer alt og bygger én komposisjon per skudd og en hovedkomposisjon for filmen. Lag og transformasjoner med nøkkelbilder, Bézier-myking regnet om til AEs fart og innflytelse, kamera som 3D-lag med AE-kamera eller som 2D-parallakse med null-lag (valg ved eksport), baner som romlige tangenter, bildeskifter, grupper som forkomposisjoner eller null-foreldre, masker, lyd med volumpunkter og navn fra manus og bibliotek. Overganger mellom scener er utenfor første versjon.
- **Nuke** (.nk) og deretter eventuelt **Fusion** (.comp): samme innhold, med lagene i riktig dybde, nyttig ved glassplater og fjerning av rigger.

## 6. Foreslått rekkefølge (runder)

| Runde | Innhold | Migrasjon |
|---|---|---|
| PTG0 | Undersøkelse og spesifikasjon (bare deg, ingen Lovable) | Nei |
| PTG1 | Utvekslingsmodell, navnekonvensjon, avrunding til bilder, skuddliste (A) | Trolig nei |
| PTG2 | Dragonframe-pakke uten kamera: referansefilm, lyd, X-sheet (B) | Nei |
| PTG3 | Kamera i fysiske enheter, FBX-eksport og After Effects (B og F) | Avhenger av kameramodellen |
| PTG4 | Leppesynk, munnsett og munnliste (C) | Ja, sannsynligvis |
| PTG5 | Rundtur fra Dragonframe (D) | Avhenger av takes |
| PTG6 | OTIO, EDL og FCPXML (E) | Nei |
| PTG7 | Nuke, Fusion og forhåndsvalg for produksjonsstyring | Nei |

Hvis Øystein svarer at utklipp under kamera på glassplater kommer først, flyttes kameraet (PTG3) foran. Gjelder det dukker og leire, flyttes leppesynk (PTG4) foran.

Hver runde skal være liten nok til at du kan verifisere den grundig. Skriv oppdragsteksten slik du har gjort i byggeplanene før: presise filer, krav, tester og hva Lovable ikke skal røre.

## 7. Akseptkriterier og testing

- **Gyldne tester** i Vitest for utvekslingsmodellen: lengde i bilder, tidskode, avrunding, navn og at summen av skudd er lik filmens lengde, også ved 12, 24, 25 og 30 bilder per sekund og ved bytte av bildefrekvens.
- **Kameraet** kontrolleres ved å lese FBX-filen inn igjen (for eksempel med Blender i sandkassen) og sammenligne posisjon og utsnitt per bilde med Animatic Studios egen visning.
- **Formatene valideres** mot virkelige programmer så langt det er mulig: Resolve (gratis) for OTIO, EDL og FCPXML; After Effects og Dragonframe via Øystein eller et testende studio; Nuke Non-Commercial for .nk. Noter i spesifikasjonen hva som er prøvd i ekte program og hva som bare er testet mot formatbeskrivelsen.
- **Referansefilmen** sjekkes bilde for bilde mot monteringen (samme metode som i eksisterende eksporttester med mediabunny).
- **Rundturen** testes med en kunstig Dragonframe-mappe med toere, for korte og for lange skudd.
- **Ytelse**: pakkene strømmes og skal tåle en lang film uten å bygge alt i minnet der OPFS finnes.
- Skjermbilder for nye dialoger og visninger som før.
- Kodegjennomgang med underagent etter hver runde, funn rettes eller registreres som KI.

## 8. Utenfor denne pakken

- Direkte lesing av .aep-filer.
- Lottie (B-101).
- Styring av motion control-maskinvare eller lys (DMX) direkte fra Animatic Studio.
- Import av OTIO og andre klippeformater tilbake (kan komme senere).
- 3D-print av munner og ansikter (ligger i riggspesifikasjonens egen TODO; PTG4 skal bare gjøre koblingen mulig).

## 9. Åpne spørsmål til Øystein (med standardvalg)

1. Hvilken type stop motion først: utklipp og papir på glassplater, eller dukker og leire? *Standard: rekkefølgen i avsnitt 6.*
2. Navnekonvensjonen for skudd. *Standard: `PROSJEKT_SC012_SH010_v003`.*
3. Standard bildefrekvens for opptak. *Standard: 24, valgbar per prosjekt.*
4. Finnes et studio eller en animatør som kan prøve pakkene i ekte Dragonframe og After Effects? Uten det kan vi ikke garantere at importen virker.
5. Hvem kan eksportere: alle medlemmer eller bare redaktører? *Standard: som dagens eksport.*
6. Skal eksporten alltid gjelde hovedfilmen, eller også spinoffer og språkversjoner? *Standard: valgt produksjon og språk, slik som filmeksporten.*

## 10. Leveranser fra deg

- `PHASE3_PTG_SPEC.md` og `PHASE3_PTG_BYGGEPLAN.md`.
- Rundene lagt inn i LOVABLE_KO.
- Nye B-numre i BESLUTNINGER, og B-100 merket som slått sammen med PTG.
- En kort oppsummering til Øystein med de åpne spørsmålene, før PTG1 sendes.
