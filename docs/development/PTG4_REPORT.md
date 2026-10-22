# PTG4 – leppesynk og munnliste

Dato: 22.10.2026. Arbeidsregler: animatic-arkitektur-og-data og animatic-testing.

## Levert
- Munnsett per karakter: Rhubarb A–H/X og Preston Blair. Søkbar, tastaturstyrt variantkobling etter SceneSelect-mønsteret.
- Tekststyrt, lokalt utkast fra kjente ordtider: 216 originale NB Uttale-ordformer (NoFaBet, CC0) og 138 CMUdict-ord (ARPAbet, BSD), med deterministisk grafemreserve. Se PTG4_PRONUNCIATION.md. Ingen AI, lydopplasting eller betalte kall.
- Munnrader i den sammenslåtte Scene-tidslinjen: utkast må godkjennes; bytt form, flytt grenser med bildeinputs, del og slå sammen. Alle lagrede endringer bruker reversible prosjektkommandoer.
- Beregnet utdatert-status fra tekst, blokkrevisjon, lydversjon/redigering/ordtider/plassering og valgt munnsystem. Ingen automatisk regenerering. Utdaterte spor beholdes i eksport og merkes i JSON; dette forklares i LESMEG.
- Munnliste per karakter/form med variantnavn, antall eksponeringer og skudd: CSV og A4 PDF med PTG2s innebygde Noto-fonter.
- Egen ZIP-eksport under «Til produksjonen» og DAT/JSON i Dragonframe-pakken. X-sheet-munnkolonne og referansefilm-påskrift bruker samme cue-modell. Moho bruker Papagayo, én-basert bildeindeks; JSON null-basert. PTG-navn, håndtak og eksponeringsrutenett gjenbrukes.
- Nye tekster er skrevet med t() på nb/en og alle åtte øvrige registrerte språk. Disse åtte oversettelsene er maskinoversatte og merket for gjennomlesing. EN-XA genereres.

## Migrasjon 0084
`db/migrations/0084_mouth_sets_tracks.sql` er additiv oppå 0083, prøvd i lokal testdatabase, **ikke kjørt i Cloud**. Claude kjører den etter gjennomgang. Forventet skjemaversjon er 84.

Nye prosjekttabeller: `mouth_sets`, `mouth_tracks`, med størrelsesgrenser, revisjoner, removed, FK/restrict, eksplisitte rettigheter og medlemsbasert SELECT-RLS. Klienten har ikke direkte skriverett. apply_changes kontrollerer prosjekt- og ressurskoblingene etter transaksjonens endringer. UndoMouthChange er invers-only og må være identisk med lagret egen invers i serverinngangen.

Alle erstattede funksjoner:
1. `public.apply_changes` – siste definisjon fra 0081, nye tabeller/kolonner og scopesjekker; barn før foreldre ved sletting.
2. `public.delete_project` – siste definisjon fra 0080, spor før sett før refererte rader.
3. `public.purge_project_assets` – siste definisjon fra 0079, munnrader med ved prosjektrydding.
4. `public.purge_removed_assets` – siste definisjon fra 0079, hindrer hard sletting av karakter brukt i munnsett.

Lasting, patch, inverser, skjemakontroll og sikkerhetskopi tar med begge tabeller. Ingen nye filsti-kolonner eller npm-pakker.

## Verifisering
- Automatisk TypeScript-/forhåndsvisningskontroll: siste signal **build OK**, ingen rapporterte typefeil. Manuell tsc/build er ikke kjørt, i tråd med miljøreglene.
- Full `bunx vitest run --maxWorkers=3`: **2361 bestått, 0 feilet, 10 eksisterende hoppet over**, 290 grønne testfiler. Ny `tests/unit/ptg4-lipsync.test.ts`: 15 tester, inkludert 24/25 fps/toere, oppslag, fonemtabell, grenser, kommando/invers/redo, drift, Moho og X-sheet.
- Endelig lokal DB-suite: **159 bestått, 0 feilet**, inkludert eksplisitt purge-vern for karakter brukt i munnsett.
- i18n inventory/check: **0 tekster uten engelsk**. Releasekontroll og alle-språk-dekning kontrolleres av full Vitest.
- `ptg4-lipsync.mjs`: **nb 15/15, en 15/15**, ingen kjørefeil. Brukerflyt: sett → utkast → godkjenning → del/sammenslå/grense → lagringsmock → monteringen → faktisk ZIP/PDF/CSV/DAT/JSON. Noto-font og tospråklig kilde/lisensinfo kontrollert.
- Sekvensielle regresjoner: `ptg2-dragonframe` **nb/en 21/21**, `ptg5-roundtrip` **nb/en 18/18**, `ptg6-editorial` **nb/en 23/23**. PTG2 kjørt igjen etter at full BSD-lisens ble lagt i pakken.
- Bilder av faktisk munnrad og nedlastet eksport er kontrollert. Nettlesertestene bruker faste server-/lagringsmocker, aldri betalte tjenester.

## Avvik og begrensninger
- Uttaleutvalgene er kompakte JSON-filer (vanlig leveransekomprimering), ikke binære komprimerte filer. Dette holder kjernen portabel og uten nye dekoderpakker.
- Grenseflytting skjer med bildeinputs, ikke direkte drag i sporet.
- Munnlisten lastes ned som PDF/CSV i ZIP; utskrift skjer fra PDF-leseren.
- Ingen ekte Cloud-rundtur er verifisert før Claude kjører 0084. Testene bekrefter lokal transaksjon/RLS og mockede brukerflyter, ikke produksjonslagring.
- Rhubarb-finjustering fra lyd og ekte Moho/Dragonframe-import er utsatt i TODO.md, som bestilt.

## Endrede filer
- `db/migrations/0084_mouth_sets_tracks.sql`: tabeller, rettigheter og de fire funksjonene over.
- `src/core/interchange/mouth-types.ts`, `mouth-commands.ts`, `mouth-draft.ts`, `mouth-export.ts`: modell, reversible kommandoer, uttale/timing og eksport.
- `src/core/interchange/nb-uttale.json`, `cmudict.json`, `CMUDICT-LICENSE.txt`: originalkildeutvalg og komplett BSD-lisens.
- `src/core/interchange/dragonframe.ts`: munnkolonne.
- `src/core/model.ts`, `src/core/commands/types.ts`, `src/core/commands/apply.ts`, `src/core/patch.ts`, `src/core/backup/index.ts`: modellintegrasjon, patch, invers og backup.
- `src/adapters/storage/project-rows.ts`, `commands.functions.ts`: lasting/skjemaversjon og invers-/skjemaport.
- `src/app/scene-editor/animation/TextMouthTrack.tsx`, `src/app/scene-editor/SceneEditorWorkspace.tsx`: munnsett og redigerbare tidslinjerader.
- `src/app/assembly/ShotlistExport.tsx`, `src/engine/export/mouth-list.ts`, `src/engine/export/dragonframe.ts`: eksportknapp, PDF/CSV/ZIP, DAT/JSON/påskrift og lisens.
- `src/core/i18n/authored.json`; `src/core/i18n/locales/{fr,es,ru,ja,pt-BR,de,it,ko}.json`: PTG4-tekster på alle språk.
- Genererte språkfiler: inventory/references under `scripts/i18n/`, katalog/runtime og nb/en/en-XA samt generert split-register under `src/core/i18n/`.
- `tests/unit/ptg4-lipsync.test.ts`, `tests/visual/ptg4-lipsync.mjs`, `tests/visual/schema-version.mjs`, `tests/db/run-db-tests.ts`: tester og skjemafixtur.
- `AGENTS.md`, `TODO.md`, `roadmap.md`, `docs/development/PTG4_PRONUNCIATION.md`, `docs/development/PTG4_REPORT.md`: regel, utsatt arbeid og rapport.

## Åpne spørsmål
Ingen produktavklaringer. Claude må kjøre 0084; Trollfilm må kontrollere ekte programimport. Ingen publisering er utført.