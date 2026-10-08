---
name: requirements-traceability
description: Vedlikeholder kravregisteret og sporbarheten i Animatic Studio - docs/product/requirements.yaml (eneste redigerbare kilde), genererte REQUIREMENTS.md og TRACEABILITY_MATRIX.md, spec_coverage.yaml, via scripts/kb/build_docs.py og scripts/kb/check_kb.py. Bruk når et krav skal få ny status, når kode eller tester er skrevet og skal registreres (implementation, verification), når et nytt krav skal legges til (neste ledige REQ-ID), når check_kb.py feiler, ved fase- eller milepælsrevisjon (milestone audit, coverage report), og når noen spør «hvor langt har vi kommet», «hva mangler tester», «er dette ferdig». Triggere - requirements.yaml, REQ-xxxx, status, Verifisert, traceability, sporbarhet, dekning, coverage, milepæl.
metadata:
  version: "0.1.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# requirements-traceability

Holder kravregisteret sant: hvert krav kan spores fra mandat/beslutning → modul → kode → test → status. Skillen lager aldri nye produktkrav på egen hånd.

## 1. Ansvar
**Eier:** felt, status, `implementation`, `verification` og `history` i `requirements.yaml`; regenerering og kontroll; milepælsrevisjon; dekningsrapport.
**Eier ikke:**
- Om et krav skal finnes, endres eller utgå → `specification-guardian` (krever DEC fra Mars).
- Hvordan kravet løses teknisk → `architecture-guardian`; synk-invarianter og tester per strukturkommando → `scene-sync-invariants`.

## 2. Når den brukes
- Etter hver endring som implementerer eller tester et krav (CLAUDE.md «Etter endringer» 2–4).
- Når et nytt krav skal registreres etter en beslutning (sammen med `specification-guardian`).
- Når `check_kb.py` feiler.
- Ved slutten av en fase / milepæl, og når Mars spør om framdrift.

## 3. Les først
- `docs/decisions/adr/ADR-0001-kravregister.md` og DEC-0007.
- `scripts/kb/kb_lib.py` – gyldige verdier: `STATUSES`, `PRIORITIES`, `TYPES`, `ORIGINS`, `MODULES`, `INVARIANTS`.
- `scripts/kb/check_kb.py` – reglene som håndheves.
- `docs/product/requirements.yaml` – `meta.id_policy` og eksempelposter.
- Prosesskrav: REQ-0474/REQ-0475 (33.5), REQ-0476–REQ-0478 (33.6), REQ-0514 (milepæler, kap. 35).

## 4. Arbeidsprosedyre

### A. Registrere implementering og verifikasjon
1. Finn krav-ID-ene i planen i `CURRENT_WORK.md`.
2. Fyll `implementation` med **`filsti[#symbol]`** relativt til repo-rot, én post per sentral fil, f.eks. `src/core/commands/apply.ts#applyCommand`, `db/migrations/0001_core.sql#apply_changes`.
3. Fyll `verification` med:
   - automatisert: **`testfil::testnavn`**, f.eks. `tests/invariants/inv01-structure-sync.test.ts::flytt i manus gir samme rekkefølge i montering`;
   - manuell: **`manuell: ÅÅÅÅ-MM-DD beskrivelse`**, f.eks. `manuell: 2026-11-02 Mars testet invitasjon i Lovable-forhåndsvisning`.
   Testnavnet skal finnes i fila. `tests` (plan) og `verification` (utført) er forskjellige felt.
4. Sett status etter tabellen under og legg til `history`-post `{date, change}` (med `decision` bare når en DEC gir grunnlaget).
5. `python3 scripts/kb/build_docs.py` → `python3 scripts/kb/check_kb.py` (skal gi OK).

### Statusmodell (`kb_lib.STATUSES`)
| Status | Bruk når | Krav |
|---|---|---|
| Ikke startet | Ingen kode | – |
| Under arbeid | Arbeid pågår i inneværende økt/fase | står i `CURRENT_WORK.md` |
| Implementert – ikke verifisert | Kode finnes, akseptanse ikke bevist | `implementation` ≠ tom (håndheves) |
| Verifisert | Alle akseptansekriterier bevist | `implementation` og `verification` ≠ tom (håndheves); testene kjører grønt |
| Endret – må reverifiseres | Kravet eller berørt kode er endret etter verifisering | ny verifikasjon før «Verifisert» |
| Utsatt | Mars har godtatt utsettelse | begrunnelse i `notes` + `history` |
| Utgått | Erstattet/fjernet etter beslutning | `history` med DEC (håndheves). Posten slettes aldri |

Skrevet kode alene er aldri «Verifisert». Delvis oppfylte akseptansekriterier = ikke Verifisert; skriv hva som mangler i `notes`.

### B. Nytt krav (bare med grunnlag i en DEC)
1. Neste ledige ID = høyeste `REQ-xxxx` + 1. Aldri hull, aldri gjenbruk, aldri omnummerering (`check_kb.py` feiler ellers).
2. Alle påkrevde felt (se `required` i `check_kb.py`). `origin ∈ ORIGINS`; ikke-mandatkrav har `source: {decision: DEC-xxxx}`. Minst ett testbart akseptansekriterium (Gitt/Når/Så) og minst én planlagt test med type-prefiks (`enhet:`, `integrasjon:`, `dataintegritet:`, `e2e:`, `visuell:`, `import/eksport:`, `manuell:`).
3. Legg kravet til slutt i lista. Regenerer og kontroller.

### C. Milepælsrevisjon (del B4)
Følg [MILESTONE_AUDIT](references/MILESTONE_AUDIT.md). Start med dekningsrapporten:
```
python3 .claude/skills/requirements-traceability/scripts/coverage_report.py [--phase N] [--all]
```
Den viser krav per status/fase, P0 uten automatisert test, implementert uten verifikasjon, filer i `implementation`/`verification` som ikke finnes, og åpne krav i inneværende fase som ikke står i `CURRENT_WORK.md`/`ROADMAP.md`. [Skriptet](scripts/coverage_report.py) leser bare.

## 5. Leveranse
- Oppdatert `requirements.yaml` + regenererte `REQUIREMENTS.md`/`TRACEABILITY_MATRIX.md` i samme commit (commit-melding med REQ-ID-er).
- Ved milepæl: revisjonsnotat i `docs/development/SESSION_HANDOVER.md` (og `IMPLEMENTATION_STATUS.md`) med tallene fra rapporten og tiltakslisten. Til Mars: kort norsk oppsummering i klartekst – hva er ferdig og bevist, hva er ikke, hva er utsatt og hvorfor.

## 6. Kontrollpunkter
- [ ] `check_kb.py` gir OK, og `build_docs.py --check` sier «Oppdatert».
- [ ] Ingen «Verifisert» uten kjørbar test eller datert manuell kontroll.
- [ ] Alle stier i `implementation`/`verification` finnes (rapportens seksjon 4 er tom).
- [ ] Endrede verifiserte krav er satt til «Endret – må reverifiseres».
- [ ] Ingen ID er endret eller fjernet.

## 7. Typiske feil som må unngås
- Redigere `REQUIREMENTS.md`/`TRACEABILITY_MATRIX.md` for hånd (genererte filer).
- Sette «Verifisert» fordi koden «ser riktig ut», eller fordi én av flere akseptansekriterier er testet.
- Blande `tests` (plan) og `verification` (bevis).
- Slette et krav eller «rydde» ID-rekkefølgen. Utgåtte krav blir stående.
- Endre kravtekst for å passe implementasjonen (det er en produktendring → `specification-guardian`).
- Glemme `history`-post ved statusendring.

## 8. Akseptansekriterier / tester
- `python3 scripts/kb/check_kb.py` returnerer 0.
- `coverage_report.py` kjører uten feil og seksjon 4 («kan ikke etterprøves») er tom ved milepæl.
- Hver `verification` med `::` peker på en eksisterende testfil med testnavnet.

## 9. Dokumentasjon og sporbarhet
`requirements.yaml` (status/implementation/verification/history) → `build_docs.py` → `check_kb.py`; `IMPLEMENTATION_STATUS.md`, `SESSION_HANDOVER.md`, `KNOWN_ISSUES.md` (avvik mellom krav og kode) i `docs/development/`; DEC/ADR bare via `specification-guardian`/`architecture-guardian`.

## Eksterne kilder
Ingen ekstern skill dekker dette (`docs/references/technical/SKILLS_ASSESSMENT.md`, status SELV). Denne skillen har forrang ved konflikt med generelle dokumentasjons-plugins (f.eks. `claude-md-management`).
