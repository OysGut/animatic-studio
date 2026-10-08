# E2E- og visuelle mønstre (Playwright Test, TypeScript)

## 1. Oppsett
- `playwright.config.ts`: `baseURL` fra miljø (lokal dev-server; ev. Lovable-forhåndsvisning for røyktest), Chromium som standard (Firefox/WebKit senere), `trace: 'on-first-retry'`, `retries: 1` i CI (en test som trenger retry, er ustabil og skal fikses).
- Testbrukere opprettes per kjøring mot testdatabase; aldri mot produksjonsprosjekter. Innlogging én gang via `storageState` per rolle.
- Ingen ekte AI-nøkler; AI-adaptere er stubber i testmiljøet.

## 2. Locators og tilgjengelighet
- Bruk `getByRole`, `getByLabel`, `getByText` (norsk UI-tekst via oversettelsesnøkler) – det tester samtidig tilgjengeligheten.
- `data-testid` bare der rolle/navn ikke finnes (f.eks. canvas-områder). Bruk ID-er, aldri scenenummer, i test-ID-er (INV-02): `data-testid="occurrence-<id>"`.
- Tilstand verifiseres helst gjennom UI; når canvas skjuler den, via en test-krok som bare finnes i testbygg (f.eks. `window.__ANIMATIC_TEST__.getOccurrenceOrder()`), aldri i produksjonsbygg.

## 3. Tastaturinteraksjon
- Hver kjernehandling skal kunne gjøres med tastatur (WCAG 2.2 AA, ARCHITECTURE §5). Test: fokusrekkefølge (`Tab`), snarveier (`page.keyboard.press('Control+Z')` / `Meta+Z` etter plattform), Escape lukker dialoger, fokus synlig.
- Angre/gjør om: utfør kommando → angre → tilstand som før → gjør om.

## 4. Drag-and-drop på tidslinjen
- Canvas-basert tidslinje: bruk `page.mouse` med mellomsteg (`move(x, y, { steps: 10 })`) fra klippets koordinater (hentes via test-krok eller kjente pikselposisjoner ved fast zoom) til mål.
- Verifiser to ting: (1) tidslinjens rekkefølge, (2) **manusvisningens** rekkefølge – samme endring, samme transaksjon (INV-01, REQ-0018).
- Test også tastaturalternativet for flytting (f.eks. velg klipp + snarvei), og at avbrutt dra (Escape) ikke sender kommando.
- Trimming endrer ikke manus (REQ-0230).

## 5. Flerbruker i nettleser
- To `browser.newContext()` med ulike brukere i samme prosjekt.
- Presence: B ser at A er i scene X.
- Realtime: A flytter scene → B ser ny rekkefølge uten omlasting.
- Konflikt: begge redigerer samme blokk → den siste får konfliktvisning, ingen tekst går tapt (INV-C1).
- Rolle: viewer ser ingen redigeringskontroller, og et forsøk via API avvises (INV-C2 – hovedbevis i `tests/rls`).

## 6. Visuell regresjon
- `await expect(locator).toHaveScreenshot('navn.png', { maxDiffPixelRatio: 0.001 })` – terskel settes per test og begrunnes.
- Deterministisk: fast viewport og `deviceScaleFactor`, innebygde fonter (Courier-varianten som brukes i manus lastes eksplisitt), `animations: 'disabled'`, fast klokke (`page.clock`), maskér dynamiske felt (`mask: [...]`), fast avspillingsbilde.
- `renderFrame` (ADR-0008): render bestemte bilder (0, midt, siste) av en fixture-komposisjon til canvas og ta skjermbilde – samme funksjon som eksporten bruker.
- Manusside: render side N av en fixture med kjent paginering; sammenlign med baseline.
- Baselines genereres på samme plattform som CI (fonter rendres ulikt på macOS/Linux). Oppdatering med `--update-snapshots` bare bevisst, med forklaring i commit.

## 7. Kjerneflyter (minimum)
1. Logg inn → opprett prosjekt → importer fixture-manus → se scener og usikre tolkninger.
2. Flytt scene i manus → samme rekkefølge i tidslinjen; flytt tilbake i tidslinjen → manus følger.
3. Deaktiver scene → borte fra aktivt manus, avspilling og eksport; gjenaktiver → identisk.
4. Eksporter manus med valgt nummerering → forhåndsvisning → fil lastes ned (innhold sjekkes i gyldne tester).
5. Inviter bruker med rolle → bruker ser prosjektet med riktige rettigheter.
6. Animatic-avspilling uten AI (stub som feiler hvis kalt).
7. SSR: last hver hovedrute direkte (uten klientnavigasjon) → ingen hydration-feil i konsollen (`page.on('console')`).

## 8. Ustabile tester
- Aldri `waitForTimeout`; vent på tilstand (`expect(...).toHaveText`, `waitForResponse`).
- Isoler data per test; ikke del prosjekter mellom tester.
- Logg ustabile tester i `KNOWN_ISSUES.md` og fiks rotårsaken; ikke øk retries.
