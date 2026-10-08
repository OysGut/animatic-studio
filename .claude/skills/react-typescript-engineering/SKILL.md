---
name: react-typescript-engineering
description: Kodekvalitet for Animatic Studios frontend og domenekode i TypeScript/React – TypeScript strict, komponentarkitektur, tilstand (server-tilstand vs. lokal redigeringstilstand vs. kommandoer i src/core/commands), asynkrone operasjoner og feilhåndtering, ytelse (virtualisering av manus og tidslinje, canvas utenfor React-render, memo, Web Workers), SSR-sikkerhet i TanStack Start (nettleserbiblioteker som pdf.js, canvas, WebCodecs, Web Audio bare på klient), modulgrenser (src/core uten React/Supabase, src/engine, src/adapters, src/app) og testbarhet. Starter alltid med å lese package.json og tsconfig fordi stacken Lovable genererer ikke er endelig verifisert. Bruk når du skriver eller gjennomgår .ts/.tsx-kode, komponenter, hooks, tilstandshåndtering, ytelsesproblemer, hydration-/SSR-feil, eller ved refaktorering. Triggere – «komponent», «React», «TypeScript», «hook», «state», «re-render», «treg», «SSR», «hydration», «TanStack», «refactor», «kodekvalitet».
metadata:
  version: "0.1.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# react-typescript-engineering

Hvordan TypeScript- og React-koden skrives slik at domenekjernen forblir ren, redigeringsflatene er raske, og Lovable-oppsettet (SSR) ikke knekker. Skillen lager ikke produktkrav.

## 1. Ansvar
**Eier:** kodekonvensjoner, typer og ID-typer, komponent- og modulstruktur, tilstandsmodell (server/lokal/kommando), async og feil, ytelsesmønstre, SSR-sikker lasting, importgrenser, testbar kode.
**Eier ikke:**
- Hvilke lag som finnes og hva de skal inneholde → `architecture-guardian` (ADR-0003).
- Visuelt designsystem, tokens, shadcn-bruk → `design-system-director`; interaksjonsmønstre og tastatursnarveier → `ux-interaction-design`.
- Kommandoenes semantikk og invarianter → `scene-sync-invariants`.
- Skjema, `apply_changes`/RPC-er, RLS → `database-domain-modeling`.
- Lovable-synk og filer Lovable eier → `lovable-development`.
- Teststrategi og verktøyoppsett → `test-quality-engineering`.
- Manusformatlogikk → `screenplay-engineering`.

## 2. Når den brukes
- Skriving eller gjennomgang av `.ts`/`.tsx` i `src/`.
- Nye komponenter, hooks, stores, adaptere, workers.
- Ytelsesproblemer (treg rulling i manus, hakkete tidslinje, mange re-render).
- SSR-/hydration-feil, «window is not defined», feil som bare skjer i publisert versjon.
- Refaktorering og avhengighetsvalg.

## 3. Les først
- **`package.json`, `tsconfig*.json`, `vite.config.*`, `components.json`** – faktisk stack. Avgjør: TanStack Start (`@tanstack/react-start`) eller eldre React + Vite (React Router)? Tailwind-versjon? shadcn/ui? TanStack Query? Testverktøy? Avvik fra `ARCHITECTURE.md` §1 → `KNOWN_ISSUES.md` og oppdater dokumentet.
- `docs/architecture/ARCHITECTURE.md` (§2 lag, §4 dataflyt, §5 ytelsesmål), ADR-0003, ADR-0005, ADR-0008, `INVARIANTS.md` (risikoområdene).
- `docs/references/technical/LOVABLE_PLATFORM_NOTES.md` §1 (TanStack Start/SSR, server functions) og §2 (Git-synk).
- `AGENTS.md` (filer Lovable ikke skal endre).
- Krav: REQ-0009, REQ-0410 (ingen kritiske data bare i nettleser), REQ-0432, REQ-0042/REQ-0070 (angre/gjør om), REQ-0526/REQ-0527 (samtidighet, angre per bruker).
- Referanser: [CODE_CONVENTIONS](references/CODE_CONVENTIONS.md), [STATE_AND_COMMANDS](references/STATE_AND_COMMANDS.md), [PERFORMANCE_PATTERNS](references/PERFORMANCE_PATTERNS.md).

## 4. Arbeidsprosedyre
1. **Verifiser stacken** (se «Les først»). Tilpass mønstrene til det som faktisk er installert; legg ikke til et bibliotek som dupliserer et eksisterende (f.eks. en ny state-lib når én finnes). Ny avhengighet: sjekk lisens, størrelse, SSR-kompatibilitet, vedlikehold; noter i commit og ved større valg som DEC (Teknisk anbefaling).
2. **Plasser koden i riktig lag:** domenelogikk i `src/core/` (ren TS), nettlesermotorer i `src/engine/`, Supabase/AI/medie i `src/adapters/`, UI i Lovables ruter/komponenter + `src/app/`. Er du i tvil: kan det testes uten DOM og database? Da hører det hjemme i core.
3. **Typer først:** definer domenetyper og brandede ID-typer i `src/core/model/`; `strict` på. `any` er forbudt i core; `unknown` + validering ved grenser (svar fra serverfunksjoner, filimport).
4. **Tilstand etter [STATE_AND_COMMANDS](references/STATE_AND_COMMANDS.md):** server-tilstand (hentet, cachet, invalidert av Realtime), lokal redigeringstilstand (utkast, markering, zoom), og endringer som kommandoer: UI → `core` validerer → optimistisk visning → serverfunksjonen `runCommand` (kjører kjernen autoritativt og lagrer via `apply_changes`, DEC-0022) → bekreft eller rull tilbake / vis konflikt. UI skriver aldri direkte til tabeller.
5. **Async og feil:** domenefeil som `Result`-verdier i core; adaptere mapper databasefeil (revisjonskonflikt, ingen tilgang) til typede feil; UI viser norsk melding og en vei videre. Avbryt foreldede kall (`AbortController`). Ingen tomme `catch`.
6. **SSR-sikkerhet:** ingen `window`/`document`/`HTMLCanvasElement`/`AudioContext`/`VideoEncoder` på modulnivå. Tunge nettleserbiblioteker (pdf.js, mp4-muxer, WebGL-hjelpere) lastes med dynamisk `import()` i effekt/hendelse eller i en klient-only-komponent/Web Worker. Hemmeligheter bare i server functions/edge functions.
7. **Ytelse etter [PERFORMANCE_PATTERNS](references/PERFORMANCE_PATTERNS.md):** virtualiser manussider og tidslinjespor, tegn canvas imperativt utenfor React-render, smale abonnementer/selektorer, stabile props og `memo` der målinger viser behov. Mål før og etter.
8. **Testbarhet:** rene funksjoner i core med enhetstester; komponenter tar data og callbacks inn (ingen skjulte globale klienter); adaptere bak grensesnitt slik at tester kan bruke falske implementasjoner (f.eks. «feiler hvis kalt» for AI, INV-11).
9. **Selvgjennomgang** med sjekklisten under; kjør `tsc --noEmit`, lint og tester.

## 5. Leveranse
- Kode med typer og tester i samme commit; små commits med krav-ID.
- Kort beskrivelse i `CURRENT_WORK.md`/handover av nye moduler, avhengigheter og målte ytelsestall.
- Til Mars: hva som nå fungerer i appen, i vanlig språk – ikke kodedetaljer.

## 6. Kontrollpunkter
- [ ] `src/core/` importerer ikke `react`, `@tanstack/*`, `@supabase/*`, `@/components`, nettleser-API-er (ADR-0003; `tests/architecture/core-purity.test.ts`).
- [ ] Ingen `any` i core; ingen ikke-null-påstander (`!`) uten kommentar.
- [ ] React-nøkler, ruter, cache-nøkler og filnavn bruker ID-er, aldri scenenummer (INV-02).
- [ ] Ingen separat rekkefølge i tidslinje-tilstand; tidslinje og manus leser samme sceneforekomstliste (INV-01).
- [ ] Alle skrivinger går via kommandoer → `runCommand` med `baseRevisions` (INV-C1).
- [ ] Ingen nettleser-API på modulnivå; tunge biblioteker lastes dynamisk på klient.
- [ ] Ingen hemmeligheter eller `VITE_`-variabler med nøkler i klientkode.
- [ ] Laste-, tom-, feil- og konflikttilstand er håndtert i UI.
- [ ] Ingen kritiske data bare i `localStorage`/minne (REQ-0410).

## 7. Typiske feil som må unngås
- Domenelogikk i komponenter eller hooks (kan ikke testes, kan ikke gjenbrukes i desktop).
- Kopiere server-tilstand inn i lokal state og la den drive fra hverandre.
- Lagre avledet tilstand (varighet, tidskoder, nummerering) i state i stedet for å beregne den.
- Rendre 120 manussider eller tusenvis av klipp som DOM-noder på én gang.
- Tegne tidslinje/komposisjon via React-state per bilde (60 setState per sekund).
- `useEffect`-kjeder som henter data i sekvens (vannfall) når kallene er uavhengige.
- Importere fra «barrel»-filer som drar med seg hele motorer inn i hovedbundelen.
- Bruke Next.js-spesifikke råd (RSC, server actions, `next/dynamic`, `React.cache`) – gjelder ikke her.
- Endre Lovable-genererte kjernefiler (ruter-oppsett, Vite-konfig) uten grunn; det kan krasje med Lovables egne endringer.
- Svelge feil fra `runCommand` (`ok: false`) slik at brukeren tror noe er lagret.

## 8. Akseptansekriterier / tester
- `tsc --noEmit` uten feil; lint uten feil.
- `tests/architecture/core-purity.test.ts` grønn.
- Enhetstester for ny logikk i core; komponenttester for interaktiv logikk som ikke kan ligge i core.
- Ytelse: manus 120+ sider åpner < 2 s og ruller jevnt; tidslinje 150 scener × 20 spor < 16 ms per bilde (ARCHITECTURE §5) – målt i ytelsestest eller dokumentert manuell måling.
- SSR: publisert bygg (`npm run build`) og forhåndsvisning laster ruter med manus og tidslinje uten hydration-feil i konsollen (Playwright-sjekk).

## 9. Dokumentasjon og sporbarhet
- `docs/product/requirements.yaml`: `implementation` (filstier) og `verification` for berørte krav → `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py`.
- `docs/architecture/ARCHITECTURE.md` hvis stacken avviker fra beskrivelsen; DEC/ADR ved større valg (state-bibliotek, virtualisering, worker-oppsett).
- `docs/development/IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`, `KNOWN_ISSUES.md` (kjente ytelses- eller SSR-begrensninger).

## Eksterne kilder
- `react-best-practices` og `composition-patterns` fra vercel-labs/agent-skills (MIT) er vurdert i `SKILLS_ASSESSMENT.md` §2.15. Bruk dem bare som referanse for regler som gjelder en klientrendret/SSR-app uten Next.js: async-vannfall, bundelstørrelse, re-render, rendering og JS-ytelse. Regler om RSC, server actions, `next/dynamic` og `React.cache` gjelder ikke. Ikke kopier tekst ordrett (MIT krever lisenstekst ved kopiering). Skillene bryter dessuten navnekravet i Agent Skills-spesifikasjonen og installeres ikke uendret.
- Pluginene `typescript-lsp` og `pr-review-toolkit` (Anthropic) kan brukes som verktøy når de er installert etter DEC-0016.
- Ved konflikt har denne skillen forrang.
