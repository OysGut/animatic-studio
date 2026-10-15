# Visuell kontroll – DEC-0083 (AI-video av scenen fra sceneeditoren)

Dato: 2026-10-15. Skript: `tests/visual/scene-video-ui.mjs` (mocker Supabase, lagringen og serverfunksjonene; ingenting betales).
Kjøres som de andre: kopier til Playwright-mappen og kjør
`ENV_FILE=…/.env node scene-video-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe`.

## Kontroller (18 av 18 bestått)
- h01: knappen «AI-video …» står i verktøylinjen; dialogen viser hva scenen vises som (2D-scenen), Kling O3 Edit og Aleph 2, figurene, anslått pris og beskrivelsen (2D-scenen som `@Video1`, instruksene med). Prisen må bekreftes. Etter «Ja, lag videoen» lages 2D-scenen som MP4 i nettleseren, lastes opp til `ai-source/`, og jobben sendes med video, bunt og bit til Kling O3 Edit.
- h02: en video fra 2D-scenen under arbeid vises som versjon («Lages … 0 av 2 ferdig»).
- h03: dialogen på engelsk.

## Andre kontroller
- `tests/unit/scene-to-video.test.ts` (14 tester): modellene, biter, figurer, beskrivelse for Kling og Aleph (1000 tegn), 2D-scenen sendes selv om en annen versjon vises, instruksene, bunter satt sammen i scenen, forespørslene til fal.ai og Runway.
- `tests/db/run-db-tests.ts`: 0032 instrukser til AI-video (60/60).
- Øvrige nettlesertester uendret grønne: verifisering3 73/73, verifisering4 58/58, interactions 44/44, funn-0079 og funn-0080.
