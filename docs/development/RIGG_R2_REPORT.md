# Rigg & 2D-utskrift (B-087) – rapport runde 2

Dato: 2026-10-21. Omfang: konturen til en figur slik den skal skrives ut – konturkilde, forslag, redigering, geometri, klippelinje, ytelse og enkel forhåndsvisning. Ingen migrasjon i denne runden (0072 er reservert for målesettene i runde 3).

## Konturkilde (fast rekkefølge)

`src/core/print/contour/` (plattformnøytral TypeScript) velger kilden i fast rekkefølge via `chooseContourSource`:

1. **Lagmasken** på laget i scenen, evaluert på valgt frame (`coverageFromLayerMask`). Rektangel og ellipse med keyframes (`maskAt` fra `src/core/composition/render.ts` gjenbrukes) samt klippelag støttes; klippelag krever dekning i samme pikselkoordinater uten scenetransformasjoner, ellers faller kilden videre. Masken kombineres med bildets alfa.
2. **Bildets alfa** (`coverageFromAlpha`), for eksempel en frilagt versjon fra DEC-0053.
3. **Automatisk forslag** (`suggestCoverage`) med den eksisterende frileggingsalgoritmen i `src/core/cutout` (flomfylling fra kanten, `autoMask`).

Kilden vises alltid i grensesnittet: «Din maske», «Bildets gjennomsiktighet», «Forslag», «Rektangel» eller «Ingen kontur, bildet skrives ut som det er» (i18n-nøklene `app-rig.contour.source-*`).

**Banemasker støttes ikke** som konturkilde, fordi `LayerMask` ikke har baner (bare rektangel, ellipse og klippelag). Dette er godtatt av oppdragsgiver og registrert som KI-256 i KNOWN_ISSUES.

## Forslag og redigering

- Forslaget kan slås av (B-087); da brukes bildets rektangel, og kilden vises som «Rektangel».
- Forslaget lagres aldri automatisk. «Rett konturen» (`rig-contour-edit`) åpner den eksisterende frileggingseditoren (`CutoutDialog`: pensel, toleranse og myk kant) med figuren. Lagring går gjennom eksisterende frileggingsflyt og gir en ny bildeversjon i samme variant med `derived_from_version_id` (0069). Originalen endres aldri. Ingen ny maskeeditor er bygget.

## Geometri

- Marching squares på dekningen (0–255) med terskel 127,5 (50 %), i kildebildets oppløsning.
- Forenkling med Ramer–Douglas–Peucker; toleransen begrenses slik at den tilsvarer høyst 0,05 mm i fysisk størrelse (`mmPerPixel` fra størrelsesmatematikken i runde 1).
- Ytterkontur og hull holdes adskilt (orientering); brukeren velger om hull skal skjæres. Flere separate øyer er lov.
- Resultatet (`computeContour`) er lukkede baner i millimeter i figurens koordinater: `{ source, paths: [{ points, isHole, orientation }], widthMm, heightMm, pointCount }`.

## Klippelinje

Standard 0,1 mm, valgbar 0,05–0,3 mm, mørk grå (design-token), tegnet sentrert på konturen i SVG-visningen. Enhetstesten bekrefter at `widthMm`/`heightMm` er uavhengige av strektykkelsen – linjen endrer aldri figurens målte størrelse.

## Ytelse

Beregningen kjører i en Web Worker (`src/app/rig/contour.worker.ts`) via `ContourClient` (`contour-client.ts`): hver forhåndsvisning eier sin worker, ny inndata avbryter pågående regning (terminate + AbortError), og resultatet bufres per nøkkel (versjon, maske, frame og innstillinger; maks 64 oppføringer). Målt tid for et bilde på 4096 × 4096: **761,6 ms** (enhetstest med fast rutenett).

## Visning

Rigg-fanen (`rig-contour`) og lagpanelet (`rig-contour-panel`) har en enkel SVG-forhåndsvisning av konturen i de tre modusene: full figur, med klippelinje og kun kontur (`rig-contour-mode`). Størrelsen vises i brukerens enhet (mm/tommer) via `formatLength`. Selve inspeksjonsvinduet kommer i runde 3.

## Tester og verifisering

- Enhetstester `tests/unit/print-contour.test.ts`: 9/9 – rektangulært bilde uten alfa gir ikke rektangel når forslaget er på (A5) men gir det når av; hull og øyer; animert maske gir ulik kontur på ulike frames; strektykkelsen endrer ikke størrelsen; egenskapstest (250 deterministiske rutenett) for at konturen ligger innenfor dekningen ± én piksel.
- i18n: 18 nye nøkler under `app-rig.contour.*` og `app-rig.layers-panel.contour-heading`, nb og en; dynamiske nøkler er unngått (eksplisitte nøkkelunioner), og inventaret er regenerert.
- Full Vitest og visuell suite `rigg-r2.mjs` (nb og UI_LANG=en) samt regresjonene rapporteres i sluttseksjonen under.

## Resultater (oppdatert etter testkjøring)

_Fylles inn når rigg-r2.mjs og regresjonene er kjørt._

## Avvik

- Banemasker støttes ikke (godtatt; KI-256).
- Klippelag som konturkilde krever dekning i samme pikselkoordinater uten scenetransformasjoner; ellers brukes neste kilde i rekkefølgen (dokumentert i kodekommentar).
