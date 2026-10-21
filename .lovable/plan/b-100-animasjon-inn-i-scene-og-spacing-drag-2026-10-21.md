# B-100: Animasjon inn i Scene, og spacing-drag

Ingen kode før Claude har godkjent planen. Ingen data endres eller flyttes. Migrasjon: **ikke ventet** (se eget avsnitt).

## Kjent tilstand (lest nå)

- `SceneEditorWorkspace.tsx` har faner `scene`/`animation` (`sceneTab`, linje ca. 970). Animasjon rendres med `AnimationWorkspace` med `VariantTracks`, `DialogueTrack`, `MouthTrack`, `PatternStudio`, `RhythmPanel` og `RhythmDragLayer`.
- Ruten `prosjekt.$projectId.scene.tsx` godtar `fane=animation|scene`.
- `duration = compositionDuration(state, composition)` beregnes i Scene-arbeidsflaten.
- `AnimationWorkspace` lager sitt visningsvindu med `useState({ from: 0, span: duration })` én gang, og `animationRange` (avspillingsområdet) nullstilles bare ved bytte av komposisjon.

## Lengdefeilen (punkt 1) – hypotese, ikke bekreftet

Sannsynlige årsaker, som skal bekreftes med en test før retting:
1. Visningsvinduet og avspillingsområdet beholder gammel lengde etter `RetimeScene` (de initialiseres én gang og følger ikke `duration`). Ved forlengelse vises og spilles bare den gamle lengden.
2. Monteringen leser `occurrence.durationFrames`, mens Scene leser `compositionDuration(...)`. Hvis disse kan avvike etter omtiming, viser de ulik lengde.

Steg 1 i runde 1 er å reprodusere med en enhetstest (planRetime → apply → begge lengdekilder) og en visuell test i den sammenslåtte visningen. Rettingen blir: én felles funksjon `sceneLengthFrames(state, occurrenceId)` som Scene, tidslinjen, navigatoren og monteringen bruker, og vindu/område som klemmes og utvides når lengden endres (et vindu som dekket hele scenen, fortsetter å dekke hele scenen).

## Forslag til oppsett (svar på spørsmålet)

```text
+--------------------------------------------------------------------+
| Verktøylinje: |< < > >|  3 s + 12 f   [Rytme (oransje)]  [zoom]     |
+-------------------+----------------------------------+-------------+
| Ressurser / lag   |            Canvas                | Inspektør   |
|                   |  (bevegelsesbane, oransje        | Lag | Karak-|
|                   |   utheving ved hover/drag)       | ter | Blink |
|                   |                                  | Justering   |
+-------------------+----------------------------------+-------------+
| Navigator  [====vindu====]                     avspillingsområde [ ]|
| Kamera                      ▸                                       |
| ▾ Elg (valgt lag)  ███ blob ███████                                 |
|     Replikker      [--"Hei"--]   [--"Nei"--]                        |
|     Munn/leppesynk A E O M A                                        |
|     Blink/overlegg  |    |      |                                   |
|     Bildevarianter [v1   ][v2      ]                                |
| ▸ Nisse            ███████                                          |
| ▸ Bakgrunn         ██████████████                                   |
| Lyd                ~~~~~~~~~~~~~~                                   |
+--------------------------------------------------------------------+
```

- Hvert lag har én hovedrad (blob). Sporgruppene under er **sammenfelt som standard**.
- Valgt lag felles ut automatisk (kan slås av). Brukerens manuelle utfelling huskes per bruker og scene i `ui_prefs` (personlig, ingen migrasjon).
- Sporgrupper vises bare når laget har innhold av den typen (en figur uten rigg får ikke munnspor). «Vis alle spor» i lagets meny.
- «Fell sammen alle» / «Fell ut valgt» i tidslinjens verktøylinje, tastatur: `Alt+klikk` på pil feller ut alle grupper i laget.
- Navigator og avspillingsområde ligger øverst i tidslinjen og gjelder hele Scene (ikke bare animasjon).
- Rytmeverktøyet blir en knapp i verktøylinjen (oransje når aktiv); dra-modusen ligger i tidslinjen som før.

### Hvor panelene går

| Panel | Ny plass |
|---|---|
| Karakter (CharacterPanel) | Inspektøren, fane «Karakter», når valgt lag er en karakter |
| Blink (BlinkPanel) | Inspektøren, fane «Blink», og åpnes fra blink-sporets meny |
| Justering (AdjustPanel) | Inspektøren, fane «Justering» |
| Mønstre (PatternStudio) | Dialog fra blink-sporet («Mønstre…») |
| Munnformeditor (MouthShapeEditor, MaskBrush, FaceMarkDialog) | Dialog fra munnsporet; uendret innhold |
| RhythmPanel | Sprettpanel fra rytmeknappen i verktøylinjen |
| AnimPreview | Fjernes; canvas i Scene er forhåndsvisningen |

## Runder

### Runde 1 – lengde og felles tidsgrunnlag
- Reproduser og rett lengdefeilen (se over), test først.
- Trekk ut `AnimWindow`/navigator/avspillingsområde slik at Scene-tidslinjen bruker dem.
- Filer: `SceneEditorWorkspace.tsx`, `animation/TimeNavigator.tsx`, `animation/PlayRange.tsx`, ny `src/core/composition/length.ts` (ren), monteringens lengdeleser (finnes ved `rg durationFrames` i montering), tester.

### Runde 2 – én skjerm
- Fjern fanen `animation` og `AnimationWorkspace`-skallet; sporkomponentene (`VariantTracks`, `DialogueTrack`, `MouthTrack`, `RhythmDrag`) rendres som sporgrupper under lagets rad i Scene-tidslinjen.
- Paneler til inspektør/dialoger etter tabellen.
- Ruten: `fane=animation` (og gamle bokmerker/lenker) omdirigeres til Scene med `lag=<id>&spor=<gruppe>` åpent; `validateSearch` utvides. Gamle nøkler i lagrede lenker leses, ingenting skrives om.
- Utfellingsstatus i `ui_prefs`.
- Alle nye tekster via `t()` på nb og en; inventaret genereres på nytt.
- Filer: `SceneEditorWorkspace.tsx`, `routes/prosjekt.$projectId.scene.tsx`, `animation/*` (flytting av innpakning, ikke logikk), inspektørens fil(er), `authored.json`.

### Runde 3 – spacing-drag
- Ren kjerne `src/core/animation/spacing.ts`:
  - `planSpacingDrag(state, layerId, anchorFrame, deltaFrames, { whole })` → plan med nye frame-tider.
  - Uten Shift: tider t ≥ anker skaleres `t' = a + (t − a)·k` der `k = (slutt − a + Δ)/(slutt − a)`.
  - Med Shift: hele animasjonen skaleres om ankeret, `t' = a + (t − a)·k` på begge sider (start og slutt flyttes).
  - Avrunding til hele frames, rekkefølge bevares (to nøkkelbilder kan aldri bytte plass eller kollidere; ved kollisjon beholdes minst 1 f mellom).
  - Berører: posisjons-/rotasjons-/skala-/opasitetsnøkkelbilder, `MotionPath`-nodenes tid og `tempo`, maskens nøkkelbilder, bildeskifter (segmentgrenser). Nodenes rom-koordinater røres aldri. Barn i gruppe følger med (samme skalering).
  - Låste/beskyttede tidsrom: nøkkelbilder inne i dem flyttes ikke; planen avvises med forklaring hvis draget krever det (ikke stille kutt).
  - Replikker, lydsynk og andre lag røres ikke.
- Kommando: én `ScaleLayerTiming` (eller gruppe av eksisterende `UpdateLayer`-kommandoer i én `runGroup`) med invers → én angring. Valget gjøres etter å ha lest `commands/types.ts`; ny kommandotype foretrekkes bare hvis eksisterende ikke gir én angring.
- UI:
  - Hover over blob: bane på canvas, punkt ved pekerens tid i oransje, berørt del (fra punktet og ut, hele med Shift) uthevet; følger pekeren.
  - Cmd/Ctrl + dra: levende forhåndsvisning på canvas og tidslinje, merkelapp «+12 f» og ny lengde, snap til hele frames, Escape avbryter.
  - Går animasjonen forbi scenens slutt: `BeyondEndNotice` med tilbud om forlengelse via B-041 (`RetimeDialog`). Ingen automatisk forlengelse.
- Filer: ny `src/core/animation/spacing.ts`, `src/core/commands/*` (bare ved ny kommando), ny `src/app/scene-editor/SpacingDrag.tsx`, canvas-overlegget for banen, `BeyondEndNotice.tsx` (gjenbruk), tester.

### Runde 4 – suiter og regresjon
- Flytt ca1–ca8 til ny plassering (selektorer fra `scene-tab-animation` til sporgrupper/inspektør), 100 % på nb og `UI_LANG=en`. Kjente `ca8` nb-språkfeil rettes i suiten.
- Ny suite `b100-scene-anim.mjs` (lengde likt i Scene og montering etter rytmeverktøy/RetimeScene, gamle lenker) og `b100-spacing.mjs` (hover oransje, drag med og uten Shift, Escape, angre, beyond-end).
- Regresjon én om gangen: scene-panels, dv3, u5, rigg-r1–r4. Full vitest og DB.
- Rapport `docs/development/B100_REPORT.md`.

## Testplan (enhet)
- Lengde: etter `RetimeScene` gir Scene-lengde og monteringslengde samme tall; vindu som dekket hele scenen, utvides.
- Spacing: fra punktet og ut (kjente tall), hele med anker (ankeret står fast), noder i rommet uendret, `tempo` skaleres riktig, rekkefølge bevart, angre/gjør om, gruppe-barn følger, låst tidsrom urørt/avvist, andre lag/replikker urørt, snap til hele frames.
- Arkitekturtestene i `tests/architecture` (core uten React).

## Hva som ikke røres
- Data og skjema: ingen flytting, ingen omskriving av lagrede rader.
- Logikken i munn/leppesynk, blink, rigg, bildevarianter og rytmeverktøyet (bare plassering i UI).
- `src/integrations/`, `drizzle/`, mandatfiler, Story Lab, eksportmotorene.
- Den gamle fanen rettes ikke separat; den fjernes.

## Migrasjon
Ikke ventet: utfellingsstatus er personlig (`ui_prefs`), og spacing-drag skriver eksisterende felt via kommandoer. Trengs en ny kommandotype som `apply_changes` må kjenne, blir det likevel ingen DDL, fordi lagdata skrives via eksisterende tabeller. Skulle det likevel trengs, blir den additiv `0073`, og runde 5 i Rigg (batch/QR) rykker til `0074`.

## Risiko
- Stor endring i `SceneEditorWorkspace.tsx` (1 477 linjer): flytting gjøres i små steg med suiter mellom.
- Plassmangel i tidslinjen ved 1024 px: sammenfelt standard og skjulte tomme grupper.
- Tastaturkollisjon: Cmd/Ctrl-drag brukes allerede av rytmeverktøyet (U5 del B). Forslag: rytme-drag gjelder på tidslinjens tomrom/linjal, spacing-drag på lagets blob. Bør bekreftes av Claude.
- Avrunding ved krymping kan slå sammen nøkkelbilder; håndteres med minst 1 f mellom og varsel.
- Gamle bokmerker: omdirigering må testes.

## Åpne spørsmål til Claude
1. Er fordelingen Cmd/Ctrl-drag (rytme på linjal/tomrom, spacing på blob) godkjent?
2. Ny kommandotype `ScaleLayerTiming`, eller gruppe av eksisterende lagoppdateringer?
3. Skal valgt lag felles ut automatisk som standard?
