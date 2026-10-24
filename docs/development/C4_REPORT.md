# C-4 – Boords-kobling (API)

Status: **bygget og testet mot en falsk Boords-server, ikke prøvd mot ekte Boords.** Ingen publisering. Migrasjon 0112 er skrevet, ikke kjørt.

## Grunnlag
Boords-API-et er i beta og krever betalt plan. Nøkkelen sendes i `X-API-KEY`, grensen er 120 kall per minutt, endringer hentes med `updated_since`, og webhooks signeres med HMAC. ETag/If-Match og et eget felt for ekstern referanse er ikke dokumentert, og koblingen bygger ikke på dem. Identitet er vår manifest-ID og `connector_links` (klient `boords`, frame ↔ panel). Konflikter finnes med egne hasher av feltene på begge sider (`boords_frame_state`).

## Levert
1. **Tilkobling** per bruker eller arbeidsgruppe (`boords_connections`). Nøkkelen og en valgfri webhook-hemmelighet krypteres med samme hvelv som AI-nøklene (AES-256-GCM, nøkkelversjon, AAD bundet til eier, `boords` og rad). Nettleseren kan ikke lese chifferet, fordi kolonnetilgangen stopper det. Bare eieren av arbeidsgruppen kan legge inn en nøkkel for gruppen. Nøkkelen prøves mot Boords før den lagres, og 401/403 avvises. Kontosiden viser at Boords krever betalt plan.
2. **Send til Boords** (knappen «Boords» i storyboardet, vindu V-183): oppretter storyboardet ved første sending og deretter frames. Hver frame får action, sound, dialogue (dialogfeltet, ellers teksten i koblede replikker), panelets rasterisering (felles compositor) og referansen `ptg:<manifest>:<panel>`.
3. **Hent fra Boords**: periodisk i cron med `updated_since` (markøren går aldri bakover), med «Hent endringer» og via webhook på `/api/public/boords/webhook/<tilkobling>`. Webhooken kontrollerer HMAC-SHA-256 med konstant-tids sammenligning, et tidsvindu på 5 minutter og at hendelses-ID-en bare brukes én gang (`boords_webhook_events`). En gyldig webhook starter bare en vanlig henting, og innholdet i meldingen brukes ikke. Endringer blir `boords_candidates`, og samme endring gir aldri to kandidater. Hvis feltene er endret hos oss og i Boords siden forrige synk, merkes kandidaten som konflikt. Valgene er de fra C-0: «Behold begge», «Behold gjeldende», «Bruk innkommende» og «Avvis». «Bruk innkommende» kjører den vanlige, angrebare `SetStoryboardDetails`. For bilder lager den et nytt bibliotekbilde, og panelet endres ikke.
4. **Kommentarer begge veier** (`boords_comments`): kommentarer fra Boords lagres som ren tekst og knyttes til panelet. Tilbakemeldinger fra SB-10 sendes til Boords én gang hver (unik `feedback_id`).
5. **Fartsgrense**: kø med glidende vindu på 120 kall per minutt. Ved 429 eller 5xx venter koblingen så lenge `Retry-After` sier, eller med eksponentiell tilbakeoff, i høyst 5 forsøk.
6. **Kapabilitetsmodell**: `boords-api` kan lese, skrive og håndtere notater. `BOORDS_LIMITS` lister det koblingen ikke kan: krever betalt plan, beta, ingen lag, lyd eller tidslinje, ingen ETag, ufullstendige webhooks og ingen automatisk bruk. Listen vises på kontosiden.

## Tester
- `tests/unit/c4-boords.test.ts` (19 tester): HMAC (RFC 4231 samt gyldig, ugyldig, gammel og feil format), duplikater, `Retry-After`, 429 og nytt forsøk, 120 kall per minutt, at nøkkelen aldri lekker (bare i headeren, vasket ut av feil, ikke i svartypen og ikke importert i nettleseren), kryptering med rundtur og AAD, feltmapping begge veier, kandidat og konflikt, `updated_since` og hele rundturen mot en falsk Boords-server med kommentarer.
- DB-test 0112: chifferet er skjult, RLS, ingen direkte skriving, webhook-idempotens, unik kandidat, kandidatvalg med rolle og revisjon, og rydding. DB-suiten ga **236/0**.
- Visuell test `tests/visual/c4-boords.mjs` for kontosiden på nb og en, desktop og mobil: **16/0**.
- Full Vitest ga **3116/0/10**, `test:ssr` ga **8/8**, og tsc og i18n er grønne.

## Ærlig status (gjenstår)
- Endepunktene (`BOORDS_ENDPOINTS`), feltnavnene og webhook-headerne og signaturformatet er antakelser samlet ett sted. De må bekreftes mot ekte Boords-beta, noe som krever betalt plan. Se TODO under «C-4 Boords – sikkerhet».
- Et bilde fra Boords plasseres ikke i panelet; det blir et bibliotekbilde.
- Kommentarer fra Boords vises i Boords-vinduet, ikke i SB-10-teamoversikten.
- Fartsgrensen gjelder per serverinstans.
- 0112 må kjøres i Cloud (Claude). `EXPECTED_SCHEMA_VERSION` er 112.

## Annet
For at `scripts/i18n/candidates.v1.json` skal holde seg under grensen på 10 MB, utelates `raw` når den er lik `JSON.stringify(text)` (`scripts/i18n/inventory.mjs`). Ingen andre leser feltet.
