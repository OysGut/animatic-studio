<!-- GENERERT FIL – ikke rediger. Kilde: docs/product/requirements.yaml. Kjør: python3 scripts/kb/build_docs.py -->
# Kravregister – Animatic Studio
Autoritativ kilde for krav-ID-er. Mandatkrav er utledet fra `MASTER_SPECIFICATION.md` (v14). Krav utenfor mandatet viser til en beslutning i `docs/decisions/DECISION_LOG.md`.

**ID-er er permanente. Aldri gjenbruk eller omnummerer. Nye krav får neste ledige nummer. Utgåtte krav beholdes med status Utgått.**

## Nøkkeltall
- Antall krav: **530**
- Prioritet: P0: 141, P1: 220, P2: 130, P3: 39
- Opprinnelse: mandat: 520, brukerbeslutning: 3, teknisk-anbefaling: 7
- Status: Ikke startet: 442, Verifisert: 62, Under arbeid: 22, Implementert – ikke verifisert: 4

## Prioritetsdefinisjoner
- **P0** Kritisk – ufravikelig prinsipp/systeminvariant. Gjelder fra første kodelinje som berører området, også når selve funksjonen bygges i en senere fase (feltet `phase`).
- **P1** Høy – nødvendig i fase 1–4, eller tverrgående prosesskrav (fase tom).
- **P2** Middels – fase 5–7.
- **P3** Senere – fase 8 eller betinget formulert («dersom», «kan hente inspirasjon»).

## Opprinnelse
- **mandat** – står i MASTER_SPECIFICATION v14.
- **brukerbeslutning** – vedtatt av Mars senere (se beslutningsloggen).
- **teknisk-anbefaling** – Claudes anbefaling for å oppfylle et vedtatt krav. Kan endres uten produktbeslutning, men endringen logges.

## Krav per kapittel

### Kapittel 1

#### REQ-0001 – Fullverdig filmproduksjonsmiljø fra manus til film
Animatic Studio skal være en profesjonell applikasjon for utvikling, planlegging, visualisering, produksjon, versjonering og sammenstilling av film, og skal gjøre det mulig å utvikle en film fra første manusutkast til ferdig sammenstilt materiale.

- **Kilde:** Kap. 1 (l. 7, 24) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P1 · **Fase:** –
- **Moduler:** CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et nytt prosjekt, når brukeren importerer et manus, bygger scener, legger lyd og montering, så kan en ferdig sammenstilt film eksporteres fra samme prosjekt uten å forlate applikasjonen.
- **Tester:**
  - e2e: manus-til-eksport-arbeidsflyt i ett prosjekt
- **Merknad:** Overordnet formål; konkretiseres i senere kapitler.

#### REQ-0002 – Produktets funksjonsomfang
Programmet skal kombinere: profesjonell manusbehandling; automatisk scenedeteksjon og produksjonsanalyse; globale biblioteker for karakterer, objekter og lokasjoner; en redigerbar, lagbasert 2D-sceneeditor; kameraanimasjon basert på tradisjonell multiplan-teknikk; tidslinje for bilde, lyd, dialog og bevegelser; automatisk generering av presise instruksjoner til ulike AI-modeller; integrasjon med eksterne bilde-, lyd- og videogenereringstjenester; en selvstendig animatic-motor som ikke er avhengig av AI; profesjonell versjons- og kontinuitetskontroll; renderingskø og bakgrunnsproduksjon; flerspråklig manus, dialog og filmeksport; avledede produksjoner, kortfilmer og spinoffer; presentasjonsmateriell, pitchplakater og karakterkart; ferdig sammenstilling og eksport av filmer.

- **Kilde:** Kap. 1 (l. 8-23) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** –
- **Moduler:** CORE, SCRIPT, LIBRARY, COMPOSE, CAMERA, TIMELINE, AUDIO, PROMPT, PROVIDER, VERSION, CONTINUITY, QUEUE, L10N, PRESENT, EXPORT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert av de 15 punktene kan spores til minst ett detaljkrav og en fase i utviklingsplanen.
- **Tester:**
  - manuell: sporbarhetsmatrise punkt → krav → fase
- **Merknad:** Paraplykrav/omfangsliste; hvert punkt detaljeres i senere kapitler. Fasene fordeler punktene over fase 1–8.

#### REQ-0003 – Import av eksisterende filmmateriale
Eksisterende filmmateriale skal kunne importeres og inngå i produksjonen.

- **Kilde:** Kap. 1 (l. 24) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, LIBRARY
- **Avhengigheter:** REQ-0098; REQ-0100
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en videofil med ferdig film, når den importeres, så kan den plasseres på filmtidslinjen og knyttes til en scene/manuspassasje.
- **Tester:**
  - import/eksport: import av videofil og plassering i montering
- **Merknad:** Jf. kap. 34 pkt. 15 (ferdig film skal kunne importeres og knyttes til manuspassasjer).

#### REQ-0004 – Fungerer fullt uten generativ AI
Programmet skal ikke bare være et grensesnitt mot AI-tjenester, men et fullverdig produksjonsmiljø som fungerer selv når brukeren ikke ønsker å bruke generativ AI.

- **Kilde:** Kap. 1 (l. 25) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, COMPOSE, TIMELINE, EXPORT · **Invarianter:** INV-11
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at ingen AI-leverandør er konfigurert, så kan brukeren importere manus, bygge 2D-scener, spille av animatic og eksportere film og manus.
- **Tester:**
  - e2e: full arbeidsflyt med alle AI-adaptere deaktivert

#### REQ-0005 – Offisielt produktnavn er Animatic Studio
Produktets eneste offisielle navn er «Animatic Studio». «AI Animatic Studio» skal ikke brukes som produktnavn. Betegnelser som AI-generering, AI-modeller, AI-integrasjoner og AI-kvalitetskontroll kan brukes når funksjonaliteten beskrives, men skal ikke være del av selve produktnavnet.

- **Kilde:** Kap. 1.1 (l. 27-30) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** UI
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Ingen brukerflate, vindustittel, metadata, eksport eller dokumentasjon bruker «AI Animatic Studio» som navn.
- **Tester:**
  - enhet: søk i kildekode/ressursfiler etter strengen «AI Animatic Studio» gir null treff
- **Implementering:** src/app/shell/AppHeader.tsx, src/app/auth/AuthScreen.tsx
- **Merknad:** Jf. kap. 34 pkt. 1.

#### REQ-0006 – Første versjon utvikles i Lovable
Den første versjonen skal utvikles med utgangspunkt i Lovable.

- **Kilde:** Kap. 1.2 (l. 32) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** PROCESS, CORE
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Første versjon kjører som Lovable-prosjekt (web), eventuelt med tilknyttede backend-tjenester.
- **Tester:**
  - manuell: verifiser at MVP er bygd og publisert via Lovable
- **Implementering:** package.json

#### REQ-0007 – Portabilitet til macOS og Windows
Løsningen skal arkitekteres slik at kjernefunksjonalitet, datamodell, genereringsmotor, mediebehandling og produksjonslogikk kan flyttes til eller gjenbrukes i senere desktop-versjoner for macOS og Windows.

- **Kilde:** Kap. 1.2 (l. 33-34) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, PROMPT, COMPOSE, TIMELINE
- **Avhengigheter:** REQ-0009
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Domene-, datamodell-, generering- og produksjonslogikk ligger i moduler uten avhengighet til nettleser-API-er eller Lovable-spesifikke biblioteker.
- **Tester:**
  - enhet: kjernemoduler kan kjøres/testes i et ikke-nettleser-miljø (f.eks. Node) uten DOM
- **Implementering:** src/core/
- **Merknad:** Linje 33 og 34 er duplikater. Jf. kap. 34 pkt. 28.

#### REQ-0008 – Unngå unødvendige plattformbindinger
Løsningen skal unngå unødvendige plattformbindinger.

- **Kilde:** Kap. 1.2 (l. 35) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE
- **Avhengigheter:** REQ-0007
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver plattformspesifikk avhengighet er isolert bak et grensesnitt og dokumentert med begrunnelse.
- **Tester:**
  - manuell: arkitekturgjennomgang av avhengighetsliste

#### REQ-0009 – Tydelig lagdeling av arkitekturen
Arkitekturen skal skille tydelig mellom: 1) domene- og datamodell, 2) brukergrensesnitt, 3) medie- og animasjonsmotor, 4) AI-integrasjoner, 5) renderingskø og jobborkestrering, 6) lagring og versjonering, 7) eksport og filbehandling.

- **Kilde:** Kap. 1.2 (l. 36-43) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, UI, COMPOSE, PROVIDER, QUEUE, VERSION, SECURITY, EXPORT
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Kodebasen har adskilte moduler for hvert av de sju lagene, og UI-laget aksesserer domenet kun via definerte grensesnitt.
- **Tester:**
  - enhet: avhengighetsregler (f.eks. lint/import-regler) hindrer at domenemodellen importerer UI- eller leverandørkode
- **Implementering:** src/core/, src/adapters/, src/app/
- **Merknad:** Jf. modulinndelingen i kap. 31.

#### REQ-0010 – Backend-tjenester for tunge medieoperasjoner
Det skal ikke antas at Lovable alene kan utføre alle tunge medieoperasjoner eller langvarige bakgrunnsjobber; nødvendige backend-tjenester eller separate komponenter skal foreslås der dette er teknisk riktig.

- **Kilde:** Kap. 1.2 (l. 44) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** QUEUE, CORE, PROCESS
- **Avhengigheter:** REQ-0009
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentet angir for hver tung operasjon (rendering, transkoding, lange genereringsjobber) om den kjøres i nettleser, backend eller egen tjeneste, med begrunnelse.
- **Tester:**
  - manuell: arkitekturgjennomgang

#### REQ-0011 – Overordnede designkvaliteter
Animatic Studio skal være profesjonelt, elegant, filmisk, oversiktlig, effektivt, ikke-destruktivt, modulært, pålitelig og brukerstyrt.

- **Kilde:** Kap. 1.3 (l. 46-55) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** –
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Designprinsippene er dokumentert i designsystemet og brukes som kriterier i UX-gjennomganger.
- **Tester:**
  - manuell: heuristisk UX-evaluering mot de ni kvalitetene
- **Merknad:** «Ikke-destruktivt» konkretiseres i kap. 2.2.

#### REQ-0012 – Sofistikert, gjerne mørk visuell utforming
Grensesnittet skal ha en sofistikert, moderne og gjerne mørk visuell utforming som passer en profesjonell filmproduksjon.

- **Kilde:** Kap. 1.3 (l. 56) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** UI
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Standardtemaet er et mørkt tema egnet for filmproduksjon, definert som design-tokens.
- **Tester:**
  - visuell: skjermbildegjennomgang av hovedvisninger i standardtema
- **Implementering:** src/styles.css
- **Merknad:** «Gjerne mørk» er en preferanse, ikke absolutt krav.

#### REQ-0013 – Troverdig kreativt verktøy, ikke chatbot
Grensesnittet skal oppleves som et troverdig kreativt arbeidsverktøy, ikke som en generell chatbot eller en samling tilfeldige AI-funksjoner.

- **Kilde:** Kap. 1.3 (l. 57) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** –
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hovedarbeidsflatene er manus, tidslinje, sceneeditor og bibliotek; AI-funksjoner er integrert i disse og ikke presentert som et chatgrensesnitt.
- **Tester:**
  - manuell: brukertest med filmarbeidere

#### REQ-0014 – Brukergrensesnitt på norsk
Brukergrensesnittet skal støtte norsk.

- **Kilde:** Kap. 1.3 (l. 58) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, L10N
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle brukervendte tekster i grensesnittet finnes på norsk.
- **Tester:**
  - enhet: alle UI-strengnøkler har norsk oversettelse

#### REQ-0015 – Systeminstruksjoner og prompter på engelsk
Tekniske systeminstruksjoner og genereringsprompter til AI-modeller skal som hovedregel skrives på engelsk for presisjon og kompatibilitet.

- **Kilde:** Kap. 1.3 (l. 59) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et norsk manus, når en genereringsprompt bygges, så er prompten på engelsk med mindre brukeren eksplisitt har valgt annet.
- **Tester:**
  - enhet: promptbygger produserer engelskspråklig tekst for norsk kildemateriale
- **Merknad:** «Som hovedregel» – unntak tillatt. Jf. kap. 34 pkt. 12.

### Kapittel 2

#### REQ-0016 – Én felles strukturert prosjektmodell
Prinsippet om at manus og film er to visninger av den samme produksjonen har høyeste prioritet og skal styre alle senere tekniske valg. Manus, animatic, film, 2D-animasjon, lyd og aktiv filmtidslinje skal være koblet til én felles, strukturert prosjektmodell, og skal ikke utvikles som uavhengige dokumenter som forsøker å holde seg synkronisert i ettertid.

- **Kilde:** Kap. 2 (l. 62-66) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, SCRIPT, TIMELINE, COMPOSE, AUDIO · **Invarianter:** INV-01
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Manusvisning og filmtidslinje leser scenerekkefølge og aktivstatus fra samme datastruktur (sceneforekomster), ikke fra separate kopier.
  - Hver ADR og teknisk DEC dokumenterer at valget er forenlig med INV-01.
- **Tester:**
  - enhet: datamodellen har én kilde for scenerekkefølge per produksjon
  - integrasjon: endring via manus-API er umiddelbart synlig via tidslinje-API uten synkroniseringsjobb
- **Implementering:** src/core/model.ts, src/core/views.ts
- **Merknad:** Høyeste prioritet i mandatet. Linje 64 og 65 er duplikater. Jf. kap. 34 pkt. 2.

#### REQ-0017 – Flytting i manus flytter i film
Når en scene flyttes i manuset, skal den også flyttes i filmens aktive rekkefølge.

- **Kilde:** Kap. 2 (l. 67) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** SCRIPT, TIMELINE, CORE · **Invarianter:** INV-01, INV-03
- **Avhengigheter:** REQ-0016
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt scenene A, B, C, når B flyttes etter C i manuset, så er filmens aktive rekkefølge A, C, B.
- **Tester:**
  - integrasjon: flytt i manus → verifiser tidslinjerekkefølge
- **Implementering:** src/core/commands/apply.ts#MoveOccurrence, src/core/views.ts, src/app/script/SceneNavigator.tsx

#### REQ-0018 – Flytting i tidslinje flytter i manus
Når en scene flyttes i filmens overordnede tidslinje, skal manuset vise tilsvarende rekkefølge.

- **Kilde:** Kap. 2 (l. 68) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT, CORE · **Invarianter:** INV-01, INV-03
- **Avhengigheter:** REQ-0016
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt scenene A, B, C, når C flyttes først i tidslinjen, så viser manuset C, A, B.
- **Tester:**
  - integrasjon: flytt i tidslinje → verifiser manusrekkefølge

#### REQ-0019 – Deaktivering utelater overalt
Når en scene eller delsekvens deaktiveres, skal den utelates fra både aktiv manusvisning, filmavspilling, spilletidsberegning og eksport.

- **Kilde:** Kap. 2 (l. 69) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** CORE, SCRIPT, TIMELINE, EXPORT · **Invarianter:** INV-01, INV-14
- **Avhengigheter:** REQ-0016
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en deaktivert scene, så vises den ikke i aktiv manusvisning, spilles ikke av, inngår ikke i total spilletid og inngår ikke i eksport (med mindre eksportvalg eksplisitt inkluderer den, jf. REQ-0085).
- **Tester:**
  - integrasjon: deaktiver scene og verifiser alle fire konsumenter
- **Implementering:** src/core/views.ts, src/core/screenplay/numbering.ts, src/app/script/SceneNavigator.tsx

#### REQ-0020 – Skjult materiale slettes ikke
Skjult materiale skal ikke slettes, men kunne gjenaktiveres senere.

- **Kilde:** Kap. 2 (l. 70) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** CORE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0019
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en deaktivert scene med tilknyttet materiale, når den gjenaktiveres, så er alt innhold og materiale uendret tilbake.
- **Tester:**
  - dataintegritet: deaktiver/gjenaktiver rundtur bevarer alle relasjoner
- **Implementering:** src/core/commands/apply.ts#SetOccurrenceActive

#### REQ-0021 – Skille UI-skjuling og produksjonsdeaktivering
Programmet skal skille mellom midlertidig skjuling av et grensesnittelement og produksjonsmessig deaktivering av en scene. Bare produksjonsmessig deaktivering skal endre filmens aktive innhold.

- **Kilde:** Kap. 2 (l. 71-74) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** CORE, UI · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0019
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at brukeren skjuler/kollapser en scene i visningen, så endres ikke filmens aktive innhold eller spilletid.
  - Gitt at brukeren deaktiverer scenen produksjonsmessig, så endres aktivt innhold.
- **Tester:**
  - enhet: visningstilstand og produksjonstilstand er separate felt

#### REQ-0022 – Skille strukturell og innholdsmessig synkronisering
Systemet skal skille mellom strukturell synkronisering (scener, delsekvenser, rekkefølge, synlighet og aktiv filmmontering stemmer alltid overens) og innholdsmessig synkronisering (eksisterende animatic eller film er produsert fra en bestemt versjon av manus og ressurser).

- **Kilde:** Kap. 2.1 (l. 76-78) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, VERSION · **Invarianter:** INV-01, INV-07
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Hvert produsert materiale lagrer referanse til manusversjon og ressursversjoner det er produsert fra, adskilt fra strukturell plassering.
- **Tester:**
  - enhet: datamodell har separate felt for struktur og kildeversjon
- **Implementering:** src/core/views.ts#outdatedTakes

#### REQ-0023 – Strukturell synkronisering er automatisk
Strukturell synkronisering skal opprettholdes automatisk.

- **Kilde:** Kap. 2.1 (l. 79) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0016
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Ingen brukerhandling er nødvendig for at manus og film skal ha samme struktur etter en strukturendring.
- **Tester:**
  - integrasjon: tilfeldige strukturoperasjoner (property-based) → manus- og filmstruktur er alltid like
- **Implementering:** src/core/views.ts, src/core/commands/apply.ts

#### REQ-0024 – Produsert materiale endres ikke ved manusendring
Hvis manusinnhold endres etter at film er produsert, skal eksisterende materiale ikke endres automatisk.

- **Kilde:** Kap. 2.1 (l. 80) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0022
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en scene med produsert film, når dialogen endres, så er filmklippet og dets metadata byte-identisk uendret.
- **Tester:**
  - dataintegritet: hash av produsert materiale før/etter manusendring
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes

#### REQ-0025 – Flagging av innhold ute av synk
Når manusinnhold endres etter at film er produsert, skal eksisterende materiale flagges som potensielt ute av synkronisering.

- **Kilde:** Kap. 2.1 (l. 80) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** VERSION, CORE · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0022
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med produsert materiale, når manusinnholdet endres, så får materialet status «potensielt ute av synk» synlig i oversikt og tidslinje.
- **Tester:**
  - integrasjon: manusendring → avviksflagg opprettes
- **Merknad:** Jf. kap. 34 pkt. 7. Fullstendig avviksdeteksjon er fase 6, men grunnflagget bør finnes tidlig.

#### REQ-0026 – Brukeren bestemmer ved avvik
Ved innholdsavvik skal brukeren bestemme hva som skal skje med eksisterende materiale.

- **Kilde:** Kap. 2.1 (l. 81) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0025
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et flagget avvik, så kan brukeren velge å godkjenne avviket, oppdatere materialet eller angre endringen.
- **Tester:**
  - e2e: håndter avvik med hvert av de tre valgene
- **Merknad:** Valgene er hentet fra kap. 34 pkt. 8.

#### REQ-0027 – Ingen automatisk sletting av film
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk slette eksisterende film.

- **Kilde:** Kap. 2.2 (l. 83-84) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE · **Invarianter:** INV-07, INV-13
- **Status:** Verifisert
- **Akseptansekriterier:**
  - For hver av de fire endringstypene: eksisterende filmklipp finnes fortsatt etter endringen.
- **Tester:**
  - dataintegritet: parametrisert test over endringstypene
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes

#### REQ-0028 – Ingen automatisk overskriving av godkjente ressurser
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk overskrive godkjente ressurser.

- **Kilde:** Kap. 2.2 (l. 83, 85) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, LIBRARY · **Invarianter:** INV-13
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Godkjente ressursversjoner er uforanderlige; endring skaper alltid en ny versjon.
- **Tester:**
  - dataintegritet: forsøk på å skrive til godkjent ressursversjon avvises

#### REQ-0029 – Ingen automatisk betalt AI-generering
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk bestille en betalt AI-generering.

- **Kilde:** Kap. 2.2 (l. 83, 86) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** QUEUE, QUALITYCOST, PROVIDER · **Invarianter:** INV-12
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen genereringsjobb mot betalt leverandør opprettes uten en eksplisitt brukerinitiert bestilling/godkjenning.
- **Tester:**
  - integrasjon: endringshendelser utløser ingen kall mot leverandøradaptere (mock)

#### REQ-0030 – Ingen automatisk bytte av aktiv sceneversjon
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk erstatte aktiv sceneversjon.

- **Kilde:** Kap. 2.2 (l. 83, 87) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, TIMELINE · **Invarianter:** INV-07
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Aktiv sceneversjon-ID er uendret etter hver av de fire endringstypene.
- **Tester:**
  - enhet: aktiv versjon endres kun via eksplisitt brukerkommando
- **Implementering:** src/core/commands/apply.ts

#### REQ-0031 – Ingen automatisk endring av annen produksjon
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk endre en annen produksjon.

- **Kilde:** Kap. 2.2 (l. 83, 88) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-04
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt hovedfilm og spinoff som deler en scene, når scenen endres i spinoffen, så er hovedfilmens sceneforekomst/variant uendret.
- **Tester:**
  - dataintegritet: endring i produksjon X gir ingen diff i produksjon Y
- **Implementering:** src/core/commands/apply.ts#assertCanEditVariant, src/core/invariants.ts

#### REQ-0032 – Historiske manusversjoner bevares
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk ødelegge en historisk manusversjon.

- **Kilde:** Kap. 2.2 (l. 83, 89) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Historiske manusversjoner er uforanderlige snapshots som kan åpnes og eksporteres identisk etter senere endringer.
- **Tester:**
  - dataintegritet: hash av historisk versjon er uendret etter senere redigering

#### REQ-0033 – Vesentlige oppdateringer sporbare og reverserbare
All vesentlig oppdatering skal være sporbar, reverserbar og brukerinitiert.

- **Kilde:** Kap. 2.2 (l. 90) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE · **Invarianter:** INV-08
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Hver vesentlig oppdatering logges med hvem/når/hva, kan reverseres, og er initiert av en brukerhandling.
- **Tester:**
  - integrasjon: endringslogg og reversering for hver oppdateringstype
- **Implementering:** db/migrations/0001_core.sql#change_log, src/core/commands/apply.ts
- **Merknad:** Jf. kap. 34 pkt. 27. «Vesentlig» er ikke definert – se OPEN_QUESTIONS B («Vesentlig oppdatering» = alle kommandoer i change_log, ADR-0005).

### Kapittel 3

#### REQ-0034 – Permanent intern scene-ID
Hver scene skal ha en permanent intern identifikator som ikke endres når scenen flyttes, omdøpes, får endret sceneoverskrift, får nytt scenenummer, skjules, gjenbrukes i en spinoff, inngår i en ny manusversjon eller får nytt produsert materiale.

- **Kilde:** Kap. 3.1 (l. 94-102) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-02, INV-03
- **Status:** Verifisert
- **Akseptansekriterier:**
  - For hver av de åtte operasjonene er scenens interne ID uendret etter operasjonen.
- **Tester:**
  - enhet: parametrisert test over de åtte operasjonene
- **Implementering:** src/core/ids.ts, src/core/model.ts
- **Merknad:** Jf. kap. 34 pkt. 3.

#### REQ-0035 – Scenenumre og versjon som egne attributter
Systemet skal for en scene kunne holde intern scene-ID (f.eks. scn_7f42a9), opprinnelig scenenummer (f.eks. 42), gjeldende eksportnummer (f.eks. 45) og aktiv produksjonsversjon (f.eks. render_183) som separate attributter.

- **Kilde:** Kap. 3.1 (l. 103-108) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, VERSION · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0034
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En scene kan ha opprinnelig nummer 42 og eksportnummer 45 samtidig, uten at ID endres.
- **Tester:**
  - enhet: datamodell-skjema inneholder de fire feltene adskilt
- **Merknad:** Utledet fra eksempelet. Linje 107 og 108 er duplikater.

#### REQ-0036 – Relasjoner bruker scene-ID, aldri scenenummer
Den interne sceneidentiteten skal brukes i alle relasjoner, aldri scenenummeret som vises i manuset.

- **Kilde:** Kap. 3.1 (l. 109) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0034
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Ingen fremmednøkkel/relasjon i datamodellen refererer til scenenummer.
- **Tester:**
  - enhet: skjemaanalyse – alle scenereferanser peker på scene-ID
  - integrasjon: omnummerering bryter ingen relasjoner
- **Implementering:** src/core/model.ts, db/migrations/0001_core.sql

#### REQ-0037 – Stabile identifikatorer for alle domeneobjekter
Separate, stabile identifikatorer skal finnes for: prosjekt, produksjon, manusversjon, manusscene, manusblokk, replikk, produksjonsdelsekvens, sceneforekomst i en bestemt produksjon, karakter, karakterens utseendetilstand, visuell stilvariant, objekt eller rekvisitt, lokasjon eller miljø, lydressurs, medieressurs, genereringsjobb, genereringsprompt, sceneversjon, filmmontering, plakat og eksportversjon.

- **Kilde:** Kap. 3.2 (l. 111-132) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-02
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Hver av de 21 entitetstypene har et uforanderlig ID-felt.
- **Tester:**
  - enhet: skjemavalidering av ID-felt for alle 21 typer
- **Implementering:** src/core/ids.ts

#### REQ-0038 – ID-er uavhengige av navn, språk og plassering
Identifikatorene skal være uavhengige av navn, språk, plassering og synlige løpenumre.

- **Kilde:** Kap. 3.2 (l. 133) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0037
- **Status:** Verifisert
- **Akseptansekriterier:**
  - ID-er genereres som opake verdier (f.eks. UUID/prefiks+tilfeldig) og endres ikke ved omdøping, oversettelse, flytting eller omnummerering.
- **Tester:**
  - enhet: ID-generator inneholder ingen avledning fra navn/posisjon
- **Implementering:** src/core/ids.ts

#### REQ-0039 – Skille scene, sceneforekomst og scenevariant
Datamodellen skal skille mellom scene (permanent identifisert narrativ enhet), sceneforekomst (hvordan en scene brukes i en bestemt produksjon, inkludert plassering, synlighet, tidsutdrag og aktiv versjon) og scenevariant (redigert eller alternativ utgave av scenen som kan være unik for én produksjon).

- **Kilde:** Kap. 3.3 (l. 135-140) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0037
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Plassering, synlighet, tidsutdrag og aktiv versjon lagres på sceneforekomsten, ikke på scenen.
- **Tester:**
  - enhet: skjema har tre separate entiteter med riktige felt
- **Implementering:** src/core/model.ts, db/migrations/0001_core.sql
- **Merknad:** Linje 137/138 og 139/140 er duplikater.

#### REQ-0040 – Gjenbruk av scene uten delte redaksjonelle endringer
Samme scene skal kunne brukes i flere produksjoner uten at de automatisk deler alle redaksjonelle endringer.

- **Kilde:** Kap. 3.3 (l. 141) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0039
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt scene S i produksjon P1 og P2, når S redigeres som variant i P2, så er S i P1 uendret.
- **Tester:**
  - dataintegritet: variantredigering isolert per produksjon
- **Implementering:** src/core/commands/apply.ts#ForkVariant

#### REQ-0041 – Transaksjonelle strukturoperasjoner
Operasjoner som påvirker flere deler av prosjektmodellen skal gjennomføres som konsistente endringer, særlig flytting av scener, aktivering og deaktivering, splitting og sammenslåing, endring av manusstruktur, overføring mellom produksjoner og endring av aktiv filmversjon.

- **Kilde:** Kap. 3.4 (l. 143-150) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-01
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en feil midt i en av de seks operasjonene, så rulles hele operasjonen tilbake og modellen er i forrige konsistente tilstand.
- **Tester:**
  - integrasjon: feilinjeksjon under hver operasjonstype → ingen delvis tilstand
- **Implementering:** db/migrations/0001_core.sql#apply_changes, src/adapters/storage/commands.functions.ts

#### REQ-0042 – Angre/gjør om for strukturoperasjoner
De transaksjonelle strukturoperasjonene skal støtte angre og gjør om.

- **Kilde:** Kap. 3.4 (l. 151) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0041
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - For hver operasjonstype: utfør → angre gir identisk modell som før; gjør om gir identisk modell som etter.
- **Tester:**
  - enhet: undo/redo-rundtur for alle seks operasjonstyper
- **Implementering:** src/core/commands/apply.ts#inverse

#### REQ-0043 – Manus og film kan aldri divergere strukturelt
Systemet skal ikke kunne ende i en tilstand der manus og film har forskjellige aktive scenestrukturer.

- **Kilde:** Kap. 3.4 (l. 152) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0016; REQ-0041
- **Status:** Verifisert
- **Akseptansekriterier:**
  - En konsistenssjekk av aktiv manusstruktur mot aktiv filmstruktur lykkes etter enhver sekvens av operasjoner, inkludert angre/gjør om.
- **Tester:**
  - integrasjon: property-based test med tilfeldige operasjonssekvenser
- **Implementering:** src/core/views.ts, db/migrations/0001_core.sql

### Kapittel 4

#### REQ-0044 – Import av manusdokumenter
Programmet skal kunne importere eksisterende manusdokumenter, særlig DOCX og relevante profesjonelle manusformater.

- **Kilde:** Kap. 4.1 (l. 156) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt det engelske referansemanuset (DOCX), når det importeres, så opprettes en strukturert manusversjon.
  - Gitt det norske referansemanuset (PDF fra Final Draft 11), når det importeres, så opprettes en strukturert manusversjon.
- **Tester:**
  - import/eksport: import av referansemanus DOCX og PDF
- **Implementering:** src/engine/import/docx-lines.ts, src/app/script/ImportDialog.tsx, src/engine/import/browser.ts, src/engine/import/pdf-lines.ts
- **Merknad:** Referansen «DEL 2.docx» er erstattet av hele norsk manus (PDF, Final Draft 11, 106 s., US Letter) og hele engelsk manus (DOCX). PDF-import er dermed i praksis nødvendig; se DEC-0013 (PDF-import).

#### REQ-0045 – Referansemanus som formatreferanse
Ved utvikling skal et konkret referansemanus brukes som eksempel på forventet manusformat.

- **Kilde:** Kap. 4.1 (l. 157) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** PROCESS, SCRIPT
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Parser- og layouttester bruker referansemanusene som testfixtures.
- **Tester:**
  - manuell: testsuite inneholder referansemanus som fixtures
- **Implementering:** src/core/screenplay/paginate.ts, src/core/screenplay/parse.ts
- **Merknad:** Opprinnelig «DEL 2.docx»; erstattet (bekreftet 2026-10-08) av hele norsk manus (PDF, 96 nummererte scener med hull opp til 109 og minst én unummerert scene) og hele engelsk manus (DOCX).

#### REQ-0046 – Gjenkjenning av profesjonelle manuselementer
Import skal håndtere manus med nummererte scener, sceneoverskrifter med INT./EXT., lokasjon og tidspunkt, handlingsbeskrivelser, karakterbetegnelser, innrykket dialog, parentetiske instruksjoner, betegnelser som CONT'D og O.S., samt sidetall og profesjonell manuslayout – inkludert sceneoverskrifter med scenenummer på begge sider, f.eks. «31 EXT. VED MELKERAMPA - KVELD 31».

- **Kilde:** Kap. 4.1 (l. 158-172) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0044
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt referansemanuset, så klassifiseres hver linje korrekt som sceneoverskrift, handling, karakter, dialog, parentetisk, overgang e.l., og CONT'D/O.S. tolkes som utvidelser og ikke som del av karakternavnet.
- **Tester:**
  - enhet: parser-fixtures for hvert elementtype
  - import/eksport: elementklassifisering mot fasit for referansemanus
- **Implementering:** src/core/screenplay/parse.ts
- **Merknad:** Opprinnelig beskrevet for «DEL 2.docx»; gjelder fortsatt for nye referansemanus.

#### REQ-0047 – Manusdeler som starter/slutter midt i scene
Programmet må håndtere manusdeler som starter eller slutter midt i en scene.

- **Kilde:** Kap. 4.1 (l. 177-178) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0044
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt et manusutdrag som begynner med fortsettelse av en scene, så importeres teksten uten tap og uten at det opprettes en fiktiv scene.
- **Tester:**
  - import/eksport: fixture som starter midt i scene og slutter midt i scene
- **Implementering:** src/core/screenplay/plan.ts, src/core/screenplay/parse.ts
- **Merknad:** Se også REQ-0060 (passasjer før første sceneoverskrift).

#### REQ-0048 – Uregelmessige scenenumre uten oppdiktede scener
Programmet må håndtere manglende eller uregelmessige scenenumre uten å finne opp nye scener.

- **Kilde:** Kap. 4.1 (l. 179) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0044
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt det norske referansemanuset med 96 nummererte scener med hull opp til 109 og minst én unummerert scene, så importeres nøyaktig de scenene som finnes (inkl. den unummererte), og numrene bevares som de står.
- **Tester:**
  - import/eksport: antall scener og originalnumre mot fasit
- **Implementering:** src/core/screenplay/parse.ts
- **Merknad:** Referansemanusets kjente egenskaper (hull opp til 109, unummerert scene) brukt i akseptanse.

#### REQ-0049 – Be om manglende referansefiler
Hvis referansemanuset ikke er tilgjengelig i Claude-prosjektet, skal det bes om at det legges ved som formatreferanse; det skal ikke antas at filen automatisk følger med prosjektmandatet.

- **Kilde:** Kap. 4.1 (l. 180) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Før parserarbeid starter er referansemanusene bekreftet tilgjengelige, eller brukeren er bedt om dem.
- **Tester:**
  - manuell: prosesssjekk
- **Merknad:** Opprinnelig om «DEL 2.docx»; gjelder nå de erstattende norske (PDF) og engelske (DOCX) manusene.

#### REQ-0050 – Originaltro profesjonell manusvisning
Manuset skal vises slik et profesjonelt filmmanus vises, og følgende skal bevares eller rekonstrueres korrekt: sideformat, marger, skrifttype og størrelse, linjeavstand, innrykk, dialogkolonner, sceneoverskrifter, scenenumre, sidetall, parentetiske instruksjoner, og linje- og sideskift etter gjeldende manusregler.

- **Kilde:** Kap. 4.2 (l. 182-194) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, UI
- **Avhengigheter:** REQ-0044
- **Status:** Implementert – ikke verifisert
- **Akseptansekriterier:**
  - Gitt det importerte norske referansemanuset (US Letter), så gir manusvisningen samme sideantall (106) og samme sideskift som originalen innenfor definert toleranse.
- **Tester:**
  - visuell: side-ved-side-sammenligning mot original-PDF
  - enhet: pagineringsmotor mot fasit
- **Implementering:** src/core/screenplay/script-pages.ts, src/app/script/ScriptPageView.tsx

#### REQ-0051 – Manusvisning er ikke notat/tabell/kort
Manusvisningen skal ikke erstattes av en vanlig notateditor, en tabell eller en kortvisning.

- **Kilde:** Kap. 4.2 (l. 195) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, UI
- **Avhengigheter:** REQ-0050
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Hovedmanusvisningen er en paginert manusside-visning; eventuelle tabell-/kortvisninger er tilleggsvisninger.
- **Tester:**
  - manuell: UX-gjennomgang
- **Implementering:** src/app/script/ScriptPageView.tsx

#### REQ-0052 – Korrekt ombrytning og paginering ved redigering
Ved redigering skal tekst ombrytes og pagineres korrekt etter filmmanusregler.

- **Kilde:** Kap. 4.2 (l. 196) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0050
- **Status:** Implementert – ikke verifisert
- **Akseptansekriterier:**
  - Gitt en replikk som forlenges over sideskift, så brytes den med (MORE)/(CONT'D) etter manusregler og etterfølgende sider repagineres.
- **Tester:**
  - enhet: pagineringsregler (dialogbrudd, sceneoverskrift ikke nederst på side o.l.)
- **Implementering:** src/core/screenplay/paginate.ts

#### REQ-0053 – Originaldokumentet bevares uendret
Originaldokumentet skal bevares uendret som historisk referanse.

- **Kilde:** Kap. 4.2 (l. 197) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, VERSION, SECURITY
- **Avhengigheter:** REQ-0044
- **Status:** Implementert – ikke verifisert
- **Akseptansekriterier:**
  - Importert originalfil lagres med hash og kan lastes ned byte-identisk etter vilkårlige redigeringer.
- **Tester:**
  - dataintegritet: hash av originalfil før/etter redigering
- **Implementering:** db/migrations/0002_import_profiles.sql, src/app/script/ImportDialog.tsx

#### REQ-0054 – Analyse ødelegger ikke visuell gjengivelse
Intern analyse og strukturering av manuset skal ikke ødelegge den visuelle gjengivelsen.

- **Kilde:** Kap. 4.2 (l. 198) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0050
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt et importert manus, når scenedeteksjon/strukturering kjøres, så er visningen uendret i layout.
- **Tester:**
  - visuell: regresjonstest av manusvisning før/etter analyse
- **Implementering:** src/core/screenplay/parse.ts

#### REQ-0055 – Automatisk tolkning av manusstruktur ved import
Når et manus importeres, skal systemet automatisk identifisere scener, lese scenenumre, identifisere sceneoverskrifter, registrere lokasjoner, registrere tidspunkt og identifisere dialog, handling og karakterer.

- **Kilde:** Kap. 4.3 (l. 200-206) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, LIBRARY
- **Avhengigheter:** REQ-0044
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt referansemanuset, så har hver scene registrert nummer, overskrift, lokasjon og tidspunkt, og karakterlisten samsvarer med fasit.
- **Tester:**
  - import/eksport: deteksjonspresisjon mot fasit
- **Implementering:** src/core/screenplay/parse.ts
- **Merknad:** Punkt 1–6 i listen.

#### REQ-0056 – Permanente scene-ID-er opprettes ved import
Ved manusimport skal systemet automatisk opprette permanente sceneidentiteter.

- **Kilde:** Kap. 4.3 (l. 207) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0034; REQ-0055
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Hver detektert scene har en intern ID uavhengig av scenenummeret.
- **Tester:**
  - enhet: importer oppretter ID per scene
- **Implementering:** src/core/screenplay/plan.ts, src/core/commands/apply.ts#ImportScreenplay
- **Merknad:** Punkt 7.

#### REQ-0057 – Strukturert manuskopi ved import
Ved manusimport skal systemet automatisk opprette en strukturert manuskopi.

- **Kilde:** Kap. 4.3 (l. 208) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0053; REQ-0055
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Etter import finnes både uendret original og en strukturert (blokkbasert) manusversjon.
- **Tester:**
  - enhet: import gir to adskilte representasjoner
- **Implementering:** db/migrations/0002_import_profiles.sql, src/core/screenplay/plan.ts
- **Merknad:** Punkt 8.

#### REQ-0058 – Markering av usikre tolkninger
Ved manusimport skal systemet markere usikre tolkninger.

- **Kilde:** Kap. 4.3 (l. 209) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, UI
- **Avhengigheter:** REQ-0055
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en tvetydig linje (f.eks. sceneoverskrift uten INT./EXT.), så markeres tolkningen som usikker og vises i en gjennomgangsliste.
- **Tester:**
  - enhet: tvetydige fixtures gir usikkerhetsflagg
- **Implementering:** src/app/script/Inspector.tsx, src/app/script/ScriptPageView.tsx, src/core/screenplay/parse.ts
- **Merknad:** Punkt 9.

#### REQ-0059 – Manuell korrigering av scenedeteksjon
Brukeren skal kunne korrigere feilaktig scenedeteksjon manuelt.

- **Kilde:** Kap. 4.3 (l. 210) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, UI · **Invarianter:** INV-03
- **Avhengigheter:** REQ-0055
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Brukeren kan endre elementtype på en linje, slå sammen feilaktig delte scener og dele feilaktig sammenslåtte scener etter import.
- **Tester:**
  - e2e: korriger deteksjonsfeil
- **Implementering:** src/core/commands/apply.ts#SetBlockKind,EditSceneHeading,SetUncertainty,SplitScene,MergeScenes, src/app/script/Inspector.tsx

#### REQ-0060 – Passasjer før første sceneoverskrift
Manuspassasjer før første sceneoverskrift skal bevares og kunne kobles til en tidligere scene.

- **Kilde:** Kap. 4.3 (l. 211) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0047
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt tekst før første sceneoverskrift, så bevares den som egen blokk og kan kobles til en eksisterende scene.
- **Tester:**
  - import/eksport: fixture med innledende scenefortsettelse
- **Implementering:** src/core/screenplay/plan.ts, src/app/script/ImportDialog.tsx

#### REQ-0061 – Opprette scener
Brukeren skal kunne opprette scener.

- **Kilde:** Kap. 4.4 (l. 213-214) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-01
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Ny scene får permanent ID og vises i både manus og filmstruktur.
- **Tester:**
  - integrasjon: opprett scene
- **Implementering:** src/app/script/Inspector.tsx, src/core/commands/apply.ts#CreateScene

#### REQ-0062 – Flytte scener
Brukeren skal kunne flytte scener.

- **Kilde:** Kap. 4.4 (l. 215) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-01, INV-03
- **Avhengigheter:** REQ-0017
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Flyttet scene beholder ID og rekkefølgen oppdateres i manus og film.
- **Tester:**
  - integrasjon: flytt scene
- **Implementering:** src/core/commands/apply.ts#MoveOccurrence, src/app/script/SceneNavigator.tsx

#### REQ-0063 – Skjule eller deaktivere scener
Brukeren skal kunne skjule eller deaktivere scener.

- **Kilde:** Kap. 4.4 (l. 216) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0019; REQ-0021
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Deaktivert scene utelates fra aktivt innhold men er ikke slettet.
- **Tester:**
  - integrasjon: deaktiver scene
- **Implementering:** src/core/commands/apply.ts#SetOccurrenceActive, src/app/script/SceneNavigator.tsx
- **Merknad:** «Skjule eller deaktivere» – se DEC-0015 (skjul vs. deaktiver) og REQ-0021.

#### REQ-0064 – Gjenaktivere scener
Brukeren skal kunne aktivere skjulte eller deaktiverte scener igjen.

- **Kilde:** Kap. 4.4 (l. 217) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0020
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gjenaktivert scene vises igjen på sin plass med alt materiale.
- **Tester:**
  - integrasjon: gjenaktiver scene
- **Implementering:** src/core/commands/apply.ts#SetOccurrenceActive, src/app/script/SceneNavigator.tsx

#### REQ-0065 – Redigere dialog
Brukeren skal kunne redigere dialog.

- **Kilde:** Kap. 4.4 (l. 218) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0052
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Endret replikk beholder replikk-ID og lagres i ny manustilstand.
- **Tester:**
  - enhet: rediger replikk
- **Implementering:** src/core/commands/apply.ts#EditBlockText, src/app/script/Inspector.tsx

#### REQ-0066 – Redigere handling
Brukeren skal kunne redigere handling.

- **Kilde:** Kap. 4.4 (l. 219) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0052
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Endret handlingsblokk beholder blokk-ID.
- **Tester:**
  - enhet: rediger handlingsblokk
- **Implementering:** src/core/commands/apply.ts#EditBlockText,InsertBlock,RemoveBlock, src/app/script/Inspector.tsx

#### REQ-0067 – Splitte scener
Brukeren skal kunne splitte scener.

- **Kilde:** Kap. 4.4 (l. 220) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-03
- **Avhengigheter:** REQ-0041
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Narrativ splitting gir to manusscener; den opprinnelige beholder sin ID og den nye får ny ID; operasjonen kan angres.
- **Tester:**
  - integrasjon: splitt scene og angre
- **Implementering:** src/core/commands/apply.ts#SplitScene
- **Merknad:** Hvilken del som beholder opprinnelig ID er ikke spesifisert – se DEC-0015 (narrativ splitting).

#### REQ-0068 – Slå sammen scener
Brukeren skal kunne slå sammen scener.

- **Kilde:** Kap. 4.4 (l. 221) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-03
- **Avhengigheter:** REQ-0041
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Sammenslåing gir én scene; tilknyttet materiale fra begge bevares; operasjonen kan angres.
- **Tester:**
  - integrasjon: slå sammen og angre
- **Implementering:** src/core/commands/apply.ts#MergeScenes

#### REQ-0069 – Sammenligne manusversjoner
Brukeren skal kunne sammenligne manusversjoner.

- **Kilde:** Kap. 4.4 (l. 222) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, VERSION
- **Avhengigheter:** REQ-0078
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan velge to manusversjoner og se forskjellene.
- **Tester:**
  - e2e: velg to versjoner og vis diff
- **Merknad:** Detaljert i 5.1 (REQ-0078).

#### REQ-0070 – Angre og gjøre om i manus
Brukeren skal kunne angre og gjøre om endringer i manuset.

- **Kilde:** Kap. 4.4 (l. 223) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0042
- **Status:** Implementert – ikke verifisert
- **Akseptansekriterier:**
  - Alle manusredigeringer og sceneoperasjoner kan angres og gjøres om.
- **Tester:**
  - enhet: undo/redo-stakk for manusoperasjoner
- **Implementering:** src/app/project/use-commands.ts, src/core/commands/apply.ts

#### REQ-0071 – Narrativ splitting vs. produksjonsteknisk oppdeling
En narrativ splitting som skaper to selvstendige manusscener skal behandles annerledes enn en produksjonsteknisk oppdeling for videogenerering.

- **Kilde:** Kap. 4.4 (l. 224) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, SCRIPT, TIMELINE · **Invarianter:** INV-10
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Datamodellen har adskilte begreper for manusscene og produksjonsdelsekvens/segment.
- **Tester:**
  - enhet: produksjonssegment opprettes uten ny manusscene
- **Implementering:** src/core/commands/apply.ts#SplitScene
- **Merknad:** Jf. kap. 34 pkt. 14.

#### REQ-0072 – Produksjonsoppdeling endrer ikke scenenummerering
Produksjonsteknisk oppdeling skal ikke endre manusets scenenummerering.

- **Kilde:** Kap. 4.4 (l. 225) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, SCRIPT · **Invarianter:** INV-10
- **Avhengigheter:** REQ-0071
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt en scene delt i tre produksjonssegmenter, så er manusets scenenumre og sceneantall uendret.
- **Tester:**
  - integrasjon: segmentering → manusnummerering uendret
- **Implementering:** src/core/commands/apply.ts#CreateSegments

#### REQ-0073 – Søk og filtrering i manus
Manuset skal kunne søkes og filtreres etter karakter, objekt eller rekvisitt, lokasjon, scene, dialoginnhold, produksjonsstatus, synkroniseringsavvik og andre relevante metadata.

- **Kilde:** Kap. 4.5 (l. 227-235) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, UI
- **Avhengigheter:** REQ-0055
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hvert filterkriterium gir filtrering kun scener/passasjer som matcher.
- **Tester:**
  - enhet: filterlogikk per kriterium
  - e2e: fritekstsøk i dialog
- **Merknad:** Filter på synkroniseringsavvik forutsetter REQ-0025.

#### REQ-0074 – Vis bare scener med valgt karakter
Brukeren skal kunne velge en karakter og få vist bare scener der denne karakteren opptrer.

- **Kilde:** Kap. 4.5 (l. 236) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, LIBRARY, UI
- **Avhengigheter:** REQ-0073
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt karakteren Maja, så vises nøyaktig scenene der Maja opptrer (inkl. via aliaser).
- **Tester:**
  - integrasjon: karakterfilter mot fasit

#### REQ-0075 – Filtrering er ikke deaktivering
Filtrering av manusvisningen skal ikke være det samme som å deaktivere scener i produksjonen, og skal ikke endre produksjonens aktive innhold.

- **Kilde:** Kap. 4.5 (l. 237) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0021
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et aktivt filter, så er filmens aktive innhold og spilletid uendret.
- **Tester:**
  - integrasjon: filter påvirker ikke aktiv struktur

### Kapittel 5

#### REQ-0076 – Mange manusversjoner med full historikk
Animatic Studio skal støtte mange manusversjoner med full historikk.

- **Kilde:** Kap. 5.1 (l. 241) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** VERSION, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan opprette, liste og åpne et vilkårlig antall manusversjoner.
- **Tester:**
  - integrasjon: opprett og åpne flere versjoner

#### REQ-0077 – Innhold i hver manusversjon
Hver manusversjon skal bevare manusinnhold, scenerekkefølge, synlighet, scenenummerering, relasjoner til tidligere versjoner og koblinger til produsert materiale.

- **Kilde:** Kap. 5.1 (l. 242-248) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** VERSION, SCRIPT
- **Avhengigheter:** REQ-0076
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gjenåpning av en eldre versjon gjenskaper innhold, rekkefølge, synlighet, nummerering, foreldreversjon og materialkoblinger slik de var.
- **Tester:**
  - dataintegritet: snapshot-rundtur for alle seks elementer

#### REQ-0078 – Versjonssammenligning med endringstyper
Systemet skal kunne sammenligne manusversjoner og identifisere nye scener, fjernede eller skjulte scener, flyttede scener, endret dialog, endret handling, endrede sceneoverskrifter og endringer i karakterer og objekter.

- **Kilde:** Kap. 5.1 (l. 249-256) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, SCRIPT · **Invarianter:** INV-03
- **Avhengigheter:** REQ-0077
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt to versjoner med kjente endringer av hver type, så rapporteres hver endring med korrekt type.
- **Tester:**
  - enhet: diff-motor med fixtures per endringstype
- **Merknad:** «Sammenligning av versjoner» er plassert i fase 6; enkel sammenligning (REQ-0069) kan komme tidligere.

#### REQ-0079 – Omnummerert scene er ikke ny scene
En scene som bare har fått nytt nummer, skal ikke feilaktig behandles som en ny scene.

- **Kilde:** Kap. 5.1 (l. 257) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** VERSION, CORE · **Invarianter:** INV-02, INV-03
- **Avhengigheter:** REQ-0034
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene omnummerert fra 42 til 45, så rapporterer sammenligningen den som omnummerert/flyttet, ikke som ny + fjernet.
- **Tester:**
  - enhet: diff basert på scene-ID

#### REQ-0080 – Valg av nummereringsmetode ved hver eksport
Ved hver manuseksport skal brukeren kunne velge nummereringsmetode.

- **Kilde:** Kap. 5.2 (l. 259) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT, UI
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksportdialogen krever/tilbyr valg av nummereringsmetode hver gang.
- **Tester:**
  - e2e: eksportdialog viser nummereringsvalg
- **Implementering:** src/app/script/ExportDialog.tsx
- **Merknad:** Jf. kap. 34 pkt. 4.

#### REQ-0081 – Fortløpende nummerering
Nummereringsvalgene skal omfatte fortløpende nummerering, der alle aktive scener nummereres på nytt.

- **Kilde:** Kap. 5.2 (l. 261-262) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0080
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt 5 aktive scener, så nummereres de 1–5 i eksporten.
- **Tester:**
  - enhet: nummereringsalgoritme fortløpende
- **Implementering:** src/core/screenplay/numbering.ts
- **Merknad:** Linje 261 og 262 er duplikater.

#### REQ-0082 – Bevar produksjonsnummerering med mellomnumre
Nummereringsvalgene skal omfatte bevaring av produksjonsnummerering, der etablerte scenenumre beholdes og nye scener kan få mellomnumre som 42A og 42B.

- **Kilde:** Kap. 5.2 (l. 263-264) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0080
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt to nye scener mellom 42 og 43, så eksporteres de som 42A og 42B, og øvrige numre er uendret.
- **Tester:**
  - enhet: nummereringsalgoritme med mellomnumre, inkl. kanttilfeller (42A→42AA e.l.)
- **Implementering:** src/core/screenplay/numbering.ts
- **Merknad:** Linje 263 og 264 er duplikater.

#### REQ-0083 – Bevar valgt historisk nummerering
Nummereringsvalgene skal omfatte bevaring av valgt historisk nummerering, der nummereringen fra en bestemt tidligere manusversjon brukes der det er hensiktsmessig.

- **Kilde:** Kap. 5.2 (l. 265) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT, VERSION · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0080; REQ-0077
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt valgt historisk versjon V, så får scener som finnes i V samme nummer som i V.
- **Tester:**
  - enhet: nummerering basert på historisk versjon
- **Merknad:** «Der det er hensiktsmessig» er udefinert – se OPEN_QUESTIONS B (historisk nummerering).

#### REQ-0084 – Valg om å inkludere skjulte scener i eksport
Brukeren skal kunne velge om skjulte eller deaktiverte scener skal inkluderes i manuseksporten.

- **Kilde:** Kap. 5.2 (l. 266) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0080
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Med valget av utelates deaktiverte scener; med valget på inkluderes de (med tydelig markering).
- **Tester:**
  - import/eksport: eksport med og uten deaktiverte scener
- **Implementering:** src/app/script/ExportDialog.tsx, src/core/screenplay/numbering.ts
- **Merknad:** Hvordan inkluderte deaktiverte scener markeres og nummereres er ikke spesifisert.

#### REQ-0085 – Eksportvalg endrer ikke interne ID-er
Eksportvalg skal ikke endre prosjektets interne sceneidentiteter.

- **Kilde:** Kap. 5.2 (l. 267) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** EXPORT, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0080
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Etter eksport med hvilken som helst nummereringsmetode er alle scene-ID-er og relasjoner uendret.
- **Tester:**
  - dataintegritet: ID-sett før/etter eksport
- **Implementering:** src/core/screenplay/numbering.ts
- **Merknad:** Jf. kap. 34 pkt. 4.

#### REQ-0086 – Forhåndsvisning av nummerering før eksport
Programmet skal vise en forhåndsvisning av nummereringen før eksport.

- **Kilde:** Kap. 5.2 (l. 268) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, UI
- **Avhengigheter:** REQ-0080
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksportdialogen viser liste over scener med resulterende numre før brukeren bekrefter.
- **Tester:**
  - e2e: forhåndsvisning oppdateres ved bytte av metode
- **Implementering:** src/app/script/ExportDialog.tsx

#### REQ-0087 – Manuseksport til DOCX
Programmet skal kunne eksportere korrekt formatert manus til DOCX (prioritert format).

- **Kilde:** Kap. 5.3 (l. 270-272) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT
- **Avhengigheter:** REQ-0050
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksportert DOCX åpnes i Word med korrekt manuslayout.
- **Tester:**
  - import/eksport: DOCX-eksport og reimport-rundtur
- **Implementering:** src/engine/export/screenplay-docx.ts

#### REQ-0088 – Manuseksport til PDF
Programmet skal kunne eksportere korrekt formatert manus til PDF (prioritert format).

- **Kilde:** Kap. 5.3 (l. 270, 273) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT
- **Avhengigheter:** REQ-0050
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksportert PDF har samme paginering som manusvisningen.
- **Tester:**
  - visuell: PDF mot manusvisning
- **Implementering:** src/engine/export/screenplay-pdf.ts

#### REQ-0089 – Andre profesjonelle manusformater
Programmet skal kunne eksportere til andre relevante profesjonelle manusformater dersom implementeringen støtter dem pålitelig.

- **Kilde:** Kap. 5.3 (l. 274) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** EXPORT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert ekstra format (f.eks. FDX, Fountain) har rundtur-test før det tilbys.
- **Tester:**
  - import/eksport: rundtur per format
- **Merknad:** Betinget krav («dersom … pålitelig»).

#### REQ-0090 – Eksport bevarer layout, rekkefølge og nummerering
Eksportert manus skal opprettholde korrekt layout, sceneorden og nummerering.

- **Kilde:** Kap. 5.3 (l. 275) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT
- **Avhengigheter:** REQ-0087; REQ-0088
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksportert scenerekkefølge og numre samsvarer med forhåndsvisningen og aktiv struktur.
- **Tester:**
  - import/eksport: verifiser rekkefølge og numre i eksportfil
- **Implementering:** src/engine/export/screenplay-pdf.ts, src/engine/export/screenplay-docx.ts

#### REQ-0091 – Manuseksport krever ikke AI
Manuseksport skal ikke kreve AI-generering.

- **Kilde:** Kap. 5.3 (l. 276) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** EXPORT · **Invarianter:** INV-11
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Eksport fungerer uten nettverkstilgang til AI-leverandører.
- **Tester:**
  - integrasjon: eksport med AI-adaptere deaktivert
- **Implementering:** src/engine/export/screenplay-pdf.ts, src/engine/export/screenplay-docx.ts

### Kapittel 6

#### REQ-0092 – Manus som aktivt navigasjonsverktøy
Manuset skal ikke bare være en tekstlig beskrivelse av filmen, men et aktivt navigasjonsverktøy.

- **Kilde:** Kap. 6 (l. 279) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, TIMELINE, UI · **Invarianter:** INV-01
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Fra manuset kan brukeren navigere til tilsvarende sted i film/tidslinje (jf. REQ-0097).
- **Tester:**
  - e2e: navigasjon fra manus
- **Merknad:** Paraply for 6.1–6.4.

#### REQ-0093 – Manusblokker koblet til tidsintervaller
Hver replikk og handlingsbeskrivelse skal kunne kobles til ett eller flere tidsintervaller.

- **Kilde:** Kap. 6.1 (l. 281) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, TIMELINE
- **Avhengigheter:** REQ-0105
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan knytte en replikk til to adskilte intervaller, og begge vises.
- **Tester:**
  - enhet: manusblokk ↔ intervaller (1:n)

#### REQ-0094 – Tidskoblinger med permanente ID-er
Koblinger mellom manusblokker og tidsintervaller skal lagres med permanente identifikatorer.

- **Kilde:** Kap. 6.1 (l. 282) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** CORE, TIMELINE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0037
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Koblingen refererer til blokk-ID og klipp-/hendelses-ID, ikke posisjon eller tekst.
- **Tester:**
  - dataintegritet: kobling overlever omnummerering og flytting

#### REQ-0095 – Replikk-koblingstyper
En replikk skal kunne knyttes til et dialogopptak, et bestemt tidspunkt, en hendelse i 2D-scenen og ett eller flere filmklipp.

- **Kilde:** Kap. 6.1 (l. 283-287) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, AUDIO, COMPOSE, TIMELINE
- **Avhengigheter:** REQ-0093
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hver av de fire koblingstypene kan en replikk kobles og koblingen vises.
- **Tester:**
  - integrasjon: koblingstyper per replikk

#### REQ-0096 – Handling koblet til flere visuelle hendelser
En handlingsbeskrivelse skal kunne knyttes til flere visuelle hendelser.

- **Kilde:** Kap. 6.1 (l. 288) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, COMPOSE, TIMELINE
- **Avhengigheter:** REQ-0093
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En handlingsblokk kan ha flere tilknyttede visuelle hendelser.
- **Tester:**
  - enhet: handlingsblokk ↔ hendelser (1:n)

#### REQ-0097 – Klikk på replikk flytter avspillingshodet
Når brukeren klikker på en replikk, skal avspillingshodet kunne flyttes til tilsvarende tidspunkt i filmen.

- **Kilde:** Kap. 6.2 (l. 290) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, TIMELINE, UI · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0093
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en koblet replikk, når den klikkes, så står avspillingshodet på koblingens starttidspunkt (bilderiktig).
- **Tester:**
  - e2e: klikk replikk → avspillingshode

#### REQ-0098 – Avspillingshode markerer manuspassasje
Når brukeren flytter avspillingshodet, skal programmet kunne markere den aktuelle manuspassasjen.

- **Kilde:** Kap. 6.2 (l. 291) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, TIMELINE, UI · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0093
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt avspillingshode innenfor en koblet replikks intervall, så er replikken markert i manuset.
- **Tester:**
  - e2e: scrubbing → markering

#### REQ-0099 – Toveis navigasjon for alle materialtyper
Toveis navigasjon skal fungere for planlagte animatics, redigerbare 2D-scener, AI-generert video, importert ferdig film og sammensatte scener med flere klipp.

- **Kilde:** Kap. 6.2 (l. 292-297) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT, COMPOSE
- **Avhengigheter:** REQ-0097; REQ-0098
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hver av de fem materialtypene fungerer både klikk-til-tid og tid-til-markering.
- **Tester:**
  - e2e: parametrisert over materialtyper
- **Merknad:** AI-generert video-delen forutsetter fase 5. Jf. kap. 34 pkt. 15.

#### REQ-0100 – Manus og film side ved side
Manus og film skal kunne vises side ved side.

- **Kilde:** Kap. 6.2 (l. 298) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** UI, SCRIPT, TIMELINE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et arbeidsoppsett viser manus og filmavspiller samtidig.
- **Tester:**
  - visuell: side-ved-side-layout

#### REQ-0101 – Automatisk rulling av/på
Automatisk rulling av manuset under avspilling skal kunne slås av og på.

- **Kilde:** Kap. 6.2 (l. 299) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** UI, SCRIPT
- **Avhengigheter:** REQ-0098
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Med autorulling på følger manuset avspillingen; med av står manuset stille mens markeringen fortsatt oppdateres.
- **Tester:**
  - e2e: veksle autorulling

#### REQ-0102 – Teknisk metadata forstyrrer ikke manuslayout
Manuset skal fremdeles se ut som et profesjonelt filmmanus; tidskoder, produksjonsmarkeringer og annen teknisk metadata skal normalt ikke forstyrre manuslayouten.

- **Kilde:** Kap. 6.3 (l. 301-302) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** SCRIPT, UI
- **Avhengigheter:** REQ-0050
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - I ordinær manusvisning vises ingen tidskoder eller produksjonsmarkeringer, og pagineringen er uendret.
- **Tester:**
  - visuell: ordinær visning med og uten koblinger er identisk

#### REQ-0103 – Teknisk metadata i egne moduser/paneler
Tidskoder, produksjonsmarkeringer og teknisk metadata skal kunne vises i egne arbeidsmoduser og paneler.

- **Kilde:** Kap. 6.3 (l. 303) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** UI
- **Avhengigheter:** REQ-0102
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan slå på en produksjonsmodus/panel som viser tidskoder og markeringer.
- **Tester:**
  - e2e: bytt arbeidsmodus

#### REQ-0104 – Teknisk metadata ikke i eksportert manus
Tidskoder, produksjonsmarkeringer og teknisk metadata skal ikke automatisk inngå i eksportert manus.

- **Kilde:** Kap. 6.3 (l. 304) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT
- **Avhengigheter:** REQ-0087
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Standard manuseksport inneholder ingen tidskoder/produksjonsmarkeringer.
- **Tester:**
  - import/eksport: søk etter tidskoder i eksportfil gir null treff
- **Merknad:** «Automatisk» åpner for valgfri inkludering.

#### REQ-0105 – Flernivå tidsmodell
Systemet skal kunne håndtere lokal tid innenfor en scene, tid innenfor en delsekvens, tid innenfor et kildeklipp og absolutt tid i den samlede filmen.

- **Kilde:** Kap. 6.4 (l. 306-310) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** TIMELINE, CORE
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Et tidspunkt kan konverteres korrekt mellom alle fire tidsrom.
- **Tester:**
  - enhet: konverteringsfunksjoner mellom tidsrom
- **Implementering:** src/core/time.ts, src/core/views.ts

#### REQ-0106 – Bildepresis tidsmodell
Tidsmodellen skal være presis i forhold til prosjektets bildefrekvens.

- **Kilde:** Kap. 6.4 (l. 311) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0105
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Tid lagres i heltallige rammer/rasjonelle tall; ingen avrundingsdrift etter gjentatte konverteringer (inkl. 23.976/29.97).
- **Tester:**
  - enhet: rundtur-konvertering uten drift
- **Implementering:** src/core/time.ts

#### REQ-0107 – Tidskoblinger bevares ved flytting
Når en scene flyttes, skal dens interne tidskoblinger bevares mens den samlede filmens tidskoder beregnes på nytt.

- **Kilde:** Kap. 6.4 (l. 312) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, CORE · **Invarianter:** INV-01, INV-03
- **Avhengigheter:** REQ-0105
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med koblinger, når den flyttes, så er lokale tider uendret og absolutte tider oppdatert.
- **Tester:**
  - integrasjon: flytt scene → lokale vs. absolutte tider

### Kapittel 7

#### REQ-0108 – Estimering av spilletid etter import
Etter manusimport skal programmet kunne estimere spilletid per scene og for hele filmen.

- **Kilde:** Kap. 7.1 (l. 316) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT, TIMELINE
- **Avhengigheter:** REQ-0055
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter import har hver scene og filmen totalt et estimat.
- **Tester:**
  - enhet: estimator på referansemanus

#### REQ-0109 – Grunnlag for varighetsestimater
Estimatene kan baseres på dialogmengde, handlingsbeskrivelser, pauser, montasjer, beskrevet fysisk handling og andre relevante produksjonsantakelser.

- **Kilde:** Kap. 7.1 (l. 317-323) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0108
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Estimatoren tar hensyn til minst dialogmengde og handlingsbeskrivelser, og antakelsene er dokumentert/justerbare.
- **Tester:**
  - enhet: estimat endres når dialog/handling endres
- **Merknad:** «Kan» – listen er mulige faktorer, ikke absolutte krav.

#### REQ-0110 – Usikre estimater presenteres som usikre
Estimatene må presenteres som usikre når grunnlaget er usikkert.

- **Kilde:** Kap. 7.1 (l. 324) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Avhengigheter:** REQ-0108
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Scener med lite grunnlag (f.eks. montasje uten dialog) vises med usikkerhetsmarkering eller intervall.
- **Tester:**
  - enhet: usikkerhetsgrad beregnes

#### REQ-0111 – Brukeren kan korrigere estimater
Brukeren skal kunne korrigere varighetsestimatene.

- **Kilde:** Kap. 7.1 (l. 325) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** TIMELINE, UI
- **Avhengigheter:** REQ-0108
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan overstyre et estimat; totalen oppdateres.
- **Tester:**
  - e2e: overstyr estimat

#### REQ-0112 – Gradvis mer presis varighet
Etter hvert som produksjonen utvikles, skal estimert varighet erstattes av mer presise tall.

- **Kilde:** Kap. 7.2 (l. 327) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0113
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med 2D-animatic, så brukes animatic-varigheten i totalen i stedet for estimatet.
- **Tester:**
  - enhet: prioritetsrekkefølge for varighetskilder
- **Merknad:** P0 fordi kap. 34 pkt. 16 krever kontinuerlig beregning av estimert og faktisk spilletid.

#### REQ-0113 – Skille mellom varighetstyper
Systemet skal skille mellom estimert varighet, brukerplanlagt varighet, varighet i 2D-animatic, varighet fra AI-generert materiale og faktisk varighet fra importert eller ferdig film.

- **Kilde:** Kap. 7.2 (l. 328-333) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** TIMELINE, CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver scene kan lagre alle fem varighetstypene separat.
- **Tester:**
  - enhet: skjema for varighetstyper

#### REQ-0114 – Ingen dobbelttelling av scener
En scene skal ikke dobbeltelles i varighetsberegning selv om flere versjoner finnes.

- **Kilde:** Kap. 7.2 (l. 334) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0113
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med tre produksjonsversjoner, så teller kun aktiv versjon i totalen.
- **Tester:**
  - enhet: totalberegning med flere versjoner

#### REQ-0115 – Skjulte scener utelates fra totalvarighet
Skjulte scener skal utelates fra aktiv totalvarighet.

- **Kilde:** Kap. 7.2 (l. 335) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** TIMELINE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0019
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Deaktivering av en scene reduserer totalvarigheten tilsvarende; gjenaktivering legger den til.
- **Tester:**
  - enhet: total med deaktiverte scener
- **Merknad:** Gjentar kap. 2 (spilletidsberegning).

#### REQ-0116 – Varighet på egen prosjektoversikt
Varighetsinformasjon skal hovedsakelig vises på en egen prosjektoversikt.

- **Kilde:** Kap. 7.3 (l. 337) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Det finnes en egen prosjektoversiktsside med varighetsinformasjon.
- **Tester:**
  - e2e: naviger til prosjektoversikt
- **Merknad:** Jf. kap. 34 pkt. 17.

#### REQ-0117 – Ingen varighetstall i ordinær manusvisning
Den ordinære manusvisningen skal ikke fylles med varighetstall ved hver scene.

- **Kilde:** Kap. 7.3 (l. 338) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** UI, SCRIPT
- **Avhengigheter:** REQ-0102
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ordinær manusvisning viser ingen varighetstall per scene.
- **Tester:**
  - visuell: manusvisning uten varighetstall
- **Merknad:** Jf. kap. 34 pkt. 17.

#### REQ-0118 – Innhold i prosjektoversikten
Prosjektoversikten skal vise estimert total spilletid, bekreftet spilletid, gjenstående estimert spilletid, antall scener, varighet per scene, andel av filmen som er ferdig, andel som fortsatt er estimert, produksjonsstatus og scener med uavklarte avvik.

- **Kilde:** Kap. 7.3 (l. 339-348) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, TIMELINE
- **Avhengigheter:** REQ-0116; REQ-0113
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle ni elementene vises og summerer konsistent (bekreftet + gjenstående = total).
- **Tester:**
  - enhet: aggregeringsfunksjoner
  - visuell: oversiktsside
- **Merknad:** «Scener med uavklarte avvik» forutsetter REQ-0025.

#### REQ-0119 – Navigasjon fra oversikt til scene
Brukeren skal kunne navigere direkte fra prosjektoversikten til en scene.

- **Kilde:** Kap. 7.3 (l. 349) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Avhengigheter:** REQ-0118
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Klikk på en scene i oversikten åpner scenen i manus/scenevisning.
- **Tester:**
  - e2e: klikk-navigasjon

#### REQ-0120 – Historiske varighetsprognoser
Systemet skal kunne bevare tidligere estimater og vise hvordan forventet filmlengde endres gjennom produksjonen.

- **Kilde:** Kap. 7.4 (l. 351) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** TIMELINE, VERSION, UI
- **Avhengigheter:** REQ-0108
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Det finnes en graf/liste over forventet filmlengde over tid basert på lagrede estimater.
- **Tester:**
  - enhet: lagring av estimat-snapshots
- **Merknad:** Ikke eksplisitt plassert i noen fase; lagring av historikk bør likevel starte i fase 2.

### Kapittel 8

#### REQ-0121 – Sentralt ressursbibliotek
Animatic Studio skal ha et sentralt bibliotek for alle ressurser som brukes i produksjonen, som omfatter karakterer, objekter, rekvisitter, dyr, lokasjoner, miljøer, bakgrunner, bilder, lydfiler, genererte ressurser og visuelle stilprofiler.

- **Kilde:** Kap. 8 (l. 354-366) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver av de 11 ressurstypene kan opprettes og vises i biblioteket.
- **Tester:**
  - integrasjon: CRUD per ressurstype

#### REQ-0122 – Ressurser gjenbrukes på tvers av scener og produksjoner
Ressurser skal kunne brukes i mange scener og flere produksjoner.

- **Kilde:** Kap. 8.1 (l. 368) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, CORE · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0121
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Samme ressurs-ID refereres fra scener i to produksjoner.
- **Tester:**
  - integrasjon: ressursreferanse på tvers av produksjoner

#### REQ-0123 – Ingen kopier per scene
Det skal ikke være nødvendig å opprette nye kopier av samme karakter eller objekt for hver scene.

- **Kilde:** Kap. 8.1 (l. 369) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY
- **Avhengigheter:** REQ-0122
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Å legge en karakter til en scene skaper en referanse, ikke en kopi.
- **Tester:**
  - enhet: scene–ressurs-relasjon er referanse

#### REQ-0124 – Metadata, kategorier, søk og organisering
Biblioteket skal støtte metadata, kategorier, søk, filtrering og hensiktsmessig organisering.

- **Kilde:** Kap. 8.1 (l. 370) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, UI
- **Avhengigheter:** REQ-0121
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan tagge/kategorisere ressurser og søke/filtrere på dem.
- **Tester:**
  - e2e: søk og filter i bibliotek

#### REQ-0125 – Permanente ressurs-ID-er
Karakterer og andre ressurser skal ha permanente identifikatorer.

- **Kilde:** Kap. 8.2 (l. 372) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** LIBRARY, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0037
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Omdøping av en ressurs endrer ikke ID-en eller bryter referanser.
- **Tester:**
  - dataintegritet: omdøping bevarer referanser
- **Merknad:** Jf. kap. 34 pkt. 3.

#### REQ-0126 – Navnekontroll med alternative navn
Systemet skal støtte foretrukket navn, alternative navn, kallenavn, tidligere navn og språkspesifikke betegnelser for ressurser.

- **Kilde:** Kap. 8.2 (l. 373-378) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, L10N
- **Avhengigheter:** REQ-0125
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En karakter kan lagre alle fem navnetypene, og søk på alias finner karakteren.
- **Tester:**
  - enhet: aliasoppslag

#### REQ-0127 – Kontekstuell kobling av betegnelser
Ulike betegnelser (f.eks. «Laurits» og «onkel») skal kunne kobles til samme karakter der konteksten tilsier det.

- **Kilde:** Kap. 8.2 (l. 379) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** LIBRARY, SCRIPT, CONTINUITY
- **Avhengigheter:** REQ-0126
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt manuspassasjer der «onkel» refererer til Laurits, så kan disse forekomstene kobles til Laurits uten at alle «onkel»-forekomster nødvendigvis gjør det.
- **Tester:**
  - integrasjon: kontekstuell aliaskobling
- **Merknad:** Kontekstavhengig kobling er mer enn enkel alias; se OPEN_QUESTIONS B (kontekstavhengig alias).

#### REQ-0128 – Usikre koblinger foreslås
Usikre koblinger mellom navn og ressurser skal foreslås, ikke gjennomføres ukritisk.

- **Kilde:** Kap. 8.2 (l. 380) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0127
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Usikre koblinger vises som forslag som brukeren må godta før de brukes.
- **Tester:**
  - enhet: forslag har status «foreslått» til godkjent

#### REQ-0129 – Deteksjon av stavefeil og inkonsistente navn
Programmet skal kunne identifisere mulige stavefeil og inkonsistente karakternavn, lokasjonsnavn og rekvisittbetegnelser.

- **Kilde:** Kap. 8.2 (l. 381) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** LIBRARY, SCRIPT
- **Avhengigheter:** REQ-0126
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt «Maja» og «Maia» i manuset, så foreslås de som mulig samme karakter.
- **Tester:**
  - enhet: likhetsdeteksjon på navn

#### REQ-0130 – Konsekvensanalyse ved ressursendring
Hvis en global ressurs endres, skal programmet identifisere scener som kan være påvirket.

- **Kilde:** Kap. 8.3 (l. 383) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, LIBRARY
- **Avhengigheter:** REQ-0131
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved endring av ressurs R listes alle scener (alle produksjoner) som bruker R.
- **Tester:**
  - integrasjon: endring → liste over berørte scener

#### REQ-0131 – Finne scener der en ressurs er brukt
Systemet skal kunne finne scener der en bestemt ressurs er brukt (f.eks. når en vase erstattes av en tekanne).

- **Kilde:** Kap. 8.3 (l. 384) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, CORE
- **Avhengigheter:** REQ-0122
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en gitt ressurs vises en «brukt i»-liste med scener.
- **Tester:**
  - enhet: omvendt oppslag ressurs → scener

#### REQ-0132 – Berørte scener flagges for gjennomgang
Scener berørt av en ressursendring skal flagges for gjennomgang.

- **Kilde:** Kap. 8.3 (l. 385) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, UI · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0130
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Berørte scener får status «til gjennomgang» synlig i oversikten.
- **Tester:**
  - integrasjon: ressursendring → flagg

#### REQ-0133 – Ingen automatisk regenerering ved ressursendring
Ingen ferdige scener skal regenereres automatisk når en global ressurs endres.

- **Kilde:** Kap. 8.3 (l. 386) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, QUEUE · **Invarianter:** INV-07, INV-12
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ressursendring oppretter ingen renderjobber.
- **Tester:**
  - integrasjon: ressursendring → renderkø uendret

#### REQ-0134 – Brukeren velger scener som skal oppdateres
Brukeren skal kunne velge hvilke scener som skal oppdateres etter en ressursendring.

- **Kilde:** Kap. 8.3 (l. 387) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0132
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Fra listen over berørte scener kan brukeren velge et delsett for oppdatering; øvrige forblir uendret.
- **Tester:**
  - e2e: selektiv oppdatering
- **Merknad:** P0 fordi det uttrykker INV-08; selve funksjonen leveres i fase 6.

### Kapittel 9

#### REQ-0135 – Én karakter, flere visuelle varianter
En karakter skal ha én permanent identitet, men kunne ha flere visuelle varianter, som kan omfatte originale referansebilder, illustrerte varianter, filmrealistiske varianter, animatic-varianter, plakatvarianter, ulike antrekk, ulike alderstrinn, ulike frisyrer og midlertidige fysiske tilstander.

- **Kilde:** Kap. 9.1 (l. 391-401) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY
- **Avhengigheter:** REQ-0125
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En karakter kan ha varianter av hver av de ni typene under samme karakter-ID.
- **Tester:**
  - enhet: karakter med flere varianter

#### REQ-0136 – Varianter versjoneres og godkjennes separat
Hver visuell variant skal kunne versjoneres og godkjennes separat.

- **Kilde:** Kap. 9.1 (l. 402) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY, VERSION · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0135
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Godkjenning av én variant påvirker ikke status på andre; nye versjoner bevarer tidligere.
- **Tester:**
  - enhet: variantversjonering og godkjenningsstatus

#### REQ-0137 – AI-basert stilharmonisering
Når bilder fra forskjellige kilder brukes sammen, skal programmet kunne tilby AI-basert stilharmonisering.

- **Kilde:** Kap. 9.2 (l. 404) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PROMPT, PROVIDER, LIBRARY · **Invarianter:** INV-12
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan velge flere bilder og starte stilharmonisering (med kostnadsgodkjenning).
- **Tester:**
  - integrasjon: harmonisering via mock-adapter
- **Merknad:** Stilharmonisering er i fase 8.

#### REQ-0138 – Harmoniseringsdimensjoner
Karakterbilder skal kunne tilpasses en felles tegnestil, fargepalett, lyssetting, tekstur, detaljgrad og atmosfære.

- **Kilde:** Kap. 9.2 (l. 405-411) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PROMPT, LIBRARY
- **Avhengigheter:** REQ-0137
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Harmoniseringsprompten inkluderer målverdier for alle seks dimensjonene.
- **Tester:**
  - enhet: promptbygger for harmonisering

#### REQ-0139 – Bevar gjenkjennelig identitet
Stilharmoniseringen skal bevare karakterens gjenkjennelige identitet så langt som mulig.

- **Kilde:** Kap. 9.2 (l. 412) · **Opprinnelse:** mandat · **Type:** ikke-funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PROMPT
- **Avhengigheter:** REQ-0137
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Harmoniseringsprompt inkluderer identitetsbevarende instruksjoner og referansebilder.
- **Tester:**
  - manuell: vurdering av gjenkjennelighet
- **Merknad:** «Så langt som mulig» – ikke absolutt.

#### REQ-0140 – Sammenligne original og harmonisert
Brukeren skal kunne sammenligne original og harmonisert variant før godkjenning.

- **Kilde:** Kap. 9.2 (l. 413) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** UI, LIBRARY · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0137
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Side-ved-side/før-etter-visning finnes før godkjenningsknappen.
- **Tester:**
  - e2e: sammenligning før godkjenning

#### REQ-0141 – Harmonisert bilde brukt lokalt
Et harmonisert karakterbilde skal kunne brukes bare i den aktuelle plakaten eller scenen.

- **Kilde:** Kap. 9.3 (l. 415-416) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** LIBRARY, PRESENT
- **Avhengigheter:** REQ-0137
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Bildet kan brukes lokalt uten å bli synlig i det globale biblioteket.
- **Tester:**
  - integrasjon: lokal bruk

#### REQ-0142 – Harmonisert bilde som alternativ variant
Et harmonisert karakterbilde skal kunne lagres som en alternativ variant.

- **Kilde:** Kap. 9.3 (l. 417) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** LIBRARY · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0135
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Bildet lagres som ny variant under karakteren uten å erstatte eksisterende.
- **Tester:**
  - enhet: lagre som variant

#### REQ-0143 – Publisering til globalt karakterbibliotek
Et harmonisert karakterbilde skal kunne godkjennes og publiseres til det globale karakterbiblioteket.

- **Kilde:** Kap. 9.3 (l. 418) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** LIBRARY, VERSION · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0142
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter godkjenning er varianten tilgjengelig i det globale biblioteket.
- **Tester:**
  - integrasjon: godkjenn og publiser
- **Merknad:** Jf. kap. 34 pkt. 25, men plassert i fase 8 – se OPEN_QUESTIONS B (kontinuitetsprinsipper før harmonisering).

#### REQ-0144 – Foretrukket referanse per stilprofil
Et harmonisert karakterbilde skal kunne merkes som foretrukket referanse for en bestemt stilprofil.

- **Kilde:** Kap. 9.3 (l. 419) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** LIBRARY
- **Avhengigheter:** REQ-0147
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en karakter og stilprofil kan nøyaktig én variant være foretrukket referanse.
- **Tester:**
  - enhet: foretrukket-referanse per (karakter, stilprofil)

#### REQ-0145 – Publisering er eksplisitt brukerhandling
Publisering av en variant til det globale biblioteket skal være en eksplisitt brukerhandling.

- **Kilde:** Kap. 9.3 (l. 420) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 8
- **Moduler:** LIBRARY · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0143
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen kodevei publiserer en variant uten eksplisitt brukerkommando.
- **Tester:**
  - integrasjon: ingen automatisk publisering
- **Merknad:** Jf. kap. 34 pkt. 25. P0 som prinsipp, selv om funksjonen er fase 8.

#### REQ-0146 – Scener bytter ikke automatisk variant
Eksisterende scener skal ikke automatisk bytte til en nylig publisert variant.

- **Kilde:** Kap. 9.3 (l. 421) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** LIBRARY, VERSION · **Invarianter:** INV-07, INV-13
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter publisering av ny variant refererer eksisterende scener fortsatt til sin tidligere variant/versjon.
- **Tester:**
  - dataintegritet: scenereferanser uendret etter publisering
- **Merknad:** Krever versjonslåste ressursreferanser fra fase 3.

#### REQ-0147 – Gjenbrukbare stilprofiler
Programmet skal støtte gjenbrukbare visuelle stilprofiler med referansebilder og beskrivelser av stil.

- **Kilde:** Kap. 9.4 (l. 423) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** LIBRARY, PROMPT
- **Avhengigheter:** REQ-0121
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En stilprofil kan opprettes med referansebilder og tekstbeskrivelse og gjenbrukes.
- **Tester:**
  - integrasjon: CRUD stilprofil
- **Merknad:** Stilprofiler inngår i biblioteket (REQ-0121); fullt utnyttet ved generering i fase 5.

#### REQ-0148 – Stilprofil brukt på tvers av ressurstyper
En stilprofil skal kunne brukes på tvers av karakterer, miljøer, objekter, plakater, 2D-animatics og AI-generert video.

- **Kilde:** Kap. 9.4 (l. 424-430) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** LIBRARY, PROMPT, COMPOSE, PRESENT
- **Avhengigheter:** REQ-0147
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Samme stilprofil kan knyttes til hver av de seks typene.
- **Tester:**
  - integrasjon: stilprofil-tilknytning per type

#### REQ-0149 – Skille identitet, tilstand og stil
Systemet må skille mellom hvem karakteren er (identitet), hvordan karakteren ser ut i historien (utseendetilstand) og hvilken visuell stil karakteren fremstilles i (stilvariant/stilprofil).

- **Kilde:** Kap. 9.4 (l. 431) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** LIBRARY, CONTINUITY, CORE · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0037
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Datamodellen har tre adskilte dimensjoner: karakter-ID, utseendetilstand og stilvariant, som kan kombineres fritt.
- **Tester:**
  - enhet: skjema for karakter × tilstand × stil
- **Merknad:** Grunnleggende datamodellvalg; bør defineres i fase 1.

### Kapittel 10

#### REQ-0150 – Tidsstyrte utseendeendringer
Karakterer skal kunne endre utseende underveis i fortellingen, og systemet må forstå når forandringen skjer og hvilke referanser som gjelder før og etter.

- **Kilde:** Kap. 10 (l. 434-436) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0149
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en karakter med registrert endring kan systemet for enhver scene svare hvilken referanse som gjelder.
- **Tester:**
  - enhet: tilstandsoppslag per scene
- **Merknad:** Beskrevet som sentral funksjon; jf. kap. 34 pkt. 18. Datamodellen må støtte dette fra fase 1.

#### REQ-0151 – Registrering av kontinuitetshendelse
Programmet skal kunne registrere en kontinuitetshendelse med karakter (f.eks. Maja), hendelse (f.eks. klipper håret), utseende før hendelsen (langt hår), utseende etter hendelsen (kort hår), scene og manuspassasje der forandringen skjer, og om forandringen er permanent eller midlertidig.

- **Kilde:** Kap. 10.1 (l. 438-446) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0150
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hendelsen Maja klipper håret kan lagres med alle seks feltene.
- **Tester:**
  - enhet: kontinuitetshendelse-skjema

#### REQ-0152 – Riktig referanse etter fortellingens kronologi
Fra punktet i fortellingens kronologi der forandringen skjer, skal riktig referanse brukes, og programmet må ikke feilaktig generere scener før hendelsen med utseendet etter hendelsen (f.eks. kort hår før hårklippingen).

- **Kilde:** Kap. 10.1 (l. 447-448) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY, PROMPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt hårklipp i scene 40, når scene 20 genereres, så brukes langt-hår-referansen; når scene 50 genereres, brukes kort-hår-referansen.
- **Tester:**
  - integrasjon: referansevalg før/etter hendelse

#### REQ-0153 – Støttede kontinuitetstyper
Systemet skal blant annet støtte kontinuitetstypene hårklipp og frisyre, hårfarge, kostymeskifte, skader og bandasjer, arr, skitt, snø og vann, skjeggvekst, aldring, objekter karakteren bærer og andre fysiske forandringer.

- **Kilde:** Kap. 10.2 (l. 450-461) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver av de 11 typene kan registreres (inkl. en generell «annen fysisk forandring»).
- **Tester:**
  - enhet: kontinuitetstype-enum/utvidbar liste

#### REQ-0154 – Permanente, midlertidige og sceneavhengige tilstander
Systemet skal skille mellom permanente endringer, midlertidige tilstander og sceneavhengige varianter.

- **Kilde:** Kap. 10.2 (l. 462) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En midlertidig tilstand (f.eks. våt) gjelder kun i angitt intervall; en permanent gjelder fra hendelsen og fremover.
- **Tester:**
  - enhet: gyldighetsregler per tilstandstype

#### REQ-0155 – Visuell kontinuitetstidslinje per karakter
Hver karakter skal kunne ha en visuell kontinuitetstidslinje.

- **Kilde:** Kap. 10.3 (l. 464) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, UI · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En karaktervisning viser utseendetilstander langs fortellingstiden med hendelsene markert.
- **Tester:**
  - visuell: kontinuitetstidslinje

#### REQ-0156 – Kontinuitetshendelser knyttet til stabile ID-er
Kontinuitetshendelser skal knyttes til stabile sceneidentiteter og ved behov bestemte manusblokker eller tidsintervaller; scenenummer alene skal ikke brukes som referanse.

- **Kilde:** Kap. 10.3 (l. 465-466) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0034; REQ-0094
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Omnummerering eller flytting av scener endrer ikke hvilken scene/blokk en hendelse er knyttet til.
- **Tester:**
  - dataintegritet: hendelse overlever omnummerering

#### REQ-0157 – Forslag til kontinuitetshendelser fra manus
Systemet skal kunne analysere manus og foreslå relevante kontinuitetshendelser (f.eks. foreslå en hendelse når manus beskriver at Maja klipper håret).

- **Kilde:** Kap. 10.4 (l. 468-469) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT, PROMPT
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en manuspassasje om hårklipp, så opprettes et forslag til kontinuitetshendelse.
- **Tester:**
  - integrasjon: analyse av fixtures med kjente hendelser
- **Merknad:** Kan være AI-basert; analyse skal i så fall ikke være eneste vei (manuell registrering).

#### REQ-0158 – Brukeren godkjenner foreslått tolkning
Brukeren skal godkjenne tolkningen før en foreslått kontinuitetshendelse tas i bruk.

- **Kilde:** Kap. 10.4 (l. 470) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0157
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Foreslåtte hendelser påvirker ikke referansevalg før de er godkjent.
- **Tester:**
  - enhet: forslag ignoreres i referansevalg til godkjent

#### REQ-0159 – Automatisk valg av karaktertilstand ved generering
Når «Generer scene» aktiveres, skal systemet automatisk velge relevante karaktertilstander ut fra fortellingens kronologi.

- **Kilde:** Kap. 10.5 (l. 472) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, PROMPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0152
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Genereringsprompten for en scene inneholder referansene til gjeldende tilstand for hver karakter i scenen.
- **Tester:**
  - integrasjon: promptinnhold per scene

#### REQ-0160 – Riktig tilstand uavhengig av produksjonsrekkefølge
Automatisk valg av karaktertilstand skal fungere selv om scenene produseres i tilfeldig rekkefølge.

- **Kilde:** Kap. 10.5 (l. 473) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0159
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Generering av scener i rekkefølgen 50, 10, 30 gir samme tilstandsvalg som i rekkefølgen 10, 30, 50.
- **Tester:**
  - enhet: referansevalg er rekkefølgeuavhengig

#### REQ-0161 – Forslag om produksjonssegmenter ved endring midt i scene
Hvis en forandring skjer midt i en scene, skal systemet kunne foreslå å dele produksjonen i et segment før endringen og et segment etter endringen.

- **Kilde:** Kap. 10.6 (l. 475-477) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, TIMELINE · **Invarianter:** INV-10
- **Avhengigheter:** REQ-0071; REQ-0156
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt hendelse knyttet til en manusblokk midt i en scene, så foreslås to segmenter delt ved den blokken.
- **Tester:**
  - integrasjon: segmentforslag
- **Merknad:** Jf. kap. 34 pkt. 19.

#### REQ-0162 – Segmenter får riktig karakterreferanse
Hvert produksjonssegment skal få riktig karakterreferanse.

- **Kilde:** Kap. 10.6 (l. 478) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, PROMPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0161
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Segment før bruker langt-hår-referanse, segment etter bruker kort-hår-referanse.
- **Tester:**
  - integrasjon: referanse per segment

#### REQ-0163 – Segmentering bevarer manusscene og nummerering
Oppdeling i produksjonssegmenter ved kontinuitetsendring skal ikke opprette nye manusscener eller endre scenenummereringen; den eksisterende manusscenen skal beholde sin identitet.

- **Kilde:** Kap. 10.6 (l. 479-481) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CORE, CONTINUITY, SCRIPT · **Invarianter:** INV-10, INV-03
- **Avhengigheter:** REQ-0072
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter segmentering er antall manusscener, scenenumre og scene-ID uendret.
- **Tester:**
  - dataintegritet: manusstruktur før/etter segmentering
- **Merknad:** Linje 479 og 480 er duplikater. Jf. kap. 34 pkt. 19.

#### REQ-0164 – Støtte for ikke-lineær fortelling
Systemet må støtte flashbacks, flashforwards, drømmer, tidshopp og ikke-kronologisk sceneorden.

- **Kilde:** Kap. 10.7 (l. 483-488) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, CORE · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0165
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En scene kan merkes som flashback/flashforward/drøm/tidshopp og gis en fortellingstid som avviker fra visningsrekkefølgen.
- **Tester:**
  - enhet: fortellingstid-attributt
- **Merknad:** Feltet for fortellingstid bør finnes i datamodellen fra fase 1.

#### REQ-0165 – Kontinuitet følger fortellingstid
Kontinuitet skal følge fortellingens faktiske hendelsestid, ikke bare rekkefølgen scenene vises eller produseres i.

- **Kilde:** Kap. 10.7 (l. 489) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY · **Invarianter:** INV-09
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en flashback-scene plassert etter hårklippet i visningsrekkefølge men før i fortellingstid, så brukes langt hår.
- **Tester:**
  - integrasjon: flashback-scenario

#### REQ-0166 – Spinoffer gjenbruker kontinuitet med lokale avvik
Spinoffer skal kunne gjenbruke hovedfilmens kontinuitetsinformasjon, men også ha egne lokale avvik.

- **Kilde:** Kap. 10.8 (l. 491) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CONTINUITY, CORE · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0151
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En spinoff arver hovedfilmens kontinuitetshendelser og kan overstyre/fjerne enkelte lokalt.
- **Tester:**
  - integrasjon: arv og lokal overstyring

#### REQ-0167 – Spinoff-kontinuitet endrer ikke hovedfilmen
En alternativ spinoff (f.eks. der Maja ikke klipper håret) skal kunne beholde sin egen kontinuitet uten å endre hovedfilmen.

- **Kilde:** Kap. 10.8 (l. 492) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CONTINUITY, CORE · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0166
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Fjerning av hårklipp-hendelsen i spinoffen gir ingen endring i hovedfilmens kontinuitet.
- **Tester:**
  - dataintegritet: hovedfilmens kontinuitet uendret etter spinoff-endring

### Kapittel 11

#### REQ-0168 – Sceneeditor som sentral arbeidsflate
Sceneeditoren skal være en av applikasjonens viktigste arbeidsflater.

- **Kilde:** Kap. 11 (l. 494-495) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE, UI
- **Avhengigheter:** Informasjonsarkitektur (kap. 30.2)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et åpent prosjekt, når brukeren velger en scene, så kan sceneeditoren åpnes direkte fra hovednavigasjonen og fra manus/tidslinje.
- **Tester:**
  - manuell: UX-gjennomgang av navigasjon til sceneeditor fra manus, tidslinje og oversikt

#### REQ-0169 – 2D-editor, ikke 3D
Sceneeditoren skal være en 2D-editor, ikke en full 3D-sceneeditor.

- **Kilde:** Kap. 11 (l. 496) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Scenemodellen representerer elementer som 2D-lag med dybdeordning/dybdeverdi, uten 3D-geometri, 3D-kamera med fri rotasjon i rommet eller 3D-modellimport.
- **Tester:**
  - enhet: datamodell for komposisjon inneholder kun 2D-transformasjoner pluss lagdybde
  - manuell: arkitekturgjennomgang
- **Merknad:** Ufravikelig prinsipp nr. 10 i kap. 34.

#### REQ-0170 – Multiplan- og lagbasert visuell modell
Den visuelle modellen i sceneeditoren skal være inspirert av tradisjonelle multiplan-animasjonsrigger og lagbasert arbeid i programmer som After Effects.

- **Kilde:** Kap. 11 (l. 497) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE, UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Editoren presenterer scenen som en stabel av plan/lag med dybdeforhold, og lagene kan redigeres hver for seg på samme måte som i en lagbasert komposisjonseditor.
- **Tester:**
  - manuell: designgjennomgang mot multiplan-prinsippet
  - visuell: skjermbilde av lagstabel og dybdevisning
- **Merknad:** Ufravikelig prinsipp nr. 10 i kap. 34.

#### REQ-0171 – Plassere bildeelementer i scenen
Brukeren skal kunne plassere følgende elementtyper i 2D-scenen: bakgrunner, mellomgrunner, forgrunner, karakterer, objekter, visuelle effekter og andre bildeelementer.

- **Kilde:** Kap. 11.1 (l. 498-506) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE, LIBRARY
- **Avhengigheter:** Ressursbibliotek (kap. 8)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en tom 2D-scene, når brukeren legger til hver av elementtypene bakgrunn, mellomgrunn, forgrunn, karakter, objekt, visuell effekt og annet bildeelement, så vises de i scenen og lagres i prosjektdataene.
- **Tester:**
  - e2e: legg til ett element av hver type og verifiser at de vises og persisteres etter omlasting

#### REQ-0172 – Lag med definert dybdeforhold
Elementene i 2D-scenen skal kunne organiseres i lag med definert dybdeforhold.

- **Kilde:** Kap. 11.1 (l. 507) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt flere elementer, når brukeren tildeler dem til lag med ulike dybdeverdier, så tegnes de i riktig rekkefølge og dybdeverdien lagres per lag.
- **Tester:**
  - enhet: sortering/tegnerekkefølge etter dybdeverdi
  - visuell: referansebilde av overlappende lag
- **Merknad:** Ufravikelig prinsipp nr. 10 (lagbasert) i kap. 34.

#### REQ-0173 – Parallakse og kamerabevegelse gjennom lag
Systemet skal støtte parallakseffekter og kontrollert kamerabevegelse gjennom lagene.

- **Kilde:** Kap. 11.1 (l. 508) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE, CAMERA
- **Avhengigheter:** REQ-0172
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt lag med ulik dybde, når kameraet panorerer, så forflytter nærere lag seg mer på skjermen enn fjernere lag i samsvar med dybdeverdien.
- **Tester:**
  - enhet: beregnet skjermforskyvning per lag som funksjon av dybde og kamerabevegelse
  - visuell: avspilling av panorering over tre lag

#### REQ-0174 – Redigerbare transformasjoner per element
Hvert element i 2D-scenen skal kunne ha redigerbare egenskaper som posisjon, skalering, rotasjon, transparens, synlighet, gruppering og lagrekkefølge.

- **Kilde:** Kap. 11.2 (l. 509-517) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For et valgt element kan brukeren endre posisjon, skalering, rotasjon, transparens, synlighet, gruppering og lagrekkefølge, og endringene vises umiddelbart og lagres.
- **Tester:**
  - enhet: transformasjonsmatrise og opasitet per element
  - e2e: endre hver egenskap og verifiser persistens og visning

#### REQ-0175 – Maskering og komposisjonsfunksjoner
Elementer i 2D-scenen skal kunne ha eventuelle maskerings- og komposisjonsfunksjoner som er hensiktsmessige.

- **Kilde:** Kap. 11.2 (l. 518) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 3
- **Moduler:** COMPOSE
- **Avhengigheter:** REQ-0174
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at maskering er implementert, når brukeren legger en maske på et element, så begrenses elementets synlige område til masken uten at kildebildet endres.
- **Tester:**
  - visuell: maske på lag gir forventet utsnitt
  - dataintegritet: kildebilde uendret etter maskering
- **Merknad:** Modalitet «eventuelle … som er hensiktsmessige» – omfang ikke definert; skilt ut fra REQ-0174 for å bevare modaliteten.

#### REQ-0176 – Keyframe-animasjon av elementer
Elementer i 2D-scenen skal kunne animeres med keyframes (nøkkelbilder).

- **Kilde:** Kap. 11.3 (l. 519-520) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE
- **Avhengigheter:** REQ-0174
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et element med to keyframes for posisjon på ulike tidspunkter, når scenen spilles av, så interpoleres posisjonen mellom dem.
- **Tester:**
  - enhet: interpolering mellom keyframes
  - e2e: sett keyframes og spill av

#### REQ-0177 – Tidsstyrte endringer og hastighetskurver
Systemet skal støtte tidsstyrte endringer og justerbare hastighetskurver for animerte elementer.

- **Kilde:** Kap. 11.3 (l. 521) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE
- **Avhengigheter:** REQ-0176
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en animasjon mellom to keyframes, når brukeren endrer hastighetskurven (f.eks. lineær til ease-in-out), så endres interpoleringen tilsvarende ved avspilling.
- **Tester:**
  - enhet: kurveevaluering for lineær og bézier-baserte hastighetskurver
  - visuell: sammenligning av bevegelse før og etter kurveendring

#### REQ-0178 – Enkel animatic uten generativ AI
Brukeren skal kunne produsere en enkel animatic med stillbilder, objekter og bevegelse uten å bruke generativ AI.

- **Kilde:** Kap. 11.3 (l. 522) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE, CAMERA · **Invarianter:** INV-11
- **Avhengigheter:** REQ-0176
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at alle AI-leverandører er frakoblet, når brukeren bygger en scene med stillbilder, objekter og keyframe-bevegelse, så kan scenen spilles av fullt ut.
- **Tester:**
  - e2e: bygg og spill av animatic med AI-integrasjoner deaktivert og nettverkskall til AI-leverandører blokkert
- **Merknad:** Ufravikelig prinsipp nr. 9 i kap. 34.

#### REQ-0179 – 2D-scenen bevares som redigerbare data
Alle lag, objekter, bevegelser og kamerainnstillinger skal bevares som redigerbare prosjektdata.

- **Kilde:** Kap. 11.4 (l. 523-524) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE, CAMERA, CORE · **Invarianter:** INV-13
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en lagret scene, når prosjektet lukkes og åpnes igjen, så er alle lag, objekter, keyframes og kamerainnstillinger fortsatt redigerbare (ikke bakt inn i en ferdig fil).
- **Tester:**
  - dataintegritet: rundtur lagre/laste av komposisjon gir identisk datastruktur
  - e2e: rediger et lag etter omlasting

#### REQ-0180 – AI-video overskriver ikke 2D-scenen
En AI-generert videofil skal ikke erstatte eller overskrive den underliggende 2D-scenen.

- **Kilde:** Kap. 11.4 (l. 525) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** COMPOSE, VERSION, PROVIDER · **Invarianter:** INV-07, INV-11
- **Avhengigheter:** REQ-0179
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en 2D-scene, når en AI-generert video for scenen mottas og aktiveres, så finnes 2D-komposisjonen fortsatt uendret og kan redigeres og spilles av.
- **Tester:**
  - dataintegritet: hash av 2D-scenedata før og etter AI-generering er lik
  - integrasjon: aktivering av AI-video lager ny versjon ved siden av 2D-kilden
- **Merknad:** Kobles til ufravikelig prinsipp nr. 27 i kap. 34.

### Kapittel 12

#### REQ-0181 – Kamera som redigerbart sceneelement
Kameraet skal være et sentralt, visuelt redigerbart element i 2D-scenen.

- **Kilde:** Kap. 12 (l. 527-528) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, COMPOSE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - I sceneeditoren vises kameraet som et eget objekt som kan velges og flyttes/endres direkte i arbeidsflaten.
- **Tester:**
  - e2e: velg og flytt kamera i arbeidsflaten

#### REQ-0182 – Kamerautsnitt fra filmformat og sideforhold
Kameraet skal ha et definert utsnitt basert på valgt filmformat og sideforhold.

- **Kilde:** Kap. 12.1 (l. 529-530) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt valgt sideforhold (f.eks. 2.39:1 eller 16:9), så har kamerautsnittet nøyaktig dette sideforholdet, og eksportert bilde tilsvarer utsnittet.
- **Tester:**
  - enhet: beregning av utsnittsdimensjoner per format
  - visuell: eksportert ramme samsvarer med kamerautsnitt

#### REQ-0183 – Støtte for ulike bildeformater
Brukeren skal kunne arbeide med ulike relevante bildeformater.

- **Kilde:** Kap. 12.1 (l. 531) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, CORE
- **Avhengigheter:** REQ-0182
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan velge mellom flere forhåndsdefinerte bildeformater/sideforhold (og evt. egendefinert), og valget lagres i prosjektet/produksjonen.
- **Tester:**
  - enhet: formatkatalog og validering
  - e2e: bytt format og verifiser kamerautsnitt
- **Merknad:** Hvilke formater som er «relevante», og om formatet settes per prosjekt, produksjon eller scene, er ikke spesifisert.

#### REQ-0184 – Vise kameraets start- og sluttramme
I editoren skal kameraets start- og sluttramme kunne vises som tydelige, tynne konturer.

- **Kilde:** Kap. 12.2 (l. 532-533) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, UI
- **Avhengigheter:** REQ-0182
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et kamera med bevegelse, så vises rammen ved start og rammen ved slutt samtidig som konturer i arbeidsflaten, og visningen kan slås på.
- **Tester:**
  - visuell: skjermbilde av editor med start- og sluttramme

#### REQ-0185 – Blå startramme, rød sluttramme
Kameraets startramme skal vises med blå kontur (kameraposisjon ved start) og sluttrammen med rød kontur (kameraposisjon ved slutt).

- **Kilde:** Kap. 12.2 (l. 534-536) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, UI
- **Avhengigheter:** REQ-0184
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Startrammen tegnes blå og sluttrammen rød i arbeidsflaten.
- **Tester:**
  - visuell: pikselsjekk av farge på start- og sluttramme
- **Merknad:** Formulert som «den ønskede visuelle konvensjonen».

#### REQ-0186 – Rammekonturer omtrent 1 piksel
Konturene for kameraets start- og sluttramme skal være omtrent 1 piksel tykke.

- **Kilde:** Kap. 12.2 (l. 537) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, UI
- **Avhengigheter:** REQ-0184
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Rammekonturene tegnes med ca. 1 piksels linjebredde uavhengig av zoomnivå i editoren.
- **Tester:**
  - visuell: mål linjebredde ved ulike zoomnivåer

#### REQ-0187 – Kamerarammer utelates fra eksport
Kameraets start- og sluttrammer er redigeringshjelpemidler og skal ikke inngå i eksportert film.

- **Kilde:** Kap. 12.2 (l. 538) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, EXPORT
- **Avhengigheter:** REQ-0184
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at rammene er synlige i editoren, når scenen eksporteres eller forhåndsvises i avspillingsmodus, så finnes ingen blå/røde rammekonturer i bildet.
- **Tester:**
  - visuell: eksportert bilde inneholder ikke rammekonturer
  - integrasjon: renderer ignorerer redigeringshjelpemidler

#### REQ-0188 – Kamerabevegelse via redigerbare baner
Kamerabevegelse skal kunne styres med redigerbare baner.

- **Kilde:** Kap. 12.3 (l. 539-540) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et kamera, når brukeren definerer en bane med flere punkter, så følger kameraet banen ved avspilling, og banen kan endres i etterkant.
- **Tester:**
  - enhet: posisjon langs bane som funksjon av tid
  - e2e: tegn og endre bane

#### REQ-0189 – Rette, kurvede og Bézier-baner
Kamerabanene skal støtte rette baner, kurvede baner og Bézier-kurver med redigerbare håndtak og kontrollpunkter.

- **Kilde:** Kap. 12.3 (l. 541-545) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Avhengigheter:** REQ-0188
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan lage en rett bane, en kurvet bane og en Bézier-bane, og flytte kontrollpunkter og håndtak slik at banen endres tilsvarende.
- **Tester:**
  - enhet: Bézier-evaluering og håndtaksoppdatering
  - visuell: bane tegnes i samsvar med kontrollpunkter

#### REQ-0190 – Direkte visuell manipulering av baner
Kamerabaner skal kunne manipuleres visuelt direkte i arbeidsflaten.

- **Kilde:** Kap. 12.3 (l. 546) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, UI
- **Avhengigheter:** REQ-0189
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan dra banepunkter og håndtak direkte på lerretet uten å bruke numeriske felt.
- **Tester:**
  - e2e: dra-og-slipp av banepunkt endrer banedata

#### REQ-0191 – Dobbeltklikk veksler rett/kurvet
Dobbeltklikk på et relevant banepunkt eller segment skal kunne brukes til å veksle mellom rett og kurvet bevegelse, dersom det lar seg implementere på en intuitiv og konsistent måte.

- **Kilde:** Kap. 12.3 (l. 547) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** 3
- **Moduler:** CAMERA, UI
- **Avhengigheter:** REQ-0189
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at funksjonen er implementert, når brukeren dobbeltklikker på et banesegment eller -punkt, så veksler segmentet mellom rett og kurvet, og handlingen kan angres.
- **Tester:**
  - e2e: dobbeltklikk veksler segmenttype
  - manuell: brukertest av intuitivitet
- **Merknad:** Betinget krav («dersom det lar seg implementere …»).

#### REQ-0192 – Kamerabevegelsestyper
Kameraet skal støtte blant annet panorering, zoom, tilt, rotasjon og posisjonsbevegelse.

- **Kilde:** Kap. 12.4 (l. 548-554) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Avhengigheter:** REQ-0188
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver av bevegelsene panorering, zoom, tilt, rotasjon og posisjonsbevegelse kan animeres og gir forventet resultat ved avspilling.
- **Tester:**
  - enhet: kameratransformasjon for hver bevegelsestype
  - visuell: avspilling av hver bevegelsestype
- **Merknad:** «Tilt» i en 2D-editor er ikke definert (vertikal panorering vs. perspektivsimulering) – se OPEN_QUESTIONS B («Tilt» i 2D).

#### REQ-0193 – Flere kamerautsnitt og shots per scene
Kameraet skal støtte flere kamerautsnitt og shots i samme scene.

- **Kilde:** Kap. 12.4 (l. 555) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, TIMELINE · **Invarianter:** INV-10
- **Avhengigheter:** REQ-0182
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt én manusscene, når brukeren oppretter flere shots med ulike kamerautsnitt, så spilles de av i rekkefølge innen scenen, uten at det opprettes nye manusscener.
- **Tester:**
  - enhet: shot-liste per scene
  - e2e: opprett tre shots og spill av

#### REQ-0194 – Kamerabevegelse kombinert med elementanimasjon
Det skal være mulig å kombinere kamerabevegelse med separat animasjon av sceneelementer.

- **Kilde:** Kap. 12.4 (l. 556) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, COMPOSE
- **Avhengigheter:** REQ-0176; REQ-0188
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et element animert med keyframes og et kamera som beveger seg, så spilles begge animasjonene samtidig og uavhengig av hverandre.
- **Tester:**
  - visuell: samtidig kamera- og elementanimasjon
  - enhet: separate animasjonskanaler for kamera og elementer

#### REQ-0195 – Kamera synkronisert med scenetidslinje
Kamerabevegelsene skal være synkronisert med scenens tidslinje.

- **Kilde:** Kap. 12.5 (l. 557-558) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, TIMELINE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når avspillingshodet flyttes til et tidspunkt i scenen, så viser kameraet posisjonen som tilsvarer dette tidspunktet.
- **Tester:**
  - enhet: kameratilstand som funksjon av scenetid
  - e2e: skrubbing gir korrekt kameraposisjon

#### REQ-0196 – Kamera-keyframes, egenskapskanaler og easing
Kameraanimasjon skal støtte nøkkelbilder, separat animasjonsstyring for ulike egenskaper, hastighetskurver og easing.

- **Kilde:** Kap. 12.5 (l. 559-563) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Avhengigheter:** REQ-0195
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan sette keyframes for f.eks. posisjon og zoom uavhengig av hverandre, og velge hastighetskurve/easing for hver.
- **Tester:**
  - enhet: separate keyframe-kanaler per kameraegenskap
  - enhet: easing-funksjoner

#### REQ-0197 – Visuell forhåndsvisning av kamerabevegelse
Systemet skal støtte visuell forhåndsvisning av kamerabevegelser.

- **Kilde:** Kap. 12.5 (l. 564) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA, COMPOSE
- **Avhengigheter:** REQ-0195
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan spille av kamerabevegelsen i editoren og se resultatet gjennom kamerautsnittet.
- **Tester:**
  - e2e: forhåndsvisning av kamerabevegelse

#### REQ-0198 – Justere varighet på bevegelser
Brukeren skal kunne justere varigheten av kamerabevegelsene.

- **Kilde:** Kap. 12.5 (l. 565) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Avhengigheter:** REQ-0195
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en kamerabevegelse på 4 s, når brukeren endrer varigheten til 6 s, så skaleres bevegelsen til 6 s ved avspilling.
- **Tester:**
  - enhet: tidsskalering av keyframes

### Kapittel 13

#### REQ-0199 – Strukturert lydsystem
Animatic Studio skal ha et strukturert lydsystem.

- **Kilde:** Kap. 13 (l. 567-568) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Lyd modelleres som egne ressurser og spor i prosjektmodellen, med typer, koblinger og versjoner (jf. 13.1–13.3).
- **Tester:**
  - manuell: arkitekturgjennomgang av lydmodell

#### REQ-0200 – Skille mellom lydtyper
Systemet skal skille mellom lydtypene dialog, fortellerstemme, lydeffekter, atmosfære og bakgrunnslyd, og musikk.

- **Kilde:** Kap. 13.1 (l. 569-575) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver lydressurs har en av typene dialog, fortellerstemme, lydeffekt, atmosfære/bakgrunn eller musikk, og typen kan brukes til filtrering og sporplassering.
- **Tester:**
  - enhet: lydtype-enum og validering

#### REQ-0201 – Lyd på separate spor
Lydene skal kunne plasseres på separate spor.

- **Kilde:** Kap. 13.1 (l. 576) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, TIMELINE
- **Avhengigheter:** REQ-0200
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan plassere dialog, musikk og effekter på separate spor som kan justeres hver for seg.
- **Tester:**
  - e2e: plasser lyd på tre spor og spill av

#### REQ-0202 – Laste opp lyd
Brukeren skal kunne laste opp lyd.

- **Kilde:** Kap. 13.2 (l. 577-578) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, LIBRARY
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan laste opp vanlige lydformater (f.eks. WAV, MP3), og filen blir en lydressurs i biblioteket.
- **Tester:**
  - import/eksport: opplasting av WAV og MP3

#### REQ-0203 – Generere lyd
Brukeren skal kunne generere lyd.

- **Kilde:** Kap. 13.2 (l. 578) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** AUDIO, PROVIDER · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0269
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en tilkoblet lydleverandør, når brukeren ber om generering og godkjenner kostnad, så lagres resultatet som lydressurs med sporbarhet.
- **Tester:**
  - integrasjon: lydgenerering via adapter med mock-leverandør
- **Merknad:** Ikke presisert om «generere» betyr AI-generering (TTS, musikk, effekter) – antatt AI, derfor fase 5.

#### REQ-0204 – Koble lydfiler til produksjonsobjekter
Lydfiler skal kunne knyttes til karakterer, replikker, scener, delsekvenser, hendelser og produksjoner.

- **Kilde:** Kap. 13.2 (l. 579-585) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, CORE
- **Avhengigheter:** Permanente identiteter (kap. 3.2)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En lydfil kan kobles til hver av objekttypene karakter, replikk, scene, delsekvens, hendelse og produksjon via deres permanente ID-er.
- **Tester:**
  - enhet: relasjonsmodell lyd–objekt
  - dataintegritet: koblinger overlever omnummerering av scener

#### REQ-0205 – Organisere, søke, filtrere og versjonere lyd
Programmet skal støtte organisering, søk, filtrering og versjonering av lyd.

- **Kilde:** Kap. 13.2 (l. 586) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, LIBRARY, VERSION · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0202
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan søke og filtrere lyd på navn, type og kobling, og en ny versjon av en lydressurs bevarer tidligere versjoner.
- **Tester:**
  - enhet: søk/filter på lydmetadata
  - dataintegritet: versjonering bevarer tidligere lydfil

#### REQ-0206 – Dialoglyd synkronisert med manus
Dialoglyd skal kunne synkroniseres med manusblokker og visuelle hendelser.

- **Kilde:** Kap. 13.3 (l. 587-588) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, SCRIPT, TIMELINE
- **Avhengigheter:** Manusblokker med tidskoblinger (kap. 6.1)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en replikk med tilknyttet dialogopptak, når opptaket plasseres på tidslinjen, så er replikken og opptaket koblet slik at klikk på replikken finner opptaket.
- **Tester:**
  - integrasjon: replikk–lyd–tidskobling

#### REQ-0207 – Justere lydklipp
Brukeren skal kunne justere plassering, varighet, klipp og relevante lydinnstillinger.

- **Kilde:** Kap. 13.3 (l. 589) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, TIMELINE
- **Avhengigheter:** REQ-0201
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan flytte et lydklipp, trimme det, endre varighet og justere f.eks. volum/fade, ikke-destruktivt.
- **Tester:**
  - e2e: flytt, trim og volumendring
  - dataintegritet: kildelydfil uendret
- **Merknad:** «Relevante lydinnstillinger» er ikke spesifisert.

#### REQ-0208 – Lyd i avspilling og eksport
Lyden skal være del av både lokal animatic-avspilling og endelig eksport.

- **Kilde:** Kap. 13.3 (l. 590) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO, EXPORT · **Invarianter:** INV-11
- **Avhengigheter:** REQ-0201
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Lyd høres ved lokal avspilling og finnes i eksportert filmfil med korrekt timing.
- **Tester:**
  - import/eksport: eksportert fil har lydspor med korrekt offset
  - e2e: lokal avspilling med lyd

### Kapittel 14

#### REQ-0209 – Komplette animatics uten ekstern AI
Animatic Studio skal kunne produsere komplette animatics fra 2D-sceneeditoren uten at innholdet må sendes til en ekstern AI-modell.

- **Kilde:** Kap. 14 (l. 592-593) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE, TIMELINE, EXPORT · **Invarianter:** INV-11
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at ingen AI-leverandør er konfigurert, så kan en komplett animatic bygges, spilles av og eksporteres.
- **Tester:**
  - e2e: full animatic-flyt med nettverk mot AI-leverandører blokkert
- **Merknad:** Ufravikelig prinsipp nr. 9 i kap. 34.

#### REQ-0210 – Direkte forhåndsvisning av animatic
Programmet skal kunne spille av lagbaserte komposisjoner, kamerabevegelser, objektanimasjon, karakterbevegelser, dialog, lydeffekter og musikk.

- **Kilde:** Kap. 14.1 (l. 594-602) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE, CAMERA, AUDIO · **Invarianter:** INV-11
- **Avhengigheter:** REQ-0176; REQ-0188; REQ-0201
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med lag, kamerabevegelse, objekt- og karakteranimasjon, dialog, effekter og musikk, så spilles alt av synkront i forhåndsvisningen.
- **Tester:**
  - e2e: avspilling av sammensatt testscene
  - visuell: bilde/lyd-synk ved definerte tidspunkter
- **Merknad:** Lyddelene avhenger av fase 4. «Karakterbevegelser» er ikke nærmere definert (rigging/cut-out?).

#### REQ-0211 – Rendre og eksportere 2D-animatics
Programmet skal kunne rendre og eksportere 2D-animatics ved hjelp av applikasjonens egen animasjons- og mediepipeline.

- **Kilde:** Kap. 14.2 (l. 603-604) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** EXPORT, COMPOSE, QUEUE · **Invarianter:** INV-11
- **Avhengigheter:** REQ-0210
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en 2D-animatic, når brukeren eksporterer, så produseres en videofil med bilde og lyd uten bruk av eksterne AI-tjenester.
- **Tester:**
  - import/eksport: eksportert video har forventet varighet, oppløsning og bildefrekvens
- **Merknad:** Ufravikelig prinsipp nr. 9 i kap. 34.

#### REQ-0212 – Renderer i klient, backend eller desktop
Rendering/eksport av 2D-animatics kan teknisk utføres i klienten, via egen backend-renderer eller i en fremtidig desktop-applikasjon.

- **Kilde:** Kap. 14.2 (l. 605) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** EXPORT, COMPOSE, QUEUE
- **Avhengigheter:** Portabilitet (kap. 1.2)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Renderingslogikken er skilt fra UI og har et grensesnitt som kan kjøres både i nettleser og i en backend-tjeneste.
- **Tester:**
  - manuell: arkitekturgjennomgang av renderer-grensesnitt
  - integrasjon: samme testscene rendres likt i klient- og backend-modus (når begge finnes)
- **Merknad:** Mandatet bruker «kan» – en åpning, ikke krav om alle tre. At arkitekturen ikke skal låse seg følger av kap. 1.2 (REQ-0506).

#### REQ-0213 – Eksport uten AI eller betalte API-kall
Rendering og eksport av 2D-animatics skal ikke kreve generativ AI eller betalte AI-API-kall.

- **Kilde:** Kap. 14.2 (l. 606) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** EXPORT, COMPOSE · **Invarianter:** INV-11, INV-12
- **Avhengigheter:** REQ-0211
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Eksport av en 2D-animatic gjennomføres uten noen kall til AI-leverandører og uten kostnadsregistrering.
- **Tester:**
  - integrasjon: overvåk utgående kall under eksport – ingen AI-API-kall

#### REQ-0214 – Hybrid filmmontering
Den samme filmmonteringen skal kunne kombinere redigerbare 2D-animatics, AI-genererte videoklipp, importert ferdig film, stillbilder med definert varighet og lyd fra ulike kilder.

- **Kilde:** Kap. 14.3 (l. 607-613) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, EXPORT, AUDIO
- **Avhengigheter:** REQ-0216; REQ-0235
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en montering med én 2D-scene, ett AI-klipp, ett importert filmklipp og ett stillbilde med 3 s varighet pluss lyd fra flere kilder, så spilles og eksporteres alt som én film.
- **Tester:**
  - e2e: hybrid montering avspilling og eksport
  - import/eksport: varighet = sum av elementer

#### REQ-0215 – AI som valgfritt produksjonslag
AI skal være et valgfritt produksjonslag over den underliggende animatic-strukturen.

- **Kilde:** Kap. 14.3 (l. 614) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, COMPOSE, PROVIDER · **Invarianter:** INV-11
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Datamodellen lar en scene eksistere og spilles av med kun animatic-data; AI-resultater lagres som tilleggsversjoner knyttet til scenen.
- **Tester:**
  - enhet: scene uten AI-versjoner er gyldig og avspillbar
  - manuell: arkitekturgjennomgang

### Kapittel 15

#### REQ-0216 – Overordnet filmtidslinje
Animatic Studio skal ha en egen overordnet filmtidslinje, adskilt fra detaljredigeringen av én enkelt 2D-scene, som er et arbeidssted for å sammenstille den aktive filmen.

- **Kilde:** Kap. 15 (l. 616-618) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, UI · **Invarianter:** INV-01
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Filmtidslinjen er en egen visning som viser hele den aktive filmen, adskilt fra scenens detaljtidslinje i 2D-editoren.
- **Tester:**
  - e2e: åpne filmtidslinje og naviger til scene-editor og tilbake

#### REQ-0217 – Se aktive scener i rekkefølge
Brukeren skal kunne se alle aktive scener i riktig rekkefølge i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 621) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt deaktiverte scener, så vises bare aktive scener, i samme rekkefølge som i aktiv manusvisning.
- **Tester:**
  - e2e: se aktive scener i rekkefølge i filmtidslinjen

#### REQ-0218 – Navigere mellom scener
Brukeren skal kunne navigere mellom scener i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 622) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan hoppe til neste/forrige scene og til en valgt scene, og avspillingshodet flyttes dit.
- **Tester:**
  - e2e: navigere mellom scener i filmtidslinjen

#### REQ-0219 – Se aktivt filmmateriale per scene
Brukeren skal kunne se aktivt filmmateriale for hver scene i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 623) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver scene i tidslinjen viser materialet som er valgt som aktiv filmversjon.
- **Tester:**
  - e2e: se aktivt filmmateriale per scene i filmtidslinjen

#### REQ-0220 – Trimme klipp
Brukeren skal kunne trimme klipp i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 624) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan forkorte et klipp i start eller slutt uten at kildemediet endres.
- **Tester:**
  - e2e: trimme klipp i filmtidslinjen

#### REQ-0221 – Splitte klipp
Brukeren skal kunne splitte klipp i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 625) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan dele et klipp i to på avspillingshodet; begge deler refererer samme kildemedie.
- **Tester:**
  - e2e: splitte klipp i filmtidslinjen

#### REQ-0222 – Justere inn- og utpunkter
Brukeren skal kunne justere inn- og utpunkter for klipp.

- **Kilde:** Kap. 15.1 (l. 626) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan sette inn- og utpunkt bildepresist i forhold til prosjektets bildefrekvens.
- **Tester:**
  - e2e: justere inn- og utpunkter i filmtidslinjen

#### REQ-0223 – Arbeide med overganger
Brukeren skal kunne arbeide med overganger mellom klipp i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 627) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan legge til, endre varighet på og fjerne en overgang (minst kutt og krysstoning) mellom to klipp.
- **Tester:**
  - e2e: arbeide med overganger i filmtidslinjen
- **Merknad:** «Minst kutt og krysstoning» i akseptansekriteriet er en foreslått minimumstolkning – ikke spesifisert i mandatet.

#### REQ-0224 – Justere timing
Brukeren skal kunne justere timing i filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 628) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan endre plassering/varighet av klipp, og samlede tidskoder beregnes på nytt.
- **Tester:**
  - e2e: justere timing i filmtidslinjen

#### REQ-0225 – Forhåndsvise hele filmen
Brukeren skal kunne forhåndsvise hele den samlede filmen.

- **Kilde:** Kap. 15.1 (l. 629) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Avspilling fra start til slutt av aktiv film fungerer uten avbrudd mellom scener av ulik materialtype.
- **Tester:**
  - e2e: forhåndsvise hele filmen i filmtidslinjen

#### REQ-0226 – Eksportere samlet film
Brukeren skal kunne eksportere den samlede filmen fra filmtidslinjen.

- **Kilde:** Kap. 15.1 (l. 630) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, EXPORT
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Eksport av aktiv film gir én fil der rekkefølge og varighet samsvarer med tidslinjen.
- **Tester:**
  - e2e: eksportere samlet film i filmtidslinjen

#### REQ-0227 – Inspirasjon fra klippeprogrammer
Filmtidslinjens grensesnitt kan hente inspirasjon fra profesjonelle klippeprogrammer, men trenger ikke kopiere hele funksjonsbredden deres.

- **Kilde:** Kap. 15.1 (l. 631) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P3 · **Fase:** 4
- **Moduler:** TIMELINE, UI
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Filmtidslinjen bruker kjente konvensjoner fra klippeprogrammer (spor, avspillingshode, trimhåndtak) uten krav om full funksjonsparitet.
- **Tester:**
  - manuell: heuristisk UX-gjennomgang
- **Merknad:** Formulert som «kan hente inspirasjon» – derfor P3 som selvstendig krav.

#### REQ-0228 – Scenflytting i tidslinje speiles i manus
Flytting av en narrativ scene i filmtidslinjen skal gjenspeiles i manus.

- **Kilde:** Kap. 15.2 (l. 632-633) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT, CORE · **Invarianter:** INV-01, INV-03
- **Avhengigheter:** Transaksjonell konsistens (kap. 3.4)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt scene A før B, når brukeren flytter A etter B i filmtidslinjen, så viser manuset umiddelbart A etter B, og scenens ID er uendret.
- **Tester:**
  - integrasjon: flytting i tidslinje oppdaterer manusrekkefølge i samme transaksjon
  - dataintegritet: scene-ID uendret etter flytting
- **Merknad:** Ufravikelig prinsipp nr. 2 i kap. 34.

#### REQ-0229 – Skille fire typer tidslinjeoperasjoner
Systemet skal skille mellom å flytte en hel narrativ scene, å trimme et bestemt medieklipp, å endre et utsnitt fra en scene og å deaktivere narrativt innhold.

- **Kilde:** Kap. 15.2 (l. 634-638) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, CORE, SCRIPT · **Invarianter:** INV-01, INV-14
- **Avhengigheter:** REQ-0228
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver av de fire operasjonene har egen semantikk: bare flytting og deaktivering endrer manusstrukturen; trimming og utsnittsendring endrer kun medie-/forekomstdata.
- **Tester:**
  - enhet: operasjonstyper og deres effekt på manusmodellen
  - integrasjon: trimming endrer ikke manusrekkefølge eller synlighet
- **Merknad:** «Å endre et utsnitt fra en scene» er tvetydig (tidsutdrag vs. kamerautsnitt) – se OPEN_QUESTIONS B («Endre et utsnitt»).

#### REQ-0230 – Trimming sletter ikke manus
Å trimme et klipp skal ikke automatisk slette manus.

- **Kilde:** Kap. 15.2 (l. 639) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0229
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et klipp som dekker en hel manusscene, når klippet trimmes, så er manusteksten uendret.
- **Tester:**
  - dataintegritet: manusinnhold før/etter trimming er identisk

#### REQ-0231 – Avvik når manus ikke dekkes av film
Hvis en redigering gjør at en manuspassasje ikke lenger dekkes av aktiv film, skal dette kunne markeres som et avvik.

- **Kilde:** Kap. 15.2 (l. 640) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, VERSION, SCRIPT
- **Avhengigheter:** REQ-0230; Manusblokker med tidskoblinger (kap. 6.1)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en replikk koblet til et klipp, når klippet trimmes slik at replikken faller utenfor, så markeres replikken som avvik «ikke dekket av aktiv film».
- **Tester:**
  - integrasjon: dekningsberegning mellom manusblokker og aktive klipp
- **Merknad:** Kan alternativt høre til fase 6 (avviksdeteksjon).

#### REQ-0232 – Valg av aktivt produksjonsresultat
Hver scene skal ha et tydelig valg for hvilket produksjonsresultat som representerer scenen i den samlede filmen.

- **Kilde:** Kap. 15.3 (l. 641-642) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, VERSION, CORE
- **Avhengigheter:** Sceneforekomst (kap. 3.3)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver sceneforekomst har nøyaktig én aktiv versjon (eller eksplisitt ingen), og den vises tydelig i scenevisningen.
- **Tester:**
  - enhet: maks én aktiv versjon per sceneforekomst

#### REQ-0233 – Handlingen «Bruk denne»
Brukeren skal kunne velge en aktiv variant, for eksempel gjennom en handling som «Bruk denne».

- **Kilde:** Kap. 15.3 (l. 643-645) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, VERSION, UI
- **Avhengigheter:** REQ-0232
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når brukeren klikker «Bruk denne» på en variant, så blir den aktiv versjon i filmmonteringen, og handlingen kan angres.
- **Tester:**
  - e2e: bytt aktiv variant og verifiser i filmavspilling
- **Merknad:** Linjen «Bruk denne» er duplisert (l. 644–645).

#### REQ-0234 – Andre varianter bevares
Når en aktiv variant velges, skal andre varianter bevares.

- **Kilde:** Kap. 15.3 (l. 646) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** VERSION · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0233
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter bytte av aktiv variant finnes alle tidligere varianter fortsatt og kan gjenaktiveres.
- **Tester:**
  - dataintegritet: antall varianter uendret etter aktivering
- **Merknad:** Ufravikelig prinsipp nr. 6 i kap. 34.

### Kapittel 16

#### REQ-0235 – Importere eksisterende ferdig film
Brukeren skal kunne importere film som allerede er produsert utenfor Animatic Studio.

- **Kilde:** Kap. 16 (l. 648-649) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** LIBRARY, TIMELINE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan importere vanlige videoformater (f.eks. MP4/MOV), og filen blir en medieressurs i prosjektet.
- **Tester:**
  - import/eksport: import av MP4 og MOV
- **Merknad:** Ufravikelig prinsipp nr. 15 i kap. 34.

#### REQ-0236 – Koble importert klipp til manus
Et importert filmklipp skal kunne knyttes til en hel manusscene, en del av en manusscene, flere sammenhengende scener eller et bestemt tidsintervall.

- **Kilde:** Kap. 16.1 (l. 650-655) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0235
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et klipp kan kobles til hver av: én hel scene, en del av en scene, flere sammenhengende scener og et tidsintervall; koblingen bruker permanente ID-er.
- **Tester:**
  - enhet: koblingsmodell for alle fire varianter
  - dataintegritet: kobling overlever omnummerering
- **Merknad:** Ufravikelig prinsipp nr. 15 i kap. 34.

#### REQ-0237 – Angi nøyaktig manusdekning
Brukeren skal kunne angi nøyaktig hvilken del av manuset et importert klipp dekker.

- **Kilde:** Kap. 16.1 (l. 656) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT
- **Avhengigheter:** REQ-0236
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan markere start- og sluttpunkt i manuset (manusblokk) som klippet dekker, og markeringen lagres.
- **Tester:**
  - e2e: marker manusdekning for importert klipp

#### REQ-0238 – Hente mediemetadata
Programmet skal kunne hente relevante metadata fra importert film, for eksempel varighet, oppløsning, bildefrekvens, lydspor og andre relevante tekniske egenskaper.

- **Kilde:** Kap. 16.2 (l. 657-663) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** LIBRARY, EXPORT
- **Avhengigheter:** REQ-0235
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter import vises varighet, oppløsning, bildefrekvens og antall/type lydspor korrekt for testfiler.
- **Tester:**
  - import/eksport: metadata for kjente testfiler samsvarer med ffprobe-referanse

#### REQ-0239 – Delvis ferdig scene med animatic-rest
Hvis bare en del av en scene er ferdig produsert, skal den ferdige delen kunne brukes sammen med animatic-materiale for resten.

- **Kilde:** Kap. 16.3 (l. 664-665) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0236; REQ-0214
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene der første halvdel er importert film, så kan andre halvdel dekkes av 2D-animatic, og avspilling går sømløst mellom dem.
- **Tester:**
  - e2e: avspilling av delvis ferdig scene

#### REQ-0240 – Montering fungerer ved ufullstendig produksjon
Den samlede filmmonteringen skal fungere også når produksjonen er ufullstendig.

- **Kilde:** Kap. 16.3 (l. 666) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0216
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt scener uten produsert materiale, så kan filmen likevel spilles av og eksporteres (f.eks. med plassholder for manglende materiale).
- **Tester:**
  - e2e: avspilling av film med scener uten materiale
- **Merknad:** Hvordan manglende materiale vises (plassholder, sort, manustekst) er ikke spesifisert.

#### REQ-0241 – Status for importert film
Importert film skal kunne få status som referanse, under arbeid, godkjent eller aktiv filmversjon.

- **Kilde:** Kap. 16.4 (l. 667-672) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** VERSION, LIBRARY
- **Avhengigheter:** REQ-0235; REQ-0232
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan sette hver av statusene referanse, under arbeid, godkjent og aktiv filmversjon på et importert klipp, og statusen vises og lagres.
- **Tester:**
  - enhet: statusoverganger
- **Merknad:** Forhold mellom status «aktiv filmversjon» og valg av aktiv variant (15.3) er uavklart.

#### REQ-0242 – Import bevarer kildemateriale
Import av film skal ikke ødelegge eller erstatte eksisterende kildemateriale.

- **Kilde:** Kap. 16.4 (l. 673) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** LIBRARY, VERSION, SECURITY · **Invarianter:** INV-07, INV-13
- **Avhengigheter:** REQ-0235
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt eksisterende materiale for en scene, når ny film importeres for samme scene, så er alt tidligere materiale uendret og tilgjengelig.
- **Tester:**
  - dataintegritet: hash av eksisterende mediefiler uendret etter ny import
- **Merknad:** Ufravikelig prinsipp nr. 27 i kap. 34.

### Kapittel 17

#### REQ-0243 – Brukerhandlingen «Generer scene»
En sentral brukerhandling skal være «Generer scene».

- **Kilde:** Kap. 17 (l. 675-677) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Handlingen «Generer scene» er tilgjengelig fra scenevisningen.
- **Tester:**
  - e2e: handlingen finnes og starter genereringsflyt

#### REQ-0244 – Samle info og bygge genereringsinstruksjon
Når «Generer scene» aktiveres, skal systemet samle all relevant informasjon og bygge presise genereringsinstruksjoner.

- **Kilde:** Kap. 17 (l. 678) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT
- **Avhengigheter:** REQ-0243
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når «Generer scene» aktiveres, så produseres en strukturert instruksjon som brukeren kan se før noen betalt jobb starter.
- **Tester:**
  - integrasjon: promptbygging fra testscene gir forventet struktur

#### REQ-0245 – Promptmotorens informasjonskilder
Promptmotoren skal kunne hente informasjon om manusets handling, replikker, karakterer, karakterenes aktive utseendetilstander, godkjente karakterreferanser, objekter og rekvisitter, lokasjon, miljø, visuell stil, kamerautsnitt, kamerabevegelser, laginformasjon fra 2D-editoren, scenevarighet, tidslinje, kontinuitetskrav, relevant materiale fra forrige og neste sekvens, ønsket AI-modell og modellens tekniske krav.

- **Kilde:** Kap. 17.1 (l. 679-698) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, CONTINUITY, LIBRARY, COMPOSE, CAMERA · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0244; Kontinuitetsmotor (kap. 10)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en testscene inneholder promptmotorens innsamlede kontekst alle 18 kategorier (der data finnes), inkludert aktiv utseendetilstand etter fortellingstid.
- **Tester:**
  - enhet: kontekstinnsamling per kategori
  - integrasjon: karaktertilstand før/etter kontinuitetshendelse velges korrekt

#### REQ-0246 – Modellspesifikk prompt
Den innsamlede informasjonen skal omformes til en egnet genereringsprompt for den valgte modellen.

- **Kilde:** Kap. 17.1 (l. 699) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, PROVIDER
- **Avhengigheter:** REQ-0245; REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Samme scene gir ulike prompter for to modeller med ulike kapabiliteter, og hver prompt holder seg innenfor modellens beskrevne begrensninger.
- **Tester:**
  - enhet: promptmal per adapter
  - integrasjon: validering mot adapterens kapabilitetsbeskrivelse

#### REQ-0247 – Engelske prompter som hovedregel
Tekniske systeminstruksjoner og genereringsprompter skal som hovedregel formuleres på engelsk, også når manuset og brukergrensesnittet er norske.

- **Kilde:** Kap. 17.2 (l. 700-702) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et norsk manus og norsk UI, så er genererte systeminstruksjoner og prompter på engelsk (unntatt ordrett dialog).
- **Tester:**
  - enhet: språkdeteksjon på genererte prompter
- **Merknad:** Ufravikelig prinsipp nr. 12 i kap. 34.

#### REQ-0248 – Bevare norsk dialog ordrett
Systemet skal bevare den opprinnelige norske dialogen når dialogen skal brukes ordrett i genereringen.

- **Kilde:** Kap. 17.2 (l. 703) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, L10N · **Invarianter:** INV-05
- **Avhengigheter:** REQ-0247
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en replikk som skal sies ordrett, så finnes replikkens norske tekst tegn-for-tegn identisk i prompten.
- **Tester:**
  - enhet: ordrett dialog i prompt er identisk med manustekst

#### REQ-0249 – Ingen utilsiktet omskriving av replikker
Oversettelse av instruksjoner må ikke føre til utilsiktet omskriving av replikkene.

- **Kilde:** Kap. 17.2 (l. 704) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, L10N · **Invarianter:** INV-05
- **Avhengigheter:** REQ-0248
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Replikker som er merket som ordrett dialog sendes aldri gjennom oversettelsessteget.
- **Tester:**
  - enhet: dialog-segmenter er beskyttet/markert i promptbyggeren

#### REQ-0250 – Åpne genereringsprompten
Brukeren skal kunne åpne genereringsprompten.

- **Kilde:** Kap. 17.3 (l. 706-707) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, UI
- **Avhengigheter:** REQ-0244
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Fra scenen kan brukeren åpne gjeldende genereringsprompt i en egen visning.
- **Tester:**
  - e2e: åpne prompt
- **Merknad:** Ufravikelig prinsipp nr. 11 (synlige prompter) i kap. 34.

#### REQ-0251 – Lese genereringsprompten
Brukeren skal kunne lese genereringsprompten i sin helhet.

- **Kilde:** Kap. 17.3 (l. 708) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, UI
- **Avhengigheter:** REQ-0250
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hele prompten, inkludert systeminstruksjon, vises i lesbar form uten avkorting.
- **Tester:**
  - e2e: prompttekst i UI er identisk med prompt som sendes

#### REQ-0252 – Redigere prompt manuelt
Brukeren skal kunne redigere genereringsprompten manuelt.

- **Kilde:** Kap. 17.3 (l. 709) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, UI
- **Avhengigheter:** REQ-0251
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan endre prompttekst, og endringen brukes ved neste generering.
- **Tester:**
  - e2e: rediger prompt og verifiser sendt payload (mock)
- **Merknad:** Ufravikelig prinsipp nr. 11 (redigerbare prompter) i kap. 34.

#### REQ-0253 – Lagre redigert prompt
Brukeren skal kunne lagre en redigert versjon av genereringsprompten.

- **Kilde:** Kap. 17.3 (l. 710) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, VERSION
- **Avhengigheter:** REQ-0252
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Redigert prompt lagres som egen versjon og finnes etter omlasting.
- **Tester:**
  - dataintegritet: redigert prompt persisteres med versjon

#### REQ-0254 – Kjøre «Generer scene» på nytt
Brukeren skal kunne kjøre «Generer scene» på nytt med endringene i prompten.

- **Kilde:** Kap. 17.3 (l. 711) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, QUEUE · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0253
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en lagret redigert prompt, når brukeren kjører «Generer scene» igjen og godkjenner kostnad, så brukes den redigerte prompten.
- **Tester:**
  - integrasjon: regenerering bruker redigert prompt

#### REQ-0255 – Skille automatisk og manuell prompt
Systemet skal skille mellom automatisk generert promptinnhold og manuelle overstyringer.

- **Kilde:** Kap. 17.3 (l. 712) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, VERSION
- **Avhengigheter:** REQ-0252
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Promptdata lagrer automatisk generert del og manuelle overstyringer separat, og UI markerer hvilke deler som er manuelt endret.
- **Tester:**
  - enhet: promptmodell med auto- og overstyringslag

#### REQ-0256 – Manuelle promptendringer forsvinner ikke
Manuelle endringer i prompter skal ikke forsvinne ubemerket ved senere regenerering.

- **Kilde:** Kap. 17.3 (l. 713) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, VERSION
- **Avhengigheter:** REQ-0255
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en manuelt endret prompt, når underliggende data endres og prompten bygges på nytt, så beholdes overstyringen eller brukeren varsles eksplisitt om konflikt.
- **Tester:**
  - integrasjon: ombygging av prompt med manuell overstyring
- **Merknad:** Knyttes til ufravikelig prinsipp nr. 27 (ingen destruktive endringer uten eksplisitt beslutning).

#### REQ-0257 – Full sporbarhet per generering
For hver generering skal programmet bevare systeminstruksjon, genereringsprompt, valgt modell, modellparametere, referanser, ressursversjoner, manusversjon, kostnadsinformasjon, genereringsresultat samt tidspunkt og status.

- **Kilde:** Kap. 17.4 (l. 714-725) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** VERSION, PROMPT, QUALITYCOST, QUEUE · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0244
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver genereringsjobb har en uforanderlig post med alle ti feltene utfylt (eller eksplisitt tomme).
- **Tester:**
  - dataintegritet: genereringslogg inneholder alle felt
  - enhet: postene kan ikke endres etter fullføring

#### REQ-0258 – Sammenligne genereringsforsøk
Det skal være mulig å sammenligne genereringsforsøk.

- **Kilde:** Kap. 17.4 (l. 726) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** VERSION, UI
- **Avhengigheter:** REQ-0257
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan velge to genereringsforsøk og se resultatene og forskjeller i prompt/parametere side ved side.
- **Tester:**
  - e2e: sammenligningsvisning av to forsøk

### Kapittel 18

#### REQ-0259 – Automatisk håndtering av lange scener
Manusscener som er lengre enn en videomodell tillater i ett API-kall, skal håndteres automatisk så langt det er teknisk mulig.

- **Kilde:** Kap. 18 (l. 728-730) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, QUEUE, PROVIDER · **Invarianter:** INV-10
- **Avhengigheter:** REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene på 40 s og en modell med maks 10 s, så foreslår/planlegger systemet generering uten at brukeren må dele scenen manuelt.
- **Tester:**
  - integrasjon: segmentplan for lang scene med mock-adapter

#### REQ-0260 – Dele generering i segmenter
Når en scene overstiger modellens begrensninger, skal systemet kunne dele genereringsarbeidet i kortere segmenter.

- **Kilde:** Kap. 18.1 (l. 731-732) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, TIMELINE, QUEUE · **Invarianter:** INV-10
- **Avhengigheter:** REQ-0259
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt maks varighet M, så har alle segmenter varighet ≤ M og samlet dekker de hele scenen.
- **Tester:**
  - enhet: segmenteringsalgoritme dekker scenen uten hull/overlapp utover planlagt overlapp
- **Merknad:** Ufravikelig prinsipp nr. 14 i kap. 34.

#### REQ-0261 – Skjule API-begrensninger for brukeren
Brukeren skal ikke måtte forstå API-begrensningene for å oppnå en samlet scene.

- **Kilde:** Kap. 18.1 (l. 733) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, UI
- **Avhengigheter:** REQ-0260
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan generere en lang scene med én handling, og segmenteringen skjer uten at brukeren må angi segmentgrenser.
- **Tester:**
  - manuell: brukertest av generering av lang scene

#### REQ-0262 – Segmentering tar hensyn til kontinuitet
Segmenteringen skal ta hensyn til narrative hendelser, dialog, kamerabevegelser, karaktertilstander, objekter, visuell stil og referanser fra tilstøtende segmenter.

- **Kilde:** Kap. 18.2 (l. 734-742) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, CONTINUITY, CAMERA · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0260
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Segmentgrenser legges ikke midt i en replikk eller midt i en kamerabevegelse når et alternativ finnes, og hvert segment får riktige karaktertilstander, objekter, stil og referanse fra naboen.
- **Tester:**
  - enhet: segmentgrenser respekterer replikk- og bevegelsesgrenser
  - integrasjon: segmentprompter inneholder naboreferanser

#### REQ-0263 – Kontinuitetsmekanismer mellom segmenter
Referansebilder eller andre støttede kontinuitetsmekanismer skal brukes når det er relevant.

- **Kilde:** Kap. 18.2 (l. 743) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT, PROVIDER
- **Avhengigheter:** REQ-0262; REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en modell som støtter referansebilder/sisteramme-inndata, så sendes f.eks. siste bilde fra forrige segment som referanse til neste.
- **Tester:**
  - integrasjon: adapter med referansestøtte mottar referanse fra forrige segment

#### REQ-0264 – Sette segmenter sammen til én scene
Etter generering skal segmentene kunne settes sammen til én scene.

- **Kilde:** Kap. 18.3 (l. 744-745) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0260
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ferdige segmenter vises og spilles som én sammenhengende scene i filmtidslinjen.
- **Tester:**
  - e2e: sammensatt scene spilles av som én enhet

#### REQ-0265 – Riktig rekkefølge, timing og overganger
Sammensettingen av segmenter skal ivareta riktig rekkefølge, timing og eventuelle overganger.

- **Kilde:** Kap. 18.3 (l. 746) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0264
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Segmentene plasseres i planlagt rekkefølge og ved planlagte tidspunkter, med definerte overganger der det er satt.
- **Tester:**
  - enhet: sammensetting etter segmentplan

#### REQ-0266 – Individuell revisjon av segmenter
Segmentene skal fortsatt være tilgjengelige for individuell revisjon etter sammensetting.

- **Kilde:** Kap. 18.3 (l. 747) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** TIMELINE, VERSION
- **Avhengigheter:** REQ-0264
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan regenerere eller bytte ett segment uten å påvirke de andre segmentene i scenen.
- **Tester:**
  - integrasjon: regenerering av ett segment

#### REQ-0267 – Segmentering endrer ikke manusstruktur
Automatisk segmentering skal ikke opprette nye manusscener, endre scenenummer eller endre den narrative sceneidentiteten.

- **Kilde:** Kap. 18.4 (l. 748-752) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** CORE, SCRIPT, TIMELINE · **Invarianter:** INV-02, INV-03, INV-10
- **Avhengigheter:** REQ-0260
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter segmentering av en scene er antall manusscener, scenenumre og scene-ID-er uendret.
- **Tester:**
  - dataintegritet: manusstruktur før/etter segmentering er identisk
- **Merknad:** Ufravikelig prinsipp nr. 14 i kap. 34.

#### REQ-0268 – Skille manusstruktur og genereringsstruktur
Systemet skal skille klart mellom manusstruktur og teknisk genereringsstruktur.

- **Kilde:** Kap. 18.4 (l. 753) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, TIMELINE · **Invarianter:** INV-10
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Datamodellen har egne entiteter for genereringssegmenter som refererer til, men ikke er, manusscener.
- **Tester:**
  - manuell: datamodellgjennomgang
  - enhet: segment-entitet har scene-ID-referanse

### Kapittel 19

#### REQ-0269 – Leverandøruavhengig AI-arkitektur
Programmet skal ha en leverandøruavhengig arkitektur for integrasjon med relevante bilde-, video- og lydmodeller.

- **Kilde:** Kap. 19 (l. 755-756) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** PROVIDER, PROMPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et nytt leverandøradapter kan legges til uten endring i kjerne-, manus- eller tidslinjemoduler.
- **Tester:**
  - manuell: arkitekturgjennomgang
  - integrasjon: to mock-adaptere bak samme grensesnitt
- **Merknad:** Ufravikelig prinsipp nr. 11 (modellagnostisk) i kap. 34.

#### REQ-0270 – Koble egne API-kontoer
Brukeren skal kunne koble egne API-kontoer der leverandøren støtter det.

- **Kilde:** Kap. 19.1 (l. 757-758) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROVIDER, SECURITY
- **Avhengigheter:** REQ-0269
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan registrere egen API-nøkkel for en støttet leverandør, og nøkkelen valideres.
- **Tester:**
  - integrasjon: registrering og validering av nøkkel mot mock

#### REQ-0271 – Sikker nøkkelhåndtering
API-nøkler skal håndteres sikkert.

- **Kilde:** Kap. 19.1 (l. 759) · **Opprinnelse:** mandat · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, PROVIDER
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - API-nøkler lagres kryptert på serversiden og brukes bare fra backend ved kall til leverandør.
- **Tester:**
  - manuell: sikkerhetsgjennomgang
  - integrasjon: nøkkel kan ikke hentes ut i klartekst via klient-API
- **Merknad:** Lagringsarkitektur for hemmeligheter må på plass i fase 1 (Security & Storage), selv om bruken kommer i fase 5.

#### REQ-0272 – Hemmeligheter aldri eksponert
Hemmeligheter skal ikke lagres ukryptert i klientkode eller eksponeres i prosjektfiler og logger.

- **Kilde:** Kap. 19.1 (l. 760) · **Opprinnelse:** mandat · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, EXPORT
- **Avhengigheter:** REQ-0271
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Søk etter nøkkelverdi i klientbunt, eksporterte prosjektfiler/backup og logger gir ingen treff.
- **Tester:**
  - integrasjon: hemmelighetsskanning av klientbunt, prosjekteksport og logger

#### REQ-0273 – Adaptere beskriver faktiske muligheter
Hver leverandørintegrasjon skal beskrive sine faktiske muligheter, blant annet støttet oppgavetype, maksimal videovarighet, støttet oppløsning, referansebilder, bilde-til-video-funksjoner, tidsbegrensninger, kvalitetsparametere, tilgjengelige lydfunksjoner, kostnadsmodell og begrensninger.

- **Kilde:** Kap. 19.2 (l. 761-772) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROVIDER, QUALITYCOST
- **Avhengigheter:** REQ-0269
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert adapter eksponerer en strukturert kapabilitetsbeskrivelse med alle ti feltene.
- **Tester:**
  - enhet: skjema-validering av kapabilitetsbeskrivelse

#### REQ-0274 – Ingen antakelse om felles parametere
Systemet skal ikke anta at alle modeller støtter de samme parameterne.

- **Kilde:** Kap. 19.2 (l. 773) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROVIDER, PROMPT
- **Avhengigheter:** REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Parametere som en modell ikke støtter, sendes ikke og vises ikke som tilgjengelige for den modellen.
- **Tester:**
  - enhet: parameterfiltrering basert på kapabilitet

#### REQ-0275 – Innsatsnivå per oppgave
Brukeren skal kunne velge ønsket innsatsnivå per oppgave: «Rask / Økonomisk» (prioriterer lavere kostnad og raske skisser), «Balansert» (prioriterer en hensiktsmessig kombinasjon av kvalitet, pris og behandlingstid) og «Høy / Premium» (prioriterer mer omfattende generering, referansekontroll og kvalitetssikring der dette støttes).

- **Kilde:** Kap. 19.3 (l. 774-783) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUALITYCOST, UI · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0269
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hver genereringsoppgave kan brukeren velge ett av tre nivåer, og valget lagres med jobben.
- **Tester:**
  - e2e: velg nivå og verifiser at det lagres i jobbposten
- **Merknad:** Linjene «Rask / Økonomisk» (l. 776–777) og «Høy / Premium» (l. 781–782) er duplisert. Ufravikelig prinsipp nr. 13 i kap. 34.

#### REQ-0276 – Innsatsnivå til leverandørfunksjoner
Valgt innsatsnivå skal oversettes til konkrete funksjoner hos den valgte leverandøren.

- **Kilde:** Kap. 19.3 (l. 784) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, PROVIDER
- **Avhengigheter:** REQ-0275; REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en gitt modell gir hvert nivå et dokumentert sett med konkrete parametere (f.eks. oppløsning, antall kandidater).
- **Tester:**
  - enhet: mapping nivå→parametere per adapter

#### REQ-0277 – Ikke love bedre resultat for pris
Programmet skal ikke love at høyere kostnad garanterer bedre resultat.

- **Kilde:** Kap. 19.3 (l. 785) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, UI
- **Avhengigheter:** REQ-0275
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Tekster i nivåvelger og kostnadsdialog formulerer høyere nivå som prioritering, ikke garanti.
- **Tester:**
  - manuell: språkgjennomgang av UI-tekster

#### REQ-0278 – Vise tilgjengelige kvalitetsmekanismer
Systemet skal vise hvilke modellspesifikke kvalitetsmekanismer som faktisk er tilgjengelige for valgt modell – f.eks. justerbar resonneringsinnsats, eller kvalitetsvalg gjennom oppløsning, varighet, flere kandidater, flere iterasjoner, referansestyring, kvalitetskontroll og andre parametere.

- **Kilde:** Kap. 19.4 (l. 786-796) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, PROVIDER, UI
- **Avhengigheter:** REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved valg av modell vises kun de kvalitetsmekanismene adapteret oppgir som støttet.
- **Tester:**
  - integrasjon: UI viser mekanismer i samsvar med kapabilitetsbeskrivelse

#### REQ-0279 – Kostnadsestimat før betalt oppgave
Før en betalt oppgave starter, skal brukeren få et tydelig kostnadsestimat.

- **Kilde:** Kap. 19.5 (l. 797-798) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUALITYCOST, QUEUE, UI · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0273
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen betalt jobb sendes til leverandør før brukeren har sett estimat og godkjent det.
- **Tester:**
  - integrasjon: jobb uten godkjent estimat blokkeres
- **Merknad:** Ufravikelig prinsipp nr. 13 i kap. 34.

#### REQ-0280 – Innhold i kostnadsestimat
Kostnadsestimatet skal så langt mulig inkludere modellvalg, antall genereringer, varighet, oppløsning, kvalitetsprofil, eventuelle ekstrarunder og samlet forventet kostnad.

- **Kilde:** Kap. 19.5 (l. 799-806) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, UI
- **Avhengigheter:** REQ-0279
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Estimatdialogen viser de sju elementene der data finnes.
- **Tester:**
  - enhet: estimatberegning
  - e2e: estimatdialog viser alle felt

#### REQ-0281 – Merke usikre estimater
Usikre kostnadsestimater skal merkes tydelig.

- **Kilde:** Kap. 19.5 (l. 807) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, UI
- **Avhengigheter:** REQ-0280
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når adapteret oppgir usikker pris (f.eks. variabelt antall runder), vises estimatet med tydelig usikkerhetsmerking/intervall.
- **Tester:**
  - visuell: usikkerhetsmerking i estimatdialog

#### REQ-0282 – Budsjettrammer på flere nivåer
Brukeren skal kunne sette kostnadsrammer for en enkelt jobb, en scene, en gruppe scener, en produksjon og et helt prosjekt.

- **Kilde:** Kap. 19.6 (l. 808-814) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0279
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan sette ramme på hvert av de fem nivåene, og den strengeste gjeldende rammen håndheves.
- **Tester:**
  - enhet: budsjetthierarki og håndheving

#### REQ-0283 – Vise estimert og faktisk forbruk
Det skal være mulig å se estimert og registrert faktisk API-forbruk.

- **Kilde:** Kap. 19.6 (l. 815) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, UI
- **Avhengigheter:** REQ-0257
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En forbruksoversikt viser estimert og faktisk kostnad per jobb og aggregert per nivå.
- **Tester:**
  - integrasjon: faktisk kostnad registreres fra adapter

#### REQ-0284 – Ingen generering utenfor rammer
Ingen ekstra betalte genereringer skal utføres utenfor brukerens godkjente rammer.

- **Kilde:** Kap. 19.6 (l. 816) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUALITYCOST, QUEUE · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0282
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et oppbrukt budsjett, når en ny betalt jobb eller automatisk ekstrarunde forsøkes, så stoppes den og brukeren varsles.
- **Tester:**
  - integrasjon: kø stopper jobb som overskrider ramme
  - enhet: automatiske retries teller mot rammen

#### REQ-0285 – Generere og sammenligne kandidater
Brukeren skal kunne generere flere kandidater og sammenligne dem side ved side.

- **Kilde:** Kap. 19.7 (l. 817-818) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST, VERSION, UI · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0279
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan bestille N kandidater (etter kostnadsgodkjenning) og se dem side ved side.
- **Tester:**
  - e2e: generer 3 kandidater med mock og vis side ved side

#### REQ-0286 – Aktivere kandidat uten å slette andre
Den foretrukne kandidaten skal kunne aktiveres uten å slette de andre.

- **Kilde:** Kap. 19.7 (l. 819) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** VERSION · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0285
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter aktivering av én kandidat finnes alle andre kandidater fortsatt.
- **Tester:**
  - dataintegritet: kandidater bevares etter aktivering
- **Merknad:** Ufravikelig prinsipp nr. 6 i kap. 34. Mandatet sier «varianten»; i 19.7 betyr det genereringskandidat, ikke scenevariant (DEC-0015).

#### REQ-0287 – Støtte for kvalitetskontroll
Systemet skal kunne hjelpe brukeren å evaluere om generert materiale følger manus, karakterreferanser, stil, kontinuitet og kamera- og sceneinstruksjoner.

- **Kilde:** Kap. 19.8 (l. 820-826) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** QUALITYCOST, CONTINUITY
- **Avhengigheter:** REQ-0257
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For et generert klipp kan brukeren få en vurdering per kriterium (manus, karakterreferanser, stil, kontinuitet, kamera/sceneinstruksjon).
- **Tester:**
  - integrasjon: vurderingsrapport med fem kriterier
  - manuell: kvalitativ vurdering av nytte
- **Merknad:** Fasetilordning usikker (fase 5/6/8) – se ROADMAP (kvalitetskontroll fase 6/8).

#### REQ-0288 – Automatiske vurderinger er støtte
Automatiske kvalitetsvurderinger skal fremstilles som støtte, ikke garantier.

- **Kilde:** Kap. 19.8 (l. 827) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** QUALITYCOST, UI
- **Avhengigheter:** REQ-0287
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Vurderinger vises som rådgivende, og ingen automatisk vurdering godkjenner eller forkaster materiale uten brukerens beslutning.
- **Tester:**
  - manuell: UI-tekst og flyt-gjennomgang

### Kapittel 20

#### REQ-0289 – Robust produksjonskø
Animatic Studio skal ha en robust produksjonskø.

- **Kilde:** Kap. 20 (l. 829-830) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Køen tåler omstart av klient og backend uten tap av jobber eller status.
- **Tester:**
  - integrasjon: restart av backend under kjørende jobb

#### REQ-0290 – Massegenerering av scener
Brukeren skal kunne velge flere scener og legge dem i kø (f.eks. markere 15 scener og starte generering før vedkommende forlater arbeidsplassen).

- **Kilde:** Kap. 20.1 (l. 831-833) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, UI · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0289; REQ-0279
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt 15 valgte scener, når brukeren starter massegenerering og godkjenner samlet estimat, så legges 15 jobber i kø.
- **Tester:**
  - e2e: massevalg og køing av 15 scener

#### REQ-0291 – Jobber uavhengige av nettleserfane
Renderingsjobber skal ikke være avhengige av at en bestemt nettleserfane forblir åpen.

- **Kilde:** Kap. 20.2 (l. 834-835) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0293
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt kjørende jobber, når nettleserfanen lukkes, så fortsetter jobbene og fullføres.
- **Tester:**
  - e2e: lukk fane under kjøring og verifiser fullføring
- **Merknad:** Ufravikelig prinsipp nr. 26 i kap. 34.

#### REQ-0292 – Lagre og hente jobbstatus
Jobbstatus skal kunne lagres og hentes igjen senere.

- **Kilde:** Kap. 20.2 (l. 836) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUEUE, SECURITY
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Status for alle jobber er persistent og kan hentes etter ny innlogging fra en annen nettleser.
- **Tester:**
  - integrasjon: hent jobbstatus i ny økt
- **Merknad:** Ufravikelig prinsipp nr. 26 i kap. 34.

#### REQ-0293 – Vedvarende backend-jobbarkitektur
Langvarige oppgaver skal utføres i en egnet vedvarende backend-jobbarkitektur.

- **Kilde:** Kap. 20.2 (l. 837) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** QUEUE
- **Avhengigheter:** Backend-valg (kap. 1.2)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Langvarige oppgaver kjøres i en backend-jobbtjeneste med persistent kø, ikke i klienten.
- **Tester:**
  - manuell: arkitekturgjennomgang
- **Merknad:** Ufravikelig prinsipp nr. 26 i kap. 34; kap. 1.2 sier at Lovable alene ikke kan antas å håndtere dette.

#### REQ-0294 – Jobbstatuser i køen
Køen skal vise statusene venter, klargjøres, genereres, etterbehandles, fullført, mislykket og stoppet eller avbrutt.

- **Kilde:** Kap. 20.3 (l. 838-846) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, UI
- **Avhengigheter:** REQ-0292
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver jobb har til enhver tid én av de sju statusene, og overganger vises i køvisningen.
- **Tester:**
  - enhet: tilstandsmaskin for jobbstatus

#### REQ-0295 – Vise pålitelig fremdrift
Køen skal vise fremdrift når dette kan beregnes pålitelig.

- **Kilde:** Kap. 20.3 (l. 847) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, UI
- **Avhengigheter:** REQ-0294
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Fremdriftsindikator vises bare når adapter/jobb gir pålitelig fremdrift; ellers vises ubestemt indikator.
- **Tester:**
  - enhet: fremdriftsvisning avhengig av kapabilitet

#### REQ-0296 – Oversikt ved gjenåpning
Når brukeren åpner programmet igjen, skal vedkommende kunne se hva som er ferdig, hva som fortsatt kjører, hvilke jobber som feilet og hvilke resultater som kan gjennomgås.

- **Kilde:** Kap. 20.4 (l. 848-853) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, UI
- **Avhengigheter:** REQ-0292
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved innlogging etter fravær vises en oppsummering med fire grupper: ferdig, kjører, feilet, klar til gjennomgang.
- **Tester:**
  - e2e: gjenopptakelsesvisning etter simulert fravær

#### REQ-0297 – Forsøk på nytt
Systemet skal kunne støtte forsøk på nytt for mislykkede jobber.

- **Kilde:** Kap. 20.5 (l. 854-856) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, QUALITYCOST · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En mislykket jobb kan startes på nytt; automatiske nye forsøk respekterer kostnadsrammer.
- **Tester:**
  - integrasjon: forsøk på nytt med mock-leverandør

#### REQ-0298 – Håndtering av API-begrensninger
Køen skal støtte håndtering av API-begrensninger (f.eks. ratebegrensning).

- **Kilde:** Kap. 20.5 (l. 857) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved ratebegrensningssvar fra leverandør venter køen og prøver igjen uten at jobben markeres som mislykket.
- **Tester:**
  - integrasjon: håndtering av api-begrensninger med mock-leverandør

#### REQ-0299 – Feilmeldinger
Køen skal gi feilmeldinger for mislykkede jobber.

- **Kilde:** Kap. 20.5 (l. 858) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Mislykkede jobber viser en forståelig feilmelding og teknisk detalj (uten hemmeligheter).
- **Tester:**
  - integrasjon: feilmeldinger med mock-leverandør

#### REQ-0300 – Køprioritering
Køen skal støtte køprioritering.

- **Kilde:** Kap. 20.5 (l. 859) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan endre prioritet/rekkefølge på ventende jobber, og høyere prioritet startes først.
- **Tester:**
  - integrasjon: køprioritering med mock-leverandør

#### REQ-0301 – Kontroll av parallellitet
Køen skal støtte kontroll av parallellitet.

- **Kilde:** Kap. 20.5 (l. 860) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Maks antall samtidige jobber kan settes (per leverandør/prosjekt) og overholdes.
- **Tester:**
  - integrasjon: kontroll av parallellitet med mock-leverandør

#### REQ-0302 – Kostnadsgrenser i køen
Køen skal håndheve kostnadsgrenser.

- **Kilde:** Kap. 20.5 (l. 861) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE, QUALITYCOST · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Jobber som vil overskride gjeldende ramme startes ikke.
- **Tester:**
  - integrasjon: kostnadsgrenser i køen med mock-leverandør
- **Merknad:** Kostnadsgrenser også dekket av REQ-0284.

#### REQ-0303 – Bevare fullførte resultater
Ved feil skal allerede fullførte resultater bevares.

- **Kilde:** Kap. 20.5 (l. 862) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUEUE · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0289
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en massejobb der jobb 8 av 15 feiler, så er resultatene fra jobb 1–7 bevart og tilgjengelige.
- **Tester:**
  - integrasjon: bevare fullførte resultater med mock-leverandør
- **Merknad:** Ufravikelig prinsipp nr. 27 i kap. 34.

### Kapittel 21

#### REQ-0304 – Versjonering dypt integrert
Versjonerings- og synkroniseringsavvikssystemet skal være dypt integrert i hele applikasjonen.

- **Kilde:** Kap. 21 (l. 864-865) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE · **Invarianter:** INV-07, INV-13
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Alle produksjonsobjekter (manus, ressurser, lyd, scener, genereringer) har versjonsreferanser fra første datamodell.
- **Tester:**
  - manuell: datamodellgjennomgang for versjonsfelt
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql

#### REQ-0305 – Endringsdeteksjon for berørt materiale
Når manus eller ressurser endres, skal systemet identifisere hvilke produksjonselementer som kan være påvirket – f.eks. ved at en replikk endres, handling endres, rekvisitt byttes, karaktervariant endres, scene forkortes, lyd byttes eller en kontinuitetshendelse flyttes.

- **Kilde:** Kap. 21.1 (l. 866-875) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, CONTINUITY · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0304
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hver av de sju eksempelendringene flagges de produksjonselementene som er avhengige av det endrede objektet.
- **Tester:**
  - integrasjon: avhengighetsgraf og flagging for hver eksempelendring
- **Merknad:** Ufravikelig prinsipp nr. 7 i kap. 34.

#### REQ-0306 – Tre valg ved avvik
Når eksisterende film ikke lenger samsvarer med gjeldende manus, skal brukeren kunne velge: A. Godkjenn eksisterende materiale, B. Oppdater eller generer på nytt, eller C. Angre manusendringen.

- **Kilde:** Kap. 21.2 (l. 876-888) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, UI · **Invarianter:** INV-07, INV-08
- **Avhengigheter:** REQ-0305
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For et flagget avvik tilbys nøyaktig de tre valgene A, B og C.
- **Tester:**
  - e2e: avviksdialog med tre valg
- **Merknad:** Linjene «A. Godkjenn eksisterende materiale» (l. 878–879) og «B. Oppdater eller generer på nytt» (l. 882–883) er duplisert. Ufravikelig prinsipp nr. 8.

#### REQ-0307 – Godkjenning registreres med versjoner
Ved valg A (godkjenn eksisterende materiale) bekrefter brukeren at avviket er akseptabelt, og beslutningen registreres sammen med relevante versjoner.

- **Kilde:** Kap. 21.2 (l. 880-881) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0306
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter godkjenning lagres en beslutningspost med bruker, tidspunkt, manusversjon og materialversjon, og avviket vises ikke lenger som uavklart.
- **Tester:**
  - dataintegritet: beslutningspost inneholder versjonsreferanser

#### REQ-0308 – Lokal oppdatering eller AI vurderes
Ved valg B skal systemet undersøke om oppdateringen kan utføres lokalt eller krever AI.

- **Kilde:** Kap. 21.2 (l. 884) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, PROMPT · **Invarianter:** INV-11
- **Avhengigheter:** REQ-0306
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For en endring som kan løses lokalt (f.eks. bytte av lydfil i 2D-animatic), foreslås lokal oppdatering uten AI-kostnad.
- **Tester:**
  - integrasjon: klassifisering lokal vs. AI for testendringer

#### REQ-0309 – Kostnad vises før regenerering
Ved valg B skal eventuell kostnad vises før generering.

- **Kilde:** Kap. 21.2 (l. 885) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** QUALITYCOST, VERSION · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0279
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen regenerering fra avviksdialogen starter før kostnad er vist og godkjent.
- **Tester:**
  - integrasjon: regenerering fra avvik krever godkjent estimat

#### REQ-0310 – Ny versjon ved siden av gammel
Ved valg B skal ny versjon bevares ved siden av den gamle.

- **Kilde:** Kap. 21.2 (l. 886) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION · **Invarianter:** INV-07
- **Avhengigheter:** REQ-0306
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter oppdatering finnes både gammel og ny versjon, og den gamle kan gjenaktiveres.
- **Tester:**
  - dataintegritet: gammel versjon bevart etter oppdatering

#### REQ-0311 – Selektiv angring av manusendring
Ved valg C skal programmet reversere den relevante manusendringen uten å overskrive andre uavhengige redigeringer.

- **Kilde:** Kap. 21.2 (l. 887-888) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, SCRIPT · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0306
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt to uavhengige manusendringer X og Y, når brukeren velger C for avviket forårsaket av X, så reverseres X mens Y beholdes.
- **Tester:**
  - integrasjon: selektiv revert med uavhengige endringer
- **Merknad:** Krever endringslogg på blokk-/feltnivå, ikke bare lineær angre-stakk – se ADR-0005 / OPEN_QUESTIONS B (selektiv angre).

#### REQ-0312 – Flagge bare berørt område
Hvis bare én replikk endres, skal systemet så langt mulig flagge bare berørt lyd og filmområde.

- **Kilde:** Kap. 21.3 (l. 889-890) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, TIMELINE, AUDIO
- **Avhengigheter:** REQ-0305
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Endring av én replikk flagger kun replikkens dialoglyd og tidsintervallet koblet til replikken, ikke hele scenen.
- **Tester:**
  - integrasjon: granularitet på flagging ved replikkendring

#### REQ-0313 – Sen endring påvirker ikke tidlig sekvens
En endring sent i en scene skal ikke automatisk gjøre en uavhengig sekvens i begynnelsen av scenen utdatert.

- **Kilde:** Kap. 21.3 (l. 891) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, TIMELINE
- **Avhengigheter:** REQ-0312
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene med to uavhengige delsekvenser, når en replikk i siste del endres, så forblir første delsekvens uflagget.
- **Tester:**
  - integrasjon: flagging per delsekvens

#### REQ-0314 – Vise usikre konsekvenser
Når konsekvensene av en endring er usikre, skal dette fremgå.

- **Kilde:** Kap. 21.3 (l. 892) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, UI
- **Avhengigheter:** REQ-0312
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Flagg med usikker konsekvens har egen visuell markering («mulig berørt»).
- **Tester:**
  - visuell: skille sikre og usikre avviksflagg

#### REQ-0315 – Avvik synlige i alle arbeidsflater
Uavklarte avvik skal kunne vises i manusrelaterte arbeidsvisninger, sceneeditor, filmtidslinje, produksjonsoversikt og eksportkontroll.

- **Kilde:** Kap. 21.4 (l. 893-899) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, UI, SCRIPT, COMPOSE, TIMELINE, EXPORT
- **Avhengigheter:** REQ-0305
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et uavklart avvik på en scene vises i alle fem visningene.
- **Tester:**
  - e2e: avvik synlig i hver av de fem visningene
- **Merknad:** Avvik skal ikke forstyrre ordinær manuslayout (jf. kap. 6.3) – derfor «manusrelaterte arbeidsvisninger».

#### REQ-0316 – Aldri kassere produksjonsversjoner
Programmet skal aldri automatisk kassere eksisterende produksjonsversjoner.

- **Kilde:** Kap. 21.5 (l. 900-901) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, SECURITY · **Invarianter:** INV-07, INV-14
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Ingen automatisk prosess (opprydding, regenerering, import) sletter produksjonsversjoner.
- **Tester:**
  - dataintegritet: antall versjoner synker aldri uten eksplisitt brukerhandling
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes
- **Merknad:** Ufravikelig prinsipp nr. 6 og 27 i kap. 34.

#### REQ-0317 – Åpne og gjenaktivere tidligere resultater
Tidligere produksjonsresultater skal kunne åpnes og gjenaktiveres.

- **Kilde:** Kap. 21.5 (l. 902) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** VERSION, TIMELINE · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0316
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan åpne en tidligere versjon og gjøre den til aktiv versjon igjen.
- **Tester:**
  - e2e: gjenaktiver tidligere versjon
- **Merknad:** Ufravikelig prinsipp nr. 6 i kap. 34.

#### REQ-0318 – Sammenligne tidligere resultater
Tidligere produksjonsresultater skal kunne sammenlignes.

- **Kilde:** Kap. 21.5 (l. 902) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** VERSION, UI
- **Avhengigheter:** REQ-0317
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan vise to versjoner av en scene side ved side.
- **Tester:**
  - e2e: sammenligning av to versjoner

### Kapittel 22

#### REQ-0319 – Rådgivende kontinuitetsanalyse
Systemet skal kunne tilby rådgivende kontinuitetsanalyse av manus og produksjon.

- **Kilde:** Kap. 22 (l. 904-905) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan kjøre kontinuitetsanalyse og få en liste med funn som kan avvises eller følges opp.
- **Tester:**
  - integrasjon: analyse på testmanus gir forventede funn

#### REQ-0320 – Karakter omtalt før introduksjon
Kontinuitetsanalysen skal kunne oppdage at en karakter omtales før vedkommende introduseres.

- **Kilde:** Kap. 22 (l. 906-907) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle

#### REQ-0321 – Objekt brukt før etablering
Kontinuitetsanalysen skal kunne oppdage at et objekt brukes før det etableres.

- **Kilde:** Kap. 22 (l. 908) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle

#### REQ-0322 – Dialog viser til deaktivert scene
Kontinuitetsanalysen skal kunne oppdage at dialog viser til en hendelse i en deaktivert scene.

- **Kilde:** Kap. 22 (l. 909) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-14
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle

#### REQ-0323 – Fysisk forandring uten årsak
Kontinuitetsanalysen skal kunne oppdage at en fysisk forandring mangler årsak.

- **Kilde:** Kap. 22 (l. 910) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle

#### REQ-0324 – Tidsmessige motsetninger i sceneorden
Kontinuitetsanalysen skal kunne oppdage at sceneorden skaper tidsmessige motsetninger.

- **Kilde:** Kap. 22 (l. 911) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-09
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle

#### REQ-0325 – Spinoff mangler nødvendig informasjon
Kontinuitetsanalysen skal kunne oppdage at en spinoff mangler informasjon som tidligere var nødvendig for forståelsen.

- **Kilde:** Kap. 22 (l. 912) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0319
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et testmanus/-produksjon konstruert med dette problemet, så rapporterer analysen et funn som peker på riktig scene/manusblokk.
- **Tester:**
  - integrasjon: analyse av konstruert testtilfelle
- **Merknad:** Avhenger av spinoff-modellen (kap. 24).

#### REQ-0326 – Ingen automatisk omskriving av historien
Systemet skal ikke automatisk omskrive historien.

- **Kilde:** Kap. 22 (l. 913) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CONTINUITY, SCRIPT · **Invarianter:** INV-08
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen analyse- eller AI-funksjon endrer manustekst uten eksplisitt brukerhandling.
- **Tester:**
  - dataintegritet: manus uendret etter kontinuitetsanalyse
- **Merknad:** Følger av kap. 2.2 og prinsipp nr. 27.

#### REQ-0327 – Brukeren har redaksjonell kontroll
Brukeren har alltid redaksjonell kontroll over manus og fortelling.

- **Kilde:** Kap. 22 (l. 914) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CONTINUITY, SCRIPT, UI · **Invarianter:** INV-08
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle forslag fra systemet (kontinuitet, koblinger, rettelser) krever brukerens godkjenning før de påvirker manuset.
- **Tester:**
  - manuell: gjennomgang av forslagsflyter

### Kapittel 23

#### REQ-0328 – Norsk er hovedmanus
Norsk er prosjektets primære manusspråk og redaksjonelle hovedkilde.

- **Kilde:** Kap. 23.1 (l. 917-918) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** L10N, SCRIPT, CORE · **Invarianter:** INV-05
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Datamodellen markerer norsk som hovedspråk; andre språkversjoner refererer til norske manusobjekter.
- **Tester:**
  - enhet: språkversjon har referanse til hovedmanus
  - manuell: datamodellgjennomgang
- **Implementering:** src/core/model.ts, db/migrations/0001_core.sql
- **Merknad:** Ufravikelig prinsipp nr. 5 i kap. 34.

#### REQ-0329 – Engelsk som tilknyttet språkversjon
Engelsk skal kunne legges til som en tilknyttet språkversjon av manuset.

- **Kilde:** Kap. 23.1 (l. 919) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, SCRIPT · **Invarianter:** INV-05
- **Avhengigheter:** REQ-0328
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan legge til en engelsk språkversjon som er koblet til de norske scene- og replikk-ID-ene.
- **Tester:**
  - integrasjon: opprett engelsk versjon koblet til norsk
- **Merknad:** Ufravikelig prinsipp nr. 5 (engelsk er tilknyttet) gjør koblingsprinsippet P0 i datamodellen, selve funksjonen er fase 7.

#### REQ-0330 – Varsle om oversettelse som må gjennomgås
Endringer i norsk hovedmanus skal kunne varsle om at engelsk oversettelse må gjennomgås.

- **Kilde:** Kap. 23.1 (l. 920) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, VERSION
- **Avhengigheter:** REQ-0329
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en norsk replikk endres, så flagges tilsvarende engelsk replikk som «må gjennomgås».
- **Tester:**
  - integrasjon: flagging av oversettelse ved norsk endring

#### REQ-0331 – Engelsk endrer ikke norsk
Endringer i engelsk oversettelse skal ikke automatisk endre norsk hovedmanus.

- **Kilde:** Kap. 23.1 (l. 921) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** L10N, SCRIPT · **Invarianter:** INV-06
- **Avhengigheter:** REQ-0329
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter redigering av engelsk replikk er norsk replikk uendret.
- **Tester:**
  - dataintegritet: norsk manus uendret etter engelsk redigering

#### REQ-0332 – Importere oversatt engelsk manus
Brukeren skal kunne importere et allerede oversatt engelsk manus.

- **Kilde:** Kap. 23.2 (l. 922-923) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, SCRIPT
- **Avhengigheter:** Manusimport (kap. 4.1)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan importere engelsk manus (DOCX), og det parses som en språkversjon, ikke som et nytt hovedmanus.
- **Tester:**
  - import/eksport: import av engelsk referansemanus (DOCX)
- **Merknad:** Engelsk referansemanus (DOCX) er bekreftet tilgjengelig (jf. DEC-0002).

#### REQ-0333 – Automatisk kobling engelsk–norsk
Systemet skal forsøke å koble engelske scener, replikker og handlinger til eksisterende norske sceneidentiteter ved analyse av scenestruktur, karakterer, handling, narrativ kontekst og eventuelle scenenumre.

- **Kilde:** Kap. 23.2 (l. 924-930) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, SCRIPT, CORE · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0332
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For referansemanusene kobles en høy andel scener og replikker korrekt, og hver kobling har en sikkerhetsgrad.
- **Tester:**
  - integrasjon: koblingsnøyaktighet mot manuelt fasitsett for referansemanusene

#### REQ-0334 – Ikke bare scenenumre eller ordrett tekst
Koblingen mellom engelsk og norsk manus skal ikke baseres utelukkende på identiske scenenumre eller ordrett tekst.

- **Kilde:** Kap. 23.2 (l. 931) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N · **Invarianter:** INV-02
- **Avhengigheter:** REQ-0333
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et engelsk manus der scenenumre er forskjøvet, så kobles scener likevel korrekt basert på innhold.
- **Tester:**
  - integrasjon: kobling med forskjøvne scenenumre

#### REQ-0335 – Manuell godkjenning av usikre koblinger
Usikre koblinger mellom engelsk og norsk manus skal kunne godkjennes manuelt.

- **Kilde:** Kap. 23.2 (l. 932) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0333
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Koblinger under en sikkerhetsterskel vises i en gjennomgangsliste der brukeren kan godkjenne, endre eller avvise.
- **Tester:**
  - e2e: gjennomgang av usikre koblinger

#### REQ-0336 – Delt produksjonsmateriale mellom språk
Norsk og engelsk film skal som hovedregel kunne bruke samme sceneidentiteter, samme visuelle komposisjoner, samme kamerabevegelser, samme miljøer, samme objekter og samme genererte filmklipp når de er egnede.

- **Kilde:** Kap. 23.3 (l. 933-940) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, CORE, TIMELINE
- **Avhengigheter:** REQ-0329
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Engelsk filmversjon refererer de samme scene-, komposisjons-, kamera-, miljø-, objekt- og klippobjektene som norsk, uten kopiering.
- **Tester:**
  - dataintegritet: delte referanser, ikke kopier

#### REQ-0337 – Bytte språkavhengige ressurser
Språkavhengige ressurser skal kunne byttes separat per språkversjon.

- **Kilde:** Kap. 23.3 (l. 941) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, LIBRARY
- **Avhengigheter:** REQ-0336
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan bytte f.eks. et skilt med tekst eller et dialogklipp i engelsk versjon uten at norsk endres.
- **Tester:**
  - integrasjon: språkspesifikk overstyring av ressurs

#### REQ-0338 – Flere språkspesifikke lydfiler per replikk
Hver replikk skal kunne ha flere språkspesifikke lydfiler.

- **Kilde:** Kap. 23.4 (l. 942-943) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** AUDIO, L10N
- **Avhengigheter:** REQ-0204
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En replikk kan ha både norsk og engelsk lydfil.
- **Tester:**
  - enhet: replikk–lydfil-relasjon per språk

#### REQ-0339 – Én narrativ replikk på tvers av språk
Tekster og lydfiler på ulike språk skal tilhøre samme underliggende narrative replikk (f.eks. replikk-ID dlg_294 med norsk «Hvor er Ola?» og engelsk «Where is Ola?»).

- **Kilde:** Kap. 23.4 (l. 944-948) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** AUDIO, L10N, CORE · **Invarianter:** INV-05
- **Avhengigheter:** REQ-0338
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Norsk og engelsk tekst og lyd for samme replikk deler én replikk-ID.
- **Tester:**
  - dataintegritet: språkvarianter refererer samme replikk-ID
- **Merknad:** Krever at replikk-ID finnes fra fase 1 (kap. 3.2).

#### REQ-0340 – Gjenbruk av ikke-dialoglyd
Musikk, atmosfære og lydeffekter skal i utgangspunktet kunne gjenbrukes mellom språkversjonene.

- **Kilde:** Kap. 23.5 (l. 949-950) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** AUDIO, L10N
- **Avhengigheter:** REQ-0200
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Engelsk versjon bruker samme musikk-, atmosfære- og effektspor som norsk uten kopiering.
- **Tester:**
  - integrasjon: delt ikke-dialoglyd mellom språk

#### REQ-0341 – Importert film med blandet lyd
Programmet skal kunne håndtere at importert ferdig film kan ha dialog og øvrig lyd blandet sammen.

- **Kilde:** Kap. 23.5 (l. 951) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** AUDIO, L10N, LIBRARY
- **Avhengigheter:** REQ-0235
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Importert film kan merkes som «blandet lydspor», og systemet håndterer da språkbytte uten å anta separat dialogspor.
- **Tester:**
  - integrasjon: språkversjon av scene med blandet lyd

#### REQ-0342 – Ikke love perfekt dialogutskifting
Programmet skal ikke love perfekt utskifting av dialog dersom separate lydspor ikke finnes.

- **Kilde:** Kap. 23.5 (l. 952) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** AUDIO, L10N, UI
- **Avhengigheter:** REQ-0341
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For scener med blandet lyd vises en tydelig begrensning ved språkbytte.
- **Tester:**
  - manuell: UI-tekst ved blandet lyd

#### REQ-0343 – Identifisere timingkonflikter
Systemet skal kunne identifisere timingkonflikter som følge av at engelske replikker kan være lengre eller kortere enn norske, og foreslå justeringer.

- **Kilde:** Kap. 23.6 (l. 953-955) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, AUDIO, TIMELINE
- **Avhengigheter:** REQ-0339
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en engelsk replikk som er lengre enn tilgjengelig tidsintervall, så flagges konflikten med et forslag (f.eks. forlenge pause, justere klipp).
- **Tester:**
  - integrasjon: deteksjon av timingkonflikt

#### REQ-0344 – Språktiming endrer ikke hovedfilm
Språkspesifikke timingendringer skal ikke automatisk endre hovedfilmens originale timing.

- **Kilde:** Kap. 23.6 (l. 956) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, TIMELINE · **Invarianter:** INV-06
- **Avhengigheter:** REQ-0343
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter timingjustering i engelsk versjon er norsk filmmontering uendret.
- **Tester:**
  - dataintegritet: norsk tidslinje uendret etter engelsk justering
- **Merknad:** INV-06 gjelder ordlyden manus; her brukes det analogt for filmtiming.

#### REQ-0345 – Skille materialtyper for leppesynk
Systemet skal ved språkbytte skille mellom stillbilder, enkle 2D-animatics, redigerbare 2D-karakterer, AI-generert video og ferdig importert film.

- **Kilde:** Kap. 23.7 (l. 957-963) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, VERSION, AUDIO
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert klipp har en materialtype blant de fem, som brukes i vurdering av leppesynkbehov.
- **Tester:**
  - enhet: materialtype-klassifisering

#### REQ-0346 – Vurdere behov for leppesynk
Programmet skal vurdere om dialog kan byttes direkte (ofte for enkle animatics) eller om synlige munnbevegelser krever ny leppesynkronisering eller målrettet oppdatering.

- **Kilde:** Kap. 23.7 (l. 964-966) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, AUDIO, PROMPT
- **Avhengigheter:** REQ-0345
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For et stillbilde foreslås direkte dialogbytte; for AI-video med synlig munn foreslås leppesynk/målrettet oppdatering.
- **Tester:**
  - integrasjon: anbefaling per materialtype

#### REQ-0347 – Ingen automatisk full regenerering
Ved språkbytte skal programmet ikke automatisk regenerere hele scenen.

- **Kilde:** Kap. 23.7 (l. 966) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** L10N, QUEUE · **Invarianter:** INV-07, INV-12
- **Avhengigheter:** REQ-0346
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Språkbytte starter aldri en regenerering uten brukerens beslutning og kostnadsgodkjenning.
- **Tester:**
  - integrasjon: ingen jobber opprettes automatisk ved språkbytte

#### REQ-0348 – Språkspesifikk filmeksport
Brukeren skal kunne eksportere norsk film og engelsk film.

- **Kilde:** Kap. 23.8 (l. 967-970) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** EXPORT, L10N
- **Avhengigheter:** REQ-0336
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Eksport kan gjøres per språk og gir film med språkets dialog og ellers felles materiale.
- **Tester:**
  - import/eksport: norsk og engelsk filmeksport

#### REQ-0349 – Språkspesifikk manuseksport
Brukeren skal kunne eksportere norsk manus og engelsk manus.

- **Kilde:** Kap. 23.8 (l. 971-972) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** EXPORT, L10N, SCRIPT
- **Avhengigheter:** REQ-0329
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Manuseksport kan velges per språk med korrekt manusformat.
- **Tester:**
  - import/eksport: norsk og engelsk manuseksport

#### REQ-0350 – Eksport av separate dialogspor
Brukeren skal kunne eksportere separate dialogspor.

- **Kilde:** Kap. 23.8 (l. 973) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** EXPORT, AUDIO, L10N
- **Avhengigheter:** REQ-0338
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Dialog kan eksporteres som egen lydfil per språk, adskilt fra musikk og effekter.
- **Tester:**
  - import/eksport: separat dialogspor

#### REQ-0351 – Eksport av undertekstfiler
Brukeren skal kunne eksportere undertekstfiler.

- **Kilde:** Kap. 23.8 (l. 974) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** EXPORT, L10N
- **Avhengigheter:** REQ-0339
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Undertekstfil genereres fra replikkenes tidskoblinger i aktiv film med korrekt timing.
- **Tester:**
  - import/eksport: undertekstfil validerer og har tider i samsvar med aktiv film
- **Merknad:** Undertekstformat (SRT/VTT/annet) er ikke spesifisert.

#### REQ-0352 – Uavhengige språkvalg
Grensesnittspråk, manusspråk, dialogspråk og undertekstspråk skal kunne velges uavhengig av hverandre.

- **Kilde:** Kap. 23.8 (l. 975) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, UI, EXPORT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt norsk UI, kan brukeren vise engelsk manus, spille av med norsk dialog og engelske undertekster.
- **Tester:**
  - e2e: kombinasjon av fire uavhengige språkvalg

### Kapittel 24

#### REQ-0353 – Avledede produksjoner i samme prosjekt
Animatic Studio skal støtte flere selvstendige produksjoner innenfor samme overordnede prosjekt. En avledet produksjon kan være: kortfilm, spinoff, trailer, teaser, pitchfilm, pilotsekvens, alternativ fortelling eller annen avgrenset filmversjon.

- **Kilde:** Kap. 24 (l. 977-987) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE · **Invarianter:** INV-04
- **Avhengigheter:** Project Core med produksjonsbegrep (fase 1)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt med hovedfilm, når brukeren oppretter en avledet produksjon av hver av typene kortfilm, spinoff, trailer, teaser, pitchfilm, pilotsekvens, alternativ fortelling og annen avgrenset filmversjon, så finnes alle som selvstendige produksjoner i samme prosjekt.
- **Tester:**
  - enhet: produksjonstype-enum inneholder alle åtte typer
  - integrasjon: flere produksjoner under ett prosjekt-ID
- **Merknad:** Datamodellen (fase 1) må ha produksjon som eget objekt selv om funksjonen kommer i fase 7.

#### REQ-0354 – Opprette avledet produksjon fra utvalgte scener
Brukeren skal kunne opprette en avledet produksjon ved å velge ut scener fra hovedfilmen.

- **Kilde:** Kap. 24.1 (l. 988-989) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, TIMELINE, UI · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0353
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt hovedfilmen med N scener, når brukeren velger M scener og oppretter en avledet produksjon, så inneholder den nye produksjonen sceneforekomster for nøyaktig de M valgte scenene, og hovedfilmen er uendret.
- **Tester:**
  - integrasjon: oppretting gir nye sceneforekomster som refererer samme scene-ID
  - e2e: velg scener og opprett spinoff

#### REQ-0355 – Egne egenskaper per avledet produksjon
Den nye avledede produksjonen skal kunne få: eget navn, egen sceneorden, eget manus, egen filmtidslinje, egen varighetsberegning, egne aktive filmversjoner og egne eksportfiler.

- **Kilde:** Kap. 24.1 (l. 990-997) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, SCRIPT, TIMELINE, EXPORT · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, så kan navn, sceneorden, manus, filmtidslinje, varighetsberegning, aktive filmversjoner og eksportfiler endres/beregnes uten at tilsvarende verdier i hovedfilmen endres.
- **Tester:**
  - enhet: varighetsberegning per produksjon
  - dataintegritet: endring i spinoffens egenskaper berører ikke hovedfilmen

#### REQ-0356 – Flytte/skjule scene i spinoff uavhengig av hovedfilm
En scene skal kunne flyttes eller skjules i en spinoff uten at den flyttes eller skjules i hovedfilmen.

- **Kilde:** Kap. 24.2 (l. 998-999) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, TIMELINE · **Invarianter:** INV-04, INV-14
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en scene brukt i både hovedfilm og spinoff, når brukeren flytter eller skjuler den i spinoffen, så er dens plassering og synlighet i hovedfilmen uendret.
- **Tester:**
  - dataintegritet: sceneforekomster per produksjon er uavhengige
  - e2e: skjul scene i spinoff, kontroller hovedfilm

#### REQ-0357 – Spinoffens manus og tidslinje synkronisert
Spinoffens manus og filmtidslinje skal likevel være fullt synkronisert med hverandre.

- **Kilde:** Kap. 24.2 (l. 1000) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, SCRIPT, TIMELINE · **Invarianter:** INV-01
- **Avhengigheter:** REQ-0356
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, når en scene flyttes eller deaktiveres i spinoffens manus, så vises samme endring i spinoffens filmtidslinje (og omvendt), i samme transaksjon.
- **Tester:**
  - integrasjon: toveis strukturell synk per produksjon
  - dataintegritet: ingen tilstand der spinoffens manus og tidslinje har ulik aktiv struktur
- **Merknad:** Anvendelse av kap. 2/INV-01 på hver produksjon.

#### REQ-0358 – Egen aktiv scene- og monteringsstruktur per produksjon
Hver produksjon skal ha sin egen aktive scene- og monteringsstruktur.

- **Kilde:** Kap. 24.2 (l. 1001) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, TIMELINE · **Invarianter:** INV-04
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt to produksjoner i samme prosjekt, så har hver sin egen liste over aktive sceneforekomster og sin egen filmmontering.
- **Tester:**
  - enhet: datamodell knytter filmmontering og sceneforekomster til produksjon-ID
- **Merknad:** Formulert som konstatering («har dermed»); registrert som arkitekturkrav. Må støttes av datamodellen i fase 1.

#### REQ-0359 – Gjenbruk av materiale i spinoff
Spinoffen skal kunne gjenbruke: manusscener, ferdige filmklipp, AI-genererte scener, 2D-animatics, karakterer, objekter, lokasjoner, lyd og stilprofiler.

- **Kilde:** Kap. 24.3 (l. 1002-1012) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, LIBRARY, TIMELINE, AUDIO · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, så kan hver av ressurstypene manusscener, ferdige filmklipp, AI-genererte scener, 2D-animatics, karakterer, objekter, lokasjoner, lyd og stilprofiler fra prosjektet brukes i spinoffen.
- **Tester:**
  - integrasjon: gjenbruk av hver ressurstype i spinoff
  - e2e: bygg spinoff kun av gjenbrukt materiale

#### REQ-0360 – Referansebasert gjenbruk av versjonert kildemateriale
Gjenbruk skal i utgangspunktet være basert på referanser til versjonert kildemateriale, slik at unødvendig duplisering unngås.

- **Kilde:** Kap. 24.3 (l. 1013) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, LIBRARY · **Invarianter:** INV-13
- **Avhengigheter:** Version & Dependency Engine
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et filmklipp gjenbrukt i en spinoff, så lagres en referanse til klippets versjons-ID og ikke en kopi av mediefilen.
  - Gitt at kildematerialet får ny versjon, så peker spinoffens referanse fortsatt på den versjonen den ble koblet til inntil brukeren velger annet.
- **Tester:**
  - dataintegritet: ingen duplisert mediefil ved gjenbruk
  - enhet: referanse inneholder versjons-ID
- **Merknad:** «i utgangspunktet» – standardatferd, unntak tillatt.

#### REQ-0361 – Nye scener som bare finnes i spinoffen
Brukeren skal kunne skrive og produsere helt nye scener som bare finnes i spinoffen.

- **Kilde:** Kap. 24.4 (l. 1014-1015) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** SCRIPT, CORE · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, når brukeren skriver en ny scene der, så vises scenen i spinoffens manus og tidslinje og ikke i noen annen produksjon.
- **Tester:**
  - e2e: skriv og produser ny scene i spinoff

#### REQ-0362 – Permanente identiteter for spinoff-scener
Nye scener i spinoffen skal få egne permanente sceneidentiteter.

- **Kilde:** Kap. 24.4 (l. 1016) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE · **Invarianter:** INV-02, INV-03
- **Avhengigheter:** REQ-0361
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en ny spinoff-scene, så får den en unik permanent scene-ID som er uavhengig av scenenummer og ikke kolliderer med hovedfilmens scene-ID-er.
- **Tester:**
  - enhet: ID-generering for spinoff-scene
  - dataintegritet: ID uendret etter flytting/omnummerering

#### REQ-0363 – Spinoff-scener legges ikke automatisk i hovedmanus
Nye scener i spinoffen skal ikke automatisk legges til hovedmanuset.

- **Kilde:** Kap. 24.4 (l. 1017) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, SCRIPT · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0361
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en ny spinoff-scene, når den lagres, så er hovedmanuset og hovedfilmens tidslinje uendret.
- **Tester:**
  - dataintegritet: hovedmanusets scenesett før/etter er identisk
- **Merknad:** Gjentas som prinsipp 21 i kap. 34.

#### REQ-0364 – Spinoff-scener bruker globale ressurser og eget materiale
Nye spinoff-scener skal kunne bruke globale ressurser og få egne animatics, lydfiler og genererte filmklipp.

- **Kilde:** Kap. 24.4 (l. 1018) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** LIBRARY, COMPOSE, AUDIO, PROMPT
- **Avhengigheter:** REQ-0361
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en ny spinoff-scene, så kan brukeren knytte globale karakterer/objekter/miljøer til den og knytte egne animatics, lydfiler og genererte filmklipp til den.
- **Tester:**
  - integrasjon: globale ressurser tilgjengelige i spinoff-scene

#### REQ-0365 – Endring i gjenbrukt scene blir lokal variant
Hvis en gjenbrukt scene endres i spinoffen, skal endringen som standard lagres som en produksjonsspesifikk variant. Hovedfilmens scene skal ikke endres. Eksempel: spinoffen bruker en scene fra hovedfilmen, men forkorter dialogen og velger et annet kamerautsnitt.

- **Kilde:** Kap. 24.5 (l. 1019-1023) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, VERSION, SCRIPT · **Invarianter:** INV-04, INV-13
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en gjenbrukt scene, når brukeren forkorter dialogen og velger et annet kamerautsnitt i spinoffen, så opprettes en scenevariant knyttet til spinoffen, og hovedfilmens scene (manus, kamera) er uendret.
- **Tester:**
  - dataintegritet: hovedfilmens scene byte-lik før/etter spinoff-redigering
  - enhet: variant knyttet til produksjon-ID

#### REQ-0366 – Variant tilhører spinoffen til brukeren deler
Den nye varianten tilhører spinoffen inntil brukeren eventuelt velger å dele endringene.

- **Kilde:** Kap. 24.5 (l. 1024) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION · **Invarianter:** INV-04
- **Avhengigheter:** REQ-0365
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff-variant, så er den bare synlig i spinoffen inntil brukeren eksplisitt velger å dele den.
- **Tester:**
  - integrasjon: deling krever eksplisitt brukerhandling
- **Merknad:** Mekanismen for «dele» er beskrevet i kap. 25 (tilbakeføring).

#### REQ-0367 – Bruke utdrag av ferdig filmklipp
Brukeren skal kunne bruke bare deler av et ferdig filmklipp. En scene på 90 sekunder i hovedfilmen kan eksempelvis bidra med 20 sekunder i en trailer.

- **Kilde:** Kap. 24.6 (l. 1025-1027) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et klipp på 90 s, når brukeren velger et utdrag på 20 s til en trailer, så spiller traileren nøyaktig det valgte tidsintervallet.
- **Tester:**
  - enhet: inn-/utpunkt på sceneforekomst
  - e2e: trailer med utdrag

#### REQ-0368 – Utdrag påvirker ikke originalfil
Bruk av utdrag fra et ferdig filmklipp skal ikke påvirke originalfilen.

- **Kilde:** Kap. 24.6 (l. 1028) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** TIMELINE, SECURITY · **Invarianter:** INV-13, INV-07
- **Avhengigheter:** REQ-0367
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et utdrag brukt i en trailer, så er originalfilens innhold, varighet og sjekksum uendret.
- **Tester:**
  - dataintegritet: sjekksum av original før/etter

#### REQ-0369 – Varsel om narrative problemer i spinoff
Systemet skal kunne varsle når en spinoff kombinerer scener på en måte som skaper mulige narrative problemer.

- **Kilde:** Kap. 24.7 (l. 1029-1030) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CONTINUITY
- **Avhengigheter:** REQ-0354; Continuity Engine (fase 6)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff der en scene forutsetter en hendelse fra en utelatt scene, så vises et varsel om mulig narrativt problem.
- **Tester:**
  - integrasjon: kontinuitetsanalyse per produksjon
  - manuell: vurdering av varslenes relevans

#### REQ-0370 – Opprette sammenbindende scener og overganger
Brukeren skal kunne opprette nye sammenbindende scener og overganger i en spinoff.

- **Kilde:** Kap. 24.7 (l. 1031) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** SCRIPT, TIMELINE
- **Avhengigheter:** REQ-0361
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, så kan brukeren sette inn en ny sammenbindende scene eller en overgang mellom to sceneforekomster.
- **Tester:**
  - e2e: legg til overgang i spinoff

#### REQ-0371 – Egne norske og engelske manus og lydspor for spinoff
Spinoffer skal kunne ha egne norske og engelske manus og lydspor.

- **Kilde:** Kap. 24.8 (l. 1032-1033) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N, AUDIO, SCRIPT · **Invarianter:** INV-05, INV-06
- **Avhengigheter:** REQ-0354
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff, så kan den ha et eget norsk manus, et eget engelsk manus og egne lydspor per språk, uavhengig av hovedfilmens.
- **Tester:**
  - integrasjon: språkversjoner per produksjon

#### REQ-0372 – Gjenbruk av eksisterende oversettelser i spinoff
Eksisterende oversettelser skal gjenbrukes der det passer.

- **Kilde:** Kap. 24.8 (l. 1034) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en gjenbrukt scene med eksisterende engelsk oversettelse, så foreslås/brukes denne oversettelsen i spinoffens engelske manus.
- **Tester:**
  - integrasjon: oversettelsesreferanse gjenbrukes

### Kapittel 25

#### REQ-0373 – Foreslå tilbakeføring fra spinoff til hovedfilm
En forbedret scenevariant som er utviklet i en spinoff skal kunne foreslås overført til hovedfilmen.

- **Kilde:** Kap. 25 (l. 1036-1037) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0365
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff-variant, så kan brukeren starte et forslag om overføring til hovedfilmen.
- **Tester:**
  - e2e: start tilbakeføringsforslag

#### REQ-0374 – Tilbakeføring skjer aldri automatisk
Tilbakeføring fra spinoff til hovedfilm skal aldri skje automatisk.

- **Kilde:** Kap. 25 (l. 1038) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, VERSION · **Invarianter:** INV-04, INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt endringer i en spinoff-variant, så endres hovedfilmen ikke før brukeren har tatt en eksplisitt beslutning.
- **Tester:**
  - dataintegritet: hovedfilm uendret uten brukerbeslutning

#### REQ-0375 – Sammenligning original vs. spinoff-variant
Systemet skal ved tilbakeføring vise: originalscene, spinoff-variant, endringer i manus, endringer i lyd, endringer i kamera, endringer i timing og endringer i visuelt materiale.

- **Kilde:** Kap. 25.1 (l. 1039-1047) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** VERSION, UI
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en spinoff-variant med endringer i manus, lyd, kamera, timing og visuelt materiale, så viser sammenligningen originalscene, varianten og hver endringskategori separat.
- **Tester:**
  - integrasjon: diff-beregning per kategori
  - visuell: sammenligningsvisning

#### REQ-0376 – Beholde alt uendret
Brukeren skal kunne velge å beholde alt uendret.

- **Kilde:** Kap. 25.2 (l. 1050) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «beholde alt uendret», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0377 – Tilbakeføre bare manusendringer
Brukeren skal kunne velge å tilbakeføre bare manusendringer.

- **Kilde:** Kap. 25.2 (l. 1051) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «tilbakeføre bare manusendringer», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0378 – Tilbakeføre bestemte visuelle endringer
Brukeren skal kunne velge å tilbakeføre bestemte visuelle endringer.

- **Kilde:** Kap. 25.2 (l. 1052) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «tilbakeføre bestemte visuelle endringer», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0379 – Tilbakeføre lyd eller timing
Brukeren skal kunne velge å tilbakeføre lyd eller timing.

- **Kilde:** Kap. 25.2 (l. 1053) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «tilbakeføre lyd eller timing», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0380 – Ny hovedfilmvariant fra spinoff-versjon
Brukeren skal kunne velge å opprette en ny hovedfilmvariant fra spinoff-versjonen.

- **Kilde:** Kap. 25.2 (l. 1054) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «ny hovedfilmvariant fra spinoff-versjon», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0381 – Overføre ny spinoff-scene til hovedfilm
Brukeren skal kunne velge å overføre en helt ny spinoff-scene til hovedfilmen.

- **Kilde:** Kap. 25.2 (l. 1055) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** CORE, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et tilbakeføringsforslag, når brukeren velger «overføre ny spinoff-scene til hovedfilm», så overføres nøyaktig det valgte (og ikke noe annet) til hovedfilmen, og alle relasjoner bevares.
- **Tester:**
  - integrasjon: selektiv tilbakeføring
  - dataintegritet: kun valgt kategori endret

#### REQ-0382 – Tilbakeføring overskriver ikke godkjent materiale
Ingen tilbakeføring skal overskrive eksisterende godkjent materiale uten en eksplisitt beslutning.

- **Kilde:** Kap. 25.2 (l. 1056) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** VERSION, CORE · **Invarianter:** INV-07, INV-13
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt godkjent materiale i hovedfilmen, når en tilbakeføring ville erstatte det, så kreves en eksplisitt bekreftelse, og uten den beholdes materialet.
- **Tester:**
  - dataintegritet: godkjent materiale uendret uten bekreftelse

#### REQ-0383 – Bevare relasjoner og historiske versjoner ved tilbakeføring
Alle relasjoner og historiske versjoner skal bevares ved tilbakeføring.

- **Kilde:** Kap. 25.2 (l. 1057) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** VERSION, CORE · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0373
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en gjennomført tilbakeføring, så finnes original, spinoff-variant og ny hovedfilmversjon fortsatt, med sporbar relasjon mellom dem.
- **Tester:**
  - dataintegritet: versjonshistorikk komplett etter tilbakeføring

### Kapittel 26

#### REQ-0384 – Profesjonelle visuelle prosjektpresentasjoner
Animatic Studio skal kunne produsere profesjonelle visuelle presentasjoner av et filmprosjekt.

- **Kilde:** Kap. 26 (l. 1059-1060) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** Resource Library; Project Core
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt med karakterer og ressurser, så kan brukeren produsere en visuell presentasjon (plakat) av prosjektet.
- **Tester:**
  - e2e: generer presentasjon fra prosjekt
  - manuell: profesjonell kvalitet vurderes

#### REQ-0385 – Presentasjon som egen eksportfunksjon
Produksjon av presentasjonsmateriell skal være en egen eksportfunksjon.

- **Kilde:** Kap. 26 (l. 1061) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, EXPORT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Presentasjonseksport er tilgjengelig som egen funksjon atskilt fra film- og manuseksport.
- **Tester:**
  - integrasjon: presentasjonseksport via Export Engine

#### REQ-0386 – Plakatformat 70 × 100 cm stående
Programmet skal støtte minst plakatformatet 70 × 100 cm, stående format.

- **Kilde:** Kap. 26.1 (l. 1062-1065) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, EXPORT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en plakat, når den eksporteres i 70 × 100 cm stående, så har filen korrekt fysisk størrelse og orientering.
- **Tester:**
  - import/eksport: kontroller sidestørrelse 700 × 1000 mm
- **Merknad:** Linje 1064 og 1065 er duplikat. «minst» – andre formater kan støttes.

#### REQ-0387 – Plakateksport for trykk og digital distribusjon
Plakateksporten skal kunne tilpasses profesjonell trykkproduksjon og digital distribusjon, med relevante innstillinger for: oppløsning, filformat, utfallende trykk, fargehåndtering og trykkegnet tekst og grafikk.

- **Kilde:** Kap. 26.1 (l. 1066-1072) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, EXPORT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt eksportdialogen for plakat, så kan brukeren stille oppløsning, filformat, utfallende (bleed), fargehåndtering/fargeprofil og vektor-/trykkegnet tekst og grafikk.
  - Gitt trykkinnstillinger med utfallende, så inneholder filen bleed-område.
- **Tester:**
  - import/eksport: verifiser oppløsning, bleed og fargeprofil i eksportert fil

#### REQ-0388 – Kinopitch-plakat
Programmet skal kunne lage en kinopitch-plakat: en elegant, filmatisk og selgende plakat som fremhever filmens tittel, hovedkarakterer, stemning, visuelt univers, relevante miljøer, symbolske objekter og valgfri logline. Den skal ha et sterkt visuelt hierarki og profesjonell komposisjon.

- **Kilde:** Kap. 26.2 A (l. 1073-1083) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt, når brukeren lager en kinopitch-plakat, så inneholder den tittel, hovedkarakterer, miljøer og symbolske objekter, og logline kan slås av/på.
- **Tester:**
  - visuell: komposisjon og hierarki vurderes
  - manuell: profesjonelt uttrykk

#### REQ-0389 – Karakter- og universkart
Programmet skal kunne lage et karakter- og universkart: en informativ plakat som viser karakterportretter, karakternavn, beskrivelser, relasjoner, sentrale objekter, viktige steder og eventuelle andre sentrale historieelementer. Det skal være en tydelig, visuelt attraktiv prosjektoversikt.

- **Kilde:** Kap. 26.2 B (l. 1084-1093) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt med karakterer, relasjoner, objekter og steder, så viser karakterkartet portretter, navn, beskrivelser, relasjoner, objekter og steder.
- **Tester:**
  - visuell: karakterkart-layout
  - integrasjon: data hentes fra ressursbiblioteket

#### REQ-0390 – Valgfritt informasjonsnivå via avkrysning
Brukeren skal kunne velge plakatinnhold gjennom avkrysningsvalg som omfatter: bare bilder og navn, korte karakterbeskrivelser, utfyllende karakterbeskrivelser, relasjonslinjer, navngitte relasjoner, forklarende relasjonstekster, objektbilder, objektbeskrivelser, stedsbilder, stedsbeskrivelser, logline, sjanger og stemning, og andre relevante prosjektdata.

- **Kilde:** Kap. 26.3 (l. 1094-1109) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, UI
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt plakatredigering, så finnes et avkrysningsvalg for hver av de 13 innholdstypene, og plakaten oppdateres når valg endres.
- **Tester:**
  - e2e: slå hver avkrysning av/på og kontroller plakaten

#### REQ-0391 – Layout tilpasses informasjonsmengde
Systemet skal justere plakatens layout til informasjonsmengden.

- **Kilde:** Kap. 26.3 (l. 1110) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0390
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt at brukeren legger til flere innholdstyper, så reflowes layouten uten overlapp eller avkuttet innhold.
- **Tester:**
  - visuell: layout ved minimum og maksimum informasjonsmengde

#### REQ-0392 – Varsel om redusert lesbarhet
Hvis innholdet blir for omfattende, skal programmet varsle om redusert lesbarhet eller foreslå en annen komposisjon.

- **Kilde:** Kap. 26.3 (l. 1111) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, UI
- **Avhengigheter:** REQ-0390
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt så mye innhold at minste tekststørrelse faller under definert terskel for formatet, så vises et varsel om redusert lesbarhet eller et forslag om annen komposisjon.
- **Tester:**
  - enhet: lesbarhetsterskel
  - visuell: varsel vises

#### REQ-0393 – Visuelt relasjonskart med relasjonstyper
Karakterrelasjoner skal kunne fremstilles visuelt. Programmet skal støtte forbindelser som familie, vennskap, konflikt, omsorg, romantikk, mentorforhold, skjulte forbindelser og andre brukerdefinerte relasjoner.

- **Kilde:** Kap. 26.4 (l. 1112-1122) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, LIBRARY
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt karakterer med relasjoner av hver type, inkludert en brukerdefinert type, så vises de som visuelle forbindelser i relasjonskartet.
- **Tester:**
  - enhet: relasjonstyper inkl. brukerdefinert
  - visuell: relasjonslinjer

#### REQ-0394 – Relasjonsforslag uten usikre antakelser som fakta
Systemet kan foreslå relasjoner basert på manus, men skal ikke presentere usikre antakelser som fakta.

- **Kilde:** Kap. 26.4 (l. 1123) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, SCRIPT, PROMPT
- **Avhengigheter:** REQ-0393
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt automatisk foreslåtte relasjoner, så er de tydelig merket som forslag (ikke godkjent) inntil brukeren godkjenner dem.
- **Tester:**
  - integrasjon: forslag har status «foreslått»
  - manuell: merking er tydelig
- **Merknad:** «kan foreslå» = valgfritt; forbudet mot å presentere antakelser som fakta er absolutt når funksjonen finnes.

#### REQ-0395 – Godkjenne og redigere relasjoner
Brukeren skal kunne godkjenne og redigere relasjonene.

- **Kilde:** Kap. 26.4 (l. 1124) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, LIBRARY
- **Avhengigheter:** REQ-0393
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en foreslått relasjon, så kan brukeren godkjenne, endre type/tekst eller forkaste den.
- **Tester:**
  - e2e: godkjenn og rediger relasjon

#### REQ-0396 – Automatisk førsteutkast til plakat
Programmet skal kunne analysere prosjektet og foreslå: hvilke karakterer som bør fremheves, hvilke miljøer som er viktigst, hvilke objekter som er sentrale, hvilke relasjoner som bør vises, hvilken komposisjon som passer og hvilken visuell stil som bør brukes.

- **Kilde:** Kap. 26.5 (l. 1125-1132) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, PROMPT, SCRIPT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt, når brukeren ber om førsteutkast, så foreslås karakterer, miljøer, objekter, relasjoner, komposisjon og visuell stil, alle redigerbare før bruk.
- **Tester:**
  - integrasjon: analyse av prosjektdata gir forslag i alle seks kategorier

#### REQ-0397 – Redigerbar plakat etter generering
Etter generering skal brukeren kunne justere: bilder, tekst, typografi, farger, plassering, skalering, relasjonslinjer, synlighet og komposisjon.

- **Kilde:** Kap. 26.6 (l. 1133-1143) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, UI
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en generert plakat, så kan brukeren endre hver av bilder, tekst, typografi, farger, plassering, skalering, relasjonslinjer, synlighet og komposisjon.
- **Tester:**
  - e2e: endre hver egenskap og lagre

#### REQ-0398 – Separate redigerbare plakatelementer
Tekst og grafiske elementer i plakaten skal så langt mulig være separate redigerbare elementer.

- **Kilde:** Kap. 26.6 (l. 1144) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0397
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en lagret plakat, så er tekst og grafiske elementer lagret som separate objekter som kan redigeres enkeltvis.
- **Tester:**
  - dataintegritet: plakatmodell har separate element-objekter
- **Merknad:** «så langt mulig».

#### REQ-0399 – AI-bakgrunn ikke eneste lagringsform
AI-genererte bakgrunnsbilder skal ikke være den eneste lagringsformen for plakaten.

- **Kilde:** Kap. 26.6 (l. 1145) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0397
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en plakat med AI-generert bakgrunn, så finnes en strukturert plakatmodell (lag/elementer) i tillegg til bildet, og plakaten kan gjenoppbygges fra den.
- **Tester:**
  - dataintegritet: plakat kan åpnes og redigeres uten å regenerere bakgrunnen

#### REQ-0400 – Stilharmonisering av karakterbilder i plakat
Plakatmodulen skal kunne harmonisere karakterbilder til samme tegnestil, lyssetting og fargepalett.

- **Kilde:** Kap. 26.7 (l. 1146-1147) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, PROMPT, PROVIDER · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0384; Prompt Orchestration og Provider Adapters (fase 5)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt karakterbilder i ulike stiler, når brukeren harmoniserer, så produseres nye versjoner i felles tegnestil, lyssetting og fargepalett uten at originalene endres.
- **Tester:**
  - integrasjon: harmonisering lager nye versjoner
  - manuell: visuell konsistens

#### REQ-0401 – Valg av kvalitetsnivå og modell for harmonisering
Brukeren skal kunne velge ønsket kvalitetsnivå og modell for stilharmonisering.

- **Kilde:** Kap. 26.7 (l. 1148) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** QUALITYCOST, PRESENT · **Invarianter:** INV-12
- **Avhengigheter:** REQ-0400
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt harmonisering, så kan brukeren velge modell og kvalitetsnivå før kjøring.
- **Tester:**
  - integrasjon: valg sendes til Quality & Cost Engine

#### REQ-0402 – Publisere harmoniserte bilder til globalt bibliotek
Vellykkede harmoniserte bilder skal kunne publiseres til det globale ressursbiblioteket som nye godkjente stilvarianter.

- **Kilde:** Kap. 26.7 (l. 1149) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** LIBRARY, PRESENT, VERSION · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0400
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et harmonisert bilde, når brukeren godkjenner og publiserer, så finnes det som ny stilvariant på karakteren i det globale biblioteket, og eksisterende varianter er uendret.
- **Tester:**
  - integrasjon: ny stilvariant opprettes
  - dataintegritet: eksisterende varianter uendret

#### REQ-0403 – Flere plakatvarianter for hovedfilm og spinoffer
Brukeren skal kunne lage og lagre flere plakatvarianter, både for hovedfilm og spinoffer.

- **Kilde:** Kap. 26.8 (l. 1150-1152) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, CORE
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt hovedfilm og en spinoff, så kan brukeren lagre flere plakatvarianter knyttet til hver produksjon.
- **Tester:**
  - enhet: plakat knyttet til produksjon-ID
  - e2e: flere varianter lagres og gjenåpnes

#### REQ-0404 – Plakater på norsk og engelsk
Plakater skal kunne eksporteres på norsk og engelsk.

- **Kilde:** Kap. 26.8 (l. 1153) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT, L10N, EXPORT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en plakat, så kan den eksporteres i norsk og engelsk språkversjon med oversatt tekst.
- **Tester:**
  - import/eksport: plakat i to språk

### Kapittel 27

#### REQ-0405 – Hovedoversikt over prosjektets tilstand
Animatic Studio skal gi brukeren kontinuerlig oversikt over prosjektets tilstand. Hovedoversikten skal blant annet vise: produksjoner i prosjektet, antall scener, total estimert spilletid, bekreftet spilletid, antall ferdige scener, scener under arbeid, scener som mangler produksjon, renderingsjobber, synkroniseringsavvik og API-kostnader.

- **Kilde:** Kap. 27.1 (l. 1155-1168) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, CORE, QUEUE, QUALITYCOST, VERSION
- **Avhengigheter:** Varighetsestimering (kap. 7)
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt, så viser hovedoversikten alle ti nøkkeltall, og de oppdateres når underliggende data endres.
- **Tester:**
  - integrasjon: aggregering av nøkkeltall
  - e2e: endre scenestatus og se oversikt oppdateres
- **Merknad:** Fase 2 nevner «en enkel produksjonsoversikt»; renderingsjobber/API-kostnader (fase 5) og avvik (fase 6) kommer senere.

#### REQ-0406 – Filtrering av oversikten
Brukeren skal kunne filtrere oversikten etter: produksjon, scene, karakter, objekt, status, ressursendring, språk og uavklarte avvik.

- **Kilde:** Kap. 27.2 (l. 1169-1178) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt hovedoversikten, så kan brukeren filtrere på hvert av de åtte kriteriene og kombinere filtre.
- **Tester:**
  - enhet: filterlogikk
  - e2e: filtrer på karakter og status
- **Merknad:** Filtre for ressursendring, språk og uavklarte avvik avhenger av fase 6–7.

#### REQ-0407 – Langvarige prosjekter uten tap av arbeid
Prosjektet skal bevare arbeidet over tid. Brukeren skal kunne forlate programmet og fortsette senere uten tap av: sceneoppbygging, historikk, genereringsprompter, ressurser, lyd, jobbstatus, eksportinnstillinger og produksjonsversjoner.

- **Kilde:** Kap. 27.3 (l. 1179-1189) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, SECURITY, QUEUE · **Invarianter:** INV-13
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt med data i alle åtte kategorier, når brukeren lukker programmet og åpner det igjen (også på annen nettleserøkt), så er alle data intakte.
- **Tester:**
  - e2e: lukk/åpne og sammenlign tilstand
  - dataintegritet: persistens av alle kategorier
- **Merknad:** Jf. prinsipp 26.

### Kapittel 28

#### REQ-0408 – Brukerens kontroll over prosjektdata
Brukeren skal ha kontroll over prosjektdataene.

- **Kilde:** Kap. 28 (l. 1191-1192) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Brukeren kan se, eksportere, endre og slette sine prosjektdata.
- **Tester:**
  - manuell: gjennomgang av dataeierskap

#### REQ-0409 – Vedvarende lagring av prosjektinformasjon
Prosjektinformasjon skal bevares til brukeren selv velger å endre eller slette den, innenfor tjenestens faktiske lagringsvilkår.

- **Kilde:** Kap. 28.1 (l. 1193-1194) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY · **Invarianter:** INV-14
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt lagret prosjektinformasjon, så slettes den aldri automatisk av applikasjonen uten brukerens handling.
- **Tester:**
  - dataintegritet: ingen automatisk sletting
- **Implementering:** db/migrations/0001_core.sql, src/adapters/storage/project-rows.ts

#### REQ-0410 – Ikke kritiske data kun i nettlesertilstand
Kritisk produksjonsdata skal ikke bygges utelukkende på midlertidig nettlesertilstand.

- **Kilde:** Kap. 28.1 (l. 1195) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, CORE
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt at nettleserens lokale lagring tømmes, så er alle kritiske prosjektdata fortsatt tilgjengelige fra varig lagring.
- **Tester:**
  - e2e: tøm localStorage/IndexedDB og åpne prosjekt
- **Implementering:** src/adapters/storage/commands.functions.ts, src/adapters/storage/project-rows.ts

#### REQ-0411 – Portabel eksport/sikkerhetskopi av prosjekt
Prosjektet skal kunne eksporteres eller sikkerhetskopieres i et dokumentert, portabelt format.

- **Kilde:** Kap. 28.2 (l. 1196-1197) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, SECURITY
- **Avhengigheter:** Project Core
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt, så kan det eksporteres til et dokumentert format, og formatet er beskrevet i dokumentasjon.
- **Tester:**
  - import/eksport: eksport → reimport gir likt prosjekt
- **Merknad:** Fase ikke angitt i kap. 32; satt til fase 4 (eksport). Jf. prinsipp 28.

#### REQ-0412 – Innhold i sikkerhetskopi
Sikkerhetskopien skal så langt praktisk mulig omfatte: strukturert prosjektdata, manusversjoner, ressursreferanser, redigerbare scener, promptversjoner, kontinuitetsdata, produksjonshistorikk og relevante mediefiler eller en tydelig oversikt over eksterne avhengigheter.

- **Kilde:** Kap. 28.2 (l. 1198-1206) · **Opprinnelse:** mandat · **Type:** data · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, SECURITY, VERSION
- **Avhengigheter:** REQ-0411
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en sikkerhetskopi, så inneholder den alle åtte kategorier, eller en oversikt over eksterne mediefiler som ikke er inkludert.
- **Tester:**
  - import/eksport: innholdskontroll av backup
  - dataintegritet: reimport bevarer ID-er og relasjoner
- **Merknad:** «så langt praktisk mulig».

#### REQ-0413 – Sikker håndtering av API-nøkler
API-nøkler og andre hemmeligheter skal håndteres sikkert.

- **Kilde:** Kap. 28.3 (l. 1207-1208) · **Opprinnelse:** mandat · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, PROVIDER
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - API-nøkler lagres kryptert/i hemmelighetslager og eksponeres ikke i klientkode, eksportfiler eller backup i klartekst.
- **Tester:**
  - integrasjon: nøkkel ikke lesbar fra klient
  - manuell: sikkerhetsgjennomgang
- **Merknad:** Nøkler brukes fra fase 5, men arkitekturen for hemmeligheter bør være på plass i fundamentet.

#### REQ-0414 – Logging avslører ikke tilgangsopplysninger
Loggføring må ikke avsløre sensitive tilgangsopplysninger.

- **Kilde:** Kap. 28.3 (l. 1209) · **Opprinnelse:** mandat · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Gitt et API-kall med nøkkel som feiler, så inneholder ingen logglinje nøkkelen eller andre hemmeligheter.
- **Tester:**
  - enhet: logg-redigering av hemmeligheter
  - integrasjon: søk etter nøkkel i logger
- **Implementering:** src/adapters/storage/commands.functions.ts

#### REQ-0415 – Skille mellom lagringskategorier
Systemet må skille mellom: redigerbare prosjektdata, kildemedier, genererte mediefiler, midlertidige renderingsfiler, eksportfiler og historiske versjoner. Dette er nødvendig for pålitelig lagring, backup og senere migrering.

- **Kilde:** Kap. 28.4 (l. 1210-1218) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY, CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver lagret fil/post er klassifisert i én av de seks kategoriene, og kategoriene lagres atskilt.
- **Tester:**
  - enhet: lagringsklassifisering
  - dataintegritet: midlertidige filer kan slettes uten tap av andre kategorier

### Kapittel 29

#### REQ-0416 – Eksport som selvstendig modul uten AI
Eksport skal være en selvstendig modul som ikke krever nye AI-genereringer for å bruke eksisterende materiale.

- **Kilde:** Kap. 29 (l. 1220-1221) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** EXPORT · **Invarianter:** INV-11
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt uten AI-leverandør konfigurert, så kan eksisterende materiale eksporteres uten feil og uten AI-kall.
- **Tester:**
  - integrasjon: eksport med AI-adaptere deaktivert

#### REQ-0417 – Filmeksport av ulike omfang
Brukeren skal kunne eksportere: én scene, valgte scener, en del av filmen, hele hovedfilmen, en spinoff, og en trailer eller pitchfilm.

- **Kilde:** Kap. 29.1 (l. 1222-1229) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, TIMELINE
- **Avhengigheter:** REQ-0416
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt, så kan brukeren eksportere hvert av de seks omfangene, og eksportert varighet samsvarer med valgt omfang.
- **Tester:**
  - import/eksport: eksport per omfang
  - e2e: eksporter valgte scener
- **Merknad:** Spinoff/trailer-eksport avhenger av fase 7.

#### REQ-0418 – Hybrid eksport av blandet materiale
Eksportmotoren skal kunne kombinere: lokal 2D-animasjon, AI-generert film, importert ferdig film, stillbilder, dialog, musikk og lydeffekter.

- **Kilde:** Kap. 29.2 (l. 1230-1238) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, COMPOSE, AUDIO
- **Avhengigheter:** REQ-0416
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en tidslinje med alle sju materialtyper, så produserer eksporten én sammenhengende fil med korrekt rekkefølge og lydmiks.
- **Tester:**
  - import/eksport: hybrid eksport
  - visuell: kontroller overganger

#### REQ-0419 – Manuseksport med valgt nummerering
Systemet skal eksportere korrekt formatert manus med nummereringsmetode valgt ved hver eksport.

- **Kilde:** Kap. 29.3 (l. 1239-1240) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT · **Invarianter:** INV-02
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt manuseksport, så må brukeren velge nummereringsmetode ved hver eksport, og interne scene-ID-er er uendret etterpå.
- **Tester:**
  - import/eksport: manuseksport med to nummereringsmetoder
  - dataintegritet: ID-er uendret
- **Implementering:** src/app/script/ExportDialog.tsx, src/core/screenplay/numbering.ts
- **Merknad:** Jf. kap. 5.2 og prinsipp 4.

#### REQ-0420 – Språkeksport av film og manus
Systemet skal eksportere film og manus på valgte språk.

- **Kilde:** Kap. 29.4 (l. 1241-1242) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** EXPORT, L10N
- **Avhengigheter:** REQ-0416
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt norsk og engelsk språkversjon, så kan film og manus eksporteres på hvert valgt språk.
- **Tester:**
  - import/eksport: eksport per språk

#### REQ-0421 – Plakateksport i trykk- og digitalformater
Systemet skal eksportere kinopitch-plakater og karakterkart i relevante trykk- og digitalformater.

- **Kilde:** Kap. 29.5 (l. 1243-1244) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** EXPORT, PRESENT
- **Avhengigheter:** REQ-0384
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt en plakat og et karakterkart, så kan begge eksporteres i minst ett trykkformat og ett digitalformat.
- **Tester:**
  - import/eksport: plakat i trykk- og digitalformat

#### REQ-0422 – Eksportkontroll før eksport
Før eksport skal programmet kontrollere: aktiv sceneorden, skjulte scener, aktivt filmmateriale, manglende mediefiler, uavklarte manusavvik, relevante språkspor, total varighet og teknisk kompatibilitet.

- **Kilde:** Kap. 29.6 (l. 1245-1254) · **Opprinnelse:** mandat · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, VERSION
- **Avhengigheter:** REQ-0416
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt et prosjekt med en manglende mediefil og et uavklart avvik, når brukeren starter eksport, så rapporteres begge før eksporten kjøres, sammen med resultatet av de øvrige kontrollene.
- **Tester:**
  - enhet: hver kontroll
  - e2e: eksportkontroll-rapport

#### REQ-0423 – Eksport tross avvik etter varsel
Brukeren skal kunne velge å eksportere selv om enkelte avvik er uavklarte, etter et tydelig varsel.

- **Kilde:** Kap. 29.6 (l. 1255) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** EXPORT, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0422
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Gitt uavklarte avvik, så vises et tydelig varsel, og brukeren kan bekrefte og eksportere likevel.
- **Tester:**
  - e2e: eksport etter bekreftet varsel

### Kapittel 30

#### REQ-0424 – Helhetlig profesjonell visuell identitet
Animatic Studio skal ha en helhetlig profesjonell visuell identitet.

- **Kilde:** Kap. 30 (l. 1257-1258) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle skjermbilder bruker samme designsystem (farger, typografi, komponenter).
- **Tester:**
  - visuell: designgjennomgang på tvers av moduler

#### REQ-0425 – Foretrukket visuelt uttrykk
Det visuelle uttrykket skal fortrinnsvis ha: mørk eller dempet filmatisk arbeidsflate, god kontrast, tydelig typografisk hierarki, diskré og konsekvent fargebruk, velorganiserte paneler, profesjonelle tidslinjer, tydelig statusinformasjon og rolige og presise interaksjoner.

- **Kilde:** Kap. 30.1 (l. 1259-1268) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Designsystemet har mørk/dempet arbeidsflate, kontrast som oppfyller WCAG AA for tekst, definert typografisk skala og konsistente statusindikatorer.
- **Tester:**
  - visuell: kontrastmåling
  - manuell: designgjennomgang mot de åtte punktene
- **Merknad:** Original modalitet er «Foretrekk».

#### REQ-0426 – Unngå leketøy- eller AI-demo-uttrykk
Unngå et visuelt uttrykk som minner om et leketøy eller en tilfeldig AI-demo.

- **Kilde:** Kap. 30.1 (l. 1269) · **Opprinnelse:** mandat · **Type:** design · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Manuell designgjennomgang bekrefter at grensesnittet fremstår som et profesjonelt produksjonsverktøy.
- **Tester:**
  - manuell: designgjennomgang

#### REQ-0427 – Logisk tilgang til hovedområder
Applikasjonen bør ha logisk tilgang til: 1) prosjektoversikt, 2) produksjonsvelger, 3) manus, 4) ressursbibliotek, 5) karakterkontinuitet, 6) sceneeditor, 7) kamera og tidslinje, 8) lyd og dialog, 9) AI-generering, 10) renderingskø, 11) overordnet filmmontering, 12) plakater og presentasjoner, 13) eksport, 14) prosjektinnstillinger.

- **Kilde:** Kap. 30.2 (l. 1270-1285) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert av de 14 områdene kan nås fra hovednavigasjonen eller en logisk overordnet visning.
- **Tester:**
  - e2e: naviger til hvert område
- **Merknad:** «bør». Områdene innføres gradvis i takt med fasene.

#### REQ-0428 – Hovedområder som funksjonelle moduler, ikke faner
Hovedområdene er funksjonelle moduler, ikke nødvendigvis én separat navigasjonsfane for hver funksjon.

- **Kilde:** Kap. 30.2 (l. 1286) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI
- **Avhengigheter:** REQ-0427
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Informasjonsarkitekturen kan samle flere områder i én visning uten å bryte tilgangen til hvert område.
- **Tester:**
  - manuell: IA-gjennomgang

#### REQ-0429 – Foreslå informasjonsarkitektur som reduserer kompleksitet
Utviklingspartneren skal foreslå en gjennomarbeidet informasjonsarkitektur som reduserer kompleksiteten for brukeren.

- **Kilde:** Kap. 30.2 (l. 1287) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, PROCESS
- **Avhengigheter:** REQ-0427
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et dokumentert IA-forslag (navigasjonsstruktur med begrunnelse) foreligger før UI-implementering av hovednavigasjonen.
- **Tester:**
  - manuell: IA-forslag gjennomgått av bruker

#### REQ-0430 – Norske funksjonsnavn i grensesnittet
Brukergrensesnittet skal kunne bruke norske funksjonsnavn som: Generer scene, Bruk denne, Ressursbibliotek, Manus, Sceneeditor, Filmtidslinje, Produksjonsoversikt, Eksporter, Spinoff, Godkjenn eksisterende film, Oppdater scene og Angre endring.

- **Kilde:** Kap. 30.3 (l. 1288-1301) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** UI, L10N
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Med norsk UI-språk vises de tolv angitte betegnelsene der funksjonene finnes.
- **Tester:**
  - enhet: norsk språkfil inneholder betegnelsene
  - visuell: UI-tekster

#### REQ-0431 – Engelske tekniske betegnelser internt
Engelske tekniske betegnelser kan brukes internt der det er hensiktsmessig.

- **Kilde:** Kap. 30.3 (l. 1302) · **Opprinnelse:** mandat · **Type:** ux · **Prioritet:** P3 · **Fase:** –
- **Moduler:** UI, PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Interne kode-/modulnavn kan være engelske uten at brukervendte tekster påvirkes.
- **Tester:**
  - manuell: kodegjennomgang
- **Merknad:** Tillatelse, ikke pålegg.

### Kapittel 31

#### REQ-0432 – Tydelig domeneseparasjon i arkitekturen
Utviklingen skal bygge på en tydelig separasjon mellom domener. Det skal foreslås og videreutvikles en arkitektur med minst de logiske komponentene i kap. 31. Modulene kan implementeres på ulike måter, men deres ansvarsområder bør være tydelig skilt.

- **Kilde:** Kap. 31 (l. 1304-1306, 1351) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, SCRIPT, TIMELINE, LIBRARY, CONTINUITY, COMPOSE, CAMERA, AUDIO, PROMPT, PROVIDER, QUALITYCOST, QUEUE, VERSION, L10N, PRESENT, EXPORT, SECURITY
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen har én komponent per modul i kap. 31 med definert ansvarsområde og grensesnitt.
  - Ingen modul har direkte avhengighet til en annen moduls interne data utenom definerte grensesnitt.
- **Tester:**
  - manuell: arkitekturgjennomgang
  - enhet: avhengighetsregler (f.eks. lint/import-regler)
- **Implementering:** src/core/, src/adapters/, src/app/
- **Merknad:** Jf. kap. 1.2 og prinsipp 28.

#### REQ-0433 – Modul: Project Core
Arkitekturen skal ha en logisk komponent «Project Core» med ansvarsområdet: Prosjekter, produksjoner, identiteter og relasjoner.

- **Kilde:** Kap. 31 (l. 1307-1309) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE
- **Avhengigheter:** REQ-0432
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Project Core med ansvar for: prosjekter, produksjoner, identiteter og relasjoner, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Implementering:** src/core/
- **Merknad:** Linje 1307/1308 duplikat.

#### REQ-0434 – Modul: Screenplay Engine
Arkitekturen skal ha en logisk komponent «Screenplay Engine» med ansvarsområdet: Import, parsing, strukturert manus, formatering, paginering, versjonering og eksport.

- **Kilde:** Kap. 31 (l. 1310-1312) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** SCRIPT
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Screenplay Engine med ansvar for: import, parsing, strukturert manus, formatering, paginering, versjonering og eksport, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1310/1311 duplikat.

#### REQ-0435 – Modul: Timeline & Assembly Engine
Arkitekturen skal ha en logisk komponent «Timeline & Assembly Engine» med ansvarsområdet: Sceneforekomster, filmrekkefølge, tidskoder, klipp og sammenstilling.

- **Kilde:** Kap. 31 (l. 1313-1314) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** TIMELINE
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Timeline & Assembly Engine med ansvar for: sceneforekomster, filmrekkefølge, tidskoder, klipp og sammenstilling, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0436 – Modul: Resource Library
Arkitekturen skal ha en logisk komponent «Resource Library» med ansvarsområdet: Karakterer, objekter, miljøer, mediefiler og stilprofiler.

- **Kilde:** Kap. 31 (l. 1315-1317) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** LIBRARY
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Resource Library med ansvar for: karakterer, objekter, miljøer, mediefiler og stilprofiler, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1315/1316 duplikat.

#### REQ-0437 – Modul: Continuity Engine
Arkitekturen skal ha en logisk komponent «Continuity Engine» med ansvarsområdet: Narrativ kronologi, karaktertilstander, utseendeendringer og konsekvensanalyse.

- **Kilde:** Kap. 31 (l. 1318-1320) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** CONTINUITY
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Continuity Engine med ansvar for: narrativ kronologi, karaktertilstander, utseendeendringer og konsekvensanalyse, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1318/1319 duplikat.

#### REQ-0438 – Modul: 2D Composition Engine
Arkitekturen skal ha en logisk komponent «2D Composition Engine» med ansvarsområdet: Lag, transformasjoner, keyframes, multiplan-effekter og lokal avspilling.

- **Kilde:** Kap. 31 (l. 1321-1322) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** COMPOSE
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer 2D Composition Engine med ansvar for: lag, transformasjoner, keyframes, multiplan-effekter og lokal avspilling, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0439 – Modul: Camera & Motion Engine
Arkitekturen skal ha en logisk komponent «Camera & Motion Engine» med ansvarsområdet: Kamerautsnitt, baner, Bézier-kontroller og easing.

- **Kilde:** Kap. 31 (l. 1323-1324) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** CAMERA
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Camera & Motion Engine med ansvar for: kamerautsnitt, baner, bézier-kontroller og easing, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0440 – Modul: Audio Engine
Arkitekturen skal ha en logisk komponent «Audio Engine» med ansvarsområdet: Dialog, språkspor, musikk, lydeffekter og synkronisering.

- **Kilde:** Kap. 31 (l. 1325-1327) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** AUDIO
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Audio Engine med ansvar for: dialog, språkspor, musikk, lydeffekter og synkronisering, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1325/1326 duplikat.

#### REQ-0441 – Modul: Prompt Orchestration Engine
Arkitekturen skal ha en logisk komponent «Prompt Orchestration Engine» med ansvarsområdet: Automatisk sammensetting av engelskspråklige, modellspesifikke genereringsinstruksjoner.

- **Kilde:** Kap. 31 (l. 1328-1330) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROMPT
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Prompt Orchestration Engine med ansvar for: automatisk sammensetting av engelskspråklige, modellspesifikke genereringsinstruksjoner, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1328/1329 duplikat.

#### REQ-0442 – Modul: Provider Adapters
Arkitekturen skal ha en logisk komponent «Provider Adapters» med ansvarsområdet: Integrasjoner med ulike AI-leverandører.

- **Kilde:** Kap. 31 (l. 1331-1333) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROVIDER
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Provider Adapters med ansvar for: integrasjoner med ulike ai-leverandører, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1331/1332 duplikat.

#### REQ-0443 – Modul: Quality & Cost Engine
Arkitekturen skal ha en logisk komponent «Quality & Cost Engine» med ansvarsområdet: Modellvalg, kvalitetsprofiler, budsjettgrenser og kostnadsestimering.

- **Kilde:** Kap. 31 (l. 1334-1335) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUALITYCOST
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Quality & Cost Engine med ansvar for: modellvalg, kvalitetsprofiler, budsjettgrenser og kostnadsestimering, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0444 – Modul: Render Queue
Arkitekturen skal ha en logisk komponent «Render Queue» med ansvarsområdet: Vedvarende genereringsjobber, status og feilhåndtering.

- **Kilde:** Kap. 31 (l. 1336-1337) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** QUEUE
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Render Queue med ansvar for: vedvarende genereringsjobber, status og feilhåndtering, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0445 – Modul: Version & Dependency Engine
Arkitekturen skal ha en logisk komponent «Version & Dependency Engine» med ansvarsområdet: Versjonering, avviksdeteksjon, endringsanalyse og ikke-destruktive oppdateringer.

- **Kilde:** Kap. 31 (l. 1338-1339) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** VERSION
- **Avhengigheter:** REQ-0432
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Version & Dependency Engine med ansvar for: versjonering, avviksdeteksjon, endringsanalyse og ikke-destruktive oppdateringer, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql
- **Merknad:** Versjoner defineres i fase 1; avviksdeteksjon/endringsanalyse i fase 6.

#### REQ-0446 – Modul: Localization Engine
Arkitekturen skal ha en logisk komponent «Localization Engine» med ansvarsområdet: Flerspråklig manus, dialog, undertekster og produksjonsvarianter.

- **Kilde:** Kap. 31 (l. 1340-1342) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** L10N
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Localization Engine med ansvar for: flerspråklig manus, dialog, undertekster og produksjonsvarianter, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1340/1341 duplikat.

#### REQ-0447 – Modul: Presentation Engine
Arkitekturen skal ha en logisk komponent «Presentation Engine» med ansvarsområdet: Plakater, karakterkart og annet presentasjonsmateriell.

- **Kilde:** Kap. 31 (l. 1343-1344) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PRESENT
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Presentation Engine med ansvar for: plakater, karakterkart og annet presentasjonsmateriell, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser

#### REQ-0448 – Modul: Export Engine
Arkitekturen skal ha en logisk komponent «Export Engine» med ansvarsområdet: Film, manus, lyd, plakater og prosjektbackup.

- **Kilde:** Kap. 31 (l. 1345-1347) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** EXPORT
- **Avhengigheter:** REQ-0432
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Export Engine med ansvar for: film, manus, lyd, plakater og prosjektbackup, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Merknad:** Linje 1345/1346 duplikat. Grunnleggende manuseksport i fase 2, filmeksport fase 4.

#### REQ-0449 – Modul: Security & Storage
Arkitekturen skal ha en logisk komponent «Security & Storage» med ansvarsområdet: Tilgangskontroll, API-nøkler, medielagring og dataintegritet.

- **Kilde:** Kap. 31 (l. 1348-1350) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** SECURITY
- **Avhengigheter:** REQ-0432
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Arkitekturdokumentasjonen definerer Security & Storage med ansvar for: tilgangskontroll, api-nøkler, medielagring og dataintegritet, og dette ansvaret ligger ikke i andre moduler.
- **Tester:**
  - manuell: arkitekturgjennomgang av ansvarsgrenser
- **Implementering:** db/migrations/0001_core.sql
- **Merknad:** Linje 1348/1349 duplikat. «Tilgangskontroll» – flerbruker registreres separat.

### Kapittel 32

#### REQ-0450 – Faseinndelt utvikling
Funksjonene skal ikke nødvendigvis implementeres samtidig. Utviklingen skal deles i realistiske, teknisk sammenhengende faser.

- **Kilde:** Kap. 32 (l. 1353-1355) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Det foreligger en faseplan der hver fase er teknisk sammenhengende og bygger på foregående faser.
- **Tester:**
  - manuell: gjennomgang av faseplan

### Kapittel Fase 1

#### REQ-0451 – Fase 1: Arkitektur og datamodell
Fase 1: Arkitektur og datamodell skal definere prosjekt, produksjon, scene, manusblokk, sceneforekomst, scenevariant, ressurs, medieklipp, filmmontering, versjoner og identitetsrelasjoner.

- **Kilde:** Kap. Fase 1 (l. 1356-1368) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0450
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Når fase 1 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Implementering:** src/core/, db/migrations/0001_core.sql
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler. Fase 1 sier «Definer» (datamodell), ikke «Implementer».

#### REQ-0452 – Fundament uten omfattende omskriving
Fundamentet fra fase 1 skal støtte videreutvikling uten omfattende omskriving.

- **Kilde:** Kap. Fase 1 (l. 1369) · **Opprinnelse:** mandat · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** CORE, PROCESS
- **Avhengigheter:** REQ-0451
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Datamodellen fra fase 1 inneholder alle objekttyper som senere faser trenger (inkl. sceneforekomst, scenevariant og produksjon), slik at fase 7 ikke krever migrering av kjerneobjekter.
- **Tester:**
  - manuell: arkitekturgjennomgang mot fase 2–8
  - dataintegritet: migreringstester ved nye faser

### Kapittel Fase 2

#### REQ-0453 – Fase 2: Manus og prosjektoversikt
Fase 2: Manus og prosjektoversikt skal implementere manusimport, scenedeteksjon, originaltro manusvisning, redigering, sceneidentiteter, en enkel produksjonsoversikt, varighetsestimering og grunnleggende manuseksport.

- **Kilde:** Kap. Fase 2 (l. 1370-1379) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0451
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 2 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 3

#### REQ-0454 – Fase 3: Ressursbibliotek og 2D-sceneeditor
Fase 3: Ressursbibliotek og 2D-sceneeditor skal implementere karakterer, objekter, miljøer, lagbasert komposisjon, kamera, keyframes og enkel lokal animatic-avspilling.

- **Kilde:** Kap. Fase 3 (l. 1380-1388) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 3
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0453
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 3 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 4

#### REQ-0455 – Fase 4: Tidslinje, lyd og filmmontering
Fase 4: Tidslinje, lyd og filmmontering skal implementere toveis manussynkronisering, dialogkoblinger, lydspor, overordnet filmtidslinje og enkel hybrid avspilling og eksport.

- **Kilde:** Kap. Fase 4 (l. 1389-1395) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** 4
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0454
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 4 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 5

#### REQ-0456 – Fase 5: Genereringsmotor og AI-integrasjoner
Fase 5: Genereringsmotor og AI-integrasjoner skal implementere modelladaptere, promptmotor, synlige og redigerbare prompter, kostnadsestimering, genereringsversjoner, automatisk segmentering og renderingskø.

- **Kilde:** Kap. Fase 5 (l. 1396-1404) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0455
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 5 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 6

#### REQ-0457 – Fase 6: Avansert produksjonskontroll
Fase 6: Avansert produksjonskontroll skal implementere avviksdeteksjon, kontinuitetsanalyse, karaktertilstander, ressursavhengigheter, sammenligning av versjoner og sikker oppdatering og regenerering.

- **Kilde:** Kap. Fase 6 (l. 1405-1412) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P2 · **Fase:** 6
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0456
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 6 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 7

#### REQ-0458 – Fase 7: Flerspråklighet og avledede produksjoner
Fase 7: Flerspråklighet og avledede produksjoner skal implementere engelsk manus, språkkoblinger, alternative lydspor, spinoffer, lokale scenevarianter og tilbakeføring av forbedringer.

- **Kilde:** Kap. Fase 7 (l. 1413-1420) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P2 · **Fase:** 7
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0457
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 7 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

### Kapittel Fase 8

#### REQ-0459 – Fase 8: Presentasjonsmodul og videre kvalitetssystem
Fase 8: Presentasjonsmodul og videre kvalitetssystem skal implementere pitchplakater, karakterkart, stilharmonisering, global publisering av stilvarianter, avanserte kvalitetsprofiler og utvidede eksporter.

- **Kilde:** Kap. Fase 8 (l. 1421-1428) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P3 · **Fase:** 8
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0458
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Når fase 8 avsluttes, er alle listede leveranser ferdige med testbare akseptansekriterier, og de bygger på leveransene i foregående fase.
- **Tester:**
  - manuell: fasegjennomgang/milepælsrevisjon
- **Merknad:** Prosesskrav (rekkefølge); de enkelte funksjonene er spesifisert som funksjonskrav i sine fagkapitler.

#### REQ-0460 – Fasene er utgangspunkt – vurder avhengigheter
Fasene er et utgangspunkt. Utviklingspartneren skal vurdere tekniske avhengigheter og anbefale justeringer når det er nødvendig.

- **Kilde:** Kap. Fase 8 (l. 1429) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0450
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Faseplanen inneholder en eksplisitt avhengighetsvurdering, og avvik fra fase-rekkefølgen er begrunnet.
- **Tester:**
  - manuell: gjennomgang av avhengighetsanalyse
- **Merknad:** Står under overskriften Fase 8, men gjelder hele kap. 32.

#### REQ-0461 – Grunnarkitektur foran isolerte funksjoner
Det er viktigere å bygge riktig grunnarkitektur enn å implementere mange isolerte funksjoner raskt.

- **Kilde:** Kap. Fase 8 (l. 1430) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0450
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver ny funksjon dokumenteres med hvordan den bygger på felles datamodell; funksjoner uten slik forankring godtas ikke.
- **Tester:**
  - manuell: kodegjennomgang
- **Merknad:** Står under overskriften Fase 8, men gjelder hele kap. 32.

### Kapittel 33

#### REQ-0462 – Aktiv, selvstendig og kritisk utviklingspartner
Claude skal opptre som en aktiv, selvstendig og kritisk utviklingspartner.

- **Kilde:** Kap. 33 (l. 1432-1433) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Claude tar initiativ til forslag og påpeker problemer/risikoer uten å bli spurt.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0463 – Vurdere helhetspåvirkning før forslag og kode
Før nye funksjoner foreslås eller kode skrives, skal det vurderes hvordan løsningen påvirker: felles datamodell, manus- og filmsynkronisering, permanente identiteter, versjonering, spinoffer, kontinuitet, språkversjoner, kostnader og portabilitet.

- **Kilde:** Kap. 33.1 (l. 1434-1444) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hvert funksjonsforslag inneholder en vurdering av påvirkning på alle ni områdene.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0464 – Ingen lokale løsninger som bryter prinsippene
Det skal ikke implementeres lokale løsninger som bryter med de overordnede prinsippene.

- **Kilde:** Kap. 33.1 (l. 1445) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P0 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen implementasjon bryter prinsippene i kap. 34; avvik avdekkes i gjennomgang før levering.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0465 – Strukturert definisjon av nye utviklingsområder
Når et nytt utviklingsområde påbegynnes, skal det normalt defineres: 1) målet, 2) brukerens arbeidsflyt, 3) nødvendige dataobjekter, 4) relasjoner og avhengigheter, 5) grensesnittet, 6) teknisk implementering, 7) feilsituasjoner, 8) testbare akseptansekriterier, 9) hvordan funksjonen passer inn i Lovable, 10) eventuelle begrensninger eller fremtidige migreringsbehov.

- **Kilde:** Kap. 33.2 (l. 1446-1457) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver ny områdebeskrivelse inneholder alle ti punktene (eller begrunnelse for utelatelse).
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** «normalt».

#### REQ-0466 – Presise, kopierbare Lovable-instruksjoner
Når brukeren ber om hjelp til utvikling i Lovable, skal Claude kunne utforme presise, komplette og praktisk gjennomførbare instruksjoner som kan kopieres inn i Lovable.

- **Kilde:** Kap. 33.3 (l. 1458-1459) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Instruksjonene kan limes direkte inn i Lovable uten omskriving.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0467 – Innhold i Lovable-instruksjoner
Lovable-instruksjonene skal beskrive: hvilke komponenter som skal opprettes, hvordan de skal fungere, hvilke data de skal lese og skrive, hvilke tilstander som skal håndteres, hvordan brukerinteraksjonene skal fungere og hvordan løsningen passer inn i eksisterende arkitektur.

- **Kilde:** Kap. 33.3 (l. 1460-1466) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0466
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver Lovable-instruksjon dekker alle seks punktene.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0468 – Ikke hele applikasjonen i ett steg
Det skal ikke foreslås å bygge hele applikasjonen i ett eneste stort utviklingssteg.

- **Kilde:** Kap. 33.3 (l. 1467) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Avhengigheter:** REQ-0466
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver Lovable-instruksjon avgrenser ett håndterbart utviklingssteg.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0469 – Ikke påstå uverifisert funksjonalitet
Claude skal ikke hevde at en modell, API-tjeneste eller Lovable har funksjonalitet som ikke er verifisert.

- **Kilde:** Kap. 33.4 (l. 1468-1469) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Påstander om tredjepartsfunksjonalitet er kildebelagt eller eksplisitt merket som uverifisert.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0470 – Beskrive teknisk usikkerhet
Når tekniske muligheter er usikre, skal usikkerheten beskrives.

- **Kilde:** Kap. 33.4 (l. 1470-1471) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved usikre tekniske muligheter inneholder svaret: beskrive teknisk usikkerhet.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0471 – Foreslå arkitektur ved usikkerhet
Når tekniske muligheter er usikre, skal det foreslås en egnet arkitektonisk løsning.

- **Kilde:** Kap. 33.4 (l. 1472) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved usikre tekniske muligheter inneholder svaret: foreslå arkitektur ved usikkerhet.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0472 – Skille MVP og fremtidig funksjonalitet
Når tekniske muligheter er usikre, skal det skilles mellom MVP og fremtidig funksjonalitet.

- **Kilde:** Kap. 33.4 (l. 1473) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved usikre tekniske muligheter inneholder svaret: skille mvp og fremtidig funksjonalitet.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0473 – Unngå udokumenterte egenskaper
Når tekniske muligheter er usikre, skal avhengighet av udokumenterte egenskaper unngås.

- **Kilde:** Kap. 33.4 (l. 1474) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved usikre tekniske muligheter inneholder svaret: unngå udokumenterte egenskaper.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0474 – Forklare forenkling eller utsettelse av krav
Prosjektmandatet representerer samlede produktbeslutninger. Hvis et krav bør forenkles, utsettes eller gjennomføres annerledes, skal Claude forklare hvorfor.

- **Kilde:** Kap. 33.5 (l. 1475-1477) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver foreslått forenkling/utsettelse har en eksplisitt begrunnelse.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0475 – Ikke stille bort krav i stillhet
Viktige krav skal ikke stilles bort i stillhet.

- **Kilde:** Kap. 33.5 (l. 1478) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P0 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Sporbarhetsmatrisen viser status for alle krav; ingen krav forsvinner uten registrert beslutning.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** P0 fordi det beskytter hele kravsettet.

#### REQ-0476 – Steg-for-steg utvikling
Applikasjonen skal utvikles steg for steg.

- **Kilde:** Kap. 33.6 (l. 1479-1480) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Utviklingen leveres i avgrensede inkrementer med egen verifikasjon.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0477 – Anbefalinger og konsekvensvurderinger ved arkitekturbeslutninger
Ved større arkitekturbeslutninger skal Claude bidra med tydelige anbefalinger og konsekvensvurderinger.

- **Kilde:** Kap. 33.6 (l. 1481) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver større arkitekturbeslutning har en dokumentert anbefaling og konsekvensvurdering.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0478 – Hele systemet forblir konsistent
Målet er ikke bare at en enkelt funksjon virker, men at hele systemet forblir konsistent etter hvert som nye funksjoner legges til.

- **Kilde:** Kap. 33.6 (l. 1482) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Regresjonstester for kjerneinvarianter kjøres ved hver ny funksjon og passerer.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

### Kapittel 34

#### REQ-0479 – Prinsipp 1: Produktet heter Animatic Studio
Produktet heter Animatic Studio, ikke AI Animatic Studio.

- **Kilde:** Kap. 34 (l. 1486-1487) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** –
- **Moduler:** UI
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Søk i UI-tekster, metadata og eksportfiler finner ikke «AI Animatic Studio».
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 1.1.

#### REQ-0480 – Prinsipp 2: Manus og film alltid strukturelt synkronisert
Manus og film skal alltid være strukturelt synkronisert. De skal bygge på samme prosjektmodell.

- **Kilde:** Kap. 34 (l. 1488-1490) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, SCRIPT, TIMELINE · **Invarianter:** INV-01
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Etter enhver strukturell operasjon (flytt, deaktiver, splitt) er aktiv scenestruktur i manus og film identisk.
- **Tester:**
  - dataintegritet: egenskapsbaserte tester på strukturell synk
- **Implementering:** src/core/views.ts
- **Merknad:** Oppsummerer kap. 2, 2.1, 3.4, 6, 15.2. Linje 1488/1489 duplikat.

#### REQ-0481 – Prinsipp 3: Scenenummer aldri permanent identitet
Scenenummer skal aldri brukes som permanent identitet. Alle scener og ressurser skal ha stabile interne identifikatorer.

- **Kilde:** Kap. 34 (l. 1491-1492) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE · **Invarianter:** INV-02, INV-03
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle relasjoner refererer interne ID-er; omnummerering endrer ingen relasjon.
- **Tester:**
  - enhet: ID-stabilitet ved flytting/omnummerering
- **Merknad:** Oppsummerer kap. 3.1, 3.2, 8.2.

#### REQ-0482 – Prinsipp 4: Eksportnummerering velges av brukeren hver gang
Eksportnummerering bestemmes av brukeren hver gang. Eksport skal ikke endre interne identiteter.

- **Kilde:** Kap. 34 (l. 1493-1495) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** EXPORT, SCRIPT · **Invarianter:** INV-02
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver manuseksport krever nummereringsvalg; interne ID-er er uendret etter eksport.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 5.2, 29.3. Linje 1493/1494 duplikat.

#### REQ-0483 – Prinsipp 5: Norsk er hovedmanus
Norsk er hovedmanus. Engelsk er en tilknyttet språkversjon.

- **Kilde:** Kap. 34 (l. 1496-1498) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** SCRIPT, L10N · **Invarianter:** INV-05, INV-06
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Endringer i engelsk versjon endrer ikke norsk hovedmanus automatisk.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 23.1, 23.2, 23.3. Linje 1496/1497 duplikat.

#### REQ-0484 – Prinsipp 6: Mange produksjonsversjoner per scene
En scene kan ha mange produksjonsversjoner. Tidligere versjoner skal bevares.

- **Kilde:** Kap. 34 (l. 1499-1501) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE · **Invarianter:** INV-13
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - En scene med flere versjoner beholder alle tidligere versjoner etter at ny aktiv versjon velges.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Implementering:** src/core/model.ts
- **Merknad:** Oppsummerer kap. 3.3, 15.3, 16.4, 17.4, 21.5. Linje 1499/1500 duplikat.

#### REQ-0485 – Prinsipp 7: Manusendringer flagger berørt materiale
Manusendringer skal flagge berørt materiale. De skal ikke automatisk overskrive eksisterende film.

- **Kilde:** Kap. 34 (l. 1502-1504) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, SCRIPT · **Invarianter:** INV-07
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter manusendring er berørt materiale flagget og filmfilene uendret.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 2.1, 2.2, 21.1, 21.4. Linje 1502/1503 duplikat.

#### REQ-0486 – Prinsipp 8: Godkjenne avvik, oppdatere eller angre
Brukeren skal kunne godkjenne avvik, oppdatere materiale eller angre endringen.

- **Kilde:** Kap. 34 (l. 1505-1506) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** VERSION, UI · **Invarianter:** INV-08
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For hvert flagget avvik tilbys de tre valgene, og hvert valg gir forventet tilstand.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 21.2, 2.2. Linje 1505/1506 duplikat.

#### REQ-0487 – Prinsipp 9: Animatics uten generativ AI
Animatics skal kunne spilles av og eksporteres uten generativ AI.

- **Kilde:** Kap. 34 (l. 1507-1508) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE, EXPORT · **Invarianter:** INV-11
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Med alle AI-adaptere deaktivert kan en animatic spilles av og eksporteres.
- **Tester:**
  - integrasjon: avspilling/eksport uten nettverk til AI
- **Merknad:** Oppsummerer kap. 1 (linje 25), 14, 29. Linje 1507/1508 duplikat.

#### REQ-0488 – Prinsipp 10: Lagbasert multiplan-inspirert 2D-editor
2D-editoren skal være lagbasert og inspirert av tradisjonell multiplan-animasjon.

- **Kilde:** Kap. 34 (l. 1509-1510) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 3
- **Moduler:** COMPOSE, CAMERA
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En scene kan bygges av flere lag med dybde, og kamerabevegelse gir parallakse mellom lag.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 11, 11.1. Linje 1509/1510 duplikat.

#### REQ-0489 – Prinsipp 11: Modellagnostisk AI med synlige prompter
AI-generering skal være modellagnostisk og basert på presise, synlige og redigerbare prompter.

- **Kilde:** Kap. 34 (l. 1511) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, PROVIDER
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Samme genereringsforespørsel kan sendes til minst to leverandører via adaptere; prompten vises og kan redigeres før sending.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 17.1, 17.3, 19.2.

#### REQ-0490 – Prinsipp 12: Engelske AI-instruksjoner og prompter
AI-systeminstruksjoner og genereringsprompter skal som hovedregel være på engelsk.

- **Kilde:** Kap. 34 (l. 1512) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Genererte prompter er på engelsk med mindre brukeren eksplisitt overstyrer.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 1.3, 17.2.

#### REQ-0491 – Prinsipp 13: Brukeren kontrollerer kvalitet, modell og kostnad
Brukeren skal kontrollere kvalitetsnivå, modellvalg og kostnader.

- **Kilde:** Kap. 34 (l. 1513) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUALITYCOST, PROVIDER · **Invarianter:** INV-12
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ingen betalt generering starter uten at brukeren har valgt/godkjent modell, kvalitetsnivå og kostnadsestimat.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 19.3, 19.5, 19.6.

#### REQ-0492 – Prinsipp 14: Produksjonsteknisk deling av lange scener
Lange scener skal kunne deles produksjonsteknisk uten å endre manusstrukturen.

- **Kilde:** Kap. 34 (l. 1514) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** PROMPT, TIMELINE, CORE · **Invarianter:** INV-10
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter segmentering er scene-ID, scenenummer og manusstruktur uendret.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 18, 18.1, 18.4.

#### REQ-0493 – Prinsipp 15: Import av ferdig film koblet til manus
Ferdig film skal kunne importeres og knyttes til bestemte manuspassasjer.

- **Kilde:** Kap. 34 (l. 1515-1516) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 4
- **Moduler:** TIMELINE, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En importert filmfil kan knyttes til en bestemt manuspassasje og spilles av i tidslinjen.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 16, 16.1. Linje 1515/1516 duplikat.

#### REQ-0494 – Prinsipp 16: Kontinuerlig beregning av spilletid
Filmens estimerte og faktiske spilletid skal beregnes kontinuerlig.

- **Kilde:** Kap. 34 (l. 1517-1518) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** TIMELINE, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Estimert og faktisk spilletid oppdateres umiddelbart etter endring i manus eller tidslinje.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 7.1, 7.2, 27.1. Linje 1517/1518 duplikat.

#### REQ-0495 – Prinsipp 17: Varighet på egen oversiktsside
Varighetsinformasjon skal primært vises på en egen oversiktsside, ikke inne i manuslayouten.

- **Kilde:** Kap. 34 (l. 1519) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 2
- **Moduler:** UI, SCRIPT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ordinær manusvisning viser ikke varighetsdata; oversiktssiden gjør det.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 7.3, 6.3.

#### REQ-0496 – Prinsipp 18: Tidsstyrte utseendeendringer for karakterer
Karakterer skal kunne ha tidsstyrte utseendeendringer. Dette inkluderer blant annet at Maja klipper håret midt i filmen.

- **Kilde:** Kap. 34 (l. 1520-1522) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY, LIBRARY · **Invarianter:** INV-09
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Maja har langt hår før og kort hår etter klippehendelsen i fortellingstid, også ved flashback.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 9.1, 10, 10.1, 10.3, 10.5, 10.7. Linje 1520/1521 duplikat.

#### REQ-0497 – Prinsipp 19: Separate segmenter ved endring midt i scene
Ved en utseendeendring midt i en scene skal systemet kunne foreslå separate produksjonssegmenter. Det skal ikke endre sceneidentiteten eller scenenummeret.

- **Kilde:** Kap. 34 (l. 1523-1524) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 6
- **Moduler:** CONTINUITY, TIMELINE · **Invarianter:** INV-10
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Ved utseendeendring midt i scene foreslås segmenter, og scene-ID og scenenummer er uendret.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 10.6, 18.

#### REQ-0498 – Prinsipp 20: Delte ressurser, uavhengig manus og montering
Hovedfilm og spinoffer skal kunne dele ressurser, men ha uavhengig manus og filmmontering.

- **Kilde:** Kap. 34 (l. 1525-1526) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, LIBRARY, TIMELINE · **Invarianter:** INV-04
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En ressurs brukes i begge produksjoner; omorganisering i én endrer ikke den andres manus/montering.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 3.3, 8.1, 24.2, 24.3. Linje 1525/1526 duplikat.

#### REQ-0499 – Prinsipp 21: Spinoffer med egne nye scener
Spinoffer skal kunne inneholde egne nye scener. Disse skal ikke automatisk legges til hovedfilmen.

- **Kilde:** Kap. 34 (l. 1527-1529) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** CORE, SCRIPT · **Invarianter:** INV-04
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En ny spinoff-scene finnes ikke i hovedfilmen før eksplisitt overføring.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 24.4. Linje 1527/1528 duplikat.

#### REQ-0500 – Prinsipp 22: Tilbakeføring krever godkjenning
Forbedringer fra spinoffer skal kunne foreslås tilbakeført til hovedfilmen. Brukeren må godkjenne overføringen.

- **Kilde:** Kap. 34 (l. 1530-1531) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 7
- **Moduler:** VERSION, CORE · **Invarianter:** INV-08
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Tilbakeføring skjer kun etter eksplisitt brukergodkjenning.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 24.5, 25, 25.2.

#### REQ-0501 – Prinsipp 23: Plakater som selvstendige redigerbare eksportprodukter
Plakater og karakterkart skal være selvstendige, redigerbare eksportprodukter.

- **Kilde:** Kap. 34 (l. 1532-1533) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 8
- **Moduler:** PRESENT, EXPORT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En lagret plakat kan gjenåpnes, redigeres element for element og eksporteres separat.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 26, 26.6, 29.5. Linje 1532/1533 duplikat.

#### REQ-0502 – Prinsipp 24: Plakater 70 × 100 cm og flere informasjonsnivåer
Plakater skal støtte 70 × 100 cm og flere informasjonsnivåer.

- **Kilde:** Kap. 34 (l. 1534-1535) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 8
- **Moduler:** PRESENT
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Plakat kan eksporteres i 70 × 100 cm med valgbart informasjonsnivå.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 26.1, 26.3. Linje 1534/1535 duplikat.

#### REQ-0503 – Prinsipp 25: Publisering av harmoniserte bilder etter godkjenning
Harmoniserte karakterbilder skal kunne publiseres til globalt ressursbibliotek etter godkjenning.

- **Kilde:** Kap. 34 (l. 1536-1537) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 8
- **Moduler:** LIBRARY, PRESENT · **Invarianter:** INV-13
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et harmonisert bilde publiseres kun etter godkjenning, som ny versjonert stilvariant.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 9.2, 9.3, 26.7. Linje 1536/1537 duplikat.

#### REQ-0504 – Prinsipp 26: Jobber og status bevares mellom økter
Renderingsjobber og prosjektstatus skal bevares mellom arbeidsøkter.

- **Kilde:** Kap. 34 (l. 1538-1539) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 5
- **Moduler:** QUEUE, CORE
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter lukking og gjenåpning vises alle jobber med korrekt status, og pågående jobber kan gjenopptas.
- **Tester:**
  - manuell: verifiseres mot underliggende funksjonskrav
- **Merknad:** Oppsummerer kap. 20.2, 20.4, 27.3. Linje 1538/1539 duplikat.

#### REQ-0505 – Prinsipp 27: Aldri destruktive endringer uten beslutning
Eksisterende produksjonsmateriale skal aldri endres destruktivt uten brukerens eksplisitte beslutning.

- **Kilde:** Kap. 34 (l. 1540-1541) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** VERSION, CORE, SECURITY · **Invarianter:** INV-07, INV-13, INV-14
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Ingen operasjon sletter eller overskriver produksjonsmateriale uten eksplisitt brukerbekreftelse; alt er reverserbart.
- **Tester:**
  - dataintegritet: regresjonstester for ikke-destruktivitet
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql
- **Merknad:** Oppsummerer kap. 2.2, 21.5, 24.5, 25.2, 28.1. Linje 1540/1541 duplikat.

#### REQ-0506 – Prinsipp 28: Portabel arkitektur fra Lovable til desktop
Arkitekturen skal kunne videreutvikles fra Lovable til macOS- og Windows-applikasjoner.

- **Kilde:** Kap. 34 (l. 1542) · **Opprinnelse:** mandat · **Type:** prinsipp · **Prioritet:** P0 · **Fase:** 1
- **Moduler:** CORE, PROCESS
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Domene-/datamodell og produksjonslogikk har ingen avhengighet til Lovable-spesifikke API-er og kan kjøres utenfor nettleser.
- **Tester:**
  - manuell: arkitekturgjennomgang av plattformbindinger
- **Implementering:** src/core/
- **Merknad:** Oppsummerer kap. 1.2, 31, 28.2.

### Kapittel 35

#### REQ-0507 – Ikke implementere alt umiddelbart
Claude skal ikke forsøke å implementere hele Animatic Studio umiddelbart.

- **Kilde:** Kap. 35 (l. 1545) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Første leveranse er analyse og plan, ikke full implementasjon.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0508 – Mandatet er samlet produktspesifikasjon
Dokumentet skal behandles som prosjektets samlede produktspesifikasjon.

- **Kilde:** Kap. 35 (l. 1546) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P0 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Alle krav i mandatet er registrert og sporbare i kravsettet.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0509 – Første oppgave 1: Identifisere arkitektoniske avhengigheter
Som del av første oppgave skal Claude: Identifisere de viktigste arkitektoniske avhengighetene mellom modulene.

- **Kilde:** Kap. 35 (l. 1548) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et avhengighetskart mellom modulene i kap. 31 foreligger.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 1 av 8 i kap. 35.

#### REQ-0510 – Første oppgave 2: Foreslå robust intern datamodell
Som del av første oppgave skal Claude: Foreslå en robust intern datamodell som støtter både manus, sceneidentiteter, produksjoner, spinoffer, medieklipp og versjonering.

- **Kilde:** Kap. 35 (l. 1549) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Datamodellforslaget dekker manus, sceneidentiteter, produksjoner, spinoffer, medieklipp og versjonering.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 2 av 8 i kap. 35.

#### REQ-0511 – Første oppgave 3: Foreslå arkitektur for første versjon i Lovable
Som del av første oppgave skal Claude: Foreslå en realistisk teknisk arkitektur for første versjon i Lovable.

- **Kilde:** Kap. 35 (l. 1550) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Et arkitekturforslag for Lovable-versjonen foreligger.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 3 av 8 i kap. 35.

#### REQ-0512 – Første oppgave 4: Skille nettleser, backend og medietjenester
Som del av første oppgave skal Claude: Skille tydelig mellom funksjoner som bør implementeres i nettleseren, i en backend og eventuelt i egne medie- eller renderingtjenester.

- **Kilde:** Kap. 35 (l. 1551) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver hovedfunksjon er plassert i nettleser, backend eller medie-/renderingtjeneste med begrunnelse.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 4 av 8 i kap. 35.

#### REQ-0513 – Første oppgave 5: Anbefale prioritert MVP
Som del av første oppgave skal Claude: Anbefale en konkret, prioritert MVP som gir et fungerende grunnprodukt uten å blokkere de mer avanserte funksjonene senere.

- **Kilde:** Kap. 35 (l. 1552) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - MVP-forslaget er prioritert og viser at avanserte funksjoner ikke blokkeres.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 5 av 8 i kap. 35.

#### REQ-0514 – Første oppgave 6: Utviklingsplan med milepæler
Som del av første oppgave skal Claude: Definere en utviklingsplan med tydelige milepæler og testbare akseptansekriterier.

- **Kilde:** Kap. 35 (l. 1553) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Utviklingsplanen har milepæler med testbare akseptansekriterier.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 6 av 8 i kap. 35.

#### REQ-0515 – Første oppgave 7: Peke på tekniske risikoer
Som del av første oppgave skal Claude: Peke på tekniske risikoer, særlig knyttet til manusformatering, mediebehandling, tidslinjesynkronisering, AI-integrasjoner og datakonsistens.

- **Kilde:** Kap. 35 (l. 1554) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Risikolisten dekker minst manusformatering, mediebehandling, tidslinjesynkronisering, AI-integrasjoner og datakonsistens.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 7 av 8 i kap. 35.

#### REQ-0516 – Første oppgave 8: Første presise Lovable-instruksjon
Som del av første oppgave skal Claude: Foreslå den første presise utviklingsinstruksjonen vi bør gi Lovable.

- **Kilde:** Kap. 35 (l. 1555) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En første Lovable-instruksjon foreligger og oppfyller kravene i kap. 33.3.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Punkt 8 av 8 i kap. 35.

#### REQ-0517 – Ikke redusere til enkel AI-videogenerator
Produktvisjonen skal ikke reduseres til en enkel AI-videogenerator.

- **Kilde:** Kap. 35 (l. 1556) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P0 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Planer og MVP inkluderer manus, 2D-animatic, lyd og montering uavhengig av AI.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser

#### REQ-0518 – Sporbarhet til felles prosjektstruktur
Animatic Studio skal bygges som en sammenhengende, profesjonell filmproduksjonsapplikasjon, der manus, visuelt materiale, lyd, produksjonsvarianter og endelig film alltid kan spores tilbake til den samme gjennomarbeidede prosjektstrukturen.

- **Kilde:** Kap. 35 (l. 1557) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P0 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - For ethvert medieklipp, lydspor og eksport kan man spore tilbake til scene-ID, produksjon og manusversjon.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Gjentar kap. 2 / INV-01 som overordnet mål.

#### REQ-0519 – Overordnet mål: kreativ kontroll og teknisk automatisering
Det overordnede målet er å gi filmskaperen full kreativ kontroll fra manus til ferdig film, samtidig som programmet automatiserer det tekniske arbeidet som ellers gjør produksjonen tungvint, kostbar og vanskelig å holde oversikt over.

- **Kilde:** Kap. 35 (l. 1558-1559) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Funksjonsforslag vurderes mot både kreativ kontroll (brukerstyrt) og reduksjon av teknisk arbeid.
- **Tester:**
  - manuell: gjennomgang av arbeidsleveranser
- **Merknad:** Linje 1558/1559 duplikat. Overordnet mål, vanskelig å teste direkte.

### Tillegg etter mandatet (brukerbeslutninger og tekniske anbefalinger)

#### REQ-0520 – Flere brukere per prosjekt
Et prosjekt skal kunne ha flere brukere (prosjektmedlemmer) som arbeider i det samme prosjektet.

- **Kilde:** Beslutning DEC-0003 · **Opprinnelse:** brukerbeslutning · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** COLLAB, CORE, SECURITY · **Invarianter:** INV-C2
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt et prosjekt med eier A, når B blir medlem, så ser både A og B det samme prosjektet, de samme produksjonene og det samme manuset.
- **Tester:**
  - integrasjon: to testbrukere med medlemskap leser samme prosjekt; tredje bruker uten medlemskap får avslag
- **Implementering:** db/migrations/0001_core.sql
- **Merknad:** Ikke nevnt i mandatet v14. Lagt til av Mars 2026-10-08 som viktig for arbeidsdeling og arbeidsflyt.

#### REQ-0521 – Invitere brukere inn i prosjekt
Brukeren som oppretter et prosjekt skal kunne invitere andre brukere inn i prosjektet.

- **Kilde:** Beslutning DEC-0003 · **Opprinnelse:** brukerbeslutning · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, SECURITY, UI
- **Avhengigheter:** REQ-0520
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Gitt prosjekteier A, når A inviterer en e-postadresse og mottakeren aksepterer, så blir mottakeren medlem av prosjektet.
  - En invitasjon gir aldri tilgang til andre prosjekter enn det den gjelder.
- **Tester:**
  - e2e: eier inviterer, mottaker aksepterer, medlem ser prosjektet
  - integrasjon: invitasjonstoken for prosjekt X gir ikke tilgang til prosjekt Y
- **Implementering:** db/migrations/0001_core.sql#create_invitation, src/app/projects/ProjectOverview.tsx, src/routes/invitasjon.tsx

#### REQ-0522 – Flere brukere på samme manus
Flere prosjektmedlemmer skal kunne arbeide på det samme manuset uten at hverandres endringer går tapt.

- **Kilde:** Beslutning DEC-0003 · **Opprinnelse:** brukerbeslutning · **Type:** funksjonell · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, SCRIPT, VERSION · **Invarianter:** INV-01, INV-03, INV-C1
- **Avhengigheter:** REQ-0520; REQ-0526
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Gitt to medlemmer som redigerer ulike manusblokker samtidig, så bevares begge endringene.
  - Gitt to medlemmer som redigerer samme manusblokk samtidig, så tapes ingen av endringene i stillhet; konflikten vises og kan løses.
- **Tester:**
  - integrasjon: samtidig redigering av ulike blokker – begge bevart
  - integrasjon: samtidig redigering av samme blokk – konflikt oppdages, ingen stille overskriving
- **Implementering:** src/core/commands/apply.ts
- **Merknad:** Mekanismen (låsing, sammenslåing eller sanntidssamarbeid) er en teknisk beslutning – se ADR-0004.

#### REQ-0523 – Prosjektroller
Prosjektmedlemskap skal ha en rolle som styrer hva medlemmet kan gjøre. Foreslåtte roller er eier, redaktør, kommentator og leser.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, SECURITY · **Invarianter:** INV-C2
- **Avhengigheter:** REQ-0520
- **Status:** Verifisert
- **Akseptansekriterier:**
  - En leser kan ikke endre manus, ressurser, produksjoner eller innstillinger.
  - Bare eier kan endre roller, fjerne eier eller slette prosjektet.
- **Tester:**
  - integrasjon: rollematrise – hver rolle prøver hver skriveoperasjon mot backend
- **Implementering:** db/migrations/0001_core.sql
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010). Rollesettet er Claudes anbefaling, ikke vedtatt av Mars. Kan justeres.

#### REQ-0524 – Tilgangskontroll håndheves i backend
Tilgang til alle prosjektdata og mediefiler skal håndheves i backend (radnivåsikkerhet og lagringsregler), ikke bare i grensesnittet.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** sikkerhet · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** COLLAB, SECURITY, CORE · **Invarianter:** INV-C2
- **Avhengigheter:** REQ-0520
- **Status:** Verifisert
- **Akseptansekriterier:**
  - En innlogget bruker uten medlemskap får ingen rader og ingen mediefiler fra prosjektet ved direkte API-kall.
- **Tester:**
  - integrasjon: direkte databasekall som ikke-medlem returnerer tomt / avslag for alle prosjekttabeller
  - integrasjon: signert medie-URL kan ikke genereres av ikke-medlem
- **Implementering:** db/migrations/0001_core.sql
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010). Sikkerhetskritisk; nødvendig for REQ-0521.

#### REQ-0525 – Endringer registreres med bruker
Alle vesentlige endringer og beslutninger (godkjenning av avvik, aktiv versjon, publisering, kostnadsgodkjenning) skal registreres med hvilken bruker som utførte dem og når.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** data · **Prioritet:** P1 · **Fase:** 1
- **Moduler:** COLLAB, VERSION · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0520
- **Status:** Verifisert
- **Akseptansekriterier:**
  - Historikken for en scene viser hvem som gjorde hver endring.
- **Tester:**
  - dataintegritet: alle versjonsposter har forfatter-ID og tidspunkt
- **Implementering:** db/migrations/0001_core.sql#change_log
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010).

#### REQ-0526 – Samtidighet uten datatap
Systemet skal oppdage samtidige endringer på samme objekt og aldri overskrive en annens endring i stillhet. Medlemmene skal kunne se hvem som arbeider hvor i prosjektet.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** arkitektur · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, CORE, VERSION · **Invarianter:** INV-13, INV-C1
- **Avhengigheter:** REQ-0520
- **Status:** Verifisert
- **Akseptansekriterier:**
  - En skriving basert på en utdatert versjon av et objekt avvises eller flettes kontrollert, aldri overskrives blindt.
  - Når to medlemmer har samme scene åpen, ser begge at den andre er der.
- **Tester:**
  - integrasjon: optimistisk versjonskontroll – skriving med gammel revisjon avvises
  - e2e: tilstedeværelse vises for to samtidige brukere
- **Implementering:** src/core/commands/apply.ts, db/migrations/0001_core.sql#apply_changes
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010).

#### REQ-0527 – Angre per bruker
Angre og gjør om skal gjelde brukerens egne endringer og ikke reversere andre medlemmers uavhengige endringer.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** ux · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, VERSION, UI · **Invarianter:** INV-08
- **Avhengigheter:** REQ-0522
- **Status:** Under arbeid
- **Akseptansekriterier:**
  - Gitt at A og B har endret ulike blokker, når A angrer, så reverseres bare A sin endring.
- **Tester:**
  - integrasjon: angre for bruker A berører ikke B sine endringer
- **Implementering:** src/core/commands/apply.ts
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010). Samsvarer med kap. 21.2 C («uten å overskrive andre uavhengige redigeringer»).

#### REQ-0528 – Kostnadsgodkjenning er rollestyrt
Bare medlemmer med rett til å godkjenne kostnader skal kunne starte betalte AI-genereringer eller endre budsjettgrenser i et delt prosjekt.

- **Kilde:** Beslutning DEC-0010, DEC-0018 · **Opprinnelse:** teknisk-anbefaling · **Type:** sikkerhet · **Prioritet:** P2 · **Fase:** 5
- **Moduler:** COLLAB, QUALITYCOST, SECURITY · **Invarianter:** INV-12, INV-C3
- **Avhengigheter:** REQ-0523
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - En redaktør uten kostnadsrett får ikke startet en betalt jobb; forsøket gir tydelig melding.
- **Tester:**
  - integrasjon: backend avviser betalt jobb fra medlem uten kostnadsrett
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010). Hvem som eier API-nøklene i et delt prosjekt er et åpent spørsmål (OPEN_QUESTIONS Q-01, DEC-0018 – midlertidig antakelse). DEC-0021: Mars betaler alle API-kostnader i testfasen; kostnadsdeling avtales utenfor appen.

#### REQ-0529 – Fjerning av medlem er ikke-destruktiv
Når et medlem fjernes eller en invitasjon trekkes tilbake, skal medlemmets tidligere bidrag og historikk bevares i prosjektet.

- **Kilde:** Beslutning DEC-0010 · **Opprinnelse:** teknisk-anbefaling · **Type:** data · **Prioritet:** P1 · **Fase:** 2
- **Moduler:** COLLAB, VERSION · **Invarianter:** INV-13
- **Avhengigheter:** REQ-0520
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Etter at B er fjernet, finnes alle scener og versjoner B laget fortsatt, med B som forfatter i historikken.
- **Tester:**
  - dataintegritet: fjerning av medlem sletter ingen prosjektdata
- **Merknad:** Teknisk utledning av DEC-0003 (bekreftet). Selve løsningen er teknisk anbefaling (DEC-0010).

### Kapittel 1

#### REQ-0530 – Claudes rolle i prosjektet
Claude skal være Mars' langsiktige tekniske arkitekt, produktdesigner, UX-designer, systemutvikler og kreative utviklingspartner i arbeidet med å utvikle Animatic Studio.

- **Kilde:** Kap. 1 (l. 6) · **Opprinnelse:** mandat · **Type:** prosess · **Prioritet:** P1 · **Fase:** –
- **Moduler:** PROCESS
- **Status:** Ikke startet
- **Akseptansekriterier:**
  - Hver arbeidsøkt følger CLAUDE.md: leser relevante krav og beslutninger før endringer og oppdaterer handover etterpå.
- **Tester:**
  - manuell: milepælsrevisjon kontrollerer at arbeidsprosessen er fulgt
- **Merknad:** Tilføyd etter automatisk linjedekningskontroll.
