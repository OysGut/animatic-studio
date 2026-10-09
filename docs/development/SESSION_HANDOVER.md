# Handover – Animatic Studio

**Sist oppdatert:** 2026-10-09 (økt 3, Claude i Cowork, natt – Mars sov). Arbeidsstatus – mandatet og beslutningsloggen er fortsatt autoritative.

## Slik starter du en ny økt
1. Les `CLAUDE.md`, denne fila og `CURRENT_WORK.md`.
2. Repoet: Mars' Mac `Claude/Projects/Animatic Studio/animatic-studio` (GitHub `OysGut/animatic-studio`, gren `main`, Lovable-prosjekt `27853fcb-6a27-4342-b359-72ab82e87cfa`, Lovable Cloud-prosjekt `dlvtgeqyagekfkvklmqm`). Manus: `Claude/Projects/Animatic Studio/Manus/` (utenfor repoet).
3. Arbeidsflyt i Cowork: repoet pakkes på Mac-en (`tar`), hentes til skymiljøet, bygges og testes der, og pakkes tilbake via `.overforing/` (slettes etterpå). Mars gjør Commit + Push i GitHub Desktop med `docs/development/NEXT_COMMIT_MESSAGE.txt`. `src/integrations/` (Lovable-generert) sendes aldri tilbake.
4. Lokalt testmiljø i skyen: `bun install`, Postgres 16 (port 54329), Playwright-Chromium i `/opt/pw-browsers` (Playwright-pakken ligger i `/tmp/claude-0/pw`). Referansemanus kopieres til `/tmp/claude-0/ref_no.pdf` og `ref_en.docx` for gyldne tester – aldri inn i repoet.
5. Kontroller: `bun run test`, `bun tests/db/run-db-tests.ts`, `npx tsc --noEmit`, `python3 scripts/kb/check_kb.py`. Dev-server: `bunx vite dev --host 127.0.0.1`.

## Hva er gjort
- **Økt 1 (M0):** kunnskapsbase, kravregister, beslutninger, arkitektur, skills.
- **Økt 2 (M1):** kjerne, migrasjon 0001 (kjørt i Lovable), `runCommand`, innlogging/prosjekter. Feil KI-18 funnet av Mars og rettet.
- **Økt 3 (M2 del 1):** se `CURRENT_WORK.md`. Nye beslutninger DEC-0023–0026, ADR-0010. Kodegjennomgang med 15 funn, alle rettet.

## Hva er testet
- 85 Vitest-tester (inkl. 6 gyldne mot referansemanuset, 9 egenskapsbaserte), 19 databasetester, 13 skjermbilder + ekte PDF-import i nettleser (forhåndsvisning).
- **Ikke testet:** migrasjon 0002 i Lovable Cloud (bøtte og storage-policyer, KI-19), ekte opplasting og import gjennom serverfunksjonen (størrelse/tid, KI-23), sanntid mellom to ekte brukere, første kjøring av `tests.yml` på GitHub.

## Filer endret i økt 3
Nye: `src/core/screenplay/{paginate,script-pages,numbering}.ts`, `src/engine/import/browser.ts`, `src/engine/export/*`, `src/app/project/*`, `src/app/script/*`, `src/app/shell/ProjectNav.tsx`, `src/routes/prosjekt.$projectId.{index,manus}.tsx`, `db/migrations/0002_import_profiles.sql`, `tests/unit/{import-split-merge,paginate,numbering,export,review-regressions}.test.ts`, `.github/workflows/tests.yml`, ADR-0010. Endret: `src/core/**` (nye kommandoer, `removed`, invarianter), `parse.ts`, `docx-lines.ts`, `commands.functions.ts`, `project-rows.ts`, `ProjectOverview.tsx`, `prosjekt.$projectId.tsx` (nå layout med meny), `routeTree.gen.ts`, `package.json` (`test:db`), dokumentasjon og kravregister.

## Uavklarte risikoer
KI-12, KI-14, KI-15, KI-16, KI-17 (første CI-kjøring), KI-19 (Storage), KI-20 (tittelside), KI-21 (DOCX-sider), KI-22 (angre per fane), KI-23 (store kommandoer), KI-24 (spinoff-UI). Produktspørsmål Q-02–Q-10; Q-08 har midlertidig antakelse DEC-0026.

## Neste konkrete steg
1. Mars: Commit + Push → synkmelding for `0002_import_profiles.sql` → importer «Jula på Dovre» i Manus.
2. Claude: rette det som dukker opp, deretter M2 del 2 (manusversjoner, søk/filter, varighet, tilstedeværelse).
