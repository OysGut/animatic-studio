# After Effects-pakken: «dobbeltklikk og åpne» (PTG3) – rapport

## Hva er endret
1. **Stier:** `bygg-after-effects.jsx` finner nå sin egen mappe med `new File($.fileName).parent` og setter `Folder.current` til den. Alle medier og QR-bilder importeres via `ptgImport(rel)`, som slår opp `base + "/" + rel`. Mangler filer, vises ett varsel (nb og en) med listen, og byggingen stopper før noe halvferdig lages.
2. **Startfiler i ZIP-en:**
   - «Åpne i After Effects (Windows).bat»: bruker miljøvariabelen `PTG_AFTERFX` hvis den er satt, ellers leter den i `%ProgramFiles%\Adobe\Adobe After Effects 20xx\Support Files\AfterFX.exe` (2035 → 2018, nyeste først, også «CC 20xx»). Den kjører `AfterFX.exe -r "<full sti>\bygg-after-effects.jsx"`.
   - «Åpne i After Effects (Mac).command»: bruker `PTG_AFTERFX_APP` eller nyeste «Adobe After Effects 20xx» i /Applications, og kjører `DoScriptFile` via osascript. Filen får unix-modus 0755 i ZIP-ens sentralkatalog («laget på Unix»), så den kan kjøres etter utpakking.
   - Finnes ikke After Effects, gir begge en lesbar melding på nb og en (Mac: også et varselvindu).
3. **.aep-lagring:** til slutt kjører skriptet `app.project.save(new File(base + "/<prosjektkode>.aep"))`. Feiler lagringen, forklarer et varsel innstillingen «Allow Scripts to Write Files and Access Network», og prosjektet blir stående bygget, men ulagret.
4. **LESMEG** (nb og en) har en ny del om de tre veiene: dobbeltklikk startfilen, File > Scripts > Run Script File, og deretter .aep-filen. Den sier at overganger og tekstlag ikke gjenskapes, og at vi ikke kan lage .aep direkte fordi formatet er lukket.
5. **Tekstlag:** gjenskapes ikke. Lagmodellen (`CompositionLayer`) har ingen tekst, skrift eller tekstboks. Et lag uten fil er enten en fargeflate (gjenskapes som solid) eller et uferdig lag, og det finnes ingen tekst å gi `ptgTekst`. Dette krever en modellendring og er ikke gjort.

## Kjent begrensning
- Windows-startfilen leter bare i standardmappen under `%ProgramFiles%`. Andre installasjonssteder krever `PTG_AFTERFX`.
- På Mac kan Gatekeeper be om bekreftelse første gang en nedlastet .command åpnes (høyreklikk → Åpne).
- Utpakking med Windows Utforsker bevarer ikke unix-modus. Det har ingen betydning for .bat-filen.

## Tester
- `tests/unit/ptg3-ae.test.ts`: alle `importFile`-kall går via basemappen; manglende filer gir ett varsel og stopp; lagring til `/<pakke>/<kode>.aep`; mislykket lagring gir forklarende varsel og fortsetter; fortsatt ES3.
- `tests/unit/ae-launchers.test.ts`: innholdet i startfilene, unix-modus 0755 i sentralkatalogen og LESMEG på nb og en.
- tsc 0, full Vitest grønn (326 filer bestått, 2 hoppet over; 2547 tester), i18n-sjekken grønn. Ingen betalte kall, ingen migrasjon, ikke publisert.
- Fire nye tekster (`ptg3.ae-missing`, `ptg3.ae-save-failed`, `ptg3.ae-not-found`, `ptg3.readme-ae-open`): nb og en er skrevet selv; de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.

## Sjekkliste for ekte prøving (Mac og Windows)
Står i TODO.md under «Krever ekstern prøving».
- [ ] Startfilen åpner After Effects og kjører bygg-after-effects.jsx (Windows .bat, Mac .command etter utpakking).
- [ ] Uten After Effects installert: lesbar melding.
- [ ] Skriptet kjørt fra en annen mappe (File > Scripts) finner likevel alle medier.
- [ ] Flytt eller slett én mediefil: varsel med riktig filnavn og ingen halvferdig bygging.
- [ ] Lag: rekkefølge, navn, inn/ut-punkt, foreldre, masker og bildeskifter.
- [ ] Nøkkelbilder: riktig tid, easing (inn/ut) og hold.
- [ ] Bevegelsesbane: kurven følger banen fra appen.
- [ ] Kamera i begge modus (AE-kamera og 2D-parallakse): bevegelse og zoom stemmer med animaticen.
- [ ] Lyd: plassering, volumnøkler og fade.
- [ ] Tittelkort med QR: tekst, varighet på 1 s og QR-koden som kan skannes.
- [ ] .aep lagres i pakkemappen og kan dobbeltklikkes. Med skriptrettighetene av: forklarende varsel, og prosjektet er fortsatt bygget.

## Tillegg: .jsx åpner Audition på Mac (Øystein 23.10)
- Første linje i skriptet er `#target aftereffects`, så andre Adobe-programmer sender det videre til After Effects der det støttes.
- Rett under ligger vertskontrollen `if (typeof app.project === "undefined" || BridgeTalk.appName !== "aftereffects")`. Den viser et varsel på nb og en («Dette skriptet må kjøres i After Effects. Bruk startfilen «Åpne i After Effects» i samme mappe.») og stopper uten å gjøre noe. Resten av skriptet ligger i `ptgBygg()`, som bare kjøres i After Effects.
- Skriptet heter nå `bygg-after-effects.jsx`. Startfilene, LESMEG, varslene og testene er oppdatert.
- Startfilene skrives først i ZIP-en (Mac, så Windows, så skriptet og LESMEG).
- LESMEG har en ny del: dobbeltklikk på .jsx kan åpne et annet Adobe-program, for eksempel Audition. Bruk da startfilen, eller velg After Effects under «Åpne med» / i Finder via «Vis info» → «Åpne med».
- Sjekklisten får ett punkt til: [ ] Dobbeltklikk på .jsx i Audition gir varselet og gjør ingenting.
- Nye tekster: `ptg3.ae-wrong-host` og `ptg3.readme-ae-other-app`. Fire eksisterende tekster har fått det nye filnavnet (`ptg3.readme-ae`, `ptg3.ae-missing`, `ptg3.ae-not-found`, `ptg3.readme-ae-open`), og oversettelsene er oppdatert i alle språk. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.

## Tillegg 23.10: medier After Effects ikke kan importere

Første ekte prøving (Øystein): «File "….webm" is not a valid file type for import» på linje 28, og ingenting ble bygget.

**Årsak:** pakken kopierte mediene i originalformat. WebM-video (VP8/VP9) fra opptak og mobil, WebM/Opus-lyd og WebP/AVIF-bilder kan ikke importeres av After Effects, og første feil stoppet skriptet.

**Retting**
- Hviteliste i `src/core/interchange/media-formats.ts`: PNG, JPEG, TIFF, PSD, MOV, MP4, WAV, AIFF, MP3. Alt annet konverteres ved eksport, og eksporten kaster før skriving hvis noe utenfor listen likevel skulle havne i pakken.
- **Video → PNG-sekvens** (`media/<id>/<id>_00000.png …`), importert som sekvens med `conformFrameRate` lik filmens bildefrekvens. Valgt framfor ProRes-MOV fordi PNG-sekvens importeres av alle AE-versjoner på både Mac og Windows og av Nuke/Fusion uten kodeker, og har tapsfri alfa. Bildene strømmes rett inn i ZIP-en.
- **Lyd → WAV**, 16 bit PCM, 48 kHz. Lyd bestemmes av bruken (opptak har ofte «video/webm» selv om det bare er lyd).
- **WebP/AVIF → PNG.**
- Konverteringen skjer i nettleseren (`src/engine/export/media-convert.ts`); planen er ren kjernekode. Kan en fil ikke hentes eller konverteres, tas den ikke med og meldes som manglende.
- **Robust skript:** hver import ligger i try/catch. Feiler en import, får laget en grå solid med navnet (lydlag slås av), så strukturen og nøkkelbildene likevel bygges. Til slutt vises ett varsel på nb og en med filene som ikke kunne importeres. Filer som mangler helt i mappen stopper fortsatt byggingen, som før.
- **Nuke/Fusion (PTG7):** samme hviteliste og konvertering. Nuke leser sekvensen med `%05d`-mønster, Fusion med første bilde.
- **Klippeprogram (PTG6):** lager allerede egne MP4- og WAV-filer per skudd, så ingen kildeformater havner i pakken. Kjent restrisiko: kan nettleseren ikke kode H.264, blir MP4-filen VP9, som AE ikke leser. Ikke endret i denne runden.

**Tester:** `tests/unit/ae-media-formats.test.ts` (8): hvitelisten, planen for WebM-take/WebP/WebM-lyd, at skriptet peker på de konverterte filene og importerer sekvensen som sekvens, at pakken inneholder PNG-sekvens og WAV og ingen fil utenfor listen, at en fil som ikke kan konverteres meldes, at en feilet import gir plassholder og ett varsel, og at PTG7-pakken følger samme liste. Ekte dekoding i nettleseren er ikke testet automatisk.

**Ny tekst:** `ptg3.ae-import-failed` – nb og en skrevet selv; de, es, fr, it, ja, ko, pt-BR og ru maskinoversatt og merket for gjennomlesing.

**Krever ekstern prøving:** kjør pakken på nytt med en WebM-take og et lydopptak, og sjekk at sekvensen spilles med riktig fart og at lyden er med.
