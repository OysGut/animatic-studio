# Hotfix B-094 og B-095 – rapport

Dato: 2026-10-21.

## B-094: Story Lab ga «ugyldig JSON»

Feilen var avkortede svar: modellen nådde token-grensen, svaret ble kuttet midt i JSON og `checkJson` feilet.

1. **Avkortede svar fanges nå hos alle fire leverandørene** i `src/adapters/ai/providers.server.ts`: Anthropic `stop_reason === "max_tokens"`, OpenAI/xAI `finish_reason === "length"`, Gemini `finishReason === "MAX_TOKENS"`. Alle gir feilkoden `truncated` med meldingen «Svaret ble avkortet fordi det ble for langt. Prøv igjen med kortere utvalg.» (nb) / «The reply was cut off because it became too long. Try again with a smaller selection.» (en). Anthropic `stop_reason === "refusal"` har egen feilkode.
2. **Tokengrenser:** scene-analysen i `SceneLab.tsx` har 8000, replikksjekken 2000, kontekstforslag (`ContextLinkSuggestions.tsx`) og materialoppdatering (`MaterialUpdateSection.tsx`) 2000, profilgenerering (`ProfileGenerateDialog.tsx`) 3000. Kostnadsanslagene bruker samme grenser som kallene. Gjenværende kall med `json: true` ble gått gjennom i en egen runde (se nedenfor).
3. **Robust `checkJson`:** finner første `{` eller `[` og den tilsvarende avslutningen, og tåler dermed innledende/avsluttende prosa og kodegjerder hvor som helst i svaret. Ingen annen reparasjon.
4. **Anthropic** bruker verktøykall med JSON-skjema der modellen støtter det; ellers dagens instruks pluss det robuste uttrekket.
5. **Diagnose:** `stop_reason`/`finish_reason` og antall tokens ut lagres i `generation_jobs.params` (`stopReason`, `outputTokens`). Prompt og svar lagres aldri der.
6. **Ingen automatisk nytt forsøk** som koster penger er lagt til.
7. **Tester:** 40 målrettede enhetstester med falske svar (avkorting hos alle fire leverandørene, JSON med prosa foran, JSON i kodegjerde midt i tekst). Ingen ekte AI-kall.

## B-095: Merk feil som lest

- Kjerne: `src/core/generation/read-status.ts` med `AiJobsReadPrefs { readBefore?, readIds? }` (maks 500 enkelt-ID-er, nyeste beholdes), `isJobRead`, `unreadFailedJobs`, `markJobsRead` og `markAllJobsRead`. Eksportert fra `src/core/index.ts`.
- `GenerationStatus.tsx`: hver mislykket/tapt jobb har «Merk som lest», listen har «Merk alle som lest», leste feil vises nedtonet med feilteksten tilgjengelig, og ingenting slettes. Trekanten og telleren viser bare uleste feil; en ny feil tenner trekanten igjen.
- `ProjectTodoBox.tsx`: «Feil siste uke» teller bare uleste feil og har «Merk alle som lest».
- Lagring i `profiles.ui_prefs` under nøkkelen `aiJobsRead` via eksisterende `useUiPref`. **Avvik fra oppdraget:** oppdraget nevnte nøkkelen `aiJobsReadBefore`; vi brukte `aiJobsRead` som samler både tidspunktet (`readBefore`) og enkelt-ID-ene (`readIds`) i én preferanse, slik `useUiPref`-mønsteret legger opp til. Ingen migrasjon.
- Tekster via `t()` på nb og en; knappene har tydelige navn for tastatur og skjermleser.
- Tester: `tests/unit/ai-jobs-read.test.ts` (8/8: ulest, lest enkeltvis, «alle», ny feil etter «alle», 500-grensen) og visuell suite `tests/visual/job-read.mjs` (nb og UI_LANG=en).

## Resultater

_Fylles inn når job-read.mjs, regresjonene, full Vitest og DB er kjørt._
