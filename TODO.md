# TODO – From Pen to Glass

## B-116 – delt klipp
- Delt klipp via server-generert kort eksport (≤15 s), med målt varighet og MIME. Til da deles scener bare som stillbilde, og 0087 avviser video.

## PTG7 – ekte Nuke- og Fusion-import
- Importer tests/fixtures/ptg7 og en eksportert pakke i Nuke og Fusion Studio. Kontroller relative mediestier, Card2/ImagePlane3D, plater i riktig dybde, aksene, synsfelt og kamerakurver i begge riggmoduser og på toere. Syntaks- og modelltall er ikke bevis for ekte programimport. Resolve kan kreve MediaIn/MediaOut i stedet for Loader.

## PTG4 – lydfinjustering og ekte import
- Rhubarb-finjustering av tekststyrte munnspor fra lyd bygges ikke i PTG4. Ingen lyd sendes til tjenester.
- (0084 er kjørt i Cloud, N7.) Trollfilm prøver Moho DAT/Papagayo, Dragonframe JSON og munnkolonnen med ekte materiale.

## PTG6 – manuell klippeimport
- Prøv OTIO, FCP7-XML og CMX 3600 i Resolve, Premiere og Avid med og uten mediefiler. Kontroller relative stier, reel-tabell, håndtak, oddetallsoverlapp, lyd og aktiv Dragonframe-take. Claude kan lese eksemplene i tests/fixtures/ptg6 med OpenTimelineIO og adapterne. Ekte programimport må bekreftes av brukerne.

## PTG3 – venter på tilbakemelding fra ekte bruk
- AE-matter og animerte maskepunkter i bygg.jsx: bygges først når vi har tilbakemelding fra ekte After Effects-bruk.
- FBX forblir «eksperimentell» til noen har importert den i Dragonframe eller et annet ekte program. Valgfri binær FBX-variant er ikke bygget; LESMEG sier at Blender og mange andre bare leser binær FBX.
- PTG2 (B-102): ekte import av Dragonframe-pakken (referansefilm, PNG-sekvens per eksponering, lydstemmer, X-sheet CSV/PDF og FBX) i Dragonframe prøves av Trollfilm. Funn meldes tilbake.
- PTG5: Trollfilm må prøve en ekte Dragonframe-mappe/ZIP og en eksportert MOV/MP4. Kontroller versjonsspesifikke XML-felt, X1-filnavn, TIFF-støtte i nettleseren og sammenligning/aktiv avspilling med ekte opplastede filmer. Kunstige rundturer er grønne; ekte Cloud-opplasting er ikke verifisert i denne leveransen.

## B-049
- ML2–ML4 følger senere oppdrag. Gå gjennom 266 inventarkonflikter eksplisitt, ikke slå sammen automatisk. Mars avgjør tredjespråk/kvalitetssikrere senere; bruk en-XA i ML2-testene.

## DV5/DV6 – rester før full verifikasjon
- DV5 (N5 rettet): et resultat angret fra angrelisten merkes «angret» av «Angre hele jobben», som hopper over det. Gjenstår: resultater ferdige mens panelet er lukket kommer fortsatt ikke på angrelisten.
- Avklar gjenopprettet leverandørtilgang for varig blokkerte batcher uten automatiske probes.
- Kontroller eksisterende cron-plan i Cloud og verifisering4-mikrofon/font i Claudes miljø.


## DV3/DV4 – kontroll hos Claude
- Kjør DB-regresjon mot lokal Postgres (utilgjengelig i skriveøkten); ingen ny migrasjon.
- Kontroller hosted ElevenLabs-konto og retten til å opprette egen stemme; opprettelse skjer foreløpig i leverandørens Voice Lab, ikke i appen.
- Verifiser verifisering4-opptak/font i Claudes nettlesermiljø; DV3 falsk-mikrofon-suite er grønn.


Huskeliste over det som er tenkt gjort, men ikke bygget. Holdes oppdatert av den som utvikler (Claude eller en annen KI) ved hver leveranse.
Kilder: beslutningsloggen (`docs/decisions/DECISION_LOG.md`), kravregisteret (`docs/product/requirements.yaml`), kjente problemer (`docs/development/KNOWN_ISSUES.md`).
Sist oppdatert: 2026-10-21 (V1: kravstatus avstemt mot testene).

## B-098 – fonter fra Google Fonts, rester
- PDF-innbygging av prosjektfonter: ttf ligger i fontpakken, men ingen PDF-eksport bruker tekstlagenes fonter i dag (plakat-PDF bruker PDF-standardskriftene). Bygges når en PDF-eksport tegner tekstlag.
- Lisenstabellen (METADATA.pb) er generert fra én commit i google/fonts; kjør scripts/fonts/build-font-licenses.mjs på nytt ved behov. Familier utenfor tabellen antas fortsatt OFL.
- Kontroller i Cloud at lagringsbøtta godtar fontpakken (opplasting som application/octet-stream; gjenoppretting fra sikkerhetskopi sender application/x-ptg-fontpack).

## B-110 – CAPTCHA, rester
- Innloggingstjenestens innebygde CAPTCHA kan ikke slås på i Lovable Cloud; direkte kall kan fortsatt be om lenke/passordlenke for eksisterende kontoer og prøve passord (begrenses av tjenestens hastighetsgrenser). Nye kontoer krever pass (0076).
- Øystein: lag Turnstile-widget hos Cloudflare og legg TURNSTILE_SITE_KEY og TURNSTILE_SECRET_KEY i Project Settings → Secrets.
- Rigg runde 5 får migrasjon 0077.

## Sikkerhet
- **GP5 delingslenker:** nøkkelen lagres i klartekst i `film_shares.token` (bare lesbar for redaktører og eiere via `film_share_token`) så QR-koden kan vises igjen. Vurder kryptering.

## Backlogg fra den globale pakken (GP2–GP5)
- Omkoding på serveren for deling når nettleseren ikke kan lage H.264/AAC (f.eks. Firefox). Ikke bygget; QR-dialogen forklarer i stedet.
- Lagring av globale filer i egen bøtte per arbeidsgruppe (nå: «assets» med prefikset `global/`, bare service role).

## Bestilt av Mars, ikke bygget ennå
- **OG2 (Øystein 18.10.2026):** AI-kobling linje for linje legges i backloggen. Scenekobling er tilstrekkelig nå; ingen implementering i retterunde 1.
- **Fase 2 (DEC-0090, REQ-0668–0712):** alle bolkene A–E er bygget (bolk E: DEC-0096). Gjenstår: prøving på ekte telefoner og med ekte norsk lyd (KI-235, KI-239, KI-245, KI-248). KI-249 er rettet.
- **Når en desktopversjon lages:** fjern grensen på 500 MB per videofil (REQ-0679) – uten å spørre Mars (DEC-0090).
- **Varsel når en generering er ferdig** – helst SMS til et mobilnummer registrert på brukeren (DEC-0085: *satt på vent*). Forslag: leverandøren melder ferdig (webhook fra fal.ai/Runway) → serveren legger inn videoen og sender varsel; ingen planlagt bakgrunnsjobb som kan bruke penger (DEC-0072). Krever valg av SMS-tjeneste (kostnad), felt for mobilnummer i brukerinnstillingene (personopplysning, samtykke) og godkjenning fra Mars.

## Rigg & 2D-utskrift og 3D-print (B-087) – utsatt arbeid
Spesifikasjon: `docs/product/phase3/RIGG_3DPRINT_SPEC_v3.md`. Runde 0 (dokumentasjon) er ferdig 21.10.2026. Akseptansekriteriene A1–A17 er REQ-0879–REQ-0895.
- **Runde 1:** riggmodell, maler, størrelsesmatematikk (m = f / (d − f), mm internt), Rigg-fane og platenivå. Migrasjon 0071. Krav: A13 (REQ-0891).
- **Runde 2:** kontur fra maske, alfa eller avslåbart forslag. Krav: A5 (REQ-0883).
- **Runde 3:** inspeksjonsvindu og måleverktøy. Migrasjon 0072. Krav: A6–A11 (REQ-0884–REQ-0889).
- **Runde 4:** PDF-motor i mm, tre moduser, kalibrering og tiling. Krav: A4, A12 og A16 (REQ-0882, REQ-0890, REQ-0894).
- **Runde 5:** batch, kopier, QR, tosidig utskrift og mobiloppslag. Migrasjon 0073. Krav: A1–A3, A14 og A15 (REQ-0879–REQ-0881, REQ-0892, REQ-0893).
- **3D-print (utsatt, blokkerer ikke 2D):** 3D-01 … 3D-20 i `docs/development/TODO_3D_PRINT.md`, REQ-0896–REQ-0915. A17 (REQ-0895) dekkes av den TODO-en.

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
- KI-167: serveruttak av siste videobilde krever en tilgjengelig, godkjent medietjeneste eller kompatibel decoder. Ingen slik tjeneste er konfigurert; nettleseruttak beholdes.
- [x] KI-243: produksjonsbygget kontrollert i N9; MP3-koderen ligger bare i klientdelen (tests/architecture/n9-mp3-client-only.test.ts).

- KI-207: owner-bekreftet rydding er bygget/testet med falsk lagring; prøv mot ekte Cloud-lagring før produksjonsbruk. Ingen automatisk sletting.
- Legge inn ferdige AI-videoer i scenen uten at prosjektet er åpent (KI-209; hentingen gjøres nå av bakgrunnsjobben), henger sammen med varsling. Videoer tapes ikke lenger: de hentes når prosjektet åpnes (inntil sju dager), og «Hent videoen igjen» finnes (DEC-0086).
- Planlagte fagskills (del D/E i `.claude/skills/README.md`) opprettes når behovet kommer.

## Dokumentasjonsavstemming
- Øysteins leverte sammendrag og kap. 42–51 er registrert i DEC-0099/REQ-0740–0749. Kravene har konkrete testhenvisninger og deldekningsmerknader; ikke alle kapittelreiser er ende-til-ende-verifisert.
- Ferdig og fjernet fra byggebackloggen: ProRes/MOV-eksport (R4), AI-stilharmonisering (P8), T1, Story Lab, Manusutforsker, SV1, GP1–GP5, MT1–MT9/GP6, T2, CA1–CA8, U2/U4/U5, Ø-11, KI-240/241/242/251/252/255 og MT4-bilder. Øvrig ekte lyd-/mobilprøving over er fortsatt åpen.

## Krav som ikke er ferdige
Maskinelt avstemt fra requirements.yaml 2026-10-21 (878 krav: 708 Verifisert, 112 Implementert – ikke verifisert, 13 Under arbeid, 45 Ikke startet). Status alene er ikke en ny produktbeslutning. Prosesskravene REQ-0450–0530 venter på Mars.

### Under arbeid (13)

**P0 (1)**

- REQ-0037 – Stabile identifikatorer for alle domeneobjekter

**P1 (12)**

- REQ-0451 – Fase 1: Arkitektur og datamodell
- REQ-0455 – Fase 4: Tidslinje, lyd og filmmontering
- REQ-0740 – Fra filmidé til Story Lab-canvas
- REQ-0741 – Psykologisk karaktereditor og bevart arbeid
- REQ-0742 – Individuell samtale ved valgt tidspunkt
- REQ-0743 – Gruppesamtale med regi og pause
- REQ-0744 – Midlertidige tilstander endrer ikke profilen
- REQ-0745 – Kunnskapsgrenser per deltaker
- REQ-0746 – Rådgivende analyse av eksisterende scene
- REQ-0747 – Alternative improvisasjoner og sammenligning
- REQ-0748 – Godkjent overføring til redigerbart manus
- REQ-0749 – VennTing-teknologien er en selvstendig kopi

### Implementert – ikke verifisert (34)

N4 (22.10) flyttet 48 krav til Verifisert; se docs/development/N4_REPORT.md. N6 (22.10) flyttet 30 til; se docs/development/N6_REPORT.md. Listen under er ikke ryddet for de 30 og skal leses sammen med requirements.yaml.

**P0 (4)**

- - REQ-0291 – Jobber uavhengige av nettleserfane
- REQ-0293 – Vedvarende backend-jobbarkitektur
- REQ-0504 – Prinsipp 26: Jobber og status bevares mellom økter

**P1 (49)**

- REQ-0121 – Sentralt ressursbibliotek
- REQ-0685 – Hele dialogteksten vises under opptak
- REQ-0687 – Lydopptak på mobil – brukeren velger hva som sendes
- REQ-0689 – Opptaksstatus og lokal lagring på telefonen
- REQ-0699 – Valg av analysetjeneste der brukeren er
- REQ-0704 – Ny eller endret setning: ta opp bare det som mangler
- REQ-0708 – Naturlig romlyd i pauser
- REQ-0709 – Romlyd i overganger mellom takes
- REQ-0711 – Nettleserkompatibilitet for kamera, mikrofon og deling
- REQ-0751 – DV M2: hovedvisningen oppdateres
- REQ-0752 – DV M3: dobbeltklikk åpner riktig dialogeditor
- REQ-0753 – DV M4: riktig replikk forhåndsvalgt
- REQ-0755 – DV D1: aktiv replikk lesbar under opptak
- REQ-0756 – DV D2: kontekst i ca. 70 % styrke
- REQ-0757 – DV D3: miniatyr når den finnes
- REQ-0758 – DV D4: navn tydelig
- REQ-0759 – DV D5: velge annen replikk i nedtrekkslisten
- REQ-0760 – DV D6: sceneavspilling under opptak virker
- REQ-0762 – DV D8: eksisterende lydprofil (volumkurver, hastighet, bølgeform) virker
- REQ-0764 – DV L2: spornavn er karakternavn
- REQ-0766 – DV L4: versjoner stablet i dialogeditoren
- REQ-0767 – DV L5: forhåndslytting
- REQ-0773 – DV V1: «Generer lydfil»
- REQ-0774 – DV V2: standardstemme forhåndsvalgt
- REQ-0777 – DV V5: Lyd / Stemme-seksjon per karakter
- REQ-0778 – DV V6: velge ElevenLabs-stemme når integrasjonen finnes
- REQ-0780 – DV G1: handlingen i Asset Library gjelder bare aktivt prosjekt
- REQ-0781 – DV G2: dekning viser scener som mangler tale helt eller delvis
- REQ-0782 – DV G3: brukeren velger scener og replikker
- REQ-0783 – DV G4: ordrett advarsel ved eksisterende lyd
- REQ-0789 – DV G10: varig fremdrift per replikk med gjenopptak
- REQ-0790 – DV G11: automatisk plassering i riktig replikk og scene
- REQ-0793 – DV S1: UiLocale, scriptLanguage og speechLanguage er uavhengige
- REQ-0794 – DV S2: flere BCP-47-talespråk i samme prosjekt
- REQ-0797 – DV S5: usikker språkdeteksjon varsler før massegenerering
- REQ-0798 – DV S6: brukeren kan velge samlet generering med advarsel
- REQ-0799 – DV S7: separate språkjobber med egne stemmer og modeller
- REQ-0800 – DV S8: brukeren velger innhold og estimater per språkjobb
- REQ-0804 – DV A4: avviket er synlig overalt der manuset vises
- REQ-0805 – DV A5: lenke ut til riktig scene
- REQ-0806 – DV A6: avspillingshodet settes på replikkstart
- REQ-0807 – DV A7: ingen automatisk avspilling
- REQ-0808 – DV A8: endringer vises i rødt i dialogeditoren
- REQ-0813 – DV R1: handlingen ligger i Asset Library
- REQ-0814 – DV R2: berørte scener og replikker vises
- REQ-0815 – DV R3: brukeren velger replikker
- REQ-0816 – DV R4: språk og kostnad vises før generering
- REQ-0831 – DV H9: boks på prosjektsiden
- REQ-0839 – P4: WebM VP9 med eksplisitt alfastøtte

**P2 (1)**

- REQ-0571 – Globale ressurser på tvers av prosjekter

**P3 (11)**

- REQ-0137 – AI-basert stilharmonisering
- REQ-0138 – Harmoniseringsdimensjoner
- REQ-0139 – Bevar gjenkjennelig identitet
- REQ-0140 – Sammenligne original og harmonisert
- REQ-0141 – Harmonisert bilde brukt lokalt
- REQ-0142 – Harmonisert bilde som alternativ variant
- REQ-0143 – Publisering til globalt karakterbibliotek
- REQ-0144 – Foretrukket referanse per stilprofil
- REQ-0400 – Stilharmonisering av karakterbilder i plakat
- REQ-0401 – Valg av kvalitetsnivå og modell for harmonisering
- REQ-0402 – Publisere harmoniserte bilder til globalt bibliotek

**N4-avvik og ekstern prøving**

- REQ-0269 (N5 rettet): AssetVoice.provider er leverandør-ID fra katalogen; kravet er Verifisert.
- Krever ekstern prøving: REQ-0291, REQ-0293, REQ-0504 (lukket fane og gjenåpning mot ekte bakgrunnsjobb og leverandør), REQ-0685, REQ-0687, REQ-0689, REQ-0711 (ekte telefoner og opptak), REQ-0139 (N6: menneskelig vurdering av gjenkjennelighet på ekte genererte bilder).
- N6: ingen nye avvik funnet. Mangler fortsatt målrettet test (ikke avvik): REQ-0757 (miniatyr, fixture har ingen omslagsbilde), REQ-0760, REQ-0762, REQ-0764, REQ-0778, REQ-0781–0783, REQ-0790, REQ-0798, REQ-0800, REQ-0805, REQ-0806, REQ-0813, REQ-0815, REQ-0816, REQ-0143, REQ-0402, REQ-0401, REQ-0571, REQ-0699, REQ-0704, REQ-0708, REQ-0709, REQ-0121, REQ-0839 (VP9-alfa må prøves i en nettleser som koder alfa).

### Ikke startet (82)

B-087: REQ-0879–REQ-0895 (Rigg & 2D-utskrift, A1–A17) og REQ-0896–REQ-0915 (3D-print, utsatt) er ikke listet enkeltvis nedenfor; se seksjonen om B-087 over.

**P0 (5)**

- REQ-0464 – Ingen lokale løsninger som bryter prinsippene
- REQ-0475 – Ikke stille bort krav i stillhet
- REQ-0508 – Mandatet er samlet produktspesifikasjon
- REQ-0517 – Ikke redusere til enkel AI-videogenerator
- REQ-0518 – Sporbarhet til felles prosjektstruktur

**P1 (34)**

- REQ-0049 – Be om manglende referansefiler
- REQ-0429 – Foreslå informasjonsarkitektur som reduserer kompleksitet
- REQ-0430 – Norske funksjonsnavn i grensesnittet
- REQ-0450 – Faseinndelt utvikling
- REQ-0453 – Fase 2: Manus og prosjektoversikt
- REQ-0454 – Fase 3: Ressursbibliotek og 2D-sceneeditor
- REQ-0460 – Fasene er utgangspunkt – vurder avhengigheter
- REQ-0461 – Grunnarkitektur foran isolerte funksjoner
- REQ-0462 – Aktiv, selvstendig og kritisk utviklingspartner
- REQ-0463 – Vurdere helhetspåvirkning før forslag og kode
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
- REQ-0476 – Steg-for-steg utvikling
- REQ-0477 – Anbefalinger og konsekvensvurderinger ved arkitekturbeslutninger
- REQ-0478 – Hele systemet forblir konsistent
- REQ-0507 – Ikke implementere alt umiddelbart
- REQ-0509 – Første oppgave 1: Identifisere arkitektoniske avhengigheter
- REQ-0510 – Første oppgave 2: Foreslå robust intern datamodell
- REQ-0511 – Første oppgave 3: Foreslå arkitektur for første versjon i Lovable
- REQ-0512 – Første oppgave 4: Skille nettleser, backend og medietjenester
- REQ-0513 – Første oppgave 5: Anbefale prioritert MVP
- REQ-0514 – Første oppgave 6: Utviklingsplan med milepæler
- REQ-0515 – Første oppgave 7: Peke på tekniske risikoer
- REQ-0516 – Første oppgave 8: Første presise Lovable-instruksjon
- REQ-0519 – Overordnet mål: kreativ kontroll og teknisk automatisering
- REQ-0530 – Claudes rolle i prosjektet

**P2 (4)**

- REQ-0456 – Fase 5: Genereringsmotor og AI-integrasjoner
- REQ-0457 – Fase 6: Avansert produksjonskontroll
- REQ-0458 – Fase 7: Flerspråklighet og avledede produksjoner
- REQ-0571 – Globale ressurser på tvers av prosjekter

**P3 (2)**

- REQ-0431 – Engelske tekniske betegnelser internt
- REQ-0459 – Fase 8: Presentasjonsmodul og videre kvalitetssystem

## Samlet åpent (N7, 22.10.2026)

### Krever Øystein
- Avklaringer: «tilt» i 2D (KI-45), hendelser i deaktiverte scener (KI-100), deling av scener brukt i spinoff (KI-107), navn i REQ-0430 (KI-171), redaktør med eierens nøkkel (KI-157), varsel ved ferdig generering (DEC-0085, satt på vent), redigerbare bildeprompter.
- Prosesskravene REQ-0450–0530 og språkvask av engelsk (KI-198) og maskinoversatte språk.
- Personvernerklæring og juridisk gjennomgang (KI-214); region/databehandleravtale.
- Delt klipp (B-116) som egen sak.

### Krever ekstern prøving
- Lukket fane mot ekte bakgrunnsjobb: REQ-0291, REQ-0293, REQ-0504.
- Ekte telefoner og opptak: REQ-0685, REQ-0687, REQ-0689, REQ-0711, KI-235, KI-239, KI-245, KI-248.
- Menneskelig vurdering av harmoniserte bilder: REQ-0139. VP9 med alfa i ekte nettleser: REQ-0839.
- Ekte nøkler mot leverandørene (KI-153, KI-193, KI-204, KI-213), sperring/sletting av konto (KI-215), opprydding mot ekte lagring (KI-207).
- Ekte programimport: Dragonframe (PTG2/PTG5), Resolve/Premiere/Avid (PTG6), Nuke/Fusion (PTG7), After Effects/FBX (PTG3), Moho/Papagayo (PTG4), fysisk riggutskrift.
- After Effects «dobbeltklikk og åpne» (PTG3): startfilene på Windows og Mac, basemappe for medier og lagring som .aep. Sjekkliste i docs/development/AE_AAPNE_REPORT.md (Øystein eller Trollfilm).

### Teknisk gjeld
- Plassholder → bilde (23.10): lag i Asset Studio-utkast tilpasses ikke automatisk (utkastet lagrer egne lagfelter); allerede forvrengte lag rettes bare med «Nullstill format». Se docs/development/PLASSHOLDER_FIX_REPORT.md.
- N10 tilgjengelighet: bare mørkt tema finnes (DEC-0017), så lyst tema er ikke kontrollert utover det lyse manusarket. axe dekker sceneeditoren (scene- og animasjonsvisning) og manussiden; andre sider (montering, bibliotek, Asset Studio) er ikke gjennomgått.
- REQ-0210 (N8 rettet): arbeidsflaten, tidslinjen, SpacingRow og knappene tegnes ikke lenger per bilde. Gjenstår: egenskapspanelet (LayerInspector) og animasjonsfanens spor følger fortsatt bildet, med vilje, fordi de viser verdier på avspillingshodet.
- tests/visual/scene-panels-ui.mjs feiler 12/25 både før og etter N8 (venter på et klikk som aldri blir mulig); ikke undersøkt.
- [x] DV5 (N9): resultater ferdige mens panelet er lukket kommer på angrelisten neste gang arbeidsflaten åpnes i samme økt (tests/unit/n9-background-catchup.test.tsx). Angring forsvinner ved omlasting (dokumentert, KI-22).
- [x] en-XA-overløp (N9): verktøyraden i sceneeditoren hadde 0 px; fanelinjen øverst ble kuttet og viser nå bare ikoner med verktøytips når etikettene ikke får plass. nb/en uendret (ml2-languages 323/0).
- 33 krav uten målrettet test (liste i N6_REPORT.md) og 12 Story Lab-/prosesskrav uten samlet akseptansetest (N7_REPORT.md).
- [x] ZIP64 (KI-66/KI-80, N9): grensen på 3,8 GB fjernet; over 4 GB og over 65 535 filer testet (tests/unit/n9-zip64-large.test.ts). KI-250 lukket (screens.mjs avviklet i R5).
- Rhubarb-finjustering av munnspor fra lyd (PTG4), lydstrømming ved import (KI-67), KI-12 (delvis lasting i runCommand), KI-92 (frilegging i Web Worker).
- KI-30 krever Øystein: opprydding av alle ubrukte opplastinger, ikke bare AI-filer, betyr automatisk sletting av brukerens filer (se N9_REPORT.md).

- [ ] Visuell sjekk av miniatyrer (plassholderretting del 2) på nb og en i sceneeditoren og biblioteket — ikke kjørt i denne økten.

- [ ] Visuell sjekk av karaktertekst og synlige resultater på nb og en (krever at 0089 er kjørt i Cloud).
- [ ] Lerretet: nye lag plasseres i bildets midtpunkt; ved zoom eller flytting bort fra midten bør de plasseres innenfor gjeldende visning (visningen må gjøres tilgjengelig for dialogene).
- [ ] Claude: kjør migrasjon 0089 i Cloud (tekstversjoner og `assets.visual_brief_auto_at` for faktaark laget automatisk).
- [ ] Visuell sjekk på nb og en: faktaarket med «Laget automatisk fra manuset» vises på karakterkortet etter «Skriv med AI» (krever 0089 i Cloud).
- [ ] Visuell sjekk på nb og en: listen «Sendes med til bildemodellen» med avkrysning, «Legg til bilde …», hint/advarsel og grense (krever 0089 i Cloud).
- [ ] Bekreft grensen for antall inndatabilder for de innebygde bildemodellene (i dag ukjent, 6 brukes) og for Seedream 4.5 hos fal (satt til 10).
- [ ] Visuell sjekk av dialogstørrelse på nb og en, bred og smal (krever innlogget testkonto i forhåndsvisningen).
