# U2 – felles verktøylinjer og panelhoder (Premiere/DaVinci-stil)

Ren UI-jobb. Ingen endring i logikk, tilstand, hendelser, ruter, tekster, `L()`, `data-testid`, `aria-*`, `role` eller `title`. Bare tokens fra `src/styles.css`. Ingen pakker, ingen database.

## Hvor komponentene skal ligge: `src/app/shell/workspace-chrome.tsx`

Begrunnelse: `src/components/ui/` er shadcn-mappen, og filene der genereres og byttes ut av verktøyet. Verktøylinjen og panelhodet er appens eget skall-språk, på linje med `AppHeader`, `ProjectNav` og `pane-size`, som allerede ligger i `src/app/shell/`. Én fil med fire eksporter holder importene enkle.

## Komponent-API

```text
Toolbar
  title?: ReactNode            tittel til venstre (13px, medium, text-primary)
  status?: ReactNode           høyrestilt område (ml-auto), f.eks. «Lagret»
  children: ReactNode          gruppene
  className?: string           tillegg (sammenslått med cn)
  ...rest: HTMLAttributes<div> sendes videre (data-testid, aria-label, role hvis noen finnes i dag)
  Utseende: min-h-10, flex flex-wrap items-center gap-x-2 gap-y-1, px-3 py-1,
            bg-surface-2, border-b border-border, shrink-0

ToolbarGroup
  children; className?        flex items-center gap-1 (hjelper, ingen rolle)

ToolbarSeparator
  ingen props                 <div aria-hidden className="mx-1 h-5 w-px bg-border-strong" />
                              (samme DOM som dagens skillelinje, bare token byttes)

ToolbarButton  = forwardRef<HTMLButtonElement, ButtonHTMLAttributes & {
  variant?: "icon" | "default" | "primary"   (standard "default")
  active?: boolean            visuell «på»-tilstand (bruker aria-pressed bare hvis kallstedet allerede gir det)
  asChild?: boolean           for steder der knappen i dag er en <Link> eller DropdownMenuTrigger
}>
  Alltid en ekte <button type="button"> (eller Slot ved asChild), så rolle og tilgjengelig navn blir som i dag.
  title/aria-label/onClick/disabled sendes uendret videre.
  Felles: h-7 rounded-sm text-[13px] inline-flex items-center gap-1.5, [&_svg]:size-4,
          focus-visible:ring-1 ring-focus-ring, disabled:opacity-40 cursor-not-allowed,
          transition-colors var(--motion-fast)
  icon:    size-7 justify-center text-text-secondary hover:bg-surface-3 hover:text-text-primary
  default: px-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary
  primary: px-3 bg-accent-brand text-accent-fg font-medium hover:bg-accent-brand/90
  active:  bg-accent-selection text-text-primary

PanelHeader
  title: ReactNode
  as?: "h2" | "h3"            beholder dagens overskriftsnivå per panel (standard "h2")
  count?: ReactNode           tall/badge etter tittelen (font-mono tabular-nums text-text-tertiary)
  collapse?: { open: boolean; onToggle: () => void; label: string }   pil til venstre
  actions?: ReactNode         knapper til høyre (opacity-60, opacity-100 ved group-hover/focus-within)
  className?, ...rest         data-testid o.l. videre
  Utseende: h-8 flex items-center gap-1.5 px-2 bg-surface-2 border-b border-border group,
            tittel: text-[11px] font-medium uppercase tracking-wider text-text-tertiary truncate
```

Viktig: Der en sammenleggingsknapp eller tittel i dag er selve `<button>` (eller har `aria-expanded`), sendes eksisterende knapp/attributter inn uendret via `title`/`collapse` slik at rolle og navn ikke endres. Der et panel bruker `<h2>`/`<h3>` i dag, beholdes samme nivå.

## Primærhandling per arbeidsområde (forslag)

| Arbeidsområde | Primær | Merknad |
|---|---|---|
| Manus | «Importer manus …» bare når manuset er tomt; ellers ingen | spørsmål: ellers «Eksporter …»? |
| Ressursbibliotek | «Last opp …» / «Ny ressurs» | spørsmål: hvilken av dem finnes på verktøylinjen |
| Sceneeditor | ingen fast; evt. «Spill av» er allerede fremhevet i tidslinjen | spørsmål |
| Montering | «Eksporter animatic …» | |
| Utgivelse | «Eksporter plakat …» | |

Bare utseendet endres – samme knapp, samme handling, samme navn.

## Delsteg

**U2a – komponentene + Manus**
- NY `src/app/shell/workspace-chrome.tsx`
- `src/app/script/ScriptWorkspace.tsx` (verktøylinjen, linje ca. 678)
- `src/app/script/Inspector.tsx` (`Section`-hodet)
- `src/app/script/SceneNavigator.tsx` (panelhodet «Scener»)
- `src/app/script/TranslationPanel.tsx`, `src/app/script/NotesPanel.tsx` (panelhoder, hvis de har hode)

**U2b – Ressursbibliotek**
- `src/app/library/LibraryWorkspace.tsx` (verktøylinjen ca. 261, filterhodene ca. 437/525)
- `src/app/library/AssetDetail.tsx`, `src/app/library/ContinuityPanel.tsx` (panelhoder)

**U2c – Sceneeditor**
- `src/app/scene-editor/SceneEditorWorkspace.tsx` (verktøylinjen ca. 618)
- `src/app/scene-editor/ScenePanels.tsx` (panelhodene ca. 235 og 359 med opp/ned-pilene → `actions`)
- `LayersPanel.tsx`, `SceneAssetsPanel.tsx`, `SceneScriptPanel.tsx`, `NearbyAudioPanel.tsx`
- `inspector-fields.tsx` (`Section`), `CameraPanel.tsx` (egen `Section`), `LayerEvents.tsx`

**U2d – Montering**
- `src/app/assembly/AssemblyWorkspace.tsx` (verktøylinjen ca. 903)
- `src/app/assembly/AssemblyToolbarMenus.tsx` (knappene i menyene → `ToolbarButton asChild`)
- `src/app/assembly/ClipPanel.tsx`, `ClipParts.tsx`, `TechnicalSection.tsx` (panelhoder)

**U2e – Utgivelse**
- `src/app/release/PosterWorkspace.tsx` (verktøylinjen ca. 384, sidepanelhodene ca. 541/700)
- `src/app/release/PosterInspector.tsx` (`Section`)

Anslag: 1 ny fil + ca. 25 endrede filer totalt (U2a 5–6, U2b 3, U2c 9, U2d 4, U2e 2). Etter hvert delsteg: `npx tsc --noEmit`, enhetstestene som importerer de berørte filene, og ett skjermbilde av arbeidsområdet.

## Det jeg ikke rører

Dialoger (`*Dialog.tsx`), kontoside, admin, mobil, prosjektoversikt, `AppHeader`, `ProjectNav`, tidslinjene (U3), shadcn-filene i `src/components/ui/`.

## Spørsmål

1. **Bryting:** Verktøylinjene har i dag fast `h-10` uten `flex-wrap` (de bryter altså ikke nå). Er det greit at `Toolbar` får `min-h-10` + `flex-wrap`, slik at de kan bli to linjer på smale skjermer? Det endrer høyden på smale skjermer.
2. **shadcn-`Button` i verktøylinjene:** Ca. 48 `Button` står i de fem verktøylinjene. Jeg foreslår å bytte dem til `ToolbarButton` (fortsatt `<button>`, samme navn). Alternativ: beholde `Button` og bare gi den klasser. Hvilket vil du ha?
3. **Tittel til venstre:** I Manus står produksjonsvelgeren der i dag. Skal arbeidsområdets navn («Manus») legges til som ny tekst (krever nye `L()`-tekster, som reglene forbyr), eller skal dagens første element (produksjonsnavn/velger) regnes som tittel? Jeg foreslår det siste – ingen nye tekster.
4. **«Lagret»-status:** Hvor den finnes i dag, flyttes den til `status`-plassen. Der den ikke finnes, legges ingen ny tekst til. OK?
5. **Primærhandling** i Manus (når manuset ikke er tomt), Bibliotek og Sceneeditor – se tabellen.
6. **Nivå på overskrifter:** Noen paneler bruker `<h2>`, andre `<h3>` eller `<span>`. Jeg beholder dagens element per panel så skjermlesere og tester ikke merker forskjell. OK?
