---
name: ptg-integration-qa
description: "Testing av Creative Connectors: kjernetester, API mot falsk lagring, SDK mot falsk server, OpenAPI-sjekk, DB-tester for 0109 og nettlesertest av Konto-siden. Ingen ekte eksterne kall. Bruk når en connector, plugin eller API-endring skal verifiseres."
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-integration-qa

## Kilder
- `tests/unit/c0-connectors.test.ts`, `tests/helpers/c0-memory-store.ts`, `tests/db/run-db-tests.ts` (0109), `tests/visual/c0-account.mjs`.
- DV4 nettverkssperre i testene (`tests/helpers/network-guard.ts`).

## Regler
1. Nye endepunkter: test autorisasjon (401/403), scope, prosjekt, idempotens og no-store.
2. Falsk lagring speiler RPC-reglene; endres en RPC, endres den falske lagringen og DB-testen samtidig.
3. Plugin-tester bruker SDK-en mot `handleApiV1` med falsk lagring, aldri produksjon.
4. Visuelt: nb og en, desktop og mobil.
