# SL7 – Skrivecanvas og intervju i Story Lab

Ingen databaseendringer kjøres. Migrasjonen skrives som fil. Eneste nye pakke er `@xyflow/react@^12`.

## Migrasjon – `db/migrations/0040_story_canvas.sql` (kjøres ikke)
- `story_canvas_nodes` og `story_canvas_edges` som i oppdraget. Check-constraints på `kind`, tekstlengder (`title` ≤ 300, `body` ≤ 8000, `label` ≤ 200) og `color` (token-navn eller null).
- `group_id` er en selvreferanse. En trigger sjekker at den peker på en node med `kind = 'group'` i samme prosjekt. En trigger på kanter sjekker at begge nodene tilhører kantens prosjekt.
- `asset_id` og `scene_id` får `on delete restrict`.
- RLS: lesing via `private.is_project_member`, ingen skriving fra klienten. GRANT select til authenticated og all til service_role.
- `apply_changes`, `delete_project`, `purge_project_assets` og `purge_removed_assets` kopieres ordrett fra 0039. Endringer:
  - begge tabellene legges i `v_tables`;
  - delete-rekkefølgen er kanter, så noder, og begge før `story_facts`;
  - purge-funksjonene fjerner noder og kanter som peker på assets eller scener som slettes, før de slettes.
- `schema_version` blir 40. `EXPECTED_SCHEMA_VERSION` blir 40.
- Sjekkes før skriving: om CHECK-constrainten på `story_sessions.kind` tillater `interview`. Hvis ikke, utvides den i samme migrasjon. Det er et avvik, og det rapporteres.

## Kommandoer (`src/core/commands`)
- `AddCanvasNodes` med invers `RemoveCanvasNodes` (bare nodene).
- `UpdateCanvasNode` (feltpatch) med invers patch av de gamle verdiene.
- `MoveCanvasNodes` (liste av {id,x,y}) med invers med de gamle posisjonene.
- `RemoveCanvasNodes` fjerner også de tilknyttede kantene. Inversen gjenoppretter begge.
- `AddCanvasEdge`, `UpdateCanvasEdge` og `RemoveCanvasEdge` med inverser.
- Alle går via `runCommand`. Flerkommando-handlinger (intervjunoder og overføringer) kjøres som én angregruppe med den eksisterende grupperingen i `use-commands.ts`.

## Filliste
Nye filer:
- `db/migrations/0040_story_canvas.sql`
- `src/core/storylab/canvas.ts`: typer, `canvasNodeError`, `canvasEdgeError`, `layoutFromStructure`, `canvasSummary` (≤ 4000 tegn, uten fakta og hemmeligheter)
- `src/core/storylab/interview.ts`: `interviewSystemPrompt`, `interviewToNodesPrompt`, `interviewNodesFromJson`
- `src/core/storylab/canvas-transfer.ts`: ren planlegging av `CreateAssets`, `SetStoryProfile`, `CreateScene` og koblingen (`UpdateCanvasNode`)
- `src/app/storylab/canvas/`: `CanvasView.tsx`, `CanvasToolbar.tsx`, `CanvasNode.tsx` (nodetyper med ikon og token), `CanvasInspector.tsx`, `CanvasTransferDialog.tsx`, `BuildFromScriptDialog.tsx`, `canvas-data.ts`
- `src/app/storylab/InterviewView.tsx` og `InterviewNodesPreview.tsx`
- Tester: `tests/unit/storylab-canvas-commands.test.ts`, `storylab-canvas.test.ts`, `storylab-interview.test.ts`, `storylab-canvas-transfer.test.ts` og `tests/visual/storylab-canvas-ui.mjs`

Endrede filer:
- `src/core/commands/types.ts` og `apply.ts`
- `src/core/storylab/index.ts`
- `ProjectState`-typen
- `src/adapters/storage/project-rows.ts`
- `src/core/backup`
- `src/adapters/storylab/sessions.functions.ts`, bare hvis `interview` mangler i en whitelist
- `StoryLabWorkspace.tsx`: Canvas-fanen, forslag om intervju på startsiden og panelet ved siden av canvaset
- ruten `prosjekt.$projectId.storylab.tsx`: søkeparameter `view=canvas`
- `tests/db/run-db-tests.ts`
- `package.json`: `@xyflow/react`
- i18n-katalogen (regenereres)

## Komponenter
- **Canvas:** React Flow med egne nodetyper, `onlyRenderVisibleElements` for 500 noder og memoiserte noder. Ved dragStop lagres én `MoveCanvasNodes` for alle nodene som er flyttet. Tekst i inspektøren lagres med debounce (cirka 600 ms) som `UpdateCanvasNode`.
- **Snarveier:** Delete, Ctrl/Cmd+D, piltaster (8 px, med Shift 32 px) og Tab. Hver node er fokuserbar med `aria-label`.
- **Klikk på en koblet node:** asset åpner karakterflaten, scene åpner Scenelaben (`?scene=`).
- **Intervju:** samme oppsett som `ConversationView`: kostnadsbekreftelse, løpende sum, `appendStoryTurns` og hurtigbufferrettingen fra SL3. Språket kommer fra `useLanguage()`. «Foreslå noder …» viser en forhåndsvisning med avkryssing og plassering automatisk eller ved utvalget.
- **Overføring:** inspektøren viser knapper etter type. Forhåndsvisningen bruker `ForkNotice` og kjører det som én angregruppe. Etterpå vises en lenke til biblioteket eller manuset. Scenen opprettes med de samme hjelperne for orderKey og ny scene som manuseditoren bruker.
- Alle tekster bruker `L()`, og bare designtokens brukes. `data-testid` er som i oppdraget.

## Risikoer
- **Ytelse:** 500 noder på under 3 sekunder krever virtualisering og at nodedata ikke lages på nytt ved hver render.
- **Stilark:** React Flow har sitt eget stilark. Det importeres og overstyres med tokens, slik at det ikke blir hardkodede farger.
- **SSR:** React Flow er bare for nettleseren. Canvaset lastes lazy bak `ClientOnly`.
- **Delvis lagring:** flerkommandogrupper (intervju og overføring) har ingen atomisk transaksjon, samme kjente begrensning som i SL6.
- **Hurtigtaster:** canvasets snarveier kan kollidere med de globale angre-snarveiene og med fokus i tekstfelt. De skal bare gjelde når canvaset har fokus.
- **Migrasjonen:** kopi av lange SQL-funksjoner kan gi feil. Jeg gjør en diff mot 0039 for å vise at bare tabellene og rekkefølgen er endret.
- **Uklare punkter (jeg antar slik hvis du ikke sier noe annet):**
  - «Grupper» lager en `group`-node rundt utvalget og setter `group_id`.
  - Dyr opprettes med kind `animal`, hvis den finnes i `CreateAssets`. Hvis ikke, spør jeg.
