# Plan – Oppdrag CA: Character Animation Studio og Director's Rhythm Engine

Kravgrunnlag: `docs/product/phase3/CHARACTER_ANIMATION_SPEC.md` (§1–§125). Spesifikasjonen lagres ordrett som første handling når planen er godkjent (CA0). Den lagres ikke i planmodus, fordi planmodus bare tillater denne planfilen.

Hvert steg CA1–CA8 bygges, testes og publiseres for seg. Migrasjoner skrives som filer, og Claude kjører dem. Etter hvert steg kjøres tsc, vitest og i18n.

## 1. Kartlegging (§121) – hva som finnes, og hvor det kobles på

| Område | Finnes i dag | Kobles på slik |
|---|---|---|
| Sceneeditor og faner | `SceneEditorWorkspace.tsx`, `ScenePanels.tsx`, `Timeline.tsx`, `use-playback.ts` | Ny fane «Animasjon» ved siden av «Scene». Samme `ProjectState` og samme kommandoer, så det går ikke tapt noe ved bytte (§3). |
| Lag og tid | `composition_layers` med `activeRange` (0043), `Keyframe` med easing, `ImageSwap` (`swaps`, image_swaps jsonb), `LayerMask` | Bildelagene i animasjonsfanen er de eksisterende lagene og bildebyttene. Bytter beholder transformasjonen, slik de gjør i dag (§15). |
| Rendering | `src/core/composition/render.ts` `renderFrame` → `src/engine/compositor/canvas.ts` `drawFrame` | Minianimasjonene evalueres i `renderFrame` med én ren funksjon (`evaluateCharacterFrame`). Forhåndsvisning og eksport bruker den samme funksjonen (§106, §112). |
| Ressurser | `Asset` → `AssetVariant` → `AssetVersion`, Asset Studio (`UpdateSceneDraft`) | Animasjonsoppsettet eies av bildevarianten og versjoneres som en egen oppsettversjon (se 2). |
| Lyd | takes, valgt take, ordkobling i `src/core/audio/alignment.ts` (`AlignedWord`, manuelle ord) | Dialogsporet viser valgt take per replikk. Ordtidene er reserveløsningen for leppesynk. |
| Mobil | `upload_sessions`, `mobile_imports`, `src/core/mobile` | Ny øktformål «mouth_shape» med mål (variant, munnform) og eksplisitt godkjenning (§23–§25). |
| Globalt bibliotek | GP2, versjoner som ikke endres, `template_spec` (0052) | Oppsettet følger med som en del av den globale versjonen (§52–§53). |
| Tid | `src/core/composition/retime.ts` `planRetime`, kommandoen `RetimeScene`, SV1 | Rytmeverktøyet planlegger med en ny ren funksjon som gir steg av eksisterende tidskommandoer i én `RetimeScene`-gruppe. |
| Skriving | `applyCommand` → `apply_changes` med `oneRevisionPerRow`, angring og konfliktdialog | Alle nye kommandoer går denne veien. |
| Hurtigtaster | `Timeline.tsx` bruker Ctrl/Cmd med hjulet (zoom, linje 597) | Rytmemodus må ikke ta Cmd/Ctrl med hjulet eller med bokstaver (se 7). |
| Eksport | `src/engine/export/animatic.ts`, `film-video.ts`, MTS-rendering | Eksportvalg sendes som filter til den felles evalueringen (§103–§106). |

## 2. Datamodell (§107–§108)

Ressursen eier mulighetene, og scenen bestemmer bruken.

```text
Asset (karakter/objekt)
 └ AssetVariant (forfra, profil …)
    └ AnimationRig  (oppsett per variant, versjonert: rig_versions)
       ├ anchors: hode, munn, nese, venstre/høyre øye, egne punkter (relative 0–1)
       ├ mouthSet: visem → { assetVersionId, transform, mask, adjust }
       ├ eyes: left/right → { open, closed, transform, mask, adjust }
       ├ overlays[]: { id, frames[], transform, blend, intensity, z }
       └ defaults: patternIds, seed, z-rekkefølge
 Pattern (mønsterdefinisjon: navn, farge, type, regler, grenser, låste egenskaper, algoritmeversjon)
 CharacterBehavior (per Asset: standardmønstre per øye/overlegg, intensitet, seed)
Composition (scene) / layer
 └ AnimationUse (per lag og forekomst): rigVersionId, enabled per lag,
    seedOverride, patternSegments[], lipsyncOff[lineId], eventOverrides[], exportFlags
Genererte hendelser: beregnes alltid i farten, lagres ikke.
```

- **Masker og justeringer** lagres som parametere (penselstrøk som vektordata og fargejusteringer som tall). Originalbildet endres aldri (§26, §109).
- **Overstyringer (§102):** hver overstyring har `anchor: { kind: "line" | "pattern" | "absolute", refId?, offsetFrames }`. Regenerering bevarer dem. Overstyringer som ikke lenger passer, flagges.
- **Versjonering:** en rigversjon endres aldri etter at den er lagret. Sceneforekomsten peker på én rigversjon. En ny versjon gir en flagget forskjell, og brukeren velger «oppdater» (§53, §110).
- **Leppesynk-resultatet** (visemer per take) lagres som et avledet resultat, med nøkkel take-ID og motorversjon. Det er en cache som kan beregnes på nytt. Overstyringer ligger separat.

## 3. Migrasjoner (fra 0053)

| Fil | Innhold |
|---|---|
| `0053_animation_rigs.sql` | `animation_rigs` (variant_id, current_version), `animation_rig_versions` (spec jsonb ≤ 512 kB, number, algoritmeversjon). Standardkolonner: project_id, removed, revision, created_at, created_by. Check-grenser. FK `on delete restrict`. |
| `0054_animation_patterns_behavior.sql` | `animation_patterns`, `character_behaviors` (asset_id, spec jsonb). |
| `0055_animation_uses.sql` | `animation_uses` (layer_id, occurrence_id, rig_version_id, overrides jsonb, export_flags jsonb). |
| `0056_lipsync_results.sql` | `lipsync_results` (take_id, engine, engine_version, visemes jsonb). Skrives av en serverfunksjon. |
| `0057_mobile_mouth_shapes.sql` | utvider `upload_sessions` med `purpose` og `target` jsonb, og `mobile_imports` med `approved_at`. Nye funksjoner med eksplisitt godkjenning. |
| `0058_global_rigs.sql` | `global_asset_versions.rig_spec jsonb`. `global_add_version` utvides med rigspesifikasjon. |

For hver tabell: RLS (medlemmer kan lese via `private.is_project_member`), `revoke all … from anon`, ingen direkte skriving fra klienten. `apply_changes` får nye tabeller i `v_tables` og i delete-rekkefølgen (barn før foreldre). `delete_project`, `purge_project_assets` og `purge_removed_assets` utvides (kopieres ordrett fra siste definisjon). Skjemaversjonen økes, og `EXPECTED_SCHEMA_VERSION` følger.

## 4. Nye kommandoer (alle har invers og angre-test)

CreateRig, SaveRigVersion, SetRigAnchors, SetMouthShape, SetEyeImage, AddOverlay/UpdateOverlay/RemoveOverlay, CreatePattern/UpdatePattern/ArchivePattern, SetCharacterBehavior, AttachAnimationUse, SetAnimationLayerEnabled, SetAnimationOverride, SetPatternSegments, SetLipsyncOff, SetAnimationSeed, SetExportFlags, AdoptRigVersion (§51/§53, flere scener i én gruppe etter bekreftelse). Rytmeverktøyet bruker den eksisterende `RetimeScene` med eksisterende tidssteg. Den får ingen ny kommando.

## 5. Steg

**CA0 – Spesifikasjon:** `docs/product/phase3/CHARACTER_ANIMATION_SPEC.md` (ordrett).

**CA1 – Fane, tidslinje og forhåndsvisning (§3–§10, §113)**
Filer: `src/app/scene-editor/animation/AnimationWorkspace.tsx`, `AnimTimeline.tsx` (bygd på `Timeline.tsx`-hjelpere og `use-playback`), `TimeNavigator.tsx`, `PlayRange.tsx`, `AnimPreview.tsx` (zoom og pan bare i visningen), `src/core/animation/time-format.ts` («7 f», «1 s 04 f», mm:ss:ff). Endring i `SceneEditorWorkspace.tsx` (faner). Ingen migrasjon.

**CA2 – Bildevarianter og lydspor (§11–§18, §114)**
Filer: `animation/VariantTracks.tsx` (lagene og `swaps`, ett frame vist som kvadrat, større bilde når pekeren er over), `DialogueTrack.tsx` (valgt take per replikk), `src/core/animation/tracks.ts`. Bruker eksisterende kommandoer for bildebytter. Ingen migrasjon.

**CA3 – Rigmodell, ankerpunkter og ansiktsmarkering (§45–§50, §48, §20)**
Filer: `src/core/animation/rig.ts`, `rig-commands.ts`, `evaluate.ts` (`evaluateCharacterFrame` koblet inn i `renderFrame`), `animation/FaceMarkDialog.tsx`, `project-rows.ts`, backup. Migrasjon 0053 og 0055.

**CA4 – Munnformeditor, tegneark, QR, maskering og justering (§21–§28, §38)**
Filer: `animation/MouthShapeEditor.tsx`, `MaskBrush.tsx` (penselstrøk som vektordata), `AdjustPanel.tsx`, `src/core/animation/visemes.ts` (visemsettet), `src/engine/export/mouth-sheet-pdf.ts` (tegneark), mobil: `src/app/mobile/MouthShapeCapture.tsx`, `src/core/mobile` (formål og godkjenning), sanntid via eksisterende varsel- eller pollingløsning. Migrasjon 0057.

**CA5 – Leppesynk (§19, §29–§33, §100)**
Filer: `src/core/animation/lipsync.ts` (visemer til frames, overstyringer, flagg for at synken må gjennomgås), `src/adapters/ai/lipsync.functions.ts` (serveren lagrer resultatet), `src/engine/lipsync/` (kjøring, se 6), `animation/LipsyncTrack.tsx`. Migrasjon 0056.

**CA6 – Blinking, overlegg, grafeditor, mønstre og seed (§34–§44, §54–§67)**
Filer: `src/core/animation/seed.ts` (PRNG med versjon), `patterns.ts` (mønster til hendelser), `blink.ts`, `overlays.ts`, `animation/PatternGraphEditor.tsx`, `BlinkTrack.tsx`, `OverlayTrack.tsx`, `PatternSegments.tsx`. Migrasjon 0054.

**CA7 – Global gjenbruk, karakteratferd og §51**
Filer: `src/core/animation/adopt.ts` (finner andre scener med samme variant og planlegger), `animation/AdoptRigDialog.tsx`, `src/app/global/global-actions.ts` (rig følger med ved «bruk i prosjekt»), `src/adapters/browser/global-library.ts`. Migrasjon 0058.

**CA8 – Rytmeverktøy og eksportvalg (§71–§99, §103–§106)**
Filer: `src/core/animation/rhythm.ts` (planRhythm: skjæringspunkt, kvalifisering, forskyvning og proporsjonal fordeling, grenser; resultatet går til `planRetime`-steg), `rhythm-input.ts` (responskurve), `animation/RhythmLayer.tsx`, `RhythmOverlay.tsx`, `GapLabels.tsx`, `ExportAnimationOptions.tsx` og endringer i `src/engine/export/animatic.ts` og `film-video.ts` (filter). Ingen migrasjon, unntatt at eksportvalg lagres i `animation_uses.export_flags`.

## 6. Leppesynkmotoren (anbefaling)

- **Rhubarb:** MIT-lisens. Avhengighetene er PocketSphinx (BSD) og en engelsk akustisk modell. Motoren har to gjenkjennere: `pocketSphinx` (bare engelsk) og `phonetic`, som er språkuavhengig og ikke trenger manus. Den gir Preston Blair-sett A–H pluss X.
- **Kjøring:** Rhubarb er et C++-program. En Edge-funksjon kan ikke kjøre den som binærfil. Det finnes WASM-bygg fra fellesskapet, men de må verifiseres.
- **Anbefaling:** fase A: kjør Rhubarb `phonetic` i nettleseren som WASM i en Web Worker. Det er gratis, det går ingen lyd ut av maskinen, og resultatet lagres i `lipsync_results`. Reserveløsning (alltid tilgjengelig): ordtidene fra fase 2 kombinert med enkle regler fra norsk ortografi til visemer, samt energi i lyden for åpning og lukking. Resultatet merkes med motor og versjon. Ingen betalte tjenester.
- Norsk tale og dialekter verifiseres med 5–10 opptak fra «Jula på Dovre» før motoren vedtas (DEL 17 B). Klarer ikke WASM-bygget dette, brukes reserveløsningen som primærmotor.

## 7. Rytmeverktøyet

- **Tast:** Cmd på Mac, Ctrl på Windows. Modus aktiveres bare når tasten holdes alene over tidslinjen i animasjonsfanen, uten hjul og uten andre taster innen 150 ms. Ctrl/Cmd med hjulet (zoom) og hurtigtaster som Cmd+Z går forbi som før. Slippes tasten, eller mister vinduet fokus, avsluttes modus, og draget avbrytes.
- **Responskurve (§94–§96):** vinkelen θ = atan2(|dy|, |dx|). Horisontal andel h = cos²θ gir grovtrinn (frames per px etter zoom). Vertikal andel gir ett frame per 8 px. Akkumulert reell verdi avrundes til hele frames fra start til nå (ikke steg for steg). Det gir ingen dobbelttelling og ingen hopp, og draget er reversibelt.
- **Grenser (§80):** `planRhythm` er ren og returnerer `{ appliedDelta, clamps[] }`. Den stopper ved første ugyldige tilstand: overlapp av dialog, låste intervaller, koblinger, scene < 1 frame. Grensesnittet viser den reelle endringen.
- **Angring (§98):** under draget brukes bare forhåndsvisning. Ved slipp sendes én `RetimeScene`, som gir én angregruppe. Avbrudd (Esc, tap av fokus eller at tasten slippes) sender ingenting.

## 8. Tester per steg

- **Unit:** time-format («7 f», «1 s 04 f», ingen «0 f», mm:ss:ff over 59 min); seed-determinisme (samme seed gir samme resultat, algoritmeversjon 1 er låst med øyeblikksbilde); mønster og blink; visem-konvertering og reserveløsning; overstyringer overlever regenerering; planRhythm (klipp før skjæringspunktet er uendret, forskyvning, proporsjonal fordeling, grenser); responskurve; evaluateCharacterFrame er lik i forhåndsvisning og eksport; kommandoer med invers og angring.
- **DB:** RLS per tabell, anon nektes, revisjoner via `apply_changes`, sletting og purge, global rig-kopi.
- **Nettlesertester:** `tests/visual/ca1-tab.mjs` (§113), `ca2-variants.mjs` (§114), `ca4-mouth.mjs` og `ca5-lipsync.mjs` (§115), `ca6-blink-overlay-patterns.mjs` (§116–§118), `ca7-global.mjs` (§119), `ca8-rhythm.mjs` (§120), alle med engelsk visning.

## 9. DEL 17 – anbefalinger (Teknisk anbefaling, ikke vedtatt)

- **A:** et nytt mønster fortsetter i kontinuerlig fase, regnet fra scenens frame 0. Det gir stabile blink når segmenter flyttes. Valget «start fra første frame» finnes per segment.
- **B:** Rhubarb `phonetic` (WASM), med regelbasert reserveløsning (se 6).
- **C:** kurven i 7, med horisontal faktor som følger zoomnivået.
- **D:** låste hendelser er harde grenser. Draget stopper der, låsikonet blinker, og tallet viser den reelle endringen.
- **E:** blinkeintervall fra en avkortet log-normal fordeling innenfor min–maks, med varighet jevnt fordelt innenfor grensene og PRNG mulberry32 (versjon 1).

## 10. Risikoer og åpne spørsmål

**Risikoer:**
- WASM-bygget av Rhubarb finnes kanskje ikke i stabil form, så det kan bli et eget byggeprosjekt.
- Ytelse ved mange lag i sanntid. Evalueringen må hurtigbufres per frame.
- Rytmeverktøyets grenser kan treffe uventede koblinger.
- Omfanget: CA4 og CA6 er de største stegene.

**Åpne spørsmål:**
1. Godkjenner du at spesifikasjonen lagres i CA0, utenfor planmodus?
2. Får Lovable legge til en npm-pakke, eller en WASM-fil i `public/`, for Rhubarb i CA5?
3. Skal penselmasker lagres som vektordata (anbefalt) eller som maskebilde i Storage?
4. Hva er tillatt grense for størrelsen på rigversjonen? Forslaget er 512 kB.
