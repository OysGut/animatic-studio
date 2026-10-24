# SB-6 – Utskrift, pitch og skuddliste

## Levert
- Tre kort i eksisterende `ExportAnimaticDialog`: utskrift, pitch og skuddliste. Eksisterende bildekildevalg og `exportImageSource` gjenbrukes; ingen nye eksportvinduer.
- Ren sidegeometri i `core/storyboard/print.ts`: 3/6/9 paneler, stående/liggende, A4/A3/Letter/Legal/Tabloid. Landbasert A4/Letter-standard kommer fra `resolveSettings`.
- Valgbare felt: panel, scene, skudd, sekunder, dialog, handling, kamera, bevegelse, lyd, notater og fem fagstatuser. Prosjekt, versjon, dato og sidetall er med. Lange tekster bevares på fortsettelsessider.
- Pitch-PDF har ett stort panel med dialog og handling under.
- CSV har UTF-8 BOM, escaping og beskyttelse mot formelinjeksjon. XLSX har numeriske sekunder/bilder og tekst for panelnummer/tidskode, Unicode, fast overskriftsrad og tekstbryting.
- Delt compositor rasteriserer sketch/note/arrow/camera_mark. Hver type kan slås av. Utskrift bevarer synlige kameramerker som filmadapteren ellers skjuler; de blir ikke et destruktivt utsnitt. Panelenes bildeproporsjoner bevares.
- Noto innebygges etter skriftsystem. Japansk, arabisk, hebraisk, hindi og thai er prøvd som faktiske PDF-er. RTL-løp tegnes fra høyre. Hindi/thai bruker nettleserens shaping og rasterisert tekst med innebygde Noto-fonter; disse tekstlinjene er derfor ikke søkbar PDF-tekst.
- PDF/CSV/XLSX bygges bitvis med fremdrift og avbryt. Ingen prosjektdata skrives, ingen migrasjon og ingen betalte kall.

## Verifisering
- Full `bunx vitest run`: **2987 bestått, 0 feilet, 10 eksisterende hoppet over**, 373 testfiler bestått, 2 eksisterende hoppet over. Siste fullkjøring: 184,95 sekunder.
- Ny `tests/unit/sb6-print.test.ts`: **37 bestått**. Alle fem papirformater × 3/6/9 × begge retninger, pitch, felter, CSV BOM/escaping, XLSX typer/Unicode, 500 rader og avbryt.
- Ny `tests/visual/sb6-print.mjs`: **40 bestått, 0 feilet** på nb/en. Virkelige nedlastinger, fire rasterlag og separate av/på-valg, innebygde fonter og synlig PDF-tekst, 500-panel-PDF som avbrytes ved panel 20 mens nettleseren fortsatt behandler input, samt desktop/mobil uten vannrett overflyt. Ingen kjørefeil. Server, tilgang og media er mockede.
- Automatisk forhåndsvisningskontroll: siste signal `build OK`. Manuell `tsc --noEmit` ble ikke kjørt fordi miljøinstruksen forbyr manuelle typekontroller; separat tsc-resultat rapporteres ikke som bestått.
- Alle registrerte språk: **0 manglende/utdaterte oversettelser**. i18n-kontroll og releasekontroll bestått; inventaret regenerert etter siste kildeendring. Nye fr/es/ru/ja/pt-BR/de/it/ko-tekster er maskinoversatt og merket for gjennomlesing.
- `check_kb`: **OK**, med eksisterende PyYAML under `/tmp/sb7-python`; ingen pakke lagt til prosjektet.

## Åpent / avvik
- **DB-suiten er ikke kjørt i denne fasen.** Den tilgjengelige lokale Postgres-instansen inneholder ingen applikasjonstabeller, og dagens DB-runner oppretter en database og kjører alle migrasjonene. Lovable har en uttrykkelig instruks om aldri å kjøre migrasjoner. Claude må kjøre `tests/db/run-db-tests.ts`; tidligere 230/0 er ikke gjenbrukt som SB-6-resultat. Ingen DB-kode er endret av SB-6.
- Ingen fysisk utskriftskontroll, fysisk iPad eller ekte Cloud-prosjektflyt er verifisert. Nettleserprøven bruker deterministisk fixture, ikke brukerens private manus.
- Full 500-panel-PDF uten avbryt og ytelse på svak maskinvare er ikke målt; faktisk PDF-avbryt og responsivitet er testet.
- Ingen publisering er utført. Leveransen er ikke merket helt ferdig før Claudes separate tsc-/DB-kontroller foreligger.

## Endrede filer
- `src/core/storyboard/print.ts`: sidegeometri, metadata, tidskode, tabell og CSV-policy.
- `src/engine/export/storyboard-print.ts`: felles bildekilde, rasterisering, Noto/RTL/shaping, PDF, CSV/XLSX og avbryt.
- `src/app/assembly/StoryboardPrintExport.tsx`: felter, papirstandard, lagvalg, tre kort og fremdrift.
- `src/app/assembly/ExportAnimaticDialog.tsx`: monterer kortene med gjeldende sceneutvalg/bildekilde.
- `tests/unit/sb6-print.test.ts`, `tests/visual/sb6-print.mjs`: nye automatiske tester.
- `src/core/i18n/authored.json`, `src/core/i18n/locales/{nb,en,fr,es,ru,ja,pt-BR,de,it,ko}.json`, `src/core/i18n/runtime.gen.json`: alle språk og generert katalog.
- `scripts/i18n/{mapping.v1,references.v1,candidates.v1}.json`, `scripts/i18n/inventory-report.json`: regenerert inventar.
- `AGENTS.md`: eksisterende utskriftsregel utvidet til storyboard; regler utenfor managed-blokken fortsatt innenfor bytegrensen.
- `roadmap.md`, `docs/development/SB6_REPORT.md`: faktisk status og denne rapporten.

## Arbeidsmetode
Animatic-testing styrte testdekning og skillet mellom grønne kjørte tester og åpne kontroller.