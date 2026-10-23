# N8 – Bildelager i sceneeditoren og avvikskravene (22.–23.10.2026)

Ingen migrasjon (0089 er ikke laget), ingen betalte kall, ikke publisert.

## 1. Ytelse: gjeldende bilde ut av SceneEditorWorkspace

**Løsning.** `use-playback.ts` har fått et lite lager for bildet (`createFrameStore`), `usePlaybackStore` (avspilling uten abonnement), `useFrame(playback, selector?)` og `<FrameValue>`. `playback.frame` leses fra lageret når det brukes, så tilbakekall aldri får et gammelt bilde. `usePlayback` virker som før for de andre visningene (montering, Asset Studio, sammenligning, naboscener).

Disse følger bildet i sceneeditoren:
- **lerretet** (Stage) og forhåndsvisningen;
- **avspillingshodet og tidskoden** i tidslinjen, og aktivt kameraskudd, som bare tegnes når skuddet skifter;
- **manuspanelet**.

Disse følger også bildet, fordi de viser verdier på avspillingshodet, og ellers ville oppførselen endret seg:
- **egenskapspanelet**;
- **nabosceneer**;
- **sporene i animasjonsfanen**;
- **opptaksdialogen**, bare når den er åpen.

Lagpanelet viser bilde 0 under avspilling, som før. **Lyden er fortsatt master** (REQ-0210). Lydsynken ligger i en egen liten del, `SceneAudioSync`, som får bildet fra lydklokken. Bokmerket publiseres via et abonnement. Knappene på lerretet (visning og zoom) fryses under avspilling med `FrameFrozen`.

**Måling** (samme instrumentering som N5, verifisering4-ui, tegninger per bilde under avspilling):

| | Før N8 | Etter, kjøring 1 | Etter, kjøring 2 |
|---|---|---|---|
| Editor (arbeidsflaten) | 1,70 | 0,01 | 0,01 |
| Timeline | 1,02 | 0,01 | 0,01 |
| SpacingRow | 6,09 | 0,09 | 0,09 |
| Button | 12,19 | 0,18 | 0,17 |
| IconButton | 5,11 | 0,10 | 0,10 |
| React-commits (hele avspillingen) | 111 over 64 bilder | 72 over 68 | 73 |
| Lange oppgaver | 10 (maks 109 ms) | 1 (135 ms, oppstart) | 1 (134 ms) |
| Største avvik mellom bilde og lyd (< 200 ms) | 91 ms | 43 ms | 41 ms |

**verifisering4-ui:** Alle 61 kontrollene besto begge gangene. Den nye N8-kontrollen feilet på den gamle koden (Editor 1,70 · SpacingRow 6,09 · Button 12,19), så den fanger feilen.

**Nye tester:**
- `tests/unit/n8-frame-store.test.tsx` (5 tester):
  - Over 60 bilder tegnes bare avspillingshodet og tidskoden. Arbeidsflaten og knappene tegnes ikke.
  - Tilbakekall leser riktig bilde.
  - Bildet holdes innenfor varigheten.
  - En selector tegner bare når verdien endres.
  - `usePlayback` tegner fortsatt per bilde.
- `tests/visual/verifisering4-ui.mjs`:
  - Nytt tak på 0,2 per bilde for Editor, Timeline, SpacingRow, Button, IconButton og ToolbarButton.
  - Knapper telles nå også per nærmeste kjente forelder.

**Visuelle sceneeditorsuiter på nb og en:**
- **Bestått:** ca1 18/0, ca2 17/0, ca4 25/0, ca6 15/0, ca8 22/0, scene-duration-ui 55/0, dv1 15/0, dv3 58/0, dv7 28/0, b100-spacing 25/0.
- **Avvik:** `scene-panels-ui` feiler 13/12 både med den gamle og den nye koden. Feilen skyldes altså ikke N8. Den står i TODO under «Teknisk gjeld».

## 2. Manus og lyd: REQ-0804, 0807, 0808 og 0814

N6 fant **ingen avvik** i disse kravene. Alle fire ble flyttet til «Verifisert» i N6, fordi de visuelle kontrollene besto (dv7-drift 28/0 på nb og en). Ingenting er derfor rettet, og ingenting er lagt under «Krever Øystein». Disse kontrollene bestod:
- **REQ-0804 (A4):** Avviket vises overalt der manuset vises. Kontroller: statusikon i manuset i sceneeditoren, rødt segment i animasjonsfanen og avviksliste i manusutforskeren.
- **REQ-0807 (A7):** Ingen automatisk avspilling. Kontroll: «playback does not start automatically».
- **REQ-0808 (A8):** Endringer vises i rødt i dialogeditoren. Kontroll: «changed words shown in red».
- **REQ-0814 (R2):** Berørte replikker vises. Kontroll: «red lines listed».

dv7-drift er kjørt på nytt etter N8-endringene: 28/0. Mener Claude andre krav, kan de tas i neste runde.

## Testresultater

- tsc: 0 feil.
- Vitest: 2470 bestått, 10 hoppet over, 0 feilet. Først feilet to språktester fordi språkinventaret var utdatert. Det er laget på nytt.
- DB: 180 bestått, 0 feilet, lokalt.
- Språkkontroll: grønn.
- check_kb: OK.

Ingen nye tekster i grensesnittet.
