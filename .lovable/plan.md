# Plan: Script-Driven Dialogue & Voice Studio (DV)

Spesifikasjonen (§1–§147) lagres ordrett som `docs/product/phase3/DIALOGUE_VOICE_SPEC.md` i DV1. Ingen kode før planen er godkjent.

## 1. Kartlegging (§136)

| Område | Finnes i dag | Vurdering |
|---|---|---|
| `takes` + aktiv take (`scene_occurrences.active_take_id`) | Film/AI-video per forekomst, `producedFrom`/`acceptedFrom` (DEC-0054) | Gjenbrukes som mønster for revisjonsgrunnlag og godkjenning, ikke for dialog (takes er film) |
| `audio_clips` | Ett klipp = plassering (`offsetMs`) **og** redigering (`sourceInMs`, `lengthMs`, `gainDb`, fades, `volumeKeys`, `speed`) + `blockId`, `language`, `versionId` | **Hovedfunn:** plassering og redigering er slått sammen. Dette bryter §37/§119. Utvides (se datamodell) |
| `clip_parts` | Deler av film-take/komposisjon | Urørt; lydversjonens delredigering bruker eksisterende lydkomposisjoner (0036) |
| Lydprofil (bølgeform, volumkurve, hastighet, trim, tastatur) | `AudioCompositionEditor`, klippredigering | Gjenbrukes, men leser/skriver lydversjonens felt i stedet for klippets |
| Opptaksdialog (`RecordAudioDialog`) med replikkvelger og «Spill av scenen mens du tar opp» | Ja | Utvides til dialogeditor (D1–D8), ingen ny editor (§8) |
| Ordkobling (0037) og `time_links` | Ja, `alignmentInComposition` | Gjenbrukes til ordnivå-navigasjon (§4) og avviksdiff |
| `script_blocks` + `script_block_revisions` | Uforanderlige revisjoner | Grunnlag for «manusrevisjon per lydversjon» (§70–73) |
| `script_annotations` (+ `resolved`, 0059) | Tekstnotater/nåler på blokk/variant | **Ikke** grunnlag for gule lapper: annen livssyklus (av/på ≠ løst, mål er lyd/bilde/forekomst). Egen tabell (§117) |
| ElevenLabs (`speech.functions.ts`) | Stemmeliste, tale, `projectKey`, `estimateCostUsd` per tegn, `generation_jobs`, budsjett/godkjenning | Gjenbrukes; utvides med modellliste og språk per modell |
| `assets.voice` (0026) | Standardstemme per karakter | Utvides til full stemmeprofil (§22–23) |
| `lipsync_results` | Knyttet til take/klipp + lydhash | Re-pekes til lydversjon (stale ved versjonsbytte håndteres via hash) |
| KI-241 | Rettet: nye opptak går til valgt klipp | Blir overflødig når klipp = replikkforekomst |
| Flerbruker/realtime | `presence.ts`, revisjonssjekk i `apply_changes`, konfliktdialog | Gjenbrukes for lapper og versjonsvalg |
| CA-dialogspor (`DialogueTrack.tsx`) | Ett spor per klipp, navn = klippnavn | Grupperes per karakter (L1–L3) |

## 2. Datamodell (§118–§122, §137)

```text
asset (karakter) ── voice_profile (jsonb på assets.voice, utvidet)
script_block (replikk, revisjoner)
   └─ audio_clips  = DIALOGFOREKOMST: occurrence, blockId, characterAssetId, offsetMs,
                     activeVersionId, language-overstyring   (eier scenetid + aktivt valg)
        └─ dialogue_versions = LYDVERSJON: assetVersionId (fil), kilde (record|ai|upload),
                     provider/voiceId/modelId/settings, sourceInMs, lengthMs, gain, fades,
                     volumeKeys, speed, compositionId?, parentVersionId,
                     scriptRevision (blokk-rev den ble laget fra), removed=false alltid ved bytte
dialogue_reviews   = godkjenning (versionId + blockRev + hvem/når + grunnlag manual|generated)
note_flags         = gul lapp (mål: kind+id, active, text, created/updated/statusBy)  DELT
user_bookmarks     = personlig (user_id, project_id unik, kontekst jsonb)  utenfor apply_changes
generation_jobs    = massejobber (params.kind='dialogue_batch', items med idempotensnøkkel)
```

- Avvik beregnes rent i `src/core/dialogue/drift.ts`: aktiv versjons `scriptRevision` mot blokkens gjeldende rev, minus gyldig `dialogue_reviews`. Ingen lagret «rød»-flagg → én felles status overalt (§77).
- Migrering av eksisterende klipp: hvert `audio_clips` med `blockId` får én `dialogue_versions`-rad kopiert fra klippets redigeringsfelt; klippets felt beholdes som deprecated speiling (bakoverkompatibelt, ingen tap).
- Bokmerker er personlig UI-tilstand: skrives via security-definer-funksjon `set_my_bookmark`/`consume_my_bookmark`, RLS `user_id = auth.uid()` (som `ui_prefs`). Anbefaling.

## 3. Byggeplan

| Steg | Innhold (§138-pakker) | Migrasjon | Akseptanse |
|---|---|---|---|
| **DV1** | Spec-fil. Manusnavigasjon: klikk → avspillingshode (time_links/ordkobling/blokkstart/anker, «estimert»/«mangler»-merking), dobbeltklikk → dialogeditor med forhåndsvalgt replikk, klikk/dobbeltklikk-debounce | Nei | M1–M5 |
| **DV2** | Datamodellsplitt: `dialogue_versions`, `audio_clips.active_version_id`, `character_asset_id`; backfill; kommandoer `AddDialogueVersion`, `SetActiveDialogueVersion`, `UpdateDialogueVersionEdit`, `MoveDialogueLine` (alle med invers) | 0060 | L7–L9, tapsfri-test |
| **DV3** | Forbedret dialogeditor: stor replikk, kontekst 70 %, portrett, navn, replikkvelger, hodetelefonvarsel, stablede versjonsbølger, forhåndslytt vs aktiv. Karakterspor i sceneeditor + CA-fanen, overlappsvarsel | Nei | D1–D8, L1–L6, L10 |
| **DV4** | Lyd/Stemme-seksjon i Asset Library, stemmeprofil, ElevenLabs stemmer/modeller/språk, «Generer lydfil» med lokal overstyring, flere alternativer | 0061 (assets.voice-utvidelse ved behov) | V1–V7 |
| **DV5** | Massegenerering: dekningsanalyse, scenevalg, advarsel, estimat (kost+tid), bekreftelse, fremdrift per replikk, gjenoppta, automatisk plassering, minimal 2D-scene, idempotens | 0062 (jobbelementer om nødvendig) | G1–G13 |
| **DV6** | Språk: tre dimensjoner, replikkspråk, deteksjon som støtte, samlet eller oppdelte jobber | Nei (bruker `audio_clips.language` + blokk) | S1–S8 |
| **DV7** | Avvik: drift-beregning, rødt i alle manusflater, ordvis diff i editor, lenke-ut, «Merk som gjennomgått», «Generer alle røde» | 0063 (`dialogue_reviews`) | A1–A12, R1–R6 |
| **DV8** | Bokmerke (toppmeny), gule lapper på lyd/versjon/segment/bilde/variant/forekomst, merknadsboks på prosjektsiden (sortering/filter/navigasjon) + full regresjon | 0064 (`note_flags`, `user_bookmarks`) | B1–B4, H1–H14 |

Per steg: kommandoer via `runCommand` → `apply_changes`; Vitest (kommando + invers/angring); DB-tester for RLS/grants/apply_changes/delete_project/purge; visuell suite `tests/visual/dvN-*.mjs` + regresjon CA1–CA8, U5, scene-panels, lydeditor.

**Tapsfri-test i hvert steg (§36/§120/§139):** egenskapsbasert test som kjører tilfeldige sekvenser (opptak, generering, bytte, flytt, redigering, angre) og verifiserer at alle versjoner og deres redigeringsfelt er bitidentiske før/etter bytte, og at ingen `dialogue_versions` får `removed=true` utenom eksplisitt sletting.

## 4. ElevenLabs og kostnadsport
- Eksisterende `gate.projectKey`, `estimateCostUsd`, budsjett og godkjenning gjenbrukes; massejobben viser samlet estimat og krever ett eksplisitt «Godkjenn» før noe betalt kall (§50–52).
- API slik jeg kjenner det: `GET /v1/voices` (stemmer inkl. egne/klonede, `labels`, `verified_languages`), `GET /v1/models` (`languages[]`, `can_do_text_to_speech`, `character_cost_multiplier`), `POST /v1/text-to-speech/{voice_id}` med `model_id`, `language_code` (enkelte modeller), `voice_settings`, `previous_text/next_text`.
- **Kan ikke verifiseres her:** faktisk pris per tegn for kontoens plan, kvoter/hastighetsgrenser, hvilke modeller kontoen har, og tilgang til stemmekloning. Estimat merkes alltid «anslag»; mangler pris, vises «ukjent pris» (ingen oppdiktet tall).
- Alle tester bruker mock-adapter; arkitekturtest som feiler hvis testkoden importerer ekte nettverkskall.

## 5. Språk (B-049 og Del I)
Anbefaling: tre uavhengige felt, aldri utledet av hverandre: `uiLocale` (bruker, eksisterende), `scriptLanguage` (prosjekt standard → variant/blokk-overstyring), `speechLanguage` (karakterprofil → replikk → genereringsvalg). BCP-47-koder uten fast liste; støttede språk hentes fra modellen. B-049 (flere grensesnittspråk) berører bare `uiLocale` og `L()`-katalogen og blokkeres ikke av DV.

## 6. Risiko og åpne spørsmål
- Backfill av eksisterende `audio_clips` er den største risikoen; testes mot kopi av lokal DB og kjøres av Claude.
- `apply_changes`, `delete_project`, `purge_*` må utvides i 0060/0063/0064 fra siste definisjon (0058/0056); oppgis per migrasjon.
- Ytelse ved mange stablede bølgeformer: lat lasting.
- Åpent: skal «Generer all tale» kunne krysse prosjekter (§41), eller holder valgt aktivt prosjekt i første versjon? Anbefaling: bare aktivt prosjekt.
- Åpent: rettigheter for å slette gule lapper — anbefaling: oppretter og eier/redaktør.
- KI-167, KI-209, KI-243 står fortsatt som kjente rester.
