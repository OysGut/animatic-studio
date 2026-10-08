# Designsystem – Animatic Studio

> **Status: Teknisk anbefaling – foreløpig, skal valideres med skjermbilder og med Trollfilm.**
> Grunnlag: mandat 1.3, 12.2, 30.1–30.3; DEC-0017 (mørkt tema som standard – *Midlertidig antakelse*, OPEN_QUESTIONS Q-02); krav REQ-0011–REQ-0014, REQ-0184–REQ-0187, REQ-0424–REQ-0431.
> Eier: skillen `design-system-director`. Interaksjon og arbeidsflyt: `docs/design/UX_PRINCIPLES.md` og skillen `ux-interaction-design`. Komponentoversikt: `docs/design/COMPONENT_INVENTORY.md`.
> Ingen verdi her er et produktkrav. Verdiene kan endres med ny DEC når skjermbilder eller Trollfilm viser at de ikke fungerer.

## 1. Visuell retning

**Filmatisk, rolig, presis.** Grensesnittet er en mørk, nøytral arbeidsflate der *materialet* (manus, bilder, film) er det mest fargerike på skjermen. Krom (paneler, knapper, rammer) trer tilbake.

- **Inspirasjon, ikke kopi:** profesjonelle klipp- og fargeprogrammer (tett informasjon, mørke paneler, presise tidslinjer, monospace-tidskoder, diskré aksentfarge). Vi kopierer ikke layout, ikoner, navn eller fargepaletter fra bestemte produkter.
- **Tre lag med lyshet:** app-bakgrunn (mørkest) → paneler → hevede flater/inndatafelt. Dybde vises med lyshet og 1 px linjer, ikke med skygger og gradienter.
- **Én aksentfarge** for interaksjon (valg, fokus, primærhandling). Statusfarger brukes bare for status – aldri som pynt.
- **Manus ser ut som manus** (mandat 4.2, 6.3): manusvisningen bruker manusfont og manusformatering; teknisk metadata ligger i egne paneler/moduser.
- **Ikke** et leketøy eller en AI-demo (REQ-0426): ingen glødende gradienter, ingen «gnist»-ikoner som dekor, ingen store illustrasjoner, ingen kortgrid-dashbord som standardvisning. Se `.claude/skills/design-system-director/references/ANTI_PATTERNS.md`.

## 2. Fargetokens (mørkt tema)

Alle farger brukes via **semantiske tokens** (CSS-variabler, eksponert i Tailwind-temaet). Komponenter bruker aldri rå heksverdier eller Tailwinds standardpalett (`bg-zinc-800`, `text-blue-500`). Navnene under er forslag; endelig navngivning tilpasses `components.json`/Tailwind-oppsettet som Lovable genererer (verifiseres fra repoet).

### 2.1 Flater og linjer

| Token | Verdi | Bruk |
|---|---|---|
| `--bg-app` | `#0F1012` | Bakgrunn bak paneler, tom arbeidsflate |
| `--surface-1` | `#16171A` | Paneler (manus, bibliotek, inspektør, tidslinje) |
| `--surface-2` | `#1D1F23` | Panelhoder, verktøylinjer, menyer, dialoger |
| `--surface-3` | `#25282D` | Inndatafelt, hover, valgte rader uten fokus |
| `--border-subtle` | `#2B2E34` | Skillelinjer mellom paneler og rader (dekorativ) |
| `--border-strong` | `#41454D` | Panelkanter, gruppering |
| `--border-control` | `#70757F` | Kanter som *identifiserer* en kontroll (inndatafelt, avkrysning) – ≥ 3:1 mot alle flater (WCAG 1.4.11) |
| `--overlay-scrim` | `rgb(0 0 0 / 0.55)` | Bak modale dialoger |

### 2.2 Tekst

| Token | Verdi | Kontrast mot bg-app / surface-1 / surface-2 / surface-3 |
|---|---|---|
| `--text-primary` | `#E6E7EA` | 15,4 / 14,5 / 13,4 / 12,0 |
| `--text-secondary` | `#AEB2B9` | 9,0 / 8,4 / 7,8 / 7,0 |
| `--text-tertiary` | `#8E939C` | 6,2 / 5,8 / 5,4 / 4,8 |
| `--text-disabled` | `#5D626B` | 3,1 / 2,9 / 2,7 / 2,4 – kun deaktiverte kontroller (unntatt i WCAG 1.4.3); aldri for informasjon |

Alle teksttokens unntatt `--text-disabled` oppfyller WCAG AA for normal tekst (≥ 4,5:1) på alle fire flater. Kontrastene er beregnet med WCAG 2.x-formelen (relativ luminans) 2026-10-08.

### 2.3 Interaksjon

| Token | Verdi | Bruk | Kontrast (bg-app → surface-3) |
|---|---|---|---|
| `--accent` | `#4FB8C6` | Primærknapp, valgt element, aktiv fane-markør, lenker | 8,2 → 6,3 |
| `--accent-fg` | `#0B1416` | Tekst/ikon *på* aksentflate | 8,0 mot `--accent` |
| `--accent-selection` | `rgb(79 184 198 / 0.22)` | Bakgrunn for valgte rader/klipp | – |
| `--focus-ring` | `#7FD3DE` | Fokusring 2 px + 2 px avstand | 11,1 → 8,6 |
| `--playhead` | `#E6E7EA` linje + `--accent` hode | Avspillingshode i alle tidslinjer | – |

Aksenten er bevisst en dempet blågrønn: den kolliderer ikke med de reserverte kamerafargene (blå/rød, §2.5) eller med statusfargene.

### 2.4 Status (jobbstatus, avvik, usikkerhet)

Status vises **alltid med ikon + tekst**, aldri bare farge (WCAG 1.4.1).

| Token | Verdi | Kontrast (bg-app → surface-3) | Brukes for |
|---|---|---|---|
| `--status-neutral` | `#AEB2B9` | 9,0 → 7,0 | Venter, Stoppet/avbrutt, Deaktivert |
| `--status-running` | `#6FA8F5` | 7,8 → 6,1 | Klargjøres, Genereres, Etterbehandles (mandat 20.3) |
| `--status-success` | `#5CC27E` | 8,6 → 6,7 | Fullført, Godkjent, «Aktiv versjon» |
| `--status-danger` | `#F27272` | 6,7 → 5,2 | Mislykket, feil, destruktiv handling i dialog |
| `--status-discrepancy` | `#F0904A` | 8,0 → 6,2 | Åpent avvik (mandat 21.4) – egen farge fordi avvik er et kjernebegrep |
| `--status-uncertain` | `#E5B54A` | 10,0 → 7,8 | Usikker tolkning/estimat, oversettelse `needs_review`, usikker konsekvens (REQ-0058, REQ-0110, REQ-0314) |
| `--status-*-bg` | samme farge, 14 % alfa | – | Bakgrunn for merkelapper/rader; tekst på dem bruker `--text-primary` |

Kobling til modell: `GenerationJob.status` (`queued`→neutral, `preparing`/`generating`/`post_processing`→running, `completed`→success, `failed`→danger, `cancelled`→neutral) og `Discrepancy.resolution` (`open`→discrepancy, `accepted`/`updated`/`reverted`→success med ulik tekst).

### 2.5 Reserverte redigeringsfarger (mandat 12.2)

| Token | Verdi | Regel |
|---|---|---|
| `--camera-start` | `#3D8BFF` | Kameraets startramme, ~1 px kontur (REQ-0185, REQ-0186) |
| `--camera-end` | `#FF4545` | Kameraets sluttramme, ~1 px kontur |
| `--camera-path` | `#E6E7EA` 70 % | Bevegelsesbane og håndtak |

- Fargene brukes **bare** i sceneeditorens lerret (og forklaringer av det). De brukes ikke som status- eller aksentfarger andre steder.
- Rammene tegnes i et eget hjelpelag som aldri går til eksport (REQ-0187). De skal tegnes med `1 / devicePixelRatio` CSS-px slik at de er ~1 fysisk piksel på Retina-skjermer – avklares med Trollfilm om «1 piksel» betyr fysisk eller logisk piksel.
- Mot mellomgrå kunstverk har både blå og rød ramme lav luminanskontrast (~1,2:1). Forslag som må testes med ekte scener: valgfri 1 px mørk halo (`rgb(0 0 0 / 0.6)`) utenfor konturen, slått på som standard. Må ikke gjøre rammen tykkere enn mandatet tillater.

### 2.6 Manusvisning
| Token | Verdi | Merknad |
|---|---|---|
| `--script-paper` | `#1A1B1E` | Mørk «side» som standard (DEC-0017) |
| `--script-ink` | `#DCDDE0` | 12,7:1 mot mørk side |
| `--script-paper-light` | `#E9E6DF` | Valgfri lys sidevisning (papirlik korrektur), ikke et fullt lyst tema |
| `--script-ink-light` | `#1B1B1B` | 13,8:1 mot lys side |

Om lys sidevisning trengs avklares sammen med Q-02 (lyst tema).

## 3. Typografi

| Rolle | Font | Merknad |
|---|---|---|
| UI | **Inter** (variabel, SIL OFL 1.1) | Tabulære tall (`font-variant-numeric: tabular-nums`) i alle tall-kolonner |
| Tidskoder, ID-er, tekniske verdier | **JetBrains Mono** (SIL OFL 1.1) | Tidskoder `HH:MM:SS:FF` alltid monospace |
| Manus | **Courier Prime** (SIL OFL 1.1), fallback `"Courier New", Courier, monospace` | 12 pt, 10 tegn per tomme; paginering etter ADR-0007 |

- Fonter selvhostes (pakkes med appen, f.eks. via `@fontsource/*` – lisens og pakkenavn verifiseres ved installasjon). Ingen runtime-henting fra tredjeparts CDN.
- Courier Prime er laget for å ha Courier-metrikk; **dette må verifiseres** med de gyldne pagineringstestene mot referansemanuset før den brukes i paginering. Hvis metrikk avviker, pagineres det med Courier-metrikk og Courier Prime brukes bare til visning.

**Skala (UI, px / linjehøyde):** `11/16` (merkelapper, tidslinjelinjal) · `12/16` (sekundær, tabeller) · **`13/20` (standard UI)** · `14/20` (panelinnhold med lesetekst) · `16/24` (seksjonstitler) · `20/28` (dialogtitler) · `24/32` (sidetitler i prosjektoversikt). Vekter: 400, 500, 600. Ingen tekst under 11 px. Store bokstaver bare i korte merkelapper (≤ 2 ord) med `letter-spacing: 0.04em`.

## 4. Avstand, størrelser og tetthet

- **Grunnenhet 4 px.** Skala: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48`. Bare disse verdiene.
- **Tetthet:** `kompakt` (standard i tidslinje, lister, inspektør: radhøyde 24 px, kontrollhøyde 24 px) og `komfortabel` (dialoger, prosjektoversikt, innstillinger: radhøyde 32 px, kontrollhøyde 32 px).
- **Minste trefflate:** 24 × 24 px (WCAG 2.2 SC 2.5.8). Tidslinjehåndtak (trim-kanter) har usynlig trefflate på minst 8 px bredde selv om den synlige kanten er 2 px.
- **Paneler:** innvendig marg 12 px (kompakt) / 16 px (komfortabel); panelhode 32 px.
- **Minste arbeidsflatebredde:** 1280 px (store skjermer først; se UX_PRINCIPLES.md).

## 5. Radier, linjer og skygger
- Radier: `--radius-xs 2px` (klipp på tidslinje, merkelapper), `--radius-sm 4px` (knapper, felt), `--radius-md 6px` (menyer, popovere), `--radius-lg 8px` (dialoger). Paneler i arbeidsflaten har radius 0 – de møtes med 1 px linje.
- Skygger bare på flytende lag (menyer, popovere, dialoger, dra-forhåndsvisning): én skygge `0 8px 24px rgb(0 0 0 / 0.45)`.
- Ingen gradienter i krom. Ingen «glass»-uskarphet.

## 6. Ikoner
- **Én ikonfamilie: Lucide** (ISC-lisens; standard i shadcn/ui-oppsett – verifiseres i det genererte repoet). Linjeikoner, strek 1,5 px, størrelse 16 px i kompakt UI og 20 px i verktøylinjer.
- Ingen blanding med andre ikonsett. Mangler et ikon, tegnes et eget i samme rutenett (24-grid, 1,5 strek) og legges i `src/app/design/icons/`.
- Ikonknapper uten tekst har alltid `aria-label` og verktøytips med snarvei.
- Faste betydninger (eksempler): avvik = trekant med utropstegn i `--status-discrepancy`; usikker = sirkel med spørsmålstegn i `--status-uncertain`; kostnad = mynt; AI-generering = egen nøytral glyf (ikke «gnister»).

## 7. Bevegelse
| Token | Verdi | Bruk |
|---|---|---|
| `--motion-instant` | 0 ms | Valg, avspillingshode, scrubbing, snapping – alltid umiddelbart |
| `--motion-fast` | 80 ms | Hover, trykk |
| `--motion-base` | 140 ms | Menyer, popovere, panel kollaps |
| `--motion-slow` | 220 ms | Dialoger, varsler inn/ut |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Inn/endring |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Ut |

- `prefers-reduced-motion: reduce` → alle ikke-nødvendige overganger blir 0 ms (tilstand vises direkte). Avspilling av film påvirkes selvsagt ikke.
- Bevegelse forklarer tilstandsendring (hvor noe kom fra/gikk); aldri dekor, aldri sprett/overskyting, aldri pulserende elementer unntatt én diskré indikator for kjørende jobb.

## 8. Implementering (veiledende)
- Tokens defineres i én fil (forslag `src/app/design/tokens.css`) og kobles til Tailwind-temaet; shadcn/ui-komponenter tilpasses tokens, ikke omvendt.
- Komponenter har tilstander: standard, hover, aktiv, fokus (synlig ring), valgt, deaktivert, laster, feil – og der relevant: avvik, usikker, låst av annen bruker.
- Visuell QA med Playwright-skjermbilder: se `.claude/skills/design-system-director/references/VISUAL_QA.md`.

## 9. Åpne punkter (valideres)
1. Mørkt tema som eneste tema? (DEC-0017 / Q-02)
2. Kamerarammer: fysisk vs. logisk piksel og behov for halo (Trollfilm).
3. Courier Prime-metrikk mot Final Draft-paginering (gyldne tester).
4. Aksentfargen vurderes mot ekte manus- og scenemateriale i skjermbilder.
