# Implementeringsstatus – Animatic Studio

Oppdatert: 2026-10-09 (økt 3, del 2). Detaljert status per krav: `docs/product/TRACEABILITY_MATRIX.md` (generert).

## Sammendrag
- **M0 Fundament:** ferdig.
- **M1 Skjelett og kjerne:** ferdig og kjørt i Lovable (migrasjon 0001, innlogging, prosjekt).
- **M2 Manus del 1:** levert og testet av Mars i Lovable (import, visning, redigering, eksport – også i Safari).
- **M2 Manus del 2:** kode og tester ferdig – manusversjoner og sammenligning, historisk nummerering, søk og karakterfilter, «Vis kun valgt scene» (REQ-0531), varighetsestimat på oversikten, tilstedeværelse. Venter på push og migrasjon 0003.
- **Krav:** 73 verifisert, 6 implementert – ikke verifisert, 24 under arbeid, 428 ikke startet (av 531).

## Tester (alle grønne 2026-10-09)
| Testsett | Antall | Kjøres med |
|---|---|---|
| Enhet, scenarier, kontrakt, eksport, nummerering, versjoner, filter, varighet, regresjoner (`tests/unit`, + 1 Lovable-test) | 78 | `bun run test` |
| Egenskapsbaserte invarianttester (`tests/invariants`) – 150 tilfeldige sekvenser × 40 kommandoer, 15 kommandotyper | 9 | `bun run test` |
| Gyldne tester mot referansemanuset (`tests/golden`) – hoppes over uten manusfilene | 6 | `bun run test` (lokalt hos Claude) |
| Arkitektur (`tests/architecture`) | 1 | `bun run test` |
| Database (`tests/db`) – RLS, revisjon, atomisitet, invitasjoner, uforanderlighet, import, profiler, unik plass | 20 | `bun tests/db/run-db-tests.ts` |
| Visuell QA (`tests/visual`) – 19 skjermbilder med mockede data, pluss import av ekte PDF i nettleseren | manuell vurdering | `node tests/visual/screens.mjs` |
| GitHub Actions | `knowledge-base.yml`, `tests.yml` (ny: typekontroll, Vitest, databasetester) | automatisk ved push |

## Målinger mot «Jula på Dovre» (norsk PDF, 106 sider)
- Import: 97 scener (96 nummererte, 1 unummerert), 2 193 blokker, 0 usikre elementer; engelsk DOCX gir samme struktur.
- Låste sider: 105 manussider og alle 97 scenestarter på samme side som originalen. Fri sidebryting: alle innen ±1 side, 63 eksakt.
- Eksportert PDF leses inn igjen med identiske scener, numre, tekst og sider. DOCX åpnet i LibreOffice: 105 sider manusformat.

## Moduler
| Modul | Status | Hva finnes |
|---|---|---|
| CORE | Under arbeid | Kommandoer med invers (25 typer), invarianter, visninger, endringssett |
| SCRIPT | Under arbeid | Tolkning PDF/DOCX, import, sidebryting, låste sider, nummerering, arbeidsflaten «Manus» |
| EXPORT | Under arbeid | Manus til PDF (sidetro) og DOCX (redigerbar) |
| VERSION | Under arbeid | Blokkrevisjoner, kommandologg, angre/gjør om per bruker, `outdatedTakes`. Manusversjoner gjenstår |
| COLLAB | Under arbeid | Medlemskap, roller, invitasjoner, profiler, sanntid, revisjonskontroll |
| SECURITY | Under arbeid | RLS, `apply_changes` bare for service_role, inverskommandoer bare fra egen historikk, privat bøtte for originaler |
| TIMELINE / CONTINUITY | Under arbeid | Tidsmodell, fortellingstid |
| UI | Under arbeid | Prosjekt, manus (navigator, sider, inspektør, import, eksport) |
| Øvrige moduler | Ikke startet | – |
