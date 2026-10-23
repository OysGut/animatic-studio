# Eksportvinduet og «Til produksjonen» – rapport (Øystein 23.10)

## Hva er endret
- **Bredde:** eksportvinduet åpner nå ca. 1280 px bredt (høyst vinduet minus 24 px marg på hver side). Det bruker den felles `ResizableDialogContent` (sizeKey `export-animatic`, minimum 560 px), så størrelsen kan dras og huskes som de andre store dialogene.
- **To kolonner:** når vinduet er minst 1000 px bredt, står animatic-eksporten (kvalitet, omfang, format, språk, alfa-eksport) til venstre og «Til produksjonen» til høyre. Smalere vindu gir én kolonne. Bryterne er container queries, så de følger dialogens bredde, ikke skjermens.
- **Felles for alle pakker:** prosjektkode og opptaksfrekvens (`InterchangeSettings`) står øverst i en kompakt boks.
- **Kort per mottaker:** Skuddliste, Dragonframe, After Effects, Kamera FBX, Klippeprogram, Compositing og Munnliste/leppesynk. Hvert kort har tittel, én linje om hva pakken er til, egne valg under tittelen og eksportknappen nederst til høyre. Kortene ligger i et grid med 2 kolonner når høyre kolonne er minst 560 px, ellers 1. Ingen faste bredder i kortene.
- **Kameramodus** vises både i After Effects- og Kamera FBX-kortet og er bundet til samme verdi.
- **Framdrift, «Avbryt», nedlastingslenke og feilmelding** vises i kortet som eksporterer.
- **Eksporthistorikken** (film/lyd og produksjonspakker) ligger i en sammenleggbar seksjon nederst.

## Uendret
Selve eksportene er ikke rørt (samme funksjoner, samme innstillinger). Alle eksisterende `data-testid` er beholdt. Nye: `ptg-card-<id>`, `ptg-camera-mode-fbx`, `export-animatic-column`, `export-history-section`.

## Tekster
16 nye nøkler (`ptg.layout.*`, `ptg.card.*`). nb og en er skrevet selv; de, es, fr, it, ja, ko, pt-BR og ru er maskinoversatt og merket for gjennomlesing.

## Tester
- tsc 0, full Vitest grønn (325 filer bestått, 2 hoppet over; 2538 tester), i18n-sjekken grønn.
- De visuelle PTG-suitene bruker bare testid-er som er beholdt. `ptg3-camera` har fått en kontroll av at kameramodus i FBX-kortet følger AE-kortet.
- **Ikke kjørt:** de visuelle PTG-suitene og skjermbildene ved 1280 og 800 px. De krever en innlogget bruker i forhåndsvisningen, og det finnes ingen innlogging jeg kan bruke uten at kontoen oppgis. Skjermbildene legges ved her når det er avklart.
