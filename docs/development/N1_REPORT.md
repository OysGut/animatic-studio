# N1 – tre gjeldsposter (natt 22.–23.10.2026)

Migrasjon `db/migrations/0088_n1_atomic_scene_ids_global_versions.sql` er skrevet og testet lokalt, men
**ikke kjørt i Cloud**. Claude kjører den. `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er 88, så
appen må ikke publiseres før 0088 er kjørt. Ingenting er publisert.

## 1. B-097: `scene_ids` i samme transaksjon
- `runCommand` regner ut scenene som før (`scenesOfChange`) og sender dem som toppnøkkelen `sceneIds` i
  `p_changes`, slik `blockRevisions` allerede sendes. Etterkallet som oppdaterte `change_log` er fjernet.
- `apply_changes` er kopiert ordrett fra 0084 (siste definisjon, grunnlag for Cloud-hash 8abd259a). Bare to ting
  er lagt til: variabelen `v_scene_ids` og lesing/validering av `sceneIds` rett før innsettingen i
  `change_log`, som nå også skriver `scene_ids`. Signaturen er uendret, så det finnes fortsatt bare én funksjon.
- Uten `sceneIds` blir `scene_ids` null, som før. Er `sceneIds` ikke en liste, har mer enn 1000 elementer eller
  inneholder en ugyldig ID, feiler hele kallet, og ingen loggrad lagres. Ellers oppfører funksjonen seg likt.
- Merk: en eldre Cloud-database (før 0088) ignorerer `sceneIds`. Da blir «Sist endret» stående på en eldre tid
  til 0088 er kjørt. Ingen data går tapt.

## 2. GP2–GP5: atomisk lagring av globale versjoner
Samme mønster som B-116, for alle tre veiene inn: ny fil fra nettleseren, «Lagre i globalt bibliotek» og
publisering av en prosjektversjon.
1. `global_reserve_version` (brukerens klient): redaktør i gruppen, bare gyldige gruppestier
   (`global/<gruppe>/<ressurs>/<sha256>.<ext>`). En nøkkel som allerede har en åpen reservasjon, avvises (P0409).
2. Opplasting (signert URL) eller kopiering på serveren, også avledede filer.
3. Serveren sjekker at alle reserverte filer finnes.
4. `global_commit_version` (brukerens klient): bare egen, åpen og ikke utløpt reservasjon. Hovedfilen er den
   første reserverte nøkkelen, og de avledede filene må være blant de reserverte. Kaller den uendrede
   `global_add_version`. Idempotent: samme reservasjon gir samme versjon.
- **Ved feil** henter serveren nøklene som er trygge å slette (ingen versjon og ingen annen åpen reservasjon
  bruker dem; filene er innholdsadressert og kan deles). Filene slettes først, så frigjøres reservasjonen.
  Er commit allerede gjort (tapt svar), slettes ingenting og versjonen returneres. Feiler slettingen, beholdes
  reservasjonen til sweepen. Logging skjer uten lagringsnøkler.
- Feiler opplastingen i nettleseren, kaller appen `abandonGlobalUpload`, som rydder på samme måte.
- **Sweep:** den bekreftede orphan-cleanup-jobben rydder også utløpte reservasjoner (TTL 15 min + 1 time) i
  prosjektets gruppe. Feil i sweepen stopper ikke resten av oppryddingen.
- **Avvik fra bestillingen:** filkontrollen gjøres av serveren rett før commit-RPC-en, ikke inne i RPC-en. Vi har
  regelen «ingen SQL mot storage», så databasen leser ikke lagringstabellene. Commit-RPC-en godtar bare nøkler
  fra reservasjonen. Si fra hvis kontrollen skal ligge i databasen.
- Globale filer ligger ikke under en prosjektmappe. Derfor er den nye tabellen ikke lagt i
  `ORPHAN_REFERENCE_TABLES`, som bare gjelder prosjektfiler.

## 3. B-116-etikett
`b116.kind.scene` heter nå «Scenebilde» (nb) og «Scene still» (en). De andre språkene er oppdatert med ny kildehash
og merket som maskinoversatt: de «Szenenbild», es «Imagen de escena», fr «Image de scène», it «Immagine della
scena», ja «シーンの静止画», ko «장면 스틸», pt-BR «Imagem da cena», ru «Кадр сцены». en-XA og inventaret er
laget på nytt.

## Funksjoner og objekter i 0088
Erstattet (kopi av 0084, bare `scene_ids` lagt til):
- `public.apply_changes(uuid, uuid, uuid, jsonb, jsonb, jsonb)`

Nye:
- Tabell `public.global_version_reservations` (RLS på, ingen policyer, bare service_role har tilgang)
- `public.global_reserve_version(uuid, text[])`: authenticated
- `public.global_commit_version(uuid, text, integer, integer, bigint, text, integer, text, jsonb, jsonb, jsonb)`: authenticated
- `public.global_reservation_safe_keys(uuid, uuid)`: bare service_role
- `public.global_cancel_reservation(uuid, uuid)`: bare service_role
- `public.stale_global_reservations(uuid)`: bare service_role
- `public.release_stale_global_reservation(uuid)`: bare service_role
- `schema_version` = 88

Uendret: `global_add_version` (0078), `delete_project`, `purge_*`.

## Tester
- tsc (`tsgo --noEmit`): 0 feil.
- Full Vitest: 2445 bestått, 10 hoppet over. Den eneste feilen i første kjøring (sweep-oppslaget i
  `r1r2-prores-cleanup`) er rettet: sweepen tåler nå feil. Berørte filer kjørt på nytt: grønne. Nye tester:
  `global-reservation.test.ts` (6) og `n1-scene-ids-atomic.test.ts` (2). `mt9-global-templates.test.ts` er
  tilpasset commit-RPC-en.
- DB lokalt (Postgres): 180 bestått, 0 feilet. Nye tester: scene_ids skrives atomisk, og feil gir ingen loggrad
  (ukjent tabell, ugyldig ID, feil form). Reservasjon og commit: rettigheter, stier, dobbel reservasjon,
  fremmed aktør, avledede filer som ikke er reservert, idempotens, trygge nøkler, utløp, sweep og at bare
  serveren kan rydde.
- i18n: check, validate og release-check er grønne.
- Visuelt: b116-showcase 37/37 på nb og 37/37 på en. Én engelsk kjøring feilet først på «utdragsfelt for manus»
  og bestod ved ny kjøring. Det er en ustabil test som ikke har med denne endringen å gjøre. global-library 29/29
  på en og 29/29 med standard språk. Med `UI_LANG=nb` tvunget feiler suitens egen engelske sjekk alltid.
  Det skjer fordi den tvungne innstillingen overstyrer scenarioets `lang: "en"`, og har ikke med denne endringen
  å gjøre. Ny sjekk: «N1 registreringen bruker reservasjonen».
- Ingen betalte AI- eller ElevenLabs-kall.

## Endrede filer
- `db/migrations/0088_n1_atomic_scene_ids_global_versions.sql` (ny)
- `src/adapters/storage/commands.functions.ts`, `src/adapters/storage/project-rows.ts`
- `src/adapters/global/global-reservation.server.ts` (ny), `src/adapters/global/global-library.functions.ts`
- `src/app/global/global-actions.ts`, `src/adapters/storage/orphan-cleanup.functions.ts`
- `src/core/i18n/authored.json`, `src/core/i18n/locales/*.json`, `src/core/i18n/runtime.gen.json`,
  `scripts/i18n/references.v1.json`, `candidates.v1.json`, `inventory-report.json`
- `tests/db/run-db-tests.ts`, `tests/unit/global-reservation.test.ts` (ny), `tests/unit/n1-scene-ids-atomic.test.ts` (ny),
  `tests/unit/mt9-global-templates.test.ts`, `tests/visual/global-library.mjs`, `tests/visual/schema-version.mjs`
- `AGENTS.md` (regel 53), `TODO.md`, `roadmap.md`, `docs/development/N1_REPORT.md`
