# Tilstand og kommandoer

Grunnlag: ADR-0005 (kommandologg), ADR-0004 (revisjon, angre per bruker), ARCHITECTURE §4 (dataflyt), INV-01, INV-C1, REQ-0410, REQ-0526, REQ-0527.

## 1. Tre slags tilstand
| Type | Eksempler | Hvor | Sannhet |
|---|---|---|---|
| **Server-tilstand** | sceneforekomster, varianter, blokker, takes, ressurser, medlemmer | Cache i klient (TanStack Query hvis installert, ellers egen store) | Databasen |
| **Lokal redigeringstilstand** | utkast i en blokk før commit, markering, avspillingshode, zoom, åpne paneler, ViewFilter | Komponent/arbeidsflate-store | Klienten (ikke kritisk; ViewFilter lagres per bruker) |
| **Kommandoer** | `MoveOccurrence`, `EditBlockText`, `SetActiveTake` | `src/core/commands` + serverfunksjonen `runCommand` | Bekreftes av serveren (kjernen + `apply_changes`), logges i `change_log` |

Avledede verdier (tidskoder, varighet, nummerering, paginering, gjeldende kontinuitetstilstand) **lagres ikke** i state – de beregnes med rene funksjoner fra server-tilstand og memoiseres.

## 2. Kommandoflyt
```
UI-hendelse
  → core.validate(state, cmd)            // rask tilbakemelding, invarianter
  → optimistisk: state' = core.apply(state, cmd)   (merket «venter»)
  → runCommand({ projectId, command, baseRevisions })  // serverfunksjon (DEC-0022): rolle → applyCommand i core → diffStates → apply_changes, én transaksjon
      ok: true               → { changeId, affected }: hent/invalider berørte objekter (nye revisjoner)
      revision_conflict      → rull tilbake, hent ferske objekter, vis konflikt (aldri stille overskriving)
      forbidden              → rull tilbake, vis rollemelding
      kjernefeil (invalid, not_found, invariant_violation …) → rull tilbake, vis norsk melding
      storage_error/nettverk → rull tilbake eller behold «venter»; hent fersk tilstand før nytt forsøk
  → Realtime fra andre klienter → invalider/hent berørte objekter
```
- Klienten sender `command` (med `type` og felter) og `baseRevisions`. Kommando-ID (= `change_log.id`), aktør og tidspunkt settes av serveren; `inverse` beregnes av kjernen på serveren. Fordi ID-en lages per kall, er et blindt nytt forsøk **ikke** idempotent – hent fersk tilstand først (revisjonskontrollen avviser dobbel anvendelse av samme endring når `baseRevisions` er satt).
- Strukturkommandoer endrer **én** liste (sceneforekomster). Manusvisning og tidslinje er selektorer over den (INV-01). Tidslinjekomponenten har aldri egen rekkefølge.

## 3. Angre og gjør om (per bruker)
- Angrestabel = liste av brukerens egne bekreftede kommando-ID-er i denne økten (+ kan hentes fra `change_log`).
- Angre = send inversen som ny kommando med gjeldende revisjoner. Er objektet endret av andre siden, gir `runCommand` `revision_conflict` → vis valg i stedet for å overskrive (ADR-0005 selektiv tilbakeføring).
- Gjør om = send original kommando på nytt med ny ID.

## 4. Redigering av tekst
- Skriving i en blokk er lokal utkasttilstand; commit som `EditBlockText` ved pause (debounce), fokus ut eller Enter – ikke per tastetrykk.
- Ved Realtime-endring av samme blokk mens brukeren skriver: behold utkastet, vis at blokken er endret av en annen, og la brukeren velge (ingen stille sammenslåing i MVP; CRDT er utsatt, ADR-0004).
- Presence (hvem er i hvilken scene) er flyktig og lagres ikke.

## 5. Store-valg
- Bruk det som allerede er i `package.json`. Finnes ingen: en liten store bygget på `useSyncExternalStore` rundt en ren core-tilstand er nok, og holder core rammeverksuavhengig.
- Abonner med selektorer (en tidslinjerad abonnerer bare på sin forekomst). Sammenlign med strukturell likhet eller revisjon.
- Ingen global «app-state» som alle komponenter re-rendres av.

## 6. Data i nettleseren (REQ-0410)
- Lokal cache (IndexedDB/localStorage) bare som hurtigbuffer eller utkast som kan gjenopprettes. Alt som skal bevares, går til backend.
- Ventende kommandoer som ikke er bekreftet, vises tydelig; ved lukking av fanen varsles brukeren.
