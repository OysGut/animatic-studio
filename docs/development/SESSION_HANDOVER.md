# Handover – Animatic Studio

**Sist oppdatert:** 2026-10-08 (økt 2, Claude i Cowork). Arbeidsstatus – mandatet og beslutningsloggen er fortsatt autoritative.

## Slik starter du en ny økt
1. Les `CLAUDE.md`, denne fila og `CURRENT_WORK.md`.
2. Repoet: Mars' Mac `Claude/Projects/Animatic Studio/animatic-studio` (GitHub `OysGut/animatic-studio`, gren `main`, Lovable-prosjekt `27853fcb-6a27-4342-b359-72ab82e87cfa`, Lovable Cloud-prosjekt `dlvtgeqyagekfkvklmqm`). Manus: `Claude/Projects/Animatic Studio/Manus/` (utenfor repoet).
3. Arbeidsflyt i Cowork: repoet pakkes på Mac-en (`tar`), hentes til skymiljøet, bygges og testes der, og pakkes tilbake. `git fetch`/`merge --ff-only` kan kjøres på Mac-en (slettetilgang er gitt for Git sine låsefiler). Mars gjør Commit + Push i GitHub Desktop.
4. Lokalt testmiljø i skyen: `bun install` (bun.lock bruker standardregisteret), Postgres 16 i `/usr/lib/postgresql/16/bin` (initdb som brukeren `postgres`, port 54329), Playwright-Chromium i `/opt/pw-browsers`.
5. Kontroller: `bun run test`, `bun tests/db/run-db-tests.ts`, `npx tsc --noEmit`, `python3 scripts/kb/check_kb.py`.

## Hva er gjort
- **Økt 1 (M0):** mandat, kravregister (530), beslutninger, arkitektur, 12 P0-skills, kontrollskript.
- **Økt 2 (M1):** Lovable Cloud aktivert av Mars. `src/core` (kommandoer med invers, invarianter, visninger, fortellingstid, endringssett), `db/migrations/0001_core.sql`, serverfunksjon `runCommand`, innlogging/prosjekter/oversikt/invitasjon med mørkt designsystem. Beslutninger DEC-0021 (Mars betaler API i testfasen) og DEC-0022/ADR-0009 (kjernen på serveren, `apply_changes`, migrasjoner i `db/migrations`). Skills oppdatert til DEC-0022.

## Hva er testet
- 35 Vitest-tester grønne (inkl. 8 egenskapsbaserte invarianttester og arkitekturtest).
- 15 databasetester grønne mot lokal Postgres med Supabase-emulering.
- Visuell QA: 5 skjermbilder (innlogging, prosjektliste, tom liste, prosjektoversikt, databasevarsel) – vurdert OK.
- **Ikke testet:** at migrasjon 0001 kjører i Lovable Cloud, ekte innlogging, serverfunksjonen mot ekte backend, GitHub Actions.

## Filer endret i økt 2
Nye: `src/core/**`, `src/adapters/storage/**`, `src/app/**`, `src/routes/prosjekt.$projectId.tsx`, `src/routes/invitasjon.tsx`, `db/**`, `tests/**`, `docs/decisions/adr/ADR-0009-…`. Endret: `src/routes/index.tsx`, `src/routes/__root.tsx` (norsk tekst, `lang="nb"`), `src/styles.css` (designtokens), `src/components/ui/button.tsx` (størrelser), `src/test/setup.ts` (node-miljø), `src/routeTree.gen.ts` (generert), `package.json`/`bun.lock` (fast-check, fonter), `tsconfig.json`, `vitest.config.ts`, `AGENTS.md`, dokumentasjon.

## Uavklarte risikoer
KI-04 (første migrasjonskjøring i Lovable), KI-12 (full lasting per kommando), KI-14 (utypet klient til types.ts regenereres), KI-15 (e-postbekreftelse), KI-16 (lockfil), KI-17 (CI). Produktspørsmål Q-02–Q-10 (Q-01 avklart for testfasen).

## Etter levering av M1 (samme dag)
- Mars pushet, Lovable kjørte `0001_core.sql` uten feil (schema_version = 1) og regenererte `types.ts`.
- Mars fant en feil: prosjektsiden kunne ikke åpnes (KI-18). Rettet + kontrakttest. 38 Vitest-tester grønne.

## Neste konkrete steg
1. Mars: Commit + Push → synkmelding for `0001_core.sql` → logg inn i forhåndsvisningen og opprett «Jula på Dovre».
2. Claude: rett eventuelle feil fra første kjøring, bytt til typet klient, start M2 (manusimport fra referansemanuset).
