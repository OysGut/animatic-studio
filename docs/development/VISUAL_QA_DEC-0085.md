# Visuell kontroll – DEC-0085 (AI-video av scenen, utvidet)

Dato: 2026-10-15. Skript: `tests/visual/scene-video-ui.mjs` (mocker Supabase, lagringen og serverfunksjonene; ingenting betales).
Kjøres som de andre: kopier til Playwright-mappen og kjør
`ENV_FILE=…/.env node scene-video-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe`.

## Kontroller (39 av 39 bestått)
- h01: knappen «AI-video …»; dialogen med «Scenen vises som», kildevalg, modell med pris (USD og Runway-kreditter), «Send scenens lyd med» (av som standard), «Undertekster sendes aldri», global beskrivelse (på som standard), scenebeskrivelse fra manuset, referanseliste og beskrivelsen som sendes. Prisen må bekreftes; jobben sendes med video, referansebilder og lydvalg.
- h02: en video under arbeid vises som versjon («Lages … 0 av 2 ferdig»).
- h03: dialogen på engelsk.
- h04: statusen øverst i toppfeltet viser jobbene og lenker til scenen; valget «Vis valgt versjon» i visningsvalgene.
- h05: «Rediger …» på den globale beskrivelsen viser «Endres globalt for hele prosjektet».
- h06: nedlastingsvinduet har valg av format (MP4/WebM) og undertekster (brent inn, SRT, VTT, ingen).

## Andre kontroller
- `tests/unit/scene-to-video.test.ts` (21 tester): referanseplan og samleark, scenebeskrivelse fra manuset, redigert global beskrivelse i prompten, kilde (2D/bunt/opptak), prompt med og uten global tekst og lyd, `image_urls` og `keep_audio` til fal.ai.
- `tests/visual/export-e2e.mjs`: videofil > 0 byte, uten konsollfeil.
- Øvrige nettlesertester uendret grønne: verifisering3 73/73, verifisering4 58/58, interactions 44/44, funn-0079 og funn-0080.
- Ikke prøvd med ekte nøkler (KI-213).
