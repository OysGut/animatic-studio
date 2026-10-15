# Visuell kontroll – DEC-0088 (bildeverktøy, elementer i flere scener, systemmerknader, TODO, paneler, AI-tilkoblinger)

Dato: 2026-10-15. Alle skript mocker Supabase og serverfunksjonene (ingenting lagres eller betales).
`ENV_FILE=…/.env node <skript> http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe`.

## Nye nettlesertester
- `tests/visual/dec0088-tasks-ui.mjs` – **26/26**:
  - t01 Bestemor Anne er planlagt i scene 2 og 3: flisen i «I denne scenen» har varmgul ramme, «Skal inn» og «Skal inn fordi det ble lagt til i scene 1»; toppstripen viser «Bestemor Anne: 2 av 2» med ‹ ›, listen viser scenene; «Neste» går til scene 3; X sender RemoveScenePlans.
  - t02 «Legg til element i scenen …»: velg fra biblioteket → «Skal «vase» også inn i andre scener?» med hurtigvalg («Alle scener med Maja», «… Bestemor Anne», «Alle scener etter denne»), avkrysning per scene og merknad i manuset; sender PlanAssetInScenes og AddAnnotations med systemmerknader.
  - t03 Manuset: «Systemmerknad» med varmgul kant; «Ferdig» sender SetAnnotationRemoved.
  - t04 Prosjektsiden: boksen «TODO» med oppgaven, notatet fra Anita (ikke mitt eget, ikke systemmerknaden), manusendringer og feilet AI-generering.
  - t05 Engelsk («To add», «Bestemor Anne: 2 of 2»).
- `tests/visual/image-tools-ui.mjs` – **48/48** (delelinjer hver for seg, navn «1.»–«4.» med varmgul ramme i fokus, «Fjern luften rundt», «Lag variasjoner» med «Hva ønsker du forskjellig?», deler med AI).
- `tests/visual/scene-panels-ui.mjs` – **39/39** (side om side, flytting med ‹ ›, husket på kontoen i ny nettleser, grupper lukkes/åpnes, Alt-klikk, engelsk).
- `tests/visual/ai-admin-ui.mjs` – **46/46** (AI-tilkoblinger: leverandør av/på, modell av/på, legg til modell, ønsker om ny leverandør, status for bakgrunnsjobben, eldre database, engelsk, smal skjerm).

## Andre kontroller
- `tests/db/run-db-tests.ts` **62/62** (ny: 0034 – visningsvalg slås sammen og følger kontoen, app_status og ønsker bare for serveren, modellvalg kan leses men ikke skrives av innloggede, planer og systemmerknader gjennom apply_changes). Testen fant at sikkerhetskopien avviste `task_id`; rettet (task_id er ikke en referanse).
- Vitest: 140 filer, 1209 tester grønne (ny `tests/unit/dec0088-scene-plans.test.ts`: plankommandoer og angre, ventende elementer, oppgaver og forrige/neste, hurtigvalg, eksport av systemmerknader, TODO-notater, dørdeler med hengsel).
- Uendret grønne: verifisering3 73/73, verifisering4 58/58 (etter omstart av utviklingsserveren), interactions 44/44, scene-video-ui 39/39, account-admin-ui 58/58, export-e2e, funn-0079 og funn-0080.
- Skjermbilder sett av Claude: ventende element med varmgul ramme, oppgaven i toppstripen, dialogen for andre scener, systemmerknaden i manuset, TODO-boksen, delelinjer med fokus, AI-tilkoblinger, paneler side om side (siste panel rulles inn på 1600 px, KI-222).
