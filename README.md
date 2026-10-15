# Animatic Studio

Et profesjonelt filmproduksjonsverktøy fra manus til ferdig film: manus, scener, ressursbibliotek, lagbasert 2D-animatic med kamera, lyd, filmtidslinje, valgfri AI-generering (bilder, video, lyd, tale), versjoner, kontinuitet, språkversjoner, spinoffer, plakater og eksport. Første brukere er Trollfilm / Anita Killi («Jula på Dovre»). Produkteier: Mars (mars@gutu.no).

Tjenesten finnes på norsk og engelsk (DEC-0081). Denne fila er startsiden for mennesker og KI-agenter som skal føre prosjektet videre.

## Start her (for en ny utvikler eller KI)
1. **`CLAUDE.md`** – arbeidsregler, arkitekturprinsipper og hva som aldri skal endres. Les først.
2. **`docs/development/SESSION_HANDOVER.md`** – hvor arbeidet står, siste testtilstand og neste steg.
3. **`TODO.md`** – det som er bestilt eller tenkt gjort, men ikke bygget.
4. **`docs/development/CURRENT_WORK.md`** – pågående oppgaver og hva som venter på Mars.
5. **`.claude/skills/README.md`** – skillene (arbeidsmetoder) og når de brukes.

## Hvor alt ligger
| Hva | Hvor |
|---|---|
| Produktspesifikasjonen (mandat v14, endres aldri) | `docs/product/MASTER_SPECIFICATION.md` |
| Beslutninger etter mandatet (DEC-xxxx) | `docs/decisions/DECISION_LOG.md`, ADR-er i `docs/decisions/adr/` |
| Kravregisteret (REQ-xxxx, eneste redigerbare kilde) | `docs/product/requirements.yaml` → genererte `REQUIREMENTS.md` og `TRACEABILITY_MATRIX.md` |
| Åpne produktspørsmål | `docs/product/OPEN_QUESTIONS.md` |
| Arkitektur, domenemodell, invarianter | `docs/architecture/` (`INVARIANTS.md` er kritisk) |
| Design og UX | `docs/design/` |
| Kjente problemer (KI-xxx) | `docs/development/KNOWN_ISSUES.md` |
| Status per område | `docs/development/IMPLEMENTATION_STATUS.md` |
| Visuelle kontroller per leveranse | `docs/development/VISUAL_QA_DEC-*.md` |
| Språk (norsk/engelsk) | `docs/development/I18N_GUIDE.md` |
| Databasemigrasjoner | `db/migrations/NNNN_*.sql` (aldri `drizzle/`) |
| Tester | `tests/` (enhet, invarianter, integrasjon, database, nettleser) |

## Kode
- `src/core/` – domenekjernen: ren TypeScript uten React/Supabase (kommandoer, modell, manus, montering, AI-beskrivelser, språk).
- `src/engine/` – import, eksport, tegning (compositor) og lyd i nettleseren.
- `src/adapters/` – database, lagring, serverfunksjoner og AI-leverandører.
- `src/app/` – brukerflaten (React). `src/routes/` – sidene (TanStack Start).
- All skriving går via serverfunksjonen `runCommand` → `public.apply_changes` (DEC-0022).

## Kontroller
```sh
bun install
npx tsc --noEmit -p .                     # typer
npx vitest run                            # enhetstester
node scripts/i18n/check.mjs               # all brukertekst har engelsk
python3 scripts/kb/check_kb.py            # krav, skills og dokumenter henger sammen
DATABASE_URL=postgres://… bun tests/db/run-db-tests.ts   # databasetester mot lokal Postgres 16
```
Nettlesertestene (`tests/visual/*.mjs`) kjøres med Playwright mot `bunx vite dev` – se overskriften i hver fil.

## Arbeidsflyt med Lovable og GitHub
- Koden skrives i repoet (Claude). Mars gjør commit og push med teksten i `docs/development/NEXT_COMMIT_MESSAGE.txt`.
- Etter push limer Mars inn `docs/development/LOVABLE_SYNC.md` i Lovable, som kjører nye migrasjoner. Lovable endrer ikke `docs/`, `.claude/`, `db/`, `src/core/` eller `tests/`.
- Aldri force-push, rebase eller squash på `main` (Lovable synker grenen).
- Manus, mediefiler og hemmeligheter skal aldri i repoet.

## Lovable
Prosjektet kjøres i [Lovable](https://lovable.dev/projects/27853fcb-6a27-4342-b359-72ab82e87cfa) (Lovable Cloud: database, lagring, hemmeligheter, forhåndsvisning og publisering).
