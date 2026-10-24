# From Pen to Glass for Photoshop (UXP)

Status: **bygget, ikke verifisert i Photoshop** / **built, not verified in Photoshop**. Se `docs/development/C2_REPORT.md`.

## Norsk

**Krav:** Adobe Photoshop 27.0 eller nyere (macOS eller Windows) og en konto i From Pen to Glass med redigeringstilgang til prosjektet.

**Lag installasjonsfila** (fra rotmappen i repoet):

```
bun plugins/photoshop/scripts/pack.ts
```

Det lager `plugins/photoshop/dist/com.pentoglass.photoshop_<versjon>.ccx` og en utpakket mappe i `plugins/photoshop/dist/`.

**Installer (sidelasting):**
1. Enklest: dobbeltklikk på `.ccx`-fila. Creative Cloud-appen spør om du vil installere en plugin fra utenfor Marketplace; svar ja.
2. For utvikling: åpne **UXP Developer Tool**, velg **Add Plugin…**, pek på `plugins/photoshop/dist/manifest.json`, og trykk **Load**.
3. I Photoshop: **Plugins → From Pen to Glass → Pen to Glass** åpner panelet.

**Bruk:**
1. **Logg inn i nettleseren.** Nettleseren åpner From Pen to Glass. Velg prosjekt og godkjenn. Siden viser en adresse som starter med `ptg-photoshop://`; kopier den og lim den inn i panelet, og trykk **Fullfør innlogging**. Alternativ: **Logg inn med kode i stedet**.
2. Velg en ressurs og trykk **Åpne fra Pen to Glass** på versjonen du vil jobbe med.
3. Endre lag som vanlig, og trykk **Send tilbake**. Resultatet blir en ny kandidatversjon; ingenting tas i bruk automatisk.
4. Har noen godkjent en annen versjon i mellomtiden, får du tre valg: **Behold begge**, **Behold gjeldende** eller **Bruk min** (godkjennes i appen).
5. Tilgangen kan trekkes tilbake under **Konto → Koblede programmer** i From Pen to Glass.

Ingen hemmeligheter ligger i pluginen. Innloggingen lagres kryptert i Photoshops sikre lager.

## English

**Requirements:** Adobe Photoshop 27.0 or newer (macOS or Windows) and a From Pen to Glass account with edit access to the project.

**Build the installer** (from the repository root):

```
bun plugins/photoshop/scripts/pack.ts
```

This creates `plugins/photoshop/dist/com.pentoglass.photoshop_<version>.ccx` and an unpacked folder in `plugins/photoshop/dist/`.

**Install (sideload):**
1. Easiest: double-click the `.ccx` file. The Creative Cloud app asks whether to install a plugin from outside the Marketplace; answer yes.
2. For development: open **UXP Developer Tool**, choose **Add Plugin…**, select `plugins/photoshop/dist/manifest.json` and press **Load**.
3. In Photoshop: **Plugins → From Pen to Glass → Pen to Glass** opens the panel.

**Use:**
1. **Sign in in the browser.** The browser opens From Pen to Glass. Pick a project and approve. The page shows an address starting with `ptg-photoshop://`; copy it, paste it into the panel and press **Finish sign-in**. Alternative: **Sign in with a code instead**.
2. Pick an asset and press **Open from Pen to Glass** on the version you want to work on.
3. Edit layers as usual and press **Send back**. The result becomes a new candidate version; nothing is put into use automatically.
4. If someone approved another version in the meantime, you get three choices: **Keep both**, **Keep current** or **Use mine** (approved in the app).
5. Access can be revoked under **Account → Connected programs** in From Pen to Glass.

The plugin contains no secrets. The sign-in is stored encrypted in Photoshop's secure storage.

## Adobe Marketplace (later, not submitted)

Prepared in `marketplace/LISTING.md`. Before submitting: real icons (the build draws placeholders), screenshots from a real Photoshop session, a privacy policy URL, and the checklist in `C2_REPORT.md` passed.
