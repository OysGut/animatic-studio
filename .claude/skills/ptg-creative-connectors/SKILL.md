---
name: ptg-creative-connectors
description: "Arkitekturen for Creative Connectors (C-0): Manifest v1, API v1 under /api/v1, connector-tabellene i 0109, kandidatversjoner, konflikter, kapabilitetsmodell og Connector SDK i packages/ptg-connector-sdk. Bruk ved enhver ny plugin, adapter, endepunkt eller endring i overføringsflyten."
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-creative-connectors

## Kilder
- `src/core/connectors/*` (ren kjerne), `src/adapters/connectors/api-v1.ts`, `docs/api/openapi-v1.json`, `docs/development/C0_REPORT.md`.
- OpenAPI 3.1 (https://spec.openapis.org/oas/v3.1.0), RFC 9110 (HTTP-semantikk), IETF draft «The Idempotency-Key HTTP Header Field».

## Regler
1. Alle plugins bruker SDK-en; ingen egen HTTP-klient eller tokenhåndtering.
2. Mottatt fil → alltid ny kandidatversjon (`AddAssetVersion`). Aldri `ApproveAssetVersion` fra serveren eller pluginen.
3. Konflikt når revisjonsgrunnlaget ikke er godkjent versjon; brukeren velger behold begge / behold gjeldende / bruk innkommende / avvis. Ingenting slettes.
4. Nytt endepunkt: oppdater OpenAPI, handler og testen «alle ruter er beskrevet» i samme endring.
5. Ukjente manifestfelt bevares; hemmeligheter avvises av validatoren.
6. Adapterens kapabiliteter (`ADAPTERS`) styrer UI; mangler en kapabilitet, vis «Eksporter for …».
