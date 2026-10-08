---
name: ux-interaction-design
description: Utformer arbeidsflyter og interaksjoner for profesjonelle filmskapere i Animatic Studio – tidslinje (trim, ripple, snapping, zoom, avspillingshode/playhead), drag-and-drop av scener i manus og filmtidslinje (samme kommando MoveOccurrence), paneler som kan endres/dokkes, tastatursnarveier (J/K/L, I/O, mellomrom, Cmd/Ctrl+Z, Shift+Z), angre/gjør om per bruker, kontekstmenyer, tilbakemelding ved langvarige jobber, feilhåndtering, ingen datatap, samarbeid (presence, konflikter) og informasjonsarkitektur for de 14 hovedområdene (mandat 30.2). Bruk når du designer eller bygger en arbeidsflate, interaksjon, snarvei, dialog, meny, feilmelding, flyt eller navigasjon, eller når noen nevner UX, brukeropplevelse, workflow, keyboard shortcuts, undo, drag, timeline eller «hvordan skal dette fungere for brukeren».
metadata:
  version: "0.1.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# ux-interaction-design

## 1. Ansvar
**Eier:** hvordan ting *oppfører seg*: arbeidsflyter, informasjonsarkitektur (hovedområder → arbeidsflater), tidslinje- og lerretsinteraksjoner, dra-og-slipp, snarveier, angre/gjør om i UI, kontekstmenyer, tilbakemelding, feil- og konfliktdialoger, responsivt arbeidsområde, norske betegnelser.
**Eier ikke:**
- Visuelle verdier (farger, fonter, avstand, ikoner) → `design-system-director`.
- Kommandoenes semantikk, invarianter og inverse → `scene-sync-invariants` og `architecture-guardian` (UI *bruker* kommandoene, definerer dem ikke).
- Hva produktet skal kunne → mandatet / `specification-guardian`.
- Tilgangskontroll i backend → `secure-development`.

## 2. Når den brukes
- Ny arbeidsflate, panel, dialog, meny, flyt eller navigasjon.
- Interaksjon på tidslinje, manus eller sceneeditor (dra, trimme, zoome, velge, snappe).
- Ny snarvei, eller endring i angre/gjør om, feilhåndtering, jobbtilbakemelding, presence/konflikt.
- Spørsmål om hvor en funksjon hører hjemme blant de 14 områdene i mandat 30.2.

## 3. Les først
- `docs/design/UX_PRINCIPLES.md` (P1–P15) og `docs/design/COMPONENT_INVENTORY.md`.
- [references/INFORMATION_ARCHITECTURE.md](references/INFORMATION_ARCHITECTURE.md) – arbeidsflater og kobling UI-område ↔ modul.
- [references/INTERACTION_PATTERNS.md](references/INTERACTION_PATTERNS.md) – tidslinje, dra, angre, jobber, feil, samarbeid.
- [references/KEYBOARD_MAP.md](references/KEYBOARD_MAP.md) – snarveiforslag.
- Mandat 1.3, 6, 15, 20, 21, 30 i `docs/product/MASTER_SPECIFICATION.md`.
- `docs/architecture/DOMAIN_MODEL.md` §3 (kommandoer), `INVARIANTS.md` (INV-01, INV-02, INV-07, INV-08, INV-14, INV-C1), ADR-0004 (samarbeid), ADR-0005 (kommandologg), ADR-0006 (tid i hele bilder).
- Krav: REQ-0042, REQ-0092–REQ-0104, REQ-0216–REQ-0234, REQ-0290–REQ-0303, REQ-0306–REQ-0315, REQ-0427–REQ-0431, REQ-0520–REQ-0529.

## 4. Arbeidsprosedyre
1. **Navngi oppgaven brukeren løser** (f.eks. «flytte scene 42 etter 45 og se konsekvensen») og hvem (manusforfatter, regissør, animatør, klipper, produsent – roller fra ADR-0004).
2. **Plasser den** i informasjonsarkitekturen: hvilken arbeidsflate, hvilket panel, hvilken modul. Ikke lag ny fane/side hvis en eksisterende arbeidsflate kan bære den (REQ-0428).
3. **Kartlegg til kommandoer.** Hver brukerhandling som endrer data = én domenekommando (`MoveOccurrence`, `SetOccurrenceActive`, `SetActiveTake`, `EditBlockText` …) med invers. Samme handling i manus og tidslinje bruker samme kommando (INV-01). Finnes ikke kommandoen: stopp og avklar med `architecture-guardian`.
4. **Skille de fire tidslinjeoperasjonene** (REQ-0229): flytte narrativ scene / trimme klipp / endre utsnitt / deaktivere. De skal se og føles forskjellige og gi forskjellige kommandoer.
5. **Design tilstandene:** tom, laster, delvis, feil, frakoblet, konflikt, låst av annen, avvik, usikker, deaktivert. Hver feil sier hva som skjedde, hva som er bevart og neste handling.
6. **Tastatur og mus:** definer snarvei (se KEYBOARD_MAP), fokusrekkefølge, kontekstmeny, og hva som skjer ved Esc. Cmd (macOS) = Ctrl (Windows).
7. **Angre:** bekreft at handlingen kan angres per bruker og at angre-teksten er forståelig («Angre: Flytt scene 42»). Destruktive bekreftelsesdialoger er unntaket, ikke regelen – foretrekk angre.
8. **Tell handlinger** for de vanligste oppgavene (INFORMATION_ARCHITECTURE §4). Flere klikk enn før → begrunn.
9. **Prototyp og test** i nettleseren med ekte utdrag (`tests/fixtures/screenplay/`); skriv Playwright-tester for flyten og tastaturet. Visuell QA via `design-system-director`.
10. **Usikkerhet om produktønske** (f.eks. ripple som standard?) → foreslå en anbefaling, merk «Teknisk anbefaling», og legg spørsmålet i `OPEN_QUESTIONS.md` for Mars/Trollfilm.

## 5. Leveranse
- Kode i `src/app/<arbeidsflate>/` (+ snarveier i ett register, forslag `src/app/shortcuts/`).
- Oppdatert INFORMATION_ARCHITECTURE/KEYBOARD_MAP/INTERACTION_PATTERNS når mønstre endres; komponentstatus i COMPONENT_INVENTORY.
- Til Mars: kort norsk beskrivelse av flyten (trinn for trinn) + skjermbilder; ingen kodeord.

## 6. Kontrollpunkter
- [ ] Hver endring = kommando med invers; ingen direkte tabellskriving fra UI (ADR-0005).
- [ ] Manus og tidslinje viser samme rekkefølge etter flytt (INV-01); ID-er, ikke scenenumre, i URL og state (INV-02).
- [ ] Trim sletter ikke manus; udekket manus gir avvik (REQ-0230, REQ-0231).
- [ ] Snarvei registrert i KEYBOARD_MAP og i ett register; ingen kollisjon med nettleser/OS-snarveier som ikke kan overstyres.
- [ ] Angre/gjør om virker per bruker; konflikt vises ved revisjonsmismatch (INV-C1).
- [ ] Langvarig handling viser status og overlever lukket fane (mandat 20.2).
- [ ] Fungerer ved 1280 px; under det: tydelig melding.
- [ ] Norske betegnelser fra mandat 30.3; tekst via oversettelsesstruktur.

## 7. Typiske feil som må unngås
- Egen lagret rekkefølge i tidslinjekomponenten (bryter INV-01).
- «Lagre»-knapp som overskriver fil/take i stedet for ny versjon (INV-07, INV-13).
- Ripple-sletting eller automatisk lukking av hull som endrer andre scener uten at brukeren har valgt det.
- Snarveier som bare virker på én plattform, eller som fanger tastetrykk mens brukeren skriver i manus.
- Modalt «Er du sikker?» i stedet for angre; feilmeldinger som «Noe gikk galt».
- Global angre-stakk som angrer en annen brukers endring.
- Fremdriftsprosent som ikke er pålitelig (REQ-0295); spinner uten tekst.
- Å kopiere et klippeprograms komplette funksjonsbredde (REQ-0227: inspirasjon, ikke kopi).

## 8. Akseptansekriterier / tester
- Playwright-flyter: flytt scene i manus → tidslinje oppdatert, og omvendt; angre gir identisk tilstand.
- Tastaturtest for hver snarvei i KEYBOARD_MAP med status «Implementert» (macOS- og Windows-modifikator simulert).
- To-klient-test: samtidig redigering gir konfliktdialog, ingen tapt endring; presence vises.
- Frakoblingstest: endringer under frakobling går ikke tapt i stillhet.
- Jobbtest: lukk side under jobb → ved gjenåpning vises riktig status (REQ-0296).

## 9. Dokumentasjon og sporbarhet
- `requirements.yaml`: oppdater `status`, `implementation`, `verification` for berørte UI-krav; `build_docs.py` + `check_kb.py`.
- Nye mønstre/snarveier → references-filene her; prinsippendring → `docs/design/UX_PRINCIPLES.md` (+ DEC ved retningsendring).
- `IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`, `KNOWN_ISSUES.md` (kjente brukbarhetsproblemer), `OPEN_QUESTIONS.md` (produktspørsmål).
