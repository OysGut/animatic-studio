# U3a – Tidslinjen som et klippeprogram (bare utseende)

Eneste fil: `src/app/scene-editor/Timeline.tsx`. Bare `className`-strenger, pluss de få rene presentasjonselementene som er merket nedenfor. Bare tokens fra `src/styles.css`.

## Endringer, element for element

### 1. Sporhoder
- **Lagrad, hode (l. 370–375):**
  - `bg-surface-1` blir `bg-surface-2` (også når sporet ikke er valgt).
  - `border-border` blir `border-border-strong`.
  - Tekstfargen er `text-text-secondary`, og `text-text-primary` når sporet er valgt (som i dag).
  - Valgt hode får i tillegg `shadow-[inset_2px_0_0_var(--accent-brand)]` som en tynn markeringsstripe til venstre.
  - `paddingLeft` for lag i gruppe beholdes uendret.
- **Kamerarad, hode (l. 1299):** samme endring (`bg-surface-2`, `border-border-strong`). Ikonet beholdes.
- **«Spor»-cellen i linjalen (l. 1266):** `bg-surface-2` og `border-border-strong`.
- **Høyde:** alle rader bruker allerede `ROW_H`, så den er lik og røres ikke.
- **Merk:** lagradene har i dag ikke noe ikon. Kamerasporet har ett. Jeg legger ikke til ikoner (se spørsmål nederst).

### 2. Baner
- **Skillelinjer (l. 367 og 1297):** `border-border/60` blir `border-border`.
- **Valgt bane:** `bg-accent-selection` beholdes. Den ligger allerede på hele raden, og sporhodet dekker over sin del.
- **Annenhver bakgrunn – krever godkjenning:** se avsnittet nederst.

### 3. Tidslinjal
- **Linjalstripen (l. 1264):** `bg-surface-1` blir `bg-surface-2`.
- **Hovedmerker (l. 203):**
  - `border-border-control` beholdes.
  - Teksten får `font-mono tabular`. Fra før har den `text-[11px] text-text-tertiary`.
- **Mellommerker (l. 216):**
  - `border-border` blir `border-border-strong`, så de synes på `surface-2`.
  - Logikken for når de vises (bare ved 1 s-steg og ≥120 px per sekund) røres ikke.
- **Valgfritt – krever godkjenning:** mellommerker også ved andre steg, for eksempel 4–5 delstreker per hovedsteg. Det krever ny beregning i `RulerTicks`.

### 4. Klipp (kamerautsnitt, l. 294–311)
- `rounded-sm` og 1 px kant finnes fra før.
- Navnet (l. 310):
  - legger til `block` slik at `truncate` faktisk virker;
  - legger til `font-medium`;
  - står fortsatt til venstre.
- **Valgt klipp:**
  - I dag: `border-text-primary`.
  - Nytt: `ring-1 ring-focus-ring` i tillegg.
  - Aktivt utsnitt under avspillingshodet beholder `accent-warm` (DEC-0045). Det vinner som i dag.
- **Krever godkjenning:** klippet bruker i dag rå farger (`text-white/90`, `border-white/20` og en `oklch(...)`-gradient i `style`). Det bryter med regelen «bare tokens». Forslag:
  - gradient `var(--camera-start)` → `var(--camera-end)` med `color-mix` for gjennomsiktighet;
  - teksten blir `text-text-primary`;
  - kanten blir `border-border-strong`.
  - Gradienten ligger i `style`, ikke i `className`, og fargen på klippet endres litt. Derfor ber jeg om godkjenning.

### 5. Nøkkelbilder (l. 456–461)
- Diamanten får `border border-bg-app` (1 px mørk kant).
- Størrelse, rotasjon, posisjon og valgring er uendret.
- **Bildeskifte-merket (l. 418):** samme kant for samme synlighet.

### 6. Avspillingshodet
- **Linjen (l. 1370):** `bg-accent-brand` blir `bg-text-primary`.
- **Hodet i linjalen (l. 1290):**
  - beholder `bg-accent-brand`;
  - får `shadow-sm` og `ring-1 ring-bg-app`.
- Posisjonsberegningene (`left`) røres ikke.

### 7. Transportlinjen
- **Tidskoden (l. 1048):**
  - `text-xs` blir `text-[13px]`;
  - `font-mono tabular-nums` finnes fra før.
- **Knappene:**
  - `iconButton` (l. 148): `size-6` blir `size-7`. Hover er allerede felles (`hover:bg-surface-3 hover:text-text-primary`).
  - `iconButton` er eksportert. Hvis den brukes i andre filer, får knappene der også ny størrelse. Det sjekker jeg før endringen. Brukes den andre steder, legger jeg `size-7` bare på transportknappene i denne filen i stedet.
  - Knappen ved l. 1110 (`h-6`) blir `h-7`, så høyden blir lik.
  - Raden får `min-h-10` i stedet for `min-h-9`.

## Hva jeg ikke rører
- Logikk, tilstand, props, hendelser og beregninger for dra, zoom og posisjon, som `left`, `width`, `ROW_H`, `GUTTER`, `TRACK_X` og `TICK_STEPS`.
- `data-testid`, `aria-*`, `role`, `title`, tekster og `L()`-kall.
- DOM-rekkefølgen. Ingen nye elementer, bortsett fra det som er merket «krever godkjenning».
- Lydsporene (`audioRows`), som lages utenfor denne filen, og `PercentInput`/`ctl`.

## Krever godkjenning (mer enn klasseendringer)
1. **Annenhver bane:** Tailwind-varianten `even:` på raden er en ren klasseendring, men den teller også kameraraden, «Ingen lag»-teksten og lydsporene fra andre filer. Rytmen kan derfor bli ujevn. Det sikre alternativet er å sende `index` inn i `LayerRow`, men det er en ny prop.
   - Forslaget mitt: bruk `even:bg-surface-2/40` og godta at lydsporene kan bryte rytmen.
2. **Kamerautsnittets farger:** bytte fra rå farger til tokens (se punkt 4).
3. **Valgfrie mellommerker** i linjalen ved alle steg (punkt 3).

## Spørsmål
- Skal lagradene få et ikon til venstre, som kamerasporet har? Det er et nytt element, og ikonet må velges ut fra lagtypen (logikk). Jeg foreslår å la det være i U3a.

## Kontroll etter endringen
Kjøre `npx tsc --noEmit` og de eksisterende tidslinjetestene, og sjekke utseendet med et skjermbilde av sceneeditoren.
