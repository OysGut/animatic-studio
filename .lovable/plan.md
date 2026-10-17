# SL1 – Story Lab: datamodell og kjerne (uten brukerflate)

## Kort fortalt
SL1 legger grunnmuren for Story Lab: karakterprofiler, profilendringer over karakterbuen, fakta og hemmeligheter med hvem som vet hva og når, en ren turmaskin for samtaler, promptbyggere og arbeidslogg for økter. Det kommer ingen skjermbilder. Profiler, stadier og fakta skrives som vanlige kommandoer med angring gjennom `runCommand` og `apply_changes`. Øktene og forslagene er arbeidslogg og skrives av egne serverfunksjoner. Migrasjon 0039 skrives, men kjøres ikke.

## Filer

**Nye (kjernen, plattformnøytral)**
- `src/core/storylab/profile.ts`: `StoryProfile`, standardprofilen, `profileError` og `mergeProfile`.
- `src/core/storylab/facts.ts`: `StoryFact`, `factError` og `knowledgeAt`.
- `src/core/storylab/stages.ts`: `StoryProfileStage`, `stageError` og `profileAt`.
- `src/core/storylab/engine.ts`: turmaskinen, `suggestSpeaker` og `activeDirections`.
- `src/core/storylab/prompts.ts`: promptbyggerne, `groupTurnMessages` og `parseJsonLoose`.
- `src/core/storylab/index.ts`

**Endres (kjernen)**
- `src/core/index.ts`: `export * from "./storylab"`.
- `src/core/ids.ts`: nye ID-typer (`story_profile`, `story_profile_stage`, `story_fact`).
- `src/core/model.ts`: `ProjectState` får `storyProfiles`, `storyProfileStages` og `storyFacts`, og standardtilstanden får tomme verdier.
- `src/core/commands/types.ts` og `src/core/commands/apply.ts`: de åtte kommandoene med invers.
- `src/core/patch.ts`: tabellnavn, diff og rad↔tilstand for de tre tabellene, på samme måte som `style_profiles`.
- `src/core/backup/index.ts`: de tre tabellene i listen, i `restoredState` og i kontrollen av referanser.
- `src/core/i18n/catalog.gen.ts`: lages på nytt med `build-catalog.mjs`.

**Endres og lages (adaptere)**
- `src/adapters/storage/project-rows.ts`: `fetchOptional` for de tre tabellene, og `EXPECTED_SCHEMA_VERSION = 39`.
- `src/adapters/storylab/sessions.functions.ts` (ny): serverfunksjonene for økter og forslag.

**Migrasjon og tester**
- `db/migrations/0039_story_lab.sql` (ny).
- `tests/unit/storylab-knowledge.test.ts`, `storylab-engine.test.ts`, `storylab-prompts.test.ts` og `storylab-commands.test.ts` (nye).
- `tests/db/run-db-tests.ts`: nye tester for 0039.

**Endres bare hvis en eksisterende test eller arkitekturkontroll krever det.** Jeg nevner dem i svaret med begrunnelse.
- `tests/architecture/*` og `tests/invariants/*`, hvis noen kontrollerer at tabellistene i `patch.ts`, `backup` og `v_tables` er like.
- `src/core/invariants.ts`
- `src/adapters/storage/backup.functions.ts`, hvis gjenopprettingen har sin egen tabelliste.

Ingen pakker. Jeg rører ikke `docs/`, `drizzle/`, `src/integrations/` eller brukerflaten.

## Typer i grove trekk
```ts
// profile.ts
type SpeechLevel = "child" | "youth" | "adult" | "academic" | "street";
interface StoryProfile {
  psychology: { hiddenMotives: string[]; techniques: string[]; neverSay: string[]; blindSpots: string[];
    triggers: string[]; facade: string; reality: string; demonstrations: string[] };
  speech: { level: SpeechLevel; wordChoice: string; mood: string; typicalVocabulary: string[];
    forbiddenExpressions: string[]; examples: string[]; maxWords?: number };
  dramatic: { goals: string[]; innerContradictions: string[]; vulnerabilities: string[]; hides: string[];
    beliefsAboutOthers: { assetId: AssetId; belief: string }[] };
  person: { age?: number; occupation?: string; background?: string; values: string[]; dialect?: string;
    formality?: "low" | "medium" | "high" };
  notes: string;
}
type StoryProfilePatch = DeepPartial<StoryProfile>;   // lister erstattes helt, objekter slås sammen
interface StoryProfileRow { id; projectId; assetId; profile: StoryProfile; removed; revision }
function profileError(p: unknown): string | null;     // L(): felt, typer og lengder
const PROFILE_LIMITS = { short: 200, text: 2000, listItems: 30, item: 500, examples: 20, total: 60_000 };

// facts.ts
interface StoryFact { id; projectId; text: string; kind: "fact" | "secret";
  atSceneId: SceneId | null; knownBy: { assetId: AssetId; fromSceneId: SceneId | null }[]; removed; revision }
function knowledgeAt(s: ProjectState, assetId: AssetId, sceneId: SceneId):
  { facts: StoryFact[]; ownSecrets: StoryFact[] };

// stages.ts
interface StoryProfileStage { id; projectId; assetId; fromSceneId: SceneId; patch: StoryProfilePatch; removed; revision }
function profileAt(s: ProjectState, assetId: AssetId, sceneId: SceneId | null): StoryProfile | null;

// engine.ts
type Speaker = AssetId | "director" | "analyst";
interface Turn { id; speaker: Speaker; text; kind: "line" | "question" | "direction" | "analysis"; at: string }
interface Direction { id; text; target: AssetId | null; scope: "next" | "scene" | "session"; fromTurn: number }
interface EngineState { participants: AssetId[]; mode: "qa" | "improv"; status: "idle" | "running" | "paused" | "stopped";
  turns: Turn[]; directions: Direction[]; seed: number; maxTurnsPerRun: number; turnsThisRun: number;
  nextSpeaker: AssetId | null; explainFor: AssetId | null }
type EngineAction =
  | { type: "start" } | { type: "ask"; text; to: AssetId | null; at; id }
  | { type: "direct"; text; target: AssetId | null; scope; id } | { type: "removeDirection"; id }
  | { type: "nextSpeaker"; assetId: AssetId | null } | { type: "appendLine"; speaker: AssetId; text; at; id }
  | { type: "pause" } | { type: "resume" } | { type: "stop" }
  | { type: "branchFrom"; turnIndex: number } | { type: "explain"; assetId: AssetId };
function reduceEngine(s: EngineState, a: EngineAction): EngineState;   // ren; ID og tid kommer inn utenfra
function suggestSpeaker(s: EngineState, names: Record<string, string>): AssetId | null;
function activeDirections(s: EngineState, assetId: AssetId): Direction[];
```
Kommandoene er `SetStoryProfile`, `RemoveStoryProfile`, `AddStoryProfileStage`, `UpdateStoryProfileStage`, `RemoveStoryProfileStage`, `AddStoryFact`, `UpdateStoryFact` og `RemoveStoryFact`.
- `SetStoryProfile` oppretter profilen eller erstatter den. Den gamle profilen lagres i inversen.
- «Remove» setter `removed = true`, uten å slette noe (deaktivering er ikke sletting). Angring setter flagget tilbake.
- Kommandoene kontrollerer at ressursen er en karakter i prosjektet, at scenene finnes, at `knownBy` viser til karakterer og at profilen er gyldig.

## Fortellingstid
- Jeg gjenbruker `storyTimesCached(state)` fra `src/core/continuity`, som bygger på `storyTimes` i `views.ts`. Det er samme ordning som kontinuiteten bruker. Lineære scener får plass i hovedfilmen, og tilbakeblikk, framblikk, drømmer og tidshopp får ankerscenen pluss en forskyvning. Rekkefølgen i filmen brukes aldri.
- `knowledgeAt(s, asset, scene)`: med `T = tid(scene)` blir et faktum kjent for karakteren når alle tre vilkårene holder:
  - `atSceneId` er null, eller `tid(atSceneId) ≤ T`;
  - karakteren står i `knownBy`;
  - `fromSceneId` er null, eller `tid(fromSceneId) ≤ T`.
- Uten `knownBy` er faktumet bare kjent for regissøren. Egne hemmeligheter (`kind: "secret"` som karakteren kjenner) returneres for seg, så prompten kan antyde dem.
- `profileAt`: grunnprofilen og de stadiene der `tid(fromSceneId) ≤ T`, slått sammen i stigende fortellingstid. Er tidene like, avgjør stadiets ID. Uten scene brukes bare grunnprofilen.

## Promptene (engelske, svar på manusets språk)
- `characterSystemPrompt` får inn bare `knowledge.facts` og egne hemmeligheter. Andres hemmeligheter og regissørens fakta kommer aldri inn i funksjonen. Det er det testen viser med et øyeblikksbilde.
- Midlertidig regi står under «Current state (this moment only)».
- `analystSystemPrompt` og `sceneAnalysisPrompt` skiller «established» (med kilde: profilfelt eller blokk-ID) fra «interpretation». Svaret er JSON `{ points: [{ aspect, finding, evidence[], suggestion }] }`.
- `profileGeneratorPrompt` ber om en `StoryProfile` som JSON, som kontrolleres med `profileError`.
- `parseJsonLoose` tåler kodegjerder, tekst før og etter, etterfølgende komma og «smarte» anførselstegn. Den gir `null` i stedet for å kaste en feil.
- `groupTurnMessages(state, speaker, names)`: egne replikker blir `assistant`, andre `user` med `Name: text`, og aktiv regi for taleren legges til i systemteksten. Meldingene har samme form som `generateText` i T1 tar imot.

## Migrasjon 0039 (skrives, kjøres ikke)
- **Tabeller:**
  - `story_profiles`: unik indeks på `(project_id, asset_id) where not removed`. `profile` jsonb er et objekt på høyst 64 kB.
  - `story_profile_stages`: fremmednøkkel til `scenes`, og `patch` jsonb på høyst 64 kB.
  - `story_facts`: `text` på høyst 4000 tegn, `kind` med sjekk, og `known_by` jsonb som er en liste på høyst 32 kB.
  - Alle tre har fremmednøkler til `projects`, og til `assets` med `on delete restrict`, i samme stil som `asset_relations`.
- **Kolonnene i `story_sessions`:**
  - `kind` og `status` med sjekk;
  - `context` jsonb på høyst 256 kB og `turns` jsonb på høyst 2 MB;
  - `parent_session_id` (selvreferanse) og `from_turn`;
  - `cost_usd` ≥ 0 og `updated_at`.
- **Kolonnene i `story_suggestions`:** `kind` og `status` med sjekk, og `payload` jsonb på høyst 64 kB.
- **GRANT og RLS:**
  - Prosjektmedlemmer får lese alle fem tabellene (`select` for authenticated og en policy med `private.is_project_member(project_id)`).
  - Klienten får ikke skrive (som i 0019), og service_role får alt.
- **`apply_changes`:** kopieres byte for byte fra 0028, med tre nye navn bakerst i `v_tables`. Revoke og grant følger som i 0028.
- **`delete_project`** (siste i 0021) og **`purge_project_assets`** (siste i 0035) lages på nytt. Forslag, økter, fakta, stadier og profiler slettes før `assets` og `scenes`.
- **`purge_removed_assets`** (0029): en ressurs med Story Lab-rader som ikke er fjernet, kan ikke slettes for godt (samme vern som for `asset_relations`). Fjernede Story Lab-rader slettes sammen med ressursen.
- Til slutt: `schema_version` 39.

## Serverfunksjoner (`sessions.functions.ts`)
Alle krever innlogging og rollen redaktør (`memberRole`, `ROLE_RANK`). De skriver med service role og kaller ikke AI.
- `createStorySession`, `forkStorySession` (kopierer turene til og med `fromTurn` og setter `parent_session_id`) og `getStorySession`.
- `listStorySessions` (uten `turns`, for å holde svaret lite).
- `appendStoryTurns` legger til turene, øker `cost_usd` og setter status. Lagringen kontrollerer størrelsen og stopper over 2 MB med en melding på begge språk.
- `saveStorySuggestion` og `setSuggestionStatus`.
- Før 0039 er kjørt, gir de en melding om at databasen må oppdateres.

## Tester
- **`storylab-knowledge.test.ts`:**
  - `knowledgeAt`, også tilbakeblikket: en scene som kommer senere i filmen, men tidligere i fortellingstid, kjenner ikke til senere hendelser;
  - fakta som bare regissøren kjenner;
  - `fromSceneId`;
  - `profileAt` med to stadier og et tilbakeblikk.
- **`storylab-engine.test.ts`:**
  - regi med gyldigheten `next`, `scene` og `session`;
  - status `paused` ved taket, og `resume` som nullstiller `turnsThisRun`;
  - `branchFrom`;
  - at samme taler aldri kommer tre ganger på rad, prøvd med 200 tilfeldige `seed`-verdier;
  - at den som ble tiltalt eller nevnt, går foran;
  - at samme `seed` gir samme taler.
- **`storylab-prompts.test.ts`:**
  - øyeblikksbilde av `characterSystemPrompt`, uten noen andres hemmelighet;
  - at den egne hemmeligheten står under «hint only»;
  - midlertidig tilstand;
  - `groupTurnMessages`;
  - `parseJsonLoose` med seks tilfeller.
- **`storylab-commands.test.ts`:** alle åtte kommandoene med gjør, angre og gjør om (`applyCommand` og invers), valideringsfeil, og at en profil ikke kan lages på en ressurs som ikke er karakter.
- **DB:**
  - RLS-matrise for de fem tabellene: medlemmer leser, utenforstående ser ingenting, og ingen kan skrive fra klienten;
  - `apply_changes` som skriver og angrer de tre tabellene;
  - `delete_project` og `purge_project_assets` med Story Lab-rader.
- Jeg kjører `npx tsc --noEmit`, de nye testene og de eksisterende testene for kommandoer, sikkerhetskopi og arkitektur.

## Risikoer
1. **`apply_changes` lages på nytt.** Et avvik fra 0028 ville ødelagt all skriving. Jeg sammenligner derfor med `diff` mot 0028, slik at bare `v_tables` er endret.
2. **`delete_project` og `purge_*` lages på nytt.** Feil rekkefølge gir brudd på fremmednøkler ved sletting. DB-testene dekker det.
3. **Fremmednøkkelen til `scenes`.** Scener blir ikke slettet i vanlig bruk, men sammenslåing (`merged_into_scene_id`) kan gjøre at et stadium viser til en sammenslått scene. Fortellingstiden for en sammenslått scene følger `storyTimes`.
4. **Profiler er store jsonb-verdier i `change_log`.** Hver lagring tar med hele den gamle og den nye profilen. Grensen på 64 kB holder det nede.
5. **Sikkerhetskopier og gjenoppretting** må kjenne de nye tabellene. Ellers kan en gjenopprettet sikkerhetskopi mangle profiler, eller bli avvist.
6. **Appen viser at databasen er utdatert** til du kjører 0039, fordi `EXPECTED_SCHEMA_VERSION` blir 39.

## Valg jeg har tatt
- Profilene, stadiene og fakta er prosjektdata med angring. Øktene er arbeidslogg uten angring, slik oppdraget sier.
- I `patch` blir lister erstattet helt og objekter slått sammen, så et stadium kan fjerne en motivasjon.
- Turmaskinen får ID og tid inn i handlingene, så den forblir ren og deterministisk.
- Lengdegrensene i kjernen er strengere enn i databasen. Databasen er bare siste sperre.

## Spørsmål
1. **Hvem kan få profil:** bare ressurser av typen `character`, eller også andre (for eksempel et dyr eller en gruppe)?
2. **`RemoveStoryProfile`:** skal stadiene og fakta for karakteren også markeres som fjernet, eller bare skjules så lenge profilen er fjernet?
3. **`story_sessions.turns`:** skal turene også lagres med prompt og svar i klartekst? Det er arbeidsmaterialet. Jeg antar ja, siden dette er brukerens eget innhold (ikke `generation_jobs`-loggen fra T1).
4. **Spesifikasjonen kap. 24:** den ligger i Claude-prosjektet, ikke i repoet. Kan du lime inn listen over analysepunktene (`aspect`), så `sceneAnalysisPrompt` følger den nøyaktig? Ellers bruker jeg en generell dramaturgisk liste og merker den som midlertidig.
5. **Stadier ved én scene:** ett stadium per karakter per scene (en unik indeks), eller flere?
