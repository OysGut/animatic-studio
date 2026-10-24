# From Pen to Glass for Adobe Premiere Pro (UXP)

**Status: bygget, ikke verifisert i Premiere Pro.** / **Status: built, not verified in Premiere Pro.**

Krever Premiere Pro 25.6 eller nyere (UXP er ute av beta fra 25.6). / Requires Premiere Pro 25.6 or newer (UXP left beta in 25.6).

---

## Norsk (bokmål)

### Installer (sidelasting)
1. Bygg pakken: `bun plugins/premiere/scripts/pack.ts`. Resultatet ligger i `plugins/premiere/dist/com.pentoglass.premiere_<versjon>.ccx`.
2. Dobbeltklikk .ccx-filen (Creative Cloud installerer den), eller åpne **UXP Developer Tool**, velg **Add Plugin** og pek på `plugins/premiere/dist/manifest.json`, og trykk **Load**.
3. Start Premiere Pro og åpne **Vindu → UXP-tillegg → Pen to Glass**.

### Logg inn
1. Trykk **Logg inn i nettleseren**. Nettleseren åpner Pen to Glass, der du velger prosjekt og godkjenner tilgangen.
2. Nettleseren viser en adresse som begynner med `ptg-premiere://`. Kopier den, lim den inn i panelet og trykk **Fullfør innlogging**.
3. Går ikke det, trykk **Logg inn med kode i stedet** og skriv koden på siden som åpnes.

Panelet har ingen hemmeligheter. Tilgangen lagres i Premieres sikre lager, og du kan trekke den tilbake under **Konto** i Pen to Glass.

### Send storyboardet til Premiere
1. I Pen to Glass: åpne **Storyboard** og trykk **Premiere Pro → Last ned sekvenspakke**.
2. Pakk ut ZIP-filen i en egen mappe (den inneholder `sequence.xml`, `sequence.otio`, `manifest.json`, `panels/` og `audio/`).
3. I panelet: trykk **Åpne sekvenspakke** og velg mappen. Premiere importerer sekvensen med panelbilder, varighet, overganger og lyd (dialog, musikk og effekter).

Hvert panelklipp har en markør `ptg:panel:<ID>@<revisjon>`. Ikke slett markørene; de kobler klippene til panelene. Du kan gi klippene nye navn uten problem.

### Send rekkefølge og rytme tilbake
1. Klipp sekvensen i Premiere: flytt, trim eller fjern panelklipp.
2. Åpne sekvensen og trykk **Send rekkefølge og rytme tilbake**.
3. I Pen to Glass (Storyboard → Premiere Pro) ser du forslagene side om side og godtar eller avviser hvert panel. Ingenting tas i bruk før du godtar, og du kan angre. Scener, scenenumre og manus endres aldri.

---

## English

### Install (sideload)
1. Build the package: `bun plugins/premiere/scripts/pack.ts`. The result is `plugins/premiere/dist/com.pentoglass.premiere_<version>.ccx`.
2. Double-click the .ccx file (Creative Cloud installs it), or open **UXP Developer Tool**, choose **Add Plugin**, select `plugins/premiere/dist/manifest.json` and press **Load**.
3. Start Premiere Pro and open **Window → UXP Plugins → Pen to Glass**.

### Sign in
1. Press **Sign in in the browser**. The browser opens Pen to Glass, where you choose a project and approve access.
2. The browser shows an address starting with `ptg-premiere://`. Copy it, paste it into the panel and press **Finish sign-in**.
3. If that does not work, press **Sign in with a code instead** and enter the code on the page that opens.

The panel contains no secrets. Access is stored in Premiere's secure storage, and you can revoke it under **Account** in Pen to Glass.

### Send the storyboard to Premiere
1. In Pen to Glass: open **Storyboard** and press **Premiere Pro → Download sequence package**.
2. Unzip the ZIP file into its own folder (it contains `sequence.xml`, `sequence.otio`, `manifest.json`, `panels/` and `audio/`).
3. In the panel: press **Open sequence package** and choose the folder. Premiere imports the sequence with panel images, durations, transitions and audio (dialogue, music and effects).

Each panel clip carries a marker `ptg:panel:<ID>@<revision>`. Do not delete the markers; they link clips to panels. Renaming clips is fine.

### Send order and pacing back
1. Edit the sequence in Premiere: move, trim or remove panel clips.
2. Open the sequence and press **Send order and pacing back**.
3. In Pen to Glass (Storyboard → Premiere Pro) you see the suggestions side by side and accept or reject each panel. Nothing is applied until you accept, and you can undo. Scenes, scene numbers and the script never change.

---

Adobe Marketplace: ikke sendt inn. Manifestet (v5, `host.app = "premierepro"`, nettverk bare til `https://pentoglass.com`) er klart for senere innsending. / Not submitted to Adobe Marketplace yet.
