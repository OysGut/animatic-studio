# From Pen to Glass – Toon Boom Storyboard Pro (skriptpakke)

**Status: bygget, ikke verifisert i Storyboard Pro.** Testet bare mot en falsk modell av Storyboard Pros skript-API.

---

## Norsk (bokmål)

### Krav
- Toon Boom Storyboard Pro 22 eller nyere (Windows eller macOS).
- `curl` på maskinen (følger med Windows 10/11 og macOS).
- En konto i From Pen to Glass med redigeringstilgang til prosjektet.

### Installasjon
1. Pakk ut `PtG-sbpro-<versjon>.zip` (lages med `bun plugins/toonboom-sbpro/pack.ts`).
2. Kopier alle `.js`-filene i mappen `PtG/` til skriptmappen for Storyboard Pro:
   - Windows: `%APPDATA%\Toon Boom Animation\Toon Boom Storyboard Pro\<versjon>-scripts\`
   - macOS: `~/Library/Preferences/Toon Boom Animation/Toon Boom Storyboard Pro/<versjon>-scripts/`
3. Start Storyboard Pro på nytt. Høyreklikk en verktøylinje → **Customize** og legg til knappene
   `PtG_Login`, `PtG_Import`, `PtG_Export` og `PtG_Logout`.

### Bruk
1. **PtG_Login**: skriptet viser en kode. Åpne lenken i en nettleser, logg inn og godkjenn koden for
   prosjektet. Tilgangen lagres i `~/.pentoglass/sbpro-session.json` (ikke i skriptmappen).
2. I Pen to Glass: Storyboard → **Storyboard Pro** → **Last ned pakke**. Pakk ut ZIP-filen.
3. **PtG_Import**: velg den utpakkede mappen. Paneler, bilder, timing, tekstfelt (Dialogue, Action Notes,
   Notes), kamerainstruksjon (caption «Camera») og midlertidig panellyd legges inn.
   Ikke endre captionen **PtG Ref**: den kobler panelet til Pen to Glass.
4. **PtG_Export**: velg en tom mappe. Paneler, timing og tekstfelt sendes tilbake. Er noen paneler valgt,
   sendes bare bildene for dem (tekst og timing sendes for alle).
5. I Pen to Glass blir alt **kandidater**. Ingenting tas i bruk automatisk. Ved konflikt velger du
   «Behold begge», «Behold gjeldende» eller «Bruk innkommende». Ny rekkefølge og timing kan brukes i ett
   steg bare når det er tapsfritt; ellers vises det som et forslag.
6. **PtG_Logout** trekker tilbake tilgangen.

---

## English

### Requirements
- Toon Boom Storyboard Pro 22 or later (Windows or macOS).
- `curl` on the computer (included with Windows 10/11 and macOS).
- A From Pen to Glass account that can edit the project.

### Installation
1. Unzip `PtG-sbpro-<version>.zip` (built with `bun plugins/toonboom-sbpro/pack.ts`).
2. Copy all `.js` files in the `PtG/` folder to the Storyboard Pro scripts folder:
   - Windows: `%APPDATA%\Toon Boom Animation\Toon Boom Storyboard Pro\<version>-scripts\`
   - macOS: `~/Library/Preferences/Toon Boom Animation/Toon Boom Storyboard Pro/<version>-scripts/`
3. Restart Storyboard Pro. Right-click a toolbar → **Customize** and add the buttons
   `PtG_Login`, `PtG_Import`, `PtG_Export` and `PtG_Logout`.

### Use
1. **PtG_Login**: the script shows a code. Open the link in a browser, sign in and approve the code for the
   project. Access is stored in `~/.pentoglass/sbpro-session.json` (not in the scripts folder).
2. In Pen to Glass: Storyboard → **Storyboard Pro** → **Download package**. Unzip it.
3. **PtG_Import**: choose the unzipped folder. Panels, images, timing, text fields (Dialogue, Action Notes,
   Notes), camera notes (caption “Camera”) and temporary panel sound are added.
   Do not edit the **PtG Ref** caption: it links the panel to Pen to Glass.
4. **PtG_Export**: choose an empty folder. Panels, timing and text fields are sent back. If panels are
   selected, only their images are sent (text and timing are sent for all panels).
5. In Pen to Glass everything becomes **candidates**. Nothing is applied automatically. On conflict, choose
   “Keep both”, “Keep current” or “Use incoming”. New order and timing can be applied in one step only when
   it is lossless; otherwise it is shown as a suggestion.
6. **PtG_Logout** revokes access.
