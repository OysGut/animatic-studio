# SV1 – Endring av scenevarighet (B-041)

Brukeren velger metode hver gang hele scenen endrer lengde (feltet «Varighet», dra i sluttpunktet, egenskapspanelet). Ingen stille standard. Gjelder bare hele scenen; lagvarighet hører til AS2 og flytter aldri andre lag eller dialog.

## 1. Kjernefunksjon `src/core/composition/retime.ts` (ren, plattformnøytral)

```text
planRetime(state, occurrenceId, {
  targetFrames, method: "start"|"end"|"pauses"|"stretch_all"|"stretch_visual",
  fill?: "freeze"|"background"|"black",   // kreves for start/end ved forlengelse
  keepAmbience: boolean,                   // standard true
  flexible?: FlexibleOptions               // overstyring for tester
}) -> { ok: true, command: RetimeScene, report } | { ok: false, reason, report }
```

`report`: før/etter (bilder og ms), metode, `moved[]`, `trimmed[]`, `scaled[]` (type + id: keyframe, imageSwap, path, cameraShot, audioClip, volumeKey, fade, timeLink, pause, clipPart), `gapsBefore[]`/`gapsAfter[]`, `lockedConflicts[]`, `audioNotFitting[]`, `reason` på norsk og engelsk via `L()`.

Metodene:
- **Start:** alt forskyves med differansen. Ved forkorting trimmes innhold før nytt bilde 0 (rapporteres). Ved forlengelse legges `padding.start` med valgt fyll.
- **Slutt:** ingenting forskyves. Forkorting trimmer innhold etter slutten (rapporteres, som `beyondEnd`). Forlengelse legger `padding.end`.
- **Fordel på pausene:** se punkt 2. Talelyd, musikk og video strekkes aldri; bare startpunkt flyttes.
- **Strekk alt:** all visuell tid skaleres med faktor `target/før`. Lydklippenes start følger med. For dialogklipp med ordjustering endres ordmellomrommene med `setPause`/`spreadPause` fra `core/audio/pauses.ts`, slik at klippets lengde følger skalaen; ordene selv endres ikke. Uten ordjustering flyttes bare starten.
- **Strekk alt unntatt lydfilene:** som over, men lydklipp (start, lengde, innhold, fades, volumpunkter) står urørt.

Låste tidsrom (punkt 3) holdes faste i metode 3–5; skalering skjer bare utenfor dem. Låst innhold som må flyttes eller trimmes gir `lockedConflicts` og `ok:false`.

## 2. Fleksible mellomrom (metode 3) – forslag

Godtar Claudes forslag, med to presiseringer:
- **Ankre:** dialog-, forteller- og effektklipp (hele spennet fra start til slutt), video- og filmdeler (`ClipPart` med kilde `take`), låste tidsrom. Musikk og atmosfære ankrer ikke; startpunktet deres flyttes med posisjonen i mellomrommet de starter i.
- **Mellomrom:** scenestart → første anker, mellom ankrene (sammenslåtte overlappende anker), siste anker → slutt. Mellomrom under 1 bilde regnes ikke.
- Ny tid fordeles proporsjonalt med mellomrommenes lengde (§11: 1/2/3 s + 3 s → +0,5/+1/+1,5 s). Ved forkorting trekkes det fra proporsjonalt; ingen mellomrom blir negative.
- Nøkkelbilder, bildeskifter, banepunkter, kamerautsnitt og tidskoblinger inne i et mellomrom skaleres lineært innenfor mellomrommet; ting inne i et anker flyttes med ankeret uendret.
- Pausene inne i et dialogopptak (DEC-0096) er **ikke** fleksible i metode 3 – de hører til metode 4. (Åpent spørsmål 1.)

## 3. Låste tidsrom

`lockedRanges: { id, startFrame, endFrame, label }[]` på komposisjonen. Settes i tidslinjen (merk et område → «Lås tidsrom», fjernes fra kontekstmenyen). Uavhengig av `CompositionLayer.locked`. Lagres i ny jsonb-kolonne (punkt 4) – **krever migrasjon 0042**.

## 4. Fyll i ny tid

`padding: { start: { frames, fill }, end: { frames, fill } }`, `fill` = freeze | background | black. Lagres sammen med låste tidsrom i én ny kolonne `compositions.timing jsonb not null default '{"lockedRanges":[],"padding":null}'` med check på type og størrelse (≤ 64 kB), som `camera`.

Tegning: én ren funksjon `paddingAt(c, frame)` i core. `renderFrame` (render.ts) bruker den: freeze → tegn innholdsbilde 0 / siste innholdsbilde; background → bare bakgrunnen; black → svart. Forhåndsvisning (canvas-compositoren) og eksport (`engine/export/animatic.ts`, film-video) går begge gjennom `renderFrame`, så resultatet er likt; en unit-test sammenligner pikslene via soft-canvas. Lyd: med `keepAmbience` forlenges musikk- og atmosfæreklipp som spiller over kanten (innenfor kildens lengde, ellers rapporteres i `audioNotFitting`); ingen annen lyd legges til.

Innholdstid = `durationFrames − padding.start − padding.end`; alle eksisterende tider forblir innholdslokale ved start-padding? **Nei** – for enkelhet forskyves tidene fysisk ved Start-metoden, og padding brukes bare til tegningen av fyllområdet. Padding nullstilles ved neste retime som berører den kanten.

## 5. Avrunding

Hjelper `distributeLargestRemainder(total, weights)` i core: hele bilder for visuell tid, hele ms for lyd; summen blir alltid eksakt målvarigheten. Skalering av enkeltpunkter: `round(start + (f − start) · faktor)`, med monotoni sikret (to punkter bytter aldri rekkefølge, sammenfallende punkter slås ikke sammen stille – rapporteres). Tester med §11-eksemplet i både bilder (25 fps) og ms.

## 6. For lite fleksibel tid (§13)

Forkorting større enn summen av fleksible mellomrom, eller treff i låst tidsrom → `ok:false` med forklaring («Scenen har bare 1,2 s fleksibel tid; du ba om −2 s»). Ingen kommando lages. Dialogen viser forklaringen og tilbyr annen metode eller Avbryt.

## 7. Utførelse – ny kommando `RetimeScene`

Én samlet kommando er realistisk og foretrekkes:
- Innhold: `compositionId`, ny `durationFrames`, nye `timing`, og fullstendige nye feltverdier for berørte lag, lydklipp, tidskoblinger og kamera (samme form som `UpdateLayers`/`UpdateAudioClips`/`UpdateTimeLinks`/`UpdateComposition`), pluss `occurrence.plannedMs` hvis satt.
- Invers: samme kommando med de gamle verdiene (snapshot før), testet med angre/gjør om.
- Patch: én patch med alle rader → én `apply_changes`-transaksjon med revisjonssjekk per rad. Endrer noen andre en rad i mellomtiden, avvises hele kommandoen og dialogen ber om ny beregning. Aldri delvis lagret.
- `planRetime` bygger kommandoen; validering i `apply.ts` gjentar sjekkene (varighet innenfor 1 s–1 t, monotone tider, ingen negative ms).

## 8. Brukerflate (`src/app/scene-editor/`)

- `RetimeDialog.tsx` «Endre scenevarighet»: ny varighet (s) eller +/−, fem metoder som radioknapper (ingen forhåndsvalg), fyll (vises bare for Start/Slutt ved forlengelse, ingen forhåndsvalg), «La atmosfære og musikk fortsette» (avkrysset), rapporten i klartekst, før/etter-stripe, «Forhåndsspill», «Bruk», «Avbryt». Bruk er deaktivert til metode (og fyll ved behov) er valgt og planen er `ok`.
- `RetimeStrip.tsx`: to tynne stripe-rader (før/etter) med ankre, mellomrom, låste tidsrom og padding i designtokens.
- Forhåndsspill: `applyCommand` lokalt på en kopi av tilstanden, spilles i den eksisterende avspillingen; ingen lagring.
- Innganger: feltet «Varighet» (`commitDuration` åpner dialogen i stedet for `UpdateComposition` direkte), nytt dragbart sluttpunkt på scenens tidslinje (slipp → dialog med målverdien), og varighetsfeltet i egenskapspanelet.
- Låste tidsrom: visning og kontekstmeny i tidslinjen.
- All tekst med `L()`, katalogen regenereres, `data-testid` på alle kontroller.

## 9. Tester

- Unit `tests/unit/sv1-retime.test.ts`: hver metode (forleng/forkort), §11-eksemplet, største-rest-summen, låste tidsrom, for lite tid (`ok:false`, ingen kommando), at tale, musikk og video aldri får endret lengde eller hastighet i metode 1–3 og 5, at metode 4 bare endrer ordmellomrom, fyll og `keepAmbience`.
- Kommando: `RetimeScene` virker, invers, angre/gjør om, revisjonskonflikt.
- Render: `paddingAt` + soft-canvas lik i forhåndsvisning og eksport.
- DB (`tests/db/run-db-tests.ts`): kolonnen `timing` (check, default), `RetimeScene` via `apply_changes` i én transaksjon, konflikt gir full avvisning.
- Nettleser `tests/visual/scene-duration-ui.mjs` (mønster fra `dec0096-pauses-ui.mjs`, `VISUAL_SCHEMA_VERSION`): testene G–L og 13–15, både norsk og engelsk visning. Jeg skriver den; Claude kjører den.

## 10. Migrasjon 0042

`db/migrations/0042_composition_timing.sql`: ny kolonne `compositions.timing`; `apply_changes` kopieres ordrett fra siste definisjon og endres bare hvis kolonnelisten for `compositions` er eksplisitt; `schema_version` 42 og `EXPECTED_SCHEMA_VERSION = 42`, `VISUAL_SCHEMA_VERSION = 42`. Mapping i `project-rows.ts`, backup tar med feltet (`src/core/backup`). Skrives, kjøres ikke.

## Risikoer

- Metode 4 krever ordjustering; uten den kan dialogopptak ikke strekkes – rapporteres per klipp.
- Skalering kan få to nøkkelbilder til å falle på samme bilde ved kraftig forkorting.
- Overlappende scener (`Transition.frames`) og `ClipPart`/`ProductionSegment` i filmen påvirkes av ny lengde; `ClipPart` med video holdes som anker, men montasjens delgrenser må beregnes på nytt.
- Stor kommando (mange lag) – grensene for patch-størrelse må sjekkes.

## Åpne spørsmål

1. Skal dialogens interne pauser (DEC-0096) også være fleksible i metode 3, eller bare i metode 4 (mitt forslag)?
2. Skal `plannedMs` på forekomsten følge den nye varigheten, eller bare `durationFrames`?
3. Ved Start-metoden: skal tidskoblinger til manusblokker som havner før bilde 0 trimmes eller avvise planen?
4. Gjelder metodevalget også når scenen følger beregnet varighet (`durationFrames = 0`) og manuset endres? Mitt forslag: nei, bare ved brukerens egne endringer.
5. Bekreft migrasjon 0042 med ny kolonne `timing` (alternativ: lagre i `camera`-jsonb uten migrasjon, som jeg fraråder).

## Filer (forventet)

Nye: `src/core/composition/retime.ts`, `src/core/composition/timing.ts` (paddingAt, lockedRanges, distribuering), `src/app/scene-editor/RetimeDialog.tsx`, `RetimeStrip.tsx`, `db/migrations/0042_composition_timing.sql`, tester over.
Endres: `src/core/model` (Composition.timing), `src/core/commands/types.ts` og `apply.ts` (RetimeScene), `src/core/composition/render.ts`, `src/core/backup`, `src/adapters/storage/project-rows.ts`, `SceneEditorWorkspace.tsx` og egenskapspanelet, scenens tidslinje, `tests/db/run-db-tests.ts`, `tests/visual/schema-version.mjs`, `catalog.gen.ts`, `roadmap.md`.
