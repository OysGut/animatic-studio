# src/core – plattformnøytral domenekjerne (ADR-0003)

Ren TypeScript. **Ingen** import fra React, TanStack, Supabase, `@/integrations`, nettleser- eller Node-spesifikke API-er
(unntak: standard `crypto.getRandomValues`). Håndheves av `tests/architecture/core-purity.test.ts`.

- `ids.ts` – permanente ID-er (UUID v7). Scenenummer er aldri identitet (INV-02).
- `time.ts` – rasjonell bildefrekvens og heltall bilder (ADR-0006).
- `order-key.ts` – fraksjonelle sorteringsnøkler for rekkefølge uten omnummerering.
- `model.ts` – prosjekttilstand (speiler databasen, DATA_RELATIONSHIPS.md).
- `commands/` – kommandoer med validering, revisjonskontroll og invers (ADR-0005).
- `views.ts` – avledede visninger: aktivt manus og filmmontering fra SAMME liste (INV-01), fortellingstid (DEC-0020 pkt. 6).
- `invariants.ts` – kontroller av INV-01–INV-14 som kan sjekkes strukturelt.
- `patch.ts` – differanse mellom to tilstander → endringssett som backend lagrer atomisk (DEC-0022).
