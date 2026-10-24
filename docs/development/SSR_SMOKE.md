# SSR-røyktest og krasjet 24.10

## Funn
Produksjonsbygget ga 500 på alle sider: `TypeError: ASSET_MIME_TYPES is not iterable`. Produksjonsbundlen slår sammen app- og kjernemoduler med en sirkulær avhengighet, og `src/app/library/asset-images.ts` regnet ut `IMAGE_ACCEPT = [...ASSET_MIME_TYPES, …]` da modulen ble lastet, før `ASSET_MIME_TYPES` (`src/core/commands/apply.ts`) var initialisert. Utviklingsserveren laster modulene i en annen rekkefølge og viste ikke feilen.

## Retting
- `IMAGE_ACCEPT` → `imageAccept()` (brukt i `LayerImageDialog.tsx` og `AssetDetail.tsx`).
- Samme mønster rettet fire andre steder (verdier fra `@/core` lest ved lasting):
  - `src/app/rig/contour-client.ts`: `new LruCache(...)` lages ved første bruk;
  - `src/engine/export/mov.ts`: `COMPRESSOR = PRORES_NAME` fjernet; oppslaget skjer direkte i funksjonen;
  - `src/adapters/ai/image-prompts.server.ts`: zod-skjemaet (`VERSION_VIEWS`, `MAX_ATTACHED_IMAGES_ANY`) bygges ved første `parse`/`safeParse`;
  - `src/adapters/connectors/api-v1.ts`: ubrukt `CODE_TTL = CODE_TTL_SECONDS` fjernet.
- Selve sirkelen (app ↔ core via `@/core`-indeksen) er ikke brutt; den går gjennom mange moduler, og å dele opp indeksen ville bety en stor omlegging utenfor oppdraget. I stedet hindrer en arkitekturtest at noen leser slike verdier når modulen lastes. Da spiller ikke rekkefølgen noen rolle.

## Vern
1. **Arkitekturtest** `tests/architecture/core-module-init.test.ts` (del av vanlig Vitest): leser toppnivåkoden i `src/app`, `src/engine`, `src/adapters`, `src/routes`, `src/components`, `src/lib` og `src/hooks`, og feiler hvis den bruker en verdi importert fra `@/core` som ikke er en heist `export function` (const, class og let kan være uinitialisert). Bruk i funksjonskropper er tillatt.
2. **Røyktest** `npm run test:ssr` (`scripts/ssr-smoke.mjs`): kjører `vite build`, starter serverbygget med `wrangler dev` (lokal wrangler hvis den finnes, ellers en midlertidig via npx utenfor prosjektet) og henter `/`, `/nb`, `/konto`, `/koble` og to prosjektruter uten innlogging. Feiler ved status ≥ 500, ved «The page could not be shown» eller `"unhandled":true` i svaret, eller ved TypeError/ReferenceError i serverloggen. `SSR_SKIP_BUILD=1` bruker eksisterende bygg; `SSR_PORT` velger port (standard 8799).

## Kontroll
- Røyktest etter rettingen: 6 bestått, 0 feilet (`/nb` gir 404, som er riktig: ruten finnes ikke).
- Feilen gjeninnført med vilje (én linje `[...ASSET_MIME_TYPES]` på toppnivå): røyktesten gav 6 feilet med 500, og ble deretter tilbakestilt.
- Røyktesten krever nett første gang (npx henter wrangler) og er ikke en del av `vitest run`.
