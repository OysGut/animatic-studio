# @pentoglass/connector-sdk (C-0)

Felles TypeScript-SDK for alle From Pen to Glass-plugins. Plattformnøytral (ingen React, ingen DOM-krav):
verten gir inn `fetch`, tilfeldige byte og et sikkert tokenlager.

- Innlogging: OAuth 2.0 Authorization Code med PKCE (S256) via `/koble`, eller enhetsflyt (`deviceLogin`).
- Kortlivede tilgangstokens (15 min) per prosjekt og scope, roterte refresh-tokens; gjenbruk trekker tilbake sesjonen.
- `manifest()` validerer Manifest v1 med samme validator som serveren.
- `upload()` er gjenopptakbar (8 MB-biter, mangler hentes fra serveren) og idempotent (`Idempotency-Key`).
- Mottatte filer blir alltid nye kandidatversjoner; `conflictId` betyr at brukeren må velge i appen.
- Ingen hemmeligheter i plugin-koden. Klient-ID er offentlig.

API-beskrivelse: `docs/api/openapi-v1.json`.
