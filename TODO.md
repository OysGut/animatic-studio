# TODO – Animatic Studio

Huskeliste over det som er tenkt gjort, men ikke bygget. Holdes oppdatert av den som utvikler (Claude eller en annen KI) ved hver leveranse.
Kilder: beslutningsloggen (`docs/decisions/DECISION_LOG.md`), kravregisteret (`docs/product/requirements.yaml`), kjente problemer (`docs/development/KNOWN_ISSUES.md`).
Sist oppdatert: 2026-10-17 (DEC-0098, UI-løft U1 og U3).

## Bestilt av Mars, ikke bygget ennå
- **OG2 (Øystein 18.10.2026):** AI-kobling linje for linje legges i backloggen. Scenekobling er tilstrekkelig nå; ingen implementering i retterunde 1.
- **Fase 2 (DEC-0090, REQ-0668–0712):** alle bolkene A–E er bygget (bolk E: DEC-0096). Gjenstår: prøving på ekte telefoner og med ekte norsk lyd (KI-235, KI-239, KI-245, KI-248). KI-249 er rettet.
- **UI-løft (Øystein 17.10.2026):** gi hele grensesnittet et profesjonelt preg etter konvensjonene i FilmCraft/Premiere (ArtCraft er Rust/egui, så ingen kode kan gjenbrukes direkte), uten å endre funksjoner. U1 (skjemakontroller) og U3 (tidslinjer) er gjort (DEC-0098). U2, U4 (faner øverst) og U5 venter på Øysteins gjennomgang.
- **Fase 3 – Story Lab:** egen modul for historie- og karakterutvikling med VennTing-profiler, karaktersamtaler og regissørstyrt improvisasjon (spesifikasjon i Claude-prosjektet: `PHASE3_STORY_LAB_SPEC.md`). Tilhører manusarbeidet, ikke sceneeditoren; mulig knapp «Utforsk dialogen» i scenen. VennTing er kartlagt; integrasjonsplan i `PHASE3_STORY_LAB_INTEGRASJONSPLAN.md` (Claude-prosjektet), med to åpne valg for Øystein.
- **Fase 3 – Manusutforsker og scenevarighet:** tillegg til Asset Studio og globalt manusoppslag (`PHASE3_ASSET_STUDIO_ADDENDUM.md` i Claude-prosjektet): popup fra globusikonet som følger aktiv scene, «Fest» som eget vindu, og endring av scenevarighet i start, slutt eller proporsjonalt. Grunnspesifikasjonen for Asset Studio mangler – Øystein legger den inn.
- **Når en desktopversjon lages:** fjern grensen på 500 MB per videofil (REQ-0679) – uten å spørre Mars (DEC-0090).
- **Eksport til ProRes/MOV** for klipping i Premiere/DaVinci (DEC-0085). Nettleseren kan bare lage MP4 (H.264/VP9) og WebM; ProRes må lages hos en tjeneste (f.eks. Runway `outputFormat: "prores"` for AI-video, eller en egen konverteringstjeneste) eller i en framtidig lokal versjon.
- **Varsel når en generering er ferdig** – helst SMS til et mobilnummer registrert på brukeren (DEC-0085: *satt på vent*). Forslag: leverandøren melder ferdig (webhook fra fal.ai/Runway) → serveren legger inn videoen og sender varsel; ingen planlagt bakgrunnsjobb som kan bruke penger (DEC-0072). Krever valg av SMS-tjeneste (kostnad), felt for mobilnummer i brukerinnstillingene (personopplysning, samtykke) og godkjenning fra Mars.
- **Globale ressurser** på tvers av prosjekter (REQ-0571, DEC-0084). Åpent spørsmål til Mars: hvem kan bruke en felles ressurs (eieren i egne prosjekter, alle i eierens prosjekter, et team/firma)?
- **Stilharmonisering med AI** (REQ-0137–0145, REQ-0400–0402) – kostnaden er godkjent (DEC-0084).
- **«Lovable» ut av grensesnittet** (REQ-0639, DEC-0084): nøytrale ord for den innebygde AI-tjenesten og for databaseoppdateringer.

## Må gjøres av Mars eller administrator (DEC-0086, DEC-0088)
- Publiser appen, så bakgrunnsjobben (cron) kjører; adminsiden viser nå når den sist kjørte (DEC-0088).
- Nye AI-leverandører som er ønsket på adminsiden, bygges av Claude (DEC-0088).
- Fyll ut personvernerklæringen på adminsiden (behandlingsansvarlig, org.nr., adresse, kontakt, lagringssted) og la en jurist lese teksten (KI-214).
- Sjekk regionen i Lovable (Connectors → Cloud) og om planen har databehandleravtale / trening slått av.
- Prøv blokkering, sletting og «Hent videoen igjen» med en testkonto (KI-215).

## Venter på svar eller prøving fra Mars
- Prøv ord-til-lyd (bolk D) med et ekte norsk opptak: «Rediger» på et take av en replikk → «Analyser opptaket» (koster under en hundredel cent per replikk) → klikk ord og hør med kontekst. Si fra hvordan norsk fungerer (KI-245).
- Prøv pauser og romlyd (bolk E): «Tidsredigering» i lydeditoren, dra et mellomrom mellom to ord, lytt til romlyden, prøv «Digital stillhet» og «Spill av automatisk etter endring». Sett inn et annet take etter og prøv «Overganger mellom takes» (KI-248).
- Prøv lydeditoren (bolk C): «Rediger» på et take i lydvinduet, sett inn et nytt opptak etter, erstatt et område, lagre som ny versjon, «Bruk dette», og eksporter WAV og MP3.
- Prøv lydopptak (bolk B) på iPhone og Android: mikrofonikonet i en replikk på Manus-siden, QR-koden, Take 01/02 på mobilen, send bare ett, romlyd (KI-239).
- Prøv kameraikonet i sceneeditoren igjen etter publisering (KI-236/237 rettet); bruk «Vis teknisk feilmelding» hvis noe krasjer.
- Arkiver de ekstra «Fra mobil»/«From mobile»-variantene på Rolf (Bibliotek → Rolf → «Arkiver varianten»), eller si fra om du vil ha «Slå sammen varianter» (KI-238).
- Prøv fase 2 bolk A på iPhone og Android: QR-koden på prosjektsiden og i Maja, hurtigfoto, video, «Del lenke», at bildene dukker opp som nye versjoner (KI-235).
- Prøv DEC-0089 i sceneeditoren: panelet «Manus», «Rediger manus …» med forrige/neste scene, og lukking av panelene.
- Prøv DEC-0088 i appen: «Legg til element i scenen …», oppgaven øverst, systemmerknader, TODO-boksen, dørdeler, paneler side om side og AI-tilkoblinger på adminsiden.
- Språkvask av engelsk tekst (KI-198).
- Prøving med ekte nøkler: vinkler, oppskalering, stilanalyse og faktaark (KI-193); AI-video av scenen med referanser, lyd og samleark (KI-204, KI-213).

## Mindre ting
- Notater i manus mangler «løst»-status; TODO-boksen viser notater fra andre til de slettes (KI-224).
- AI-lagde bildedeler har ukjent plass i originalen (KI-220).
- Notat på enkeltord i manusvinduet i sceneeditoren (KI-226).
- Rydde gamle videoer av 2D-scenen i lagringen (`ai-source/`, KI-207).
- Legge inn ferdige AI-videoer i scenen uten at prosjektet er åpent (KI-209; hentingen gjøres nå av bakgrunnsjobben), henger sammen med varsling. Videoer tapes ikke lenger: de hentes når prosjektet åpnes (inntil sju dager), og «Hent videoen igjen» finnes (DEC-0086).
- Planlagte fagskills (del D/E i `.claude/skills/README.md`) opprettes når behovet kommer.

## Krav som ikke er ferdige (fra kravregisteret)
Generert fra `docs/product/requirements.yaml` 2026-10-15. Status «Verifisert» krever test eller dokumentert kontroll.

### Under arbeid (3)

- REQ-0037 – Stabile identifikatorer for alle domeneobjekter
- REQ-0451 – Fase 1: Arkitektur og datamodell
- REQ-0455 – Fase 4: Tidslinje, lyd og filmmontering

### Implementert – ikke verifisert (17)

- REQ-0022 – Skille strukturell og innholdsmessig synkronisering
- REQ-0102 – Teknisk metadata forstyrrer ikke manuslayout
- REQ-0110 – Usikre estimater presenteres som usikre
- REQ-0121 – Sentralt ressursbibliotek
- REQ-0146 – Scener bytter ikke automatisk variant
- REQ-0269 – Leverandøruavhengig AI-arkitektur
- REQ-0291 – Jobber uavhengige av nettleserfane
- REQ-0293 – Vedvarende backend-jobbarkitektur
- REQ-0415 – Skille mellom lagringskategorier
- REQ-0482 – Prinsipp 4: Eksportnummerering velges av brukeren hver gang
- REQ-0504 – Prinsipp 26: Jobber og status bevares mellom økter
- REQ-0623 – Lag andre vinkler med AI
- REQ-0625 – Stilanalyse av forbildebildene
- REQ-0626 – Visuelt faktaark per ressurs
- REQ-0627 – Seedream 4.5 og Qwen-Image-Edit
- REQ-0628 – Oppskalering
- REQ-0633 – Send 2D-scenen til AI-video fra sceneeditoren

### Ikke startet (59)

- REQ-0049 – Be om manglende referansefiler
- REQ-0137 – AI-basert stilharmonisering
- REQ-0138 – Harmoniseringsdimensjoner
- REQ-0139 – Bevar gjenkjennelig identitet
- REQ-0140 – Sammenligne original og harmonisert
- REQ-0141 – Harmonisert bilde brukt lokalt
- REQ-0142 – Harmonisert bilde som alternativ variant
- REQ-0143 – Publisering til globalt karakterbibliotek
- REQ-0144 – Foretrukket referanse per stilprofil
- REQ-0145 – Publisering er eksplisitt brukerhandling
- REQ-0400 – Stilharmonisering av karakterbilder i plakat
- REQ-0401 – Valg av kvalitetsnivå og modell for harmonisering
- REQ-0402 – Publisere harmoniserte bilder til globalt bibliotek
- REQ-0429 – Foreslå informasjonsarkitektur som reduserer kompleksitet
- REQ-0430 – Norske funksjonsnavn i grensesnittet
- REQ-0431 – Engelske tekniske betegnelser internt
- REQ-0450 – Faseinndelt utvikling
- REQ-0453 – Fase 2: Manus og prosjektoversikt
- REQ-0454 – Fase 3: Ressursbibliotek og 2D-sceneeditor
- REQ-0456 – Fase 5: Genereringsmotor og AI-integrasjoner
- REQ-0457 – Fase 6: Avansert produksjonskontroll
- REQ-0458 – Fase 7: Flerspråklighet og avledede produksjoner
- REQ-0459 – Fase 8: Presentasjonsmodul og videre kvalitetssystem
- REQ-0460 – Fasene er utgangspunkt – vurder avhengigheter
- REQ-0461 – Grunnarkitektur foran isolerte funksjoner
- REQ-0462 – Aktiv, selvstendig og kritisk utviklingspartner
- REQ-0463 – Vurdere helhetspåvirkning før forslag og kode
- REQ-0464 – Ingen lokale løsninger som bryter prinsippene
- REQ-0465 – Strukturert definisjon av nye utviklingsområder
- REQ-0466 – Presise, kopierbare Lovable-instruksjoner
- REQ-0467 – Innhold i Lovable-instruksjoner
- REQ-0468 – Ikke hele applikasjonen i ett steg
- REQ-0469 – Ikke påstå uverifisert funksjonalitet
- REQ-0470 – Beskrive teknisk usikkerhet
- REQ-0471 – Foreslå arkitektur ved usikkerhet
- REQ-0472 – Skille MVP og fremtidig funksjonalitet
- REQ-0473 – Unngå udokumenterte egenskaper
- REQ-0474 – Forklare forenkling eller utsettelse av krav
- REQ-0475 – Ikke stille bort krav i stillhet
- REQ-0476 – Steg-for-steg utvikling
- REQ-0477 – Anbefalinger og konsekvensvurderinger ved arkitekturbeslutninger
- REQ-0478 – Hele systemet forblir konsistent
- REQ-0503 – Prinsipp 25: Publisering av harmoniserte bilder etter godkjenning
- REQ-0507 – Ikke implementere alt umiddelbart
- REQ-0508 – Mandatet er samlet produktspesifikasjon
- REQ-0509 – Første oppgave 1: Identifisere arkitektoniske avhengigheter
- REQ-0510 – Første oppgave 2: Foreslå robust intern datamodell
- REQ-0511 – Første oppgave 3: Foreslå arkitektur for første versjon i Lovable
- REQ-0512 – Første oppgave 4: Skille nettleser, backend og medietjenester
- REQ-0513 – Første oppgave 5: Anbefale prioritert MVP
- REQ-0514 – Første oppgave 6: Utviklingsplan med milepæler
- REQ-0515 – Første oppgave 7: Peke på tekniske risikoer
- REQ-0516 – Første oppgave 8: Første presise Lovable-instruksjon
- REQ-0517 – Ikke redusere til enkel AI-videogenerator
- REQ-0518 – Sporbarhet til felles prosjektstruktur
- REQ-0519 – Overordnet mål: kreativ kontroll og teknisk automatisering
- REQ-0530 – Claudes rolle i prosjektet
- REQ-0571 – Globale ressurser på tvers av prosjekter
- REQ-0639 – Leverandørnavnet «Lovable» står ikke i grensesnittet
