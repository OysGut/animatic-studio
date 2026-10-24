# C-8 Krita og Blender (Python-tillegg) – rapport

**Status: bygget, ikke verifisert i Krita eller Blender.** Alt er testet mot falske `krita`- og `bpy`-moduler og mot den ekte `/api/v1`-handleren med falsk lagring på 127.0.0.1. Ingen ekte eksterne kall. Ingen ny migrasjon (klientene `ptg.krita` og `ptg.blender` finnes allerede i klientlisten fra 0111). Ikke publisert.

## Levert

| Del | Hvor |
|---|---|
| Felles Python-klient (innlogging med enhetsflyt og PKCE via loopback, manifest v1, gjenopptakbar opplasting i biter med idempotensnøkkel, konflikter, nedlasting med SHA-256-kontroll, tokenfil 0600) | `plugins/python-common/ptg_client.py` |
| Tekster på alle registrerte språk (nb/en skrevet, resten maskinoversatt) | `plugins/python-common/ptg_strings.py` |
| Krita 5.2+: meny, åpne versjon (PSD med lag eller PNG), åpne C-1-pakke (ZIP/mappe), send tilbake som kandidat (flat PNG med alfa), tre konfliktvalg, kobling i annotasjonen `ptg-link` | `plugins/krita/` |
| Blender 4.2+ extension (`blender_manifest.toml`): kameraer fra SB-9 per panel, PTG3/FBX-import, referanser i kamerabakgrunn, rendringer tilbake (PNG-sekvens med tidskode og manifest i tEXt, eller MP4/MOV) | `plugins/blender/pentoglass/` |
| Kjerne: `blenderCameraPlan` (brennvidde, sensorbredde, sensorhøyde fra panelformat, synsvinkel = SB-9 `fieldOfView`) | `src/core/connectors/blender.ts` |
| API: `GET /api/v1/projects/{id}/blender/cameras?occurrenceId=` (scope `manifest:read`), OpenAPI, SDK `blenderCameras` | `src/adapters/connectors/api-v1.ts`, `docs/api/openapi-v1.json`, SDK |
| Adaptere `krita-python` og `blender-python` | `src/core/connectors/capabilities.ts` |
| Pakking (usignerte ZIP-er; klienten kopieres inn) | `plugins/scripts/pack-python.py` |
| Veiledning nb/en | `plugins/krita/README.md`, `plugins/blender/README.md` |
| Tester | `plugins/python-common/tests/` (unittest), `tests/unit/c8-python.test.ts` (kjører dem fra `npm test` + kontraktstest) |

## Takhøyder (per nøkkel/plan, aldri globale)
- 64 MB per fil (C-0), 8 MB biter.
- 2000 paneler per kameraplan (`truncated` settes ved mer).
- 250 bilder per PNG-sekvens per sending.
- 500 lag i Krita-oversikten.

## Ærlig roadmap

- [x] Felles Python-klient med paritet mot TS (tidskode, idempotensnøkkel, PKCE testes mot TS-koden).
- [x] Krita: åpne/sende tilbake, konflikter, kobling på ID.
- [x] Blender: kamera/sensor/format, markører, FBX, referanser, rendringer som kandidater.
- [x] Ingenting brukes automatisk (testen sjekker at godkjent versjon er uendret).
- [ ] **Ikke prøvd i Krita eller Blender.** Krita-API-et (`annotation`, `exportImage`, `InfoObject`-egenskaper) og bpy-kallene er skrevet etter dokumentasjonen.
- [ ] Krita sender flat PNG; PSD med lag som egen versjon venter på samme spørsmål som C-2 (TODO).
- [ ] Panelretur fra Krita går via C-1-retursiden, ikke direkte (C-0-mottaket tar bare ressurser).
- [ ] Panelbilder hentes ikke direkte fra API-et (de tegnes i nettleseren); Blender bruker bilder fra en «Send til …»-pakke eller ressursversjoner.
- [ ] Video-rendring har ingen innebygd tidskode; bare PNG-sekvensen bærer tidskode og manifest.
- [ ] Kamerahøyde i Blender er fast 1,6 m (blokkingen er 2D).
- [ ] Tokenfilen er ukryptert (0600), som for CEP-tilleggene.
- [ ] Maskinoversettelser (de, fr, es, it, pt-BR, ru, ja, ko) må leses gjennom.

## Sjekkliste for ekte prøving

**Krita (5.2+)**
1. Pakk og installer (README). Tillegget vises i Python Plugin Manager og menyen under Verktøy → Skript.
2. Logg inn: nettleseren åpnes, godkjenn, og meldingen «Logget inn» vises.
3. Åpne en PSD-versjon med flere lag: navn, synlighet, opasitet og alfa stemmer.
4. Åpne en «Send til …»-pakke (ZIP): dokumentet åpnes, og filnavnet i pakken er uten betydning.
5. Endre et lag og send tilbake: ny kandidatversjon i appen, ikke godkjent.
6. Send samme fil igjen: ingen ny versjon (idempotens).
7. Godkjenn en annen versjon i appen, send fra Krita: konfliktvalget med tre valg vises; «Bruk den nye» ber om godkjenning i appen.
8. Logg ut, og trekk tilgang i appen: neste kall feiler med beskjed.

**Blender (4.2+)**
1. Installer extension fra disk; tillat nettverk.
2. Logg inn via nettleseren.
3. Hent kameraer for en scene med SB-9-blokking: brennvidde og sensor stemmer med appen; synsvinkelen er lik; markører per panel; oppløsning og bildefrekvens stemmer.
4. Importer PTG3-FBX fra «Til produksjonen»: kameraet beveger seg som i appen.
5. Legg et panelbilde i kamerabakgrunnen.
6. Render en kort PNG-sekvens og send tilbake: kandidatversjoner med tidskode i hvert bilde; ingenting godkjent.
7. Send en MP4: én kandidatversjon.
8. Logg ut: tilgangen er trukket tilbake.

## Verifikasjon
Se slutten av denne filen (fylles ut etter kjøringene).
