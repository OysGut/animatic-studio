# From Pen to Glass – Adobe Audition (CEP-panel)

**Bygget, ikke verifisert i Audition.** / **Built, not verified in Audition.**

## Norsk

Audition har ikke UXP. Panelet er derfor en CEP-utvidelse (HTML-panel + ExtendScript) for Audition 24 og nyere.

Hva panelet gjør:
- **Hent lyden til Audition**: velg scene (eller ett storyboardpanel). Dialog, musikk, effekter, atmosfære og midlertidig panellyd lagres som WAV/BWF med ID-er i iXML/bext og markører for panel og replikk, pluss en multitrack-økt (`.sesx`) som panelet prøver å åpne. Filer som ikke er WAV hoppes over (konverter dem i Pen to Glass først).
- **Send redigert lyd tilbake**: velg de redigerte WAV-filene. Panelet leser ID-ene fra metadata (aldri fra filnavnet) og sender hver fil som ny kandidatversjon. Ingenting tas i bruk automatisk. Ved konflikt får du tre valg: Behold begge, Bruk den andres, eller Bruk min (velges i appen).
- Innlogging skjer i nettleseren (PKCE, klient `ptg.audition`) eller med kode. Panelet inneholder ingen hemmeligheter.

Viktig ved lagring i Audition: bruk **Lagre** (ikke «Lagre som» med ny metadata-mal) og la «Inkluder markører og andre metadata» stå på, slik at ID-ene følger med.

### Installere for prøving (usignert)
1. Slå på feilsøkingsmodus for CEP (kreves for usignerte utvidelser):
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (gjenta med `CSXS.12` hvis Audition bruker CEP 12)
   - Windows: i Registerredigering, under `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`, lag strengverdien `PlayerDebugMode` = `1` (og i `CSXS.12`)
2. Hent `CSInterface.js` fra github.com/Adobe-CEP/CEP-Resources og legg den i `plugins/audition/vendor/`.
3. Kjør `bun plugins/audition/scripts/pack.ts`.
4. Kopier mappen `dist/com.pentoglass.audition` til
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
   - Windows: `%APPDATA%\Adobe\CEP\extensions\`
5. Start Audition på nytt og åpne **Vindu → Utvidelser → From Pen to Glass**.
6. Feilsøking: legg en `.debug`-fil i utvidelsesmappen og åpne Chrome DevTools mot porten den angir.

Signering (senere): en `.zxp` lages med Adobes ZXPSignCmd og eget sertifikat (se kommentaren i `scripts/pack.ts`). Sertifikat og passord skal aldri inn i repoet.

## English

Audition has no UXP, so this is a CEP extension (HTML panel + ExtendScript) for Audition 24 and later.

What it does:
- **Bring the audio into Audition**: choose a scene (or one storyboard panel). Dialogue, music, effects, ambience and temporary panel audio are saved as WAV/BWF with IDs in iXML/bext and markers for panels and lines, plus a multitrack session (`.sesx`) the panel tries to open. Non-WAV files are skipped (convert them in Pen to Glass first).
- **Send edited audio back**: choose the edited WAV files. The panel reads the IDs from the metadata (never from the file name) and sends each file as a new candidate version. Nothing is applied automatically. On a conflict you get three choices: Keep both, Use theirs, or Use mine (chosen in the app).
- Sign-in happens in the browser (PKCE, client `ptg.audition`) or with a code. The panel contains no secrets.

When saving in Audition: use **Save** and keep "Include markers and other metadata" on, so the IDs travel with the file.

### Install for testing (unsigned)
1. Enable CEP debug mode (required for unsigned extensions):
   - macOS: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (repeat with `CSXS.12` if Audition uses CEP 12)
   - Windows: in Registry Editor, under `HKEY_CURRENT_USER\Software\Adobe\CSXS.11`, add the string value `PlayerDebugMode` = `1` (and in `CSXS.12`)
2. Get `CSInterface.js` from github.com/Adobe-CEP/CEP-Resources and put it in `plugins/audition/vendor/`.
3. Run `bun plugins/audition/scripts/pack.ts`.
4. Copy `dist/com.pentoglass.audition` to
   - macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
   - Windows: `%APPDATA%\Adobe\CEP\extensions\`
5. Restart Audition and open **Window → Extensions → From Pen to Glass**.
6. Debugging: add a `.debug` file to the extension folder and point Chrome DevTools at the port it lists.

Signing (later): a `.zxp` is made with Adobe's ZXPSignCmd and your own certificate (see the comment in `scripts/pack.ts`). Certificate and password never go into the repo.
