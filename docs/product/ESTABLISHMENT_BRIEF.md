# Etableringsoppdraget (DEC-0019)

Mottatt fra Mars 2026-10-08 i Claude-prosjektet «Animatic Studio». Gjengitt ordrett nedenfor; bare markdown-overskrifter er lagt til for lesbarhet. Etterfulgt av Mars' tilleggsbeskjeder samme dag (DEC-0003–DEC-0006).

---

Animatic Studio – Etablering av ferdighetsbibliotek og varig prosjektkunnskap

## Din oppgave
Du skal etablere et profesjonelt, varig og versjonskontrollert utviklingsmiljø for Animatic Studio.
Du har allerede fått et omfattende prosjektmandat med 35 kapitler, kalt:
ANIMATIC STUDIO – Komplett prosjektmandat, produktvisjon og utviklingsinstruksjoner – samlet versjon 14.
Dette dokumentet representerer alle produktbeslutningene vi har tatt gjennom en lang utviklingsdialog.
Oppgaven din er nå å sørge for at disse beslutningene ikke forsvinner eller forvanskes etter hvert som prosjektet vokser, samtidig som du etablerer et bibliotek av spesialistferdigheter i `SKILL.md`-format som gjør deg best mulig rustet til utviklingsarbeidet.
Du skal ikke starte implementeringen av selve Animatic Studio før prosjektgrunnlaget, kompetansebiblioteket og kvalitetssikringsprosessene er på plass.

## DEL A – ETABLER EN AUTORITATIV KUNNSKAPSBASIS
### A1. Bevar det opprinnelige prosjektmandatet
Lagre hele prosjektmandatet som en uendret og komplett originalfil.
Foreslått plassering:
`docs/product/MASTER_SPECIFICATION.md`
Dokumentet skal inneholde nøyaktig hele teksten i versjon 14.
Ikke forkort, oppsummer, omskriv eller fjern deler når denne filen opprettes.
Hvis du ikke har tilgang til hele originaldokumentet, må du be om det. Du skal aldri forsøke å rekonstruere manglende kapitler fra hukommelsen.
Registrer hvilken versjon dokumentet representerer og når det ble mottatt.
Beskytt filen mot utilsiktet overskriving.
### A2. Opprett et kort CLAUDE.md
Opprett en kort og tydelig `CLAUDE.md` i rotmappen til prosjektets kildekoderepositorium.
Denne filen skal ikke inneholde hele prosjektmandatet.
Den skal i stedet inneholde:
* Produktnavn: Animatic Studio.
* Prosjektets formål.
* De viktigste ufravikelige arkitekturprinsippene.
* Oversikt over hvor fullstendige krav og beslutninger finnes.
* Hvordan du skal arbeide før du endrer kode.
* Regler for dokumentasjon, testing og versjonering.
* Hvordan prosjektets skills skal brukes.
* Prosedyre for å oppdatere prosjektkunnskap etter nye beslutninger.

Filen skal være kort nok til å være praktisk å lese i hver utviklingsøkt.
Den skal tydelig identifisere `docs/product/MASTER_SPECIFICATION.md` som den opprinnelige, autoritative produktspesifikasjonen.
### A3. Opprett kravregister
Opprett:
`docs/product/REQUIREMENTS.md`
Gå gjennom alle 35 kapitlene i prosjektmandatet.
Identifiser hvert konkret funksjonelle, arkitektoniske, sikkerhetsmessige og designmessige krav.
Gi hvert krav en permanent ID.
Eksempel:
`REQ-0001` – Produktnavnet er Animatic Studio.
`REQ-0002` – Manus og film skal alltid være strukturelt synkronisert.
`REQ-0003` – Scenenummer er aldri permanent sceneidentitet.
`REQ-0004` – Nummereringsmetode velges ved hver manuseksport.
Bruk disse kun som eksempler. Utled det komplette registeret fra hele prosjektmandatet.
For hvert krav skal du lagre:
* Permanent krav-ID.
* Presis kravtekst.
* Referanse til opprinnelig kapittel.
* Prioritet.
* Berørte moduler.
* Eventuelle tekniske avhengigheter.
* Status.
* Akseptansekriterier.
* Relevante tester.
* Implementeringsreferanser når disse finnes.

Ikke slå sammen forskjellige krav bare for å redusere antallet.
### A4. Opprett sporbarhetsmatrise
Opprett:
`docs/product/TRACEABILITY_MATRIX.md`
Matrisen skal kunne svare på:
* Hvor kommer dette kravet fra?
* Hvilken modul skal oppfylle det?
* Hvilke filer implementerer det?
* Hvordan testes det?
* Er det implementert?
* Har det blitt endret?
* Hvilken beslutning tillot endringen?

Et krav skal ikke regnes som ferdig implementert bare fordi kode er skrevet.
Det må finnes relevante kontroller eller tester som dokumenterer at kravet er oppfylt.
### A5. Opprett beslutningslogg
Opprett:
`docs/decisions/DECISION_LOG.md`
Bruk i tillegg egne Architecture Decision Records når viktige tekniske beslutninger tas.
Hver beslutning skal registrere:
* Beslutnings-ID.
* Dato.
* Problemstilling.
* Valgt løsning.
* Alternativer som ble vurdert.
* Begrunnelse.
* Berørte krav.
* Berørte moduler.
* Konsekvenser.
* Eventuelle endringer i tidligere beslutninger.

Skill tydelig mellom:
Bekreftet av bruker: En faktisk produktbeslutning.
Teknisk anbefaling: En løsning du foreslår.
Midlertidig antakelse: En forutsetning som ennå ikke er avklart.
Du skal aldri presentere dine egne antakelser som om brukeren har godkjent dem.
### A6. Opprett arkitekturdokumentasjon
Opprett:
`docs/architecture/ARCHITECTURE.md`
`docs/architecture/DOMAIN_MODEL.md`
`docs/architecture/DATA_RELATIONSHIPS.md`
`docs/architecture/INVARIANTS.md`
`docs/architecture/API_INTEGRATIONS.md`
Dokumentasjonen skal beskrive løsningen så konkret at en annen utvikler kan forstå hvordan systemet er ment å fungere.
Det er særlig viktig å dokumentere stabile identiteter, manussynkronisering, spinoffer, versjoner, tidslinjer og kontinuitet.
### A7. Opprett utviklingsstatus og handover
Opprett:
`docs/development/ROADMAP.md`
`docs/development/IMPLEMENTATION_STATUS.md`
`docs/development/CURRENT_WORK.md`
`docs/development/KNOWN_ISSUES.md`
`docs/development/SESSION_HANDOVER.md`
`CURRENT_WORK.md` skal vise hva som faktisk er under utvikling.
`SESSION_HANDOVER.md` skal gjøre det mulig å starte en ny Claude-samtale uten å miste:
* Hva som er gjort.
* Hva som er testet.
* Hva som gjenstår.
* Hvilke beslutninger som er tatt.
* Hvilke filer som ble endret.
* Hvilke uavklarte risikoer som finnes.
* Hva neste konkrete utviklingssteg er.

Handover-filen er en arbeidsstatus, ikke en erstatning for prosjektmandatet.

## DEL B – REGLER FOR PROSJEKTKUNNSKAP
### B1. Kildehierarki
Bruk følgende prinsipper:
1. Fullstendig prosjektmandat er den opprinnelige kilden til vedtatte krav.
2. Senere eksplisitt godkjente brukerbeslutninger kan utvide eller endre kravene.
3. Slike endringer skal registreres med tydelig historikk.
4. Arkitekturdokumentasjonen beskriver hvordan kravene oppfylles.
5. Ferdighetsfiler beskriver arbeidsmetoder, ikke nye produktkrav.
6. Kode viser hva som faktisk er implementert, men endrer ikke automatisk hva produktet skal gjøre.

Hvis dokumenter motsier hverandre, må du identifisere motsetningen og vise hvilken beslutning eller kravendring som eventuelt løser den.
Ikke velg en løsning i stillhet når konflikten gjelder brukerens vedtatte produktkrav.
### B2. Ikke mist krav under implementeringen
Før du begynner på en ny funksjon, skal du:
1. Finne relevante krav-ID-er.
2. Lese tilhørende kapitler i prosjektmandatet.
3. Undersøke relevante arkitekturbeslutninger.
4. Aktivere relevante skills.
5. Lage en gjennomføringsplan.
6. Definere akseptansekriterier.
7. Identifisere eksisterende funksjoner som kan påvirkes.

Etter implementering skal du:
1. Gjennomgå kodeendringene.
2. Kjøre relevante tester.
3. Kontrollere arkitekturregler.
4. Oppdatere implementeringsstatus.
5. Oppdatere sporbarhetsmatrisen.
6. Oppdatere handover-dokumentet.
7. Dokumentere eventuelle uavklarte forhold.

### B3. Beskytt de viktigste prinsippene
Følgende skal behandles som kritiske systeminvarianter:
* Manus og film er to visninger av den samme aktive produksjonsstrukturen.
* Scenenumre er ikke permanente identifikatorer.
* En scene beholder sin identitet gjennom flytting og omnummerering.
* Spinoffer kan bruke samme kildescene med selvstendig rekkefølge og lokale endringer.
* Norsk er hovedmanus.
* Andre språkversjoner skal ikke automatisk endre norsk hovedmanus.
* Ferdige filmsekvenser skal ikke overskrives automatisk etter manusendringer.
* Brukeren skal kunne godkjenne avvik, oppdatere produksjonsmateriale eller angre relevant endring.
* Karakterkontinuitet følger fortellingstid, også ved flashbacks.
* Produksjonsteknisk segmentering skal ikke endre manusscenenes identiteter.
* Generativ AI skal være valgfritt for ordinær 2D-animatic-avspilling og eksport.
* Betalte API-kall skal følge eksplisitte kostnadsgodkjenninger.
* Delte ressurser skal være versjonerte og ikke-destruktive.

Lag automatiserte tester for disse prinsippene der det er teknisk mulig.
### B4. Kontinuerlig kravrevisjon
Opprett en rutine som kontrollerer kravdekningen ved hver større utviklingsmilepæl.
Kontrollen skal avdekke:
* Krav som ikke lenger er representert i utviklingsplanen.
* Funksjoner som er implementert på en måte som strider mot kravene.
* Krav som mangler tester.
* Ubegrunnede endringer i arkitekturen.
* Dokumentasjon som ikke samsvarer med faktisk implementering.
* Nye funksjoner som mangler kravregistrering.

## DEL C – OPPRETT ET PROFESJONELT SKILL-BIBLIOTEK
Du skal etablere et prosjektspesifikt bibliotek av ferdigheter basert på den åpne Agent Skills-spesifikasjonen.
Foretrukket plassering når prosjektet brukes med Claude Code:
`.claude/skills/<skill-name>/SKILL.md`
Hver skill skal ha korrekt YAML-frontmatter med minst `name` og `description`.
Beskrivelsen skal gjøre det tydelig når ferdigheten skal aktiveres.
Hold hovedinstruksjonen kort og operativ.
Legg omfattende tekniske referanser i egne `references/`-filer, relevante skript i `scripts/` og maler i `assets/`.
Ikke lag 30 store filer som alle gjentar hele prosjektmandatet.
Skills skal henvise til prosjektets autoritative dokumentasjon.
### C1. Prioritet P0 – Ferdigheter som skal etableres først
`specification-guardian`
Skal beskytte prosjektets samlede produktvisjon og vedtatte krav.
Brukes ved nye funksjoner, endringer, refaktorering og arkitekturvalg.
Må kontrollere relevante deler av prosjektmandatet før arbeid begynner.
`requirements-traceability`
Skal opprette og vedlikeholde kravregister og sporbarhetsmatrise.
Må kunne oppdage manglende kravdekning.
Skal knytte krav til implementering og tester.
`architecture-guardian`
Skal sikre konsistens mellom domener, databaser, tjenester og brukergrensesnitt.
Må forstå skillet mellom prosjekt, produksjon, scene, sceneforekomst og scenevariant.
Skal varsle hvis en foreslått løsning skaper strukturell gjeld.
`lovable-development`
Skal utforme presise, avgrensede og testbare utviklingsinstruksjoner til Lovable.
Må forstå hvilke oppgaver som passer i frontend, backend og dedikerte medietjenester.
Skal undersøke gjeldende Lovable-dokumentasjon før den anbefaler plattformspesifikke funksjoner.
`design-system-director`
Skal utvikle og beskytte et profesjonelt visuelt designsystem.
Designretningen skal være sofistikert, filmatisk, elegant og troverdig.
Skillen skal dekke:
* Designretning.
* Typografi.
* Farger.
* Kontrast.
* Komponentbibliotek.
* Ikoner.
* Avstander.
* Informasjonshierarki.
* Mørkt grensesnitt.
* Mikrobevegelser.
* Visuell konsistens.

Den skal motarbeide generiske og tilfeldige AI-genererte grensesnitt.
`ux-interaction-design`
Skal utvikle presise arbeidsflyter for profesjonelle brukere.
Må ha særlig kompetanse innen:
* Tidslinjeinteraksjoner.
* Drag-and-drop.
* Redigerbare paneler.
* Tastatursnarveier.
* Undo/redo.
* Kontekstmenyer.
* Tilbakemeldinger ved langvarige jobber.
* Feilhåndtering.
* Responsivt arbeidsområde.
* Redigering uten tap av data.
* Reduksjon av unødvendige brukerhandlinger.

`react-typescript-engineering`
Skal sikre god kodekvalitet i valgt frontend-teknologi.
Må dekke:
* Komponentarkitektur.
* TypeScript.
* Datatilstand.
* Asynkrone operasjoner.
* Ytelse.
* Modulær kode.
* Feilhåndtering.
* Vedlikeholdbarhet.
* Testbarhet.

Tilpass kunnskapen til den faktiske teknologistakken som prosjektet bruker.
`database-domain-modeling`
Skal utvikle robust datamodellering.
Må beherske:
* Permanente identifikatorer.
* Versjonerte objekter.
* Relasjoner.
* Datamigrering.
* Integritetsregler.
* Transaksjoner.
* Historikk.
* Referanser til mediefiler.
* Produksjonsspesifikke overstyringer.

`screenplay-engineering`
Skal beherske profesjonelle filmmanusformater.
Må dekke:
* DOCX-import.
* Scenedeteksjon.
* Sceneoverskrifter.
* Dialog.
* Karakterbetegnelser.
* Parentetiske instruksjoner.
* Scenenummerering.
* Paginering.
* Eksport.
* Bevaring av manuslayout.

Bruk referansedokumentet `DEL 2.docx` som viktig testgrunnlag.
`scene-sync-invariants`
Skal være spesialist på synkronisering mellom manus, lyd, animatic og film.
Må kontrollere at rekkefølge, synlighet, permanente identiteter, tidskoblinger og aktiv filmmontering alltid forblir konsistente.
Skal ha egne regresjonstester for disse operasjonene.
`test-quality-engineering`
Skal utvikle prosjektets teststrategi.
Må dekke:
* Enhetstester.
* Integrasjonstester.
* End-to-end-tester.
* Visuelle regresjonstester.
* Dataintegritetstester.
* Test av import og eksport.
* Test av avansert brukerinteraksjon.
* Test av feilsituasjoner.
* Test av spinoff-isolasjon.

`secure-development`
Skal kontrollere informasjonssikkerhet.
Må dekke:
* API-nøkler.
* Tilgangsstyring.
* Sikker filimport.
* Backend-autorisering.
* Sikker medielagring.
* Avhengighetssikkerhet.
* Loggføring.
* Hemmelige opplysninger.
* Sikkerhet i eksterne plugins og skills.

## DEL D – FAGSPESIALISTER FOR ANIMATIC STUDIO
Disse ferdighetene skal planlegges nå og opprettes når den tilhørende utviklingsmodulen skal bygges.
### D1. Filmmanus og produksjonsstruktur
`screenplay-version-control`
Eksportnummerering, revisjonsmanus, manusdiff, historikk og stabil sceneidentitet.
`narrative-continuity-analysis`
Analyse av fortellermessige sammenhenger, manglende introduksjoner, flyttede hendelser og logiske motsetninger.
`duration-estimation`
Estimering av scenelengder, usikkerhetsintervaller, faktisk varighet og total spilletid.
`production-branching`
Hovedfilm, spinoffer, lokale scenevarianter, gjenbruk av kildemateriale og kontrollert tilbakeføring.
### D2. Bilde, kamera og animasjon
`multiplane-2d-engine`
Lagbasert animasjon, transformasjoner, parallakse, komposisjon og lokal avspilling.
`camera-motion-editor`
Kamerarammer, Bézier-baner, nøkkelbilder, easing, zoom, panorering og visuell manipulering.
`character-continuity`
Tidsstyrte karaktertilstander, hårklipp, kostymeskifter, skader, alder, flashbacks og automatisk referansevalg.
`asset-style-consistency`
Karakteridentitet, stilprofiler, harmonisering av bilder, godkjenning av varianter og gjenbruk i ressursbiblioteket.
### D3. Film, lyd og eksport
`editorial-timeline`
Klipp, spor, overganger, inn- og utpunkter, tidskoder og overordnet filmmontering.
`audio-dialogue-engine`
Dialog, lydsynkronisering, musikk, lydeffekter, språkspor og lydressurser.
`media-pipeline`
Videoimport, videometadata, mediekoding, transkoding, rendering og sammensatt eksport.
`multilingual-localization`
Kobling mellom norsk hovedmanus og engelsk oversettelse, språkspesifikke lydspor, undertekster og timingavvik.
### D4. AI-integrasjoner
`ai-provider-adapters`
Leverandøruavhengige integrasjoner, modellkapabiliteter, rate limits, feilbehandling og modellspesifikke parametere.
`generation-prompt-engineering`
Automatisk sammenstilling av engelskspråklige genereringsprompter fra strukturert sceneinformasjon.
Må bevare forskjellen mellom automatiske instruksjoner og manuelle overstyringer.
`render-queue-orchestration`
Vedvarende bakgrunnsjobber, fremdrift, gjenopptakelse, feilhåndtering og automatisk segmentering.
`ai-cost-quality-governance`
Kvalitetsprofiler, modellvalg, kostnadsestimater, budsjettgrenser, kandidatsammenligning og kvalitetskontroll.
### D5. Presentasjon og eksport
`cinematic-poster-design`
Profesjonelle kinopitch-plakater, karakterkart, grafiske relasjoner, stilharmonisering og sterke komposisjoner.
`print-prepress-export`
70 × 100 cm, trykkoppløsning, typografi, fargehåndtering, utfallende trykk og profesjonell eksport.

## DEL E – STØTTEFERDIGHETER FOR UTVIKLINGSPROSESSEN
Opprett eller gjenbruk i tillegg:
`git-version-control`
Trygge Git-arbeidsflyter, branches, commits, code review og mulighet for å reversere feil.
`documentation-maintenance`
Vedlikehold av arkitekturdokumentasjon, kravregister, beslutningslogg og utviklingsstatus.
`performance-profiling`
Optimalisering av store manus, mange lag, tunge tidslinjer, mediefiler og ressursbibliotek.
`accessibility-audit`
Tilgjengelighet, tastaturbruk, fokusstyring, kontrast, lesbarhet og universell utforming, med relevante WCAG-prinsipper.
`release-readiness`
Kontroll av om en milepæl er klar til demonstrasjon, testing eller produksjonssetting.
`skill-library-maintenance`
Opprettelse, testing, evaluering, versjonering og forbedring av prosjektets egne ferdigheter.

## DEL F – HENT EKSISTERENDE KOMPETANSE FRA PÅLITELIGE KILDER
Før du skriver en skill fra bunnen av, skal du undersøke om det finnes en god, vedlikeholdt ferdighet fra en pålitelig kilde.
Undersøk først:
Anthropics offisielle Claude-plugins:
https://github.com/anthropics/claude-plugins-official
Se spesielt etter relevante ferdigheter for:
* Frontend-design.
* Skill-utvikling.
* Funksjonsutvikling.
* Kodegjennomgang.
* Sikkerhet.
* TypeScript og utviklerverktøy.

Vercels Agent Skills:
https://github.com/vercel-labs/agent-skills
Vurder særlig:
* React-best-practices.
* Web-design-guidelines.

Agent Skills-standarden:
https://agentskills.io/specification
Bruk denne som autoritativ formatreferanse.
Undersøk også relevante offisielle tekniske kilder:
* Lovable-dokumentasjon.
* React- og TypeScript-dokumentasjon.
* Dokumentasjon for faktisk valgt database og backend.
* W3C/WCAG.
* Playwright for automatiserte grensesnittester.
* Fountain for filmmanusformater.
* OpenTimelineIO som mulig referanse for tidslinje- og utvekslingsmodeller.
* Dokumentasjon for valgt bilde- og animasjonsmotor.
* FFmpeg og annen relevant medieteknologi.
* Dokumentasjon for AI-leverandører som faktisk integreres.

Disse kildene er referanser for kompetanse og arkitektur, ikke en forhåndsbeslutning om hvilke biblioteker som skal brukes.
### F1. Ikke installer ukritisk
Før en ekstern skill installeres, skal du undersøke:
* Hvem som har publisert den.
* Om kilden er autentisk.
* Om lisensen tillater bruk.
* Om innholdet er oppdatert.
* Om den krever kjøring av kode.
* Om den ber om tilgang til sensitive filer eller nøkler.
* Om den inneholder instruksjoner som strider mot prosjektmandatet.
* Om en tilsvarende ferdighet allerede finnes.

Hent aldri tilfeldige skills fra ukjente kilder bare fordi de har et imponerende navn.
Bevar kildeinformasjon og versjon for eksterne ferdigheter.
### F2. Unngå duplisering
Hvis Claude Code allerede har en egnet innebygget ferdighet eller et offisielt plugin, bruk denne fremfor å lage en nesten identisk kopi.
Opprett prosjektspesifikke tilleggsferdigheter når Animatic Studio har spesielle krav som ikke dekkes av generelle løsninger.

## DEL G – STANDARD FOR HVER SKILL
Hver skill skal følge en konsekvent struktur.
Minimum:

```
skill-name/
├── SKILL.md
├── references/
│   └── REFERENCE.md
├── scripts/
└── assets/
```

Opprett bare støttefilene som faktisk er nødvendige.
En `SKILL.md` skal minst beskrive:
1. Navn og presis aktiveringsbeskrivelse.
2. Hvilke oppgaver ferdigheten er ansvarlig for.
3. Når den skal brukes.
4. Hvilke prosjektdokumenter som må leses.
5. Arbeidsprosedyre.
6. Hvordan resultatet skal leveres.
7. Kontrollpunkter.
8. Typiske feil som må unngås.
9. Test- eller akseptansekriterier.
10. Hvordan dokumentasjon og sporbarhet oppdateres.

Skillen skal ikke endre prosjektets vedtatte krav.
En skill skal lære Claude en arbeidsmetode, ikke opprette sin egen alternative produktvisjon.

## DEL H – DESIGNKVALITET SOM EGET KVALITETSKRAV
Animatic Studio skal utvikles med ambisjon om svært høy profesjonell designkvalitet.
Dette skal gjelde både estetikk og brukervennlighet.
Ved designarbeid skal du:
* Definere en bevisst visuell retning.
* Etablere et konsistent designsystem.
* Unngå generiske dashboard-maler.
* Prioritere arbeidsflyter for profesjonelle filmskapere.
* Designe for store, komplekse arbeidsflater.
* Håndtere manus, filmvisning og tidslinje på en koordinert måte.
* Sikre profesjonelle detaljer i drag-and-drop, keyframes og redigering.
* Støtte tastatur- og musearbeid effektivt.
* Sikre konsekvente tilbakemeldinger og gode feiltilstander.
* Gjennomføre visuell QA med faktiske skjermbilder når verktøyene tillater det.

Designvalg skal være forankret i filmproduksjonens behov, ikke bare i hva som ser moderne ut.
Ikke erklær et grensesnitt som ferdig bare fordi komponentene rendres uten tekniske feil.
Det skal også vurderes for forståelighet, estetisk kvalitet, flyt og effektivitet.

## DEL I – FORSLAG TIL REPOSITORY-STRUKTUR
Bruk følgende som utgangspunkt, og tilpass etter faktisk teknologistakk.

```
animatic-studio/
│
├── CLAUDE.md
│
├── .claude/
│   ├── skills/
│   │   ├── specification-guardian/
│   │   │   └── SKILL.md
│   │   ├── architecture-guardian/
│   │   │   └── SKILL.md
│   │   ├── design-system-director/
│   │   │   └── SKILL.md
│   │   └── ...
│   └── rules/
│
├── docs/
│   ├── product/
│   │   ├── MASTER_SPECIFICATION.md
│   │   ├── REQUIREMENTS.md
│   │   └── TRACEABILITY_MATRIX.md
│   │
│   ├── architecture/
│   │   ├── ARCHITECTURE.md
│   │   ├── DOMAIN_MODEL.md
│   │   ├── DATA_RELATIONSHIPS.md
│   │   ├── INVARIANTS.md
│   │   └── API_INTEGRATIONS.md
│   │
│   ├── decisions/
│   │   ├── DECISION_LOG.md
│   │   └── adr/
│   │
│   ├── design/
│   │   ├── DESIGN_SYSTEM.md
│   │   ├── UX_PRINCIPLES.md
│   │   └── COMPONENT_INVENTORY.md
│   │
│   ├── development/
│   │   ├── ROADMAP.md
│   │   ├── IMPLEMENTATION_STATUS.md
│   │   ├── CURRENT_WORK.md
│   │   ├── KNOWN_ISSUES.md
│   │   └── SESSION_HANDOVER.md
│   │
│   └── references/
│       ├── screenplay/
│       └── technical/
│
├── src/
├── tests/
└── ...
```

Manusfiler og annet materiale som kan inneholde sensitivt eller opphavsrettslig beskyttet prosjektinnhold, skal lagres med passende tilgangskontroll.
Ikke gjør et privat manus offentlig ved et uhell gjennom et åpent GitHub-repositorium.

## DEL J – SLIK SKAL DU STARTE ARBEIDET
Gjennomfør arbeidet i denne rekkefølgen:
### Trinn 1 – Kontroller arbeidsmiljøet
Finn ut om du arbeider i:
* Claude Desktop med Claude Projects.
* Claude Code.
* Et miljø med tilgang til lokale prosjektfiler.
* Et GitHub-repositorium.
* Et Lovable-prosjekt som er synkronisert med GitHub.

Ikke anta at funksjoner er tilgjengelige før dette er verifisert.
Hvis du mangler filsystemtilgang, skal du produsere ferdige, kopierbare filer og forklare hvor de skal legges.
Ikke påstå at filer er opprettet hvis de bare er foreslått.
### Trinn 2 – Les hele prosjektmandatet
Kontroller at samtlige 35 kapitler er tilgjengelige.
Lag en oversikt over de viktigste arkitekturprinsippene og identifiser eventuelle uklare punkter.
### Trinn 3 – Etabler prosjektkunnskapen
Opprett eller klargjør:
* Fullstendig masterspesifikasjon.
* CLAUDE.md.
* Kravregister.
* Sporbarhetsmatrise.
* Beslutningslogg.
* Arkitekturdokumentasjon.
* Utviklingsstatus.
* Handover-prosedyre.

### Trinn 4 – Undersøk eksisterende skills
Gå gjennom offisielle ferdigheter og plugins som allerede er tilgjengelige.
Lag en vurdering som viser:
* Skill-navn.
* Kilde.
* Hva den dekker.
* Om den finnes ferdig.
* Om den må utvikles spesielt.
* Om den overlapper med noe annet.
* Prioritet.

### Trinn 5 – Etabler P0-ferdighetene
Opprett, installer eller tilpass de 12 grunnleggende ferdighetene.
Valider at hver ferdighet har gyldig format og tydelig aktiveringslogikk.
### Trinn 6 – Test ferdighetene
Bruk representative scenarier fra prosjektmandatet.
Eksempelvis:
* En ferdig scene blir omnummerert.
* En scene flyttes i manus.
* En scene skjules.
* En spinoff redigerer en delt scene.
* Den norske dialogen endres.
* Maja klipper håret midt i en scene.
* En AI-generering overstiger API-grensen.
* Brukeren vil eksportere en engelsk filmversjon.

Kontroller at relevante ferdigheter gir anbefalinger i samsvar med prosjektmandatet.
### Trinn 7 – Lag en gjennomføringsplan
Når fundamentet er etablert, skal du lage en prioritert plan for videre utvikling i Lovable.
Hver milepæl skal vise:
* Hvilke krav som dekkes.
* Hvilke skills som skal brukes.
* Hvilke moduler som påvirkes.
* Hvilke tester som kreves.
* Hvilke tekniske risikoer som finnes.

## DEL K – LEVERANSEN JEG FORVENTER
Når du har gjennomgått oppgaven, skal du levere:
1. En kontrollert og prioritert oversikt over anbefalte skills.
2. En tydelig oversikt over hva som finnes ferdig og hva som må opprettes.
3. Forslag til prosjektets permanente mappestruktur.
4. En konkret `CLAUDE.md`.
5. En strategi for kravregister, sporbarhet og beslutningslogg.
6. En plan for sikker håndtering av eksterne skills.
7. En anbefalt rekkefølge for etablering av ferdighetene.
8. Et opplegg for testing og forbedring av hver skill.
9. En prosess for hvordan nye beslutninger skal innarbeides uten å miste tidligere krav.
10. Det første konkrete gjennomføringssteget.

Hvis du har filsystemtilgang og nødvendige tillatelser, kan du opprette den avtalte strukturen etter kontroll av eksisterende filer.
Hvis ikke, skal du levere komplette filutkast med tydelige filnavn.
Du skal ikke miste eller forenkle prosjektmandatet for å få plass til en enklere teknisk løsning.
Vårt mål er å bygge Animatic Studio på et solid, dokumentert og vedlikeholdbart fundament der spesialistkompetanse, implementering, designkvalitet og prosjektkunnskap utvikler seg sammen.

------
Jeg ser for meg at vi bruker github - jeg er ikke utvikler, så jeg trenger at vi sammen setter opp dette på en smart måte. Jeg trenger også instruks fra deg for slik at du får tilgang til de filene du trenger

---

## Tilleggsbeskjeder fra Mars samme dag (skrivefeil lett rettet)
1. «har ikke Final Draft, og filene du fikk var HELE den engelske og hele den norsk ikke bare del 2» → DEC-0002.
2. «Ja Trollfilm og Anita Killi eier dette og dette er et arbeid jeg gjør for dem, vi har tillatelse til å bruke dette i vårt arbeid, og de er vår første brukere. Jeg trenger også at det kan være flere brukere på samme manus, m.a.o. at første bruker kan invitere flere inn i et prosjekt, dette er ikke nevnt noe annet sted, men viktig konsept for god arbeidsdeling og arbeidsflyt. OK sett i gang» → DEC-0003, DEC-0004.
3. «men jeg ønsker at vi ikke prompter til Lovable en etter en, det vil ta meg en evighet – jeg ønsker at vi lager prosjektet vårt ferdig her og så kobler det over på GitHub som vi så knytter inn i et Lovable-prosjekt som da laster inn løsningen, og at jeg der da kan legge inn API-nøkler etc. for å teste grensesnittet. Dette er i tillegg et så stort arbeid at jeg ønsker å gi deg maksimal frihet til å gjennomføre dette prosjektet uten at jeg hele tiden må godkjenne ting du kommer med, fordi jeg er ingen utvikler og vet allikevel ikke hva som er best å gjøre, det vet du mye bedre enn meg» → DEC-0005, DEC-0006.
