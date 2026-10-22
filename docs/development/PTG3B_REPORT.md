# PTG3b-rapport: Tittelkort med QR i After Effects-pakken (B-115)

Bygget oppå PTG3. Uten AI, uten migrasjon, alle nye tekster via `t()` på alle ti språk.

## Løsning
- **Tittelkort (1 s):** `src/core/interchange/ae-jsx.ts` lager per skudd komposisjonen `<skudd>_TITLE`. Kortet har appens mørke bakgrunn, filmtittelen, en linje med SC-nummer, scenenavn og skuddnavn, en stor QR-kode midt på med forklaringen under, og nederst med liten tekst «Eksportert fra From Pen to Glass». Tekstene er på brukerens grensesnittspråk.
- **Tidskoden forskyves ikke:** skuddkomposisjonen er helt uendret, så bilde 0 og tidskoden er de samme som i skuddlisten og FBX-filen. Komposisjonen `<skudd>_RENDER` legger tittelkortet (0–1 s) foran skuddet (fra 1 s) og får start-tidskode −1 s (`displayStartTime = -1`, i `try` slik at scriptet ikke stopper hvis After Effects avviser det). Hovedkomposisjonen er også uendret. `<kode>_hoved_RENDER` har et tittelkort uten QR foran hele filmen. Dette er dokumentert i LESMEG (nb/en).
- **QR-innhold:** `<app>/ptg/i?p=<prosjekt>&o=<sceneforekomst>&n=<skuddnavn med versjon>&f=<lengde i bilder>`. Lenken inneholder ingen token. QR-bildet lages som en PNG i `tittelkort/<skudd>_qr.png` (`qrcode` + en ren PNG-koder i kjernen).
- **Import (`/ptg/i`):** siden krever innlogging. Ugyldig lenke, manglende tilgang, ukjent sceneforekomst eller manglende redigeringsrett gir samme nøytrale melding som riggens QR (`print-job.code-unknown`). Siden viser skuddet og lar brukeren laste opp filmen. Filmen blir en ny take (`AddTake`, status «reference») på sceneforekomsten og tas ikke i bruk automatisk.
- **Klipperegel (`decideTitleCardTrim`):** første sekund klippes bort når filmen er ett sekund (± ett bilde) lengre enn skuddet, eller når QR-koden er funnet i første bilde. Det gis en advarsel når lengden etterpå avviker med mer enn ett bilde. Klippingen gjøres i nettleseren med mediabunny (`Conversion` med `trim.start`) før opplasting.
- **Valg:** «Tittelkort med QR» er på som standard og kan slås av. Valget lagres i innstillingene i eksportloggen.

## Tester
- `tests/unit/ptg3-ae.test.ts` (11/11): skuddkomposisjon, nøkkelbildetider og plassering i hovedkomposisjonen er like med og uten tittelkort; `_TITLE` er 1 s; `_RENDER` er 1 s + skuddet med −1 s; tekstene og QR-bildet kommer med; generert kode er ES3.
- `tests/unit/ptg3b-titlecard.test.ts` (7/7): QR-PNG-en dekodes med jsQR til nøyaktig lenken (uten token), ugyldige parametre avvises, og klipperegelen er testet ved 24 og 25 bilder/s, med og uten kort, med QR og ved avvik.
- `tests/visual/ptg3b-titlecard.mjs`: nb 9/9, en 9/9. Testene dekker standardvalget, QR-bilder i pakken, `_TITLE`/`_RENDER`/−1 s, tekst på grensesnittspråket, LESMEG, at valget kan slås av, at importsiden viser skuddet og den nøytrale meldingen.
- Regresjoner, kjørt én om gangen: `ptg3-camera` nb/en 19/19, `ptg1-shotlist` nb/en 35/35, `export-e2e` (film) bestått, `p4-alpha-export` 41/41.
- Full Vitest 2310 bestått / 10 hoppet over. DB 157/157 (lokal Postgres 17). i18n-sjekk og releasekontroll grønne. tsc grønn.

## Avvik og merknader
- **Ny utviklingspakke:** `jsqr` (bare devDependency). Den trengs for testen som dekoder QR-bildet; det fantes ingen QR-leser fra før.
- **Ikke testet med ekte filer:** selve videoklippingen er ikke kjørt mot en ekte AE-render, og QR-gjenkjenning i første bilde er ikke bygget inn i appen ennå. Appen kjenner igjen tittelkortet på lengden («første sekund»), mens QR-varianten er støttet i regelen (`qrFound`). Begge bør kontrolleres med en ekte AE-render.
- **PTG3-suiten rettet:** `ptg3-camera.mjs` antok at fixturen har rigg. Uten rigg godtar den nå «camera omitted» og ingen parallakse-nuller.
- **Importsiden validerer søkeparametrene på nytt i komponenten.** Den visuelle testen viste at en ugyldig lenke ellers ble vist som et skudd.

## Åpne spørsmål
- Hovedkomposisjonen har ett tittelkort uten QR foran hele filmen, ikke ett per skudd, fordi kort mellom skuddene ville forskjøvet tidskoden. Er det riktig tolkning?
- Bør QR-koden i første bilde også leses i appen? Det krever en QR-leser i nettleseren, altså en ny pakke.

## Endrede filer
- `src/core/interchange/titlecard.ts` (ny)
- `src/core/interchange/ae-jsx.ts`
- `src/engine/export/ae-export.ts`
- `src/app/assembly/ptg-import.ts` (ny)
- `src/app/assembly/ShotlistExport.tsx`
- `src/routes/ptg.i.tsx` (ny)
- `src/core/i18n/authored.json`, `src/core/i18n/locales/*.json` (alle elleve filene, 17 `ptg3b.*`-nøkler; fr, es, ru, ja, pt-BR, de, it og ko er maskinoversatt og merket `review: machine`)
- `scripts/i18n/references.v1.json`, `scripts/i18n/candidates.v1.json` (regenerert)
- `tests/unit/ptg3-ae.test.ts`, `tests/unit/ptg3b-titlecard.test.ts` (ny), `tests/visual/ptg3b-titlecard.mjs` (ny), `tests/visual/ptg3-camera.mjs`, `tests/architecture/eksport-uten-ai.test.ts`
- `package.json`, `bun.lock` (devDependency `jsqr`)
- `roadmap.md`, `docs/development/PTG3B_REPORT.md`
