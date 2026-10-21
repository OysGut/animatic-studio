# Rigg & 2D-utskrift (B-087) – rapport runde 3

Dato: 2026-10-21. Omfang: inspeksjonsvinduet og måleverktøyene (§7–§11, A6–A13), med migrasjon 0072 for målesett. Claude kjører 0072 i Cloud.

## Inspeksjonsvinduet

`src/app/rig/InspectionWindow.tsx` åpnes fra lagpanelet (`inspect-open-panel`, via `rig-contour-panel`) og Rigg-fanen (`inspect-open-rig`). Åpning og lukking skriver ingenting – verken utskrift eller lagring (A6). Vinduet viser figuren på valgt frame i beregnet fysisk størrelse, med:

- zoom: hjul, knapper (`inspect-zoom-in`/`inspect-zoom-out`), «tilpass» (`inspect-zoom-fit`) og «100 % fysisk» (`inspect-zoom-physical`), kalibrert mot skjermen med en skjermlinjal brukeren kan justere (`inspect-screen-ruler`);
- panorering: dra med pekeren;
- fysisk avgrensning: boks og mål (`inspect-bounds`);
- platenivå og avstand (`inspect-plate-level`) med kalibreringsstatus (`inspect-calibration-status`);
- bryter for de tre modusene fra runde 2 (`inspect-mode`);
- 150 dpi-varsel (`inspect-dpi-warning`), bare i modusene med bilde;
- `inspect-pdf-frame-slot`: plass reservert til PDF-arkrammen som kommer i runde 4.

## Måleverktøy (A7–A10)

Kjernen er plattformnøytral i `src/core/print/measure/index.ts`:

- `MeasurePoint`, `MeasureLine`, `Marker` (punkt, avstand, linje, vinkel, forhold) og `MeasureSet`;
- `distanceMm`, `angleDeg` (0–180°, presisjon 0,1°) og `ratio` (desimaltall og prosent);
- `formatMeasurement` med presisjon 0,1 mm / 0,01 in;
- bredde og høyde vises alltid (`inspect-measure-width`/`inspect-measure-height`);
- verktøy for avstand mellom to punkter, vinkel mellom to linjer og forholdstall mellom to valgte avstander (`inspect-tool-distance`/`inspect-tool-angle`/`inspect-tool-ratio`).

Markørene kan flyttes, redigeres og slettes (Delete), med angring/gjør-om i vinduet (`createMarkerHistory`/`editMarkers`/`undoMarkers`/`redoMarkers`). Tallene oppdateres mens brukeren drar. Punktene festes til konturen med magnet (`snapToContour`), som kan slås av med Alt.

## Fysisk målestokk (A11, A13)

Alle beregninger skjer i figurens mm-koordinater, aldri i skjermpiksler (`screenToFigureMm`). Egenskapstesten bekrefter samme tall på alle zoomnivåer over 50 deterministiske kombinasjoner. Enhet mm eller inches (`inspect-unit-toggle`).

## Målinger skrives ikke ut (A12)

Et målesett lagres som navngitt sett per figur og frame (`inspect-save-set`) eller forkastes (`inspect-discard`). Lagring går via kommandoen `SaveMeasureSet` → `runCommand` → `public.apply_changes` (samme mønster som `SetLayerRigPlate`). Målesett kommer bare på PDF når brukeren velger «Teknisk referanseutskrift» i runde 4 – aldri som standard.

## Tilgjengelighet

Tab når markørene, piltaster flytter 0,1 mm og Shift+pil 1 mm. Alle tekster via `t()` på nb og en. I en tidlig versjon brukte verktøyfeltet dynamiske `t(key)`-nøkler, som ikke ble fanget opp av i18n-inventaret og lot vinduet krasje ved åpning; rettet til eksplisitte nøkkelkall.

## Migrasjon 0072

`db/migrations/0072_rig_measure_sets.sql` (bare additiv, fra 0071 etter rettelsen):

- `public.measure_sets` med id, project_id, layer_id, frame, name, markers jsonb, removed, revision, created_at og created_by;
- GRANT til authenticated/service_role rett etter CREATE TABLE, deretter ENABLE ROW LEVEL SECURITY og policy via `private.is_project_member`; klienten skriver ikke direkte;
- `apply_changes`, `delete_project`, `purge_project_assets` og `purge_removed_assets` er erstattet ordrett fra 0071 med målesett-støtte;
- schema_version 72.

**Valg og begrunnelse:** målesett er prosjektdata via `apply_changes`, ikke personlige rader i profiles. Begrunnelse: de skal tåle angring/gjør-om og inngå i prosjektets sikkerhetskopier, og de deles mellom prosjektets medlemmer akkurat som riggplatene. Det enkleste alternativet som oppfyller begge kravene er derfor prosjektdata.

## Tester og verifisering

- `tests/unit/print-measure.test.ts`: 16/16 – avstand, vinkel og forhold med kjente tall; snapping; formatering; zoomuavhengighet; angring/gjør-om.
- DB-tester: 148/148 lokalt (0072 med målesett-skriving, sletting og purge). Claude kjører 0072 i Cloud.
- Visuell suite `rigg-r3.mjs` (nb og UI_LANG=en): åpne/lukke uten utskrift, bredde, avstand, vinkel, forhold, flytte markør og se tallet endre seg, bytte enhet, og at ingen måling havner i utskriftsdata. Resultat rapporteres under.
- Full Vitest: resultat under.

## Resultater (oppdatert etter testkjøring)

_Fylles inn når rigg-r3.mjs (nb/en), regresjonene og full Vitest er kjørt._

## Avvik

Ingen utover de godtatte fra runde 2 (KI-256: banemasker støttes ikke som konturkilde).
