---
name: test-quality-engineering
description: Teststrategi og testkvalitet for Animatic Studio – Vitest (enhetstester og egenskapsbaserte tester med fast-check for invariantene INV-01–INV-14, INV-C1/C2 via tilfeldige kommandosekvenser), integrasjonstester mot database og RLS (rollematrise, to klienter/flerbruker, revisjonskonflikt), Playwright i TypeScript (e2e, visuell regresjon med skjermbilder, tastaturinteraksjon, drag-and-drop på tidslinjen), import/eksport-tester med gyldne filer (referansemanus), dataintegritet, feilsituasjoner og spinoff-isolasjon. Mappestruktur tests/{unit,invariants,integration,rls,e2e,visual,fixtures}. Definition of done = grønn test registrert i requirements.yaml verification. Bruk når du skriver eller planlegger tester, setter opp testverktøy, vurderer om en funksjon er «ferdig»/«verifisert», feilsøker ustabile tester, eller når oppgaven nevner «test», «Vitest», «Playwright», «fast-check», «property-based», «golden file», «regresjon», «skjermbilde», «e2e», «verifisert».
metadata:
  version: "0.2.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# test-quality-engineering

Hvordan Animatic Studio testes slik at «Verifisert» betyr noe. Skillen lager ikke produktkrav; testene beviser kravene og invariantene som finnes.

## 1. Ansvar
**Eier:** teststrategi og testpyramide, verktøyoppsett (Vitest, fast-check, Playwright Test), mappestruktur, mønstre for invariant-, RLS-, flerbruker-, e2e-, visuelle og gyldne tester, testdata og fixtures, ustabile tester, definition of done.
**Eier ikke:**
- Hvilke invarianter som finnes og hva hver kommando må bevare → `scene-sync-invariants` (denne skillen sier *hvordan* de testes).
- Krav-ID-er, statusregler og `requirements.yaml`-format → `requirements-traceability`.
- Manusfaglige forventninger (sideskift, nummerering, referanseverdier) → `screenplay-engineering`.
- Skjema og policyer som testes → `database-domain-modeling`.
- Sikkerhetsgjennomgang → `secure-development`.

## 2. Når den brukes
- Før og under implementering av enhver funksjon (testen skrives sammen med koden).
- Når en P0-invariant berøres, når et krav skal settes til «Verifisert», eller før en milepæl.
- Oppsett eller endring av testverktøy, CI-steg eller fixtures.
- Ustabile («flaky») tester, eller feil som bare skjer i nettleser, med to brukere eller etter Lovable-synk.

## 3. Les først
- `docs/architecture/INVARIANTS.md` – planlagte testfiler per invariant (`tests/invariants/invNN-*.test.ts`, `tests/rls/role-matrix`).
- ADR-0003 (`tests/architecture/core-purity.test.ts`), ADR-0004 (RLS-tester), ADR-0005 (invers + tilfeldige sekvenser), ADR-0007 (gyldne manustester), ADR-0008 (visuell regresjon, eksporttest).
- `docs/product/requirements.yaml` – feltene `acceptance` og `tests` for kravene oppgaven gjelder.
- `package.json` – hvilke testverktøy som faktisk finnes (Lovable-stacken er ikke endelig verifisert).
- Krav: REQ-0465 (testbare akseptansekriterier), REQ-0469 (ikke påstå uverifisert funksjonalitet), samt kravene funksjonen gjelder.
- Referanser: [TEST_STRATEGY](references/TEST_STRATEGY.md), [INVARIANT_TESTING](references/INVARIANT_TESTING.md), [E2E_PATTERNS](references/E2E_PATTERNS.md).

## 4. Arbeidsprosedyre
1. **Hent akseptansekriteriene** fra kravene (Gitt/når/så) og skriv dem som testnavn før koden. Mangler et krav testbart kriterium: noter det for `requirements-traceability`, ikke finn opp produktatferd.
2. **Velg nivå** (laveste som kan bevise kravet) etter [TEST_STRATEGY](references/TEST_STRATEGY.md): ren logikk → `tests/unit` / ved siden av koden; invariant → `tests/invariants` med fast-check; database/tilgang → `tests/integration` / `tests/rls`; brukerflyt → `tests/e2e`; bilde → `tests/visual`.
3. **Invariant berørt?** Utvid generatoren av tilfeldige kommandosekvenser og invariantkontrollene etter [INVARIANT_TESTING](references/INVARIANT_TESTING.md). Hver ny kommandotype skal inn i generatoren.
4. **Data:** bygg testdata med fabrikker i `tests/fixtures/` (prosjekt med hovedfilm + spinoff, scener med hull i nummerrekken, takes, ressursversjoner). Manusutdrag fra referansen bare anonymisert (DEC-0004). Ingen hele manusfiler i repoet.
5. **Flerbruker og tilgang:** to klienter/brukere for samtidighet (INV-C1) og rollematrise for hver tabell/RPC (INV-C2).
6. **Feilsituasjoner:** test tilbakerulling, nettverksbrudd, revisjonskonflikt, ugyldig fil, AI-adapter som «feiler hvis kalt» (INV-11), budsjett overskredet (INV-12).
7. **E2E/visuelt** etter [E2E_PATTERNS](references/E2E_PATTERNS.md): tilgjengelige locators, tastatur, drag-and-drop på tidslinjen, deterministiske skjermbilder.
8. **Kjør alt lokalt** (`npm test`, `npx playwright test` når satt opp) og `python3 scripts/kb/check_kb.py`. En test som hoppes over (f.eks. referansemanus mangler) rapporteres som hoppet over, ikke som grønn.
9. **Registrer verifikasjon** i `requirements.yaml` (se pkt. 9) – først da kan status bli «Verifisert».

## 5. Leveranse
- Tester i riktig mappe, navngitt etter krav/invariant (`inv04-spinoff-isolation.test.ts`, `req0081-sequential-numbering.test.ts` eller beskrivende navn med krav-ID i `describe`).
- Testrapport i handover: hva som er dekket, hva som er hoppet over og hvorfor, kjente hull.
- Til Mars: «Dette er testet og virker» / «dette er ikke testet ennå» – i vanlig språk.

## 6. Kontrollpunkter
- [ ] Hver P0-invariant som koden berører, har en grønn test i `tests/invariants/`.
- [ ] Hver ny kommando er med i den tilfeldige kommandogeneratoren og har invers-test (utfør → inverse → identisk tilstand).
- [ ] Nye tabeller/RPC-er er med i rollematrisen; revisjonskonflikt testet med to klienter.
- [ ] Testene er deterministiske: fast seed logges, fast klokke og ID-generator, ingen ventetid med `sleep`.
- [ ] Ingen test er avhengig av rekkefølge eller av andre testers data.
- [ ] Ingen hemmeligheter, ekte API-nøkler eller betalte kall i tester; AI-adaptere er stubber.
- [ ] Gyldne filer sammenlignes normalisert (ID-er, tidsstempler) og endres bare bevisst.
- [ ] Hoppede tester er merket med grunn og telles ikke som verifikasjon.

## 7. Typiske feil som må unngås
- Merke krav «Verifisert» uten test eller dokumentert kontroll (CLAUDE.md: skrevet kode er aldri «ferdig»).
- Teste implementasjonsdetaljer (interne state-variabler) i stedet for oppførsel og invarianter.
- Bare «lykkelig vei»: ingen test av konflikt, tilbakerulling, tom tilstand, ugyldig input.
- Teste RLS med service role (omgår RLS) eller bare som eier.
- Mocke bort databasen i tester som skal bevise transaksjonalitet.
- Visuelle tester med animasjoner, ekte klokke eller systemfonter som varierer → ustabile skjermbilder.
- Oppdatere skjermbilder/gyldne filer automatisk for å få testen grønn.
- Bruke Anthropics `webapp-testing` (Python-Playwright) – vi tester i TypeScript.
- Kjøre tester mot Lovable Clouds produksjonsdata.
- Committe referansemanuset eller utdrag med kontaktinfo.

## 8. Akseptansekriterier / tester
- `tests/invariants/` har én fil per INV-01–INV-14 når tilhørende funksjon finnes, pluss `invC1-revision-conflict`; egenskapsbasert kjøring med minst 200 sekvenser i CI (flere ved nattlig/manuell kjøring).
- `tests/rls/role-matrix` dekker alle prosjekttabeller og skrivende RPC-er (INV-C2).
- `tests/architecture/core-purity.test.ts` grønn (ADR-0003).
- Gyldne import-/eksporttester for manus består (fixtures i CI, referansemanus lokalt).
- E2E: kjerneflyter (importer manus → flytt scene i manus → se samme rekkefølge i tidslinjen) grønn i Chromium.
- Testsuiten er grønn to ganger på rad uten endring (ingen ustabile tester).

## 9. Dokumentasjon og sporbarhet
- `docs/product/requirements.yaml`: legg til i `verification` en streng som `"test: tests/invariants/inv01-structure-sync.test.ts – grønn 2026-10-15"` (eller dokumentert manuell kontroll med dato og hvem), sett `status`, og hold `tests` oppdatert → `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py`.
- `docs/architecture/INVARIANTS.md`: status per invariant (genereres videre i `TRACEABILITY_MATRIX.md`).
- `docs/development/IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md` (hva er testet/ikke), `KNOWN_ISSUES.md` (hoppede/ustabile tester, toleranser).
- Nytt testverktøy eller CI-oppsett: DEC (Teknisk anbefaling).

## Eksterne kilder
Vurdert i `SKILLS_ASSESSMENT.md` §2.6, §2.12, §2.13: `pr-review-toolkit` (pr-test-analyzer) kan brukes som plugin for å finne testhull; `playwright-cli` (Microsoft) kan vurderes når e2e-fasen starter, med pinnet versjon (DEC-0016). Anthropics `webapp-testing` brukes ikke (Python; bare mønsteret «utforsk siden før handling» er nyttig). Ved konflikt har denne skillen forrang.
