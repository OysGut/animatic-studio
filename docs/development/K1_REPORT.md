# K-1 – Varsel når en annen redigerer samme scene

**Dato:** 22.10.2026 · **Grunnlag:** DEC-0010, REQ-0522/0526 · Ingen databaseendring (presence lagres ikke).

## Hva brukeren ser
- **Sceneeditoren:** rett under verktøylinjen står et diskret merke «Ada redigerer også denne scenen» når noen andre har samme sceneforekomst åpen. Flere navn settes sammen etter språket brukeren har valgt («Ada og Bo redigerer også …»).
- **Scenelisten (ScenePicker):** en liten prikk ved hver scene der noen andre står nå. Verktøytips og skjermlesertekst: «Andre i scenen nå: Ada».
- **Lagringskonflikt:** når en endring får `revision_conflict`, vises et varsel med «Sist endret av {navn}, {tid}» (fra `scene_last_changes`) og to valg: «Legg min endring oppå» og «Forkast min endring». Ingenting skjer før brukeren velger.

## Slik virker det
- `src/app/project/presence-view.ts`: rene funksjoner (`presenceByOccurrence`, `joinNames`, `alsoEditingText`).
- `use-commands.ts`: ny liste `conflicts` og `resolveConflict(id, "rebase" | "discard")`. «Legg oppå» venter til køen er tom, henter siste versjon og kjører samme kommando på nytt som en ny endring med de nye revisjonene (kan angres med Angre). «Forkast» fjerner bare varselet; siste versjon er allerede hentet av dagens flyt.
- Sceneeditoren bruker den eksisterende `usePresence` (samme kanal som manuset).

## Tester
- `tests/unit/k1-presence.test.tsx` (ny): 8/8 – gruppering, tekst for én/flere/ingen, merket, at ingenting sendes automatisk, forkast, legg oppå (samme kommando sendt på nytt og kan angres), varselets valg og «Sist endret av».
- `tests/visual/k1-presence.mjs` (ny): nb 16/16, `UI_LANG=en` 16/16. Den andre brukeren simuleres med en falsk sanntidskanal (Phoenix vsn 2.0.0) i Playwright; første fargeendring avvises med `revision_conflict`. `mts-harness.mjs` har fått en valgfri `hooks.context`.
- Typekontroll ren; i18n-sjekken grønn; full Vitest: se svaret.
- S-1: `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er satt til 86.

## Avvik
- «Dagens rebase» fantes bare for manuslinjer (`retryRejected`). For sceneeditoren er den gjort generell: samme kommando kjøres på nytt mot siste versjon etter brukerens valg. Hvis kommandoen ikke lenger passer (for eksempel at laget er slettet), vises feilen og varselet blir stående.
- Prikken er lagt i ScenePicker (scenelisten i sceneeditoren), ikke i `SceneSelect`, fordi sceneeditoren bruker ScenePicker. `SceneSelect` er uendret.

## Nye tekster (alle språk)
`k1.presence.one`, `k1.presence.many`, `k1.presence.dot`, `k1.conflict.aria`, `k1.conflict.title`, `k1.conflict.by`, `k1.conflict.by-unknown`, `k1.conflict.rebase`, `k1.conflict.discard`. nb og en skrevet selv; fr, es, ru, ja, pt-BR, de, it og ko er maskinoversatt (`review: "machine"`).
