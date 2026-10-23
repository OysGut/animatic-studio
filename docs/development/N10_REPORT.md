# N10 – tilgjengelighet i sceneeditoren og manuset (23.10.2026)

Ingen migrasjon, ingen betalte kall, ikke publisert. axe-core er lagt inn som utviklingspakke (oppdraget ba om det).

## Metode
- `tests/visual/n10-a11y.mjs` (Playwright, mockede tjenester): axe-core med WCAG 2.0/2.1 A og AA (inkl. kontrast) på sceneeditoren, animasjonsvisningen og manussiden, på nb og en. Tastaturkontroller: 120 Tab-steg (ingen fokusfelle, synlig fokus på alle), mellomrom spiller av/stopper og virker ikke i tekstfelt, live-region, og dialogfokus (inn, holdes, tilbake).
- `tests/unit/n10-a11y.test.tsx` (jsdom): axe på tidsnavigatoren og piltaster på glideren og kantene.
- Tema: appen har bare mørkt tema (DEC-0017). Lyst tema finnes ikke og er ikke kontrollert; det lyse manusarket er med i manussidens axe-kontroll.

## Funn før retting (axe, per side)
| Side | Avvik |
|---|---|
| Sceneeditor | ARIA-navn på `span` uten rolle (notatmerke), kontrast ×2, synlig tekst ikke del av navnet ×3 |
| Animasjonsvisning | som over, + navnefeil på replikksegmenter ×2, nestede kontroller i tidsnavigatoren |
| Manus | ARIA-navn på `span` (endret-linje-merke), kontrast ×5 (tertiær tekst, «flyttet», deaktiverte scener) |
| Tastatur | dra-håndtakene for panelbredde hadde ikke synlig fokusring; replikker i sceneeditorens manus kunne bare åpnes med dobbeltklikk; fokus gikk til `body` når opptaksdialogen ble lukket; ingen live-region for avspilling |

## Rettinger
- **Navn og roller:** notat- og endringsmerker fikk `role="img"`. Der synlig tekst manglet i navnet (scenevelgeren, «Legg til i biblioteket», sporgruppeknappen, rytmeverktøyet), er synlig tekst navnet og den utfyllende teksten flyttet til `aria-description` (samme i18n-nøkler). Replikksegmentene i animasjonssporet bruker synlig tekst som navn.
- **Tidsnavigatoren:** kanthåndtakene ligger nå ved siden av glideren, ikke inni den. Draing og piltaster virker som før.
- **Fokus:** dra-håndtakene har synlig fokusring. Replikker i sceneeditorens manus kan få fokus med Tab og åpnes med Enter. Opptaksdialogen gir fokus tilbake til replikken.
- **Live-region:** skjult `aria-live="polite"` i tidslinjen sier «Spiller av» ved start og «Stoppet på {tidskode}» ved stopp; den endres aldri per bilde. Tidskoden har `aria-live="off"`. Mellomrom spilte allerede av og stoppet (uendret).
- **Kontrast (minst mulig visuell endring):** `--text-tertiary` lysere (oklch L 0,662 → 0,70); `--status-moved` litt lysere (0,74 → 0,78); deaktiverte scener i navigatoren dempes til 80 % i stedet for 60 %; ressurskort utenfor scenen dempes ikke lenger med gjennomsiktighet; gruppeknappen i lagpanelet bruker tertiærfarge i stedet for 60 % gjennomsiktighet.

## Resultat
- n10-a11y: 23 bestått, 0 feilet (0 axe-avvik på alle seks side/språk-kombinasjoner).
- Berørte suiter: ca1-tab 18/0 (sporgruppekontrollen leser nå `aria-description`), ca8-rhythm-export 22/0, b100-spacing 25/0, dv1-script-nav 15/0, ml2-languages 323/0.
- tsc 0 · Vitest 2479 bestått / 10 hoppet over / 0 feilet · i18n-kontroll og releasekontroll grønne.

## Nye tekster (maskinoversatt for de, es, fr, it, ja, ko, pt-BR, ru – merket for gjennomlesing)
- `n10.playback.playing`: «Spiller av» / «Playing»
- `n10.playback.stopped`: «Stoppet på {timecode}» / «Stopped at {timecode}»

## Ikke dekket
Andre sider enn sceneeditor og manus (montering, bibliotek, Asset Studio). Lyst tema finnes ikke. Ført i TODO.md.

## Endrede filer
- src/styles.css
- src/app/shell/pane-size.tsx
- src/app/scene-editor/Timeline.tsx, SceneScriptPanel.tsx, SceneEditorWorkspace.tsx, RecordAudioDialog.tsx, ScenePicker.tsx, SceneAssetsPanel.tsx, LayersPanel.tsx
- src/app/scene-editor/animation/TimeNavigator.tsx, DialogueTrack.tsx, SceneTrackGroups.tsx, RhythmPanel.tsx
- src/app/script/ScriptPageView.tsx, SceneNavigator.tsx
- src/core/i18n/authored.json, src/core/i18n/locales/*.json (alle elleve), src/core/i18n/runtime.gen.json, scripts/i18n/ (inventar)
- package.json, bun.lock (axe-core som utviklingspakke)
- tests/visual/n10-a11y.mjs (ny), tests/unit/n10-a11y.test.tsx (ny), tests/visual/ca1-tab.mjs
- TODO.md, roadmap.md, docs/development/N10_REPORT.md (ny)
