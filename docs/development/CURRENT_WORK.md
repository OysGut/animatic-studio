# Pågående arbeid

Oppdatert: 2026-10-08

## Nå: M0 Fundament – avsluttes
- [x] Mandat lagret uendret med manifest og kontrollsum
- [x] Kravregister (530 krav) + sporbarhet + linjedekning 100 %
- [x] Uavhengig kravrevisjon (47 stikkprøver + linje-for-linje kap. 2, 3, 10, 21, 24, 34) – funn rettet (DEC-0020, historikk i krav)
- [x] Beslutningslogg (20 DEC) + 8 ADR
- [x] Arkitektur-, design- og utviklingsdokumenter
- [x] 12 P0-skills, testet mot scenarier S1–S12, rettet til v0.2.0
- [x] Lovable-repo verifisert (`OysGut/animatic-studio`, TanStack Start)
- [ ] Mars: Commit + Push av fundamentet (GitHub Desktop)
- [ ] Mars: aktivere Lovable Cloud (LOVABLE_SYNC.md A2) – KI-10

## Neste: M1 Skjelett og kjerne
Plan (se ROADMAP.md, fase 1-krav: `coverage_report.py --phase 1`):
1. Utvide Vitest til `tests/`, legge til fast-check; arkitekturtest for `src/core`-renhet.
2. `src/core/model` (ID-er, typer), `src/core/commands` (MoveOccurrence, SetOccurrenceActive, CreateScene, EditBlockText, SplitScene, MergeScenes, SetActiveTake, CreateSegments + inverse), `src/core/invariants`, `src/core/time`.
3. Egenskapsbaserte invarianttester INV-01, 02, 03, 10, 13, 14, C1.
4. Migrasjon 0001: prosjekt, medlemskap, invitasjoner, produksjoner, scener, varianter, blokker + revisjoner, sceneforekomster, segmenter, takes, change_log, schema_version; RLS; `apply_command`.
5. Innlogging og prosjektliste i UI (mørkt tema, tokens fra DESIGN_SYSTEM.md).
6. Første synktest mot Lovable (KI-04, KI-07).
Akseptanse M1: alle fase 1-P0-krav har test; `npm test` og `check_kb.py` grønne; Lovable kjører appen og migrasjonen.
