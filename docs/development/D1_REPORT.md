# D-1: Demoklar gjennomgang (22.10.2026)

Ryddeoppgave uten nye funksjoner. Ingen endring i appkoden, databasen eller språkfilene; bare testfiler er rettet.
De sperrede språk-, konto- og innloggingsfilene er ikke rørt. Ikke publisert.

## Sluttstatus
- **Vitest:** 2390 bestått, 0 feilet, 10 hoppet over (295 filer).
- **DB (lokal Postgres 17, alle migrasjoner):** 164/164. Ingen DB-endringer etterpå.
- **i18n:** `check.mjs` 0 mangler; releasekontrollen bestått (nb, en, en-XA 100 %).
- **Demoflyt** (prosjektliste → prosjekt → manus → scene → montering → bibliotek → rigg → «Til produksjonen»
  med skuddliste, Dragonframe, AE, klippefiler, Nuke/Fusion): 24/24 på nb og en. Ingen varsler, ingen
  horisontal overflyt. Én konsollfeil: `["ai-model-settings"]` får `undefined` – det er testmocken som svarer
  tomt; i ekte drift svarer serverfunksjonen med et objekt. Ikke rettet.

## Visuelle suiter
98 suiter, 167 kjøringer i første runde, én om gangen (hjelpefiler, `screens.mjs` (avviklet) og `_p.mjs`
(diagnose) er ikke egne suiter). Alle ikke nevnt under bestod på nb, og på en der suiten støtter `UI_LANG`.

| Suite | Første kjøring nb / en | Etter retting nb / en | Årsak |
|---|---|---|---|
| asset-studio-ui | 55/57 / 57/57 | 57/57 | Kjøreoppsettet tvang nb over suitens egne engelske scenario (ikke appen) |
| dec0090-mobile-ui | 33/35 / 33/35 (avslutningskode 0) | 35/35 / 35/35 | Kameraknappen ligger i «Mer …» ved 1280 px (R7); testen åpner nå menyen og gir riktig avslutningskode |
| funn-0079-ui | mange tidsavbrudd | 14/14 | Testen satte ikke norsk språk; nå `animatic:lang=nb` |
| funn-0080-ui | mange tidsavbrudd | 19/20 | Samme språkretting; g07 «andre vinkler» gjenstår (åpent) |
| job-read, rigg-r2–r5 | startet ikke | alle grønne nb/en | Fant ikke Playwright (`/tmp/pw/node_modules`); bare kjøremiljøet |
| mts-engine / global / lower-thirds / textscene / title | 30/33, 8/10, 3/6, 8/10, 11/12 | 42/42, 13/13, 16/16, 13/13, 13/13 (nb og en) | Tekstmenyen ligger i «Mer …» ved 1280 px; testene åpner den nå |
| ptg3-camera | 29/30 / 29/30 | 30/30 / 30/30 | LESMEG oppgir riktig årsak «ingen 2D-komposisjon» (sjekkes før rigg i `core/interchange`); testen godtok bare «rigg» |
| scene-mobile-audio | 8/13 / 8/13 | 22/23 / 22/23 | Opptaksknappen i «Mer …»; gjenstår hydreringsavvik på mobilsiden `/m/$token` |
| scene-video-ui | 38/39 / 38/39 | 39/39 (nb) | Faste datoer gjorde «kjørende» jobber eldre enn sju dager (= hengende); nå ferske tidspunkter |
| ca4-mouth-mask | 24/25 / 24/25 | – | Hydreringsavvik på `/m/$token` (åpent) |
| ml2-languages | 310/318 / 310/318 | – | Verktøytips på språkvelgeren og hydrering (personvern, skall) – i sperret `language.tsx`; bare notert |
| global-film-share | 11/12 | 11/12 | Q7: siden kaller `my_features` (funksjonsflagg) (åpent) |
| registration-closed | 30/31 / 30/31 | 30/31 / 30/31 | Innloggingssiden kaller `globe_points` (B-117, bevisst offentlig) og `my_features`; testen tillater bare statuskallet (åpent) |
| storylab-canvas-ui, storylab-group-ui | 26/27, 7/9 | – | Mockene fanger `generateText`, appen bruker `generateStoryText` med prompter bygget på serveren (åpent) |
| u2-chrome-ui | 22/25 | – | Måler skjulte grupper i «Mer …» (0 px) og krever ingen overflyt ved 1280 px, i strid med R7 (åpent) |
| verifisering4-ui | 57/58 | – | REQ-0050: linjehøyde 15,53 px mot forventet skriftstørrelse (åpent) |

## Rettede testfiler (grunn over; ingen forventning er fjernet)
`tests/visual/dec0090-mobile-ui.mjs`, `funn-0079-ui.mjs`, `funn-0080-ui.mjs`, `mts-harness.mjs`, `mts-engine.mjs`,
`mts-global.mjs`, `mts-lower-thirds.mjs`, `mts-title.mjs`, `scene-mobile-audio.mjs`, `ptg3-camera.mjs`,
`scene-video-ui.mjs`. I `registration-closed.mjs` og `global-film-share.mjs` er det bare lagt til logging av
RPC-navn; kontrollene er uendret.

## Åpne spørsmål til Claude
1. Er `my_features` og `globe_points` ønsket på innloggingssiden og filmdelingssiden? Da bør tillatelseslisten
   i de to testene utvides med nøyaktig disse navnene.
2. Story Lab-suitene og U2 bør skrives om etter ny serverkontrakt og overflytregelen R7. Det er større
   testomskrivinger, og de er ikke gjort før demoen.
3. Hydreringsavvik på `/m/$token` og `/personvern` og verktøytipset på språkvelgeren henger trolig sammen med
   de sperrede språkfilene. De bør sees på etter sammenslåingen av `lovable-sync`.
4. REQ-0050 og funn-0080 g07 er ikke undersøkt nærmere.
