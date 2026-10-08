# Implementeringsstatus – Animatic Studio

Oppdatert: 2026-10-08 (økt 2). Detaljert status per krav: `docs/product/TRACEABILITY_MATRIX.md` (generert).

## Sammendrag
- **M0 Fundament:** ferdig.
- **M1 Skjelett og kjerne:** kode og tester ferdig. Venter på at Mars pusher og ber Lovable kjøre migrasjon 0001 (LOVABLE_SYNC.md B). Deretter testes innlogging, opprett prosjekt og invitasjon i Lovable.
- **Krav:** 27 verifisert, 24 under arbeid, 479 ikke startet (`coverage_report.py`).

## Tester (alle grønne 2026-10-08)
| Testsett | Antall | Kjøres med |
|---|---|---|
| Enhet + scenarier (`tests/unit`, + 1 Lovable-test i `src/test`) | 26 | `bun run test` |
| Egenskapsbaserte invarianttester (`tests/invariants`) – 150 tilfeldige sekvenser × 40 kommandoer per egenskap | 8 | `bun run test` |
| Arkitektur (`tests/architecture`) – domenekjernen er plattformnøytral | 1 | `bun run test` |
| Database (`tests/db`) – RLS, revisjon, atomisitet, invitasjoner, uforanderlighet, rundtur | 15 | `bun tests/db/run-db-tests.ts` (lokal Postgres) |
| Visuell QA (`tests/visual`) – 5 skjermbilder med mockede data | manuell vurdering | `node tests/visual/screens.mjs` |

## Moduler
| Modul | Status | Hva finnes |
|---|---|---|
| CORE (Project Core) | Under arbeid | `src/core`: ID-er (UUID v7), modell, 18 kommandoer med invers, invariantkontroller, avledede visninger (manus = montering), endringssett |
| VERSION | Under arbeid | Blokkrevisjoner, kommandologg, `outdatedTakes` (grunnlag for avvik) |
| COLLAB | Under arbeid | Medlemskap, roller, invitasjoner (database + enkel UI), revisjonskontroll |
| SECURITY | Under arbeid | RLS (bare lesing), `apply_changes` bare for service_role, uforanderlige tabeller |
| TIMELINE | Under arbeid | Tidsmodell (heltall bilder, rasjonell fps), beregnede tidskoder i monteringsvisning |
| CONTINUITY | Under arbeid | Fortellingstid (`storyTimes`) med ankre for flashback m.m. |
| UI | Under arbeid | Mørkt tema-tokens, innlogging, prosjektliste, prosjektoversikt, databasevarsel |
| Øvrige moduler | Ikke startet | – |
