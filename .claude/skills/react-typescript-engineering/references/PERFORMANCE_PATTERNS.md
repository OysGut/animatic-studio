# Ytelsesmønstre

Mål (ARCHITECTURE §5): manus 120+ sider åpner < 2 s og ruller i 60 fps; tidslinje med 150 scener og 20 spor < 16 ms per bilde. **Mål alltid** (React Profiler, Performance-panelet, `performance.now()` i ytelsestester) før og etter en optimalisering, og noter tallene.

## 1. Manusvisning
- **Virtualiser per side:** paginering (ren funksjon i core, gjerne i Web Worker) gir sider; bare synlige sider ± buffer rendres som DOM. Sidehøyden er kjent (fast sideformat) → enkel virtualisering uten måling.
- Hver side-komponent er `memo` og får sidens linjer (stabil referanse når siden ikke endres). Inkrementell paginering sørger for at bare berørte sider får nye objekter.
- Redigering: bare den aktive blokken er et redigerbart felt; resten er statisk tekst.
- CSS `content-visibility: auto` kan hjelpe for sider utenfor skjermen, men erstatter ikke virtualisering.

## 2. Tidslinje og komposisjon
- **Canvas utenfor React-render:** React eier rammen (størrelse, verktøylinjer, markering). Tegning skjer i en imperativ renderer (`src/engine/`) som leser state via abonnement og tegner i `requestAnimationFrame`. Avspillingshodet oppdateres aldri via React-state per bilde.
- Tegn bare synlig tidsvindu; grupper klipp per spor; cache tekst-/miniatyrbilder i `OffscreenCanvas`/bitmap.
- Treff-testing (hvilket klipp er under musen) med enkel romlig indeks per spor, ikke DOM-elementer per klipp.
- Dra-og-slipp: lokal forhåndsvisning i rendereren; kommando sendes først ved slipp.
- Samme `renderFrame(sceneState, frame)` brukes for forhåndsvisning og eksport (ADR-0008).

## 3. React-re-render
- Smale selektorer; unngå at hele arbeidsflaten abonnerer på hele prosjektet.
- Beregn avledede verdier under render med memo, ikke i `useEffect` + `setState`.
- Funksjonell `setState` når ny verdi avhenger av forrige; lat initialverdi for dyre startverdier.
- Stabile callbacks (`useCallback`) bare der de går til `memo`-barn eller effekter.
- Løft statisk JSX ut av komponenter; ikke lag nye objekter/arrays i props uten behov.
- `useTransition`/`useDeferredValue` for søk/filtrering i manus (REQ-0073) slik at skriving ikke hakker.

## 4. Async og nettverk
- Start uavhengige kall parallelt (`Promise.all`), ikke i vannfall.
- Hent prosjektdata i få, brede spørringer (aktiv produksjon → forekomster → varianter → blokker), ikke én per scene.
- Realtime: invalider bare berørte objekter (bruk `affected_ids` fra `change_log`).

## 5. Bundel og lasting
- Del opp per arbeidsflate (rute-basert kodesplitting via ruteren som er i bruk).
- Tunge biblioteker (pdf.js, DOCX-zip, mp4-muxer, WebGL) lastes dynamisk når funksjonen brukes – også av hensyn til SSR.
- Unngå barrel-importer som drar med hele moduler.

## 6. Workers
- Import (uttrekk + klassifisering), paginering, varighetsestimat og eksport-forberedelse kan kjøres i Web Worker fordi logikken er ren core-kode. Kommuniser med serialiserbare data; ingen DOM i worker.

## 7. JS-mikro (bare når målinger viser behov)
- `Map`/`Set` for oppslag på ID i løkker; indekser lister én gang.
- Unngå gjentatt sortering; behold sorterte strukturer (`orderKey` er allerede sortert fra databasen).

## Kilde
Kategoriene over (vannfall, bundel, re-render, rendering, JS) er inspirert av vercel-labs/agent-skills `react-best-practices` (MIT), omformulert og filtrert for en app uten Next.js/RSC. Se `docs/references/technical/SKILLS_ASSESSMENT.md` §2.15.
