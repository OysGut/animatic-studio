# ADR-0009 – Domenekjernen på serveren og atomiske endringssett
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0022 · **Type:** Teknisk anbefaling
- **Erstatter:** skriveveien i ADR-0004/ADR-0005 (per-kommando SQL)
- **Berørte krav:** REQ-0029–0043 (transaksjonell konsistens, kap. 3.4), REQ-0520–0529, INV-C1, INV-C2 · **Moduler:** CORE, VERSION, SECURITY, COLLAB

## Kontekst
Domenelogikken (kommandoer, invarianter) ligger i `src/core` (ADR-0003). Å gjenta den i SQL gir to kilder til sannhet. Lovable Cloud kjører ikke migrasjoner fra Git og bruker Drizzle for sine egne.

## Beslutning
```
Klient ──runCommand(projectId, command, baseRevisions?, commandId?)──▶ Serverfunksjon (TanStack Start)
   requireSupabaseAuth → rolle ≥ editor → loadProjectState (admin) → applyCommand (src/core) → diffStates
   ──rpc apply_changes(project, actor, commandId, command, inverse, changes)──▶ Postgres (service_role)
   rolle-sjekk · prosjekt-sjekk · inserts/updates/deletes i FK-rekkefølge · revisjon per rad (P0409) · change_log
```
- Rader: radformatet i `src/core/patch.ts` (`toRow`/`stateFromRows`) er lagringskontrakten.
- Takes: trigger hindrer sletting/overskriving (INV-07). `script_block_revisions` og `change_log`: uforanderlige (INV-13).
- Sykliske fremmednøkler (forekomst ↔ aktiv take) og unik rekkefølge per produksjon er utsatt til slutten av transaksjonen.
- Migrasjoner: `db/migrations/NNNN_navn.sql`, kjøres uendret via Lovable. `schema_version` sjekkes av appen.

## Konsekvenser
+ Én implementering av domenereglene; portabel (desktop kan kalle samme kjerne mot lokal database).
+ Databasen håndhever likevel det viktigste uavhengig av koden (tilgang, revisjon, uforanderlighet).
− Full prosjektlasting per kommando (optimaliseres med delvis lasting senere, KI-12).
− Lovable må kjøre hver ny migrasjon (synkmelding).

## Verifisering
`bun tests/db/run-db-tests.ts` (RLS-rollematrise, revisjonskonflikt, atomisk tilbakerulling, invitasjoner, uforanderlighet, rundtur kjerne↔database). Egenskapsbaserte tester i `tests/invariants/`.
