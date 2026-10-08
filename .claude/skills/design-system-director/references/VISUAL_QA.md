# Visuell QA – sjekkliste og skjermbildeprosedyre

Gjelder all UI-endring. En komponent eller arbeidsflate er ikke ferdig før skjermbildene er tatt, *sett på* og funnet i orden. «Rendrer uten feil» og grønne enhetstester er ikke nok.

## 1. Skjermbildeprosedyre (Playwright Test, TypeScript)

1. **Start appen lokalt** (`npm run dev` eller `npm run build && npm run preview` – sjekk skriptene i `package.json`). Bruk testdata, aldri hele manusfiler: korte utdrag fra `tests/fixtures/screenplay/` (DEC-0004) og syntetiske prosjekter fra testfabrikker.
2. **Seed tilstand** via testfabrikk/RPC slik at bildet viser realistisk innhold: minst 30 scener, scenenumre med hull (f.eks. 41, 42, 42A, 45), én deaktivert scene, ett åpent avvik, én usikker tolkning, én jobb i hver status, to brukere i presence.
3. **Ta bilder** med `page.screenshot({ fullPage: false })` eller `expect(page).toHaveScreenshot(name)`:
   - Bredder: **1280 × 800**, **1440 × 900**, **1920 × 1080** (deviceScaleFactor 1) og 1440 × 900 med **deviceScaleFactor 2** (kamerarammer, 1 px-linjer).
   - Tilstander: standard, hover (bruk `locator.hover()`), tastaturfokus (`keyboard.press('Tab')`), valgt, deaktivert, laster, tom, feil, avvik, usikker, låst av annen bruker.
   - `emulateMedia({ reducedMotion: 'reduce' })` for minst én kjøring; animasjoner skal da ikke vises.
   - Stabiliser: vent på fonter (`document.fonts.ready`), skru av blinkende markør, fast dato/klokke.
4. **Lagre** i `tests/visual/__screenshots__/<arbeidsflate>/<komponent>-<tilstand>-<bredde>.png`. Referansebilder oppdateres bare bevisst (`--update-snapshots`) med begrunnelse i commit-meldingen.
5. **Se på bildene.** Åpne hvert bilde og gå gjennom sjekklisten under. Noter funn i `CURRENT_WORK.md`.
6. **Rett, ta nye bilder, gjenta** til listen er grønn. Avvik som ikke rettes nå → `KNOWN_ISSUES.md` med skjermbildesti.
7. **Vis Mars** de viktigste bildene (før/etter) med en kort norsk forklaring når endringen er synlig for brukeren.

## 2. Sjekkliste

### Helhet
- [ ] Materialet (manus, bilde, film) er det visuelt viktigste; kromet trer tilbake.
- [ ] Ser ut som samme produkt som resten av appen (radier, linjer, tetthet, ikoner).
- [ ] Ingen mønstre fra [ANTI_PATTERNS.md](ANTI_PATTERNS.md).
- [ ] Ingen horisontal rulling eller avkuttet innhold ved 1280 px.

### Farge og kontrast
- [ ] Bare tokens; ingen nye farger uten DESIGN_SYSTEM-oppdatering.
- [ ] Tekst ≥ 4,5:1, store titler ≥ 3:1, kontrollkanter/fokusring ≥ 3:1 (mål med pipette + kalkulator ved tvil).
- [ ] Status vises med ikon + tekst, ikke bare farge. Riktig statusfarge per status (DESIGN_SYSTEM §2.4).
- [ ] Blå/rød brukes bare til kamerarammer i lerretet.

### Typografi og tall
- [ ] Riktig skalatrinn; ingen tekst under 11 px.
- [ ] Tidskoder i monospace, tall-kolonner med tabulære tall (ingen «hopping» under avspilling).
- [ ] Manus i manusfont med korrekt innrykk for elementtypene; ingen teknisk metadata i standardvisning.
- [ ] Norsk tekst, betegnelser fra mandat 30.3, ingen avkuttede norske ord («Godkjenn eksisterende film» får plass).

### Layout og avstand
- [ ] Avstander fra 4 px-skalaen; justering i rette linjer; konsekvent panelmarg.
- [ ] Tetthet riktig for konteksten (kompakt i tidslinje/lister, komfortabel i dialoger).
- [ ] Trefflater ≥ 24 × 24 px; trim-håndtak lette å treffe.

### Tilstander
- [ ] Fokusring synlig på alle interaktive elementer ved tastaturnavigasjon.
- [ ] Tom-, laste- og feiltilstand har innhold som forklarer hva som skjer og hva man kan gjøre.
- [ ] Deaktivert scene ser deaktivert ut (dempet + merkelapp), ikke slettet.
- [ ] Avviksmarkør synlig der mandat 21.4 krever det.
- [ ] «Låst/redigeres av …» vises ved samtidig redigering.

### Domenespesifikt
- [ ] Kamerarammer ~1 fysisk px ved deviceScaleFactor 2; synlige mot både lyst og mørkt kunstverk; ikke med i eksportert bilde (sammenlign eksportert bilde).
- [ ] Scenenummer vises, men URL/`data-*`-attributter bruker ID-er (INV-02).
- [ ] Tidslinjens scenerekkefølge = manusets rekkefølge i samme skjermbilde (INV-01).

### Bevegelse
- [ ] Med `reducedMotion: 'reduce'` vises ingen overgangsanimasjoner.
- [ ] Ingen animasjon på avspillingshode, scrubbing eller snapping.

## 3. Automatisering som støtter (men ikke erstatter) å se på bildene
- `toHaveScreenshot` for regresjon (terskel `maxDiffPixelRatio` settes lavt, f.eks. 0,001).
- `@axe-core/playwright` for tilgjengelighetsregler (pinnet versjon).
- Enhetstest som beregner kontrast for alle definerte tekst/flate-par i tokenfila.
