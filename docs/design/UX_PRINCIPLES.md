# UX-prinsipper – Animatic Studio

> **Status: Teknisk anbefaling – foreløpig, skal valideres med skjermbilder og med Trollfilm.**
> Prinsippene tolker mandatet for arbeid med grensesnittet. De skaper ingen nye produktkrav; ved motstrid gjelder mandatet (`docs/product/MASTER_SPECIFICATION.md`) og `DECISION_LOG.md`.
> Eier: skillen `ux-interaction-design`. Visuelle regler: `docs/design/DESIGN_SYSTEM.md`.

Hvert prinsipp har en kilde og en kontroll man kan teste mot.

### P1 – Ikke-destruktivt som standard
Ingen handling i grensesnittet sletter eller overskriver ferdig film, godkjente ressurser, aktiv versjon, andre produksjoner eller historiske manusversjoner i stillhet. Trimming sletter ikke manus; deaktivering er ikke sletting; nye resultater legges ved siden av gamle.
*Kilde:* mandat 2.2, 15.2, 21.5; INV-07, INV-13, INV-14; REQ-0027–REQ-0033, REQ-0230. *Kontroll:* hver kommando i UI har en invers (angre), og ingen knapp heter «Slett» for produksjonsmateriale uten en eksplisitt bekreftelse som forklarer hva som bevares.

### P2 – Brukeren bestemmer
Systemet foreslår, flagger og estimerer; brukeren godkjenner. Avvik løses med de tre valgene *Godkjenn eksisterende film / Oppdater scene / Angre endring*. Usikre tolkninger (scenedeteksjon, språkkobling, kontinuitet) vises som forslag.
*Kilde:* mandat 1.3 (brukerstyrt), 21.2, 10.4, 23.2; INV-08; REQ-0026, REQ-0306, REQ-0158, REQ-0335. *Kontroll:* ingen automatisk handling endrer materiale uten et synlig forslag og en brukerhandling.

### P3 – Manus er et navigasjonsverktøy
Klikk på replikk flytter avspillingshodet; avspillingshodet markerer manuspassasjen; manus og film kan vises side ved side; automatisk rulling kan slås av.
*Kilde:* mandat 6, 6.2; REQ-0092, REQ-0097–REQ-0101. *Kontroll:* fra hvilken som helst replikk kommer brukeren til riktig bilde med ett klikk, og tilbake.

### P4 – Manuset ser ut som et manus
Ordinær manusvisning viser ikke tidskoder, varighet, produksjonsmarkeringer eller ID-er. Slik informasjon ligger i egne paneler eller arbeidsmoduser og går aldri automatisk inn i eksportert manus.
*Kilde:* mandat 4.2, 6.3, 7.3; REQ-0050, REQ-0051, REQ-0102–REQ-0104, REQ-0117. *Kontroll:* skjermbilde av manusvisning i standardmodus har ingen teknisk metadata.

### P5 – Én struktur, to visninger
Flytting av en scene i manus og i filmtidslinjen er *samme* handling (`MoveOccurrence`) og ser lik ut i begge. Grensesnittet skiller tydelig mellom å flytte en narrativ scene, trimme et klipp, endre et utsnitt og deaktivere innhold.
*Kilde:* mandat 2, 15.2; INV-01; REQ-0228, REQ-0229. *Kontroll:* tidslinjekomponenten har ingen egen lagret rekkefølge.

### P6 – Tydelig status overalt
Jobbstatus, avvik, usikkerhet, aktiv versjon, lagringsstatus og hvem som redigerer er alltid synlig der det betyr noe – med ikon og tekst, ikke bare farge. Fremdrift vises bare når den kan beregnes pålitelig.
*Kilde:* mandat 20.3, 20.4, 21.4, 30.1; REQ-0294–REQ-0296, REQ-0315. *Kontroll:* et åpent avvik er synlig i manus, sceneeditor, filmtidslinje, produksjonsoversikt og eksportkontroll.

### P7 – Tastatur først
Alle arbeidsflater kan brukes med tastatur. Kjente snarveier fra klippeprogrammer (J/K/L, I/O, mellomrom) fungerer likt i alle tidslinjer, og Cmd på macOS tilsvarer Ctrl på Windows. Snarveier vises i verktøytips og menyer.
*Kilde:* ARCHITECTURE.md §5 (WCAG 2.2 AA, tastatur i alle arbeidsflater); mandat 1.3 (effektivt). *Kontroll:* snarveikartet (`.claude/skills/ux-interaction-design/references/KEYBOARD_MAP.md`) er implementert og testet.

### P8 – Angre er trygt og personlig
Angre/gjør om gjelder brukerens egne endringer, også når andre redigerer samtidig. Angre av noe en annen har bygget videre på gir en forklarende konflikt, aldri stille overskriving.
*Kilde:* mandat 3.4; ADR-0004, ADR-0005; REQ-0042, REQ-0527; INV-C1. *Kontroll:* to brukere, A angrer → Bs endring består.

### P9 – Samarbeid uten overraskelser
Man ser hvem som er i prosjektet og hvor de jobber (presence). En endring basert på utdatert versjon avvises og vises som konflikt med valg. Ingen andres arbeid går tapt.
*Kilde:* DEC-0003, DEC-0010; REQ-0520–REQ-0527; INV-C1, INV-C2. *Kontroll:* revisjonskonflikt vises med begge versjoner og et valg.

### P10 – Færrest mulige handlinger for vanlige oppgaver
De hyppigste oppgavene (finne en scene, flytte den, velge aktiv versjon, løse et avvik, spille av fra en replikk) skal kunne gjøres uten å bytte arbeidsflate og med få klikk. De 14 funksjonsområdene samles i få arbeidsflater.
*Kilde:* mandat 1.3 (oversiktlig, effektivt), 30.2; REQ-0427–REQ-0429. *Kontroll:* oppgavetellinger i `INFORMATION_ARCHITECTURE.md` holdes oppdatert.

### P11 – Ingen overraskende kostnader
Betalte handlinger viser estimat (med usikkerhet) før start og krever eksplisitt godkjenning av en med kostnadsrett. Grensesnittet lover ikke bedre resultat for høyere pris.
*Kilde:* mandat 19.3, 19.5, 19.6, 21.2 B; INV-12; REQ-0277, REQ-0279–REQ-0284, REQ-0528. *Kontroll:* ingen knapp starter betalt jobb direkte uten kostnadsdialog.

### P12 – Langvarige jobber er synlige og overlever
Jobber fortsetter selv om fanen lukkes. Ved gjenåpning ser brukeren hva som er ferdig, kjører, feilet og kan gjennomgås. Feil forklares på norsk med neste mulige handling.
*Kilde:* mandat 20.2–20.5; REQ-0292, REQ-0296–REQ-0303. *Kontroll:* lukk fanen under jobb, åpne igjen → status stemmer.

### P13 – Ingen datatap
Alt som er gjort lagres i backend fortløpende; lokal tilstand er bare hurtigbuffer. Mistet nettforbindelse vises tydelig og ventende endringer sendes eller vises som konflikt – de forsvinner aldri i stillhet.
*Kilde:* mandat 27.3, 28.1; REQ-0407, REQ-0410. *Kontroll:* frakoblingstest i Playwright.

### P14 – Norsk, presist språk
Grensesnittet bruker de norske betegnelsene fra mandat 30.3 (Manus, Sceneeditor, Filmtidslinje, Ressursbibliotek, Produksjonsoversikt, Generer scene, Bruk denne, Eksporter, Spinoff, Godkjenn eksisterende film, Oppdater scene, Angre endring). All tekst går via oversettelsesstruktur (DEC-0017). Engelske fagord brukes bare internt.
*Kilde:* mandat 1.3, 30.3; REQ-0014, REQ-0430, REQ-0431. *Kontroll:* ingen hardkodede UI-strenger utenfor oversettelsesfilene.

### P15 – Store skjermer først
Arbeidsflatene er laget for store skjermer (≥ 1440 px) og skal fungere fra 1280 px bredde. Under det vises en tydelig melding i stedet for et ødelagt oppsett. Paneler kan endres i størrelse, kollapses og (senere) dokkes; oppsettet huskes per bruker.
*Kilde:* mandat 1.3, 30.1 (velorganiserte paneler). *Kontroll:* skjermbilder ved 1280, 1440 og 1920 px.
