# N3 – tre rester (natt 22.–23.10.2026)

**Ingen migrasjon.** Ingen databaseendring trengtes. 0089 er ikke laget. Skjemaversjonen er fortsatt 88.
Ingenting er publisert. Ingen betalte AI- eller ElevenLabs-kall.

## 1. Ustabil språktest og global-library på nb
**Årsak:** `b107-language-switch.test.tsx` laster den ekte japanske språkfilen (2,7 MB) første gang ved valg.
Alene tok dette 831 ms (fransk 1012 ms). `waitFor` har en standardgrense på 1000 ms. I en full parallell
kjøring er maskinen travel, så lastingen gikk over grensen. Det var altså et tidsavbrudd under last, ikke delt
tilstand eller rekkefølge. De senere tilfellene bruker katalogen som allerede er lastet, og tar 20 ms.

**Retting:** Bare ventingen på den ekte katalogen har fått en eksplisitt grense på 20 s. Ingenting lastes på
forhånd, og alle kontrollene er uendret: ekte tekst, ikke engelsk, og riktig etter omlasting.

**global-library:** Med `UI_LANG=nb` overstyres scenarioets `lang: "en"`, så den engelske sjekken kunne aldri
bestå. Sjekken forventer nå tittelen på det språket siden faktisk kjører på (`byLang`): «Globalt bibliotek» eller
«Global library». Resultat: 29/29 med tvunget nb (to kjøringer på rad) og 29/29 på en. Én tidligere nb-kjøring
stoppet på `net::ERR_ABORTED` mens utviklingsserveren lastet inn på nytt. Ny kjøring var grønn.

## 2. B-098: fontlisens fra METADATA.pb
- Nytt skript `scripts/fonts/build-font-licenses.mjs` leser `ofl/*/METADATA.pb`, `apache/*/METADATA.pb` og
  `ufl/*/METADATA.pb` fra en klon av google/fonts. Lisensfeltet må stemme med mappen, og samme familie kan ikke
  ha to lisenser. Ved avvik stopper skriptet.
- Den genererte tabellen `src/core/typography/google-font-licenses.gen.ts` er bygget inn i appen. Den har 2040
  familier (OFL 1993, Apache 42, UFL 5) fra commit `45e3d5269e4a17d823f6d84470bc084dc5ae46f6`. Appen slår ikke
  opp noe mens den kjører.
- `licenseOf` bruker fortsatt kildens lisens hvis den oppgis. Ellers brukes tabellen. Bare familier som ikke
  finnes i tabellen, antas å være OFL. De gamle navnelistene er fjernet. Ny funksjon: `licenseIsKnown`.
- **Endring i resultatet:** Roboto er OFL i google/fonts i dag (`ofl/roboto`). Den gamle listen sa Apache. Testen
  er oppdatert etter kilden.
- Tester: `tests/unit/n3-font-licenses.test.ts` (ny) og `b098-fonts.test.ts` (oppdatert).

## 3. DV5: bakgrunnsresultater på angrelisten
- Når serveren legger inn et bakgrunnsresultat, lagrer `apply_changes` kommandoen med invers i kommandologgen.
  Den nye serverfunksjonen `dialogueBatchHistory` henter ferdige elementer i jobben. Den krever redaktørrolle og
  leser kommandologgen med brukerens egen klient, så tilgangsreglene gjelder. Bare brukerens egne resultater med
  lagret invers tas med. Funksjonen leser bare data og kaller ingen leverandør.
- Panelet legger resultatene på arbeidsflatens angreliste (bibliotek og montering) med `adoptServerHistory` og
  etiketten «Legg inn bakgrunnsresultat». Angre kjører inversen som en vanlig `runCommand` med revisjonskontroll.
  Gjør om virker også.
- Bare resultater som ble ferdige mens brukeren så på, eller som kommer fra jobber startet i fanen, tas med.
  Eldre resultater blir ikke plutselig angrebare. Hvert resultat legges inn én gang. Sanntidsekkoet regnes som
  eget, så resultatet ikke blokkerer sin egen angring.
- Tester: `tests/unit/n3-background-undo.test.tsx` (4). Angring sender nøyaktig den lagrede inversen, og replikken
  forsvinner lokalt. Testen sjekker også at talegenerering ikke kalles, at samme resultat ikke legges inn to ganger,
  at en angreliste som ikke tar imot resultater ikke får noe, og hvilke resultater som tas med.
- **Begrensninger:**
  - Angrer brukeren ett resultat fra angrelisten, merkes elementet ikke som «angret». «Angre hele jobben» stopper
    da med konflikt på det elementet, uten å skade data.
  - Resultater som blir ferdige mens panelet er lukket, kommer ikke på angrelisten. «Angre hele jobben» kan
    fortsatt brukes for dem.
  - Begge punktene står i TODO.

## Ny tekst (alle språk)
`dv5.background-result.undo-label` er «Legg inn bakgrunnsresultat» på nb og «Add background result» på en.
Maskinoversatt og merket for gjennomlesing: de, es, fr, it, ja, ko, pt-BR og ru.

## Resultater
- tsc: 0 feil.
- Full Vitest to ganger på rad: 2455 bestått, 10 hoppet over, 0 feilet begge gangene. En kjøring før dette feilet
  i to språktester fordi inventaret var utdatert. Inventaret er laget på nytt.
- DB lokalt: 180/0.
- i18n: check, validate og release-check er grønne.
- global-library: nb 29/29 (to ganger) og en 29/29.

## Endrede filer
- `tests/unit/b107-language-switch.test.tsx`, `tests/visual/global-library.mjs`
- `scripts/fonts/build-font-licenses.mjs` (ny), `src/core/typography/google-font-licenses.gen.ts` (ny, generert),
  `src/core/typography/google-catalog.ts`, `tests/unit/b098-fonts.test.ts`, `tests/unit/n3-font-licenses.test.ts` (ny)
- `src/app/project/use-commands.ts`, `src/app/library/background-history.ts` (ny), `src/app/library/DialogueBatchPanel.tsx`,
  `src/app/library/LibraryWorkspace.tsx`, `src/app/assembly/AssemblyWorkspace.tsx`,
  `src/adapters/storage/dialogue-batch.functions.ts`, `src/adapters/storage/dialogue-batch.server.ts`,
  `tests/unit/n3-background-undo.test.tsx` (ny)
- `src/core/i18n/authored.json`, `src/core/i18n/locales/*.json`, `src/core/i18n/runtime.gen.json`,
  `scripts/i18n/references.v1.json`, `candidates.v1.json`, `inventory-report.json`
- `AGENTS.md` (regel 54–55), `TODO.md`, `roadmap.md`, `docs/development/N3_REPORT.md`
