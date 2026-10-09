# ADR-0010 – Manusarbeidsflaten: import, sidebryting, redigering og eksport
- **Status:** Gjeldende · **Dato:** 2026-10-09 · **Beslutninger:** DEC-0023, DEC-0024, DEC-0025, DEC-0026 · **Type:** Teknisk anbefaling
- **Berørte krav:** REQ-0044–REQ-0070, REQ-0080–REQ-0091 · **Moduler:** SCRIPT, EXPORT, CORE, UI

## Kontekst
M2 skal gjøre «Jula på Dovre» brukbart i appen: importere PDF/DOCX, vise manuset som et manus, rette tolkninger, flytte/deaktivere/redigere scener med angre, og eksportere med valgt nummerering.

## Beslutning
```
Fil (PDF/DOCX) ──nettleser──▶ RawLine[] ──parseScreenplayLines──▶ ParsedScreenplay ──planImport──▶ ImportScreenplay
                                                                          │ forhåndsvisning
Original ──Storage «sources»──▶ register_imported_document          runCommand → apply_changes (atomisk)

ProjectState ──scriptView──▶ scriptPaginationInput (låste sider) ──paginate──▶ Page[] ──▶ ScriptPageView / screenplayPdf
ProjectState ──exportNumbering──▶ exportPaginationInput ──▶ screenplayPdf (sider) / screenplayDocx (flyt)
```
- **Kjernen** (`src/core/screenplay`): `parse.ts`, `plan.ts`, `paginate.ts`, `script-pages.ts`, `numbering.ts` – rene funksjoner uten React/Supabase.
- **Motorer** (`src/engine`): `import/pdf-lines.ts`, `import/docx-lines.ts`, `import/browser.ts`; `export/screenplay-pdf.ts` (Courier, WinAnsi, uten avhengigheter), `export/screenplay-docx.ts` (fflate).
- **UI** (`src/app/script`): `ScriptWorkspace` (verktøylinje, tre kolonner), `SceneNavigator` (dra-og-slipp, Alt+pil, aktiv-bryter), `ScriptPageView` (sider i em-enheter, usikkerhetsmarkører i margen), `Inspector` (elementtype, tekst, overskrift, del/slå sammen, fjern/hent tilbake, egen variant), `ImportDialog`, `ExportDialog`. Kommandoer går via `useCommands` (lokal kjøring, kø, revisjoner, angre/gjør om, tastatur).
- **Database** (migrasjon 0002): `script_blocks.source_ref/uncertainty/removed`, `scene_variants.uncertainty`, `imported_documents`, bøtte `sources`, `profiles` + `upsert_my_profile`.

## Konsekvenser
+ Alt som avgjør sider og numre er testbart uten nettleser, og eksportert PDF leses inn igjen identisk (rundtur-test).
+ Låste sider gir samme sidetall som originalen for importert tekst.
− DOCX-eksport lar Word bryte sidene (ingen automatisk (MORE)/(CONT'D) i Word).
− Hele prosjektet lastes per kommando på serveren (KI-12).

## Verifisering
`tests/golden/reference-screenplay.test.ts`, `tests/unit/{paginate,numbering,export,import-split-merge,screenplay-parse}.test.ts`, `tests/invariants/random-sequences.test.ts`, `tests/db/run-db-tests.ts`, skjermbilder `tests/visual/screens.mjs` (06–13).
