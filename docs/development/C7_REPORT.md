# C-7 Adobe Illustrator (CEP og ExtendScript) – rapport

**Status: bygget, ikke verifisert i Illustrator.** Alt er prøvd mot en falsk CSInterface og `window.cep.fs`, og mot en ExtendScript-modell som tolker kallene i `jsx/host.jsx` (dokumenter med lag, XMP og PNG-eksport). Det falske `/api/v1` (C-0) er brukt. Ingen ekte eksterne kall. Ikke publisert.

## 0. Migrasjoner
- `0113_c5_sbpro.sql` (`899aeb5629551ca038123ca5a653b573`) og `0114_c3_premiere.sql` (`edabb669594e894b1a44f9fd61ca644a`) er låst. Låsetesten dekker nå til og med 0114.
- Ingen databaseendring. Klienten `ptg.illustrator` med loopback og `ptg-illustrator://` fantes i 0111. Retur bruker det eksisterende C-0-mottaket.

## 1. Hva som er bygget
| Del | Fil | Merknad |
|---|---|---|
| Delt kjerne | `src/core/connectors/illustrator-svg.ts` (også `illustrator` i SDK-et) | SVG-bygging og -lesing med lag og grupper, lagnavn (`data-name` og `inkscape:label`), synlighet, opasitet, bilder, artboard i px, ppi og kobling i `<metadata>` og XMP. Leser også Illustrators egen eksport (`_x5F_`-id-er, `style`). Streng XML-leser: ingen DTD eller entiteter. |
| Vertslag (tynt) | `plugins/illustrator/src/host.ts`, `cep-ai.ts`, `jsx/host.jsx`, `main.ts` | `IllustratorHost` har seks operasjoner: openSvg, saveAi, readLink, writeLink, exportPng og docInfo. Filer og nettleser går gjennom CEP-verten fra Audition-panelet. |
| Logikk | `plugins/illustrator/src/controller.ts`, `ui.ts`, `strings.ts` | Kjenner bare SDK-et, kjernen og vertsgrensesnittene. |
| Pakking | `plugins/illustrator/scripts/pack.ts`, `CSXS/manifest.xml` | ILST 27+, CSXS 11, uten Node. Lager usignert mappe og ZIP. ZXP-signering er forberedt. |
| README | `plugins/illustrator/README.md` | nb og en, med PlayerDebugMode. |

### Ut
- **Ressursversjon** (PNG eller JPEG): størrelsen leses uten dekoding. SVG-en får `width/height` i px og `viewBox 0 0 B H`, så artboardet blir B × H. Dokumentet får et kildelag og et tomt tegnelag «Pen to Glass», og rasteroppløsningen settes (72 ppi er standard; C-1-pakker bærer sin egen ppi). Manifest v1 ligger ved siden av. Koblingen skrives i SVG-metadata og i dokumentets XMP (`urn:ptg:ns:1.0/`, egenskapen `link`). Der det går, lagres en `.ai` (PDF-kompatibel).
- **C-1-pakke** («Send til → SVG», ressurs eller storyboardpanel): sha-256 kontrolleres mot manifestet før noe åpnes, og pakker fra et annet prosjekt avvises. Lag, grupper, navn og synlighet blir med.

### Tilbake
Koblingen leses fra XMP, aldri fra filnavnet (testen gir dokumentet nytt navn). Artboardet eksporteres som PNG med alfa i ressursens nøyaktige pikselstørrelse og lastes opp som ny kandidatversjon. Den utsendte versjonen er grunnlaget, og idempotensnøkkelen kommer fra filens sha. Konflikter viser de tre valgene. «Bruk min» åpner appen og godkjenner aldri fra panelet. Ingenting tas i bruk automatisk.

**Begrensning:** SVG og .ai kan ikke lagres som ressursversjon i prosjektmodellen i dag (`ASSET_MIME_TYPES`, samme som PSD i C-2). Panelet sender derfor en flat PNG, og lagene blir liggende i .ai-filen hos brukeren. Å ta inn SVG som egen versjon krever en beslutning og rensing av SVG. Det står i TODO under «Krever Øystein». Storyboardpaneler sendes tilbake via C-1-retursiden; panelet sier fra og laster ikke opp.

### Takhøyder (per fil, ingen globale)
500 lag og noder, dybde 16, 16 384 px per side og 64 MB SVG. Overføringene har C-0s egne grenser per økt og prosjekt.

## 2. Tester
`tests/unit/c7-illustrator.test.ts` (18):
- rundtur av SVG med lag, grupper, navn med spesialtegn, synlighet, opasitet, bilde, størrelse, ppi og kobling;
- lesing av Illustrators egen SVG-eksport;
- avvisning av DTD/entiteter, for mange lag og ugyldig størrelse;
- lenkevalidering og opplastingsmål, og pikselstørrelse for PNG og JPEG;
- full flyt: innlogging, åpning i riktig størrelse med XMP, .ai og manifest, og retur som kandidat uten godkjenning;
- idempotens og kobling på XMP etter omdøping;
- konflikt med tre valg, panelpakke med lag og grupper (retur peker til retursiden), og pakke med feil sha;
- tilbaketrekking av tilgang;
- manifest uten Node, tynt vertslag, tekster på 10 språk, klientliste og README.

Resultater: full Vitest **3193 bestått / 0 feilet / 10 hoppet over**, DB **238/0**, `npm run test:ssr` **8/8**, tsc 0, i18n 0 mangler (inventaret er regenerert).

## 3. Sjekkliste for ekte prøving i Illustrator
1. Installer etter README: sett PlayerDebugMode for CSXS.11/12, legg `CSInterface.js` i `vendor/`, pakk og kopier, og start Illustrator på nytt.
2. Vindu → Utvidelser → From Pen to Glass: panelet vises på Illustrators språk.
3. Logg inn i nettleseren (lim inn adressen), og prøv også innlogging med kode.
4. Velg ressurs og versjon, og trykk «Åpne i Illustrator». Kontroller at artboardet er nøyaktig like mange piksler som ressursen (Dokumentoppsett), og at lagene «<navn> vN» og «Pen to Glass» finnes. Sjekk at `.ai` er lagret.
5. Fil → Filinformasjon → Rådata: `urn:ptg:ns:1.0/` `link` skal finnes.
6. Tegn i laget «Pen to Glass», lagre, gi gjerne filen nytt navn, og trykk «Send tilbake». I appen skal det komme en ny kandidatversjon (PNG med alfa i samme størrelse) som ikke er godkjent.
7. Konflikt: åpne en eldre versjon og send tilbake. Prøv alle tre valgene.
8. Åpne en C-1-pakke («Send til → SVG») for et storyboardpanel. Kontroller lag, grupper, navn og skjulte lag. «Send tilbake» skal vise retursiden-beskjeden.
9. Trekk tilbake tilgangen i Konto → Tilkoblinger. Neste handling skal logge ut.
10. Noter Illustrator-versjon, operativsystem og CEP-versjon.

## 4. Overgang til UXP når Adobe åpner det
1. Lag `plugins/illustrator/src/uxp-ai.ts` som implementerer `IllustratorHost` med Illustrators UXP-DOM (åpne, lagre som .ai, XMP, eksport, dokumentinfo), og en UXP-utgave av `Host` (filer via `uxp.storage`, nettleser via `uxp.shell`, tokens i `secureStorage` som `plugins/photoshop/src/token-store.ts`).
2. Bytt `main.ts` mot en UXP-inngang (`entrypoints.setup`) og `CSXS/manifest.xml` mot `manifest.json` v5 (mal: `plugins/photoshop`).
3. `controller.ts`, `ui.ts`, `strings.ts` og hele kjernen (`illustrator-svg.ts`, SDK-et) beholdes uendret. Testene byttes bare i vertsdelen.
4. Fjern `jsx/host.jsx` og `cep-ai.ts` når CEP-utgaven ikke lenger skal støttes.

## 5. Ærlig veikart
- [x] Låsing av 0113 og 0114, delt kjerne, CEP-panel, pakking/README og tester.
- [ ] Prøving i ekte Illustrator (sjekklisten over).
- [ ] SVG/.ai som egen ressursversjon: krever Øystein (TODO).
- [ ] Panelretur gjennom C-0 (i dag via C-1-retursiden).
- [ ] Usikkert: om Illustrator beholder `data-name` for alle grupper ved SVG-import, og om XMPMeta-kallene virker i alle versjoner.
- [ ] Tokens ligger ukryptert i panelets brukerdatamappe (CEP har ingen nøkkelring).
- [ ] Signert ZXP krever sertifikat.
- [ ] Maskinoversatte paneltekster (de, fr, es, it, pt-BR, ru, ja, ko) i `plugins/illustrator/src/strings.ts` må leses gjennom.
