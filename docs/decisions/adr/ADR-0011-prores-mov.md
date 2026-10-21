# ADR-0011 – ProRes/MOV-eksport i nettleseren
- **Status:** Gjeldende · **Dato:** 2026-10-20 · **Beslutning:** DEC-0085 · **Type:** Teknisk anbefaling
- **Berørte krav:** REQ-0863–0870 · **Moduler:** EXPORT, UI

## Beslutning
- ProRes 422 HQ (`apch`) for filmeksport og ProRes 4444 med 16-biters alfa (`ap4h`) for lageksport, i MOV.
- Koderen er vår egen TypeScript-implementasjon av den offentlige bitstrømmen (SMPTE RDD 36): DCT, fast kvantiserer, Rice/eksp-Golomb-koding og alfa-RLE. Den kjører i Web Workers (`src/engine/export/prores.worker.ts`) og lastes med dynamisk import først når ProRes velges.
- MOV skrives bare framover: hvert bilde og hver lydbit får sin egen `mdat`, og `moov` skrives til slutt. Filen kan derfor strømmes rett til OPFS gjennom samme sink som alfa-eksporten.
- Lyd i filmeksport: stereo PCM 16 bit 48 kHz (`sowt`), flettet per bilde. Lageksport uten lyd.
- Fargerom: Rec.709, begrenset område, merket både i ProRes-rammehodet og i `colr`/`nclc` (1/1/1).
- Grenser: uten OPFS høyst 1 GiB i minnet; med OPFS høyst 80 % av ledig lagring. Overskridelse gir tydelig melding, ingen stille fallback.

## Alternativer som ble vurdert
- **ffmpeg.wasm med prores_ks:** de ferdige `@ffmpeg/core`-byggene er GPL (x264/x265). Et eget LGPL-bygg måtte vedlikeholdes med Emscripten, gir ~25 MB nedlasting og krever egen lisensoppfølging. Forkastet.
- **WebCodecs:** ingen nettleser tilbyr ProRes-koding.

## Lisens
Ingen tredjepartskode i koderen; appens lisens gjelder. ProRes er et Apple-format; vi skriver standardfiler som leses av Apple-, Adobe-, DaVinci- og FFmpeg-programmer.

## Verifisering
`tests/unit/prores-mov.test.ts` (FourCC, bildefrekvens, mål, Rec.709, PCM, alfa 0 i hjørnet ved dekoding av alfaplanet) og `tests/visual/p7-prores.mjs` (nedlastet fil kontrolleres med ffprobe/ffmpeg når de finnes).
