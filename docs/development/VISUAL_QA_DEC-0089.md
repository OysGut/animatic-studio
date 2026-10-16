# Visuell kontroll – DEC-0089 (manuset i sceneeditoren, paneler som lukkes og åpnes)

Dato: 2026-10-16. Skript: `tests/visual/dec0089-script-panel-ui.mjs` (mocker Supabase og serverfunksjonene; ingenting lagres eller betales).
`ENV_FILE=…/.env node dec0089-script-panel-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe`.

## Kontroller (26 av 26 bestått)
- s01 Panelet «Manus»: sceneoverskriften og teksten for scenen; «Rediger manus …»; under avspilling er linjen som spilles av, markert.
- s02 Stablet: pilen lukker «Manus» og «Lag» til overskrifter; valget lagres på kontoen; ˄ flytter «Manus» opp i kolonnen.
- s03 Ny nettleser uten lokalt lager: lukkede paneler huskes fra kontoen; pilen åpner dem igjen.
- s04 Side om side: «Manus» er med; lukket «Egenskaper» blir en smal stripe og de andre får plassen (1400 → 1152 px innhold); stripen åpnes igjen.
- s05 Dobbeltklikk på en linje åpner vinduet med linjen valgt: tekstfelt, elementtype, lagring (EditBlockText); forrige scene vises ikke før man ber om det; «Vis neste scene» viser neste scene til lesing; «Rediger manus …» åpner vinduet med scenens tittel.
- s06 Engelsk («Edit script …», «Collapse “Script”»).

## Andre kontroller
- Vitest: 141 filer, 1213 tester grønne (ny `tests/unit/dec0089-script-in-scene.test.ts`; `scene-panels.test.ts` utvidet med lukking).
- Uendret grønne: scene-panels-ui 39/39 (rekkefølgen har nå «Manus» sist), dec0088-tasks-ui 26/26, image-tools-ui 48/48, scene-video-ui 39/39, verifisering3 73/73, verifisering4 58/58, interactions 44/44, account-admin-ui 58/58, ai-admin-ui 46/46, funn-0079 og funn-0080.
- Skjermbilder sett av Claude: panelet med markert replikk under avspilling, lukkede paneler stablet, smal stripe side om side, vinduet med neste scene til lesing.
