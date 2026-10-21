# Rigg & 2D-utskrift (B-087) – testplan for fysisk prøve

Dato: 2026-10-21. Formål: kontrollere at PDF-en fra runde 4 skrives ut i eksakt fysisk størrelse på en ekte skriver, med linjal som referanse.

## Utstyr

- Skriver med A4- og A3-støtte (eller tilgang til printbutikk).
- Stållinjal eller målebånd med mm-inndeling (helst 0,5 mm-oppløsning).
- PDF-viser som støtter «faktisk størrelse / 100 %» (Adobe Acrobat Reader eller tilsvarende).
- Testfigur med kjent størrelse: 87,3 × 142,6 mm (samme som enhetstesten), helst med både alfa-kontur og hull.

## Forberedelser

1. Åpne prosjektet i Animatic Studio og velg en scene med testfiguren på en plate.
2. Åpne inspeksjonsvinduet fra lagpanelet eller Rigg-fanen.
3. Velg «Lag PDF» med kalibreringsmålestokk slått på (100 mm i mm-modus, 4 in i inches-modus).
4. Kryss av for alle informasjonsfeltene, inkludert en lang merknad.

## Utskrift

1. Åpne PDF-en i viseren. Kontroller at utskriftsdialogen står på «Faktisk størrelse» / «100 %» – **aldri** «Tilpass til side». Forhåndsvisningen i appen og dialogen varsler om dette; PDF-en ber om `PrintScaling=None`, men viseren kan likevel overstyre.
2. Skriv ut oversiktsarket (hvis figuren er delt) og alle arkene.

## Kontroll med linjal

| Kontroll | Krav |
|---|---|
| Kalibreringsmålestokk 100 mm | Nøyaktig 100,0 mm ± 0,5 mm målt med linjal |
| Målestokk i inches-modus (4 in) | Nøyaktig 101,6 mm ± 0,5 mm |
| Figurens bredde og høyde | 87,3 × 142,6 mm ± 0,5 mm i begge moduser (mm og inches) |
| Klippelinje | Sentrert på konturen, 0,1 mm tykk, mørk grå; figurens mål uendret med og uten linje |
| Kun-kontur-modus | Samme ytre mål som full figur; målestokken er med |
| Hull | Skåret ut bare når valget er på |
| Tiling | Overlappssonen er 10 mm; registreringsmerkene i tilstøtende ark dekker hverandre når arkene legges over hverandre mot lys; «rad/kolonne» stemmer med oversiktsarket |
| Informasjonsfelt | Alle avkryssede felt er med; bortvalgte felt mangler; lange merknader brytes uten å gå inn i figuren |
| Opp-pil | Peier i kameraets opp-retning i forhold til figuren; kontroller mot en rotert scene (0°, 90° og 37°) |
| Målesett | Bare med når «Teknisk referanseutskrift» er valgt; ellers skal ingen målinger synes |

## Registrering av avvik

Noter skriver, viser, papir, målt avvik i mm og hvilket kontrollpunkt det gjelder. Avvik over ± 0,5 mm på målestokken registreres som KI i KNOWN_ISSUES med målt verdi før eventuell justering av kalibreringen.
