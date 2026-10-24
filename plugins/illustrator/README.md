# From Pen to Glass – Adobe Illustrator (CEP-panel)

**Bygget, ikke verifisert i Illustrator.** / **Built, not verified in Illustrator.**

## Norsk

UXP for Illustrator er ikke offentlig ennå. Panelet er derfor en CEP-utvidelse (HTML-panel og ExtendScript) for Illustrator 27 og nyere. Vertslaget er tynt (`src/cep-ai.ts`, `jsx/host.jsx`), så resten kan flyttes til UXP senere.

Hva panelet gjør:
- **Åpne i Illustrator**: velg ressurs og versjon. Bildet blir en SVG med artboard i nøyaktig samme pikselstørrelse som ressursen. Den har et kildelag og et tomt tegnelag «Pen to Glass». Panelet åpner den, skriver koblingen i dokumentets XMP og lagrer en .ai ved siden av.
- **Åpne pakke**: en utpakket pakke fra Pen to Glass (Send til → SVG), for ressurs eller storyboardpanel, åpnes med lag, grupper, lagnavn og synlighet.
- **Send tilbake**: panelet leser koblingen fra XMP (aldri fra filnavnet) og eksporterer artboardet som PNG med alfa i ressursens størrelse. Filen sendes som ny kandidatversjon, og ingenting tas i bruk automatisk. Lagene blir liggende i .ai-filen. Ved konflikt får du tre valg. Storyboardpaneler sendes tilbake via retursiden (QR-koden i pakken).
- Innlogging skjer i nettleseren (PKCE, klient `ptg.illustrator`) eller med kode. Panelet inneholder ingen hemmeligheter.

### Installere for prøving (usignert)
1. Slå på feilsøkingsmodus for CEP (kreves for usignerte utvidelser):
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (gjenta med `CSXS.12`)
   - Windows: i Registerredigering, under `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`, lag strengverdien `PlayerDebugMode` = `1` (og i `CSXS.12`)
2. Hent `CSInterface.js` fra github.com/Adobe-CEP/CEP-Resources og legg den i `plugins/illustrator/vendor/`.
3. Kjør `bun plugins/illustrator/scripts/pack.ts`.
4. Kopier `dist/com.pentoglass.illustrator` til `~/Library/Application Support/Adobe/CEP/extensions/` (macOS) eller `%APPDATA%\Adobe\CEP\extensions\` (Windows).
5. Start Illustrator på nytt og åpne **Vindu → Utvidelser → From Pen to Glass**.
6. Feilsøking: legg en `.debug`-fil i utvidelsesmappen og koble Chrome DevTools til porten.

Signering (senere): `.zxp` lages med ZXPSignCmd og eget sertifikat (se `scripts/pack.ts`). Sertifikat og passord skal aldri inn i repoet.

## English

UXP for Illustrator is not public yet, so this is a CEP extension (HTML panel + ExtendScript) for Illustrator 27 and later. The host layer is thin (`src/cep-ai.ts`, `jsx/host.jsx`), so the rest can move to UXP later.

What it does:
- **Open in Illustrator**: choose an asset and version. The image becomes an SVG whose artboard has exactly the asset's pixel size, with a source layer and an empty "Pen to Glass" drawing layer. The panel opens it, writes the link into the document XMP and saves an .ai next to it.
- **Open package**: an unzipped Pen to Glass package (Send to → SVG), for an asset or storyboard panel, opens with its layers, groups, layer names and visibility.
- **Send back**: the panel reads the link from XMP (never from the file name) and exports the artboard as a PNG with alpha at the asset's size. It is sent as a new candidate version, and nothing is applied automatically. The layers stay in the .ai file. On a conflict you get three choices. Storyboard panels go back through the return page (the QR code in the package).
- Sign-in happens in the browser (PKCE, client `ptg.illustrator`) or with a code. The panel contains no secrets.

### Install for testing (unsigned)
1. Enable CEP debug mode (required for unsigned extensions):
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (repeat with `CSXS.12`)
   - Windows: in Registry Editor, under `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`, add the string value `PlayerDebugMode` = `1` (and in `CSXS.12`)
2. Get `CSInterface.js` from github.com/Adobe-CEP/CEP-Resources and put it in `plugins/illustrator/vendor/`.
3. Run `bun plugins/illustrator/scripts/pack.ts`.
4. Copy `dist/com.pentoglass.illustrator` to `~/Library/Application Support/Adobe/CEP/extensions/` (macOS) or `%APPDATA%\Adobe\CEP\extensions\` (Windows).
5. Restart Illustrator and open **Window → Extensions → From Pen to Glass**.
6. Debugging: add a `.debug` file to the extension folder and attach Chrome DevTools to the port.

Signing (later): a `.zxp` is made with ZXPSignCmd and your own certificate (see `scripts/pack.ts`). Certificate and password never go into the repo.
