# Bevegelsesbane: tempo-forhåndsvisning og avstandsspor (Øystein 23.10)

## A. Feil: tempo-forhåndsvisningen oppdaterte seg ikke stabilt

**Reprodusert i test først** (`tests/unit/bane-tempo.test.tsx`). Tre årsaker:
1. Tempokurven i inspektøren tegnet bare tempopunktene (`tempoAt`) og tok ikke med ease ut/inn i det hele tatt. Endring av ease ga derfor aldri ny kurve.
2. Ease-glidebryterne lagret først ved slipp, og ingenting leste verdien under dra.
3. Det oransje spacing-verktøyet på tidslinjen sendte forhåndsvisningen bare til scenen. Inspektøren fikk den lagrede tilstanden og ble oppdatert først etter slipp, og det var det som så «ustabilt» ut.

**Retting:** nytt lite utkastlager (`src/app/scene-editor/motion-draft.ts`, samme mønster som bildelageret i N8). Glidebryterne, tempokurven og spacing-draget skriver utkastet for hvert steg. Inspektøren, scenen og det nye sporet på tidslinjen leser det samme utkastet. Ved slipp kjøres én kommando som før, og utkastet fjernes; angre og gjør om gir ny lagret bane og oppdaterer alt. Tempokurven viser nå også den faktiske fremdriften (oransje linje) fra `pathProgress`, med ease, ved siden av den redigerbare kurven. Utkastet virker uavhengig av avspillingen.

## B. Avstandsmerker på tidslinjen

- Ny ren funksjon `pathSpacingMarks` (`src/core/animation/path-spacing.ts`): ett merke per bilde med andel av strekningen langs banen, nøkkelbilde (start, slutt, tempopunkter, lagets nøkkelbilder) og hold (stillstand, også toere).
- Under valgt lag på tidslinjen vises et smalt spor «Avstand» (`PathSpacingTrack.tsx`), tegnet på canvas: merkene ligger etter strekningen over banens tidsrom, så de samles der laget går sakte og sprer seg der det går fort. Nøkkelbilder er høye oransje streker, hold er ringer, og gjeldende bilde har en oransje prikk.
- Bare sporet abonnerer på utkastet og avspillingshodet, så tidslinjen tegnes ikke på nytt per dra-steg (N5/N8).

**Avvik:** oppdraget viser til merker som allerede finnes i scenen. Jeg fant ingen avstandsmerker per bilde der; scenen viste bare banen, punktene og gjeldende posisjon. Merkene i scenen er derfor lagt til nå, fra samme `pathSpacingMarks`, slik at de to aldri kan være ulike. Si fra hvis du mente et annet verktøy.

## Tester
- `tests/unit/bane-tempo.test.tsx` (8): merkene kommer fra `pathProgress`/`pathPointAt`, ease samler merkene, hold, at scene og spor bruker samme funksjon og samme utkast, at sporet følger utkastet live, at forhåndsvisningen endres under dra med ease ut og ease inn før slipp (og lagrer én gang ved slipp), for hvert steg med tempoverktøyet, og ved angre og gjør om.
- Visuell sjekk på nb og en er ikke kjørt: forhåndsvisningen har ingen innlogget bruker.

## Nye tekster
`pathSpacing.track`, `pathSpacing.aria`: nb og en skrevet selv; de, es, fr, it, ja, ko, pt-BR og ru maskinoversatt og merket for gjennomlesing.
