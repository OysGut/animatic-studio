# C-1 – Universell filvei («Send til …» og returside)

Status: bygget i kode. Ikke publisert. Migrasjon `db/migrations/0110_c1_handoffs.sql` er skrevet, ikke kjørt.

## Hva er bygget
- **«Send til …»** (dialog V-180) på ressurs (biblioteket), storyboardpanel, lydklipp (lydklippdialogen) og scene (sceneeditorens verktøylinje). Dialogen sier hva mottakeren får: redigerbare lag, flatt bilde, lyd med metadata eller tidslinje, at tekst og lapper blir bilde, og om filen kan sendes tilbake. Knappen vises først når databasen har versjon 110.
- **Formater** (ren kjerne i `src/core/handoff/`): PSD 8-bit RGB med navngitte lag (Unicode via `luni`), synlighet, opasitet, alfa, sammenslått bilde og XMP-merke; PNG med tekstmerke; SVG med metadata (bare ut, fordi SVG ikke er på C-0-hvitelisten); WAV/BWF med `bext` og `iXML` (tidskode, scene, ressurs-ID, klipp-ID); OTIO fra eksisterende `editorialOtio`. Alt pakkes i ZIP med manifest v1 og en kort veiledning.
- **Retur**: QR-kode og lenke `/r/<token>` (V-181), 48 timer, ett token per utsendelse, lagret bare som SHA-256-hash. `/retur` (V-182) for innloggede gjenkjenner filen bare ved merket inni den. Filnavn alene avvises.
- **Mottak** går gjennom C-0: kontrollsum, filendelse, magiske byte og 64 MiB-grense, opplasting i biter, idempotensnøkkel, og en ny kandidatversjon (`AddAssetVersion`). Aldri `ApproveAssetVersion`. Er originalen endret siden utsendelsen, opprettes en konflikt med de tre C-0-valgene.
- **PSD-retur** lagrer originalfilen uendret og en PNG-forhåndsvisning laget fra PSD-ens sammenslåtte bilde, slik at den kan vises, sammenlignes og brukes som skisse.
- **Storyboardpanel**: returnert fil blir et skjult kandidatlag og en versjon med notatet `{kind:"sketch",panelId}`, som SB-7 allerede finner som skissekilde.
- **Statusflate**: «Til behandling i …», «Returnert, venter på godkjenning» og «Konflikt ved retur» i biblioteket, scenen, lydklippet og storyboardpanelet.
- Tekster på alle registrerte språk; de andre enn nb/en er maskinoversatt og merket `review: "machine"`.

## Kontroller kjørt her
- `npx tsc --noEmit`: 0 feil.
- Full Vitest: 3074 bestått, 0 feilet, 10 hoppet over. Ny fil `tests/unit/c1-handoff.test.ts` (13 tester): PSD-lag ut og inn, PNG-merke, WAV/BWF-metadata, OTIO, ærlig SVG, gjenkjenning ved merke og lenke, avvisning ved bare filnavn og ved feil merke, tokenformat/utløp/tilbaketrekking, kandidat uten godkjenning, konflikt, avvist filtype og forkledd fil, ødelagt kontrollsum, manifestvalidering og statusflaten.
- i18n-kontroll: 0 feil på alle språk.
- `npm run test:ssr`: 8/8 (nå også `/retur` og `/r/<token>`). Skriptet finner serverbygget etter byggingen, fordi byggeoppsettet nå skriver til `dist/`.

## Ikke kjørt her (ærlig)
- **DB-tester for 0110**: lokal Postgres kunne ikke startes i dette miljøet. Claude kjører DB-testene og migrasjonen.
- **Nettlesertest** `tests/visual/c1-handoff.mjs` (nb/en, desktop/iPad/mobil) er skrevet, men ikke kjørt: Playwright for Node finnes ikke her, og pakker installeres ikke uten oppdrag.
- Ekte Procreate/Photoshop-rundtur er ikke prøvd med fysiske apper; formatene er testet med egen leser.

## Kjente begrensninger
- Bilder i PSD/PNG som lages i nettleseren er ukomprimerte (store filer for store paneler). Serveren komprimerer PNG-forhåndsvisningen.
- Panelretur lagres i flere kommandoer etter hverandre; feiler en midt i, kan en ressurs uten lag bli liggende (ingenting går tapt eller tas i bruk).
- Konflikt for panel lagrer ikke versjonsgrunnlag (panelet har revisjon, ikke versjon).
- SVG kan ikke sendes tilbake før SVG eventuelt kommer på hvitelisten (sikkerhetsspørsmål).
