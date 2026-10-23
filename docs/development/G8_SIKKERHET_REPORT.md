# G-8 Sikkerhetsrunde 2 – rapport

Dato: 23.10.2026. Migrasjon: `db/migrations/0100_g8_rate_limits.sql` (ikke kjørt i Cloud, ikke publisert).
`EXPECTED_SCHEMA_VERSION` er 100.

## Resultat

| Kontroll | Før | Etter |
|---|---|---|
| Typekontroll | 0 | 0 |
| Full Vitest | 2838/0 | 2843 bestått / 0 feilet / 10 hoppet over (etter regenerert språkinventar) |
| DB-tester | 211/0 | 216/0 (5 nye G-8-tester) |
| i18n-sjekk | grønn | grønn (én ny nøkkel på alle 11 språk; 8 maskinoversatt) |
| Sårbarheter (bun audit) | 23 (1 kritisk, 10 høy) | 4 (bare hovedversjonsbytte) |

## 1. Lagring

Bøtter i Cloud (lest direkte):

| Bøtte | Offentlig | Størrelsestak | Filtyper |
|---|---|---|---|
| `sources` | nei | 100 MB | ingen liste |
| `assets` | nei | 2 GB | ingen liste |

Policyer på `storage.objects` (bare `authenticated`):

| Policy | Handling | Regel |
|---|---|---|
| `sources_read` / `assets_read` | lese | første mappe i stien er et prosjekt-ID der brukeren er medlem |
| `sources_insert` / `assets_insert` | skrive | første mappe er et prosjekt der brukeren er redaktør/eier |
| oppdatering / sletting | – | ingen policy: bare serveren (service_role) kan slette, f.eks. opprydding |

Vurdering:
- Ingen offentlige bøtter. Prefikset er bundet til prosjekt via `private.try_uuid(foldername[1])`; ugyldige stier gir null og avvises.
- Signerte URL-er på serveren utstedes etter medlemskaps- eller tokenkontroll: filmdeling 60 s / 10 min (token-digest), utstilling og publisering 10 min, mobil 60–300 s, KI-referanser 60 s–1 t (leverandøren må rekke å hente filen), opprydding 10 min.
- Signerte URL-er i nettleseren går gjennom lesepolicyen (RLS), så de gir bare filer brukeren allerede kan lese. Lengst: sikkerhetskopi 6 t (store nedlastinger) og bibliotek 1 t.
- Opplasting: signerte opplastingslenker lages bare i serverfunksjoner etter rolle-/tokenkontroll (mobil, globalt bibliotek, utstilling); filmdeling krever `video/mp4` i databasen. Lagringskvoter (G-5, PTG13/14) gjelder.
- Funn som krever valg: faste filtyper per bøtte. Ført i TODO under «Krever Øystein», fordi en for streng liste kan stoppe dagens importflyter.

## 2. Hastighetsgrenser

Felles mekanisme i databasen (0100):
- `private.rate_limit_rules` (tak per scope, vindu, tak per nøkkel og per IP) og `private.rate_limit_hits` (faste vinduer).
- `private.rate_limit_hit(scope, keys[])` teller treff og stopper med SQLSTATE **PTG15**. Klienten viser «For mange forespørsler på kort tid. Vent litt og prøv igjen.» (alle språk), via `backendMessage`/`plainError`, `quotaErrorMessage` og mobilens meldinger.
- IP tas fra PostgREST-forespørselen (`cf-connecting-ip`, ellers første `x-forwarded-for`) bare når kallet kommer fra `anon`/`authenticated`. Fra serveren sender serverfunksjonen IP selv.

| Scope | Hvor | Vindu | Per bruker/e-post | Per IP |
|---|---|---|---|---|
| auth | innlogging, innloggingslenke, glemt passord (serverfunksjoner, før CAPTCHA) | 10 min | 10 | 30 |
| signup_pass | registreringspass (trigger per e-post, server per IP) | 1 t | 5 | 20 |
| invitation | `project_invitations`, `workspace_invitations` | 1 t | 50 | 100 |
| share | `film_shares` | 1 t | 30 | 60 |
| export | `export_records` (også `reserve_interchange_export`) | 1 t | 300 | 600 |
| ai | `generation_jobs` (alle KI-kall og batcher) | 10 min | 400 | 800 |
| import | `imported_documents` | 1 t | 60 | 120 |
| upload_session | `upload_sessions` (mobil) | 1 t | 60 | 120 |
| report | `content_reports` | 1 t | 20 | 40 |
| comment | `showcase_comments` | 10 min | 30 | 60 |
| globe | `globe_points` (offentlig) | 1 min | 30 | 30 |

Begrunnelse: triggere før innsetting dekker både serverfunksjoner og direkte RPC-kall fra nettleseren uten å kopiere funksjonskropper. `globe_points` ble gjort om til plpgsql (samme resultat) fordi telling krever skriving. Takene er romslige og kan justeres i tabellen uten kodeendring. Gamle vinduer ryddes bort av og til, i små porsjoner.

## 3. Hemmeligheter

- Søkt i `src/` etter logging av token/nøkkel/passord: ingen treff. Leverandørfeil vaskes allerede med `scrubSecret`; fontnøkkelen logges ikke; Turnstile-konfigurasjonen gir bare den offentlige nettstedsnøkkelen.
- `process.env` leses bare i `.server.ts`/`.functions.ts` og autogenererte filer; nettleseren har bare `import.meta.env.DEV/MODE`.
- Nytt: `redactSecrets` i `src/lib/error-capture.ts` maskerer Bearer/Basic, JWT-er, Supabase- og leverandørnøkler, nøkkel-/token-parametere i adresser og JSON-felt som `password`/`token` i alt som går gjennom `console.error` og feilbeskrivelser.
- Nytt: `src/lib/no-store.ts` setter `cache-control: private, no-store` på `/_serverFn`, `/api/`, `/se/` og `/m/` (serverfunksjoner, API og tokensider).
- Tester: `tests/unit/g8-security.test.ts` (5).

## 4. RLS-matrise

Lest i Cloud og kontrollert i DB-testene G-8.1–G-8.3:

| Kontroll | Resultat |
|---|---|
| Tabeller i `public` uten RLS | 0 av 111 |
| Tabellrettigheter for `anon` | ingen i Cloud. Lokalt bare SELECT på `schema_version` og `privacy_policy` (bevisst, ingen personopplysninger) |
| Policyer for `anon`/`public` | ingen i Cloud. Lokalt bare lesepolicyene på de to tabellene over |
| Funksjoner `anon` kan kjøre | `globe_points` (forskjøvne punkter, nå med grense), `public_profile`, `registration_status`, `showcase_comments`, `showcase_feed`; alt annet stoppes av testen |
| Hastighetsgrensens interne funksjoner | ikke kjørbare for `anon`/`authenticated`; `public.rate_limit_hit` bare `service_role` |
| `authenticated` | alle lesepolicyer går via medlemskap (`private.my_project_ids()`, G-2) eller arbeidsgruppemedlemskap (G-6); skriving går via `apply_changes` (service_role) eller SECURITY DEFINER-funksjoner med rollekontroll |

## 5. Avhengigheter

`bun audit fix` (bare innenfor tillatte versjoner): 19 sårbarheter i 5 pakker rettet, blant annet `shell-quote` (kritisk), `launch-editor`, `nanoid` og `vite` 8.1.5 → 8.1.6 (patch). Fire står igjen fordi de krever nytt hovedversjonsnummer hos en avhengighet: `@vitest/mocker` (testverktøy), `esbuild` 0.18 (via drizzle-kit, bare utvikling), `uuid` 8 i `exceljs` (den sårbare buffer-varianten brukes ikke) og `brace-expansion`. Ført i TODO.

## Endrede filer

`db/migrations/0100_g8_rate_limits.sql`, `src/adapters/storage/project-rows.ts`, `src/adapters/auth/captcha.functions.ts`, `src/adapters/browser/client.ts`, `src/adapters/browser/film-shares.ts`, `src/adapters/browser/interchange.ts`, `src/adapters/browser/members.ts`, `src/adapters/browser/workspaces.ts`, `src/adapters/storage/commands.functions.ts`, `src/adapters/mobile/mobile.functions.ts`, `src/lib/error-capture.ts`, `src/lib/no-store.ts`, `src/server.ts`, `src/core/i18n/authored.json` + `locales/*.json` + `runtime.gen.json`, `scripts/i18n/*` (regenerert inventar), `tests/db/run-db-tests.ts`, `tests/unit/g8-security.test.ts`, `package.json`, `bun.lock`, `TODO.md`, `roadmap.md`, denne rapporten.
