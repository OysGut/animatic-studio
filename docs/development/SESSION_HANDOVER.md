# Handover – Animatic Studio

**Sist oppdatert:** 2026-10-09 (økt 5, Claude i Cowork). Arbeidsstatus – mandatet og beslutningsloggen er fortsatt autoritative.

## Slik starter du en ny økt
1. Les `CLAUDE.md`, denne fila og `CURRENT_WORK.md`.
2. Repoet: Mars' Mac `Claude/Projects/Animatic Studio/animatic-studio` (GitHub `OysGut/animatic-studio`, gren `main`, Lovable-prosjekt `27853fcb-6a27-4342-b359-72ab82e87cfa`, Lovable Cloud-prosjekt `dlvtgeqyagekfkvklmqm`). Manus: `Claude/Projects/Animatic Studio/Manus/` (utenfor repoet).
3. Arbeidsflyt i Cowork: repoet pakkes på Mac-en (`tar`), hentes til skymiljøet, bygges og testes der, og pakkes tilbake via `.overforing/` (slettes etterpå). Mars gjør Commit + Push i GitHub Desktop med `docs/development/NEXT_COMMIT_MESSAGE.txt`. `src/integrations/` (Lovable-generert) sendes aldri tilbake.
4. Lokalt testmiljø i skyen: `bun install`, Postgres 16 (port 54329), Playwright-Chromium i `/opt/pw-browsers` (Playwright-pakken ligger i `/tmp/claude-0/pw`). Referansemanus kopieres til `/tmp/claude-0/ref_no.pdf` og `ref_en.docx` for gyldne tester – aldri inn i repoet.
5. Kontroller: `bun run test`, `bun tests/db/run-db-tests.ts`, `npx tsc --noEmit`, `python3 scripts/kb/check_kb.py`. Dev-server: `bunx vite dev --host 127.0.0.1`.

## Hva er gjort
- **Økt 5:** 0005 kjørt med avvik i Lovable (`byte_size_big`) → rettet med 0006 (kjørt). `LOVABLE_SYNC.md` inneholder nå bare meldingen Mars limer inn (DEC-0033; veiledningen i `LOVABLE_GUIDE.md`). Bedre forslag fra manuset uten AI (DEC-0034, `src/core/library/suggest.ts`). Sceneeditor del 1 (DEC-0035): `src/core/composition/*`, `src/engine/compositor/canvas.ts`, `src/app/scene-editor/*`, rute `/prosjekt/$projectId/scene`, migrasjon `0007_compositions.sql` (**ikke kjørt ennå**). Test av arbeidsdeling: Sonnet-underagenter skrev brukerflate, tester, skjermbilder og kravregister etter presise beskrivelser; Opus skrev kjerne, migrasjon og kontrollerte (se `DELEGATION_TEST_2026-10-09.md`). Tester: 193 Vitest, 24 databasetester, skjermbilder 28–32. Deretter M3 del 2b (DEC-0036): tidslinje (`Timeline.tsx`), nøkkelbilder (`src/core/composition/animate.ts`), kamera med blå/rød ramme og Bézier-baner (`camera-overlay.ts`, `CameraPanel.tsx`), kameravisning og avspilling (`use-playback.ts`). Ingen ny migrasjon (0007 kjørt). Tester: 224 Vitest, 24 databasetester, skjermbilder 28–36. Deretter DEC-0037 («I denne scenen»: `SceneAssetsPanel.tsx`, dra ressurser inn på lerretet, klikk åpner biblioteket med `?asset=`), DEC-0038 (justerbare paneler: `src/app/shell/pane-size.tsx`) og DEC-0039 (format og bildefrekvens for hele prosjektet: `src/core/composition/format.ts`, `SetProjectFormat`, `ProjectFormat.tsx`, migrasjon `0008_project_format.sql`, kjørt). Deretter DEC-0040: sammenleggbar meny (`ProjectNav.tsx`), scenevelger (`ScenePicker.tsx`) og forhåndsvisning av ferdig utsnitt (`PreviewWindow.tsx`). **Neste:** M4 (filmtidslinje, lyd, eksport av animatic) – eller Mars' tilbakemeldinger etter testing i Lovable.
- **Økt 1 (M0):** kunnskapsbase, kravregister, beslutninger, arkitektur, skills.
- **Økt 2 (M1):** kjerne, migrasjon 0001 (kjørt i Lovable), `runCommand`, innlogging/prosjekter. Feil KI-18 funnet av Mars og rettet.
- **Økt 3 (M2 del 1):** import, sider, redigering, angre, eksport. DEC-0023–0026, ADR-0010. Testet av Mars i Lovable; Safari-nedlasting rettet (KI-25). Migrasjon 0002 kjørt.
- **Økt 4:** «Endret av …» på notater og bilder opptil 2 GB (DEC-0032, migrasjon 0005 – ikke kjørt ennå). Mars' ønsker etter M2 (DEC-0029: redigeringsmodus for rekkefølge/synlighet, flyttede scener markert, sammenligning linje for linje), notater i manus med eksport/import som Word-kommentarer og PDF-merknader, søketreff, scenelisten følger manuset, valgt scene øverst (DEC-0031, REQ-0535–0543), og M3 del 1 ressursbibliotek (DEC-0030). Migrasjon `0004_library_notes.sql` (ikke kjørt ennå). Kodegjennomgang med 9 funn – rettet.
- **Økt 3 del 2 (M2 del 2):** manusversjoner (migrasjon 0003), sammenligning, historisk nummerering, søk/karakterfilter, «Vis kun valgt scene» (REQ-0531/DEC-0027, Mars' ønske), varighetsestimat, tilstedeværelse. DEC-0028. To uavhengige kodegjennomganger, alle funn rettet.

## Hva er testet
- 121 Vitest-tester (inkl. gyldne mot referansemanuset, egenskapsbaserte med bibliotek og notater, Word/PDF-rundtur med notater), 22 databasetester, 27 skjermbilder.
- Visuell QA kjøres med en kopi av `tests/visual/screens.mjs` i en mappe der `node_modules/playwright` peker på den globale Playwright-pakken (`npm root -g`), og fixture fra `bun tests/visual/make-fixture.ts`.
- **Ikke testet:** migrasjon 0002 i Lovable Cloud (bøtte og storage-policyer, KI-19), ekte opplasting og import gjennom serverfunksjonen (størrelse/tid, KI-23), sanntid mellom to ekte brukere, første kjøring av `tests.yml` på GitHub.

## Filer endret i økt 4
Nye: `src/core/library/index.ts`, `src/core/notes/{index,transfer}.ts`, `src/app/library/*`, `src/app/script/NotesPanel.tsx`, `src/routes/prosjekt.$projectId.bibliotek.tsx`, `db/migrations/0004_library_notes.sql`, `tests/unit/{library,notes}.test.ts`. Endret: `src/core/{model,ids,patch,invariants,index}.ts`, `src/core/commands/*`, `src/core/screenplay/{filter,versions}.ts`, `src/engine/export/*`, `src/engine/import/{pdf-lines,docx-lines,browser}.ts`, `src/adapters/storage/*`, `src/app/script/*`, `src/app/shell/ProjectNav.tsx`, `src/routes/prosjekt.$projectId.manus.tsx`, `src/routeTree.gen.ts`, `src/styles.css`, tester og dokumentasjon.

## Filer endret i økt 3
Nye: `src/core/screenplay/{paginate,script-pages,numbering}.ts`, `src/engine/import/browser.ts`, `src/engine/export/*`, `src/app/project/*`, `src/app/script/*`, `src/app/shell/ProjectNav.tsx`, `src/routes/prosjekt.$projectId.{index,manus}.tsx`, `db/migrations/0002_import_profiles.sql`, `tests/unit/{import-split-merge,paginate,numbering,export,review-regressions}.test.ts`, `.github/workflows/tests.yml`, ADR-0010. Endret: `src/core/**` (nye kommandoer, `removed`, invarianter), `parse.ts`, `docx-lines.ts`, `commands.functions.ts`, `project-rows.ts`, `ProjectOverview.tsx`, `prosjekt.$projectId.tsx` (nå layout med meny), `routeTree.gen.ts`, `package.json` (`test:db`), dokumentasjon og kravregister.

## Uavklarte risikoer
KI-12, KI-14, KI-15, KI-16, KI-17 (første CI-kjøring), KI-19 (Storage), KI-20 (tittelside), KI-21 (DOCX-sider), KI-22 (angre per fane), KI-23 (store kommandoer), KI-24 (spinoff-UI), KI-26 (tilstedeværelse i Lovable), KI-27 (gjenoppretting av versjon), KI-28, KI-29. Produktspørsmål Q-02–Q-10; Q-08 har midlertidig antakelse DEC-0026.

## Uavklarte risikoer (nye i økt 4)
KI-30 (foreldreløse bilder), KI-31 (notater fra fremmede PDF-er), KI-32 (melding ved angring), KI-33 (notater ved egen spinoff-variant), KI-34 (bruk bare fra navn), KI-35 (bøtten `assets` i Lovable).

## Neste konkrete steg
1. Mars: Commit + Push → synkmelding for `0004_library_notes.sql` (inkl. bøtten `assets`) → prøv bibliotek, notater, søk, eksport/import med notater.
2. Claude: rette det som dukker opp; deretter M3 del 2 (2D-sceneeditor) etter OK fra Mars.
