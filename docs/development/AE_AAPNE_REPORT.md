# After Effects-pakken: «dobbeltklikk og åpne» (PTG3) – rapport

## Hva er endret
1. **Stier:** `bygg.jsx` finner nå sin egen mappe med `new File($.fileName).parent` og setter `Folder.current` til den. Alle medier og QR-bilder importeres via `ptgImport(rel)`, som slår opp `base + "/" + rel`. Mangler filer, vises ett varsel (nb og en) med listen, og byggingen stopper før noe halvferdig lages.
2. **Startfiler i ZIP-en:**
   - «Åpne i After Effects (Windows).bat»: bruker miljøvariabelen `PTG_AFTERFX` hvis den er satt, ellers leter den i `%ProgramFiles%\Adobe\Adobe After Effects 20xx\Support Files\AfterFX.exe` (2035 → 2018, nyeste først, også «CC 20xx»). Den kjører `AfterFX.exe -r "<full sti>\bygg.jsx"`.
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
- [ ] Startfilen åpner After Effects og kjører bygg.jsx (Windows .bat, Mac .command etter utpakking).
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
