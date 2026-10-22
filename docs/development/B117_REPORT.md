# B-117 – globus ved innloggingen

## Levert
- **Globus:** `src/app/auth/LoginGlobe.tsx` tegner en fullskjerms `<canvas>` bak innloggingen (`fixed inset-0 -z-10` i en isolert `main`). Innloggingsboksen og resten av siden er uendret; bare klassen `isolate` er lagt på `main` slik at canvas ligger over bakgrunnen og under skjemaet. Oppsett `R = min(W·0,62, H·0,95)`, `CX = W − R·0,04`, `CY = H + R·0,02`, start yaw −62°, pitch 18°. Ytterkant, gradnett hver 15° og kystlinjer med fargene fra prototypen, 1 css-px, bare forsiden. Ingen tekst.
- **Kystlinjer:** Natural Earth 50m (`world-atlas@2`, `land-50m`, offentlig eiendom), forenklet (Douglas–Peucker 0,05°, 0,1° oppløsning) til `src/app/auth/globe-land.json` (193 kB). Lastes dynamisk bare på innloggingssiden. Pakken er ikke lagt til i prosjektet; dataene ble laget én gang.
- **Prikker:** `globalCompositeOperation = "lighter"`, kantdemping `min(1, z·3)`, aktive/sovende størrelser og alfa, puls med egen periode, fase og varierende tempo etter formelen i oppdraget (`src/core/globe`).
- **Interaksjon:** mål + glidning 0,07, hastighet 0,6/0,4, demping 0,975, ingen fart etter 120 ms stillstand, pitch ±1,2 rad, selvrotasjon 0,012 rad/s etter 3 s med myk inn. Pekerhendelser med `setPointerCapture`, `touch-action: none`, grab/grabbing. `prefers-reduced-motion`: ingen puls eller selvrotasjon; bildet tegnes bare ved endring.
- **Ytelse:** tegningen stopper når fanen er skjult, dpr maks 2.
- **By:** «By» under «Land» på kontosiden (`CityPicker`), valgfri og kan fjernes; nytt land fjerner byen. 25 største byer per land + hovedstaden fra GeoNames cities15000 (CC BY 4.0), `src/core/geo/cities.json` (143 kB, 244 land, 3911 byer, hovedstad per land). Kreditering ved feltet og i README.
- **Migrasjon 0085** (`db/migrations/0085_login_globe.sql`, additiv oppå 0084): `private.globe_places`, `profiles.city` (GeoNames-id med check), `set_my_city`, `my_account` (+city), `account_status.last_seen_at` og `touch_activity` (høyst én skriving per 5 min), `globe_points()`. SELECT på `account_status` er nå gitt per kolonne uten `last_seen_at`, som regelen fra 0073. Appen kaller `touch_activity` hvert minutt mens fanen er synlig; nettleseren og databasen slipper bare én skriving per 5 min. **Ikke kjørt i Cloud – Claude gjennomgår og kjører.** Forventet skjema 85.
- **globe_points:** anon + authenticated, gir bare `lat`, `lon`, `active`. Forskyvning 2–12 km beregnes på serveren fra `md5('b117:' || user_id)` (samme formel som `offsetPoint`). Bare kontoer med status aktiv og valgt land. Aktiv = `last_seen_at` eller `last_active_at` siste time. By som ikke hører til landet ignoreres (hovedstaden brukes).

## Tekster
Nye nøkler `b117.city.*` (7) på nb og en, maskinoversatt (merket `review: machine`) til fr, es, ru, ja, pt-BR, de, it og ko. `inventory.mjs`, `check.mjs` (0 tekster uten engelsk) og `release-check.mjs` grønne.

## Verifisering
- `tests/unit/b117-globe.test.ts`: 12 tester (oppsett, projeksjon, kant, puls, utseende, forskyvning, fysikk, bydata).
- Full `bunx vitest run --maxWorkers=3`: **2373 bestått, 0 feilet, 10 hoppet over**.
- DB: **160 bestått, 0 feilet**. Ny 0085-test: by/check/RLS, 5-min-grense, ingen ID/e-post, bare `lat,lon,active`, slettet og sperret konto utelates, stabile punkter, forskyvning 2–12 km. 0058-listen over anon-funksjoner har fått `globe_points`.
- `tests/visual/b117-globe.mjs`: nb 12/12 og `UI_LANG=en` 12/12 (boksen 360 px, sentrert, lik med og uten canvas; e-postfeltet over canvas; canvas dekker skjermen; dra endrer bildet; redusert bevegelse står stille).

## Åpent
- Claude må kjøre 0085 i Cloud. Før det gir `globe_points` feil, og globusen vises uten prikker; byfeltet skjules.
- Land uten byer i cities15000 (5 små territorier) får ingen prikk.
