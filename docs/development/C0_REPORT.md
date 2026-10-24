# C-0 – Kjernen for Creative Connectors

Dato: 24.10.2026. **Ikke publisert. 0109 er bare skrevet; ingen migrasjon eller DB-test er kjørt (Claude kjører dem).** Ingen ekte eksterne kall i testene.

## Bygget
1. **Manifest v1** (`src/core/connectors/manifest.ts`, `build.ts`): versjonert JSON for prosjekt, produksjon, scene, forekomst, panel, ressurs og versjon; revisjonsgrunnlag (`base`), filer med SHA-256, bildefrekvens som brøk, samplingfrekvens, tidskode, manusreferanser, notater, kildeprogram og adapter. Validator i ren TypeScript. Ukjente felt (også nestede) bevares ved rundtur. Hemmelighetslignende nøkler (token/secret/password …) og tokenformede verdier (ptgc_, sb_secret_, JWT …) gjør manifestet ugyldig.
2. **Tabeller i 0109**: `connector_sessions` (bare hash av tilgangs- og refresh-token, kort levetid, ett prosjekt, scopes, tilbaketrekking; hash-kolonner er ikke lesbare fra nettleseren), `connector_links`, `connector_transfers` (retning, status, kontrollsum, revisjonsgrunnlag, avsender, unik idempotensnøkkel per prosjekt) og `connector_conflicts`. Private hjelpetabeller for engangskoder/enhetskoder og brukte refresh-token. RLS: medlemmer leser via `my_project_ids()`, brukeren ser egne sesjoner; indekser per prosjekt/bruker. Alle SECURITY DEFINER-funksjoner har `search_path=''`. Navnet `connector_transfers` (ikke bare «transfers») holder alle tabellene under samme prefiks.
   - *Ikke registrert i `apply_change_tables`*: tabellene er integrasjonslogger skrevet av serveren (som `generation_jobs`), ikke prosjektinnhold brukeren redigerer med kommandoer. Selve prosjektinnholdet (kandidatversjonen og godkjenning) går via `apply_changes`.
3. **Mottak**: reservasjon med idempotensnøkkel → biter à 8 MB (maks 64 MB) → fullføring. Serveren regner SHA-256 over alle biter, sjekker endelse mot den eksisterende hvitelisten (`AE_SAFE_EXTENSIONS` fra AE-rettingen) og innholdet (magiske byte). Resultatet er alltid en ny kandidatversjon (`AddAssetVersion` via `apply_changes` som brukeren som godkjente tilkoblingen). Godkjent versjon endres aldri automatisk. Kvote (G-5) sjekkes ved reservasjon.
4. **Konflikter**: er revisjonsgrunnlaget ikke den godkjente versjonen, lages en konflikt. På Konto-siden kan brukeren velge «Behold begge», «Behold gjeldende», «Bruk innkommende» (kjører den vanlige, angrebare `ApproveAssetVersion` først) eller «Avvis». Ingen valg sletter noe.
5. **Tilgang**: OAuth 2.0 Authorization Code med PKCE (bare S256) via `/koble`, og enhetsflyt (RFC 8628) med kode XXXX-XXXX. Engangskode i 120 s; tilgangstoken 15 min; refresh-token roteres ved hver bruk (maks 90 dager), og gjenbruk av et brukt refresh-token trekker tilbake hele sesjonen. Medlemskap sjekkes på nytt ved hvert kall. Fartsgrenser (G-8) for token, enhetskode, API og godkjenning. «Tilkoblede programmer» på Konto-siden viser og trekker tilbake sesjoner. Ingen hemmeligheter i plugin-koden; klient-ID er offentlig.
6. **API v1**: `/api/v1/…` (én handler `src/adapters/connectors/api-v1.ts`, rute `src/routes/api/v1/$.ts`), beskrevet i `docs/api/openapi-v1.json` (OpenAPI 3.1, også på `/api/v1/openapi.json`). Alle svar har `Cache-Control: no-store`.
7. **Connector SDK** (`packages/ptg-connector-sdk`): PKCE- og enhetsinnlogging, automatisk fornyelse, manifest med validering, gjenopptakbar og idempotent opplasting med nye forsøk, konfliktliste. Plattformnøytral; importerer bare `src/core/connectors`.
8. **Kapabilitetsmodell** (`src/core/connectors/capabilities.ts`): hver adapter beskriver lese/skrive/lag/lyd/tidslinje/notater; `offerFor` gir handling eller «Eksporter for …».
9. **Skills** i `.claude/skills/`: ptg-storyboard-direction, ptg-creative-connectors, ptg-adobe-uxp, ptg-adobe-legacy-bridge, ptg-storyboard-interchange, ptg-ipad-creative-handoff, ptg-audio-roundtrip, ptg-plugin-security og ptg-integration-qa, med lenker til leverandørenes offisielle kilder. Oversikten i README er oppdatert; `check_kb` er OK.

Vindu-ID V-179 (`/koble`). Alle nye tekster finnes på alle registrerte språk; nb/en skrevet direkte, fr/es/ru/ja/pt-BR/de/it/ko er maskinoversatt og merket `review: machine`. Skjemaversjon bumpet til 109.

## Kontroller
| Kontroll | Resultat |
|---|---|
| Typekontroll (`tsc --noEmit`) | 0 feil |
| Nye C-0-tester (`tests/unit/c0-connectors.test.ts`) | 23 bestått |
| Full Vitest (etter regenerert språkinventar) | **3059 bestått, 0 feilet, 10 eksisterende hoppet over** |
| Visuelt Konto-siden og `/koble`, nb/en, desktop/mobil | 14 bestått, 0 feilet (mockede serverfunksjoner) |
| i18n check/validate/release-check | grønne |
| check_kb | OK (PyYAML i midlertidig miljø) |
| DB-test for 0109 | **skrevet, ikke kjørt** |

Testene dekker: manifestvalidering og rundtur med ukjente felt, hemmeligheter, token-hash og -typer, utløp, scope, prosjekt og tilbaketrekking, PKCE mot referanse (node:crypto), engangskode, feil verifier/state, enhetsflyt (venter → godkjent), refresh-rotasjon med gjenbruksdeteksjon, idempotens (replay og 409), gjenopptakbar opplasting (bare manglende bit sendes), avvist filtype (innhold ≠ endelse, ukjent endelse), kandidat uten automatisk bruk, konflikt og alle konfliktvalg, kvote, fartsgrense, no-store, OpenAPI (3.1, løste `$ref`, parametere, scopes, alle ruter beskrevet) og SDK mot falsk server. DB-testen dekker RLS, skjulte hash-kolonner, engangskode, rotasjon/gjenbruk, tilbaketrekking, enhetsflyt/utløp, unik idempotensnøkkel, konfliktvalg og fartsgrense.

## Ærlige åpne punkter
1. 0109 og DB-testen er ikke kjørt. Ingen ende-til-ende mot Cloud (ekte innlogging → plugin → kandidat). Lagringsoperasjonene (biter i `<prosjekt>/connectors/<overføring>/`) er bare testet med falsk lagring.
2. Maks filstørrelse er 64 MB fordi serveren setter sammen bitene i minnet (Worker-grense). Større filer krever direkte opplasting til lagring med signert URL; ikke bygget.
3. Konfliktvalget gjøres på Konto-siden; visuell side-om-side-sammenligning skjer via lenken til biblioteket, ikke i selve kortet.
4. `connector_links` og `notes:write` har tabell/scope, men ingen API-endepunkter ennå (kommer med første plugin).
5. Ingen ekte plugin (UXP/CEP/iPad/DAW) er bygget eller prøvd i leverandørenes programmer.
6. Sikkerhetsspørsmål i TODO under «Krever Øystein».

## Endrede filer
- `AGENTS.md`, `docs/agents/CONNECTORS.md`, `docs/development/AGENTS_DETAILS.md`, `docs/development/C0_REPORT.md`, `docs/development/UI_IDS.md`, `docs/api/openapi-v1.json`, `roadmap.md`, `TODO.md`, `tsconfig.json`
- `db/migrations/0109_c0_creative_connectors.sql`
- `src/core/connectors/{sha256,manifest,auth,transfer,conflict,capabilities,build,index}.ts`
- `src/adapters/connectors/{api-v1.ts,store.server.ts,connectors.functions.ts}`, `src/adapters/storage/project-rows.ts`
- `src/routes/api/v1/$.ts`, `src/routes/koble.tsx`, `src/app/account/{ConnectorsCard,ConnectorConsent,AccountPage}.tsx`, `src/app/ui-ids.ts`
- `src/core/i18n/{authored.json,runtime.gen.json}`, `src/core/i18n/locales/*.json`, `scripts/i18n/*.v1.json` (generert)
- `packages/ptg-connector-sdk/{package.json,README.md,src/index.ts}`
- `.claude/skills/ptg-*/SKILL.md` (9), `.claude/skills/README.md`
- `tests/unit/c0-connectors.test.ts`, `tests/helpers/c0-memory-store.ts`, `tests/db/run-db-tests.ts`, `tests/visual/c0-account.mjs`
