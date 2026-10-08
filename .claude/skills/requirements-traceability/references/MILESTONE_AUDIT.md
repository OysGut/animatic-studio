# Milepælsrevisjon – sjekkliste

Grunnlag: Mars' instruks del B4 (revisjon ved milepæler, jf. ADR-0001), mandat 32 (faser), 33.5 (ingen krav forsvinner i stillhet), 33.6 (hele systemet forblir konsistent), REQ-0514 (milepæler med testbare akseptansekriterier). Kjøres ved slutten av hver fase (1–8) og før en leveranse Mars skal teste i Lovable.

Resultatet føres i `docs/development/SESSION_HANDOVER.md` under overskriften «Milepælsrevisjon fase N – ÅÅÅÅ-MM-DD» og oppsummeres i `IMPLEMENTATION_STATUS.md`.

## 1. Kontroller at grunnlaget er intakt
- [ ] `python3 scripts/kb/check_kb.py` → OK (inkl. mandatets kontrollsum og skill-format).
- [ ] `python3 scripts/kb/build_docs.py --check` → «Oppdatert».
- [ ] Alle tester grønne: `npm test` (Vitest), ev. `npx playwright test`, RLS-tester i `tests/rls/` (eller dokumentert manuell kjøring).
- [ ] Arkitekturtest `tests/architecture/core-purity.test.ts` grønn (ADR-0003).

## 2. Kjør dekningsrapporten
```
python3 .claude/skills/requirements-traceability/scripts/coverage_report.py --phase N --all > /tmp/coverage.txt
```
Lim nøkkeltall inn i revisjonsnotatet: krav per status, per fase, P0 uten automatisert test, implementert uten verifikasjon.

## 3. Fasens krav
- [ ] Hvert krav med `phase: N` har status Verifisert, Utsatt (med Mars' aksept) eller en tydelig plan i `CURRENT_WORK.md`/`ROADMAP.md` for neste fase. Rapportens siste liste skal være tom eller forklart.
- [ ] Ingen krav i fasen er «Under arbeid» uten at noen faktisk arbeider med dem.
- [ ] Alle P0-krav i fasen og tidligere faser har minst én automatisert test i `verification` (der kravet kan testes automatisk). Unntak begrunnes i `notes`.
- [ ] Alle «Implementert – ikke verifisert» har en plan for verifisering.
- [ ] «Utsatt»-krav: finnes det en beslutning eller tydelig aksept fra Mars? Hvis ikke → ta det opp (33.5).

## 4. Invarianter
- [ ] Hver invariant INV-01–INV-14, INV-C1/C2 som er relevant for fasen har en kjørende test i `tests/invariants/` (se tabellen i `docs/architecture/INVARIANTS.md`), og statuskolonnen der er oppdatert.
- [ ] Egenskapsbasert test med tilfeldige kommandosekvenser kjørt (ADR-0005) for kommandoene som finnes.
- [ ] Gå gjennom risikoområdene i `INVARIANTS.md` mot koden (UI-direkte tabellskriving, separat rekkefølge i tidslinje, scenenummer i URL/nøkler, overskriving i Storage, retry uten budsjett, oversettelse som skriver til norsk). Bruk `architecture-guardian` → `DEBT_SIGNALS.md`.

## 5. Sporbarhet
- [ ] Rapportens seksjon «kan ikke etterprøves» er tom (alle filer i `implementation`/`verification` finnes; format riktig).
- [ ] Stikkprøve: velg 5 verifiserte krav, åpne testen og kontroller at den faktisk tester akseptansekriteriet (ikke bare at koden kjører).
- [ ] Hvert verifisert krav som er berørt av endringer etter verifisering er satt til «Endret – må reverifiseres».

## 6. Beslutninger og åpne spørsmål
- [ ] Nye DEC-er siden forrige milepæl er reflektert i `requirements.yaml` (`history`) og i arkitekturdokumentene.
- [ ] Midlertidige antakelser (DEC-typen) som påvirker neste fase står i `OPEN_QUESTIONS.md` med spørsmål til Mars.
- [ ] Teknisk anbefaling som har vist seg feil er erstattet med ny DEC/ADR.

## 7. Plattform og drift
- [ ] Migrasjoner i `db/migrations/` er kjørt i Lovable Cloud etter siste synk (skjemaversjon i `schema_version` stemmer) – ellers står det i `KNOWN_ISSUES.md`.
- [ ] Ingen hemmeligheter, mediefiler eller hele manus i repoet.
- [ ] Påstander om Lovable/Supabase/AI-egenskaper i dokumentene er verifisert eller merket usikre (33.4).

## 8. Resultat
Skriv i handover:
1. Fasens status i én setning.
2. Tall fra rapporten.
3. Avvik og tiltak (krav-ID → tiltak → hvem/når).
4. Spørsmål til Mars (bare kostnad, sletting av hans filer, produktkrav, sikkerhet).

Kort versjon til Mars på norsk uten sjargong: hva fungerer og er testet, hva gjenstår, hva han må ta stilling til.
