# C-3 Premiere Pro (UXP-panel) – rapport

**Status: bygget, ikke verifisert i Premiere Pro.** Alt er prøvd mot en falsk `premierepro`- og `uxp`-modul og
et falskt `/api/v1` (C-0). Ingen ekte eksterne kall i testene. Ikke publisert. Migrasjon 0114 er skrevet, ikke kjørt.

## Hva er bygget
1. **Plugin `plugins/premiere/`** (UXP, manifest v5, `host.app = "premierepro"`, `minVersion 25.6.0`):
   - Innlogging med PKCE via systemnettleseren, klient `ptg.premiere` (klientlisten i 0111), redirect `ptg-premiere://oauth/callback` (brukeren limer inn adressen). Enhetsflyt (kode) som reserve. Ingen hemmeligheter; tokens i UXP `secureStorage` (samme lager som C-2).
   - **Åpne sekvenspakke:** brukeren velger den utpakkede mappen. `manifest.json` kontrolleres (adapter `adobe-premiere-uxp`, samme prosjekt som innloggingen) før Premiere importerer `sequence.xml` med `Project.importFiles`.
   - **Send rekkefølge og rytme tilbake:** leser den aktive sekvensen (`getActiveSequence → getVideoTrack(0) → getTrackItems`, start/slutt i ticks, klippmarkører via `Markers.getMarkers`, mediesti via `ClipProjectItem.getMediaFilePath`), kobler klipp til paneler **bare på ID** og sender manifest v1 til `POST /api/v1/projects/:id/premiere/returns` via SDK-et (`sendPremiereReturn`, ny metode).
   - Bare `src/premiere-host.ts` snakker med Premiere; resten bruker en `Host`-modul (regel 8 i CONNECTORS.md).
2. **Sekvensen ut** (`src/core/connectors/premiere-sequence.ts` + `premiere.ts`), lastet ned fra Storyboard → «Premiere Pro» (V-185):
   - Panelene i storyboardfilmens rekkefølge og tid (samme `storyboardTimeline` som SB-4-avspillingen), panelbildene (`panels/<panelId>.png`), varighet, overganger fra SB-9 (oppløsning, dip, wipe, iris, push) og lyd fra SB-4 på tre spor: dialog (dialog + forteller), musikk, effekter (lydeffekter + atmosfære) og midlertidig panellyd. Scenelyd flyttes fra filmtid til der scenen starter i storyboardfilmen.
   - Både **FCP7 XML** (det Premiere importerer) og **OTIO**, laget fra samme modell. Markører: `ptg:panel:<id>@<revisjon>` på hvert panelklipp, `ptg:shot:<forekomst-ID>` og `ptg:scene:<scene-ID>` på første panel i skuddet, og scenemarkører på sekvensen.
3. **Tilbake = forslag per panel.** `planPremiereProposal` sammenligner med storyboardet:
   - Kobling bare på panel-ID (markør først, så bildets filnavn). Nye navn eller ny rekkefølge bryter ikke koblingen. Klipp uten vår ID ignoreres (telles), dubletter telles.
   - Færrest mulige flytt: panelene i den lengste rekken som allerede står riktig innbyrdes står stille; bare de andre får forslag om ny plass (etter forrige panel i samme scene).
   - Et panel som i Premiere står midt i en annen scene får bare forslag om varighet. **Scener, scenenumre og manus endres aldri** (INVARIANTS: produksjonsteknisk segmentering endrer ikke manusstruktur).
   - Paneler som mangler i Premiere slettes aldri. Endret i appen siden eksport = konflikt (merket), og et gammelt forslag kan ikke brukes (`premiereEditCommands` → null, «send på nytt»).
   - Appen viser forslagene **side om side** (Nå | Fra Premiere: plass og varighet) med «Godta»/«Avvis» per panel. «Godta» kjører vanlige, angrebare kommandoer (`MoveStoryboardPanel`, `UpdateStoryboardPanel`) i én angregruppe; valget lagres med `connector_resolve_panel_candidate` (redaktør, revisjonssjekk).
4. **Server:** `POST …/premiere/returns` (scope `transfers:write`, maks 4 MB, maks 5000 paneler per retur, idempotent på manifestets innhold uten tidsstempel). Beskrevet i `docs/api/openapi-v1.json`.
5. **Migrasjon 0114** (ny fil, uten begin/commit; 0113 og eldre urørt): `connector_returns.source` tillater `premiere`, `connector_panel_candidates.kind` tillater `edit`. `EXPECTED_SCHEMA_VERSION = 114`.
6. **Pakking:** `bun plugins/premiere/scripts/pack.ts` lager `dist/com.pentoglass.premiere_0.1.0.ccx` (manifestet kontrolleres først). README på nb og en. Ikke sendt til Adobe Marketplace.
7. **Takhøyde (fast regel):** alle grenser er per retur og per prosjekt (paneler, størrelse, idempotens per prosjekt), ingen globale køer.

## Tester
- `tests/unit/c3-premiere.test.ts` (20): sekvens med markører, timing og SB-9-overgang; lydspor i begge formater; rundtur OTIO og XML; XML med `-1` ved overganger (slik Premiere eksporterer); kobling på ID ved nye navn/ny rekkefølge/filnavn; fremmede klipp og dubletter; forslag fra byttet rekkefølge og ny timing, godtatt forslag flytter innen scenen; panel i annen scene gir bare varighet; konflikt og utdatert forslag; ingen sletting; avvisning av feil adapter, hemmeligheter, tomme og doble paneler; minste antall flytt; hele panelflyten (PKCE, import, klipp, retur, idempotens) mot falsk Premiere og falskt API; tilbaketrukket tilgang; ticks → bilder; manifestkontroll; importregler for pluginkoden; tekster på alle ti språk; klient og kapabiliteter; 0114 uten begin/commit.
- DB-test «0114 C-3 Premiere Pro» i `tests/db/run-db-tests.ts`: klienten finnes, kilde/type-sjekker, unik retur, RLS for medlem/ikke-medlem, ingen direkte oppdatering, valg per panel.
- Resultater: full Vitest 3157 bestått, 0 feilet, 10 hoppet over; DB 238/0; `npm run test:ssr` 8/8; tsc 0; i18n-sjekk og releasekontroll grønne.

## Begrensninger (ærlig)
- **Ikke prøvd i Premiere.** Navnene i `premiere-host.ts` følger Adobes UXP-referanse for Premiere, men er ikke kjørt. Særlig usikkert: at `Markers.getMarkers` på klippets prosjektelement gir klippmarkørene fra FCP XML-importen, og at `getTrackItems(CLIP, false)` gir klippene i tidsrekkefølge. Filnavnet `panels/<id>.png` er reserve hvis markørene ikke følger med.
- Panelet leser bare første videospor. Paneler lagt på andre spor ignoreres.
- Pakken må pakkes ut manuelt; UXP-panelet pakker ikke ut ZIP.
- OTIO-sporene er sekvensielle: overlappende lydklipp på samme spor ligger bare i XML-en.
- Retur endrer bare rekkefølge innen scenen og varighet; trim av lyd, nye klipp og overganger fra Premiere hentes ikke tilbake.
- Maskinoversatte tekster: `c3.*` i de, fr, es, it, pt-BR, ru, ja, ko, og panelets egne tekster i `plugins/premiere/src/strings.ts` for de samme språkene, må leses gjennom.
- Visuell nettlesertest av V-185 er ikke skrevet; DB-testen kjøres lokalt, ikke i Cloud.

## Sjekkliste for ekte prøving i Premiere Pro (Øystein)
- [ ] Installer .ccx (dobbeltklikk) eller last inn via UXP Developer Tool; panelet vises under Vindu → UXP-tillegg.
- [ ] Logg inn i nettleseren: godkjenn, lim inn `ptg-premiere://`-adressen. Prøv også «Logg inn med kode».
- [ ] Last ned sekvenspakken i Pen to Glass, pakk ut, «Åpne sekvenspakke»: sekvensen får alle paneler i riktig rekkefølge og varighet.
- [ ] Markører: hvert panelklipp har `ptg:panel:…`; første panel i hver scene har `ptg:shot:…` og `ptg:scene:…`; sekvensen har scenemarkører.
- [ ] Overganger fra SB-9 (oppløsning, dip, wipe) står på riktige kutt.
- [ ] Lyd: dialog, musikk og effekter på egne spor og på riktig tid.
- [ ] Gi et klipp nytt navn, bytt rekkefølge på to paneler i én scene, trim ett panel. «Send rekkefølge og rytme tilbake».
- [ ] I Pen to Glass: forslagene vises side om side; godta ett, avvis ett; angre det godtatte.
- [ ] Dra et panel inn i en annen scene: bare varighet kan godtas, scenen endres ikke.
- [ ] Endre et panel i Pen to Glass etter eksport, send tilbake: «Endret siden eksport» vises.
- [ ] Send samme sekvens to ganger: ingen doble forslag.
- [ ] Trekk tilbake tilgangen under Konto: neste «Send tilbake» logger panelet ut.

## After Effects: dagens skript, QR-retur og C-0/C-1
UXP for After Effects er fortsatt i beta, så **det lages ikke noe UXP-panel for After Effects** før det er GA.
- **Ut:** After Effects-pakken (PTG3, «Til produksjonen») er en ZIP med `bygg-after-effects.jsx` og startfiler for Windows/Mac (`ae-launchers.ts`). Skriptet bygger komposisjonene og lagrer `.aep`. Den bruker verken C-0-innlogging eller tokens, og trenger ingen nettverkstilgang.
- **QR-retur (PTG3b/B-115):** hvert skudd får et tittelkort med QR-kode. QR-en inneholder bare en ikke-hemmelig referanse `/ptg/i?p=…&o=…&n=…&f=…` (prosjekt, sceneforekomst, skuddnavn, lengde), **ingen token**. Når brukeren importerer en ferdig render i appen, kjennes skuddet igjen på QR-en (eller på ett sekund ekstra lengde), tittelkortet klippes bort, og filmen blir en ny, inaktiv Take (Dragonframe-mønsteret) – aldri en erstatning for ferdig materiale.
- **Forhold til C-0:** QR-returen går ikke gjennom C-0-mottaket (`/api/v1/transfers`), fordi brukeren selv laster opp i appen med vanlig innlogging. Adapteren `adobe-after-effects-legacy` i kapabilitetsmodellen sier derfor «read, layers, timeline», uten «write»; UI-et tilbyr eksport, ikke «Send tilbake».
- **Forhold til C-1:** C-1 «Send til …» (PSD/PNG/SVG/WAV-BWF/OTIO med `/r/<token>`, token lagret som hash) har ikke After Effects som mål. Den naturlige koblingen senere er at AE-pakken får en C-1-returlenke/QR med token, slik at en render kan sendes tilbake uten innlogging og bli en kandidat via C-0. Ikke bygget; føres i TODO.
- **Når UXP for AE er GA:** samme mønster som C-2/C-3 (én `Host`-modul, SDK-et, PKCE med en egen klient i klientlisten – `ptg.after-effects` finnes ikke ennå og krever ny migrasjon).

## Roadmap
- [x] Plugin plugins/premiere (UXP v5, Premiere 25.6+), PKCE + enhetsflyt, ingen hemmeligheter
- [x] Sekvens ut som FCP XML og OTIO med panel-, skudd- og scenemarkører, timing, SB-9-overganger og SB-4-lyd
- [x] Retur = forslag per panel, side om side, godta/avvis; kobling bare på ID; aldri scenebytte eller sletting
- [x] 0114 (skrevet, ikke kjørt), API-endepunkt + OpenAPI, SDK-metode
- [x] .ccx-pakking og README nb/en
- [x] Tester uten Premiere (falsk UXP/Premiere, falskt API) + DB-test
- [x] After Effects-avsnitt (ingen UXP-panel før GA)
- [ ] Verifisering i ekte Premiere Pro – sjekklisten over
- [ ] Visuell nettlesertest av V-185
- [ ] C-1-returlenke for After Effects-render (venter på beslutning)
