# ML3 – N manusspråk per prosjekt (B-049, PLAN_B049_MULTILANG.md §3–4)

Dato: 20.10.2026. Migrasjon: `db/migrations/0066_script_languages.sql` (ikke kjørt i Cloud; Claude kjører den).

## 1. Kartlegging (Cloud, lest 20.10.2026, skjemaversjon 65)

Bare lesing. Ingenting er slått sammen, endret eller slettet.

| Kolonne | Lagrede verdier (rader) |
|---|---|
| `translations.language` | ingen rader |
| `translation_lines.language` | ingen rader |
| `translation_line_links.language` | ingen rader |
| `audio_clips.language` | `null` (15, 3 prosjekter) |
| `audio_clips.speech_language` | `null` (15) |
| `takes.audio_language` | ingen rader |
| `composition_layers.language_images[].language` | ingen verdier |
| `projects.script_language` | `null` (5, hvorav 1 slettet prosjekt) |
| `scene_variants.script_language` | `null` (291) |
| `script_blocks.script_language` / `speech_language` | `null` (6 579) |
| `posters.language` | `nb` (3, hvorav 1 fjernet) |

**Kollisjoner (casing/alias):** ingen i Cloud. Ingen `en-us`/`en-US`-par, ingen `no` mot `nb`.
Kjernen har `languageTagCollisions()`, og dialogen «Språkversjoner» viser slike par hvis de dukker opp
(også fra eldre sikkerhetskopier). De slås aldri sammen automatisk.

**Gjeldende begrensninger før 0066:**

| Constraint | Definisjon |
|---|---|
| `translations_language_check` (0016) | `language ~ '^[a-z]{2}(-[A-Z]{2})?$' and language not in ('nb','no')` |
| `audio_clips_language_check` (0017) | `null`, `'*'` eller `^[a-z]{2}(-[A-Z]{2})?$` |
| `takes_audio_language_check` (0017) | `null`, `'none'` eller `^[a-z]{2}(-[A-Z]{2})?$` |
| `translation_lines_language_check` (0064) | lengde 2–100, ikke `nb`/`no` |
| `translation_line_links_language_check` (0064) | lengde 2–100, ikke `nb`/`no` |
| `*_script_language_check`, `*_speech_language_check` (0061) | `null` eller lengde 2–100 |
| `script_blocks_language_check` | `language = 'nb'` (norsk kilde) |
| `posters_language_check` | `nb` eller `en` |
| Unik indeks `translations_one_live` (0016) | én levende oversettelse per (linje/scenehode, språk) |

Det gamle mønsteret avviste blant annet `sr-Latn`, `zh-Hant-TW` og `es-419`.

## 2. Migrasjon 0066 (bare additiv)

1. **Utvidede språkbegrensninger** (0016, 0017): `translations_language_check`, `audio_clips_language_check`
   og `takes_audio_language_check` byttes til BCP-47 i kanonisk skrivemåte:
   `^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$`.
   Det gamle mønsteret er en delmengde, så alle historisk gyldige verdier er fortsatt gyldige. Særverdiene
   `*` og `null` i lyd og `none` og `null` i opptak har samme betydning som før. `nb`/`no` er fortsatt ikke
   et oversettelsesspråk.
2. **Ny tabell `language_versions`**: `id`, `project_id`, `language`, `source_language` (alltid `nb`), `name`,
   `status` (`active`/`archived`), `removed`, `revision`, `created_at`, `created_by`. Grenser på tekst.
   Unik indeks på `(project_id, lower(language)) where not removed`: `en-us` og `en-US` kan ikke bli to
   levende versjoner. Eksplisitte GRANT (`select` for `authenticated`, alt for `service_role`, ingenting for
   `anon`), RLS med lesepolicy for medlemmer, ingen direkte klientskriving.
3. **Ny nullable kolonne `language_version_id`** på `translations`, `translation_lines` og
   `translation_line_links` (fremmednøkkel med `on delete restrict`). De gamle `language`-kolonnene beholdes.
   Eldre rader uten versjon avledes fra prosjekt + språk. Ingen backfill i Cloud.
4. **`apply_changes`**: `language_versions` er lagt til i `v_tables` (før `translations`) og i
   slette­rekkefølgen (etter `translations`). Ny kontroll for rader som skrives i samme kall og har
   versjon-ID: versjonen må høre til prosjektet og ha samme målspråk, og en linjekobling kan bare peke på
   linjer med samme versjon. Eldre rader uten versjon blokkeres aldri.
5. **`delete_project` og `purge_project_assets`**: sletter `language_versions` etter oversettelsene.
6. `schema_version` 66; `EXPECTED_SCHEMA_VERSION` = 66; `VISUAL_SCHEMA_VERSION` = 66.

### Erstattede funksjoner

| Funksjon | Grunnlag | Endring |
|---|---|---|
| `apply_changes` | 0065 ordrett | + `language_versions` i tabell- og sletteliste, + versjonskontroll |
| `delete_project` | 0065 ordrett | + `delete from public.language_versions` etter oversettelsene |
| `purge_project_assets` | 0065 ordrett | + `delete from public.language_versions` etter oversettelsene |
| `purge_removed_assets` | uendret (0065) | rører verken oversettelser eller språkversjoner |

**Cloud-hasher:** Grunnlaget er de siste definisjonene i `0065_style_harmonization.sql`. Cloud har skjemaversjon 65.
Jeg fikk ikke fram de oppgitte hashene (96f082d2…, 7a1b5bac…, ec8e0b64…, 97580c29…) med md5 eller sha256
av `pg_get_functiondef`, `prosrc` eller teksten i 0065. Metoden er trolig en annen. Claude bør derfor
sammenligne med sin egen metode før kjøring. Mine verdier fra Cloud, sha256 av `pg_get_functiondef`:
`apply_changes` 1e40155b…, `delete_project` 84d8ecd4…, `purge_project_assets` a51d501f…, `purge_removed_assets` 7818b18e….

## 3. Regler i kjernen

- `src/core/translation/language-tags.ts`: `isScriptLanguageTag`, `canonicalLanguageTag`, `isNorwegianSourceTag`.
  De gamle mønstrene i kommandoene og lagene er utvidet til samme BCP-47-mønster.
- `src/core/translation/language-versions.ts`: register, avledede (eldre) språk, kollisjoner, status per språk,
  `reviewLanguagesForBlock` og `exportLanguageDecision`.
- Kommandoer med invers: `AddLanguageVersion` ↔ `UndoAddLanguageVersion` (sperret når rader bruker versjonen),
  `UpdateLanguageVersion` (navn/status), `SetLanguageVersionRemoved`. Fjerning sletter ingen oversettelser.
- Nye oversettelser, importerte linjer og linjekoblinger får versjonen til målspråket. En kobling følger
  versjonen til målradene, og blandede versjoner avvises.
- En ny revisjon av norsk kilde gir «må gjennomgås» i alle berørte språk (vises i oversettelsespanelet).
  Ingenting overskrives.
- B-048 (`translation-align`) og B-050 (`line-align`) godtar bare kanonisk BCP-47 og aldri norsk.
  Målspråket er en eksplisitt parameter, og det samme er scenen (B-050: `variantId`, B-048: kandidatscenene).
- Innlasting (`project-rows.ts`), lagring (`patch.ts`) og sikkerhetskopien (`BACKUP_STATE_TABLES`) har med
  `language_versions`. ID-ene kobles om ved gjenoppretting.

## 4. Brukerflaten (alle nye tekster via `t()` på nb og en)

- «Språkversjoner …» i manuset: legg til (koden kanoniseres), gi nytt navn, fjern og gjenopprett.
  Eldre språk kan registreres, og kollisjoner vises.
- Valg av språkversjon i manuset, manusutforskeren (bare lesing), linjekoblingene og eksporten.
- Eksport av ufullstendig oversettelse er sperret til brukeren velger «Bruk norsk der oversettelsen
  mangler» eller «Stopp eksporten». Ved stopp lages ingen fil.
- Feilsiden (rotens error boundary) leser lagret språkvalg synkront, ellers nettleserspråket
  (`bootUiLanguage`). Den følger da valgt språk også når en side krasjer før språket er satt.

## 5. Tester

| Test | Resultat |
|---|---|
| Full vitest | 1 963 bestått, 10 hoppet over, 1 feilet under full last: `verifisering4-ai-server` fikk tidsavbrudd, og alene ble den 8/8 |
| Nye enhetstester `tests/unit/ml3-language-versions.test.ts` | 15/15 |
| DB (lokal Postgres 16, port 54329) | 142/142 (2 nye ML3-tester: grants/RLS, begrensninger, sletterekkefølge; tre målspråk, revisjoner, idempotens, angre/gjør om, kollisjoner, sceneisolasjon, 1:n/n:1, historiske rader, delete/purge) |
| Ny visuell suite `ml3-script-languages.mjs` | nb+en 38/38; `UI_LANG=en` 19/19 |
| p5-line-linking | nb 24/24; `UI_LANG=en` 24/24 |
| dv6-languages | nb 16/16; `UI_LANG=en` 16/16 |
| t2-writing-ui | nb 69/69; `UI_LANG=en` 69/69 |
| u5-screens | nb 65/65; `UI_LANG=en` 65/65 |
| storylab-ui | nb 32/32; `UI_LANG=en` 32/32 |
| ml2-languages | nb 318/318; `UI_LANG=en` 316/318 (se avvik) |
| i18n-sjekken | 0 tekster uten engelsk; 9 964 tekstpar bevart |

## 6. Avvik og merknader

- **ml2-languages med `UI_LANG=en`:** to kontroller feiler: «pseudotekst i dialogen» for film- og
  alfaeksport på en-XA. `UI_LANG=en` tvinger alle scenarioene til engelsk, også en-XA-scenarioene, så
  kontrollen kan ikke slå til. Dette følger av hvordan testen er laget, og er ikke en feil i appen.
  Uten `UI_LANG` er alt grønt.
- **p5 og dv6:** to knappenavn var hardkodet etter scenarioets språk. De bruker nå `byLang`, så suitene kan
  kjøres med `UI_LANG=en`. Forventningene er ikke endret.
- **i18n-inventaret:** én ML1-nøkkel (tittel på språkvelgeren i manuset) falt ut da velgeren ble byttet.
  Nøkkelen er satt tilbake ordrett og er i bruk igjen.
- **DB-test 0063:** sjekken av skjemaversjonen er endret fra «= 65» til «≥ 65», som i tidligere omganger.
- **Feilsiden:** uten lagret valg følger den nettleserspråket, mens resten av appen fortsatt starter på norsk.
  Dette er bestilt slik.
- **Hasher:** se avsnitt 2. Claude bør kontrollere dem før kjøring.
- Midlertidig: lokal Postgres (stoppet etterpå) og en lenke til Playwright i `node_modules` (fjernet).
  Ingen pakker installert.
