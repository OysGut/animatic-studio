# B-097 – «Sist endret», land, klokke og datoformat (rapport)

Dato: 21.10.2026. Migrasjon `db/migrations/0073_last_changed_country.sql` er skrevet og testet lokalt,
men **ikke kjørt i Cloud** – Claude kjører den. `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION`
er satt til 73 (kontrakttesten krever det), så appen må ikke publiseres før 0073 er kjørt.

## Tillegg fra forrige oppdrag

### «Legg i scenen» spør om lydtype
`src/app/mobile/mobile-actions.tsx`: en liten meny med effekt, atmosfære og musikk. Sist valgte type er
forhåndsvalgt og huskes per bruker (`ui_prefs` `audio.sceneSoundKind`, standard effekt).

### `build-catalog.mjs` kan ikke lenger tømme `catalog.gen.ts`
**Årsak:** etter overgangen til nøkkelbasert i18n (ML2) finnes nesten ingen `L()`-kall igjen. Skriptet
bygde katalogen bare fra det skanneren fant, og skrev derfor en tom katalog, mens gamle `tm()`-tekster
fortsatt trenger den. **Retting:** `scripts/i18n/catalog-merge.mjs` leser den eksisterende katalogen,
fletter inn nye par og avbryter med feil (exit ≠ 0, ingen skriving) hvis resultatet er tomt eller mindre
enn før. Kjøring nå: `1859 tekstpar (0 funnet i L()-kall)`, filen beholdt. Test:
`tests/unit/b097-build-catalog.test.ts` (4/4).

## B-097

1. **Kolonne «Sist endret»** helt til høyre i scenevelgeren (`ScenePicker.tsx`) og i scenenavigatoren
   i manus (`SceneNavigator.tsx`). Verktøytipset viser nøyaktig tid og hvem; scener uten loggført
   endring viser «Opprettet …». Oppdateres hvert minutt og ved sanntidsendringer i endringsloggen.
2. **Løsning:** som foreslått, `change_log.scene_ids uuid[]` med GIN-indeks og RPC
   `scene_last_changes(project)` (én spørring, faller tilbake på `scenes.created_at`). Kjernen
   (`src/core/last-changed.ts`, `scenesOfChange`) følger hver berørt rad før og etter kommandoen oppover
   til scenen. Flyttes en rad mellom scener, telles begge.
3. **`formatRelativeTime`** m.fl. i `src/core/i18n/relative-time.ts`, bare `Intl`. Følger språket i
   grensesnittet og kontoens klokke og datoformat («Som landet» bruker landets region).
4. **Land:** obligatorisk søkbart valg ved registrering (ISO 3166-1 alpha-2, navn via
   `Intl.DisplayNames`). Eksisterende brukere uten land får en dialog som ikke kan lukkes uten valg.
   Land, klokke og datoformat kan endres på kontosiden med forhåndsvisning.
5. **Admin:** tabell med antall brukere per land (bare tall, ingen navn eller e-post).
6. **Personvern** (nb/en) forklarer hvorfor land samles inn og at statistikken er anonym.
7. **Gjenbruk:** prosjektkort, versjonslister og merknader bruker den felles funksjonen. Eksportformater
   og lagrede data er ikke endret.

### Migrasjon 0073 (additiv, fra 0072)
- `change_log.scene_ids` + GIN-indeks. Ny trigger `private.protect_change_log()` erstatter
  historikkvernet på `change_log`: den tillater bare én endring av `scene_ids` fra null til verdi,
  alt annet avvises som før (INV-13).
- `profiles.country` (nullable, check `^[A-Z]{2}$`). Lesing av `profiles` er nå gitt per kolonne uten
  `country`, så prosjektmedlemmer ikke ser andres land. Eget land leses via `my_account`.
- Nye funksjoner: `scene_last_changes`, `set_my_country`, `admin_country_counts`.
- Erstattet: `my_account()` (kopi fra 0034 med `country` lagt til). Alle har eksplisitt
  `revoke … from public, anon` og `grant execute … to authenticated`.
- `schema_version` = 73.

## Tester
- `npx tsgo --noEmit`: rent. i18n-sjekk: 0 tekster uten engelsk (inventaret regenerert).
- Full Vitest: 2 146 bestått, 10 hoppet over, 0 feilet (etter retting av skjemaversjonen).
  Nye testfiler: `b097-relative-time.test.ts` (13), `b097-last-changed.test.ts` (5),
  `b097-build-catalog.test.ts` (4).
- DB-tester lokalt (Postgres 17): 149 bestått, 0 feilet, med nye tester for land (egen rad, check,
  kolonnetilgang), RPC-ene, aggregering og at historikken fortsatt ikke kan endres.
- Ny suite `tests/visual/account-locale.mjs`: 28/28 på nb og 28/28 med `UI_LANG=en`.
- Regresjon (én om gangen): scene-panels-ui 39/39; u5-screens 63/63 nb og en;
  scene-mobile-audio 23/23 nb og en.

## Avvik
- **Land ved oppretting:** det finnes ingen funksjon som lager profilen ved registrering (profiler lages
  ved første innlogging). Landet lagres derfor i registreringens metadata og skrives til
  `profiles.country` automatisk ved første innlogging (testet). Bare kjente ISO-koder godtas. Jeg har
  ikke laget en ny trigger på kontotabellen, fordi oppdraget ikke ba om det.
- **`scene_ids` skrives rett etter `apply_changes`**, i et eget kall, i stedet for å endre den store
  `apply_changes`. Feiler det kallet, lagres kommandoen likevel, men scenen kan vise en litt eldre tid.
  Det logges uten persondata.
- Feil funnet under testing og rettet: landvalget var usynlig i landdialogen (skjult av en stilregel).

## Åpne spørsmål
- Skal profilen få land i en trigger ved registrering (krever endring på kontotabellen), eller er
  lagring ved første innlogging godt nok?
- Skal `apply_changes` selv skrive `scene_ids` i samme transaksjon senere?

## Endrede filer
Se svaret i chatten for full liste.
