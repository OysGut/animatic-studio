# C-2 – Photoshop-plugin (UXP)

**Status: bygget, ikke verifisert i Photoshop.** Alt er prøvd mot en falsk Photoshop/UXP-modul og en falsk server. Ingen ekte Photoshop, ingen ekte Adobe-konto og ingen kall mot Cloud. Ikke publisert.

## 0. Migrasjonslås og 0109
- 0107, 0108 og 0109 er lagt inn i `tests/fixtures/migration-hashes.json` med de oppgitte MD5-ene. Låsetesten dekker nå alt til og med 0109.
- 0109-rettingen hadde endret `0109_c0_creative_connectors.sql` etter 7bc6238a. Filen er satt tilbake byte for byte til 7bc6238a (MD5 `2b0d27bf8818ac8d741016742beaea68`, med `begin;`/`commit;` slik den ble kjørt).
- Alle rettingene ligger nå i **`0111_c0_security_fixes.sql`** (ikke kjørt, uten begin/commit): klientliste og redirect-mønstre, kontroll av scopes, fartsgrense på kodeoppslag, avvisning av tilbaketrukne/utløpte sesjoner i SQL, `connector_cleanup()`. I tillegg C-2-funksjonen `connector_resolve_conflict_for` (bare service_role). 0110 (C-1) står uendret. `EXPECTED_SCHEMA_VERSION` = 111. Den faste ryddejobben kaller `connector_cleanup` først fra versjon 111.

## 1. Pluginen (`plugins/photoshop`)
- **Manifest v5**, `host` PS `minVersion` 27.0.0, ett panel (`ptgPanel`). Nettverk bare `https://pentoglass.com` (ingen jokertegn). Nettleseren åpnes bare med https.
- **Innlogging:** PKCE (S256) i systemnettleseren via `shell.openExternal`, med klient `ptg.photoshop` og redirect `ptg-photoshop://oauth/callback` (registrert i 0109/0111). UXP kan ikke lytte på en port eller ta imot et eget URL-skjema. Godkjenningssiden viser derfor svaradressen med en kopiknapp, og brukeren limer den inn i panelet. State sjekkes mot CSRF. Enhetsflyten (kode) er reservevei. Tokens lagres bare i `secureStorage`. Ingen hemmeligheter i koden.
- **Panel:** prosjekt, ressurser med versjoner (godkjent/kandidat), scener og storyboardpaneler med notater fra manifestet, og status for det koblede dokumentet: ressurs, versjon, piksler, ppi og fargeprofil (lest med `batchPlay` «get»).
- **«Åpne fra Pen to Glass»:** henter versjonsfilen (PSD eller PNG) gjennom det nye endepunktet, sjekker SHA-256 og åpner den i `executeAsModal`. Koblingen til revisjonsgrunnlaget (versjon og variant) lagres i pluginens datamappe og overlever omstart.
- **«Send tilbake»:** lagrer en PSD-kopi med lag, alfakanaler og innebygd fargeprofil (`saveAs.psd`, `asCopy`), med oppløsningen uendret. Den lastes opp via SDK-et som ny kandidatversjon med revisjonsgrunnlag og stabil idempotensnøkkel. Opplastingen kan gjenopptas og viser fremdrift. Ingenting tas i bruk automatisk.
- **Konflikt:** vises med de tre valgene **Behold begge**, **Behold gjeldende** og **Bruk min**. De to første lagres via API-et. «Bruk min» åpner konfliktlisten på Konto-siden, fordi bare brukerens egen godkjenning i appen bytter aktiv versjon (C-0-regel 3).
- **Tilbaketrekking:** svarer serveren 401, sletter pluginen tokens lokalt og ber om ny innlogging.
- Tekstene i pluginen finnes på nb, en, de, fr, es, it, pt-BR, ru, ja og ko (`src/strings.ts`). Pluginen følger Photoshops språk, med engelsk som reserve. nb og en er skrevet for hånd. **Maskinoversatt (bør leses gjennom):** alle nøkler på de, fr, es, it, pt-BR, ru, ja og ko.

### Viktig funn: PSD kan ikke lagres som versjon i dag
Prosjektmodellen godtar bare PNG/JPEG/WebP/GIF som bildeversjon. Det gjelder `ASSET_MIME_TYPES` i kjernen, typesjekken på `asset_versions` (0004) og filtypene til lagringsbøtta. En PSD-kandidat ville feile på serveren. Slik er det løst nå, uten å endre datamodellen:
- API-et avviser PSD allerede ved reservasjon med `415 unsupported_version_type`, før noen byte sendes.
- Pluginen sender da en flat PNG med gjennomsiktighet (`saveAs.png`) som kandidat, og sier tydelig fra at lagene bare er bevart i dokumentet.
- Om PSD skal lagres som egen versjon, står under «Krever Øystein» i TODO. Det samme gjelder C-1s PSD-retur, som forutsetter dette og ikke er prøvd mot Cloud.

## Endringer i appen/API-et
- `GET /api/v1/projects/{projectId}/assets/{assetId}/versions/{versionId}/file` (`assets:read`): filbyter med `X-Content-SHA256`, no-store og nosniff. Bare filer i prosjektets egen mappe.
- `POST /api/v1/projects/{projectId}/conflicts/{conflictId}/resolve` (`transfers:write`): keep_both / choose_current / reject. choose_incoming gir `409 approve_in_app`. Revisjon og redaktørrolle sjekkes i SQL.
- Konfliktlisten fra Cloud har samme camelCase-form som den falske serveren og OpenAPI.
- SDK: `projects`, `assets`, `versions`, `panels`, `download` (med sjekksum) og `resolveConflict`.
- Godkjenningssiden: svaradresse med kopiknapp for egne skjemaer (tre nye tekster på alle språk; de/fr/es/it/pt-BR/ru/ja/ko er maskinoversatt). Vist redirect for `ptg-…://` var tidligere «null» og er rettet. Konfliktlisten på Konto har fått ankeret `#c0-conflicts`.

## 2. Pakking
- `bun plugins/photoshop/scripts/pack.ts` kontrollerer manifestet, bunter med esbuild (`photoshop`/`uxp` holdes eksterne), tegner enkle plassholderikoner og lager `dist/com.pentoglass.photoshop_0.1.0.ccx` (ZIP med manifest øverst). Prøvd her: 7 filer, ingen hemmeligheter i bunten. `dist/` ligger i .gitignore.
- `plugins/photoshop/README.md`: kort installasjonsveiledning på nb og en. `marketplace/LISTING.md`: utkast for Adobe Marketplace (ikke sendt inn; ekte ikoner, skjermbilder og personvernlenke gjenstår).

## 3. Tester
- `tests/unit/c2-photoshop-plugin.test.ts` (19): manifestkontroll (godkjent og sju avvisninger), importgrense og ingen hemmeligheter/nettleserlager/HTML-innsetting, tekster på alle språk med like plassholdere, språkvalg, trygge filnavn og koblingstak. Mot falsk server og falsk Photoshop: PKCE-innlogging, CSRF/feil adresse, åpning med sjekksum og `executeAsModal`, ødelagt sjekksum, send tilbake (PSD-valg, PNG-reserve, revisjonsgrunnlag, ingen automatisk bruk, lag urørt, idempotent), PSD-avvisning før opplasting, ingen sending uten koblet dokument, konflikt med tre valg, `approve_in_app`/stale i API-et, tilbaketrekking, enhetsflyt, oppstart med og uten lagrede tokens, og utlogging med tilbaketrekking på serveren.
- DB-test: `connector_resolve_conflict_for` (bare service_role, ikke choose_incoming, prosjekt/rolle/revisjon, avvisning).
- **DB: 235 bestått, 0 feilet** (hele kjeden til og med 0111, med 0109 slik den ble kjørt).
- **Full Vitest:** se sluttlinjen nederst. tsc 0. i18n: 0 tekster uten engelsk, inventar regenerert. **`npm run test:ssr`: 8/8.**

## 4. Sjekkliste for ekte prøving (Øystein eller en tester)
Bruk macOS og Windows med Photoshop 27 eller nyere, og en testkonto med redigeringstilgang i et prøveprosjekt (ikke «Jula på Dovre»).
1. **Installasjon:** kjør pack-skriptet, dobbeltklikk `.ccx`. Panelet skal vises under Plugins. Prøv også UXP Developer Tool → Add Plugin → Load. Noter eventuelle advarsler om tillatelser.
2. **Innlogging:** trykk «Logg inn i nettleseren». Nettleseren skal åpne godkjenningssiden. Velg prosjekt og godkjenn. Svaradressen skal vises, kopier den og lim den inn. Panelet skal vise prosjektnavnet. Start Photoshop på nytt: du skal fortsatt være innlogget. Prøv også «Logg inn med kode i stedet».
3. **Åpne:** velg en ressurs med en PNG-versjon og trykk «Åpne fra Pen to Glass». Bildet skal åpnes med riktig størrelse. Status skal vise piksler, ppi og fargeprofil. Prøv også en versjon som kom fra C-1-PSD hvis det finnes en.
4. **Endre lag:** legg til to lag, ett med delvis gjennomsiktighet, og gi dem navn.
5. **Send tilbake:** trykk «Send tilbake». Fremdrift skal vises. I appen skal en ny kandidatversjon finnes, mens den aktive versjonen er uendret. Kontroller gjennomsiktighet og at bildet ikke er skalert. Noter meldingen (i dag: flat PNG, fordi PSD ikke kan lagres). Trykk «Send tilbake» igjen uten endringer: det skal ikke komme en ny versjon.
6. **Konflikt:** åpne versjon A i Photoshop. Godkjenn en annen versjon B i appen. Send tilbake fra Photoshop. De tre valgene skal vises. Prøv «Behold begge» (lagres) og, i en ny runde, «Bruk min» (Konto-siden åpnes; godkjenn der). Ingenting skal slettes.
7. **Tilbaketrekking:** trekk tilbake tilgangen under Konto → Tilkoblede programmer. Trykk «Send tilbake» eller åpne en versjon: panelet skal si at tilgangen er trukket tilbake og vise innlogging igjen.
8. **Utlogging:** logg inn på nytt, trykk «Logg ut». Sesjonen skal vises som tilbaketrukket på Konto-siden.
9. **Språk:** sett Photoshop til engelsk og ett annet språk. Tekstene skal følge Photoshops språk.

## Ærlig veikart
- [x] Låsing 0107–0109, retting flyttet til 0111
- [x] Plugin med innlogging, panel, åpne, send tilbake, konflikt og tilbaketrekking (mot falske moduler)
- [x] Pakking, README nb/en, Marketplace-utkast
- [x] Tester uten Photoshop, DB, i18n, SSR
- [ ] Verifisert i ekte Photoshop (sjekklisten over)
- [ ] PSD som egen versjon i prosjektet (krever Øysteins valg og en migrasjon og endret bøtte)
- [ ] 0111 kjørt i Cloud (Claude)
- [ ] Innliming av svaradressen er en omvei. Et lite hjelpeprogram eller en fremtidig UXP-mulighet for egne skjemaer kan gjøre den automatisk.
- [ ] Ekte ikoner og Marketplace-innsending (ikke bestilt)
- [ ] `executeAsModal`, `batchPlay`-feltnavn (`profile`, `resolution`, `numberOfLayers`) og `saveAs.psd/png`-valg følger Adobes dokumentasjon, men er ikke prøvd mot ekte Photoshop 27.
