# B-100 – Animasjon inn i Scene og spacing-drag

Dato: 21.10.2026. Ingen migrasjon. `apply_changes` er ikke endret.

## Runde 1 – lengden stemmer
- **Årsak:** varigheten (`compositionDuration`) var riktig i data og montering, men tidsvinduet og avspillingsområdet i den gamle Animasjon-fanen ble satt én gang og fulgte ikke ny lengde.
- **Retting:** `followWindowLength` / `followRangeLength` (`src/core/animation/time-format.ts`): et vindu eller område som dekket hele scenen følger ny lengde; et delvindu klemmes.
- **Test:** `tests/unit/b100-length.test.ts` (6): vindu/område ved forlengelse og krymping, og at Scene og monteringen (`filmClips`) viser samme lengde (180 f) etter `RetimeScene`.

## Runde 2 – én skjerm
- Animasjon-fanen er fjernet fra Scene. Sporene ligger i `SceneTrackGroups` under scenens tidslinje: karakterspor med replikker, munn/leppesynk, blink og mønstre, bildevarianter, rytmeverktøyet, avspillingsområde og navigator.
- Valgt lag felles ut automatisk; det kan slås av, og valget lagres i `ui_prefs` (`sceneEditor.trackGroups`).
- Gamle lenker og bokmerker med `fane=animation` åpner Scene med sporene utfelt.
- Ingen data er endret eller flyttet.
- Lerretet har minst 180 px høyde, og sporene krymper med rulling, så begge er synlige ved 1280 × 900 (u5).

## Runde 3 – spacing-drag
- Kjernen: `planSpacingDrag` (`src/core/animation/spacing.ts`) skalerer tiden for nøkkelbilder, bane start/slutt (tempo bakes ved behov, høyst 20 punkter) og bildeskifter for laget og gruppebarna. Romverdier og banenoder endres aldri.
- Fra klikkpunktet og ut (Cmd/Ctrl + dra) eller hele animasjonen med klikkpunktet som anker (+ Shift). Snap til hele frames, Escape avbryter, «+12 f» og ny lengde vises underveis.
- To nøkkelbilder slås aldri sammen: draget stopper ved grensen med en kort melding. Låste tidsrom flyttes aldri.
- Slipp gir én `UpdateLayers` = én angring.
- Hover på lagets rad viser bevegelsesbanen på lerretet, punktet for pekerens tid og den berørte delen i oransje (`--accent-warm`).
- Rytme-drag gjelder linjal og tomrom; spacing-drag gjelder lagets rad. Peker og hjelpetekst viser modusen.

## Tester
| Kontroll | Resultat |
|---|---|
| `npx tsgo --noEmit` | rent |
| i18n-sjekk | 0 tekster uten engelsk |
| Full vitest | 2 117 bestått, 10 hoppet over (eksisterende), 0 feilet |
| `b100-spacing.mjs` nb/en | 17/17 og 17/17 |
| CA1–CA8 nb/en | 18, 17, 20, 25, 13, 15, 26, 22 – alle bestått på begge språk |
| dv2, dv3 nb/en | 7/7; 48/48 |
| u5-screens nb/en | 63/63 |
| scene-panels-ui nb/en | 39/39 |
| rigg-r1–r4 nb/en | 12, 17, 15, 12 – alle bestått |
| storylab-ui, verifisering3-ui nb/en | 32/32; 73/73 (fanelister med «Rigg») |
| DB-tester | **ikke kjørt**: lokal Postgres kunne ikke startes i dette miljøet. Ingen DB-endring i B-100. |

Suitene ble kjørt én om gangen.

## Avvik
1. `AnimationWorkspace.tsx` og `AnimPreview.tsx` er beholdt som ubrukt kode. Sletting fjernet tekstnøkler fra i18n-grunnlaget og ga feil i ML1-baseline-testen. De kan fjernes i en egen runde sammen med oppdatert baseline.
2. Spacing-drag forbi scenens slutt viser en melding, men er ennå ikke koblet til `BeyondEndNotice` med tilbud om å forlenge (B-041). Ingenting forlenges automatisk.
3. Hover-uthevingen bruker lagets tidsrom, ikke eksakt blob-geometri. Lag uten `MotionPath` får ingen bane på lerretet.
4. CA1-feilen med piltaster var gammel kode i nettleseren etter omlasting, ikke en feil i produktet. Den besto 18/18 i tre kjøringer etter ny innlasting.

## Åpne spørsmål
- Skal `BeyondEndNotice` med forlengelse bygges i neste runde?
- Kan de to ubrukte filene og ML1-baselinen ryddes i samme runde?
