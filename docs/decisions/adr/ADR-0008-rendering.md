# ADR-0008 – Avspilling, rendering og eksport
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0014 · **Type:** Teknisk anbefaling
- **Berørte krav:** kap. 11, 12, 14, 15, 20, 29, INV-11 · **Moduler:** COMPOSE, CAMERA, AUDIO, EXPORT, QUEUE

## Beslutning
- Én deterministisk rendringsfunksjon i core: `renderFrame(sceneState, frame) → draw list` (lag, transformasjoner, kamera). Brukes av både forhåndsvisning (Canvas2D/WebGL) og eksport, slik at det du ser er det du får.
- Lyd: Web Audio for avspilling; offline-miksing (OfflineAudioContext) for eksport.
- Eksport av animatics i nettleseren: WebCodecs (H.264/AAC) + MP4-muxer. Fallback: bildesekvens + WAV.
- Tung rendering (lang film, omkoding av importerte klipp, AI-segmentsammensetting): jobb i `render_jobs`-tabell, utført av ekstern worker (container med FFmpeg) som skriver til Storage og oppdaterer status. Kobles på i fase 4–5. Lovable/Cloudflare-funksjoner brukes ikke til mediebehandling (minne/tid).
- Ingen del av animatic-kjeden kaller AI eller betalte API-er.
## Verifisering
Visuelle regresjonstester (Playwright-skjermbilder av renderFrame), eksporttest som verifiserer varighet og bildeantall.
