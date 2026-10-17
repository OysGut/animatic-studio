# T1 – Brukerens egne tekst-AI-leverandører og felles `generateText`

## Kort fortalt
Brukeren kan koble til egne nøkler for Claude (Anthropic), ChatGPT (OpenAI), Grok (xAI) og Gemini (Google). Når en nøkkel prøves, hentes leverandørens egen modelliste og lagres. I dialogen for AI-leverandører får brukeren en ny seksjon, «Tekst-AI», der leverandør og modell velges per oppgavegruppe. All tekstgenerering går gjennom én serverfunksjon. Den velger leverandør, sjekker rettigheter, tak og kostnad, og logger uten prompttekst. Migrasjon 0038 skrives, men kjøres ikke.

## Filer som endres (og ingen andre)
| Fil | Endring |
|---|---|
| `src/core/generation/providers.ts` | `ProviderId` får `anthropic` og `xai`. Nye katalogoppføringer. `text` på openai, google, anthropic og xai. Felt for tokenpriser. Rene hjelpefunksjoner (velge leverandør og modell, kostnadsanslag, modellfilter). |
| `src/core/generation/model-settings.ts` | Godtar de nye leverandørene i tolking og validering (bare hvis den har en egen liste over leverandører). |
| `src/core/i18n/catalog.gen.ts` | Bare hvis `localized()`/`L()` krever katalogoppføringer for nye tekster, som i E4–E7. |
| `src/adapters/ai/providers.server.ts` | Adapterne `anthropic` og `xai`. `text()` og `listTextModels()` på alle fire. `ADAPTERS` utvides. |
| `src/adapters/ai/provider-keys.functions.ts` | Lagring og prøving henter og lagrer modellisten. Nytt `listTextChoices` (leverandører med gyldig nøkkel og modeller, uten nøkler). |
| `src/adapters/ai/text.functions.ts` (NY) | Serverfunksjonen `generateText`. |
| `src/adapters/ai/ai-gate.server.ts` | Bare hvis eksisterende hjelpefunksjoner (`memberRole`, `projectKey`, `overAccountCap`) trenger å kjenne `text` eller de nye leverandørene. Ellers urørt. |
| `src/app/ai/ProvidersDialog.tsx` | Seksjonen «Tekst-AI» og de to nye leverandørkortene (kortene kommer automatisk fra katalogen). |
| `src/adapters/storage/project-rows.ts` | `EXPECTED_SCHEMA_VERSION = 38`. |
| `db/migrations/0038_text_providers.sql` (NY) | Se SQL nedenfor. Kjøres ikke. |
| `tests/unit/text-providers.test.ts` (NY) | Katalogen, nøkkelmønstre, valg av leverandør og modell, kostnadsanslag og modellfilter. |
| `tests/unit/text-adapters.test.ts` (NY) | Adapterne med mocket `fetch`. |
| `tests/unit/ai-providers.test.ts`, `provider-capabilities.test.ts` | Bare hvis de i dag sjekker den nøyaktige leverandørlisten, og derfor ville feilet. |
| `tests/db/run-db-tests.ts` | Én liten test for 0038 (se nedenfor). |

Jeg rører ikke `docs/`, `drizzle/`, `src/integrations/`, pakker eller databasen.

## Typer og signaturer

**Kjernen (`src/core/generation/providers.ts`, plattformnøytral):**
```ts
export type ProviderId = "lovable" | "openai" | "google" | "fal" | "runway" | "elevenlabs" | "anthropic" | "xai";
export type TextProviderId = "openai" | "google" | "anthropic" | "xai";
export const TEXT_PROVIDERS: readonly TextProviderId[] = ["anthropic", "openai", "google", "xai"];

// ProviderModel får to valgfrie felter (bare tekst):
readonly usdPerMTokIn?: number;  readonly usdPerMTokOut?: number;

export type TextTask = "script" | "storylab_character" | "storylab_group" | "storylab_analysis"
  | "storylab_interview" | "storylab_profile" | "general";
export type TextTaskGroup = "script" | "storylab_talk" | "storylab_analysis" | "general";
export const TASK_GROUP: Record<TextTask, TextTaskGroup>;
//   script → script; storylab_character/group/interview → storylab_talk;
//   storylab_analysis/profile → storylab_analysis; general → general

export interface TextChoice { provider: TextProviderId | "lovable"; model: string }
export type TextPrefs = Partial<Record<TextTaskGroup, TextChoice>>;
export function isTextPrefs(v: unknown): v is TextPrefs;

export interface AvailableTextProvider { provider: TextProviderId; models: readonly string[] } // gyldig nøkkel
export function chooseTextModel(input: {
  explicit?: Partial<TextChoice>; task: TextTask; prefs: TextPrefs | null;
  available: readonly AvailableTextProvider[]; isEnabled: (p: string, m: string) => boolean;
}): { choice: TextChoice; reason: "explicit" | "pref" | "first_key" | "fallback" };

export function estimateTextCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number;
export function approxTokens(text: string): number;          // ceil(tegn / 4)
export function filterTextModels(provider: TextProviderId, ids: readonly string[]): string[];
```

**Adapterne (`providers.server.ts`):**
```ts
export interface TextMessage { role: "user" | "assistant"; content: string }
export interface TextRequest { key: string; model: string; system?: string; messages: readonly TextMessage[];
  maxTokens: number; temperature?: number; json?: boolean; signal?: AbortSignal }
export interface TextResult { text: string; usage: { inputTokens: number; outputTokens: number }; model: string }
// Hver tekstadapter: text(r: TextRequest): Promise<TextResult>; listTextModels(key): Promise<string[]>
export async function generateProviderText(p: TextProviderId, r: TextRequest): Promise<TextResult>;
```
Senere strømming legges til som `streamText(r): AsyncIterable<TextDelta>` ved siden av `text()`, uten å endre `TextRequest`.

**Serverfunksjonen (`text.functions.ts`):**
```ts
export const generateText = createServerFn({ method: "POST" })
  .inputValidator((d: { projectId: string; task: TextTask; system?: string; messages: TextMessage[];
    maxTokens?: number; temperature?: number; json?: boolean; provider?: string; model?: string }) => ...)
  .handler(...) // → { text, model, provider, usage, costUsd }
```

## Endepunkter per leverandør
- **Anthropic:** `POST https://api.anthropic.com/v1/messages`, med headerne `x-api-key` og `anthropic-version: 2023-06-01`. Body: `{model, max_tokens, system, messages, temperature}`. Svaret er tekstblokkene i `content[]` slått sammen, og `usage.input_tokens`/`output_tokens`. Ved `json` legges det til en systemlinje om å svare med ren JSON, og svaret kontrolleres med `JSON.parse`. `stop_reason: "refusal"` gir en feil.
- **OpenAI:** `POST /v1/chat/completions` med `max_completion_tokens` og `response_format: {type:"json_object"}` når `json` er satt. **Valg: Chat Completions.** Grunnen er at xAI bruker samme format, så OpenAI og xAI deler én funksjon (`openaiCompatText(base, …)`), og det gir mindre kode og færre feil. Responses-API-et gir ikke noe T1 trenger. Det kan tas inn når strømming og verktøy kommer. `temperature` sendes ikke til resonneringsmodeller (`o*`, `gpt-5*`), fordi de avviser den.
- **xAI:** `POST https://api.x.ai/v1/chat/completions` med `Authorization: Bearer`. Bruker samme funksjon som OpenAI.
- **Google:** `POST /v1beta/models/{model}:generateContent` med `x-goog-api-key`. `system` sendes som `systemInstruction`, og `assistant` blir rollen `model`. `generationConfig: {maxOutputTokens, temperature, responseMimeType: "application/json" ved json}`. Tokenbruken leses fra `usageMetadata.promptTokenCount`/`candidatesTokenCount`.
- Feil går gjennom eksisterende `call()`, `failure()` og `scrubSecret()`. `testProviderKey` får en tekst på begge språk for 401/403/402/429 i samme mønster. Tidsgrensen er en ny `T_TEXT = 120_000`.

## Henting og filtrering av modellister
Listen hentes ved `saveProviderKey` og `testSavedProviderKey`, når prøvingen gir «ok» eller «limited». `test()` for de fire leverandørene er da selve listekallet, så det blir ikke ekstra kall.
- **Anthropic:** `GET /v1/models?limit=1000` → `data[].id`. Alle er chatmodeller, og alle beholdes.
- **OpenAI:** `GET /v1/models` → `data[].id`. Disse beholdes: `^(gpt-|o\d|chatgpt-)`. Disse fjernes: `embedding|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|instruct|codex`.
- **xAI:** `GET /v1/models` → `data[].id`. `grok-*` beholdes, og `image|imagine|vision-only|embed` fjernes.
- **Google:** `GET /v1beta/models?pageSize=1000` → `models[]`. Modellen beholdes når `supportedGenerationMethods` inneholder `generateContent`, og navnet ikke inneholder `embedding|aqa|imagen|veo|tts|image`. Prefikset `models/` fjernes fra navnet.
- Listen sorteres, kuttes til høyst 200 ID-er og lagres i `ai_provider_keys.text_models`, sammen med `text_models_at`. Hvis hentingen feiler, beholdes den gamle listen, og nøkkelen lagres likevel.
- Brukeren velger fra den lagrede listen. Hvis listen er tom, vises katalogens standardmodeller. Administratorens bryter (`ai_model_settings`) filtrerer alltid, både i dialogen og i `generateText`.

## Standardmodeller i katalogen (få, med anslåtte tokenpriser)
- **Anthropic:** `claude-sonnet-4-5`, `claude-haiku-4-5`, `claude-opus-4-1`
- **OpenAI:** `gpt-5`, `gpt-5-mini`
- **xAI:** `grok-4`, `grok-3-mini`
- **Google:** `gemini-2.5-pro`, `gemini-2.5-flash`

Modeller som ikke er i katalogen, får leverandørens høyeste kjente pris i kostnadsanslaget, så anslaget heller blir for høyt enn for lavt.

## `generateText` – flyt
1. Validere input. Lengdegrensene er: `system` høyst 20 000 tegn, høyst 60 meldinger, høyst 200 000 tegn til sammen, og `maxTokens` mellom 1 og 8000 (standard 2000). `temperature` må være mellom 0 og 2, og `task` må stå på den faste listen.
2. Innlogging (`requireSupabaseAuth`). Rollen må være minst redaktør i prosjektet, med samme `memberRole`- og `ROLE_RANK`-sjekk som i `write-prompt`.
3. Tak per bruker per time, med `MAX_TEXT_JOBS_PER_USER_PER_HOUR = 120` og telling i `generation_jobs` (kind `text`), på samme måte som `MAX_PROMPT_JOBS_PER_USER_PER_HOUR`.
4. Valg av leverandør og modell gjøres med `chooseTextModel`, ut fra eksplisitt valg, `ui_prefs.aiText`, første gyldige nøkkel og til slutt Lovable AI Gateway (`TEXT_MODELS`). En eksplisitt leverandør uten gyldig nøkkel gir en feil. Den faller ikke stille tilbake.
5. Kostnadsanslaget er `approxTokens(input) + maxTokens`. Med egen nøkkel sjekkes `overAccountCap` før kallet. Med Lovable sjekkes prosjektets `ai_month_limit`, som i `write-prompt`.
6. Nøkkelen dekrypteres på serveren (`key-vault.server.ts`), adapteren kalles, og nøkkelen forlater aldri funksjonen.
7. Loggen i `generation_jobs` (kind `text`) får `params = {task, provider, model, inputTokens, outputTokens, costUsd, reason}`, uten prompt og uten svar. Kostnaden føres i `ai_spend` på samme måte som for de andre jobbene med egen nøkkel.
8. Svaret er `{ text, model, provider, usage, costUsd }`. Feil gis på begge språk.

## «Tekst-AI» i `ProvidersDialog.tsx`
Seksjonen har fire rader: Manus, Story Lab (samtaler), Story Lab (analyse) og Annet. Hver rad har en nedtrekksliste for leverandør («Automatisk», Lovable og leverandørene med gyldig nøkkel) og en for modell (den lagrede listen minus det administratoren har slått av).
**Valg: `useUiPref("aiText", {}, isTextPrefs)`** (lagres i `profiles.ui_prefs`). Grunnen er at mekanismen finnes fra før, er knyttet til kontoen og følger brukeren på tvers av enheter, og ikke krever en ny kolonne. Serveren leser `profiles.ui_prefs->'aiText'` og validerer verdien med `isTextPrefs`. Et ugyldig eller utdatert valg blir ignorert, og da brukes neste regel i rekkefølgen. All tekst skrives med `L()`.

## Migrasjon 0038 (skrives, kjøres ikke), med header som i 0037
```sql
alter table public.ai_provider_keys drop constraint if exists ai_provider_keys_provider_check;
alter table public.ai_provider_keys add constraint ai_provider_keys_provider_check
  check (provider in ('openai','google','fal','runway','elevenlabs','anthropic','xai'));
alter table public.ai_provider_keys add column if not exists text_models jsonb
  check (text_models is null or (jsonb_typeof(text_models) = 'array' and pg_column_size(text_models) <= 32000));
alter table public.ai_provider_keys add column if not exists text_models_at timestamptz;
grant select (text_models, text_models_at) on public.ai_provider_keys to authenticated;

alter table public.ai_model_settings drop constraint if exists ai_model_settings_provider_check;
alter table public.ai_model_settings add constraint ai_model_settings_provider_check
  check (provider in ('lovable','openai','google','fal','runway','elevenlabs','anthropic','xai'));

alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('image','video','prompt','sound','text'));

insert into public.schema_version (version, description)
  values (38, '0038_text_providers: tekst-AI med egne nøkler (Anthropic, OpenAI, xAI, Google)');
```
Navnene på de eksisterende constraintene kontrolleres mot 0024 og 0034 før filen skrives. Hvis de har andre navn enn Postgres’ standardnavn, brukes de faktiske navnene. `ai_spend` og `ai_provider_requests` kontrolleres også, i tilfelle de har en egen leverandørsjekk som må utvides.

## Tester
- **`text-providers.test.ts`:** de nye leverandørene og nøkkelmønstrene (`sk-ant-…`, `xai-…`, `sk-…`, `AIza…`). Valgrekkefølgen i fire tilfeller, et utdatert valg som hoppes over, og en modell administratoren har slått av, som hoppes over. Kostnadsanslag for kjente og ukjente modeller, oppgavegruppene og modellfilteret på eksempellister.
- **`text-adapters.test.ts`:** sjekker URL, headere og body per leverandør, med `temperature` utelatt for resonneringsmodeller. Svartolking og tokenbruk. Feil 401 og 429 med nøkkelen fjernet fra meldingen, Anthropics `refusal` og en Google-respons uten kandidater.
- **`tests/db/run-db-tests.ts`:** etter 0038 godtas `provider='anthropic'` og `kind='text'`. En ukjent leverandør og en `text_models` som ikke er en liste, avvises. Kjøres hos deg, fordi DB-testene trenger lokal Postgres.
- Jeg kjører `npx vitest run` på de nye testfilene og de to eksisterende AI-testene.

## Valgene jeg har tatt
1. OpenAI bruker Chat Completions. Det er felles med xAI, og Responses kan tas inn senere.
2. Valgene per oppgave lagres i `ui_prefs` (nøkkelen `aiText`), ikke i en ny kolonne.
3. Modellisten lagres på nøkkelraden (`text_models` og `text_models_at`).
4. Taket er 120 tekstjobber per bruker per time, egen konstant.
5. JSON-modus: OpenAI og xAI bruker `json_object`, Google `responseMimeType`, og Anthropic får en systeminstruks pluss kontroll med `JSON.parse`.
6. Lovable-reserven bruker eksisterende `TEXT_MODELS` gjennom gatewayen, på samme måte som `write-prompt`.

## Spørsmål
1. **Tak per time:** er 120 riktig, eller skal det være likt `write-prompt` (60)? Karaktersamtaler kan gi mange kall.
2. **Lovable som reserve:** skal den brukes stille, eller skal `generateText` svare med en tydelig merknad («brukte innebygd AI») som brukergrensesnittet viser?
3. **Prosjekt eller konto:** egne nøkler ligger på brukerens konto. Skal en redaktør i et annet prosjekt bruke **sin egen** nøkkel, slik planen legger opp til, eller nøkkelen til prosjekteieren, slik `projectKey` gjør for bilder og video?
4. **Antall modeller i katalogen:** holder det med 2–3 standardmodeller per leverandør, og er det greit at prisene er anslag som du oppdaterer?
5. **Ekstra filer:** godtar du at `model-settings.ts`, `ai-gate.server.ts`, `catalog.gen.ts` og de to eksisterende AI-testene endres **bare hvis** det trengs for at de nye leverandørene skal virke eller testene skal bestå? Ellers stopper jeg og spør først.
