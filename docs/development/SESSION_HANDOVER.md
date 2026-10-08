# Handover – Animatic Studio

**Sist oppdatert:** 2026-10-08 (økt 1, Claude i Cowork). Dette er arbeidsstatus. Mandatet (`docs/product/MASTER_SPECIFICATION.md`) og beslutningsloggen er fortsatt autoritative.

## Slik starter du en ny økt
1. Les `CLAUDE.md`, denne fila og `CURRENT_WORK.md`.
2. Repoet ligger på Mars' Mac: `Claude/Projects/Animatic Studio/animatic-studio` (GitHub `OysGut/animatic-studio`, gren `main`, synket med Lovable-prosjekt `27853fcb-6a27-4342-b359-72ab82e87cfa`). Manus ligger i `Claude/Projects/Animatic Studio/Manus/` (utenfor repoet).
3. Kjør `python3 scripts/kb/check_kb.py` for å se at kunnskapsbasen er hel.

## Hva er gjort (økt 1)
- Mandat v14 lagret byte-identisk (SHA-256 `9dc65608…328b52`). Manifest: `docs/product/SPEC_MANIFEST.yaml`.
- Etableringsoppdraget lagret (`docs/product/ESTABLISHMENT_BRIEF.md`, DEC-0019).
- Kravregister: 530 krav (`requirements.yaml` → `REQUIREMENTS.md`, `TRACEABILITY_MATRIX.md`). REQ-0001–0519 + 0530 fra mandatet, REQ-0520–0522 brukerbeslutning (flerbruker), REQ-0523–0529 teknisk anbefaling.
- Beslutninger DEC-0001–DEC-0020, ADR-0001–0008. Viktigst: DEC-0005 (Claude bygger alt, Lovable kjører), DEC-0006 (Claudes fullmakt), DEC-0003 (flerbruker), DEC-0020 (presiseringer).
- Arkitektur: ARCHITECTURE, DOMAIN_MODEL, DATA_RELATIONSHIPS, INVARIANTS, API_INTEGRATIONS. Design: DESIGN_SYSTEM, UX_PRINCIPLES, COMPONENT_INVENTORY (foreløpige).
- 12 P0-skills i `.claude/skills/` (v0.2.0).
- Kontrollskript `scripts/kb/` + GitHub Actions `.github/workflows/knowledge-base.yml`.

## Hva er testet
- `check_kb.py`: OK (kontrollsum, 530 krav, 0 mandatlinjer uten krav, 12 skills gyldige).
- Uavhengig kravrevisjon: 47 stikkprøver, ingen meningsendringer; styringsfunn rettet.
- Skilltest S1–S12: se `SKILL_TEST_REPORT.md`.
- **Ikke testet:** CI på GitHub (kjøres ved første push), at Lovable lar `docs/`/`.claude/` være i fred (KI-07).

## Filer endret i Lovable-repoet
Nye: `CLAUDE.md`, `docs/**`, `.claude/**`, `scripts/kb/**`, `.github/workflows/knowledge-base.yml`. Endret (innhold beholdt, tillegg nederst): `AGENTS.md`, `.gitignore`. Ingen kode endret.

## Uavklarte risikoer
KI-04 (migrasjoner via Lovable), KI-05 (Supabase-API ikke nåbart for Claude), KI-07, KI-08 (paginering), KI-10 (Lovable Cloud ikke aktivert). Produktspørsmål Q-01–Q-10 i `OPEN_QUESTIONS.md` – ingen blokkerer M1.

## Neste konkrete steg
1. Mars: Commit + Push (melding i `docs/development/NEXT_COMMIT_MESSAGE.txt`), deretter aktivere Lovable Cloud.
2. Claude: M1 steg 1–3 (kjerne og invarianttester) kan starte uten backend; steg 4 krever Lovable Cloud.
