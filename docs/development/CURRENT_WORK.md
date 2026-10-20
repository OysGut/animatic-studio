# Pågående arbeid

## C / B-050 – 20.10.2026, delvis levert; ikke klart for Cloud
- 0064_translation_line_links.sql skrevet, IKKE kjørt. Erstatter apply_changes/delete_project/purge_project_assets fra 0063_quality_profiles.sql; ingen andre funksjoner erstattet. Schema 64, medlems-SELECT, ingen klientskriving, service-role ALL. purge_removed_assets urørt.
- Gjennomgang per scene etter DEC-0058-import: 1:1/1:n/n:1, sikkerhet og begrunnelse, validering med forkastet-teller, kildefilter, godkjenn/avvis/juster, terskelgodkjenning i én kommando med invers. Godkjente koblinger brukes i oversatt visning uten norsk kildeendring; backup omskriver arrayreferanser.
- Eksplisitt bekreftelse og fingeravtrykkskontroll før eksisterende tjenestebetalte translation_align. Brukerkostnad 0 USD; M8 vises som kontekst og overstyrer ikke tjenestens tekstmodell. Ingen ekte AI-kall eller betalte testkall. Oppdragsisolert kredittforbruk ikke tilgjengelig.
- Språknavn i opptaksdialogen og stablet profilfelt med avstand i alfaeksport er rettet.
- Automatisk typesignal: build OK. Full Vitest 1871 bestått, 0 feilet, 10 eksisterende hoppet over. Nye line-linking unit 10/10. P5 18/18 med norsk/engelsk skjermbilder. DV6 16/16, T2 69/69, Story Lab 32/32 ved isolert gjentak, U5 65/65, P6 18/18. Scene-panels 38/39: Alt-klikk-kontroll feiler også isolert; ingen retting utenfor oppdraget. Verifisering4 full kjøring 50/54: lyd/bilde-avvik 231 ms, Courier Prime-måling og to mikrofonkontroller; isolert gjentak ble avbrutt og teller ikke som full kjøring.
- DB-testkjøring blokkert før første test: lokal Postgres localhost:54329 utilgjengelig. To nye 0064 DB-tester skrevet for RLS/grants, apply_changes, fremmede referanser, delete og purge, men ikke kjørt. Migrasjonen er ikke DB-verifisert og anbefales ikke kjørt i Cloud ennå.
- ÅPENT: Eksisterende import bevarer ikke oversatte linjer uten DEC-0058-regelpar. Gjennomgangen støtter derfor bare lagrede oversettelseslinjer; full B-050 for uparrede importlinjer er ikke ferdig. Dette krever varig importlinjemodell/utvidet importflyt. Ikke rapportert som full C-leveranse.
- i18n 0 uten engelsk; build_docs/check_kb OK (862 krav, 0 udekkede mandatlinjer). REQ-0845–0853 er Implementert – ikke verifisert med eksplisitt importavgrensning.


## D / M8 og P4-rester – 20.10.2026
- 0063 er endelig lokalt, IKKE kjørt i Cloud. Erstatter apply_changes, delete_project og purge_project_assets fra 0062; create_project fra 0001 (bare tre standardprofiler/aktivt valg); create_dialogue_batch fra 0061 (bare snapshot i jobbreservasjoner). purge_removed_assets urørt. Ny private.guard_quality_profile_job serialiserer månedskapasitet og beskytter metadata.
- Profiler i prosjektinnstillinger og bilde/video/lyd/tale/DV-batch/eksport/alfa, lokale overstyringer, budsjettport, profilnavn og uforanderlige snapshots. Nye prosjekter får standardprofiler; eksisterende får bare tilbud. Backup inkluderer profilene.
- Film/alfa deler seriell klientkø som fortsetter etter dialoglukking; fremdrift/avbryt globalt. OPFS strømmer PNG-ZIP. Uten OPFS beholdes minnebasert reserve for «PNG alltid»: rapportert avvik fra ubetinget strømming. Køen overlever ikke tabblukking/omlasting. WebM-alfa ikke støttet i testnettleseren.
- Automatisk typekontroll/build OK. Vitest 1861 bestått, 0 feilet, 10 eksisterende hoppet over. Lokal DB 135/135. P6 18/18 NO/EN, P4 39/39, DV4 24/24, DV5 20/20, U5 65/65, CA8 22/22, MTS engine 42/42, scene panels 39/39. Verifisering4 51/54: Courier Prime og to falsk-mikrofonkontroller; hybrid-eksport og avspilling bestått på siste kjøring.
- i18n/build_docs/check_kb OK; REQ-0854–0862 registrert, C-krav 0845–0853 utsatt, ingen implementasjon av C. Ingen ekte/betalte AI-kall. Kredittoversikt viser 1033 totalt i perioden 16.10–16.11, ikke et isolert tall for dette oppdraget.

## DV5/DV6 – 19.10.2026, kode levert; Cloud-verifikasjon gjenstår
- Doble forslag grupperes per permanent replikk/ressurs; bekreftelse kobler alle tilhørende klipp.
- Massegenerering i karakterens Lyd/Stemme-seksjon: scene-/linjevalg, dekning, ordrett eksisterende-lyd-advarsel, eksplisitt kostnadsgodkjenning, separate språkjobber og varig fremdrift. Ukjent pris blokkerer start. Tidsanslag er uttrykkelig usikkert.
- Språk: UiLocale er uavhengig; prosjekt/variant/blokk styrer scriptLanguage, replikk/karakter/genereringsvalg styrer speechLanguage. BCP-47 og Unicode Segmenter; levende modellkapabiliteter, ingen skjult språkbytte. Stemmens faktiske uttale er ikke verifisert.
- Batcharbeid ligger i lagringsadapteren: lease-fencede overganger, to linjer per kjøring, varig leverandørkvittering før applyCommand/apply_changes, atomisk completion/change_log. Betalte tvetydige resultater gjentas ikke. 402/403 stopper batchen varig uten probes. Vanlig tidsavbruddsrydding ekskluderer batchjobber.
- Migrasjon 0061 skrevet, IKKE kjørt mot Cloud eller lokal DB. Forventet skjema 61. Fire funksjoner basert på 0060; purge_removed_assets beholdt ordrett. Ny overgangsfunksjon har service-only execute. DB-testene har tre nye 0061-kontroller, men kjøring stoppet før første test: localhost:54329 ECONNREFUSED. Claude må kontrollere og kjøre migrasjonen.
- Tester: automatisk typekontroll/build OK; Vitest 1804 bestått, 0 feilet, 10 eksisterende hoppet over. Nye DV5/DV6 unit 23, tapsfrihet 12; kø-/timegrensetester også grønne. DV5 20/20, DV6 16/16, DV1 15/15, DV2 7/7, DV3 48/48, DV4 24/24; CA1–CA8 155/155, U5 65/65, scene-panels 39/39, lydeditor 24/24, lyd-UI 28/28 på isolert gjentak (første 27/28, QR-race). Verifisering4 51/54: to falsk-mikrofonkontroller og Courier Prime-måling, ikke grønn i dette miljøet.
- Krav REQ-0780–0800 (G1–G13/S1–S8) registrert som Implementert – ikke verifisert. build_docs/check_kb OK: 800 krav, ingen udekkede mandatlinjer. i18n OK. Ingen ekte/betalte ElevenLabs-kall eller publisering.
- Åpne avvik: batchresultater har reversible kommandoer og serverhistorikk, men lokal bruker-angreliste er ikke koblet til bakgrunnsresultatene. Leverandørblokkede batcher krever ny brukerstart etter gjenopprettet tilgang; eksisterende blokkert batch kan ikke gjenopptas via API. Full database-/receipt-/retry-ende-til-ende-test gjenstår; UI-suitene bruker faste mockede svar. Automatisk videreføring krever eksisterende cron-plan; den ble ikke kontrollert i Cloud.


## DV3/DV4 – 19.10.2026
- DV1/DV2 og migrasjon 0060 er Cloud-verifisert/publisert av Øystein; skjemaversjon 60. Denne runden lager ingen 0061 og erstatter ingen databasefunksjoner: assets.voice er eksisterende størrelsesbegrenset JSONB; character_asset_id finnes fra 0060.
- DV3 utvider RecordAudioDialog, ikke en konkurrerende editor: stor replikk/kontekst, karaktervalg og portrett, opptak, stablede versjoner, separat forhåndslytting, aktiv filmversjon, bekreftet reversibel sletting av inaktiv versjon. Karakterforslag krever bekreftelse; nye opptak kan få entydig karakterkobling. Begge tidslinjer projiserer karakterspor; overlapp varsles, andre linjer flyttes ikke.
- DV4: standardstemme med modell, språk og innstillinger; kontoens stemmer/modeller via eksisterende serveradapter. Lokal generering går gjennom kostnadsport, sjekker manusrevisjon og språk, blir ny aktiv versjon og bevarer tidligere filer/redigering. Generert fil oppretter egen lydressurs; forelderversjon bevares. Jobblogg lagrer ikke manusreplikken. Ukjent modellpris blokkerer generering.
- Egendefinert stemme: eksisterende kontostemme kan velges. Opprettelse skjer hos ElevenLabs via lenke; leverandøren håndhever kontoadgang/samtykke/rettigheter. Ingen innebygd stemmekloning eller verifikasjon av kontoens opprettelsesrettigheter. Dette er et eksplisitt avvik/avgrensning, ikke rapportert som full funksjon.
- Krav M1–M5, D1–D8, L1–L10 og V1–V7 registrert som REQ-0750–0779 med original oppdragskilde og status «Implementert – ikke verifisert»; ingen nye beslutningsnumre oppfunnet. build_docs/check_kb OK: 779 krav, 12 skills, 0 udekkede mandatlinjer. PyYAML installert isolert i /tmp.
- Tester: Vitest 1774 bestått, 0 feilet, 10 eksisterende hoppet over (227 filer bestått, 2 eksisterende hoppet over). Automatisk typekontroll/build OK; ingen manuell tsc-kjøring i dette miljøet. i18n 0 tekster uten engelsk.
- Nettleser: DV3 48/48 (NO/EN, falsk mikrofon, kobling, preview uten aktivering, valg, bekreftet sletting og begge spor); DV4 24/24 (NO/EN, lokal overstyring, godkjent mockgenerering, metadata, bibliotekstandard). Ingen ekte ElevenLabs-kall.
- Regresjon: DV1 15/15, DV2 7/7, CA1–CA8 17/17/20/25/13/15/26/22 (155/155), U5 65/65, scene-panels 39/39, dec0093-audio-ui 28/28, dec0094-audio-editor-ui 24/24.
- Verifisering4 51/54: gammel suite har hardkodet nettlesersti og reserveoppstart uten falsk mikrofon, derfor to REQ-0583-feil; Courier Prime måles 6,439 em og gir én REQ-0050-feil. Forventninger beholdt. Ny DV3-suite prøver opptak med falsk mikrofon på begge språk og består. Første sideåpning i DV3 feilet sporadisk med ERR_ABORTED; siste fullkjøring 48/48. Gammel lydsuite fikk tidsavbrudd i lang samlet kjøring; separat fullkjøring 28/28.
- DB-tester og ekte kontoflyt ikke kjørt i denne runden: lokal Postgres på 54329 er ikke tilgjengelig. Ingen databaseendring er gjort. Øysteins tidligere DB 127/127/backfill-verifikasjon beholdes som tidligere verifikasjon, ikke ny kjøring.
- DV5–DV8 (massegenerering, avvik, gule lapper, bokmerker) utenfor denne leveransen. KI-167/KI-209/KI-243 er uendret.


Oppdatert: 2026-10-19 (DEC-0099, dokumentasjon og backlogg)

## Gjeldende status – 19.10.2026
- Øystein har verifisert og publisert T1, Story Lab, Manusutforskeren, OG1/OG2, SV1, Asset Studio, GP1–GP5, MT1–MT9, T2, CA1–CA8, U5 og Ø-11. Cloud er på skjemaversjon 58; migrasjonene til og med 0058 er kjørt av Claude/Øystein og hashkontrollert. Ingen ny migrasjon i dokumentasjonsrunden.
- A: gyldig men tom fixture-SVG var årsaken til grå karakterkort/sporhoder; tydelige testbilder og kontroll av naturalWidth/naturalHeight. Ingen komponentendring nødvendig.
- C1: behold én eksisterende compareVersionCreation-regel: tidsstempel → lagret versjonsnummer → variant-ID → versjons-ID. Samtidige takes i samme variant sorteres ikke etter tilfeldig UUID; eksisterende konkrete tester beholdt.
- C2/KI-255: performance.now og 1000 ms toleranse under full suite, med full innholdskontroll; fanger fortsatt sekundlang/kvadratisk regresjon.
- C3/MT4: last bildelag før malminiatyren tegnes; pixeltest av faktisk opplastet PNG.
- C4/KI-241: eksplisitt clipId følger lydvindu, studio, opptak og mobilkontekst; uten valg brukes første udempede klipp i tidsrekkefølge. Mobilserveren kontrollerer at valgt klipp tilhører replikk og prosjekt.
- C5/KI-242: dra deler med lokal forhåndsvisning; ett angresteg ved slipp, ingen ved avbrudd. Lagres som tidligere via kommandoer, ikke direkte skriving.
- DEC-0099 og REQ-0725–0739 registrerer tilgjengelige T1/Story Lab-, CA1–CA3-, U5- og sikkerhetskilder. Eksisterende CA4–CA8 REQ-0715–0724 beholdes. B2-kildene fra Øystein er levert: DEC-0099 er supplert og kap. 42–51 registrert som REQ-0740–0749 med ærlig deldekning.
- Tester: Vitest 1723/0 to ganger, 10 eksisterende hoppet over; DB 120/120; U5 65/65; CA1–CA8 17/17/20/25/13/15/26/22; scene-panels 39/39; verifisering4 58/58; Story Lab 32/32; verifisering3 73/73; interactions 44/44; lydeditor 24/24; MTS 42/16/16/13/13/13/17 (130/130).

## Historikk: DEC-0095 fase 2, bolk D – ord-til-lyd og tekstbasert lydredigering – ferdig, venter på Mars
- Kjerne `src/core/audio/alignment.ts` (paring, markering, manuell retting, tekstendringer, forslag til plassering, tid gjennom komposisjon, status), migrasjon 0037, `SetVersionAlignment`, server `src/adapters/ai/alignment.functions.ts` + `ADAPTERS.elevenlabs.align`, UI `LineWordsPanel.tsx` i lydeditoren, status i lydvinduet og inspektøren. Tester: word-alignment (8), DB 0037, `tests/visual/dec0095-word-alignment-ui.mjs` (16/16).

## Før: DEC-0094 fase 2, bolk C – lydkomposisjon, lydeditor og eksport – ferdig, venter på Mars
- Kjerne `src/core/audio/composition.ts` (deler, innsetting før/etter/oppå/område, trim, kontroll, konflikter, utsnitt), migrasjon 0036 (`asset_versions.composition`), motor `src/engine/audio/composition.ts` (miks, MP3 via `@mediabunny/mp3-encoder`), app `AudioCompositionEditor.tsx` + `composition-actions.ts`. Tester: audio-composition (8), DB 0036, `tests/visual/dec0094-audio-editor-ui.mjs` (20/20).

## Før: DEC-0093 fase 2, bolk B – lydopptak på PC og mobil med takes og romlyd – ferdig, venter på Mars
- Takes er versjoner av en lydressurs; replikken knyttes via lydklippet (første opptak lager ressurs og klipp). Lydvinduet (`src/app/audio/AudioTakesDialog.tsx`), opptak (`use-recorder.ts`), lagring (`src/app/audio/takes.ts`), kjerne (`src/core/audio/takes.ts`, kontekstene `sound`/`line` i `src/core/mobile`), mobil (`MobileAudio.tsx`, status «local» i køen), mottak i `MobileImportWatcher` (`importAudio`). Tester: audio-takes, mobile-audio-queue, mobile-server, `tests/visual/dec0093-audio-ui.mjs` (28/28).

## Før: KI-238 og DEC-0092 – én «Fra mobil»-variant og ressurser i halv størrelse – ferdig
- Mobilbilder behandles ett om gangen med fersk tilstand og gjenbruker «Fra mobil» (`pickMobileVariant`, `tests/unit/mobile-variant.test.ts`). Ressurser legges inn i 50 % av lerretets høyde/bredde (`LAYER_FIT_SHARE`, REQ-0714, `tests/unit/layer-fit.test.ts`).

## Før: DEC-0091 – teknisk feilmelding på feilsiden – ferdig, venter på feilmeldingen fra Mars
- Mars fikk «Siden kunne ikke vises» etter publiseringen. Mobilsiden på den publiserte appen og produksjonsbygget lokalt (wrangler, iPhone-visning) krasjer ikke. Feilsiden har fått «Vis teknisk feilmelding» med kopiering (`src/app/shell/ErrorDetails.tsx`, `error-report.ts`, REQ-0713); nettfeil i QR-dialogen vises på brukerens språk. Feilen funnet fra Mars' melding: samme sanntidskanal to ganger i sceneeditoren – rettet med unikt kanalnavn per lytter (KI-237, `tests/unit/realtime-channels.test.ts`).

## Før: DEC-0090 fase 2, bolk A – mobilbro, bilder og video, deling – ferdig, venter på Mars
- Bygget: QR-koder per kontekst, mobilsiden med hurtigfoto, video og deling, sikre opplastingsøkter, mobilimport i biblioteket, bilder blir nye versjoner i riktig ressurs.
- Venter: migrasjon 0035 og pakken i Lovable; prøving på iPhone og Android; OK til bolk B.
- Akseptansekriterier: REQ-0668–0683 og REQ-0711 (se VISUAL_QA_DEC-0090A.md).

## Før: DEC-0089 – manuset i sceneeditoren og paneler som lukkes – ferdig, venter på Mars
- Bygget: panelet «Manus» (lesevisning med markering under avspilling), «Rediger manus …» i eget vindu med forrige/neste scene til lesing, lukking og åpning av alle panelene (huskes på kontoen).
- Akseptansekriterier: REQ-0665–0667 (verifisert, se VISUAL_QA_DEC-0089.md).

## Før: DEC-0088 – bildeverktøy, elementer i flere scener, systemmerknader, TODO, paneler, AI-tilkoblinger – ferdig, venter på Mars
- Bygget: delelinjer og navngitte ruter, «Fjern luften rundt», «Lag variasjoner», dørdeler med hengsel; «Legg til element i scenen …» med planer for andre scener (varmgul ramme), systemmerknader med «Ferdig» og i eksport, oppgaven i toppstripen med ‹ ›, TODO-boksen; paneler side om side og lukkbare grupper lagret på kontoen; AI-tilkoblinger og cron-status på adminsiden.
- Venter: migrasjon 0034 i Lovable; publisering for bakgrunnsjobben; Mars prøver.
- Akseptansekriterier: REQ-0656–0664 (verifisert, se VISUAL_QA_DEC-0088.md).

## Før: DEC-0086 – kontoer, adminside, personvern, kostnadsrapport; videohenting rettet – ferdig, venter på Mars
- Bygget: Min konto, adminside, blokkering/sletting (30 dager), låste prosjekter og ny eier, personvernerklæring med versjoner og godkjenning, kostnadsrapport med eksport, «Hent videoen igjen».
- Venter: migrasjon 0033 og pakkene i Lovable; Mars/admin fyller ut personvernfeltene; region og Lovable-plan sjekkes.
- Akseptansekriterier: REQ-0649–0655.

## Før: DEC-0085 – AI-video av scenen utvidet – ferdig, venter på Mars
- Bygget: kilde for AI-videoen, referanser med samleark, samlet global beskrivelse (én redigerbar versjon for all AI), scenebeskrivelse fra manuset og med AI, lydvalg og dempet lydspor, nedlasting med format og undertekstvalg, status i toppfeltet, valgt versjon i avspillingen, opplasting av video for scenen. README.md og TODO.md.
- På vent: SMS-varsel. Planlagt: ProRes/MOV (TODO.md).
- Akseptansekriterier: REQ-0640–0648 (alle verifisert med enhets- og nettlesertester, ikke med ekte nøkler – KI-213).

## Før: DEC-0083 – AI-video av scenen fra sceneeditoren – ferdig, venter på Mars
- [x] Knapp og dialog i sceneeditoren, video-til-video (Kling O3 Edit, Aleph 2), instrukser per scene (0032), valg av hva som viser scenen (REQ-0633–0638)
- [x] Vitest 1094, DB 60/60, nettlesersuitene og scene-video-ui 18/18
- [ ] **Mars:** commit og push, lim inn LOVABLE_SYNC (0030, 0031, 0032)
- [ ] **Mars:** prøv på en kort scene med Kling O3 Edit (KI-204)
- [ ] **Mars:** svar på KI-176/KI-178 og hvem som kan bruke felles ressurser (DEC-0084)

## Før: DEC-0081/0082 – norsk og engelsk, ny prosjektliste – ferdig, venter på Mars
- [x] Språkvalg og hele grensesnittet oversatt; kontroll i testene (REQ-0629/0630)
- [x] Prosjektlisten: boks per prosjekt, eier, rolle, varianter med dato og notat; notat per produksjon (REQ-0631/0632, migrasjon 0031)
- [x] tsc, Vitest, DB 59/59, nettlesersuitene og engelsk gjennomgang grønne
- [ ] **Mars:** commit og push, lim inn LOVABLE_SYNC (0030 og 0031)
- [ ] **Mars:** la en engelskspråklig teste teksten (KI-198)
- [ ] **Mars:** skal faste tekster i eksporterte filer følge språket i tjenesten? (antatt ja)

## Før: DEC-0080 – bildeverktøy, vinkler, promptmotor, oppskalering, lesevisning – ferdig, venter på Mars
- [x] Del A (13 punkter), D (promptmotor, stilanalyse, faktaark), B (vinkler, Seedream/Qwen), C (oppskalering) – REQ-0610–0628
- [x] Migrasjon 0030; Vitest 1074, DB 58/58, nettlesersuitene grønne, skjermbilder g01–g17
- [ ] **Mars:** commit og push, lim inn LOVABLE_SYNC (0030)
- [ ] **Mars:** prøv vinkler, Seedream/Qwen, oppskalering, stilanalyse og faktaark med ekte nøkler (KI-193)
- [ ] **Mars:** skal «Sort tekst på hvit bakgrunn» også gjelde arkene?

## Før: DEC-0061 – M8 del 1: plakater, karakterkart og relasjoner – ferdig, venter på Mars
- [x] «Utgivelse»: kinopitch-plakat og karakter- og universkart per produksjon, 70 × 100 cm m.fl., norsk og engelsk (REQ-0384–0389, REQ-0403/0404)
- [x] Førsteutkast fra prosjektet, 13 innholdsvalg, ny komposisjon som beholder brukerens endringer, lesbarhetskontroll (REQ-0390–0392, REQ-0396)
- [x] Relasjoner med forslag fra manuset, godkjenning og redigering (REQ-0393–0395); egne elementer og direkte redigering (REQ-0397–0399)
- [x] Trykk-PDF (utfallende kant, skjæremerker, ekte tekst) og PNG (REQ-0387, REQ-0421)
- [x] Migrasjon 0019; Vitest og DB-tester grønne, skjermbilder 60–66, kodegjennomgang (23 funn: rettet, resten KI-128–133)
- [ ] **Mars:** godkjenn kostnad for stilharmonisering med AI (REQ-0137–0145, REQ-0400–0402) – eller vent
- [ ] **Mars:** Prøv: Utgivelse → «Ny» → «Karakter- og universkart» → «Relasjoner» → godkjenn → «Eksporter» → Trykk-PDF

## Nå: DEC-0078 – alt som kan gjøres uten Mars – ferdig, venter på Mars
- [x] Migrasjon 0028, adapterlag, versjonsgjenoppretting, bibliotek, innholdsmessig synk, UX, 30 KI
- [ ] **Mars:** commit og push, lim inn LOVABLE_SYNC (0028)
- [ ] **Mars:** prøv ekte AI-generering én gang (REQ-0565/0589/0590)
- [ ] **Mars:** avklar KI-176, KI-178, globale ressurser, stilharmonisering, «Lovable» som navn

## Før: DEC-0076 – kravverifisering runde 4 og UX-gjennomgang – ferdig, venter på Mars
- Mars: «Fortsett» (Teknisk anbefaling). Ingen ny migrasjon (0027 venter fortsatt).
- [x] 34 krav vurdert, funn rettet, UX-gjennomgang mot de ni kvalitetene
- [x] **Mars:** REQ-0528 avgjort (DEC-0077: redaktører kan starte betalte jobber)
- [ ] **Mars:** avklar KI-176, KI-178, globale ressurser og stilharmonisering

## Før: DEC-0075 – kravverifisering runde 3, kostnadsanslag, versjonssammenligning, tidsmodell – ferdig, venter på Mars
- Mars: «Da fortsetter du videre» (Teknisk anbefaling). Ingen ny migrasjon (0027 fra DEC-0072 venter fortsatt).
- [x] Verifisering runde 3 og rettede funn (REQ-0424, 0426, 0168, 0405, 0280, 0273, 0443)
- [x] REQ-0318, 0078, 0105, 0275, 0311, 0053, 0489; KI-175, KI-177 (delvis)
- [x] Vitest 866 grønne, tsc, eslint, nettlesersjekk 73/73, kodegjennomgang (10 funn rettet)
- [ ] **Mars:** avgjør REQ-0528 (KI-179): skal redaktører uten kostnadsrett kunne starte betalte jobber?
- [ ] **Mars:** avklar KI-176, KI-178 og globale ressurser (REQ-0571).

## Før: DEC-0074 – plakat i trykkoppløsning, spinoff-nummer, språkfikser, tilgjengelighet, verifisering – ferdig, venter på Mars
- Mars: «Fortsett med neste store gruppe ting, er i møte» (Teknisk anbefaling). Ingen migrasjon (0027 fra DEC-0072 venter fortsatt).
- [ ] **Mars:** avklar KI-176, KI-178 og globale ressurser (REQ-0571).

## Før: DEC-0073 – AI-køen uten bakgrunnsjobb, kravverifisering og ti forbedringer – ferdig
- Mars: «Fortsett med neste store gruppe ting, er i møte» (Teknisk anbefaling).
- Ferdig: se DEC-0073. Ingen migrasjon (0027 fra DEC-0072 er ikke kjørt ennå).
- [ ] **Mars:** avklar KI-176 (REQ-0146, 0482, 0102, 0275, 0269) og globale ressurser (REQ-0571).

## Før: DEC-0072 – arbeidsliste, ingen automatisk generering og ti bolker – ferdig, venter på Mars
- Mars: «Tar du de neste 10?», «vi kjører ingen genereringer av video automatisk …» og ønsket om arbeidsliste for oppdaterte ressurser (Bekreftet av bruker).
- Ferdig: arbeidsliste, stillbilder, valgte scener i eksport, sporbarhet, koblinger for en linje, teknisk visning, lagring og eksportinnstillinger, film i spinoff, animerte masker, ende-til-ende-test. Migrasjon 0027.
- [x] **Mars:** commit og push, gammel cron-adresse slettet av Lovable, 0027 kjørt (databasen på versjon 27).
- [ ] **Mars:** prøv arbeidslisten: last opp nytt bilde av en ressurs, godkjenn med «behold» i noen scener, åpne «Gå gjennom scenene …».

## Før: DEC-0071 – ti store bolker til – levert og kjørt i Lovable
- Mars: «I møte, kan du ta de neste 10 store bolkene?» (Teknisk anbefaling; ingen nye produktkrav).
- Ferdig: sammenheng i køen, myke overganger mellom deler, kvalitetssjekkliste, betegnelser i bestemte linjer, stilprofiler per bruk, masker og blanding, eksporttekst, manusdekning, dialog med AI-stemmer, kravgjennomgang (35 krav). Migrasjon 0026. Kodegjennomgang: 9 av 10 funn rettet.
- Akseptanse: overgangen gjør ikke scenen kortere og når aldri forbi nabodelen (enhetstest); en kjede venter aldri for alltid (enhetstest); sjekklisten er alltid merket rådgivende (enhetstest); skjermbilder 30b, 02f, 04b, 80c, 80d.
- [ ] **Mars:** kjør LOVABLE_SYNC (0024–0026, `text/plain` for bøtta `sources`, planlagt kall hvert 5. minutt).
- [ ] **Mars:** velg navn for REQ-0430 (KI-171); prøv AI-stemmer med én kort replikk (KI-168).

## Før: DEC-0070 – ti store bolker – ferdig, venter på Mars
- Mars: «fortsett med de neste 10 store tingene!» (Teknisk anbefaling; ingen nye produktkrav).
- Ferdig: bakgrunnskø, video for flere scener med kø/prioritet/fremdrift, innsatsnivå, modelltilpassede beskrivelser, sammenheng mellom segmenter, kandidater og sammenligning, hybrid sammensetting, oppdatering med AI ved avvik, Fountain, lydkoblinger og -filter. Migrasjon 0025.
- [ ] **Mars:** kjør LOVABLE_SYNC (0024–0025, `text/plain` for bøtta `sources`, planlagt kall hvert 5. minutt).
- [ ] **Mars:** prøv «Video for flere scener» med to korte scener og en billig modell; KI-159–165.

## Før: DEC-0069 – egne AI-leverandører (bilde, video, lyd) – ferdig, venter på Mars
- Mars: «løsningen kan presentere en liste over de mest brukte ai leverandørene … denne nøkkelen må sikres etter alle kunstens regler og det må være mulig å sette et tak på ai kost på overordnet nivå» (Bekreftet av bruker).
- Ferdig: leverandørliste med veiledning og lenker, kryptert nøkkel, overordnet tak, bilder med valgt leverandør, video per segment i «Generer scene», lyd for lydressurser, migrasjon 0024, kodegjennomgang (10 av 11 funn rettet).
- Akseptanse: nøkkelen kan ikke leses fra nettleseren (DB-test), taket kontrolleres før og etter (enhetstest), video legges inn som ny versjon og erstatter aldri 2D-scenen (enhetstest), kostnad bekreftes alltid (skjermbilder 02b–02d, 79).
- [ ] **Mars:** kjør LOVABLE_SYNC (0024); legg helst inn `ANIMATIC_KEY_ENCRYPTION_KEY` før første nøkkel (KI-156).
- [ ] **Mars:** prøv én leverandør med en liten jobb (KI-153); avgjør om deling av eierens nøkkel skal slås på per prosjekt (KI-157).

## Før: DEC-0068 – nattarbeid runde 6–10 – ferdig
- Mars: «grønt lys til at du kjører fem runder til før jeg står opp».
- Ferdig: fortellingstid i manus, utvikling over tid, flere filter, plan ved deling/sammenslåing, rettinger.
- Gjenstår: Mars kjører 0022–0023 i Lovable og prøver; KI-150–152.

## Før: DEC-0067 – nattarbeid 12.10.2026 – ferdig
- Mars: «kan du ta fem runder frem til i morgen?» (ingen nye produktkrav; Teknisk anbefaling).
- Ferdig: AI-bilder som ikke ble lagt inn kan hentes inn; varighet og produksjonsstatus med filter og lenker; planlagt lengde per scene; eieren kan fjerne medlem; kravrevisjon (65 krav).
- Gjenstår: Mars kjører 0022–0023 i Lovable og prøver; KI-146/147.

## Før: DEC-0066 – AI skriver bildebeskrivelsen og ser filmens bilder – ferdig (ikke prøvd mot ekte gateway)
- Mars: «Ja også for spinn off. Og ja trenger maksimal god beskrivelse, ja bilder kan sendes og brukes».
- Ferdig: «Skriv beskrivelsen med AI» (språkmodell, logget, utenfor bildebudsjettet), forbildebilder sendt med (≤ 6), KI-141 avklart, migrasjon 0022.
- Akseptanse: teksten vises og kan endres før generering; bildene og rollen deres står i beskrivelsen; tester grønne (enhet, database, skjermbilde 75).
- Gjenstår: Mars prøver i Lovable (KI-143).

## Også nå: DEC-0065 – filmens visuelle stil og AI-beskrivelser med sammenheng – ferdig (uten språkmodell)
- [x] Stilprofil (migrasjon 0021), «Filmens visuelle stil» med utkast og forhåndsvisning, beskrivelser med FILM/VISUAL STYLE/THIS IMAGE/WHERE IT APPEARS/CONSISTENCY/AVOID, scenen fra sceneeditoren, stilen i video-beskrivelser
- [x] Enhetstester, DB-test, skjermbilder 73–74
- [ ] **Mars:** fyll ut filmens visuelle stil (Prosjektoversikt) og se på en beskrivelse i sceneeditoren
- [ ] **Mars:** ja/nei til språkmodell som skriver beskrivelsen om (kostnad) og til å sende forbildebilder med

## Også nå: DEC-0064 – bilder i fullskjerm, nedlasting med prosjektnavn og opplasting igjen – ferdig
- [x] REQ-0588; skjermbilder 71–72; enhetstester for navn og erstatning
- [ ] **Mars:** Prøv: Bibliotek → Maja → dobbeltklikk et bilde → «Last ned» → endre bildet → «Last opp endrede bilder …» → «Erstatt»
- [ ] **Mars:** svar på spørsmålene om smartere bildebeskrivelser (språkmodell/kostnad, forbildebilder, filmens visuelle bibel)

## Også nå: DEC-0063 – endre rolle etter invitasjon og «Tilbake til …» – ferdig
- [x] REQ-0586 (migrasjon 0020, DB-test), REQ-0587 (enhetstest); skjermbilder 69–70
- [ ] **Mars:** Prøv: Prosjektoversikt → Medlemmer → endre rollen til Anita; gå Manus → Bibliotek → «Tilbake til Manus»

## Også nå: DEC-0062 – «Bruk aktivt utsnitt», grupper med dra og slipp, fjern lag, justerbar lagliste – ferdig
- [x] REQ-0584 (kamera), REQ-0585 (lag); skjermbilder 34, 67, 68
- [ ] **Mars:** Prøv i sceneeditoren: dra et lag inn på «Familien» og ut igjen; velg et kamerautsnitt i scene 2 → «Bruk aktivt utsnitt»

## Forrige: DEC-0060 – M7 del 4: tilbakeføring fra spinoff, kontinuitet i spinoffer, utdrag – ferdig, venter på Mars (leveres sammen med DEC-0049–0059)
- [x] Sammenligning og valg ved tilbakeføring, ny hovedfilmversjon, overføring av ny scene (REQ-0373–0383, REQ-0500)
- [x] Kontinuitet per produksjon: arvet, avslått og lokal (REQ-0166/0167); varsler om hull med «Ta med scenen» (REQ-0325/0369)
- [x] Utdrag av ferdig film og sammenbindende scener i spinoff (REQ-0367/0368/0370)
- [x] Migrasjon 0018; 436 Vitest, 43 DB-tester, skjermbilder 100–102, kodegjennomgang (12 funn: rettet, resten KI-122–127)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Majas jul – kortversjon» → «Tilbakefør» → «Overfør valgte»; Bibliotek → Maja med spinoffen valgt → «Slå av i …»

## Forrige: DEC-0059 – M7 del 3: engelsk film (lyd, bilder, timing og eksport per språk) – ferdig, venter på Mars (leveres sammen med DEC-0049–0058)
- [x] Lyd per språk, felles musikk/effekter, lyd per replikk og språk (REQ-0336–0340); like scenelengder i alle språk
- [x] Bilde per språk i lag (REQ-0337); filmlyd med blandet dialog merkes og varsles (REQ-0341/0342)
- [x] «Språkversjon …»: timingkonflikter med forslag, materialtype og råd om leppesynk, aldri regenerering (REQ-0343–0347)
- [x] Dialogspråk og undertekster uavhengig, eksport per språk og dialogspor som WAV (REQ-0348/0350/0352), spinoff (REQ-0371)
- [x] Migrasjon 0017; 411 Vitest, 42 DB-tester, skjermbilder 96–99, kodegjennomgang (9 funn: rettet, resten KI-117–121)
- [ ] **Mars:** Prøv: Montering → «Dialog: Engelsk» og «Tekst: Engelsk» → spill av; «Språkversjon …»; Eksporter → «Bare dialogspor (WAV)»

## Forrige: DEC-0058 – M7 del 2: engelsk manus – ferdig, venter på Mars (leveres sammen med DEC-0049–0057)
- [x] Oversettelse per linje og scenehode, endrer aldri norsk; «må gjennomgås» ved endret norsk (REQ-0329–0331)
- [x] Import av oversatt manus med automatisk kobling og godkjenning (REQ-0332–0335) – referansemanuset 97/97 scener
- [x] Engelsk visning, redigering i inspektøren, eksport av engelsk manus, undertekster (REQ-0349/0351)
- [x] Migrasjon 0016; 394 Vitest, 41 DB-tester, skjermbilder 93–95, kodegjennomgang (16 funn: rettet, resten KI-113–116)
- [ ] **Mars:** Prøv: Manus → «Engelsk» → «Importer engelsk manus …» (den engelske Word-filen) → kontroller koblingene → Lagre

## Forrige: DEC-0057 – M7 del 1: avledede produksjoner (spinoff) – ferdig, venter på Mars (leveres sammen med DEC-0049–0056)
- [x] «Ny produksjon …» og «Legg til scener …» (REQ-0353/0354), nye scener bare i spinoffen (REQ-0361–0363)
- [x] Felles produksjonsvalg i manus, montering, sceneeditor og bibliotek
- [x] Automatisk egen versjon av en gjenbrukt scene ved endring, med 2D-scene, historikk og koblinger (REQ-0365)
- [x] 384 Vitest, 40 DB-tester, skjermbilder 89–92, kodegjennomgang (11 funn + småting: rettet, resten KI-107–112)
- [ ] **Mars:** avklar KI-107 (deling/sammenslåing i hovedfilmen av scener som også er i en spinoff)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Ny produksjon …» → velg scener → Manus (velg produksjonen) → endre en replikk

## Forrige: DEC-0056 – M6 del 3: konsekvenser ved ressursendring og kontinuitetsanalyse – ferdig, venter på Mars (leveres sammen med DEC-0049–0055)
- [x] Godkjenning med konsekvenser: berørte scener, valg per scene, film som «kan være påvirket» (REQ-0130/0132/0134/0314)
- [x] Eldre versjon flagges i sceneeditoren med «Bruk vN»
- [x] Rådgivende kontinuitetsanalyse på prosjektoversikten (REQ-0319–0324, REQ-0129)
- [x] 376 Vitest, 39 DB-tester, skjermbilder 87–88, kodegjennomgang (12 funn + småting: rettet, resten KI-103–106)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Kontinuitetsanalyse»; Bibliotek → Maja → «Godkjenn» på et nytt bilde

## Forrige: DEC-0055 – M6 del 2: kontinuitet for karakterene – ferdig, venter på Mars (leveres sammen med DEC-0049–0054)
- [x] Kontinuitetshendelser (11 typer, før/etter, scene/linje, varighet) med kommandoer og migrasjon 0015 (REQ-0150–0156)
- [x] Utseende per scene etter fortellingstid, også tilbakeblikk (REQ-0152/0160/0165)
- [x] Tidslinje per karakter, forslag fra manuset som godkjennes/avvises (REQ-0155/0157/0158)
- [x] Sceneeditoren: riktig utseende ved innlegging, visning og advarsel; «Generer scene» med riktig utseende og segmenter før/etter endringen (REQ-0159/0161–0163)
- [x] 369 Vitest, 39 DB-tester, skjermbilder 83–86, kodegjennomgang (10 funn: 9 rettet, 1 registrert som avklaring KI-100)
- [ ] **Mars:** avklar KI-100 (skal en hendelse i en deaktivert scene gjelde?)
- [ ] **Mars:** Prøv: Bibliotek → Maja → «Kontinuitet» → «Ny hendelse» (eller godkjenn et forslag) → se tidslinjen og sceneeditoren

## Forrige: DEC-0054 – M6 del 1: avvik ved manusendring – ferdig, venter på Mars (leveres sammen med DEC-0049–0053)
- [x] Grunnlag for 2D-scener og godkjent grunnlag for versjoner; deteksjon på tekst, berørt tidsrom
- [x] Avvik synlige i monteringen, manuset, sceneeditoren og på prosjektoversikten (REQ-0315)
- [x] Tre valg: godkjenn, oppdater, angre manusendringen (hele scenen eller én linje)
- [x] 0014 utvidet; 355 Vitest, 38 DB-tester, skjermbilder 80–82, kodegjennomgang (10 funn: 8 rettet, resten KI-96–98)
- [ ] **Mars:** Prøv: endre en replikk i en scene med 2D-scene → Montering viser avviket → Godkjenn / Angre

## Forrige: DEC-0053 – M5 del 2: AI med kontroll – ferdig, venter på Mars (leveres sammen med DEC-0049–0052)
- [x] Frilegging med pensel, gratis i nettleseren (REQ-0580)
- [x] AI-budsjett (eier), sperre på serveren, forbruk og anslag (REQ-0279–0284, REQ-0528)
- [x] Liste over AI-jobber med status og «Prøv igjen» (REQ-0292–0303)
- [x] «Generer scene»: segmenter og beskrivelser som kan endres, lagres og kopieres (REQ-0243–0267)
- [x] Migrasjon 0014; 347 Vitest, 37 DB-tester, skjermbilder 77–79, kodegjennomgang (11 funn + småting: rettet, resten KI-91–95)
- [ ] **Mars:** velg og godkjenn videoleverandør og pris (KI-94) – da kan «Generer» slås på
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013, 0014, 0015 og 0016)
- [ ] **Mars:** Prøv: Bibliotek → versjon → «Frilegg …»; Prosjektoversikt → «AI-budsjett og jobber»; Montering → scene → «Generer scene …»

## Forrige: DEC-0052 – sceneeditor del 3 – ferdig, venter på Mars (leveres sammen med DEC-0049–0051)
- [x] Bildeskifte i lag, merke i tidslinjen som kan dras (REQ-0579)
- [x] Grupper med ankerpunkt; lag inn/ut uten å hoppe; sletting av gruppe beholder lagene (REQ-0174)
- [x] Bevegelsesbane: frihånd, «Glatt ut», rett linje, punkter, kurve/hjørne (REQ-0581)
- [x] Ease ut/inn med styrke (bane og nøkkelbilder) og tempokurve (REQ-0582)
- [x] Naboscener som film med lyd og overganger (REQ-0578)
- [x] Lydopptak i sceneeditoren (REQ-0583)
- [x] 0013 utvidet (grupper, `image_swaps`, `motion_path`, `anchor`); 329 Vitest, 36 DB-tester, skjermbilder 73–76, kodegjennomgang (12 funn: 10 rettet, 2 registrert som KI-87/88)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013)
- [ ] **Mars:** Prøv: Sceneeditor → velg lag → «Bytt bilde ved …», «Tegn bane», «Glatt ut», tempo; «Ny gruppe»; «Naboscener»; «Opptak» (med mikrofon)
- [ ] Senere (M5): frilegging med pensel (REQ-0580)

## Forrige: DEC-0051 – overganger, svart-hvitt, eget vindu, hendelser i 2D-scenen – ferdig, venter på Mars (leveres sammen med DEC-0049/0050)
- [x] Sju overgangstyper, overlapp, standardovergang (REQ-0575–0577, REQ-0223)
- [x] Svart-hvitt globalt og per scene, også i eksporten (REQ-0573/0574)
- [x] Forhåndsvisning i eget vindu (REQ-0572)
- [x] Hendelser i 2D-scenen koblet til manus (REQ-0096, REQ-0095 delvis)
- [x] Migrasjon 0013, 312 Vitest, 35 DB-tester, skjermbilder 69–72, kodegjennomgang (10 funn: 8 rettet, 2 registrert som KI-84/85)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013)
- [ ] **Mars:** Prøv: Montering → «Standardovergang», scene → overgang «Iris» med overlapp, «Svart-hvitt», «Eget vindu»; Sceneeditor → velg lag → «Hendelser i manuset»

## Forrige: DEC-0049 – sikkerhetskopi, manus ↔ film, samlet angring – ferdig, ikke levert ennå (Mac av)
- [x] Sikkerhetskopi som zip med dokumentert format; gjenoppretting som nytt prosjekt (REQ-0411/0412/0448)
- [x] «Vis i filmen» fra manuset, «Vis i manus» med replikken under avspillingshodet (REQ-0092/0100, REQ-0099 delvis)
- [x] «Importer lang film» og «Importer ferdig film» angres som ett steg (KI-75)
- [x] Beslutningsloggen gjenopprettet (KI-78)
- [x] Ingen migrasjon. 302 Vitest, 34 DB-tester, skjermbilder 66–68, kodegjennomgang (11 funn: 9 rettet, 2 registrert som KI-81/82)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (bare bygg)
- [ ] **Mars:** Prøv: Prosjekter → ⋯ → «Sikkerhetskopi …»; deretter «Gjenopprett fra sikkerhetskopi …» med filen (gir et nytt prosjekt); Manus → velg en replikk → «Vis i filmen»

## Forrige: DEC-0048 – montering del 4: klipping, tidskoblinger, lang film – levert, 0012 kjørt
- [x] Deler av klipp: trim, splitt (S), bildepresise inn/ut, fjerne del, «Hele klippet» (REQ-0220–0222)
- [x] Animatic-rest: film og animatic i samme scene (REQ-0239)
- [x] Tidskoblinger per replikk, «Synk replikker» (T), ikke dekket markeres (REQ-0093/0094/0107/0231)
- [x] Importer lang film over flere scener (REQ-0003, REQ-0237 delvis); status for film (REQ-0241)
- [x] Migrasjon 0012, 286 Vitest, 33 DB-tester, skjermbilder 63–65, kodegjennomgang (13 funn: 10 rettet, 3 registrert som KI-72–74)
- [x] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0012)
- [ ] **Mars:** Prøv: Montering → scene med film → S for å splitte, endre Inn/Ut; «Synk replikker» + T under avspilling; «Importer lang film»

## Forrige: DEC-0046/0047 – slett/forlat prosjekt, zip, importert film, overganger – levert, 0011 kjørt
- [x] Slett prosjekt (eier), forlat prosjekt, ressurser fra slettede prosjekter, zip (REQ-0567–0571)
- [x] Importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode (DEC-0047)
- [x] Migrasjon 0011, 273 Vitest, 32 DB-tester, skjermbilder 56–62, kodegjennomgang (10 funn rettet)
- [x] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0011)
- [ ] **Mars:** Prøv: Montering → velg scene → «Importer ferdig film …»; overgang; klikk på replikk; prosjektlisten → ⋯

## Tidligere: DEC-0045 – lyd over flere scener, lydprofil, varmgult kamerautsnitt, AI-bilder – ferdig, venter på Mars
- [x] Lyd i scenene rundt med «Bruk i scenen» (REQ-0560)
- [x] «Løper videre» over flere scener, varmgult (REQ-0561)
- [x] Lydprofil med volumpunkter som i After Effects (REQ-0562); bølgeformer i sceneeditoren (REQ-0563)
- [x] Aktivt kamerautsnitt varmgult (REQ-0564)
- [x] AI-bilder med Lovable-kreditter: synlig prompt, bekreftelse, grenser, logg (REQ-0565)
- [x] Migrasjon 0010, 264 Vitest, 27 DB-tester, skjermbilder 52–55
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0010, slå på Lovable AI)
- [ ] **Mars:** Prøv én AI-generering (dobbeltklikk på et lag → «Generer …»), musikk som løper videre og volumpunkter

## Tidligere (økt 4)

## Nå: Mars' ønsker + notater + M3 del 1 (ressursbibliotek) – ferdig, venter på Mars
- [x] M2 del 2 testet av Mars; migrasjon 0003 kjørt i Lovable
- [x] REQ-0532–0534 (DEC-0029): «Endre rekkefølge og synlighet»-bryter, flyttede scener markert, sammenligning linje for linje
- [x] REQ-0535–0543 (DEC-0031): notater (ord/setning/nål, stempel, sletting med advarsel, vis/skjul, søk, eksport og ny import), søketreff markert, scenelisten følger manuset, valgt scene øverst
- [x] M3 del 1 (DEC-0030): ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag fra manuset; karakterfilter med alle navn (KI-29)
- [x] Migrasjon 0004 (`0004_library_notes.sql`), DB-tester, kodegjennomgang (9 funn rettet)
- [ ] **Mars:** Commit + Push, deretter synkmeldingen for `0004_library_notes.sql` (`docs/development/LOVABLE_SYNC.md`)
- [ ] **Mars:** Prøv: Ressursbibliotek → «Forslag fra manuset», legg til bilde og godkjenn; Manus → merk ord → «Legg til notat»; søk; eksporter med notater og importer filen igjen i et testprosjekt

## Neste (forslag – M3 del 2: 2D-sceneeditor)
1. Lagbasert 2D-komposisjon per scene med ressurser fra biblioteket (bakgrunn, mellomgrunn, forgrunn, karakterer, objekter).
2. Transformasjoner, keyframes/easing, kamera med blå/rød ramme og Bézier-bane, avspilling i nettleseren.
3. Avklaring Q-03 (hvor mye karakteranimasjon) før animasjonsdelen.

## B2 / estimatliste – lokal leveranse 19.10.2026
- DEC-0099 supplert fra Øysteins to kilder; REQ-0740–0749 kap. 42–51 med konkrete implementation/verification og deldekning, aldri oppdiktet full godkjenning. REQ-0639 apptekster/katalog nøytralisert. Plattformstyrte filer/konfigurasjon er urørt.
- KI-224 løst-status via SetAnnotationResolved med invers/gjør om og DB-rundtur. KI-226 eksakt enkeltordmarkering → AddAnnotations i sceneeditor. KI-220 redigerbar kildeboks x/y/w/h før eksisterende partLayers-kommandoflyt.
- KI-207 eierbekreftet liste/sletting av gamle ubrukte ai-source-MP4, serveren re-sjekker jobber/referanser. Ingen automatisk sletting; ikke prøvd mot ekte lagring. 30 dager er en konservativ teknisk kandidatgrense, ikke ny godkjent produktregel.
- KI-247 ordtider projiseres og persisteres på ny lydversjon; gamle tider endres ikke. SV1 metode 4 lager ordmellomrommiksen i minnet før Bruk, og saveComposition bruker samme buffer og angregruppe som RetimeScene.
- KI-243 encoder pakket i createClientOnlyFn; nettleser MP3 verifisert, produksjonsartefakt ikke kontrollert. KI-167/KI-209 fortsatt åpne: ingen godkjent servermedietjeneste; ingen ny konkurrerende mediemotor eller utrygg automatisk dataskriving introdusert.
- Migrasjon 0059_annotation_resolved.sql: kun resolved på script_annotations, revoke/grant, schema 59. Ingen apply_changes/delete_project/purge-funksjoner erstattet; ikke kjørt i Cloud. Cloud står fortsatt på 58.
- Tester: Vitest 1736 bestått/0 feilet, to fullførte kjøringer med maxWorkers=2; 10 eksisterende hoppet over. Første standardparallelle sluttkjøring hadde to 5 s import-timeouts; ingen forventninger/timeouts endret. Lokal DB 120/120. CA1–CA8 17/17/20/25/13/15/26/22 (155/155). U5 65/65, scene-panels 39/39, lydeditor 24/24, ny B2 NO/EN 14/14. Verifisering4 57/58: bare eksisterende Courier Prime-breddekrav feilet (6,439 em vs 6); REQ-0583 6/6 med riktig testmikrofon, REQ-0210 5/5, REQ-0578 7/7. Testen er ikke svekket.
- Automatisk typekontroll: build OK. Separat tsc/typecheck ikke kjørt. i18n 0 manglende engelsk; build_docs/check_kb OK. VennTing urørt.
