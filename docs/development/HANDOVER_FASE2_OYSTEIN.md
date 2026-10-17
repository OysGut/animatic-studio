# Handover fase 2 – til kontoen oystein@gutu.no

**Fra:** Claude (har bygget fase 2 bolk A–D) på kontoen mars@gutu.no
**Til:** Claude Desktop på kontoen oystein@gutu.no (Diagonalen), koblet til Lovable
**Merk:** Mars og Øystein er **samme person**. Navnene i dette dokumentet betyr samme produkteier; «Mars» er brukt i resten av repoet. Han bytter bare konto for å fortsette arbeidet.
**Dato:** 17.10.2026
**Formål:** Alt du og din Claude trenger for å fullføre fase 2 av Animatic Studio: hele planen, hvilke deler den består av, status, alle krav som gjenstår, anbefalt teknisk løsning, arbeidsmåte og regler.

Til Claude på den nye kontoen: les dette dokumentet først, og jobb videre med Mars/Øystein akkurat som før. Han kan starte med for eksempel: «Les HANDOVER_FASE2_OYSTEIN.md i prosjektet og følg den.»

---

## 1. Kort fortalt

- **Animatic Studio** er en profesjonell filmproduksjonsapp som går fra manus til ferdig animatic og film. Den kjører på Lovable (TanStack Start, React 19, TypeScript) med Lovable Cloud (Supabase) som backend.
- **Fase 2** handler om mobilbroen og lyden: QR-koder, bilder, video og lyd fra mobilen, deling, lydopptak med takes, lydkomposisjon, ord-til-lyd, pauser og romlyd.
- **Bolk A–D er bygget, testet, committet og publisert.** Commit «39» (bolk B–D) og «Publiserte migrasjonene» ligger på `main` (sjekket 17.10). Databasen skal være på skjemaversjon 37.
- **Det som gjenstår:**
  - **Bolk E:** pauser, romlyd, overganger mellom takes, «Spill av automatisk etter endring» og ytelse (REQ-0705–0710 og REQ-0712).
  - **Prøving på ekte telefoner og med ekte norsk lyd:** seks krav står som «Implementert – ikke verifisert» (REQ-0685, 0687, 0689, 0697, 0699, 0704 og 0711).
  - **Noen kjente problemer og åpne spørsmål** (kapittel 7).
- **Den autoritative kilden** er `docs/product/PHASE2_SPECIFICATION.md` (1659 linjer). Den finnes i repoet og som prosjektdokument (`claude/PHASE2_SPECIFICATION.md`). Den skal aldri endres; en kontrollsum sjekker den.

---

## 2. Før du starter – sjekkliste

Gjør punktene i rekkefølge.

1. **(Gjort 17.10)** Bolk B–D er committet og pushet til `main`, og repoet på Macen er i synk med GitHub.
2. **Gi kontoen oystein@gutu.no tilgang til Claude-prosjektet «Animatic Studio».** Del prosjektet fra mars@gutu.no i claude.ai (prosjektet → Share, med redigeringstilgang), eller opprett et prosjekt på den nye kontoen og last opp `HANDOVER_FASE2_OYSTEIN.md`, `PHASE2_SPECIFICATION.md`, `MASTER_SPECIFICATION_v14.md` og `SESSION_HANDOVER.md`. Minnet fra mars@gutu.no følger ikke med til en annen konto, så alt som trengs, står her.
3. **Sjekk tilgangen i Lovable.** Lovable-prosjekt: `27853fcb-6a27-4342-b359-72ab82e87cfa`. Lovable Cloud: `dlvtgeqyagekfkvklmqm`. GitHub-repo: `OysGut/animatic-studio`, gren `main`.
4. **Sjekk hvem sine kreditter som brukes.** Lovable trekker kreditter fra **arbeidsområdet (workspace) som eier prosjektet**, uansett hvem som sender meldingen. Ligger kredittene du vil bruke i et annet arbeidsområde enn det som eier prosjektet, må prosjektet flyttes dit («Transfer project», bare eieren kan gjøre det). Sjekk dette før noe sendes til Lovable.
5. **Koble Claude Desktop til Lovable.**
   - I Claude: **+ → Connectors → Browse connectors**, søk etter «Lovable», trykk **Connect** og logg inn med Lovable-kontoen din.
   - Finnes den ikke i katalogen, legg den til som egen connector med adressen `https://mcp.lovable.dev`. Lovable bruker bare OAuth-innlogging, ingen API-nøkkel.
   - Prøv koblingen: be Claude kjøre `list_workspaces` og `get_project` for prosjekt-ID-en over.
6. **(Gjort 17.10)** Migrasjon 0036 og 0037 er kjørt og appen publisert («Publiserte migrasjonene»). Sjekk ved behov at databasen er på skjemaversjon 37, slik koden forventer (`EXPECTED_SCHEMA_VERSION` = 37).
7. **Åpne appen og sjekk** at Manus, Sceneeditor og Bibliotek fungerer, og at mikrofonikonet vises på en replikk.
8. **Les «Regler»** (kapittel 4) og legg prosjektinstruksene (kapittel 9) inn i Lovable.

---

## 3. Arbeidsmåte: Claude Desktop + Lovable

Hittil har det vært slik: Claude bygget og testet koden i sitt eget skymiljø, leverte filene til Macen, og Mars committet og limte en ferdig melding inn i Lovable. Nå skal Lovable-agenten gjøre mer av selve kodingen, for det er der kredittene brukes. Anbefalt fordeling:

| Hvem | Gjør hva |
|---|---|
| **Mars/Øystein** | Gir OK til hver bolk og hvert oppdrag. Prøver appen og svarer på spørsmål. Committer selv når kode kommer fra Claude. |
| **Din Claude** | Leser krav og kode og skriver presise oppdrag til Lovable, ett lite steg om gangen. Leser resultatet (`get_diff`, `read_file`, `list_edits`). Henter repoet til sitt skymiljø og kjører testene. Retter feil eller skriver neste oppdrag. Holder dokumentasjonen oppdatert. |
| **Lovable-agenten** | Skriver koden etter oppdraget, kjører migrasjoner nøyaktig som de står, og publiserer. |

### Én runde (gjentas for hvert oppdrag)
1. **Plan:** Claude finner kravene (REQ-ID-er), leser de aktuelle filene og skriver oppdraget med akseptansekriterier. Du sier OK.
2. **Bygg:** Claude sender oppdraget med `send_message` (koster kreditter), helst først i **plan-modus** så du ser planen før koden skrives.
3. **Kontroll:** Claude leser diffen og henter siste versjon fra GitHub (`gh repo clone OysGut/animatic-studio` eller `git pull`). Deretter kjører den testene (kapittel 10).
4. **Rett opp:** Ved feil skriver Claude et kort rettingsoppdrag til Lovable, eller retter selv og gir deg filene til commit. Ikke begge deler samtidig.
5. **Dokumentér:** Etter hvert oppdrag oppdateres `requirements.yaml` (status), `TODO.md`, `KNOWN_ISSUES.md` og handoveren.

### Viktig
- **Bare én skriver kode om gangen.** Lovable og Claude må aldri endre de samme filene parallelt. Hent alltid siste versjon fra GitHub før Claude endrer noe selv.
- **Lovable kan ikke kjøre testsuitene våre** (Vitest, databasetester, Playwright). Det gjør Claude. Skrevet kode er aldri «ferdig» før testene er grønne.
- **`AGENTS.md` sier at Lovable ikke skal endre** `docs/`, `src/core/`, `db/` eller `tests/` uten eksplisitt beskjed. Bolk E krever endringer i `src/core/` og `tests/`, så hvert oppdrag må si eksplisitt hvilke filer Lovable får endre, og at det er godkjent.
- **SQL-verktøyet i Lovable-koblingen** (`query_database`) har fulle skriverettigheter. Bruk det bare til å **lese**. All skriving i prosjektdata skal gå via `apply_changes` (se regler).
- **`deploy_project` publiserer appen.** Gjør det bare når en bolk er testet.

---

## 4. Regler (ufravikelige)

Disse har gjeldt hele veien og står også i `CLAUDE.md`, `AGENTS.md` og `docs/architecture/INVARIANTS.md`.

**Produkt og beslutninger**
- Mars eier produktbeslutningene. Vedtatte krav endres eller tolkes aldri uten ham. Ved motstrid: pek på den og spør.
- Stopp og spør bare når noe koster penger, noe vil slette eller overskrive noens filer, et vedtatt krav må endres eller tolkes, eller det gjelder sikkerhet.
- Koding starter først etter et tydelig OK («OK», «kjør på», «fortsett»).
- Foretrekk åpne spørsmål framfor flervalg.

**Dokumenter som aldri endres**
- `docs/product/MASTER_SPECIFICATION.md` og `docs/product/PHASE2_SPECIFICATION.md` er uforanderlige (kontrollsum i `SPEC_MANIFEST.yaml` og `PHASE2_MANIFEST.yaml`).
- Rør aldri `drizzle/` (eies av Lovable) eller `src/integrations/` (generert av Lovable).

**Data og database**
- All skriving i prosjektdata går via kjernen og `runCommand` → `public.apply_changes` med revisjonskontroll. Aldri SQL som går forbi dette, heller ikke for å «rydde».
- Migrasjoner ligger i `db/migrations/NNNN_navn.sql`. Lovable kjører dem nøyaktig som de står, og kjører aldri SQL mot `storage`.
- Hver migrasjon øker `EXPECTED_SCHEMA_VERSION` (i dag 37). Serverfunksjonene sjekker skjemaversjonen.

**Sikkerhet og innhold i repoet**
- Manus, mediefiler og hemmeligheter skal aldri inn i repoet. Brukernes API-nøkler er kryptert; hovednøkkelen er en serverhemmelighet.

**Språk og tekst**
- All brukervendt tekst skrives på norsk og engelsk i samme endring med `L("norsk", "english")`. Det gjelder også verktøytips, skjermlesertekst og feilmeldinger. Ordet «Lovable» skal ikke stå i grensesnittet.

**Arbeidsvaner**
- Ingen `prettier` eller `eslint --fix` på hele mapper, bare på enkeltfiler. Det har tidligere gitt formateringsendringer i `RecordAudioDialog.tsx`, `AudioClipEditor.tsx` og `use-audio-playback.ts`; de tre er holdt utenfor leveransene.
- Aldri force-push, rebase eller squash på `main`, for Lovable synker den grenen.
- Commit-meldinger skal ikke ha Claude-signatur. Claude committer ikke selv; den som har ansvaret committer.
- Slett eller overskriv aldri filer uten å spørre. Be om filer i stedet for å gjette.
- `docs/development/LOVABLE_SYNC.md` inneholder bare den ferdige meldingen som limes inn i Lovable.
- Hold `TODO.md` oppdatert.

**Arkitektur (fra `CLAUDE.md`)**
- Scenenummer er aldri identitet; bruk permanente ID-er.
- Ingen destruktive automatiske endringer: godkjente ressurser, aktive versjoner og originalopptak endres aldri automatisk.
- `src/core/` er plattformnøytral TypeScript uten React, Lovable eller Supabase.

---

## 5. Fase 2 – hele planen

Kilde: `PHASE2_SPECIFICATION.md` (DEC-0090). Plan: `docs/development/PHASE2_PLAN.md`. Krav: REQ-0668–REQ-0712, pluss REQ-0713 og REQ-0714 fra underveis.

### Bolk A – mobilbro, bilder, video og deling (ferdig og publisert, DEC-0090)
- **Innhold:**
  - QR-kode på prosjektsiden og kameraikon i ressursdialogene, med én kontekst per QR.
  - Mobilsiden `/m/<token>` uten innlogging: hurtigfoto med kø og automatisk opplasting, filvalg, video og «Del lenke».
  - Mobilimportbibliotek, sanntid, sikre opplastingsøkter (token lagret som SHA-256) og ingen duplikater.
- **Migrasjon:** 0035. **Pakke:** `qrcode`.
- **Krav:** REQ-0668–0683, alle «Verifisert» (automatiske tester). Mars har ikke prøvd på ekte iPhone og Android (KI-235).
- **Nøkkelfiler:** `src/core/mobile/index.ts`, `src/adapters/mobile/mobile.functions.ts`, `src/adapters/browser/mobile-import.ts`, `src/app/mobile/*`.

### Bolk B – lydopptak og takes (bygget 16.10, DEC-0093, ingen migrasjon)
- **Innhold:**
  - Mikrofonikon gir lydvinduet med PC-opptak og QR samtidig. Hele replikken vises, også på mobilen.
  - Takes er versjoner av en lydressurs. Det første opptaket lager ressursen og lydklippet der replikken begynner i scenen. «Bruk dette» bytter aktivt take.
  - Mobilen: lokale takes, avspilling, avkrysning og «Send de valgte». Advarsel om usendte opptak.
  - Romlyd tas opp som egen ressurs merket «romlyd».
- **Krav:** REQ-0684–0690.
- **Nøkkelfiler:** `src/core/audio/takes.ts`, `src/app/audio/{AudioTakesDialog,takes,use-recorder}.ts(x)`, `src/app/mobile/{MobileAudio,upload-queue}.ts(x)`.

### Bolk C – lydkomposisjon og eksport (bygget 16.10, DEC-0094, migrasjon 0036, pakke `@mediabunny/mp3-encoder`)
- **Innhold:**
  - En komposisjon er deler av opptak på spor 0–3. Den lagres som JSON (`asset_versions.composition`) på en ny lydversjon sammen med den ferdige miksen. Kildeopptak endres aldri.
  - Lydeditor med bølgeformer. Innsetting erstatt/før/etter/oppå/område, trim, volum, fades, angre/gjør om, «Opprinnelig», konfliktvisning mot andre replikker, avspilling, og lagring som versjon eller variant.
  - Eksport: hele, område eller ett take; WAV/MP3; 44,1/48 kHz; mono/stereo; lokalt eller som ny variant.
- **Krav:** REQ-0691–0697.
- **Nøkkelfiler:** `src/core/audio/composition.ts`, `src/engine/audio/composition.ts`, `src/app/audio/{AudioCompositionEditor,composition-actions}.ts(x)`.

### Bolk D – ord-til-lyd og tekstbasert redigering (bygget 17.10, DEC-0095, migrasjon 0037)
- **Innhold:**
  - Kobling mellom ord og tider per lydversjon (`asset_versions.alignment`), i et format som ikke er bundet til én tjeneste.
  - Analyse med ElevenLabs Forced Alignment direkte. Kostnaden (0,22 USD per time lyd) vises og godkjennes først, og valget av tjeneste huskes. Manuell kobling er alltid mulig.
  - Ordpanel i lydeditoren: ordene er knapper, Shift-klikk utvider, avspilling med justerbar kontekst og merke (≈) for usikre ord.
  - Status tekst mot lyd (○ △ ◆ ✓ ●) og forslag til plassering av nye ord.
- **Krav:** REQ-0698–0704.
- **Nøkkelfiler:** `src/core/audio/alignment.ts`, `src/adapters/ai/alignment.functions.ts`, `src/adapters/ai/providers.server.ts` (`ADAPTERS.elevenlabs.align`), `src/app/audio/LineWordsPanel.tsx`.

### Bolk E – pauser, romlyd, overganger, automatisk avspilling og ytelse (ikke startet)
Se kapittel 6. Planen sier at bolken skal «detaljeres før bolken». Kapittel 6.3 er Claudes anbefalte detaljering, som må godkjennes før bygging.

### Underveis (ferdig)
- **DEC-0091 / REQ-0713:** «Vis teknisk feilmelding» på feilsiden.
- **DEC-0092 / REQ-0714:** ressurser legges inn i halv størrelse i scenen.
- **KI-237 og KI-238:** feil med sanntidskanal og doble mobilvarianter, rettet.

---

## 6. Det som gjenstår

### 6.1 Prøving av det som er bygget

Dette gjøres i appen etter kapittel 2. Funn meldes til Claude, som skriver rettinger.

| Hva | Krav / KI | Slik prøver du |
|---|---|---|
| Bolk A på ekte telefoner | KI-235, REQ-0711 | QR på prosjektsiden og i en karakter, hurtigfoto, video, «Del lenke» – på iPhone (Safari) og Android (Chrome). |
| Lydopptak på mobil | KI-239, REQ-0685, 0687, 0689 | Mikrofonikonet på en replikk i Manus → QR → ta opp Take 01 og 02 → send bare ett → romlyd. iPhone tar opp MP4/AAC. |
| Lydeditoren | REQ-0697 | «Rediger» på et take → sett inn et nytt opptak etter → erstatt et område → lagre som ny versjon → «Bruk dette» → eksporter WAV og MP3. Sjekk at eksporten låter likt som avspillingen. |
| Ord-til-lyd på norsk | KI-245, REQ-0699, 0704 | «Analyser opptaket» (krever en ElevenLabs-nøkkel hos en prosjekteier; koster under en hundredel cent per replikk). Klikk ord og hør med kontekst. Prøv bokmål, nynorsk, dialekt og egennavn. ElevenLabs har **ikke norsk** på språklisten, så dette er det viktigste å prøve. |
| Opprydding | KI-238 | Arkiver de doble «Fra mobil»-variantene på Rolf (Bibliotek → Rolf → «Arkiver varianten»). |

Når en prøve er bestått, settes kravet til «Verifisert» i `requirements.yaml` med en henvisning til en dokumentert kontroll.

### 6.2 Bolk E – alle krav

Fullt utdrag fra kravregisteret. Kapitlene viser til `PHASE2_SPECIFICATION.md`.

- **REQ-0705 – Endre pauser mellom ord** (§32, §33). I en egen tidsredigeringsmodus kan avstanden mellom to ord økes eller reduseres ved å dra dem fra hverandre. Det skjer uten nytt opptak og uten å endre ordenes lyd. Vanlig markering og redigering av tekst endrer aldri timingen.
  *Akseptanse:* P1 pausen mellom to ord økes. P2 ordenes lyd er uendret.
- **REQ-0706 – Pauser mellom flere ord** (§34). Når flere ord dras fra hverandre, fordeles den ekstra tiden likt mellom de indre mellomrommene: 600 ms over tre ord gir 300 + 300 ms. Hver pause kan justeres for seg etterpå. Det skal virke både for korte fraser og større utvalg.
  *Akseptanse:* P3–P5, tiden fordeles likt og kan justeres.
- **REQ-0707 – Pausene vises bare i produksjonsvisningen** (§35). Lengre pauser vises som større avstand mellom ordene i tidsredigeringsmodus. Manusteksten og eksportert manus får aldri ekstra mellomrom eller tegn; tekst og tid holdes atskilt.
  *Akseptanse:* manuseksporten er uendret etter pauseendringer.
- **REQ-0708 – Naturlig romlyd i pauser** (§36–§39).
  - Forlengede pauser fylles som standard med romlyd fra samme opptak, fra partier uten tale, klikk, bevegelser, markerte hendelser eller upassende pust.
  - Er romlyden for kort, settes flere biter sammen med crossfade og uten tydelig gjentakelse. Finnes ingen egnet romlyd, varsles brukeren.
  - Valg: naturlig romlyd (standard), digital stillhet, valgt romlydressurs eller manuelt redigert pause.
  - Tale endres aldri i hastighet eller tonehøyde. Romlydfylling er en hjelp, ikke en garanti for sømløst resultat.
  *Akseptanse:* P6 nye pauser fylles med romlyd. P7 digital stillhet kan velges.
- **REQ-0709 – Romlyd i overganger mellom takes** (§40). Romlyd kan myke opp overganger mellom ulike takes. Overgangene kan forhåndshøres og justeres. Romlyd fra ulike opptak skal ikke antas å være lik.
  *Akseptanse:* en overgang mellom to takes kan justeres og høres.
- **REQ-0710 – «Spill av automatisk etter endring»** (§41, §42).
  - Dialogeditoren har denne avkrysningen. Når den er på, spilles det endrede området med justerbar kontekst når en endring er fullført, ikke mens man drar. Nye avspillinger legges ikke oppå tidligere. Av betyr ingen automatisk avspilling.
  - Gjelder endring av pauselengde, flytting av ordsegmenter, innsetting av nytt opptak, erstatning av ord eller frase, justering av klippgrenser og endring av romlyd eller overgang.
  *Akseptanse:* E1–E3 av/på virker. P8 resultatet kan forhåndshøres.
- **REQ-0712 – Ytelse og pålitelighet** (§55). Flere samtidige mobilopplastinger, store videofiler, og responsive bølgeformer og tekstmarkering uten at appen blir ustabil. Tydelige feil- og statusmeldinger.
  *Akseptanse:* flere samtidige opplastinger i test. Bølgeformen for en lang replikk tegnes raskt.

**Testkriterier fra spesifikasjonen (§61, §62):**
- P1 Brukeren øker avstanden mellom to ord.
- P2 Ordenes opprinnelige lydinnhold bevares.
- P3 Flere markerte ord kan trekkes fra hverandre.
- P4 Ekstra pausetid fordeles som standard mellom de interne ordmellomrommene.
- P5 Pausene kan justeres individuelt.
- P6 Nye pauser fylles som standard med naturlig romlyd.
- P7 Brukeren kan velge digital stillhet i stedet.
- P8 Brukeren kan forhåndshøre resultatet.
- P9 Andre dialoger i scenen beholder sine lyddata og tidsposisjoner.
- E1–E3 Automatisk avspilling: på, spilles med kontekst etter fullført redigering, av virker.
- E4–E7 Eksport (allerede bygget i bolk C): må fortsatt virke med pauser og romlyd, og originalene og komposisjonen bevares.

Spesifikasjonen §43–§46 og §54 gjelder også: alle originaler bevares, og komposisjonen skal beskrive pauser og romlyd. Endringer er lokale for én dialog. Angre og varianter skal virke også for pauseendringer. Forhåndsavspilling og eksport bruker samme komposisjonsbeskrivelse.

### 6.3 Anbefalt teknisk løsning for bolk E (Claudes råd – godkjennes før bygging)

Grunnideen er at pauser og romlyd blir **mer data i den samme komposisjonen** som bolk C laget. Da virker avspilling, eksport, angre, versjoner og varianter som før. Trolig trengs ingen ny migrasjon, fordi `asset_versions.composition` er JSON på opptil 256 kB. Sjekk likevel om databasefunksjonen `protect_asset_version` eller valideringen trenger endring.

**Datamodell (`src/core/audio/composition.ts` og ny `src/core/audio/pauses.ts`)**
- Utvid komposisjonen til `format: 2`. Den må fortsatt lese `format: 1`.
- Legg til en liste med pauseendringer: `pauses: [{ id, afterWord, deltaMs, fill }]`.
  - `afterWord` er indeksen i ordkoblingen.
  - `fill` er én av: `{kind:"room"}` (standard), `{kind:"silence"}`, `{kind:"asset", versionId}` eller `{kind:"manual"}`.
- Valgfri `role: "speech" | "room" | "transition"` på segmentene.
- **NB:** `compositionError` sjekker i dag de nøyaktige nøklene på segmentene. Den må oppdateres med de nye feltene, og `apply.ts` og `patch.ts` må tåle dem.
- **Rene funksjoner med enhetstester:**
  - `setPause(c, alignment, wordIndex, deltaMs)`: splitter talesegmentet mellom ordene og flytter resten av replikken. Den kan aldri kutte inn i et ord; minste pause er 0.
  - `spreadPause(c, alignment, fromWord, toWord, totalDeltaMs)`: deler tiden likt mellom de indre mellomrommene (P4).
  - `pauseGaps(c)`: hvilke hull som skal fylles.
- Ordkoblingen må følge med når tiden forskyves. Bruk `sourceToComposition`/`compositionToSource` og se KI-247.

**Romlyd (ny `src/core/audio/roomtone.ts`, plattformnøytral, jobber på `Float32Array`)**
1. **Finn kandidater i samme opptak:** analyser energi (RMS) i vinduer på 20 ms. Hold avstand (rundt 80 ms) til alle koblede ord. Krev nivå nær støygulvet (for eksempel 20-persentilen + 6 dB), ingen skarpe topper (klikk) og minst rundt 150 ms lengde. Gi hver kandidat en kvalitetspoengsum.
2. **Reserve:** bruk romlydressursen tatt opp i bolk B (`roomToneAsset`, merket «romlyd») for samme replikk eller scene. Finnes ingen, vises en tydelig melding, og brukeren kan velge stillhet eller en annen romlydfil.
3. **Sett sammen:** bruk flere biter med 30–50 ms crossfade der volumet holdes jevnt, og unngå at samme bit kommer to ganger på rad. Talen strekkes eller pitches aldri.
4. **Gjør det etterprøvbart:** resultatet blir vanlige segmenter med `role: "room"` på et eget spor, så motoren (`src/engine/audio/composition.ts`) spiller dem uten store endringer. Bruk syntetiske signaler (støy pluss tone-«ord») i testene.

**Overganger mellom takes**
- Der to segmenter fra ulike opptak møtes, vis en «Overgang»-kontroll. Den har crossfade-lengde, romlyd under skjøten (av/på og hvilken) og forhåndslytting.
- Romlyd fra ulike opptak behandles som ulik: velg fra opptaket som kommer etter skjøten, eller la brukeren velge.

**Brukerflate (`LineWordsPanel.tsx` og `AudioCompositionEditor.tsx`)**
- En egen bryter «Tidsredigering» skiller timing fra vanlig ordmarkering (§33).
- I tidsredigering vises ordene med avstand som tilsvarer tiden. Brukeren drar et ord eller et markert utvalg for å øke eller minske pausen.
- Hver pause har tallfelt for ms og en velger for fyll (naturlig romlyd, stillhet, valgt romlydfil eller manuelt).
- Manusteksten og manuseksporten røres aldri (REQ-0707). Lag en test som eksporterer manuset før og etter.
- Avkrysningen «Spill av automatisk etter endring» huskes med `useUiPref("audio.autoPlayAfterEdit")`. Den bruker kontekstglideren som finnes. Avspillingen startes på `pointerup` eller når endringen er lagt i angre-stakken, aldri under dra. En pågående avspilling stoppes før en ny starter (ett felles avspillingshåndtak).
- All tekst skrives med `L()`.

**Ytelse (REQ-0712)**
- Bølgeformtopper beregnes én gang per versjon og hurtigbufres i minnet, eventuelt i IndexedDB. Tegn i flere oppløsninger.
- Mål tiden for en replikk på 2 minutter.
- Lag en test med flere samtidige mobilopplastinger og et stort videoopplegg. Hent gjerne mønsteret fra `tests/unit/mobile-server.test.ts` og `dec0090-mobile-ui.mjs`.

**Forslag til oppdrag (ett om gangen, hvert med OK først)**

| # | Oppdrag | Filer | Ferdig når |
|---|---|---|---|
| E1 | Pausemodell og -funksjoner, format 2, validering | `src/core/audio/{composition,pauses}.ts`, `src/core/commands/apply.ts`, `src/core/patch.ts`, `tests/unit/audio-pauses.test.ts` | P1–P5 og P9 testet i kjernen. Format 1 leses fortsatt. |
| E2 | Romlydsøk og sammensetting | `src/core/audio/roomtone.ts`, `tests/unit/roomtone.test.ts` | Finner stille partier og unngår ord og klikk. Lang pause bygges uten gjentakelse. Melding når ingenting finnes. |
| E3 | Motoren spiller pauser og romlyd | `src/engine/audio/composition.ts` | Forhåndsavspilling og eksport er like (sammenlign samples). |
| E4 | Tidsredigeringsmodus i ordpanelet | `src/app/audio/LineWordsPanel.tsx`, `AudioCompositionEditor.tsx` | Dra ord og utvalg, tallfelt per pause, fyllvalg, visuell avstand, angre. Manuseksporten er uendret. |
| E5 | Overganger mellom takes | samme | Overgangen justeres og høres (REQ-0709). |
| E6 | «Spill av automatisk etter endring» | samme, pluss avspillingslogikk | E1–E3 og P8. Aldri overlappende avspilling. |
| E7 | Ytelse | bølgeform-cache, tester | Lang replikk tegnes raskt. Samtidige opplastinger testet. |
| E8 | Dokumentasjon og visuell QA | `DECISION_LOG.md` (DEC-0096), `requirements.yaml`, `VISUAL_QA_DEC-0096E.md`, `TODO.md`, handover, `tests/visual/dec0096-*.mjs` | Alle suiter grønne, status oppdatert. |

### 6.4 Kjente problemer i fase 2 (fra `KNOWN_ISSUES.md`)

| KI | Hva | Status |
|---|---|---|
| KI-235 | Bolk A er ikke prøvd på ekte iPhone og Android | Åpen (prøving) |
| KI-239 | Lydopptak fra mobil er bare prøvd med falsk mikrofon | Åpen (prøving) |
| KI-240 | Markering av ord i lydvinduet | Løst av bolk D, kan lukkes etter prøving |
| KI-241 | En replikk med to lydklipp: nye takes går til det første | Åpen, vurderes |
| KI-242 | Deler i lydeditoren flyttes med tallfelt, ikke ved å dra | Åpen. Henger naturlig sammen med E4. |
| KI-243 | MP3-koderen havner også i serverpakken (0,4 MB) | Åpen, liten |
| KI-244 | Playwright viser «download» for filnavn med æøå | Bare notert |
| KI-245 | ElevenLabs har ikke norsk på språklisten; må prøves med ekte lyd. Grensen for «usikker» (tap ≥ 1,5) er et anslag. | Åpen (prøving) |
| KI-246 | WhisperX med norske modeller (NbAiLab) er ikke bygget | Neste kandidat hvis ElevenLabs er for dårlig |
| KI-247 | Ordkoblingen følger bare deler fra samme komposisjon etter redigering | Åpen. Viktig for E1. |

### 6.5 Åpne spørsmål til Mars/Øystein
1. Skal bakgrunner også legges inn i halv størrelse, eller fortsatt fylle lerretet (DEC-0092)?
2. Skal lesetilgangen til `ai_model_settings` strammes inn? I dag kan alle innloggede lese den. Lovable rettet de andre RLS-funnene, men ikke denne.
3. Godkjennes detaljeringen av bolk E i 6.3?

---

## 7. Utenfor fase 2, men bestilt (fra `TODO.md`)

Ikke del av denne handoveren, men greit å vite om:
- «Lovable» ut av grensesnittet (REQ-0639).
- Stilharmonisering med AI (REQ-0137–0145, kostnaden er godkjent).
- Globale ressurser (REQ-0571, venter på svar om hvem som kan bruke dem).
- Eksport til ProRes/MOV.
- Varsel når en generering er ferdig (satt på vent).
- Grensen på 500 MB per video fjernes i en framtidig desktopversjon.

---

## 8. Repo og dokumenter – hvor alt ligger

| Hva | Hvor |
|---|---|
| Startside og regler | `README.md`, `CLAUDE.md`, `AGENTS.md`, `TODO.md` |
| Spesifikasjoner (endres aldri) | `docs/product/MASTER_SPECIFICATION.md`, `docs/product/PHASE2_SPECIFICATION.md` |
| Kravregister | `docs/product/requirements.yaml` → `REQUIREMENTS.md`, `TRACEABILITY_MATRIX.md` (bygges med `python3 scripts/kb/build_docs.py`) |
| Beslutninger | `docs/decisions/DECISION_LOG.md` (DEC-0090–0095 er fase 2) |
| Arkitektur | `docs/architecture/` (spesielt `INVARIANTS.md`, `DOMAIN_MODEL.md`) |
| Status og arbeid | `docs/development/{SESSION_HANDOVER,CURRENT_WORK,IMPLEMENTATION_STATUS,KNOWN_ISSUES,PHASE2_PLAN}.md` |
| Visuell QA per bolk | `docs/development/VISUAL_QA_DEC-0090A.md`, `-0093B`, `-0094C`, `-0095D` |
| Språk | `docs/development/I18N_GUIDE.md` |
| Lovable | `docs/development/LOVABLE_GUIDE.md`, `docs/development/LOVABLE_SYNC.md` |
| Kode | `src/core/` (kjerne), `src/engine/` (lyd, bilde, eksport), `src/adapters/` (server, nettleser, AI), `src/app/` (brukerflate), `src/routes/` |
| Migrasjoner | `db/migrations/0001–0037` |
| Tester | `tests/unit/`, `tests/db/run-db-tests.ts`, `tests/visual/*.mjs` |

---

## 9. Prosjektinstrukser til Lovable (kopier inn)

Legg teksten under inn i Lovable som prosjektinstruks («Knowledge»), enten i Lovable eller via Claude med verktøyet for prosjektkunnskap.

```
Animatic Studio – regler for agenten
1. Les AGENTS.md, CLAUDE.md og TODO.md før endringer. Gjør bare det oppdraget sier, i de filene oppdraget nevner.
2. Endre aldri docs/product/MASTER_SPECIFICATION.md eller docs/product/PHASE2_SPECIFICATION.md. Rør aldri drizzle/ eller src/integrations/.
3. All skriving i prosjektdata går via runCommand → public.apply_changes. Skriv aldri prosjektdata med SQL direkte.
4. Migrasjoner: kjør db/migrations/NNNN_*.sql nøyaktig som filen står, i rekkefølge. Ingen SQL mot storage.
5. All brukervendt tekst skrives med L("norsk", "english"). Ordet «Lovable» skal ikke stå i grensesnittet.
6. src/core/ er plattformnøytral TypeScript: ingen React, Supabase eller nettleser-API-er der.
7. Ingen hemmeligheter, manus eller mediefiler i repoet. API-nøkler bare i backend-hemmelighetene.
8. Ikke formater hele mapper (prettier/eslint --fix). Bare filene du endrer.
9. Aldri force-push, rebase eller squash på main.
10. Si tydelig fra hvis noe i oppdraget strider mot reglene eller kravene, i stedet for å velge selv.
```

---

## 10. Testing og kvalitetssikring

Kjøres av Claude i sitt skymiljø etter hver Lovable-endring.
- **Hent koden:** `gh repo clone OysGut/animatic-studio` (eller `git pull`), så `bun install`.
- **Typer og enhetstester:** `npx tsc --noEmit` og `bun run test`. Siste status: 151 testfiler / 1265 tester grønne.
- **Databasetester:** Postgres 16 lokalt, `DATABASE_URL=postgres://postgres@localhost:54329/postgres bun tests/db/run-db-tests.ts`. Siste status: 65/65.
- **Kunnskapsbasen:** `python3 scripts/kb/check_kb.py` (sjekker blant annet kontrollsummene på spesifikasjonene).
- **Språkkatalogen:** `node scripts/i18n/build-catalog.mjs` etter nye `L(…)` i `src/core` eller `src/adapters`.
- **Visuelle tester:**
  - Fixture: `bun tests/visual/make-fixture.ts`.
  - Dev-server: `bunx vite dev --host 127.0.0.1`.
  - Kjør `tests/visual/<suite>.mjs` med Playwright.
  - Siste status: dec0095 16/16, dec0094 20/20, dec0093 28/28, dec0090 35/35, verifisering3 73/73, verifisering4 58/58.
- **Produksjonsbygg:** `npx vite build`.

---

## 11. Kilder for ord-til-lyd

- [ElevenLabs Forced Alignment API](https://elevenlabs.io/docs/api-reference/forced-alignment/create.md)
- [ElevenLabs Forced Alignment – oversikt](https://elevenlabs.io/docs/overview/capabilities/forced-alignment.md)
- [ElevenLabs priser](https://elevenlabs.io/pricing/api?price.section=speech_to_text#pricing-table)
- [Lovable MCP-server](https://docs.lovable.dev/integrations/lovable-mcp-server)
- [Lovable – samarbeid og kreditter](https://docs.lovable.dev/features/collaboration.md)
