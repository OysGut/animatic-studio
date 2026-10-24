# C-6 Adobe Audition (CEP-panel) – rapport

**Status: bygget, ikke verifisert i Audition.** Alt er prøvd mot en falsk CSInterface, falsk `window.cep.fs`, en falsk ExtendScript-modell og det falske `/api/v1` (C-0). Ingen ekte eksterne kall. Ikke publisert.

## 0. Migrasjoner
- `0112_c4_boords.sql` er låst i `tests/fixtures/migration-hashes.json` (`2b7d809a42bca8158fb75980999bb166`). Låsetesten dekker nå til og med 0112.
- C-6 trengte ingen databaseendring. Klienten `ptg.audition` og redirect-mønstrene (loopback og `ptg-audition://`) fantes allerede i 0111. Retur går gjennom det eksisterende C-0-mottaket (`connector_transfers`), som allerede godtar WAV.

## 1. Hva som er bygget
| Del | Fil | Merknad |
|---|---|---|
| BWF-utvidelse | `src/core/handoff/wav.ts` | Valgfrie iXML-`<USER>`-felt og cue + LIST/adtl/labl-markører; `retagWav` skriver nye metadata uten å endre lyden (alle bitdybder). C-1-filer uten ekstra felt er byte for byte som før. |
| Felles lydmodell | `src/core/connectors/audition-session.ts` | Plan-typer, BWF-metadata, `.sesx`-økt, lesing av retur. Ingen prosjektstatus, så CEP-pakken og appen deler én kode. |
| Plan fra prosjektet | `src/core/connectors/audition.ts` | Bare lesing. Roller: dialog (inkl. forteller), musikk, effekter, atmosfære og midlertidig panellyd (SB-4). Versjon: låst → godkjent → nyeste. Bare manusets kildespråk eller «*». |
| API | `GET /api/v1/projects/{id}/audition/plan?occurrenceId=&panelId=` | Scope `manifest:read`; beskrevet i `docs/api/openapi-v1.json`; SDK `auditionPlan()`. |
| Panel | `plugins/audition/` | CSXS/manifest.xml (AUDT 24+, CSXS 11, uten Node), `index.html` med CSP, `jsx/host.jsx`, `src/*`. |
| Pakking | `plugins/audition/scripts/pack.ts` | Usignert mappe + ZIP for sidelasting. ZXP-signering er forberedt med kommandoer i kommentaren, men ikke gjort. |
| README | `plugins/audition/README.md` | nb og en, med PlayerDebugMode for CSXS.11/12 på macOS og Windows. |

### Lyd ut
For valgt scene eller panel lastes hver WAV ned via SDK-et (SHA-256 kontrolleres). `retagWav` legger inn:
- bext: beskrivelse med `ptg:manifest:<id>` og TimeReference = filmposisjon i samples;
- iXML `<USER>`: `PTG_PROJECT`, `PTG_OCCURRENCE`, `PTG_SCENE_ID`, `PTG_PANEL`, `PTG_BLOCK`, `PTG_ASSET`, `PTG_VARIANT`, `PTG_VERSION`, `PTG_CLIP`, `PTG_ROLE`, `PTG_MANIFEST`, `PTG_TIMECODE`;
- cue-markører `ptg:panel:<id>` og `ptg:line:<id>` som faller inne i klippet.

Deretter skrives en `.sesx` med ett spor per rolle, klipp i samples, volum/demping og markører, pluss `ptg-audition.json` (planen, uten tokens). Panelet ber ExtendScript åpne økten. Lykkes det ikke, ligger filene i mappen og kan dras inn.

### Tilbake
Brukeren velger redigerte WAV-filer, høyst 100 per gang. ID-ene leses fra iXML, og filnavnet brukes aldri (testen gir filen et helt nytt navn). Hver fil lastes opp som ny kandidatversjon i samme variant, med den utsendte versjonen som grunnlag og idempotensnøkkel fra filens sha. Hvis grunnlaget ikke er gjeldende versjon, lager C-0 en konflikt, og panelet viser de tre valgene: Behold begge, Bruk den andres, og Bruk min (åpner appen, godkjennes aldri fra panelet). Panelet avviser filer uten ID-er, filer som ikke er WAV, filer fra et annet prosjekt og filer over 512 MB.

### Takhøyder (per plan/sending, ingen globale)
400 klipp og 2000 markører per plan (flagges som `truncated`, og brukeren får beskjed om å dele opp per panel), 2000 markører per fil, 100 filer per sending og 512 MB per fil.

## 2. Tester
`tests/unit/c6-audition.test.ts` (17): BWF-rundtur med uendret lyd og markører; C-1-filer er uendret; plan for scene/panel/roller/versjoner/midlertidig lyd; takhøyde; metadata og retur (feil prosjekt, ingen ID, ikke WAV); `.sesx`; hele flyten med falsk CEP (innlogging, utsending, at ikke-WAV hoppes over, retur som kandidat uten godkjenning, idempotens, konflikt og tre valg, tilbaketrekking); ExtendScript-argumenter; manifest uten Node; tekster på 10 språk; klientliste; README.

Resultater: full Vitest **3175 bestått / 0 feilet / 10 hoppet over**, DB **238/0**, `npm run test:ssr` **8/8**, tsc 0, i18n 0 mangler (inventaret er regenerert).

## 3. Sjekkliste for ekte prøving i Audition
1. Installer etter README: sett PlayerDebugMode, legg `CSInterface.js` i `vendor/`, pakk og kopier til CEP-extensions, og start Audition på nytt.
2. Vindu → Utvidelser → From Pen to Glass: panelet vises på Auditions språk.
3. Logg inn i nettleseren, lim inn adressen og se prosjektnavnet. Prøv også innlogging med kode.
4. Velg scene og «Hent lyden til Audition». Kontroller at WAV-filene og `.sesx` ligger i mappen, og at økten åpnes med spor per rolle på riktige tider.
5. Kontroller markørene (Vindu → Markører) i filene og i økten. Sjekk metadata (Vindu → Metadata → BWF/iXML) for tidskode, scene og PTG-ID-er.
6. Rediger én fil, lagre med «Lagre», og gi den gjerne nytt navn. Velg «Send redigert lyd tilbake». I appen skal det dukke opp en ny kandidatversjon som ikke er godkjent.
7. Konflikt: godkjenn en annen versjon i appen og send så tilbake en fil basert på den gamle. Prøv alle tre valgene.
8. Trekk tilbake tilgangen i Konto → Tilkoblinger. Neste handling i panelet skal logge ut.
9. Velg ett panel i stedet for hele scenen, og kontroller at bare klippene i panelets tidsvindu følger med.
10. Noter Audition-versjon, operativsystem og CEP-versjon (CSXS.11 eller 12).

## 4. Ærlig veikart
- [x] Låsing av 0112, felles lydmodell, plan-API, CEP-panel, pakking/README og tester.
- [ ] Prøving i ekte Audition (sjekklisten over).
- [ ] Usikkert: om Audition beholder egne iXML-`<USER>`-felt og cue-markører ved lagring. Reserveløsning står i TODO.
- [ ] Usikkert: om `.sesx` laget etter Auditions eget format åpnes, og om `app.openDocument` virker for økter.
- [ ] Lyd som ikke er WAV, sendes ikke ut (må konverteres i appen først).
- [ ] Tokens ligger ukryptert i panelets brukerdatamappe, fordi CEP ikke har nøkkelring (TODO, sikkerhet).
- [ ] Signert ZXP krever sertifikat (krever Øystein).
- [ ] Maskinoversatte paneltekster (de, fr, es, it, pt-BR, ru, ja, ko) i `plugins/audition/src/strings.ts` må leses gjennom.
