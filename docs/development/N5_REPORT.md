# N5 – ytelse i sceneeditoren, REQ-0269 og DV5 (22.10.2026)

Ingen migrasjon (0089 er ikke laget, skjemaversjonen er fortsatt 88). Ingen betalte AI- eller ElevenLabs-kall. Ingenting er publisert.

## 1. Ytelse i sceneeditoren (REQ-0210-rest)

### Måling
`tests/visual/verifisering4-ui.mjs` teller nå React-commits og rendrede komponenter per navn under avspilling. Det gjøres med en liten DevTools-krok i testsiden; appen er ikke endret for dette. Suiten teller også lange oppgaver (longtask) og bilder (endringer i tidskoden). En komponent regnes som rendret når den får nye props eller ny tilstand.

| Under avspilling, per bilde | Før | Etter |
|---|---|---|
| Commits | 1,8 | 1,8 |
| Arbeidsflaten (Editor) | 1,8 | 1,8 |
| Dialog (lukkede vinduer) | 10,2 | 3,2 |
| Presence (Radix) | 22,5 | 8,5 |
| Lange oppgaver per avspillingsøkt (ca. 2,6 s) | 9–14 (55–80 ms hver) | 1–3 (bare oppstarten, ca. 120 ms) |

De største kildene var lukkede dialogvinduer som likevel ble rendret for hvert bilde, og arbeidsflaten som rendres på nytt for hvert bilde.

### Retting
- Ny `src/app/scene-editor/frame-frozen.tsx` (`FrameFrozen`): mens avspillingen går, brukes forrige rendring av en del så lenge delens avhengigheter er de samme. Endres en avhengighet, eller avspillingen stopper, rendres delen som før. Komponentenes egen tilstand virker som vanlig.
- I `SceneEditorWorkspace.tsx` er disse delene pakket inn:
  - verktøylinjen
  - ressurspanelet, lydpanelet for nabosceneer og lagpanelet (det viser bilde 0 under avspilling også før)
  - de lukkede dialogvinduene (manus, lydklipp, endringer, lagbilde, snarveier, opptak og nytt lag), bare mens de er lukket
- Mobilknappens tidspunkt leses fra gjeldende bilde når knappen brukes, så den viser riktig tid også under avspilling.
- Deler som følger bildet (lerretet, tidslinjen, manuspanelet, laginspektøren og sporgruppene), rendres som før.

### Regresjonstester
- `tests/unit/n5-frame-frozen.test.tsx`: 60 bilder under avspilling gir høyst én rendring av en tung del. Endrede avhengigheter rendres straks, og uten avspilling rendres alt som før.
- `verifisering4-ui.mjs` har to nye kontroller:
  - tunge paneler (lagpanel, ressurspanel, naboscener, verktøylinje, scenevelger og scenemerker) høyst 0,2 rendringer per bilde
  - lukkede dialogvinduer høyst 4 per bilde

### verifisering4-ui, største avvik mellom bilde og lyd (REQ-0210, grense < 200 ms)
| Kjøring | Før | Etter |
|---|---|---|
| 1 | 122 ms | 43 ms |
| 2 | 111 ms | 62 ms |

Begge kjøringene etter endringen: alle 60 kontroller bestått. Før endringen var det 58, og de to nye kontrollene kommer i tillegg.

**Gjenstår:** Arbeidsflaten, tidslinjen (SpacingRow) og knappene rendres fortsatt for hvert bilde. Å flytte gjeldende bilde ut av arbeidsflaten er en større omlegging og er ikke gjort.

## 2. REQ-0269: leverandøruavhengig stemme
- `AssetVoice.provider` i `src/core/model.ts` er nå en leverandør-ID (streng), ikke den låste typen `"elevenlabs"`.
- `assetVoiceError` (`src/core/dialogue/voice.ts`) godtar leverandører som står i leverandørkatalogen og kan lage tale. Lagrede stemmer med `"elevenlabs"` leses og godtas uendret. Ingen ny leverandør er lagt til.
- Avvikslisten i `tests/architecture/n4-provider-agnostic.test.ts` er tom. En ny test sjekker at eksisterende data godtas, og at ukjente leverandører og leverandører uten tale avvises.
- REQ-0269 er flyttet til «Verifisert».

## 3. DV5: «Angre hele jobben» hopper over resultater som allerede er angret
- Ny ren funksjon `undoneLocally` (`src/core/dialogue/batch-undo.ts`): et resultat regnes som angret når kommandologgen har flere senere inverser enn senere gjentak (gjør om). Rekkefølgen på nøklene spiller ingen rolle.
- `undoDialogueBatch` (`src/adapters/storage/dialogue-batch.server.ts`) sjekker hvert resultat først. Er resultatet angret fra angrelisten, merkes elementet «undone» og hoppes over, uten konflikt og uten ny skriving. Svaret inneholder nå også `skipped`.
- Det trengs ingen migrasjon, fordi kommandologgen allerede har kommando og invers.
- Test: `tests/unit/n5-batch-undo-skip.test.ts`.
- **Begrensning:** Gir «gjør om» en kommando som ikke er helt lik originalen, regnes resultatet fortsatt som angret og blir hoppet over. Da står resultatet igjen. Ingen data går tapt.

## Resultater
- tsc: 0 feil.
- Full Vitest: 2465 bestått, 10 hoppet over, 0 feilet. Språkinventaret er laget på nytt.
- DB: 180 bestått, 0 feilet (lokal Postgres).
- i18n: grønn (ingen nye tekster i grensesnittet).
- build_docs.py og check_kb.py: OK.
