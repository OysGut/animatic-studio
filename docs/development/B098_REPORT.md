# B-098 – «Legg til font …» fra Google Fonts

## Resultat
Fontvelgeren i tekstlagene (`TextInspector`, som brukes av sceneeditoren, MTS, maler og rulletekst) har nå
«Legg til font …» nederst. Dialogen søker i Google Fonts-katalogen, filtrerer på kategori og skriftsystem,
viser en forhåndsvisning med egen prøvetekst (standard med æ, ø og å, aldri manusinnhold), lar brukeren velge
vekter og stiler (høyst 8), viser lisensen og har lenken «Åpne Google Fonts» (ny fane). Navn og lenker fra
fonts.google.com kan limes inn i søket. UFL-fonter kan legges til, men får et varsel.

Fonten blir en ressurs av typen `font` i prosjektet. Etterpå står den under «Fonter i prosjektet» i alle
fontvelgere og lastes ved behov med `FontFace`. Hele «legg til» er ett angresteg.

**Typografiregelen er endret etter oppdrag B-098** (`src/core/typography/AGENTS.md`): tekstlag bruker den faste
katalogen pluss prosjektets fontressurser (`kind = 'font'`); begge lastes lat, og eksporten venter på `fontsReady`.

## Slik er det bygget
- **Personvern:** nettleseren henter aldri noe fra Google. Katalog, forhåndsvisning og nedlasting går via
  serverfunksjonene i `src/adapters/fonts/google-fonts.functions.ts` (krever innlogging). Serveren tillater bare
  `fonts.google.com`, `fonts.googleapis.com` og `fonts.gstatic.com` (pluss `www.googleapis.com`, bare for
  katalogen når nøkkelen finnes), bare https, og følger ikke omdirigeringer.
- **Katalogkilde:** `GOOGLE_FONTS_API_KEY` brukes automatisk hvis den finnes (Developer API); ellers kilden uten
  nøkkel (`fonts.google.com/metadata/fonts`). Katalogen bufres på serveren i 24 timer. Svaret valideres; har kilden
  endret form eller feiler den, vises «Google Fonts-katalogen er ikke tilgjengelig nå. Fonter som allerede er lagt
  til, virker som før.» Loggen har bare feiltypen, aldri nøkkel, adresse med nøkkel eller brukerdata.
- **Grenser:** høyst 4 MB per fil, 24 MB per font og 8 vekter/stiler per gang.
- **Forhåndsvisning:** serveren henter en liten woff2 med bare tegnene i prøveteksten (`text=`).
- **Lagring:** én fil per versjon, en «fontpakke» (`application/x-ptg-fontpack`, `.ptgfont`) med woff2 per
  skriftsystem (latin, latin-ext og et valgt skriftsystem) og ttf (hele fonten) for PDF. Metadata (familie, vekter,
  stiler, skriftsystemer, lisens, kilde-URL og versjon) ligger i `asset_versions.font_spec` og i pakkehodet.
  Én fil gjør at sikkerhetskopi, global publisering, opprydding og referansesjekk behandler fonten som enhver annen
  ressursfil, uten egen logikk.
- **Tekstlag** peker på fonten med `fontId = "asset:<ressurs-ID>"`.
- **Fjernet font:** laget beholder navnet. Teksten tegnes med reservefonten, og varselet om manglende font vises.
  I velgeren står den som «<navn> (fjernet – reservefont brukes)». Lagret data skrives aldri om.
- **Eksport** (video, PNG, alfa, ProRes) venter på `fontsReady`, som nå også laster prosjektfontene fra prosjektets
  lagring. Alt virker uten nett når fonten er lagt til.
- **Globalt bibliotek:** samme mønster som malene (0052): `font_spec` følger med ved «Lagre i globalt bibliotek»,
  ved publisering av ny versjon og ved «Bruk i prosjekt».
- **Lisens:** ingen av kildene oppgir lisens per familie. Lisensen tas fra kilden hvis den finnes, ellers fra
  kjente lister (Apache: Roboto-familien, Arimo, Tinos, Cousine m.fl.; UFL: Ubuntu), og resten er OFL.

## Migrasjon 0074 (`db/migrations/0074_project_fonts.sql`, bare additiv, ikke kjørt)
- `assets.kind` får `font`; `asset_versions_mime_type_check` får fontpakken.
- Nye kolonner `asset_versions.font_spec` og `global_asset_versions.font_spec` (jsonb, høyst 64 kB).
- `global_assets.kind` får `font`.
- **Erstattet funksjon:** `global_add_version` (fra 0052), kopiert ordrett med bare `p_font_spec jsonb default null`
  lagt til. Den gamle signaturen slettes som i 0052. GRANT som før: `revoke all from public, anon`,
  `grant execute to authenticated`.
- `apply_changes`, `delete_project` og `purge_*` er uendret: `apply_changes` skriver kolonnene radene har, og
  fontressurser slettes som andre ressurser. RLS er uendret (medlemmer leser, klienten skriver ikke direkte).
- `schema_version` 74; `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er satt til 74. **Appen venter
  skjemaversjon 74, så 0074 må kjøres før neste publisering.** Kommandoer med fonter krever 74 (`needsSchema74`).

## Tester
- `npx tsgo --noEmit`: rent. i18n-sjekk: 0 tekster uten engelsk; releasekontrollen bestått (nb og en komplette).
- Full Vitest: 2 169 bestått, 10 hoppet over, 0 feilet. Ny testfil `tests/unit/b098-fonts.test.ts` (18 tester):
  katalogfilter (navn, innlimt lenke, kategori, skriftsystem, sortering), lisensfeltet og UFL-varsel, tolking av
  begge kildene og avvisning når formen er endret, vertslisten (også `fonts.gstatic.com.evil.example` og
  metadata-IP), css2-tolking, fontpakke og metadata-validering, fontressurs med angring, at fontdata bare godtas for
  fontressurser, at en fjernet font beholder navnet og gir reserve, og at fontpakken vernes i oppryddingen
  (`ORPHAN_REFERENCE_TABLES` med `asset_versions`).
- DB-tester lokalt (Postgres 17.9): 150 bestått, 0 feilet. Ny test for 0074: fontressurs via `apply_changes`,
  `font_spec` leses tilbake, kind-, mime- og størrelseskontroll, RLS, global font med `font_spec`, og at
  `delete_project` virker med en fontressurs.
- Ny suite `tests/visual/fonts-google.mjs` (mocket katalog og en lokal OFL-fontfil, ingen nettkall mot Google):
  29/29 på nb og 29/29 med `UI_LANG=en`. Dekker inngang, søk, filtre, lenke, UFL-varsel, forhåndsvisning med egen
  prøvetekst, valg av vekter, lagring som ressurs med metadata, bruk i tekstlag, lasting med `FontFace`
  (samme lasting som eksporten venter på), angring og rolig melding når katalogen er nede.
- Regresjon, én om gangen: mts-engine 42/42, mts-credits 17/17, r5-poster-export 10/10.

## Avvik
- **Plakat:** plakatene har ikke fontvelger for tekstlag; plakat-PDF bruker PDF-standardskriftene. Inngangen er
  derfor bare i `TextInspector` (som godkjent).
- **PDF:** ttf lagres i pakken, men ingen PDF-eksport tegner tekstlag i dag, så innbygging er ikke i bruk ennå
  (TODO).
- **Developer API-vert:** `www.googleapis.com` er lagt til vertslisten, fordi Developer API ligger der. Den brukes
  bare for katalogen når nøkkelen finnes.
- **Testoppsett:** `tests/visual/mts-harness.mjs` har fått en valgfri `hooks.storage`, så suiten kan servere den
  opplastede fontpakken tilbake. Standard er uendret.

## Åpne spørsmål
- Lagringsbøtta: opplasting skjer som `application/octet-stream`. Gjenoppretting fra sikkerhetskopi sender
  `application/x-ptg-fontpack`; hvis bøtta har en liste over tillatte filtyper, må den typen være med (står i TODO).
