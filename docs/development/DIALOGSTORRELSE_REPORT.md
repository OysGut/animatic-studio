# Dialoger som kan endres i størrelse (Øystein 23.10)

## Hva er endret
- **Felles komponent:** `src/app/shared/ResizableDialogContent.tsx` bygger på shadcn-dialogen. De rene reglene (grenser, dra, tastatur, gyldig lagret verdi) ligger i `src/app/shared/dialog-size.ts`. Regelen står som nr. 63 i AGENTS.md.
- **Dra:** høyre kant (markør ↔), nedre kant (↕) og et synlig grep nede til høyre (↘). Grepene står fast i dialogens synlige ramme også når innholdet rulles.
- **Posisjon:** dialogen **holdes sentrert**. Det er samme oppførsel som i dag, så dialogen hopper ikke. Bredden endres med det dobbelte av musebevegelsen, slik at kanten følger markøren.
- **Grenser:** hver dialog har et minimum, som standard 480 × 320 px. Maksimum er vinduet minus 24 px på hver side. Krymper vinduet, krymper dialogen tilsvarende, også under minimum.
- **Huskes per dialogtype og bruker** via det eksisterende visningsvalget (`useUiPref`). Det lagres i nettleseren med en gang (try/catch) og på kontoen i `profiles.ui_prefs` (migrasjon 0034). Størrelsen følger altså med til andre maskiner. **Ingen ny migrasjon, og 0089 trengs ikke.** Uten kontoens lager (isolerte visninger og tester) lagres størrelsen bare i nettleseren.
- **Tilbakestilling:** dobbeltklikk på grepet, eller den lille knappen «Standardstørrelse» som vises når en egen størrelse er valgt.
- **Tastatur:** grepet kan få fokus og har aria-label og verktøytips. Shift + piltaster endrer størrelsen med 20 px per trykk.
- **Smal skjerm (under 768 px):** ingen grep og ingen egen størrelse. Dialogen oppfører seg som i dag.

## Dialoger som har fått det (44)
Ressursbildet / karakter-popupen (`LayerImageDialog`, med GenerateImagePanel), AI-panelet, dialogeditoren for AI-replikker (`AiDialogueDialog`), dialogmassegenerering, eksport av animatic og manus, «Til produksjonen» / langfilmimport og språkversjoner, global bibliotek, arbeidsliste, bildeviser (lightbox), bildesammenligning, frilegging, ny opplasting, papirkurv, bibliotekforslag, godkjenningskonsekvenser, leverandører, filmens visuelle stil, produksjon, promotering, relasjoner, Story Lab (profil og forslag), hurtigtaster, skrifttyper, linjekoblinger, manusversjoner, manusimport, oversettelsesimport, stillbildevelger, sammenligning av versjoner og takes, videobatch, scene til video, generer scene, legg til lyd, ta opp lyd, lydklippredigering, legg til lag, lagbytter, ansiktsmerking og munnformer. Små bekreftelsesdialoger er ikke endret.

**Asset Studio** er ikke endret. Den fyller allerede hele vinduet (`inset-2`), og dialogene inni er små bekreftelser.

## Innhold som flyter
Miniatyrlister bruker nå `repeat(auto-fill, minmax(…))` og får flere kolonner når dialogen blir bredere. Det gjelder velgeren «Legg til bilde …», stillbildevelgeren, «Legg til lag» og språklisten i språkversjoner. Sidepanelet i bildeviseren har gått fra fast 340 px til en bredde mellom 280 og 440 px. GenerateImagePanel brukte allerede container-spørringer. Andre dialoger hadde for det meste allerede flytende innhold. Faste to-kolonne-oppsett for sammenligninger er beholdt med vilje.

## Tester
`tests/unit/dialog-size.test.tsx` (11 tester):
- grenser for minimum og maksimum, også når vinduet krymper
- dra som holder dialogen sentrert
- Shift + piltaster
- smal skjerm, og at ødelagte lagrede verdier avvises
- gjenoppretting per dialogtype, og at en for stor lagret størrelse krymper til vinduet
- tastatur som lagrer, og tilbakestilling med dobbeltklikk og med knappen
- lagring bare i nettleseren uten kontoens lager
- ingen grep på smal skjerm

tsc 0 og full Vitest grønn (325 filer bestått, 2 hoppet over). i18n-sjekken er grønn. Ingen betalte kall og ingen migrasjon.

## Ikke gjort
- **Visuell sjekk på nb og en** (bred og smal) er ikke kjørt. Forhåndsvisningen har ingen innlogget bruker, og prosjektet har flere kontoer. Ingen av dem matcher eierens e-post, så det må velges hvilken konto sjekken skal kjøres som.

## Språk
To nye nøkler: `dialog.resize.grip` og `dialog.resize.reset`. nb og en er skrevet selv. de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.
