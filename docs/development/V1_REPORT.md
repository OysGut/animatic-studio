# V1 – status lik virkelighet (21.10.2026, delvis levert)

## Krav
55 krav gjennomgått: de 54 P0/P1-kravene som har en test oppført, pluss REQ-0503.
- **42 verifisert** (3 P0, 39 P1): REQ-0022, 0145, 0503, 0623, 0625–0628, 0633, 0697, 0837, 0838, 0840–0844, 0845–0853, 0863–0870, 0871–0874, 0875–0878. Hvert krav har fått testen og datoen i `verification` og en `history`-post.
- **13 ikke verifisert**. Hvert har én linje i `history`:
  - REQ-0121: bibliotekvisningen mangler UI-test etter at `screens.mjs` ble avviklet.
  - REQ-0269: en ny leverandør krever fortsatt endring i kjernen.
  - REQ-0291, 0293, 0504: krever at bakgrunnsjobben kjører i publisert Cloud.
  - REQ-0685, 0687, 0689: må prøves på ekte telefoner.
  - REQ-0699, 0704: venter på prøving med ekte norsk opptak.
  - REQ-0708, 0709: må prøves med ekte opptak (KI-248).
  - REQ-0839: faktisk WebM-alfa er ikke verifisert.
- Nye tall: P0 135 verifisert, 6 implementert, 1 under arbeid, 5 ikke startet. P1 402 verifisert, 95 implementert.
- Prosesskravene REQ-0450–0530 er ikke rørt.

## Testtall (kjørt denne runden)
- p4 39/39, p5 24/24, p7 45/45, p8 110/110, m6-rest 74/74, r3r4 58/58 og dec0094 24/24 (nb). p4 og r3r4 fikk én gang tidsavbrudd ved første lasting (kald utviklingsserver), men besto ved ny kjøring.
- scene-video-ui 39/39, storylab-canvas-ui 33/33 og mts-global 13/13, på nb og med UI_LANG=en.
- Ny enhetstest `visual-schema-version.test.ts`: 2/2.

## Gjenstår
- `build_docs.py` og `check_kb.py` kunne ikke kjøres, fordi Python-pakken `yaml` mangler i miljøet. Derfor er `REQUIREMENTS.md` og `TRACEABILITY_MATRIX.md` ikke generert på nytt.
- `TODO.md` og `IMPLEMENTATION_STATUS.md` er ikke oppdatert.
- De 22 suitene med ny felles skjemaversjon er ikke kjørt i nettleseren; bare syntakskontroll er gjort.
- Skjermbilder av «Mer …» ved 1280 og 1024 px er ikke tatt.
- `ID_AUDIT.md` er ikke laget.
- Full vitest og DB er ikke kjørt etter endringene.

## Fullføring 21.10.2026 (runde 2)

1. **Kravdokumenter:** PyYAML installert. `build_docs.py` skrev REQUIREMENTS.md og TRACEABILITY_MATRIX.md; `check_kb.py` fant én feil (REQ-0503 «Verifisert» uten implementeringsreferanse), rettet med `src/core/generation/style-harmonize.ts` og `db/migrations/0068_global_withdrawals.sql`. Ny kjøring: OK. 878 krav – 708 Verifisert, 112 Implementert – ikke verifisert, 13 Under arbeid, 45 Ikke startet (P0 135/6/1/5, P1 402/95/12/34).
2. **TODO.md** avstemt maskinelt mot kravfilen (per status og prioritet); ProRes/MOV og AI-stilharmonisering fjernet fra «Bestilt, ikke bygget». **IMPLEMENTATION_STATUS.md** har ny V1-seksjon.
3. **Nettlesersuiter** (21 suiter med felles skjemaversjon; `_p.mjs` er en målehjelper uten kontroller og kjørte uten feil):
   - Grønne på nb og en: account-admin 58, ai-admin 46, dec0088 26, dec0090 35, dec0093 28, dec0094 24, dec0095 16, dec0096 31, export-e2e (videofil > 0 byte), funn-0079 og funn-0080 (alle steg ok), i18n-en-pass (ok), interactions-e2e 44, scene-panels 39, storylab-group 28, storylab-scene 18, storylab-suggestions 22, storylab-ui 32, u2-chrome 25.
   - verifisering3: nb 73/73; en 62/73 – suiten har ingen UI_LANG-støtte og leter etter norske tekster på prosjektoversikten (REQ-0405). Testbegrensning, ikke appfeil.
   - verifisering4: 51/54 på både nb og en – kjent avvik i dette miljøet (REQ-0050 6,439 em; REQ-0583 falsk mikrofon). Testen er ikke svekket.
   - dec0090 nb: 34/35 første gang (tidsavhengig opptelling av sendte bilder), 35/35 ved ny kjøring.
   - Med UI_LANG=en: p4 39/39, p5 24/24, p7 45/45, p8 110/110, m6-rest 74/74, r3r4 58/58, dec0094 24/24.
4. **«Mer …»-menyen:** ny suite `tests/visual/toolbar-more-ui.mjs` tar skjermbilder av sceneeditor, manus og bibliotek ved 1280 og 1024 px. Ved 1280 px får alt plass (menyen skjult); ved 1024 px ligger menyen og alle knappene innenfor skjermen. 15/15 på nb og en. Ingen feil å rette.
5. **ID_AUDIT.md** laget: alle tabeller har permanent uuid; seks funn i JSON/kjernelogikk (ord i ordkobling, opphav via versjonsnummer i notat, klipp-/delindeks, importindeks, Story Lab-forgreining, låst side). Én additiv migrasjon foreslått.
6. **Full vitest:** 250 filer, 2 021 bestått, 10 hoppet over, 0 feilet. **DB:** 144/144 (lokal Postgres som uid 65534 via nss_wrapper).
