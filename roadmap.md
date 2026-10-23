# Veikart

## N3 – rester (natt 22.–23.10.2026)
- [x] Ustabil b107-språktest: eksplisitt ventegrense for første lasting av ekte katalog; global-library består med tvunget nb
- [x] B-098: lisens fra innebygd tabell generert fra METADATA.pb (google/fonts)
- [x] DV5: bakgrunnsresultater legges på brukerens angreliste og angres som vanlige kommandoer
- [x] tsc 0, full Vitest 2455/0 to ganger, DB 180/0, i18n grønn; ingen migrasjon; rapport N3_REPORT.md

## N1 – gjeld (natt 22.–23.10.2026)
- [x] B-097: scene_ids skrives i apply_changes i samme transaksjon (0088); etterkallet i runCommand er fjernet
- [x] GP2–GP5: global versjon via reservasjon → fil → kontroll → commit, opprydding ved feil og sweep i orphan-cleanup
- [x] B-116: «Kort scene» → «Scenebilde» / «Scene still» i alle språk
- [x] Tester: DB 180/0, Vitest grønn, tsc 0, i18n grønn, b116-showcase og global-library nb/en; rapport docs/development/N1_REPORT.md
- [x] Claude kjørte 0088 i Cloud; N1 publisert

## B-116 – Utstillingsvindu (22.10.2026)
- [x] Fullfør 19:04-oppdraget: statusoppslag ved tegning, b116-showcase 37/37 nb/en, Vitest 2422/0, DB 170/0, i18n alle språk 100 % og B116_REPORT.md; ingen Cloud-kjøring.
- [x] Migrasjon 0087 (additiv oppå 0086): showcase_items, showcase_comments, godkjenningsbryter, RPC-er, delete_project; Claude kjører i Cloud.
- [x] Kjerne og brukerflater finnes; språk-/testferdigstillingen er verifisert, med begrensninger i rapporten.
- [x] Tester: DB, enhetstester, b116-showcase.mjs nb/en, full vitest og i18n; rapport B116_REPORT.md med skjermbilder.
- [x] B-116 19:37: offentlige felter, autorisert kilde/reservasjon/opprydding og DB-innholdsgrenser i 0087; Vitest 2434/0, DB 176/0, UI 37/37 nb/en, i18n grønn, norsk rapport. Ingen Cloud-kjøring/publisering; versjon 87 beholdes.
- [x] B-116 siste runde 20:26: scener bare stillbilde, reservasjonssweep i orphan-cleanup, feed skjuler sperrede/slettede/rapporterte; DB 178/0, Vitest 2438/0, nb/en 37/37. Venter på Claudes Cloud-kjøring av 0087.
- [ ] Delt klipp via server-generert kort eksport (≤15 s), med målt varighet og MIME (egen sak).

## D-2 – Restfunn før demoen
- [x] Rett og kontroller SSR/hydrering og språkverktøytips etter gjenopprettingen (ML2 318/318).
- [x] Oppdater eksplisitte RPC-lister, Story Lab- og U2-kontrakter; REQ-0050 4/4 og g07 bestått.
- [x] Sikre at AI-innstillingsspørringen alltid returnerer en verdi, med fem regresjonstester.
- [x] Kjør demoflyt nb/en 28/28, full Vitest 2412/0, lokal DB 164/164 og i18n; lever D2_REPORT.md uten publisering.
- [x] REQ-0210 (N2): bildet fulgte en egen klokke med annen startforsinkelse enn lyden; bildet følger nå lydklokken. Lang kjøring 132–181 ms, isolert 132 ms (grense < 200 ms uendret). Se REQ0210_REPORT.md.

## D-1 – Demoklar gjennomgang
- [x] Kjør aktive visuelle suiter én om gangen på nb og på en der det støttes; dokumenter hver suite i D1_REPORT.md.
- [x] Kontroller hovedflyten og rett dokumenterte, trygge feil uten å røre sperrede filer.
- [x] Kjør full Vitest og i18n; DB-testene krever isolert lokal testdatabase, aldri Cloud.
- [x] Lever norsk rapport med avvik og nøyaktig filliste; ingen publisering.
- [x] D-1-restfunn Story Lab, U2, ml2/hydrering, REQ-0050, RPC-lister og g07 håndtert i D-2; separat REQ-0210-funn står over.

## K-1 – Varsel når en annen redigerer samme scene (22.10.2026)
- [x] Merke «{name} redigerer også denne scenen» og prikk i scenelisten (presence, lagres ikke).
- [x] Konfliktvalg «Legg min endring oppå» / «Forkast min endring» med «Sist endret av».
- [x] Tester: k1-presence.test.tsx 8/8; k1-presence.mjs nb 16/16 og en 16/16; i18n grønn; rapport K1_REPORT.md.

## S-1 – Community-sikkerhet (22.10.2026)
- [x] Migrasjon 0086: bekreftet e-post ved mottakertreff og minste nødvendige EXECUTE-rettigheter.
- [x] Fire DB-regresjoner; full DB 164/0. Private avvist av Cloud-API (406/PGRST106).
- [x] EXPECTED_SCHEMA_VERSION og VISUAL_SCHEMA_VERSION satt til 86 (godkjent 22.10).
- [x] Norsk S1-rapport. Sperrede filer urørt; ingen Cloud-endringer eller publisering.
- [x] Claude har kjørt migrasjonen i Cloud.

## PTG7 – Nuke og Fusion (22.10.2026)
- [x] Rene nodeoppsett og kamerakurver fra utvekslingsmodellen; 2D uten rigg.
- [x] Strømmet ZIP med medier, nb/en LESMEG og knapp i Til produksjonen.
- [x] Gyldne tester 6/6; visuell suite nb 17/17 og en 17/17; full Vitest 2382/0 (10 eksisterende hoppet over); i18n grønn.
- [x] Norsk PTG7-rapport og TODO for ekte import.
- [ ] Ekte import i Nuke og Fusion: krever programmene og manuell kontroll av eksportert pakke; se TODO.md.
- Språk- og kontofiler som venter på sammenslåing røres ikke; midlertidig importunntak beholdes.

## Oppfølging – eksplisitt feilregistrering (22.10.2026)
- [x] Avslutt lekkasjesporet: lagret språkvalg uten oversatt tekst forklares av katalogfeilen, ikke påvist lekkasje.
- [x] Gjør feilregistreringen eksplisitt og idempotent før serveroppstart.
- [x] Regresjonskontroll for sideeffektimporter og feilregistrering: 3/3 tester bestått; automatisk bygg OK.
- [x] lovable-sync (cb9118c, 8315d57, d273700) hentet inn som vanlig kodeendring 22.10; unntaket for router.tsx er fjernet og sperren på språk-/konto-/auth-filene er opphevet.

## B-117 – globus ved innloggingen (22.10.2026)
- [x] Wireframe-globus bak innloggingen (Natural Earth 50m), prikker med puls, dra med etterslep, selvrotasjon, redusert bevegelse
- [x] Valgfri by på kontoen (GeoNames cities15000, CC BY 4.0), migrasjon 0085 skrevet (Claude kjører i Cloud)
- [x] globe_points uten identitet, last_seen_at høyst hvert 5. min
- [x] Tester: unit 12, DB 160/0, b117-globe nb/en 12/12, full Vitest, i18n

## PTG4 – leppesynk og munnliste (22.10.2026)
- [x] Munnsett/munnspor, additive 0084, kommando/angring, lasting og sikkerhetskopi.
- [x] Uttaleutvalg og regelreserve, fonemtabeller, ordtider og opptaksavrunding uten AI.
- [x] Redigerbare spor i Scene, variantkobling, utdatert-merking og munnliste PDF/CSV.
- [x] Moho DAT/JSON, Dragonframe X-sheet/påskrift og selvstendig eksport.
- [x] Full Vitest 2361/0, DB 159/0, i18n, ptg4 nb/en 15/15 og sekvensielle PTG2/5/6-regresjoner; norsk rapport.
- [x] 0084 kjørt i Cloud (N7: Cloud på versjon 88). Rhubarb-finjustering er utsatt – se TODO «Teknisk gjeld».

## PTG6 – klippefiler (22.10.2026)
- [x] Ren OTIO/FCP7-XML/CMX 3600-modell med PTG1-navn, midtpunktklipp og håndtak.
- [x] Til produksjonen: klippepakke med valgfrie referansefilmer/lyd, aktiv take ellers animatic, ZIP64 og tospråklig LESMEG/reeltabell.
- [x] Gyldne fixturer, OpenTimelineIO 12/12, ptg6 nb/en 23/23 og sekvensielle ptg1/ptg2/ptg5-regresjoner; full Vitest 2346/0, DB 158/0 og i18n.
- [x] Norsk PTG6_REPORT.md og manuell import i Resolve/Premiere/Avid i TODO.md.
- [ ] Ekte programimport og produksjonsmedier: krever Resolve/Premiere/Avid og brukernes opptak; se TODO.md og rapporten.

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
- [x] 0082 kjørt i Cloud (N7: Cloud på versjon 88).

## PTG1 (B-102) – implementert, databaseverifisering gjenstår
- [x] Klipp midt i overlapp; håndtak og overgangsdata; hele lyd-/ordhendelser, gyllen oddetallstest og LESMEG-regel.
- [x] Ren utvekslingsmodell, felles avrunding, toere og versjonerte skuddnavn.
- [x] Additiv 0081 fra 0080: prosjektkode og opptaksinnstillinger, kommando/angring og lagring; ikke kjørt i Cloud.
- [x] CSV/JSON-profiler, PNG-miniatyrer, strømmet ZIP64 og tospråklig LESMEG.
- [x] Til produksjonen i eksportdialog og prosjektinnstillinger, alle grensesnittspråk.
- [x] Gyldne tester, ZIP64-hoder, arkitekturvakt, ptg1-shotlist nb/en, export-e2e og p4; full Vitest 2280/0, i18n grønn.
- [x] 0081 kjørt i Cloud; DB-suiten kjøres lokalt på port 54329 (180/0 i N6). Ekte eksport: se TODO «Krever ekstern prøving».
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
- [x] 0077 kjørt i Cloud (N7: Cloud på versjon 88).

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
- [x] 0070 kjørt i Cloud (N7: Cloud på versjon 88).
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
- [x] 0066 kjørt i Cloud med kontrollerte hasher (N7: Cloud på versjon 88).

## B-049 ML1 (20.10.2026)
- [x] Fullt AST-inventar, stabile nøkler, tapsfrie nb/en-filer og konfliktliste.
- [x] Språkmanifest, validerte reserver, t/parametere/plural og automatisk en-XA; eksisterende bro uendret.
- [x] Utvidet sjekk, 13 ML1-tester, null-tap, full vitest 1926/0 og DB 140/0; U5/T2/DV3/paneler grønne.
- [x] Verifisering4 grønn (D-2 rettet REQ-0050; 60/60 to ganger i N5, se N5_REPORT.md).
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
- [x] ML2d: sceneeditor (se «B-049 ML2d» under og ML2_REPORT.md). en-XA-overløpet er ført under TODO «Teknisk gjeld».
- [x] ML2e: montering og lyd (se «B-049 ML2e» under); broen tom etter ML2f (tests/unit/i18n-ml2f.test.ts).
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
- [x] DB-testene kjøres lokalt (180/0 i N6).
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

## N4: Verifiseringsrunde for uverifiserte krav
- [x] P0/P1 gjennomgått; 48 krav flyttet til Verifisert (113 → 65)
- [x] Ny arkitekturtest for REQ-0269; avvik i AssetVoice.provider rapportert
- [x] build_docs, check_kb, tsc, Vitest og DB grønne; rapport docs/development/N4_REPORT.md
- [x] Fortsatt i N6 (64 → 34), se N6_REPORT.md
- [x] Flyttet til TODO «Krever ekstern prøving»

## N5: Ytelse i sceneeditoren, REQ-0269 og DV5
- [x] Målt rendringer, commits og lange oppgaver under avspilling; frosset verktøylinje, paneler og lukkede dialoger
- [x] Ytelsesregresjon: n5-frame-frozen.test.tsx og tak i verifisering4-ui; maks avvik 122/111 → 43/62 ms
- [x] AssetVoice.provider leverandøruavhengig; REQ-0269 Verifisert
- [x] «Angre hele jobben» hopper over resultater angret fra angrelisten (uten migrasjon)
- [x] Videre ytelse: bildelager i N8 (se N8_REPORT.md)

## N6: Verifiseringsrunde 2
- [x] 30 krav flyttet til Verifisert (64 → 34), nye kontroller for D2 og D5 i dv3-dialogue-editor
- [ ] 33 krav mangler målrettet test (TODO «Teknisk gjeld»); REQ-0139 under «Krever ekstern prøving»

## N7: Dokumentasjonsavstemming
- [x] roadmap/TODO avstemt mot Cloud versjon 88; åpne punkter samlet i TODO.md
- [x] KNOWN_ISSUES: KI-57, KI-128, KI-203 lukket, KI-46 delvis
- [x] 12 krav «Under arbeid» → «Implementert – ikke verifisert»; rapport N7_REPORT.md

## N8: Bildelager i sceneeditoren
- [x] Bildet i eget lager; Editor/Timeline/SpacingRow/knapper 0,01–0,18 per bilde (før 1,0–12,2)
- [x] n8-frame-store.test.tsx og N8-tak i verifisering4-ui (61/61 to ganger)
- [x] REQ-0804/0807/0808/0814: ingen avvik (Verifisert i N6)
- [ ] scene-panels-ui feiler 12/25 både før og etter (teknisk gjeld)

## N9 – teknisk gjeld (23.10)
- [x] en-XA: fanelinjen viser bare ikoner med verktøytips når etikettene ikke får plass; nb/en uendret.
- [x] DV5/KI-22: resultater ferdige med lukket panel kommer på angrelisten ved neste åpning i økten.
- [x] ZIP64 (KI-66/KI-80): grensen på 3,8 GB fjernet, store pakker testet uten 4 GB på disk.
- [x] KI-243: MP3-koderen bare i klientbundlen, kontrollert i produksjonsbygget og vaktet av test.
- [x] KI-250 lukket (avviklet skript). KI-12/KI-92 beskrevet, KI-30 krever Øystein.

## N10 – tilgjengelighet i sceneeditoren og manuset (23.10)
- [x] axe-core (WCAG 2.1 AA) på sceneeditor, animasjonsvisning og manus, nb og en: 0 avvik (tests/visual/n10-a11y.mjs).
- [x] Tastatur: synlig fokus på dra-håndtak, replikker kan åpnes med Enter, dialogen gir fokus tilbake, mellomrom spiller av/stopper.
- [x] Live-region for avspilling (bare start/stopp), tidskoden annonseres ikke per bilde.
- [x] Kontrast: tertiær tekst og «flyttet»-farge litt lysere; dempede rader mindre dempet.

## Feil fra Øystein: plassholder → bilde (23.10)
- [x] Nytt bilde på en plassholder får egne proporsjoner og vanlig innsettingsstørrelse rundt samme senter; ett angretrinn (tests/unit/placeholder-refit.test.ts, tests/visual/placeholder-refit.mjs).

- [x] Plassholderretting del 2: felles Thumbnail med contain (AGENTS.md regel 58, thumbnail-contain.test.tsx).
