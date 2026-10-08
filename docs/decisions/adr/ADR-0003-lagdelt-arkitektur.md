# ADR-0003 – Lagdelt arkitektur med plattformnøytral domenekjerne
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0009 · **Type:** Teknisk anbefaling
- **Berørte krav:** mandat 1.2, 31, prinsipp 28 · **Moduler:** alle

## Kontekst
Mandatet krever separasjon mellom domene, UI, medie-/animasjonsmotor, AI, kø, lagring og eksport, og portabilitet til macOS/Windows.
## Beslutning
- `src/core/` – ren TypeScript: domenetyper, ID-er, kommandoer, invariantkontroller, tidsmodell, nummerering, manusparser, varighetsestimat, konsekvensanalyse. Ingen import fra React, TanStack, Supabase eller nettleser-API-er (håndheves av test/lint-regel).
- `src/engine/` – nettleserbaserte motorer (komposisjon/avspilling, lyd, eksport) bak grensesnitt definert i core.
- `src/adapters/` – lagring (Supabase), AI-leverandører, medietjeneste.
- `src/app/` (eller Lovables `src/routes`, `src/components`) – UI.
- Backend: Postgres-skjema + RLS + transaksjonelle RPC-er som speiler kommandoene; tunge jobber i kø + ekstern worker.
## Alternativer
Alt i komponentene (raskt, men bryter portabilitet og testbarhet).
## Konsekvenser
+ Invariantene kan testes uten nettleser og database. + Desktopversjon kan gjenbruke core. − Litt mer struktur enn en typisk Lovable-app; Lovables agent må instrueres (AGENTS.md).
## Verifisering
`tests/architecture/core-purity.test.ts` feiler hvis `src/core` importerer forbudte moduler.
