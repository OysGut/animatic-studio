# ID3 – stabile ID-er (REQ-0037, REQ-0022, REQ-0518)

Bygger på `docs/development/ID_AUDIT.md`. Plassen og nummeret brukes nå bare til visning. Identiteten er alltid en permanent ID.

## Endret per sted

| Sted | Før | Nå | Eldre data |
|---|---|---|---|
| Ord i ordkoblinger | Pauser pekte på `afterWord` (plass i ordlisten) | Ordene har `id` (`assignWordIds`), og pausen har `afterWordId`. Ny analyse og tekstendring beholder ID-en til uendrede ord (samme LCS som `textChanges`) | Ord uten ID får `w<plass>` ved lesing, og pauser uten ID bruker den samme verdien. Pausen får ID først når brukeren lagrer en ny versjon. Pauser der ordet er borte, flagges i pausepanelet (`pause-unresolved`) og brukes ikke |
| Versjonsopphav | Nummeret i merknaden («Frilagt fra v2») | `derivedFromVersionId` (migrasjon 0069). Frilegging og ny opplasting lagrer kilden. Nummeret som vises, er kildens nåværende nummer | Merknadsnummeret slås opp i samme variant ved lesing. Ingen treff eller flere treff gir ukjent kilde og et flagg («kildeversjonen kan ikke bestemmes sikkert»). Merknaden skrives aldri om |
| Klipp- og delindekser | `partIndex` var nøkkelen i `partToSource`/`partToScene`/`levelsToFilm` | `partId` (`partKey` = lagret del-ID, eller `whole:<forekomst>` når scenen ikke har deler). `partIndex`/`clipIndex` er bare til visning | Ingenting lagres (bare beregnet) |
| Scener ved manusimport | `SceneLink.parsedIndex` | `identifyParsedScenes` gir hver scene en midlertidig ID, og koblingene har `parsedId`. AI-forespørselen bruker fortsatt plassen som etikett, men svaret oversettes straks til ID | En kobling uten ID oversettes én gang fra plass til ID |
| Story Lab-forgreining | `fromTurn`/`turnIndex` (plass, også i klientens filtrerte liste) | `fromTurnId`/`turnId`. Tjeneren slår opp turen i den lagrede økten. `from_turn` lagres fortsatt som antall (visning). Regien får `afterTurnId` | Eldre klienter som sender `fromTurn`, virker fortsatt. Eldre regi uten ID bruker antallet |
| Låste manussider | Forskyvningen var laveste side blant **aktive** scener, og scenens side kom fra **første** blokk | Forskyvningen er laveste kildeside blant alle importerte blokker (`lockedPageOffset`). Scenens side er laveste side blant blokkene (`sceneSourcePage`). Det gjelder både manusvisningen og eksporten | Ingenting lagres. Låste sider flytter seg ikke lenger når en scene deaktiveres, slettes eller flyttes |

## Migrasjon 0069 (bare additiv, ikke kjørt i Cloud)
- `db/migrations/0069_version_derivation.sql`: kolonnen `asset_versions.derived_from_version_id uuid` (nullable, uten tilbakefylling), en delvis indeks og en utsatt kontrolltrigger, `asset_versions_derived_from`. Den kaller `private.check_asset_version_derivation()`, som kontrollerer at kilden er en versjon av samme ressurs i samme prosjekt, og den sjekker først ved commit. Derfor spiller rekkefølgen ved gjenoppretting ingen rolle. Det er ingen fremmednøkkel, så `purge_*` og `delete_project` virker som før.
- **Ingen funksjoner er erstattet.** `apply_changes` (758c621f…), `create_project` (06854cbb…), `delete_project` (f6d7b8a0…), `purge_project_assets` (9a54a67c…), `purge_removed_assets` (97580c29…) og `global_set_version_withdrawn` (3d145d03…) er uendret. `apply_changes` skriver allerede kolonnene tabellen har. Den nye kolonnen er uforanderlig gjennom `protect_asset_version`.
- Ingen nye filstier, så referansesjekken for oppryddingen er uendret. Sikkerhetskopien tar med kolonnen og bytter ID-en (testet).
- `schema_version` er 69. `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er 69.

## Tester
- `npx tsc --noEmit`: rent. i18n-sjekk: 0 tekster uten engelsk.
- Full vitest: 2 031 bestått, 10 hoppet over, 0 feilet (251 filer).
- Nye invariant-tester `tests/invariants/stable-ids.test.ts`: 10/10. De dekker innsetting, sletting, ombytting, omnummerering, angre/gjør om, import og sikkerhetskopi.
- DB lokalt (Postgres 17 som uid 65534 via nss_wrapper): 145/145, inkludert den nye 0069-testen. Databasen og de midlertidige mappene er fjernet etterpå.
- Nettleser (nb / UI_LANG=en): dec0095-word-alignment 16/16 / 16/16, storylab-ui 32/32 / 32/32, storylab-canvas 33/33 / 33/33, t2-writing 69/69 / 69/69, dv3 48/48 / 48/48, scene-panels 39/39 / 39/39, export-e2e videofil OK / OK, ml4-e2e 24/24 / 24/24, verifisering3 73/73 / 73/73. I tillegg kjørte jeg de tre Story Lab-suitene med endret falsk tjener (group 28/28, scene 18/18, suggestions 22/22) på begge språk.

## Avvik
1. I `verifisering3-ui` fant den engelske kjøringen to faste norske tekster i appen: menyens skjermlesernavn «Arbeidsflater» (`ProjectNav.tsx`) og «Per scene» (`DurationOverview.tsx`). Begge bruker nå `t()` med nb/en. Det var nødvendig for at engelsk skulle bestå.
2. Testforventninger er endret der API-et måtte endres: `storylab-scene-view.test.tsx` (fork sender `fromTurnId: null` i stedet for `fromTurn: -1`), `storylab-engine.test.ts`, `dec0075-time-levels.test.ts`, `audio-pauses.test.ts` og `roomtone.test.ts` (alignment-parameteren). De falske tjenerne i fem Story Lab-suiter forgrener etter `fromTurnId`.
3. I `storylab-canvas-ui` sjekker «engelsk»-scenarioet nå teksten på det språket UI_LANG faktisk velger. Med UI_LANG=nb feilet det før, fordi UI_LANG overstyrer scenarioets språk (V1).
4. REQ-0518 har fått implementering, verifisering og en history-post, men status er **ikke** endret. Det er et prosesskrav i REQ-0450–0530, som venter på Mars, og akseptansen er en manuell gjennomgang. REQ-0037 er satt til «Verifisert». REQ-0022 var allerede verifisert og har fått den nye testen.
5. Underveis tømte `build-catalog.mjs` (eldre L()-katalog) `catalog.gen.ts` med «0 tekstpar». Filen er satt tilbake til forrige versjon (166 464 byte), og `tm`-testene er grønne.

## Åpne spørsmål
- Låste sider: Kildesiden har ingen dokument-ID. Om et prosjekt har blokker fra flere importerte manus, deler de sidenummerrommet. Skal sideoppslaget knyttes til `imported_documents` senere?
- AGENTS.md er ikke oppdatert med en regel for ID3 (rørt bare når oppdraget sier det). Ønskes en linje?
