# ID-kartlegging – stabile identifikatorer (REQ-0037, REQ-0022, REQ-0518)

Dato: 2026-10-21 (V1, forarbeid til oppgave 3). **Bare kartlegging – ingen kode eller migrasjon er laget.**

## Metode
- Gått gjennom alle 86 tabeller i `db/migrations/0001–0068`: primærnøkler, kolonner med `number`, `position`, `seq`, `order_key`, `*_index`.
- Søkt i `src/core/` etter felt og funksjoner som peker med indeks, nummer, side eller posisjon (`*Index`, `*Number`, `lockedPage`, `words[i]`, `indexOf`).
- Vurdert hvert funn: er nummeret/posisjonen **identitet** (noe annet peker på det, eller det lagres), eller bare **visning/rekkefølge**?

## Hovedfunn
Alle lagrede domeneobjekter i databasen har en permanent `uuid`-ID. Scenenummer (`production_number`), versjonsnummer og `order_key` er visning eller rekkefølge og brukes ikke som referanse mellom tabeller (INV-02 holder i databasen). De seks tabellene med sammensatt primærnøkkel er koblingstabeller eller tellere, ikke domeneobjekter.

Avvikene ligger i **JSON-innhold og kjernelogikk**, der ting pekes på med plass i en liste.

## Funn som bør rettes

| # | Objekt | Hvor | Hva er problemet | Risiko | Forslag | Migrasjon |
|---|---|---|---|---|---|---|
| 1 | **Ord i ordkobling** (`AlignedWord`) | `src/core/audio/alignment.ts`, `pauses.ts` (`gapAfterWord(…, i)`), lagret i `dialogue_versions`/komposisjonens alignment-JSON | Et ord identifiseres av sin plass i `words[]`. Mellomrom, pauseredigering og manuelle rettinger peker på «ord nr. i». Endres replikkteksten, peker gamle rettinger på feil ord. I dag beskyttes dette bare ved at `text` lagres og sammenlignes. | Middels (B-041/DEC-0095/0096-redigeringer) | Gi hvert ord en `wordId` (uuid) ved første kobling; pauser og rettinger lagrer `afterWordId`. Gamle koblinger uten ID får ID-er utledet ved innlasting (deterministisk fra `blockId` + plass + tekst) og lagres ved neste skriving. | Nei (JSON-format med ny `format`-versjon og leser for gammel) |
| 2 | **Opphav «frilagt fra versjon N»** | `src/core/library/provenance.ts` (`fromNumber` tolket fra notatteksten) | Opphavet til et utsnitt/en erstatning finnes bare som versjonsnummer i fritekst. Nummeret er unikt i varianten, men koblingen er tekst, ikke ID. | Lav–middels | Ny nullable kolonne `asset_versions.derived_from_version_id uuid` (FK til `asset_versions`), fylt av kommandoene som lager utsnitt/erstatning. Notattolkingen beholdes som reserve for gamle rader. | **Ja, additiv** (`00NN_version_derivation.sql`, nullable kolonne, ingen tilbakefylling påkrevd; valgfri backfill fra notat + variant + nummer) |
| 3 | **Klipp- og delindeks i filmtidslinjen** | `src/core/assembly/time-levels.ts` (`clipIndex`, `partIndex`, `partToSource(clip, partIndex, …)`) | Tidsnivåomregning returnerer og tar imot plass i listen. Er beregnet og lagres ikke i dag, men et kall som husker `partIndex` over en endring vil peke på feil del. | Lav | Legg `partId` (finnes allerede på `clip_parts`) og `occurrenceId` i resultatet; `partToSource` tar `partId`. Behold indeksen bare som visning. | Nei |
| 4 | **Scenekobling ved import av oversatt manus** | `src/core/translation/index.ts` (`SceneLink.parsedIndex`) | Den importerte scenen identifiseres med plass i det tolkede manuset. Er midlertidig (importdialogen), men brukerens manuelle omkoblinger mistes eller forskyves hvis tolkingen kjøres på nytt. | Lav | Gi tolkede scener en midlertidig `parsedId` ved tolking og bruk den i koblingene; fortsatt ikke lagret. | Nei |
| 5 | **Forgreining i Story Lab** | `src/core/storylab/engine.ts` (`branchFrom { turnIndex }`) | Turene har egen `id`, men forgreining peker på tur nr. Brukes i dag bare i minnet (ikke lagret i handlingsloggen). | Lav | Bytt til `branchFrom { turnId }` (null = fra start). | Nei |
| 6 | **Låst side i manussidebrytingen** | `src/core/screenplay/paginate.ts` (`lockedPage`) | Låste sider (produksjonslåsing) identifiseres med sidenummer. Dette er bevisst (sidenummer er det låste), men låsen bør knyttes til manusversjonen. | Lav | Lagre låsen sammen med `script_version_id` og første blokk-ID på siden, så den kan kontrolleres etter endringer. | Mulig additiv kolonne/JSON-felt; avklares når sidelåsing bygges ferdig |

## Gjennomgått og i orden (ingen endring)
- **Scenenummer** (`scene_occurrences.production_number`, `sceneNumberOf`): bare visning; alle referanser bruker `occurrence_id`/`scene_id`/`variant_id`.
- **Versjonsnummer** (`asset_versions.number`, `global_asset_versions.number`, `script_versions.number`, `animation_rig_versions.number`): unike visningsnummer per forelder; alle tabeller har `id uuid` og refererer med den. Rekkefølge på tvers bruker `compareVersionCreation`.
- **Rekkefølgefelt** `order_key` (lag, blokker, klippdeler, rulletekst) og `position` (`harmonize_batch_items`, `dialogue_batch_items`): bare sortering, radene har egen ID.
- **`change_log.seq`**: global rekkefølge, ikke identitet.
- **Sammensatte primærnøkler**: `project_members`, `workspace_members`, `script_block_revisions (block_id, rev)`, `privacy_acceptances (user_id, version)`, `ai_spend (key_owner, month)`, `user_bookmarks (user_id, project_id)` – koblings- eller tellertabeller.
- **Linjekoblinger (B-050/ML3)**: blokk- og oversettelses-ID-er, scenebegrenset (AGENTS-regel 31).
- **Rulletekst/navneskilt**: nøkler `navn`/`rolle` er feltnavn i malen, ikke identitet for objekter.

## Forslag til rekkefølge
1. Funn 1 (ordkobling) – størst risiko, berører lydredigering i «Jula på Dovre».
2. Funn 2 (opphav) – eneste som trenger migrasjon; liten og additiv.
3. Funn 3–5 samlet i én runde (bare kjernekode og tester).
4. Funn 6 når sidelåsing tas opp.

Anslag: 2–3 runder, én additiv migrasjon. Krever ikke produktvalg fra Mars. Etter rettingen kan REQ-0037 og REQ-0518 vurderes for «Verifisert» med en invarianttest som stopper nye indeksreferanser i lagret JSON.
