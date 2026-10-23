# G-4 SKRIFTSYSTEMER – rapport (delvis leveranse)

Status: **pågående**. Dette er en ærlig mellomrapport; flere punkter gjenstår.

## Migrasjon 0096 (ikke kjørt i Cloud)

Oppretter: schema `extensions`, utvidelsene `unaccent` og `pg_trgm`, funksjonen `private.fold_text(text)`
(IMMUTABLE, SECURITY DEFINER, search_path=''), seks GIN-trigramindekser
(`script_blocks_fold_trgm_idx`, `assets_name_fold_trgm_idx`, `script_annotations_fold_trgm_idx`,
`note_flags_fold_trgm_idx`, `global_assets_name_fold_trgm_idx`, `profiles_display_name_fold_trgm_idx`),
RPC-en `public.search_script_blocks(project, query, limit)` (SECURITY DEFINER med eksplisitt
medlemskapssjekk via `private.my_project_ids()`), og skriver om `public.admin_find_users` fra ilike
til foldet søk. Setter schema_version 96; `EXPECTED_SCHEMA_VERSION` er 96.

**Valg og begrunnelser:**
- `fold_text` er SECURITY DEFINER fordi indeksuttrykk evalueres med innsetterens rettigheter, og
  `authenticated` ikke har USAGE på schema `extensions`/`private`. Uten dette feilet enhver innsetting
  i indekserte tabeller («permission denied for schema extensions») – gjenskapt og verifisert med
  isolert test før rettingen; hele DB-serien (194/0) er grønn etterpå.
- `search_script_blocks` er SECURITY DEFINER av samme grunn; medlemskap sjekkes eksplisitt, og
  DB-testen viser at ikke-medlem får 0 treff.
- `auth.users.email` kan ikke indekseres (administrert skjema); `admin_find_users` folder i stedet
  e-post og `profiles.display_name` (som har indeks).
- Postgres har ikke NFKC i `lower`/`unaccent`; klientens `foldSearch` (src/core/search-fold.ts) gjør
  NFKC + NFD + fjerning av diakritiske tegn. DB-folden er en bevisst enklere motpart, dokumentert her.

## Måling (50 000 blokker, lokal Postgres 17)

| Søk | Før | Etter |
|---|---|---|
| Bredt treff («café», 20 000 rader) | 53 ms ilike | 51 ms foldet |
| Sjelden treff («piñón número 7») | 43 ms ilike | **3 ms** foldet |
| CJK («字幕») | – | 117 ms foldet |
| RPC `search_script_blocks` | – | 232 ms |

Planen bruker trigramindeksen (EXPLAIN verifisert). Treffmengdene er like før/etter.
Skript: `tests/db/g4-search-bench.ts` (ikke CI).

## NFC (punkt 3) – ferdig

- `src/core/nfc.ts`: `nfc`/`nfcDeep`. `use-commands.ts` normaliserer kommandoer før patching.
- Import: `parseFountainInner` og `parseScreenplayLines` normaliserer til NFC ved inngangen.
- Server-side NFC ble bevisst utelatt: apply_changes sammenligner kanonisk JSON for INVERSE_ONLY,
  og omskriving på serveren kunne gitt avvik mellom klient og lagret invers. Begrunnet her.
- Tester: `tests/unit/nfc.test.ts` (8/8). Eksisterende data omskrives ikke.

## Klientsøk (del av punkt 2) – ferdig

- `src/core/search-fold.ts` (`foldSearch`, `foldMatch`) brukes i bibliotekfilteret
  (`core/library/global.ts`), scenefilteret (`core/screenplay/filter.ts`) og utheving i
  manusutforskeren. `analysis-hash.ts` er urørt (ville ellers ugyldiggjort lagrede hasher).
- Tester: `tests/unit/search-fold.test.ts` (9/9).

## RTL (punkt 1) – delvis

- `src/core/rtl.ts`: `dirOf`/`isRtlText` etter UAX #9 P2 (første sterke tegn). Tester i
  `tests/unit/rtl.test.ts` (4/4), inkludert arabisk/hebraisk blandet med latinsk tekst og tall.
- `dir="auto"` på delte `Input` og `Textarea` (dekker notater, kommentarer, søk og skjemaer).
- Manusvisningen (ScriptPageView): RTL-linjer forankres i høyre kant av den speilvendte kolonnen
  (marg/innrykk speiles). Blandet tekst og tall håndteres av nettleserens bidi-motor.
- Manus-PDF (Unicode-veien): RTL-linjer speiles om midtlinjen; shaping og bidi gjøres av jsPDFs
  innebygde motor via drawRuns. Courier-veien (WinAnsi) er uendret og dekker ikke arabisk.
- Tekstlag (compositor): linjer med RTL-tegn tegnes i én fillText med `ctx.direction='rtl'` slik
  at arabisk sammenbinding og bidi-rekkefølge blir riktig. Bokstavanimasjon på slike linjer tegner
  hele linjen samlet (bevisst trade-off).

**Gjenstår i punkt 1:** dir="auto" på alle visningsflater (karakterkort, undertekster,
SceneScriptPanel m.fl.), logiske CSS-egenskaper i berørte paneler, RTL i AE/PTG/plakat-eksport
(tekstlag der går andre veier), og full UI-speiling (lagt til rette for, ikke bygget).

## Gjenstår ellers

- Arkitekturtest mot `split(/\s+/)` for ordtelling (punkt 5 i G-3 del 2, fortsatt åpen).
- Full Vitest-kjøring, i18n-sjekk (stoppet tidligere med «Stale ML1 inventory/catalog») og
  DB-test mot Cloud er ikke kjørt i denne omgangen. DB-testene kjørt lokalt: 194/0.
- G-3 del 2 punktene 2–6 (valuta, innstillingsflater, papirvalg, e-postspråk) er fortsatt åpne.
- 0096 må gjennomgås og kjøres av Claude før den låses.
