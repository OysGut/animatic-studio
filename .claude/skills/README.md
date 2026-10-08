# Skill-bibliotek – Animatic Studio

Prosjektspesifikke skills etter Agent Skills-spesifikasjonen (`name` = mappenavn, `description` ≤ 1024 tegn). De lærer en arbeidsmetode og viser til de autoritative dokumentene. De lager **aldri** egne produktkrav (CLAUDE.md, DEC-0016).
Formatet kontrolleres av `python3 scripts/kb/check_kb.py`. Vurdering av eksterne skills: `docs/references/technical/SKILLS_ASSESSMENT.md`. Retningslinjer: `docs/development/EXTERNAL_SKILLS_POLICY.md`.

## P0 – etablert (v0.2.0, 2026-10-08)

| Skill | Brukes når | Typisk sammen med |
|---|---|---|
| `specification-guardian` | **Alltid** før ny funksjon, endring, refaktorering, forenkling eller arkitekturvalg; når Mars tar en ny beslutning | requirements-traceability |
| `requirements-traceability` | Krav legges til/endres, status oppdateres, tester knyttes til krav, milepælsrevisjon | alle |
| `architecture-guardian` | Ny modul, tabell, migrasjon, kommando, RPC, adapter; «hvordan skal X lagres/kobles»; endringer som berører flere moduler; mistanke om strukturell gjeld | database-domain-modeling |
| `scene-sync-invariants` | Alt som berører rekkefølge, aktivering, identitet, tidskoblinger, montering, spinoffer, segmenter, replikk-/oversettelsesendringer, samtidig redigering (INV-C1), kontinuitet | test-quality-engineering |
| `database-domain-modeling` | Skjema, migrasjoner (`db/migrations/`), RLS, `apply_changes` og klient-RPC-er, versjonstabeller | secure-development |
| `screenplay-engineering` | Manusimport (PDF/DOCX), scenedeteksjon, visning, paginering, nummerering, eksport | scene-sync-invariants |
| `react-typescript-engineering` | All frontend- og domenekode i TypeScript/React | test-quality-engineering |
| `test-quality-engineering` | Teststrategi, nye tester, «er dette ferdig?» | requirements-traceability |
| `design-system-director` | Visuell utforming, tokens, komponenter, visuell QA | ux-interaction-design |
| `ux-interaction-design` | Arbeidsflyter, tidslinje, drag-and-drop, snarveier, angre/gjør om, feiltilstander | design-system-director |
| `lovable-development` | Kompatibilitet med Lovable, synk GitHub↔Lovable, migrasjoner/deploy via Lovable, meldinger til Lovable | secure-development |
| `secure-development` | Nøkler, tilgang (skriving bare via `runCommand` → `apply_changes`, DEC-0022), filimport, lagring, avhengigheter, logging, eksterne plugins; kostnadsporten (INV-12/INV-C3) inntil `ai-cost-quality-governance` finnes (M5, DEC-0020) | database-domain-modeling |

## Planlagt (opprettes ved behov – se `docs/development/ROADMAP.md`)
Fagskills (del D): screenplay-version-control, narrative-continuity-analysis, duration-estimation, production-branching, multiplane-2d-engine, camera-motion-editor, character-continuity, asset-style-consistency, editorial-timeline, audio-dialogue-engine, media-pipeline, multilingual-localization, ai-provider-adapters, generation-prompt-engineering, render-queue-orchestration, ai-cost-quality-governance, cinematic-poster-design, print-prepress-export.
Støtte (del E): git-version-control, documentation-maintenance, performance-profiling, accessibility-audit, release-readiness, skill-library-maintenance.

## Vedlikehold av skills
1. Endringer i en skill: øk `metadata.version`, oppdater `last-reviewed`, kjør `check_kb.py`.
2. Test mot scenariene i `docs/development/SKILL_TEST_SCENARIOS.md` når en skill endres vesentlig; resultat i `SKILL_TEST_REPORT.md`.
3. En skill som motsier mandatet eller en beslutning er en feil i skillen – rett skillen, ikke kravet.
