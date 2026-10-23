# Feil fra Øystein: plassholder → bilde (23.10.2026)

Ingen migrasjon (versjonen er fortsatt 88), ingen betalte kall, ikke publisert. Kjørt etter N10.

## Årsak
Et lag uten bilde (plassholder) tegnes som en boks på 512 × 512 px ganger lagets skalering. Brukeren drar boksen til ønsket form, og da blir bredde- og høydeskaleringen ulike (for eksempel 0,2 og 0,6). Når bildet kom, ble det tegnet med de samme to skaleringene og ble derfor klemt eller strukket. I tillegg brukte bildedialogen lagets *gamle* felter da den tok den nye versjonen i bruk. Det ville ha overskrevet en riktig tilpasning.

## Regel (ren funksjon i `src/core/composition/refit.ts`)
- **Plassholder → bilde:** bildet får samme størrelse som ved vanlig innsetting (DEC-0092: innenfor 50 % av bildeformatet, bakgrunner dekker), med samme skala i begge retninger. Bare senteret (x, y) beholdes. Laget får bildets egne mål.
- **Ekte bilde → ekte bilde, samme proporsjoner (innenfor 0,5 %):** uendret, som i dag.
- **Ekte bilde → ekte bilde, ulike proporsjoner:** senteret og **den lengste synlige siden** beholdes. Eksempel: et liggende bilde som vises 500 px bredt, byttes til et stående bilde som da blir 500 px høyt. Grunnen til valget er at bildet beholder omtrent den plassen det tok i scenen uten å vokse ut av den, og at det ikke kan forvrenges.
- Lagets identitet, rekkefølge, tidsrom, koblinger, rotasjon, gjennomsiktighet og speilvending beholdes. Animert posisjon og bane røres ikke, så bevegelsen følger senteret. Nøkkelbilder for skala ganges med samme faktor per retning, så skalabevegelsen beholdes relativt.
- Tilpasses ikke: nye og fjernede lag, tekst- og mallag, fargeflater og bilder uten kjente mål.

## Alle veier
Regelen ligger i `applyCommand` i kjernen. Den kjøres altså både lokalt og på serveren før `apply_changes`, for hver endring som gjør at et lag viser et annet bilde. Det gjelder AI-generering, opplasting, bilde fra mobil eller QR (`AddAssetVersion`), valg fra biblioteket og bytte av versjon (`UpdateLayers`) og godkjenning av en versjon. Bakgrunnsjobber på serveren dekkes også. Unntak: Asset Studio-utkast (`UpdateSceneDraft`), som lagrer sine egne lagfelter. Det er ført i TODO.md.

## Angring som ett trinn
Endringen og tilpasningen lagres i samme rad i endringsloggen. Inversen er den nye kommandoen `WithLayerRefit` (tilpasningen angres først, deretter endringen), og gjør om gir nøyaktig samme resultat. `WithLayerRefit` godtas bare som en lagret invers (INVERSE_ONLY), og serveren sjekker tilgang og skjema mot kommandoen inni. Klarer kjernen ikke å tilpasse et lag, gjennomføres endringen som før, uten tilpasning.

## Allerede forvrengte lag
Disse rettes ikke automatisk. «Tilbakestill proporsjoner» finnes allerede som «Nullstill format» (behold bredden eller høyden) ved skaleringen i laginspektøren (DEC-0080). Derfor er det ikke laget noen ny handling og ingen nye tekster. I databasen er ett slikt lag i dag (bare lest).

## Tester
- `tests/unit/placeholder-refit.test.ts` (8 tester): liggende bilde inn i stående plassholder og omvendt, animert posisjon og skala, angring og gjør om som ett trinn, én revisjon per rad, samme og ulike proporsjoner mellom ekte bilder med speilvending, og samme andel som ved vanlig innsetting.
- `tests/visual/placeholder-refit.mjs` på nb og en, 16/0: plassholderen er strukket. Et bilde på 1600 × 900 lastes opp via «Velg eller last opp bilde …», og laget får skala 0,6 / 0,6, samme senter (700, 400) og målene 1600 × 900. «Nullstill format» blir utilgjengelig fordi laget har bildets proporsjoner. Fiksturen lages fra visual-fixture.json med et lag ekstra; skriptet står i økten, ikke i repoet.
- Berørte suiter: funn-0080-ui 48/0, image-tools-ui 48/0.
- tsc 0 · Vitest 2487 bestått / 10 hoppet over / 0 feilet · i18n-kontrollen grønn.

## Endrede filer
- src/core/composition/refit.ts (ny)
- src/core/commands/types.ts, src/core/commands/apply.ts
- src/adapters/storage/commands.functions.ts
- src/app/scene-editor/LayerImageDialog.tsx
- tests/unit/placeholder-refit.test.ts (ny), tests/visual/placeholder-refit.mjs (ny)
- scripts/i18n/ (inventaret er laget på nytt, ingen nye tekster)
- AGENTS.md (regel 57), TODO.md, roadmap.md, docs/development/PLASSHOLDER_FIX_REPORT.md (ny)
