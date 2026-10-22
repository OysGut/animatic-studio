# REQ-0210 – bilde og lyd i takt (N2, 22.10.2026)

## Avviket
I lange kjøringer av `verifisering4-ui` lå tidskoden i sceneeditoren 252–301 ms etter lydklokken. Isolert
avspilling ga 89 ms. Grensen (< 200 ms) er ikke endret.

## Målinger
Suiten har fått tidsmåling per steg og to nye diagnoselinjer i `avspilling`. `N2-tc` logger hver endring av
tidskoden sammen med lydklokken. `N2-diag` viser lange oppgaver på hovedtråden, minnebruk og antall
lydkontekster. Full kjøring før rettingen:

| Steg | Tid |
|---|---|
| kostnad | 54,9 s |
| sammenlign | 13,5 s |
| avspilling | 17,3 s (feilet, 260 ms) |
| naboscener / lag / opptak / hybrid / manus | 25,5 / 14,2 / 24,2 / 31,5 / 7,3 s |

## Funn
- **Ikke akkumulert drift.** Hvert steg får en ny nettleserkontekst og en ny side. Siden har én lydkontekst.
  Det finnes ingen gjenbrukte spillere og ingen lekkede lyttere mellom stegene. Minnet økte fra 169 til 213 MB
  i løpet av avspillingen og faller igjen. Lydkildene ble alltid lagt på riktig sted (0 ms spredning).
- **Årsaken var to klokker med hver sin start.** Bildet (`usePlayback`) regnet tiden fra `performance.now()`
  der avspillingen startet. Lyden startet på sin egen klokke (`AudioContext.currentTime` + 40 ms), i en
  effekt som kom etter. Lydkonteksten lages ved første avspilling. Når hovedtråden var opptatt (lange
  oppgaver på 150–250 ms etter mange scener og tunge steg), fikk de to klokkene ulik start. Avstanden ble
  liggende fast gjennom hele økten. Loggen viser det: da lydklokken sto på 0,26 s, viste bildet bilde 1, og
  avstanden holdt seg på cirka 180 ms.
- På toppen av den faste avstanden kom de korte pausene når tegningen var treg (30–170 ms). Det ga til sammen
  252–301 ms. Lyden startes bare på nytt ved avvik over 250 ms, så dette ble aldri rettet underveis.
- I en isolert kjøring er hovedtråden ledig, avstanden blir liten, og testen bestod.

## Retting
- Når scenen spiller lyd, følger bildet nå lydklokken: avspillingshodet er `fra + (currentTime − startAt)`.
  `useAudioPlayback` fyller inn en klokke, og `usePlayback` bruker den i hvert bilde.
- Uten lyd, eller før lyden har startet, gir klokken null. Da brukes `performance.now()` som før. Ved overgangen
  oppdateres startpunktet, så bildet ikke hopper.
- Løkke, område og hopp virker som før. Lyden startes fortsatt på nytt ved hopp.
- Bare sceneeditoren bruker klokken (der kravet måles). Naboscener, Asset Studio og sammenligningsvisningen
  er ikke endret.

## Resultater
- Full `verifisering4-ui`, tre kjøringer etter rettingen: 58/58 hver gang. Største avvik var 181, 142 og
  132 ms. Isolert avspilling: 6/6, 132 ms. Grensen er fortsatt < 200 ms.
- Etter rettingen er tidskode og lydklokke innenfor cirka 20 ms hver gang tidskoden oppdateres. Det som er
  igjen av avvik, er pauser når tegningen er treg. Noe av den belastningen kommer fra testen selv, som leser
  hele lerretet etter hver måling.
- Ny regresjonstest `tests/unit/req0210-playback-drift.test.ts`. Den kjører 50 avspillinger etter hverandre,
  med 40–290 ms startforsinkelse for lyden, ±0,5 % klokkefart og jevnlige lange oppgaver. Avviket skal være
  under ett bilde, og siste runde skal ikke være dårligere enn første. Uten lydklokke brukes `performance.now`.
  Testen er ikke kjørt mot koden fra før rettingen. Der har bildet ingen kobling til lydklokken, så
  startforsinkelsen på opptil 290 ms skulle få testen til å feile.
- tsc 0. Full Vitest: 2446 bestått, 10 hoppet over. To språktester feilet fordi språkinventaret var utdatert
  etter kodeendringen. Inventaret er laget på nytt, og begge testene består nå (23/23). i18n-sjekken er grønn.
  Full Vitest er ikke kjørt på nytt etter dette.
- Ingen migrasjon, ingen betalte kall, ikke publisert.

## Gjenstår
Tegningen i sceneeditoren er fortsatt tung: hele arbeidsflaten tegnes på nytt for hvert bilde. Det gir
hakking under belastning, men ikke drift. Dette kan bli en egen ytelsessak.

## Endrede filer
- `src/app/scene-editor/use-playback.ts`
- `src/app/audio/use-audio-playback.ts`
- `src/app/scene-editor/SceneEditorWorkspace.tsx`
- `tests/unit/req0210-playback-drift.test.ts` (ny)
- `tests/visual/verifisering4-ui.mjs` (tidsmåling per steg og N2-diagnostikk)
- `scripts/i18n/references.v1.json`, `candidates.v1.json`, `inventory-report.json` (laget på nytt)
- `roadmap.md`, `docs/development/REQ0210_REPORT.md`
