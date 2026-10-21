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
