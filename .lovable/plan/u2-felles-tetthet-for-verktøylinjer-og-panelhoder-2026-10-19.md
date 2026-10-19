# U2 – Felles tetthet for verktøylinjer og panelhoder

## Utgangspunkt (lest i koden)
- `src/app/shell/workspace-chrome.tsx` har allerede `Toolbar`, `ToolbarGroup`, `ToolbarSeparator`, `ToolbarButton` (icon/default/primary) og `PanelHeader`. U2 bygger videre på dem; ingen nye navn som konkurrerer.
- Avvik fra målet i dag: `Toolbar` er `min-h-10` og bryter til flere linjer; ikonknapper bruker `title` i stedet for Radix-verktøytips; skrift og sporing er hardkodet (`text-[11px]`, `text-[13px]`, `tracking-wider`); `PanelHeader`-handlingene er halvt skjult (opacity 60).
- Bruk i dag: Story Lab, Asset Studio, manuset og sceneeditoren bruker delene mye. Prosjektoversikten bruker dem ikke; biblioteket, monteringen og utgivelsen bare delvis. `StackedPanels` i `ScenePanels.tsx` har sitt eget `<header>` + `<h2>`.
- Monteringen har allerede en manuell «Mer ▾» (`AssemblyMoreMenu`). Den beholdes som den er.
- 94 hardkodede farger i `src/app` (se egen seksjon).

## 1. Komponenter og API (alt i `workspace-chrome.tsx`)

```text
Toolbar        { title?, status?, overflow?: "wrap" | "menu" (standard "wrap"), moreLabel? , ...div }
ToolbarGroup   { priority?: number, ...div }      // lavest prioritet flyttes først i «Mer …»
ToolbarSeparator
ToolbarButton  { variant: icon|default|primary, active?, asChild? }   // uendret API
IconButton     { label: string, shortcut?: string, active?, side?, ...button }
PanelHeader    { title, as?, count?, collapse?, actions? }            // uendret API
```

- **Toolbar:** fast høyde 32 px (`h-8`, token `--toolbar-h`), faste mellomrom (`--toolbar-gap`), `ToolbarSeparator` mellom grupper. `overflow="menu"`: en `ResizeObserver` måler gruppene; grupper som ikke får plass, vises i en Radix `DropdownMenu` «Mer …» (`L("Mer …","More …")`) til høyre. Elementene flyttes ikke i DOM ved full bredde, så tester ved 1280 px ser samme markup. Standard er `wrap` (dagens oppførsel, nå 32 px per linje), så ingenting skjules uten at skjermen ber om det.
- **Primærhandling:** `ToolbarButton variant="primary"` i `accent-brand`. Utviklingsvarsel (bare dev, `console.warn`) hvis mer enn én primærknapp finnes i samme `Toolbar`.
- **IconButton:** 28 px, Radix `Tooltip` med navn + hurtigtast (`<kbd>`), `aria-label={label}`, synlig fokus (`focus-visible:ring-focus-ring`). Hurtigtasten hentes som tekst fra eksisterende `shortcut-list.ts` der den finnes; ingen nye taster. `title` fjernes ikke der en test leser den (se tester). `TooltipProvider` legges én gang i arbeidsflate-skallet hvis det ikke allerede finnes.
- **PanelHeader:** 32 px, tittel 11 px store bokstaver med sporing fra tokens, handlinger til høyre alltid synlige (tekst-tertiær, hover/fokus primær — ingen funksjon bare ved hover), sammenleggingspil med `aria-expanded`. Ny valgfri `toggleTitle`-variant der hele tittelen er knappen, slik `StackedPanels` gjør i dag.

## 2. Nye tokens i `styles.css`
`--toolbar-h` (32px), `--toolbar-gap`, `--icon-button` (28px), `--text-ui` (13px), `--text-label` (11px), `--tracking-label`, samt eventuelle manglende semantiske farger som trengs for å erstatte hardkodede verdier (f.eks. `--overlay-scrim`, `--canvas-checker`, `--on-media`). Paletten selv endres ikke.

## 3. Skjerm for skjerm (bare markup/stil)
1. **Sceneeditoren:** `SceneEditorWorkspace` verktøylinje → `Toolbar overflow="menu"` med grupper (verktøy, lag, avspilling, eksport), én primær («Eksporter» eller dagens viktigste). `StackedPanels`-hodet → `PanelHeader` (toggleTitle + flytt opp/ned som `IconButton`). `PagesPanel`, `CreditsPanel`, `TextMenu`, `SceneAssetsPanel`, `LayerInspector`: egne `h2/h3` → `PanelHeader`.
2. **Monteringen:** verktøylinjen til 32 px, ikonknapper → `IconButton`. `AssemblyMoreMenu/ViewMenu/TextMenu` beholdes; `overflow` forblir `wrap` her (manuell «Mer» finnes). Panelhoder i `ClipPanel`, `AudioClipPanel`, `ScriptChanges` → `PanelHeader`.
3. **Manuset:** `ScriptWorkspace` verktøylinje → grupper + separatorer; `NotesPanel`, `WritingPanel`, `VersionsDialog`-hoder → `PanelHeader`. Hurtigtastene Alt+Shift+R/N/F vises i verktøytipsene.
4. **Biblioteket:** `LibraryWorkspace` verktøylinje → `Toolbar`; `AssetDetail`, `ContinuityPanel`, `GenerateImagePanel` hoder → `PanelHeader`; ikonknapper → `IconButton`.
5. **Story Lab:** bruker allerede delene; ensretter høyde, bytter ikonknapper til `IconButton`, fjerner egne h2-stiler i `StoryLabWorkspace`/`ConversationView`.
6. **Prosjektoversikten:** innfører `Toolbar` øverst og `PanelHeader` på seksjonene (`DurationOverview`, `StyleGuideSection` m.fl.) i stedet for egne `h2`.
7. **Utgivelsen:** `PosterWorkspace` verktøylinje og `PosterInspector`-hoder ensrettes; én primær.
8. **Asset Studio:** `AssetStudio`, `VariantStrip`, `StudioScript` – ikonknapper → `IconButton`, høyde 32 px.
9. **MTS-panelene:** `TextInspector`, `PagesPanel`, `CreditsPanel`, `LayerMotion` – hoder → `PanelHeader`.

Overskriftsnivå (`h2`/`h3`) beholdes per sted via `as`, så skjermleserstruktur er uendret.

## 4. Hardkodede farger (pekes på, byttes til tokens)
Flest: `library/ImageViewer.tsx` (17), `release/PosterCanvas.tsx` (10), `mobile/MobilePage.tsx` (8), `library/ImageLightbox.tsx` (8), `library/CutoutDialog.tsx` (5), `scene-editor/TextInspector.tsx`, `Stage.tsx`, `PreviewWindow.tsx` (4 hver), `script/ScriptPageView.tsx` (3), og 1–2 i ca. 15 andre filer (full liste i oppstarten av byggingen).
Unntak som **ikke** byttes: farger som er brukerinnhold eller eksportdata (plakatens/tekstlagets valgte farger, QR-kode svart/hvitt, papirhvit manusside hvis den er utskriftsnær) — disse er data, ikke tema. Hvert unntak listes i svaret.

## 5. Tester som berøres
- Mål: ingen testendringer. Alle `data-testid`, tekster, roller og navn beholdes; `aria-label` settes til samme tekst som før.
- `tests/visual/scene-panels-ui.mjs` bruker ett `title`-oppslag: `title` beholdes på den knappen, så testen er uendret.
- `screens.mjs`, `verifisering3/4-ui.mjs`, `interactions-e2e.mjs`, `export-e2e.mjs` tar skjermbilder/målinger; pikselreferanser (hvis noen sammenlignes) vil endre seg. Hvis det skjer, rapporteres hvilke bilder som må fornyes — de fornyes ikke uten godkjenning.
- «Mer …» på sceneeditoren slår bare inn under testbredden (1280 px), så ingen knapp flytter i eksisterende tester.
- Nye unit-tester: `tests/unit/u2-toolbar-overflow.test.ts` (ren fordelingsfunksjon `planToolbarOverflow(widths, available, priorities)` i `src/app/shell/`), og én test for maks én primær. Ny nettlesertest `tests/visual/u2-chrome-ui.mjs`: høyde 32 px på alle verktøylinjer, verktøytips med hurtigtast ved fokus, «Mer …» ved 900 px, fokusring synlig, kontrastsjekk AA på tekst i hoder.

## 6. Risikoer
- Radix Tooltip legger til wrapper/portal: kan endre `:first-child`-selektorer (f.eks. `[&>section:first-child>h2]` i `StackedPanels`). Sjekkes per sted.
- Fast 32 px høyde kan klippe innhold som i dag bryter (lange norske tekster). Derfor `wrap` som standard og `menu` bare der planen sier det.
- Tekst-tertiær på `surface-2` må måles mot AA (4,5:1) når handlingene ikke lenger dempes.
- Stor flate (≈ 60 filer): gjøres skjerm for skjerm med tsc/vitest/i18n etter hver skjerm.
- Tilfeldige lokale stiler (`text-[11px]` o.l.) i innhold — ikke verktøylinjer/hoder — røres ikke i denne runden.

## Åpne spørsmål
1. Hvilken knapp er primærhandling på hver skjerm? Forslag: Sceneeditor «Eksporter», montering «Eksporter animatic», manus «Ny scene», bibliotek «Ny ressurs», Story Lab «Send», prosjekt «Åpne manus», utgivelse «Eksporter plakat», Asset Studio «Lagre», MTS ingen.
2. Skal «Mer …» automatisk også brukes i manusets og bibliotekets verktøylinjer, eller bare i sceneeditoren?
3. Godtas at pikselreferanser i skjermbildetestene fornyes etter godkjenning, hvis de finnes?
