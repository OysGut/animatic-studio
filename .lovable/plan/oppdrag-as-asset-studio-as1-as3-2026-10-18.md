# Oppdrag AS – Asset Studio (AS1–AS3)

En fokusert arbeidsflate for ett lag (karakter eller objekt) i én sceneforekomst. Den åpnes fra sceneeditoren med knappen «Asset Studio» på et lag og med Alt+dobbeltklikk på laget. Studioet bygger på lagene, nøkkelbildene, bildeskiftene, lyden og medieverktøyene som finnes. Det kommer ingen ny motor.

## Felles grunnmur: prøveversjon (B5) og to skrivekanaler (B4)

```text
 Asset Studio
 ├─ Utkast for scenen (lokalt)      → én RetimeScene-lignende samlekommando ved «Oppdater scenen og lukk»
 │    lag, bildeskifter, aktivt område, demping, nøkkelbilder
 └─ Direkte kommandoer (med en gang) → bibliotek (opplasting, varianter, versjoner, AI, frilegging,
                                        lyd, takes) og notater; de overlever Avbryt
```

- Ny ren hjelper i `src/core/draft.ts`, kalt `createDraft(base)`. Den har funksjonene `push(cmd)`, `undo()`, `redo()`, `state()` og `steps()`. Den bruker `applyCommand` på en kopi, og direkte kommandoer fra biblioteket kan tas inn med `rebase(newBase)`.
  - Utkastet godtar bare en hviteliste av scenekommandoer: `UpdateLayers`, `UpdateAudioClips` (bare `muted`) og `UpdateComposition` (bare timing). Andre kommandoer gir en feil i koden. Slik holdes de to kanalene adskilt.
  - SV1-forhåndsspillet i `RetimeDialog` flyttes over til samme hjelper. Oppførselen er den samme, og testene viser det.
- Ved lagring blir utkastet én samlet kommando, `UpdateSceneDraft {occurrenceId, compositionId, steps}`. Den kjøres med samme mekanisme som `RetimeScene`: trinnene utføres i rekkefølge, og inversen er trinnene i motsatt rekkefølge. Det gir én transaksjon, én angring og revisjonene fra da studioet ble åpnet (`baseRevisions` fra åpningstidspunktet).
  - Alternativt kan `RetimeScene` generaliseres. Se åpent spørsmål 1.
- Revisjonskonflikt (F3): `AssetStudioConflictDialog` viser hvilke lag eller klipp som er endret av andre. Det regnes ut ved å sammenligne `revision` på objektene i utkastet mellom grunnlaget og den ferske tilstanden.
  - Valget «Legg utkastet oppå» kjører trinnene på nytt mot den ferske tilstanden (`rebase`) og viser forhåndsvisningen før ny lagring. Feiler et trinn i valideringen, vises det, og ingenting lagres.
  - Valget «Forkast» lukker uten lagring. Ingenting overskrives i stillhet.

## AS1 – Skall og prøveversjon

Filer:
- `src/core/draft.ts` (ny) og eksport i `src/core/index.ts`.
- `src/core/commands/types.ts` og `apply.ts`: `UpdateSceneDraft` med hvitelisten og inversen.
- `src/adapters/storage/commands.functions.ts`: `UpdateSceneDraft` legges til i 2D-kommandoene.
- `src/app/asset-studio/` (ny mappe):
  - `AssetStudio.tsx`: fullskjermsflate over sceneeditoren, med tre kolonner og fast bunnlinje;
  - `use-asset-studio-draft.ts`;
  - `StudioFooter.tsx`: «Oppdater scenen og lukk» og «Avbryt uten å oppdatere scenen». Avbryt spør først når utkastet ikke er tomt;
  - `AssetStudioConflictDialog.tsx`.
- `src/app/scene-editor/LayerInspector.tsx`: knappen «Asset Studio».
- `src/app/scene-editor/Stage.tsx`: Alt+dobbeltklikk.
- `src/app/scene-editor/SceneEditorWorkspace.tsx`: åpner og lukker studioet.
- `src/app/scene-editor/RetimeDialog.tsx`: bruker `createDraft`.

Ingen migrasjon i AS1.

Tester:
- `tests/unit/as1-draft.test.ts`:
  - utkast med push, angre og gjør om;
  - hvitelisten avviser kommandoer for biblioteket;
  - inversen av `UpdateSceneDraft` gir samme tilstand som før;
  - rebase på en endret tilstand.
- Eksisterende tester for SV1 forblir grønne.
- DB: `UpdateSceneDraft` gjennom `apply_changes`, og revisjonskonflikt avviser hele kommandoen.
- `tests/visual/asset-studio-shell.mjs`:
  - åpning med knappen og med Alt+dobbeltklikk;
  - Avbryt etter en endring spør først, og scenen er uendret;
  - Oppdater gir én lagring og én angring;
  - mocket konflikt viser dialogen, med både «Legg oppå» og «Forkast»;
  - opplasting overlever Avbryt.

## AS2 – Bilde og tid

Datamodell:
- `ImageSwap.transition?: { kind: "cut" | "crossfade"; frames: number }`. Feltet mangler betyr kutt. Det ligger i den eksisterende jsonb-kolonnen `image_swaps`, så ingen migrasjon trengs. Validering: `frames` er mellom 1 og avstanden til forrige bytte.
- `CompositionLayer.activeFrom?: number | null` og `activeTo?: number | null` (inkludert). Null betyr hele scenen.
  - Dette krever migrasjon 0043 med nye kolonnene `composition_layers.active_from` og `active_to` (integer null, check `>= 0` og `active_to >= active_from`), og `schema_version` blir 43.
  - `apply_changes` henter kolonnelisten selv (`private.table_columns`), slik det ble sjekket i SV1. Den røres derfor ikke. Det sjekkes på nytt før migrasjonen skrives.
  - `EXPECTED_SCHEMA_VERSION` og `tests/visual/schema-version.mjs` settes til 43.
  - `patch.ts`, `project-rows.ts`, `layerFieldsOf` og validering av lagfelt oppdateres. Backup tar med feltene via `layerFieldsOf`, med test.
- Samspill:
  - Utenfor området tegnes laget ikke.
  - Innenfor gjelder `visible` og opasitetsnøkkelbildene som før. Effektiv opasitet = nøkkelbilde × synlig × innenfor området.
  - `visible = false` skjuler alltid laget.
  - Nøkkelbildene beregnes på scenens tid og tidsforskyves ikke.
  - Gruppelag: et barn tegnes bare når både gruppen og barnet er innenfor sine områder.
  - SV1 (`planRetime`) skalerer området med samme regler som nøkkelbildene. Metode 1 (Start) og metode 2 (Slutt) trimmer og rapporterer.

Tegning og avspilling:
- `renderFrame`, `RenderOptions`:
  - `onlyLayers?: ReadonlySet<string>` for «Bare objektet» (grupper som er forfedre, beregnes fortsatt for matrisen);
  - `fitTo?: {width, height}` gir en tilpasning til visningen bare i forhåndsvisningen, ikke i den lagrede transformasjonen.
- `layerImageAt` returnerer også `{from, to, mix}` under en krysstoning. Komposisjonen tegner to bilder med opasitetene `1 − mix` og `mix`, med samme matrise, maske og blanding.
- Eksporten (`engine/export/animatic.ts`, `film-video.ts`) og avspillingen bruker den samme `renderFrame`, så de forblir like. En test sammenligner `renderFrame` i kameravisning med eksportens bildeliste for krysstoning og aktivt område.
- `usePlayback(durationFrames, fps, loop, range?: {from, to})`: område med løkke for objektets aktive område eller hele scenen.

Brukerflate (`src/app/asset-studio/`):
- `VariantStrip.tsx`: alle versjoner på tvers av variantene, gruppert per variant, med merke for vinkel (`AssetVersion.view`). Kan dras med `ASSET_DRAG_TYPE` og versjons-ID.
- `ObjectTimeline.tsx`: bildesegmenter avledet fra `swaps` og basisbildet.
  - Segmentene kan flyttes, trimmes (flytter neste bytte), fjernes (fjerner byttet, aldri bildet) og erstattes.
  - Hvert bytte har et valg mellom kutt og krysstoning, med varighet.
  - Endene på det aktive området kan dras, og området kan også settes med tall.
- `StudioPreview.tsx`: veksling mellom «Bare objektet» og «Hele scenen», og mellom avspilling av objektets område og hele scenen.
- Ny kjernehjelper `src/core/composition/segments.ts`: `segmentsOf(layer)`, `moveSegment`, `trimSegment`, `removeSegment`, `replaceSegment`. Alle er rene og gir nye `swaps` til `UpdateLayers`.

Tester:
- `tests/unit/as2-segments.test.ts`:
  - segmentoperasjonene og at laget beholder sin identitet;
  - validering av krysstoningen;
  - `layerImageAt`-mix;
  - `onlyLayers` og `fitTo`;
  - aktivt område sammen med `visible`, opasitet og grupper;
  - retime av området;
  - backup og gjenoppretting;
  - lik forhåndsvisning og eksport;
  - `usePlayback` med område.
- DB: kolonnene i 0043, check-reglene, skriving via `apply_changes` og sletting eller purge (de følger laget).
- `tests/visual/asset-studio-image-time.mjs`:
  - dra en versjon inn som segment;
  - trimme, fjerne og erstatte;
  - krysstoning;
  - dra i området;
  - begge forhåndsvisningene og begge avspillingsområdene.

## AS3 – Lyd, media og manus

Lyd:
- Ny kjernehjelper `src/core/audio/asset-tracks.ts`: `assetAudioGroups(state, occurrenceId, assetId)` gir `{scene: [...music|ambience|sfx], character: [...dialogue der lineInfo.speaker eller soundLinks peker til ressursen], takes}`. Den er ren.
- `useAudioPlayback` får `mutedClipIds?: ReadonlySet<string>`, som en liten utvidelse av `scheduleAudio` og `addLoaded`. `mutedKinds` er uendret.
- `StudioAudioTracks.tsx`: grupperte spor med start og lengde, på linje med segmentene. Avkrysning per klipp og per gruppe gjelder bare forhåndslyttingen og begge visningene.
  - Handlingen «Lagre demping i scenen» legger `UpdateAudioClips` med `muted` i utkastet.

Medieverktøy (A7), `StudioMediaToolbar.tsx`, gjenbruker komponentene som finnes:
- opplasting og `MobileCameraButton` fra `LayerImageDialog`;
- `CutoutDialog`, som lagrer en ny versjon;
- `GenerateImagePanel`;
- `TurnaroundPanel`, som eksporteres fra der den ligger nå. Komponenten endres ikke;
- opplasting av lyd, `RecordAudioDialog`/`AudioTakesDialog`, `AudioCompositionEditor` og sammenligning av takes.

Alt dette skrives direkte, ikke via utkastet. Nye ressurser kobles til `assetId` for laget.

Manus:
- `SceneScriptPanel` får `highlightSpeaker?: assetId`, som markerer karakterens replikker. Visningen «Vis manus» står i høyre kolonne.
- Forsøksvis manusredigering (C2–C3, F4):
  - Ny `Annotation.kind?: "note" | "trial_edit"` og `suggestedText?: string`.
  - Migrasjon 0043 (samme fil som AS2):
    - `script_annotations.suggested_text text null check (length <= 10000)`;
    - `kind text not null default 'note' check (kind in ('note','trial_edit'))`;
    - check: `trial_edit` krever `block_id` og `suggested_text`.
    - `source` utvides ikke. Den forblir `user`/`system`, så ingen check må byttes.
  - Kommandoene `AddAnnotation`/`UpdateAnnotation` får feltene, og inversene som finnes, dekker dem. Sletting skjer med den vanlige notatslettingen (`removed`).
  - `NotesPanel` viser original (`quote`) og forslag. «Bruk forslaget» åpner en bekreftelse og kjører `EditBlockText` via den vanlige manusredigeringen. Notatet blir stående, og brukeren kan slette det.
  - Eksport og backup tar med feltene.

Filer:
- `src/core/audio/asset-tracks.ts`;
- `src/app/audio/use-audio-playback.ts`;
- `src/engine/audio/mixer.ts`;
- `src/app/asset-studio/StudioAudioTracks.tsx`, `StudioMediaToolbar.tsx`, `StudioScript.tsx` og `TrialEditForm.tsx`;
- `SceneScriptPanel.tsx`;
- `src/app/script/NotesPanel.tsx`;
- `src/core/model.ts`, `src/core/notes/index.ts`, `patch.ts` og `project-rows.ts`;
- backup.

Tester:
- `tests/unit/as3-audio-notes.test.ts`:
  - gruppering av lyd via `speaker` og `soundLinks`;
  - demping per klipp i `scheduleAudio`;
  - at demping ikke lagres uten den eksplisitte handlingen;
  - et trial_edit-notat validerer, angres og gjøres om;
  - «Bruk forslaget» gir `EditBlockText`;
  - backup.
- DB: feltene og check-reglene i 0043.
- `tests/visual/asset-studio-audio-media.mjs` og `asset-studio-script.mjs`:
  - forhåndslytting med demping;
  - lagring av demping;
  - at medieverktøyene åpner;
  - at et AI-bilde blir en ny versjon (mocket);
  - at et notat med forsøksvis redigering overlever Avbryt;
  - «Bruk forslaget» med bekreftelse;
  - engelsk visning.

Akseptansekriteriene 1–8 og 15 i diffen fordeles på disse fire nettlesertestene. Jeg har ikke selve teksten i diffen. Hvert steg merkes derfor med kriterienummeret ut fra beskrivelsen i oppdraget. Det må kontrolleres.

## Migrasjon (samlet)

`db/migrations/0043_asset_studio.sql`:
- `composition_layers.active_from` og `active_to`;
- `script_annotations.kind` og `suggested_text`;
- `schema_version` blir 43.

Migrasjonen skrives, men kjøres ikke. Den kan deles i 0043 (AS2) og 0044 (AS3) hvis stegene leveres hver for seg.

## Risikoer

- Utkast som lever lenge, gir flere konflikter. Rebasen kan feile på enkeltrinn, og det håndteres i dialogen.
- Krysstoning dobler tegningen i overgangen. Det er bare innenfor overgangen.
- Et aktivt område sammen med SV1-retime og overganger gir nye grensetilfeller. Testene dekker dem.
- Dra og slipp på tidslinjen er kode som ligner `Timeline`. Felles hjelpere fra `timeline-helpers.ts` gjenbrukes.
- Demping per klipp må ikke lekke inn i eksporten. Det testes.

## Åpne spørsmål

1. Skal det bli en ny `UpdateSceneDraft`, eller skal `RetimeScene` generaliseres til en felles samlekommando? Jeg anbefaler en ny kommando, så SV1 forblir uendret.
2. Notat for forsøksvis redigering: i oppdraget står det «blockId og variantId». Tabellen krever i dag enten blokk eller variant (`check ((block_id is null) <> (variant_id is null))`). Holder det med `blockId`, siden varianten følger av blokken? Det er det jeg foreslår.
3. Skal `source`/type utvides med en ny verdi i `source`, eller skal den nye kolonnen `kind` brukes, slik jeg foreslår?
4. Skal kriteriene 9–14 i diffen, som ikke er nevnt, være utenfor dette oppdraget?
5. Krysstoning mellom bilder med ulik størrelse: skal begge tegnes i sin egen størrelse rundt samme sentrum? Det foreslår jeg.
6. Skal migrasjonen være én fil (0043) eller to (0043/0044)?

## Endrede filer (i planmodus)

- `.lovable/plan.md`
