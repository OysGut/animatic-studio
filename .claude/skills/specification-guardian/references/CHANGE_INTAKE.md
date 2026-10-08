# Innarbeiding av en ny beslutning fra Mars

Mål: en ny produktbeslutning kommer inn i kravregisteret uten at tidligere krav går tapt, omnummereres eller endres i stillhet. Grunnlag: `CLAUDE.md` («Når Mars tar en ny beslutning»), `DECISION_LOG.md` (regler), ADR-0001, mandat 33.5.

## 0. Avklar at det er en beslutning
- Gjelder det *hva produktet skal gjøre* (produktkrav) eller *hvordan* (teknisk)? Bare det første krever Mars.
- Er formuleringen tydelig nok til å skrive testbare akseptansekriterier? Hvis ikke: still ett oppfølgingsspørsmål (åpent, norsk) før du registrerer.
- Gjenta beslutningen med egne ord for Mars og få bekreftelse når den er tvetydig.

## 1. Konsekvensanalyse før registrering
1. Grep `requirements.yaml` etter berørte moduler, kapitler og ord. Lag liste: krav som **utvides**, **endres**, **erstattes**, **blir utgått**, og **nye** krav.
2. Sjekk berørte invarianter (INV-01–14 kan bare endres av Bekreftet av bruker).
3. Sjekk tidligere DEC-er. Erstatter denne en eldre? Da skal den si «Erstatter DEC-xxxx».
4. Hvis beslutningen gjør at et eksisterende krav må svekkes eller fjernes: si det eksplisitt til Mars, med krav-ID, før registrering (33.5).

## 2. Registrer i DECISION_LOG.md
- Neste ledige `DEC-xxxx`. Legg til rad i oversiktstabellen og en seksjon.
- Felt: Dato · **Type: Bekreftet av bruker** · Problemstilling (gjerne Mars' ord sitert) · Valgt løsning · Alternativer · Begrunnelse · Berørte krav · Berørte moduler · Konsekvenser · Endrer tidligere beslutninger (Nei / «Erstatter DEC-xxxx»).
- Eldre DEC-er redigeres aldri; status i tabellen kan settes til «Erstattet av DEC-yyyy».
- Tekniske utledninger Claude gjør av beslutningen merkes som Teknisk anbefaling (mønster: DEC-0003 → REQ-0520–0522 bekreftet, REQ-0523–0529 teknisk-anbefaling).

## 3. Oppdater requirements.yaml
- **Nytt krav:** neste ledige `REQ-xxxx` (aldri gjenbruk, aldri hull). `origin: brukerbeslutning` (eller `teknisk-anbefaling`), `source: {decision: DEC-xxxx}`, alle påkrevde felt (se `requirements-traceability`). `history: [{date, decision: DEC-xxxx, change: Opprettet}]`.
- **Endret krav:** endre tekst/akseptanse, legg til `history`-post `{date, decision: DEC-xxxx, change: "<hva som ble endret>"}`. Var kravet implementert/verifisert → status `Endret – må reverifiseres`.
- **Utgått krav:** behold posten, sett `status: Utgått`, legg til `history` med DEC-ID. Slett aldri.
- **Mandatkrav** beholder `origin: mandat` og `source.section/lines`; endringen dokumenteres i `history` og `notes`.
- Oppdater `spec_coverage.yaml` bare hvis kobling mellom mandatoverskrift og krav endres.

## 4. Oppdater avledede dokumenter
- Berørte filer i `docs/architecture/` (DOMAIN_MODEL, DATA_RELATIONSHIPS, INVARIANTS, ARCHITECTURE) og ADR (ny ADR eller ny status).
- Berørte skills i `.claude/skills/` (bare arbeidsmetode – ikke kopier kravteksten inn).
- `docs/product/OPEN_QUESTIONS.md`: lukk spørsmål beslutningen besvarer.

## 5. Generer og kontroller
```
python3 scripts/kb/build_docs.py
python3 scripts/kb/check_kb.py
```
`check_kb.py` skal gi OK. Typiske feil her: ID-hull, manglende `source.decision`, Utgått uten DEC i historikken, glemt `build_docs.py`.

## 6. Avslutt
- Notat i `docs/development/SESSION_HANDOVER.md`: DEC-ID, krav lagt til/endret/utgått, åpne følgespørsmål.
- Kort bekreftelse til Mars på norsk: hva som er registrert, hvilke krav som ble påvirket, og om noe trenger hans svar.
- Commit med DEC- og REQ-ID-er i meldingen.

## Sjekkliste
- [ ] Ingen eksisterende krav er fjernet, omnummerert eller svekket uten at det står i DEC-en.
- [ ] DEC-typen er riktig.
- [ ] Alle nye/endrede krav har `history`-post med DEC-ID.
- [ ] `MASTER_SPECIFICATION.md` er urørt.
- [ ] `build_docs.py` kjørt, `check_kb.py` OK.
