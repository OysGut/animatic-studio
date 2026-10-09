# Veikart – Animatic Studio

Status: Teknisk anbefaling, bygger på mandat kap. 32 og 35 og DEC-0005 (Claude bygger alt; Lovable kjører).
Kravtall per fase hentes fra `requirements.yaml` (`phase`). Kjør `python3 .claude/skills/requirements-traceability/scripts/coverage_report.py --phase N` for liste.

**Justering av kap. 32 (Teknisk anbefaling):** Datamodellen for *hele* strukturen – sceneforekomst, scenevariant, segment, take, fortellingstid, språkversjon, medlemskap og kommandologg – etableres i M1, selv om brukergrensesnittet for spinoffer, kontinuitet og språk kommer senere. Det oppfyller mandatets krav om at fundamentet skal tåle videreutvikling uten omskriving.

Hver milepæl avsluttes med milepælsrevisjon (`requirements-traceability/references/MILESTONE_AUDIT.md`) og en leveranse til Mars (Commit/Push + ev. synkmelding).

| Milepæl | Innhold | Krav (fase) | Skills | Moduler | Tester som kreves | Hovedrisiko |
|---|---|---|---|---|---|---|
| **M0 Fundament** ✅ | Mandat, kravregister (530), sporbarhet, beslutninger, arkitektur, 12 P0-skills, kontrollskript, CI | Prosess (40) | alle P0 | PROCESS | `check_kb.py` grønn | – |
| **M1 Skjelett og kjerne** 🟡 (kode ferdig 2026-10-08; venter på første kjøring i Lovable) | Klone Lovable-repo, verifisere stack, flytte inn fundamentet. `src/core`: ID-er, modell, kommandoer + inverse, invariantkontroller, tidsmodell. Skjema v1 (`db/migrations/0001_core.sql`) + RLS + `runCommand`/`apply_changes` (DEC-0022) + `schema_version`. Innlogging, prosjekt, medlemskap. Vitest/Playwright/CI. Første Lovable-synktest. | Fase 1 (70: 42 P0) + REQ-0520, 0524–0526 | specification-guardian, architecture-guardian, database-domain-modeling, scene-sync-invariants, test-quality-engineering, secure-development, lovable-development, react-typescript-engineering | CORE, VERSION, SECURITY, COLLAB, TIMELINE (tidsmodell) | INV-01/02/03/13/14/C1 (egenskapsbasert), RLS-rollematrise, core-renhet | Lovable-stack (SSR), migrasjoner via synkmelding |
| **M2 Manus og oversikt** (del 1 levert 2026-10-09: import, visning, redigering, angre, eksport; del 2: versjoner/diff, søk, varighet, tilstedeværelse) | Import av referansemanus (PDF + DOCX), scenedeteksjon med usikkerhet, originaltro manusvisning og paginering, redigering via kommandoer, angre/gjør om, manusversjoner og diff, eksport (DOCX/PDF) med nummereringsvalg, enkel produksjonsoversikt, varighetsestimat, invitasjoner og roller i UI, tilstedeværelse | Fase 2 (84: 17 P0) + REQ-0521–0523, 0527, 0529 | screenplay-engineering, ux-interaction-design, design-system-director + M1-skills | SCRIPT, EXPORT, UI, COLLAB | Gyldne importtester (lokalt mot referansemanus + fixtures), pagineringstester, eksport rundtur, nummerering, visuell QA, e2e for invitasjon | Paginering lik Final Draft; PDF-tolkning |
| **M3 Ressurser og 2D-sceneeditor** (levert 2026-10-09: ressursbibliotek, sceneeditor med lag, kamera, nøkkelbilder, tidslinje og avspilling) | Ressursbibliotek (karakterer, objekter, lokasjoner, stilprofil enkel), versjoner og aliaser, lagbasert komposisjon, transformasjoner, keyframes/easing, kamera med blå/rød ramme og Bézier-baner, lokal avspilling | Fase 3 (48: 8 P0) | design-system-director, ux-interaction-design, react-typescript-engineering, test-quality-engineering | LIBRARY, COMPOSE, CAMERA | renderFrame-enhetstester, visuelle regresjonstester, INV-13, interaksjonstester (drag, håndtak) | Ytelse i canvas; karakteranimasjonsnivå (Q-03) |
| **M4 Tidslinje, lyd og montering** (del 1 levert 2026-10-09: filmtidslinje, avspilling av hele filmen, eksport av animatic uten lyd – DEC-0043; del 2: lyd, importert film, «Bruk denne», overganger, tidskoblinger) | Filmtidslinje (= sceneforekomster), trim/splitt/overganger, lydspor og dialogkoblinger, toveis manus↔film-navigasjon, filmimport med metadata, delvis ferdige scener, aktiv versjon «Bruk denne», animatic-eksport i nettleser, prosjektbackup | Fase 4 (68: 14 P0) | scene-sync-invariants, ux-interaction-design, test-quality-engineering | TIMELINE, AUDIO, EXPORT | INV-01/07/11, tidskodeberegning, eksport (varighet/bildeantall), e2e toveis navigasjon | WebCodecs-støtte; store mediefiler |
| **M5 AI og renderingskø** | Adaptermodell, promptmotor (synlig/redigerbar), kostnadsestimat og -port, budsjetter, kø med vedvarende jobber, segmentering, medietjeneste (FFmpeg) | Fase 5 (70: 23 P0) | + secure-development (nøkler), egne D4-skills opprettes | PROMPT, PROVIDER, QUALITYCOST, QUEUE | INV-10/12, kostnadsport i backend, gjenopptakelse, feilhåndtering | **Kostnader – krever Mars' godkjenning** (leverandører, medietjeneste) |
| **M6 Produksjonskontroll** | Avviksdeteksjon og tre valg, konsekvensanalyse, karakterkontinuitet (Maja-scenario, flashback), narrativ kontinuitetsanalyse | Fase 6 (48: 16 P0) | scene-sync-invariants + D1/D2-skills | VERSION, CONTINUITY | INV-07/08/09 | Presisjon i konsekvensanalyse |
| **M7 Språk og spinoffer** | Engelsk manus og kobling, språkspor, undertekster, timingkonflikter, spinoffer, lokale varianter, utdrag, tilbakeføring | Fase 7 (63: 13 P0) | + D3-skills (multilingual-localization, production-branching) | L10N, CORE, VERSION | INV-04/05/06, spinoff-isolasjon | Koblingskvalitet engelsk↔norsk |
| **M8 Presentasjon og kvalitet** | Kinopitch-plakat, karakterkart, relasjonskart, stilharmonisering og publisering, avanserte kvalitetsprofiler, trykkeksport | Fase 8 (39: 4 P0) | + D5-skills | PRESENT, LIBRARY, EXPORT | Trykk-PDF-validering, visuell QA | Trykkspesifikasjoner (Q-04) |

## Fagskills (del D) – opprettes ved behov
| Skill | Opprettes i |
|---|---|
| screenplay-version-control, duration-estimation | M2 |
| multiplane-2d-engine, camera-motion-editor, asset-style-consistency (grunnlag) | M3 |
| editorial-timeline, audio-dialogue-engine, media-pipeline | M4 |
| ai-provider-adapters, generation-prompt-engineering, render-queue-orchestration, ai-cost-quality-governance | M5 |
| narrative-continuity-analysis, character-continuity | M6 |
| multilingual-localization, production-branching | M7 |
| cinematic-poster-design, print-prepress-export | M8 |
| Støtte: git-version-control, documentation-maintenance, skill-library-maintenance | M1 |
| Støtte: accessibility-audit, performance-profiling | M2–M3 |
| Støtte: release-readiness | før første demo for Trollfilm |
