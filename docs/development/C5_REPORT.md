# C-5 – Toon Boom Storyboard Pro (skriptpakke)

**Status: bygget, ikke verifisert i Storyboard Pro.** Ekte prøving krever lisens. Alt er testet mot en falsk
modell av Storyboard Pros skript-API og et falskt Pen to Glass-API. Ingen ekte nettverkskall i testene.
Ikke publisert. Migrasjon 0113 er skrevet, ikke kjørt.

## 0. Låste migrasjoner
- `0110_c1_handoffs.sql` `0ce46e169265a04c36f8534065dcef65` og `0111_c0_security_fixes.sql` `cea8717fe4914fe2ed41d0c8319578a6`
  ligger i `tests/fixtures/migration-hashes.json` (kontrollert mot filene). Låsetesten dekker nå alt til og med 0111.

## 1. Hva som er bygget
**Skriptpakke** `plugins/toonboom-sbpro/scripts/` (ES5, QtScript):
- `PtG_lib.js` – felles bibliotek. Alle Storyboard Pro-kall går gjennom én liste (`PtG.sbpro`), alt mot filer,
  nettverk og dialoger gjennom `PtG.host`. Egen SHA-256 i ES5 (sjekket mot kjernen).
- `PtG_Login.js` – enhetsflyten fra C-0 (Storyboard Pro har ingen nettleser): skriptet viser kode og adresse,
  brukeren godkjenner på /koble, skriptet henter token. Tilgangen lagres i `~/.pentoglass/sbpro-session.json`,
  aldri i skriptmappen. Fornyelse ved utløp/401.
- `PtG_Import.js` – leser utpakket pakke (manifest v1): scener per forekomst, paneler i filmrekkefølge, timing,
  Dialogue/Action Notes/Notes (CaptionManager), kamerainstruksjon i caption «Camera», panelbilde (ImportManager),
  midlertidig panellyd på ett lydspor med starttid fra timingen (SoundTrackManager), og skjult referanse i
  caption «PtG Ref» (`ptg:<panel>@<revisjon>|occ|proj|prod`). Ulik bildefrekvens stopper importen.
- `PtG_Export.js` – leser alle paneler, timing og tekstfelt, eksporterer panelbilder (ExportManager; bare valgte
  paneler hvis noe er valgt i SelectionManager) og sender returmanifestet med token. Bilder lastes opp bare når
  serveren ber om dem og kontrollsummen stemmer.
- `PtG_Logout.js` – trekker tilbake tilgangen og sletter sesjonsfilen.
- `pack.ts` lager `dist/PtG-sbpro-<versjon>.zip` og stopper ved ikke-ES5 eller mulige hemmeligheter.
- `README.md` med installasjon og bruk på nb og en.

**Kjerne** `src/core/connectors/sbpro.ts` (ren TypeScript): importpakke (`buildSbproPackage`), lesing av retur
(`readSbproReturn`: manifest v1-validering, adapter, produksjon, tak 5000 paneler / 10 000 tegn / 25 MB bilde,
hemmeligheter avvises), kandidatplan (`planSbproReturn`) og sammenstilling (`planConformation`, `conformCommands`).

**Server**: `/api/v1/projects/:id/sbpro/returns` (POST, scope `transfers:write`, idempotent på manifest-hash per
prosjekt) og `…/returns/:rid/images/:cid` (PUT, bare PNG, sha256 må stemme, kvote per prosjekt). Lagring i
`connector_returns` og `connector_panel_candidates` (0113). Bildefilene ligger under `<prosjekt>/connectors/sbpro/`
og er med i `ORPHAN_REFERENCE_TABLES`.

**App**: knappen «Storyboard Pro» i storyboardet åpner vinduet V-184: last ned pakke (ZIP med manifest, panelbilder
og lyd, med fremdrift) og se kandidater. Valg: «Bruk innkommende», «Behold begge», «Behold gjeldende», «Avvis».
«Bruk innkommende» kjører vanlige, angrebare kommandoer i én angregruppe (tekst → SetStoryboardDetails, timing →
UpdateStoryboardPanel, bilde → nytt bibliotekbilde der originalen beholdes, nytt panel → AddStoryboardPanel,
rekkefølge/timing → MoveStoryboardPanel + UpdateStoryboardPanel).

## 2. Regler som holdes
- Ingenting tas i bruk automatisk; prosjektet er uendret etter en retur (testet).
- Konflikt: panelets revisjon i Pen to Glass er endret siden eksporten.
- Sammenstilling er ett steg **bare** når den er tapsfri: samme paneler i samme scener, ingen nye, ingen manglende,
  ingen konflikter og samme bildefrekvens. Revisjonene sjekkes på nytt rett før bruk. Ellers vises den som forslag
  med grunner, uten «Bruk innkommende».
- Paneler som mangler i returen slettes aldri. Paneler fra en annen produksjon/prosjekt avvises.
- Takhøyder per prosjekt og per retur (ingen globale køer); `source` i tabellene åpner for flere skriptprogrammer.

## 3. Tester
- `tests/unit/c5-sbpro.test.ts` (19): ES5/ingen hemmeligheter, menyknapper, SHA-256, nb/en-tekster, klient og
  kapabiliteter, oppryddingsvern, import (scener/paneler/timing/captions/kamera/referanse/bilder, lyd, feil
  adapter/versjon/fps), rundtur via manifest (uendret, tekst/timing, tapsfri rekkefølge med kommandoer, nytt
  panel/flytting/manglende = forslag, konflikt, utvalg, avvisning), enhetsflyt + retur + bilder + idempotens +
  utlogging mot `handleApiV1`, skriptets innlogging/fornyelse/opplasting mot synkron falsk server, feil prosjekt.
- DB: «0113 C-5 Storyboard Pro: klient, RLS, idempotent retur, kandidatvalg».
- Resultater: full Vitest 3137/0/10, DB 237/0, `npm run test:ssr` 8/8, tsc 0, i18n grønn, check_kb OK.

## 4. Ærlig roadmap / ikke gjort
- [ ] Verifisering i ekte Storyboard Pro (sjekklisten under).
- [ ] API-navnene i `PtG.sbpro` er etter beste kunnskap om Toon Boom-referansen, ikke prøvd. De står samlet ett sted.
- [ ] Retur via C-1-retursiden er ikke bygget; bare token-veien (oppdraget sa «eller»).
- [ ] Lag sendes ikke tilbake, bare flate panelbilder. Kamera går bare én vei (som tekst).
- [ ] Visuell nettlesertest av V-184 er ikke kjørt.
- Maskinoversatte tekster (de, fr, es, it, pt-BR, ru, ja, ko) for alle `c5.*`-nøkler må leses gjennom.

## 5. Sjekkliste for ekte prøving (Storyboard Pro 22+)
1. Installer etter README; knappene PtG_Login/Import/Export/Logout vises.
2. PtG_Login: kode vises; godkjenn på /koble; melding «Koblet til prosjektet». Sesjonsfilen finnes i hjemmemappen.
3. I appen: Storyboard → Storyboard Pro → Last ned pakke; pakk ut.
4. PtG_Import: riktig antall scener/paneler, timing, captions Dialogue/Action Notes/Notes/Camera/PtG Ref, bilder, lyd på riktig tid.
5. Endre en replikk, en varighet, bytt rekkefølge på to paneler i samme scene; PtG_Export.
6. I appen: kandidater for tekst, timing og bilder; «Rekkefølge og timing» kan brukes i ett steg; angre virker.
7. Legg til et panel og flytt et panel til en annen scene; eksporter: sammenstilling vises bare som forslag.
8. Endre et panel i appen før eksport fra Storyboard Pro: kandidaten merkes «Konflikt».
9. Velg ett panel og eksporter: bare det bildet lastes opp.
10. PtG_Logout, og prøv eksport: krever ny innlogging. Trekk tilbake tilgang i appen og prøv: avvist.
11. Bekreft eller rett hvert API-navn i `PtG.sbpro` og noter Storyboard Pro-versjonen.

## Endrede filer
Se svaret i chatten.
