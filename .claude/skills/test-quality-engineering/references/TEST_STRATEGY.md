# Teststrategi

## 1. Pyramide og mapper
```
tests/
  unit/          rene funksjoner i src/core og små enheter i engine/adapters (Vitest, node)
  invariants/    INV-01–INV-14, INV-C1 – eksempelbaserte + egenskapsbaserte (Vitest + fast-check)
  integration/   adapters mot ekte Postgres: kommando-RPC-er, transaksjoner, change_log, Storage-stier
  rls/           rollematrise og tilgang (INV-C2), to brukere, Storage- og Realtime-policyer
  e2e/           brukerflyter i nettleser (Playwright Test, TypeScript)
  visual/        skjermbilder av renderFrame, manusside, tidslinje (Playwright toHaveScreenshot)
  fixtures/      fabrikker, små datasett, anonymiserte manusutdrag (screenplay/), gyldne filer (golden/)
  architecture/  core-purity.test.ts (ADR-0003) og statiske skjemasjekker
```
Enhetstester kan også ligge ved siden av koden (`*.test.ts`) i `src/core`. Velg én konvensjon ved første oppsett og noter den.

| Nivå | Andel | Hastighet | Kjøres |
|---|---|---|---|
| unit + invariants | flest | sekunder | hver endring, CI |
| integration + rls | moderat | sekunder–minutter | CI når database er tilgjengelig, ellers lokalt |
| e2e + visual | få, kritiske flyter | minutter | CI (Chromium), før milepæl |

## 2. Verktøy (verifiser mot `package.json`)
- **Vitest** for unit/invariants/integration. Node-miljø for core; `jsdom`/`happy-dom` bare for komponenttester.
- **fast-check** for egenskapsbaserte tester (se `INVARIANT_TESTING.md`).
- **Testing Library** for komponenter som har logikk som ikke kan ligge i core.
- **Playwright Test** (TypeScript) for e2e og visuelt. Nettlesere installeres med pinnet Playwright-versjon.
- Installasjon av utviklingsavhengigheter er et teknisk valg (DEC-0006), men noteres.

## 3. Database- og RLS-tester
- Mål: kjør migrasjonene i `supabase/migrations/` mot en ekte Postgres med Supabase-skjemaene `auth`/`storage`.
- Foretrukket: lokal Supabase (Supabase CLI) – krever Docker; **ikke verifisert** at det er tilgjengelig i Claudes miljø eller CI. Alternativ: Postgres-container med minimal stub av `auth.uid()` (leser `request.jwt.claims`) – dokumenter at dette er en tilnærming.
- Lovable Cloud kan ikke nås direkte fra Claudes miljø. Endelig RLS-kontroll mot Cloud (ADR-0002 «Verifisering») gjøres med et skrivebeskyttet kontrollskript eller en innlogget testkonto i appen; registrer som dokumentert kontroll.
- Hver test oppretter egne brukere/prosjekter (unike ID-er) og rydder ved å forkaste databasen/skjemaet – ikke ved `delete` i produksjonstabeller.
- **Rollematrise:** tabell × operasjon × rolle (ikke-medlem, viewer, commenter, editor, owner, fjernet medlem) → forventet (tillatt/avvist). Genereres fra en tabell i testkoden, slik at nye tabeller må legges inn.
- **To klienter:** to autentiserte klienter mot samme prosjekt. Begge leser revisjon r; A skriver (r→r+1); B skriver med r → `revision_conflict`; As endring består (INV-C1). Tilsvarende for angre per bruker (REQ-0527).

## 4. Gyldne filer (import/eksport)
- Import: `fixture.pdf|docx` → struktur-JSON. Normaliser før sammenligning: ID-er → løpenummer i forekomstrekkefølge, fjern tidsstempler. Sammenlign med `tests/fixtures/golden/<navn>.json`.
- Eksport: sammenlign **innhold**, ikke bytes – PDF: uttrukket tekst + x-posisjoner per side; DOCX: normalisert `document.xml` (avsnitt, stil, innrykk).
- Referansemanus (`../Manus/`, utenfor repoet): tester leser `MANUS_DIR`, hoppes over med melding når filene mangler. Forventede verdier: `.claude/skills/screenplay-engineering/references/REFERENCE_SCREENPLAY.md`.
- Gyldne filer oppdateres bare med eksplisitt flagg (f.eks. `UPDATE_GOLDEN=1`) og en commit-melding som forklarer hvorfor.

## 5. Dataintegritet
- Etter hver kommando i tester: kjør invariantkontrollene (`src/core/invariants`).
- Tilbakerulling: injiser feil i en RPC (f.eks. ugyldig fremmednøkkel i siste steg) → ingen delvise rader, ingen `change_log`-rad.
- Uforanderlighet: `update`/`delete` på versjonstabeller avvises.
- Ikke-destruktivitet: etter manusendring er alle takes uendret (INV-07); etter deaktivering kan alt gjenopprettes identisk (INV-14).
- Eksport/backup (REQ-0411/REQ-0412): eksport → import i tomt prosjekt gir samme struktur.

## 6. Feilsituasjoner som alltid testes
| Situasjon | Forventet |
|---|---|
| Nettverksbrudd under kommando | Kommando står som «venter», prøves igjen med samme ID, ingen dobbel effekt |
| Revisjonskonflikt | Tydelig konflikt, ingen stille overskriving |
| Manglende rolle | Avvist i backend, forklarende melding |
| Skannet PDF / korrupt DOCX | Klar feilmelding, original lagres ikke som tolket versjon |
| AI-adapter kalt i animatic-flyt | Testen feiler (stub «feiler hvis kalt», INV-11) |
| Betalt jobb uten godkjenning / over budsjett | Avvist i backend (INV-12) |
| Skjemaversjon lavere enn forventet | UI blokkerer skriving med norsk melding |

## 7. Spinoff-isolasjon (INV-04)
Fixture: hovedfilm + spinoff som gjenbruker scener. For tilfeldige kommandoer i spinoffen: hovedfilmens forekomster, varianter, takes og kontinuitetshendelser er byte-like før/etter. Redigering av delt scene i spinoff lager ny variant med `owner_production_id = spinoff`. Ny scene i spinoff finnes ikke i hovedmanus (REQ-0363).

## 8. Definition of done
En funksjon er ferdig når:
1. Akseptansekriteriene i kravene har grønne tester (eller dokumentert manuell kontroll der automatisering ikke er mulig – med begrunnelse).
2. Berørte invarianttester er grønne, og nye kommandoer er i den tilfeldige generatoren.
3. `verification` i `requirements.yaml` er oppdatert, `build_docs.py` og `check_kb.py` er kjørt uten feil.
4. Handover sier hva som er testet og hva som ikke er det.
