# ADR-0001 – Kravregister som YAML med genererte dokumenter
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0007 · **Type:** Teknisk anbefaling
- **Berørte krav:** alle · **Moduler:** PROCESS

## Kontekst
530 krav må kunne spores, kontrolleres og oppdateres over mange økter uten å forvitre. Del A3/A4/B4 krever sporbarhet, dekning og revisjon ved milepæler.
## Beslutning
`docs/product/requirements.yaml` er eneste redigerbare kilde. `scripts/kb/build_docs.py` genererer `REQUIREMENTS.md` og `TRACEABILITY_MATRIX.md`. `scripts/kb/check_kb.py` håndhever: mandatets kontrollsum, fortløpende permanente ID-er, gyldige felt, at hver innholdslinje i mandatet er referert av et krav, at «Verifisert» har verifikasjon og «Implementert» har implementeringsreferanse, at krav utenfor mandatet viser til en beslutning, og at skills har gyldig format. Kjøres lokalt og i GitHub Actions.
## Alternativer
Markdown-tabeller for hånd (kan ikke kontrolleres), regneark (utenfor repoet), issue-tracker (avhengighet, ikke versjonert sammen med koden).
## Konsekvenser
+ Maskinell kontroll av dekning og status. − Krever Python 3 + PyYAML for kontrollene (finnes i Claude-miljøene; GitHub Actions installerer).
## Verifisering
`check_kb.py` returnerer OK i CI på hver push.
