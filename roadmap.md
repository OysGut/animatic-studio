# Veikart

## PTG5 og scenevelgeroppfølging (22.10.2026)
- [x] Regel om SceneSelect/SceneMark i AGENTS.md.
- [x] interactions-e2e setter nb eksplisitt og består (44/44).
- [x] Dragonframe-mappe/ZIP/film: ren parser, PTG-navnekobling, håndtak og avvik uten AI.
- [x] Ny inaktiv take via eksisterende kommando, MP4 i nettleseren, scenevalg og sammenligning/blandet avspilling.
- [x] Kunstige fixturer, enhetstester, ptg5 nb/en 18/18 og sekvensielle regresjoner; full Vitest 2336/0, DB 158/0 og i18n.
- [x] Norsk PTG5_REPORT.md med faktisk verifisering og avvik.
- [ ] Ekte Dragonframe/Cloud-rundtur: krever Trollfilms opptak og ekstern kontroll, se TODO.md.

## Aktivt (22.10.2026)
- [x] Personvernerklæringen utvidet med vilkår/ansvarsfraskrivelse (seksjoner 10–15, b115.privacy.*) på alle språk.
- [x] Språkvelgeren på forsiden flyttet under «Logg inn»-boksen, over Personvern-lenken (verifisert i nettleser).
- [x] Admin-bryter for testspråket EN-XA (funksjonsnøkkel ui.test_languages, av som standard); migrasjon 0082 skrevet.
- [ ] 0082 må kjøres i Cloud av Claude før bryteren dukker opp i Admin.

## PTG1 (B-102) – implementert, databaseverifisering gjenstår
- [x] Klipp midt i overlapp; håndtak og overgangsdata; hele lyd-/ordhendelser, gyllen oddetallstest og LESMEG-regel.
- [x] Ren utvekslingsmodell, felles avrunding, toere og versjonerte skuddnavn.
- [x] Additiv 0081 fra 0080: prosjektkode og opptaksinnstillinger, kommando/angring og lagring; ikke kjørt i Cloud.
- [x] CSV/JSON-profiler, PNG-miniatyrer, strømmet ZIP64 og tospråklig LESMEG.
- [x] Til produksjonen i eksportdialog og prosjektinnstillinger, alle grensesnittspråk.
- [x] Gyldne tester, ZIP64-hoder, arkitekturvakt, ptg1-shotlist nb/en, export-e2e og p4; full Vitest 2280/0, i18n grønn.
- [ ] DB-suite og ekte lagring/eksport etter 0081: lokal Postgres på port 54329 mangler; Claude må verifisere og kjøre migrasjonen.
- [x] PTG1_REPORT.md med faktisk verifisering og erstattede funksjoner.

## B-087 Rigg runde 5 (22.10.2026) – ferdig lokalt; 0079 venter på Claude i Cloud
- [x] B-105a og KR-1 rapportert (B105A_REPORT.md).
- [x] Utskriftsjobber, elementer og én rad per fysisk kopi; ingen deduplisering, felles innstillinger og gjenutskrift med samme koder.
- [x] Additiv migrasjon etter B-105a: peprede QR-/kortkoder, tilgangsbeskyttet oppslag, apply_changes, angring, backup og delete/purge; Claude kjører i Cloud.
- [x] Batch-PDF, QR-plassering og tosidig utskrift med testark og forskyvning per bruker/skriver.
- [x] Mobilrute og manuell kode, riktig scene/frame/lag og nøytrale tilgangsfeil.
- [x] rigg-r5 nb/en og regresjoner én om gangen, full Vitest/lokale DB-tester, alle språk og RIGG_R5_REPORT.md; A1–A16 verifiseres bare med bestått dekning.

## B-105a og KR-1 (21.10.2026)
- [x] Kartlegg alle bildeinnganger, modell, opprydding og original/proxy-bruk.
- [x] Bildegrunnlag: ren størrelses-/filvalgplan, nettleseradapter og 64-elementers LRU; 2205 Vitest / 6 nettleseradapterkontroller bestått.
- [x] Felles ingestImage, avledede filer, bakgrunnsoppgradering og begrenset konturbuffer.
- [x] Flytt Story Lab- og bildepromptbygging til autoriserte serveroppgaver.
- [x] Enhets-/arkitekturtester, sekvensielle visuelle regresjoner, full Vitest og lokale DB-tester.
- [x] Kontroller produksjonsbunter/kildekart og skriv B105A_REPORT.md.
- [x] KR-1: oppdater kravregisteret etter testdekning og kjør build_docs/check_kb.
- [ ] Bildeprompter på serveren – venter på svar fra produkteier (redigerbar prompt).

## B-107 / B-111 – åpen språkliste (21.10.2026)
- [x] Fjern .overforing og ignorer gamle øyeblikksbilder.
- [x] Åpent register, separat lasting, reserve, CLDR og import-/eksportverktøy.
- [x] Engelsk standard, nettleservalg og personlig språkprioritet.
- [x] Importer åtte språk, oppdater utdaterte tekster og grammatikk med kildehash/review.
- [x] Vakt mot etterslep, 2195 beståtte enhetstester, sekvensielle kontoregresjoner nb/en og fr/ja-stikkprøver.
- [x] Rapport docs/development/B107_REPORT.md og kontroll av profiles.locale; lokale DB-tester 153/153.
- [ ] Claude må kjøre 0077 og publisere sammen med skjemaversjon 77; Cloud står på 76 fra før oppdraget.

## Aktivt oppdrag: runde 4 og B-095 (21.10.2026)
- [x] A: skjemaversjon 72, regenerert i18n og full Vitest (2102 bestått / 10 eksisterende hoppet over).
- [x] B: synkron lest-status og job-read 8/8 nb/en.
- [x] C: PDF-brukerflate, rigg-r4 12/12 nb/en, sekvensiell regresjon og DB 148/148.
- [x] Rapport RIGG_R4_REPORT.md med faktiske resultater og fysisk prøve som ekstern kontroll.
- [ ] Fysisk utskrift med skriver og linjal: krever fysisk utstyr, se RIGG_PRINT_TEST.md.

## B-087 Rigg & 2D-utskrift (21.10.2026)
- [x] Runde 0: spesifikasjon v3, TODO_3D_PRINT.md, REQ-0879–REQ-0915, TODO/ROADMAP.
- [ ] Runde 1 (pågår): B-090-avklaringer (REQ-0895 verifisert, DEC-0100), riggmodell i src/core/rig, størrelsesmatematikk, parallakse, maler og arv, migrasjon 0071, Rigg-fane, platenivå i lagpanelet, tester.
- [ ] Runde 2–5 og 3D-print: utsatt, venter på oppdrag fra Claude.

## Oppgave 3b (21.10.2026)
- [x] Mock-merknad på 18 krav med historikk; KI-193/KI-204 åpne.
- [x] Migrasjon 0070: delingsnøkkelen bare som pepret hash, eldre lenker virker; DB 146/146.
- [ ] Kjøring av 0070 i Cloud og utfylling: venter på Claude.
- [x] Canvas 500 noder i produksjonsbygg: under 3 s.
- [x] Låste sider per dokument-ID med fallback og tester.

## V1 – status lik virkelighet (21.10.2026)
- [x] Kravstatus, build_docs/check_kb, TODO og IMPLEMENTATION_STATUS.
- [x] 21 suiter nb/en, p4–r3r4 og dec0094 med UI_LANG=en, «Mer …»-skjermbilder.
- [x] ID_AUDIT.md (kartlegging), full vitest og DB.
- [x] verifisering3 med UI_LANG=en: 73/73 på begge språk (ID3).

## B-049 ML4 – ende-til-ende (20.10.2026)
- [x] Eksport med N språkversjoner: fontkontroll (PDF stopper i stedet for «?», Word advarer), språkmerke i Word.
- [x] Releasekontroll: bygget stopper hvis nb/en ikke er komplette.
- [x] Sikkerhetskopi før og etter 0066, AI med N språk (mock), ml4-e2e.mjs.
- [x] ML3-avvik: AI-servertest, en-XA med UI_LANG=en, pgtest fjernet.
- [x] Alle visuelle suiter på nb og UI_LANG=en; gjenstående avvik feiler likt på ML2f (se ML4_REPORT.md).
- [x] Språkstøtte i eldre suiter og retting av gamle suitefeil (R7/V1).

## B-049 ML3 – N manusspråk per prosjekt (20.10.2026)
- [x] Kartlegging av lagrede språkmerker og constraints i ML3_REPORT.md (ingen kollisjoner i Cloud).
- [x] Migrasjon 0066 (additiv): BCP-47 i 0016/0017-begrensningene, language_versions, nullable language_version_id; DB 142/142.
- [x] Register, kommandoer med invers, innlasting, backup, regler (samme versjon, norsk kilde, «må gjennomgås»), B-048/B-050 eksplisitt språk.
- [x] Brukerflate: språkversjoner, valg i manus/utforsker/linjekoblinger/eksport, eksplisitt norsk reserve eller stopp.
- [x] Feilsiden følger valgt språk fra første tegning (test).
- [x] Tester: vitest, ml3-script-languages.mjs, regresjon nb og UI_LANG=en.
- [ ] Kjøring av 0066 i Cloud: venter på Claude (hasher må kontrolleres, se ML3_REPORT.md).

## B-049 ML1 (20.10.2026)
- [x] Fullt AST-inventar, stabile nøkler, tapsfrie nb/en-filer og konfliktliste.
- [x] Språkmanifest, validerte reserver, t/parametere/plural og automatisk en-XA; eksisterende bro uendret.
- [x] Utvidet sjekk, 13 ML1-tester, null-tap, full vitest 1926/0 og DB 140/0; U5/T2/DV3/paneler grønne.
- [ ] Verifisering4 helt grønn: venter på kontroll i Claudes miljø (Courier Prime 6,439 em her; 57/58 med portabel falsk mikrofon).
- [x] Kravregister 0875–0878, build_docs/check_kb og ML1_REPORT; ingen migrasjon.

## Kontekstkoblinger og B-049-plan (20.10.2026)
- [x] Synlig mål med miniatyr og målbytte; AI aldri forhåndsvalgt; prosent og grupperte gjentakelser.
- [x] Tester: 1913 bestått, 10 eksisterende hoppet over; m6-rest 72/72 på norsk/engelsk; språksjekk 0 feil.
- [x] Kun plan for B-049 i docs/development/PLAN_B049_MULTILANG.md; ingen språkimplementering eller migrasjon.

## M6 – resten av produksjonskontrollen (20.10.2026)
- [x] P8-avvik: vist modell = brukt modell; samlet kostnadsanslag i massemodus med kvalitetsprofil.
- [x] Plan i docs/development/PLAN_M6_REST.md.
- [x] A: AI-oppdatering ved avvik (bilde → ny versjon, shot → notat, røde replikker → DV7), kostnadsport.
- [x] B: varighetsprognose fra historikk i scenenavigator og prosjektoversikt.
- [x] C: kontekstuelle koblingsforslag, regler først, AI for usikre, godkjenning med angring.
- [x] Tester (vitest, DB, m6-rest.mjs, regresjon), requirements.yaml, ROADMAP, build_docs/check_kb.

## P8 – AI-stilharmonisering (REQ-0137–0145, REQ-0400–0402) (20.10.2026)
- [x] Kort plan i docs/development/PLAN_STYLE_HARMONIZATION.md før kode.
- [x] «Harmoniser stil …» fra plakat, sceneeditor og Asset Studio; stil fra stilprofil eller referansebilde (6 dimensjoner).
- [x] Identitetsbevarelse: bilde-til-bilde med referanse, tydelig instruks, advarsel; modell/kvalitet valgbar med M8-profil som standard.
- [x] Sammenligning original/harmonisert (skyver/veksling) før godkjenning.
- [x] Bruksvalg: lokal overstyring, alternativ variant, foretrukket referanse per stilprofil, eksplisitt publisering til globalt bibliotek.
- [x] Ikke destruktivt; alt via apply_changes og angrbart.
- [x] Massemodus med samlet kostnadsanslag, lease og idempotens som DV5.
- [x] Metadata: kilde, modell, profil, stilprofil («Laget med profil X»).
- [x] Migrasjon 0065 (fra 0064) hvis nødvendig; DB-tester lokalt alle grønne. Backup tar med harmoniserte varianter/koblinger.
- [x] Vitest (regler, angring, idempotens), visuell suite p8-style-harmonize.mjs NO/EN; regresjon: posters, ca2, ca7, u5, p6, dv5.
- [x] requirements.yaml REQ-0137–0145/0400–0402 + build_docs + check_kb; rapport med testtall, migrasjon, kreditter, avvik.

## P7-rest (20.10.2026)
- [x] Test der MOV-filmen har lyd: kontroller med ffprobe at pcm_s16le 48 kHz stereo finnes og har riktig lengde.

## Tidligere fullført (se git-loggen)
- P4/P5/P6 (linjekobling 0064, kvalitetsprofiler 0063, alfaeksport), DV1–DV8, CA1–CA8, MTS, P7 ProRes/MOV (egen koder, ADR-0011).

## B-049 ML2 (20.10.2026)
- [x] ML2a: språkvelger fra manifestet, en-XA i utvikling, språkbytte uten remontering, ingen lekkasje ved første tegning, stabile serverfeilkoder, ml2-languages-suite
- [x] ML2b: skall og konto (1 193 av 1 199 par flyttet; 6 flertallstekster på broen)
- [x] ML2c: manus (1 444 av 1 457 par flyttet; 13 på broen), seks flertallstekster fra skallet, språkkoder i en-XA
- [ ] ML2d: sceneeditor (inkl. en-XA-overløp på 64 px, som ligger i sceneeditoren, ikke i skallet)
- [ ] ML2e: montering og lyd, bibliotek og Asset Studio
- [x] ML2f: bibliotek, M6, AI/admin, kjerne og server – broen tom (9 964/9 964), L()-kall stoppes, rapport i ML2_REPORT.md

## B-049 ML2d – sceneeditor (20.10.2026)
- [x] 1 761 av 1 785 tekstpar flyttet med migrate.mjs; 24 på broen (19 ulik plassholderkontrakt, 5 dynamiske) til ML2f.
- [x] 64 px overløp med en-XA og åpen opptaksdialog rettet i verktøyraden; ingen norske tekster igjen.
- [x] Regresjon grønn: paneler, dv2, ca1–ca8, u5, mts ×3, dv7, ml2-languages 199/199, vitest 1939/0.

## B-049 ML2e – montering, lyd og eksport (20.10.2026)
- [x] Tekstene flyttet med migrate.mjs; resten med ulik plassholderkontrakt venter på ML2f.
- [x] SuggestionsDialog viser begrunnelser på valgt språk.
- [x] UI_LANG=nb|en i regresjonssuitene; dec0093, dec0094 og p4 grønne på begge språk.
- [x] Regresjon grønn: dv4, dv5, p7, ca8, ml2-languages 256/256, vitest 1939/0.

## R1 + R2 (21.10.2026, migrasjon 0067)
- [x] R1: «Endelig» foreslår ProRes i nye prosjekter; tilbud med angring i eksisterende
- [x] R2: opprydding av foreldreløse AI-filer (valg C) med forhåndsvisning, bekreftelse og logg
- [x] Strengere språkversjonssjekk i apply_changes

## R3 + R4 (21.10.2026)
- [x] R3: global publisering til eksisterende global ressurs (valg B, migrasjon 0068)
- [x] R4: ProRes med Apples målbitrate, 422/LT/Proxy, estimert filstørrelse, ffprobe-tester
- [x] R1-rest: «Ikke nå» huskes per bruker og prosjekt; kan hentes fram igjen
- [x] AGENTS.md regel 36 om referansesjekken for oppryddingen

## R7 (21.10.2026)
- [x] Eldre suiter som feilet: asset-studio-ui, dec0089, scene-duration-ui, entity-analysis-ui, scene-video-ui, storylab-canvas-ui, mts-global, dv3
- [x] UI_LANG=en i backlog-b2, ca1, ca3, ca4, ca7, dv4, m6-rest, mts-credits, mts-lower-thirds, mts-nondestructive, p6, p8
- [x] Deterministisk full vitest (realtime-channels, tidsgrense for modullasting)
- [x] AGENTS.md: regel 13 om tjenestekvoter tilbake; detaljer flyttet til docs/development/AGENTS_DETAILS.md

## V1 + småting + ID-kartlegging (21.10.2026)
- [x] Statusrapport lagret med vedlegg (STATUS_2026-10-21.md)
- [x] V1: verifiser 54 P0/P1-krav med test + REQ-0503/0145; build_docs/check_kb; TODO.md og IMPLEMENTATION_STATUS.md
- [x] 22 suiter til VISUAL_SCHEMA_VERSION + kontroll mot faste versjoner
- [x] scene-video-ui full UI_LANG; storylab-canvas-ui og mts-global overstyres av UI_LANG
- [x] Visuell kontroll av «Mer …» i alle verktøylinjer ved 1280/1024 px
- [x] ID_AUDIT.md (REQ-0037/0022/0518), bare kartlegging
- [x] ID3: stabile ID-er (REQ-0037/0022/0518), migrasjon 0069, verifisering3 engelsk – se docs/development/ID3_REPORT.md

## B-100 Animasjon inn i Scene + spacing-drag
- [x] Runde 1: lengdefeil (tidsvindu/avspillingsområde låst til gammel lengde) rettet; Scene = montering etter RetimeScene (test)
- [x] Runde 2: én skjerm, sporgrupper i Scene, autoutfelling i ui_prefs, gamle fane=animation-lenker
- [x] Runde 3: spacing-drag (UpdateLayers, én angring, ingen migrasjon)
- [x] Runde 4: CA1–CA8, regresjon og full vitest; rapport B100_REPORT.md
- [ ] DB-testene: kjøres av Claude (ingen DB-endring)
- [x] BeyondEndNotice med «Forleng scenen …» via RetimeDialog (B-099-oppdraget)
- [x] Slettet AnimationWorkspace/AnimPreview, ML1-baseline oppdatert (7 nøkler)
- [x] Hover uten MotionPath: nøkkelbildenes posisjoner som punkter

## B-099 QR-opptak med mobil i sceneeditoren
- [x] QR i opptaksvinduet, status, ny versjon på replikk / ny lyd i scenen, PC-feil, rå lyd, «Ta opp lyd» på mobilsiden
- [x] Tester: b099-enhetstester, scene-mobile-audio nb/en, regresjon, full vitest; rapport B099_REPORT.md

## B-097 «Sist endret», land, klokke og datoformat
- [x] «Legg i scenen» spør om lydtype (huskes per bruker)
- [x] build-catalog.mjs kan ikke tømme catalog.gen.ts (+ test)
- [x] formatRelativeTime i core/i18n + tester
- [x] Migrasjon 0073 (scene_ids, profiles.country, RPC-er) – Claude kjører
- [x] runCommand fyller scene_ids; «Sist endret» i scenevelgeren (minutt + sanntid)
- [x] Land ved registrering, tvungen dialog, kontoside med klokke/datoformat og forhåndsvisning
- [x] Admin: brukere per land; personvern nb/en; gjenbruk i lister
- [x] DB-tester, account-locale.mjs nb/en, regresjon, full vitest, B097_REPORT.md


## PTG3: Kamera i fysiske enheter, FBX og AE-pakke (B-102)
- [x] CameraTrack i InterchangeDoc (core/interchange/camera.ts), begge moduser, gyldne tester 6/6
- [x] FBX ASCII 7.4 (core/interchange/fbx.ts) + parser-test 6/6; eksempel-FBX i tests/fixtures/ptg3/
- [x] AE-pakke bygg.jsx ES3 (core/interchange/ae-jsx.ts) + AE-mock-test 8/8
- [x] Eksportdialog: «Kamera (FBX, eksperimentell)» og «After Effects-pakke» med kameramodusvalg
- [x] tsc grønn, i18n grønn, full Vitest 2300 bestått/10 hoppet over; ingen migrasjon nødvendig
- [x] Rapport docs/development/PTG3_REPORT.md
- [x] Visuell suite ptg3-camera.mjs nb/en 19/19 og regresjoner (ptg1-shotlist 35/35, export-e2e, p4 41/41), kjørt under PTG3b
- [ ] Ekte FBX-import (Blender/Maya) og AE-kjøring av bygg.jsx: ekstern kontroll

## PTG3b: Tittelkort med QR i AE-pakken (B-115)
- [x] Tittelkort 1 s i egen komp foran skuddet (_TITLE/_RENDER, −1 s), tidskoder uendret
- [x] QR med ikke-hemmelig importlenke /ptg/i, nøytral melding uten tilgang
- [x] Importside: ny take (ikke aktivert), klipper tittelkortet, advarer ved lengdeavvik
- [x] Valg «Tittelkort med QR» (på som standard), tekster på alle språk
- [x] Tester: unit, QR-dekoding, ptg3b-titlecard.mjs nb/en 9/9, full Vitest/DB/i18n
- [ ] Ekte AE-kjøring av tittelkortet og ekte opplasting/klipping av en AE-render: ekstern kontroll

- [x] PTG2 «Send til Dragonframe» (B-102): pakke, referansefilm, lydstemmer, X-sheet, LESMEG – rapport i docs/development/PTG2_REPORT.md. Ekte Dragonframe-import gjenstår (ekstern kontroll).
- [x] B-118 scenestatus og scenefarge (migrasjon 0083 venter på kjøring i Cloud)
