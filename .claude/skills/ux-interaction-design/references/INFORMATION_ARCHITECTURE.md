# Informasjonsarkitektur – forslag

**Status: Teknisk anbefaling – foreløpig, valideres med skjermbilder og Trollfilm.** Svarer på mandat 30.2 (REQ-0427–REQ-0429): de 14 funksjonsområdene er moduler, ikke 14 faner. Forslaget samler dem i **fem arbeidsflater** pluss globale paneler.

## 1. Rammen rundt alt (AppShell)
- **Toppfelt:** prosjektnavn · **produksjonsvelger** (hovedfilm/spinoff/trailer …) · språkversjon · arbeidsflatevelger · presence · jobbindikator · avviksteller · brukermeny.
- **Statuslinje (bunn):** lagringsstatus/tilkobling, bildefrekvens, avspillingshodets tidskode, valgt objekt.
- **Globale paneler** som kan åpnes fra alle arbeidsflater: Jobbkø, Avvik, Historikk, Ressursbibliotek (som sidepanel), Kommandopalett.

## 2. Arbeidsflater

| # | Arbeidsflate (norsk navn) | Hovedinnhold | Mandatområder (30.2) som samles her |
|---|---|---|---|
| 1 | **Prosjekt** | Prosjektoversikt/Produksjonsoversikt (varighet, status, avvik, kostnad, filtre), produksjoner og spinoffer, medlemmer | 1 Prosjektoversikt · 2 Produksjonsvelger (også i toppfelt) · 14 Prosjektinnstillinger (egen underside) |
| 2 | **Manus** | Manusvisning + scenenavigator + valgfritt metadatapanel + original-PDF ved siden av + kontinuitetsvisning per karakter | 3 Manus · 5 Karakterkontinuitet (panel) |
| 3 | **Sceneeditor** | Lerret med lag, kamera og bane, scenens tidslinje (nøkkelbilder, lyd), inspektør, ressurser som sidepanel, «Generer scene» med prompt og kostnad | 6 Sceneeditor · 7 Kamera og tidslinje · 8 Lyd og dialog (scenenivå) · 9 AI-generering (panel/dialog) · 4 Ressursbibliotek (sidepanel) |
| 4 | **Montering** (Filmtidslinje) | Viewer + filmtidslinje + manus side ved side; takes/«Bruk denne»; lyd-/dialogspor | 11 Overordnet filmmontering · 8 Lyd og dialog (filmnivå) · 3 Manus (synkvisning) |
| 5 | **Utgivelse** | Eksport (manus, film, språk), eksportkontroll med avvik, plakater og presentasjoner | 13 Eksport · 12 Plakater og presentasjoner |
| – | Globale paneler | Jobbkø, Avvik, Historikk, Ressursbibliotek (fullvisning ved behov) | 10 Renderingskø · 4 Ressursbibliotek |

Begrunnelse: brukeren arbeider i fire modi – *planlegge* (Prosjekt), *skrive* (Manus), *lage* (Sceneeditor), *sette sammen* (Montering) – og av og til *levere* (Utgivelse). Kø, avvik og bibliotek trengs fra alle modi og er derfor paneler, ikke steder man må gå til.

## 3. Kobling UI-område ↔ modul ↔ kode

| Arbeidsflate / panel | Mandatmoduler (kap. 31, `MODULES` i kb_lib) | Kode (forslag, jf. ARCHITECTURE.md §2) |
|---|---|---|
| Prosjekt | CORE, VERSION, QUALITYCOST, COLLAB, UI | `src/app/project/`, `core/model`, `core/cost` |
| Manus | SCRIPT, CONTINUITY, L10N, VERSION | `src/app/script/`, `core/screenplay`, `core/continuity`, `engine/import` |
| Sceneeditor | COMPOSE, CAMERA, AUDIO, LIBRARY, PROMPT, QUALITYCOST | `src/app/scene-editor/`, `core/composition`, `core/camera`, `core/prompt`, `engine/compositor` |
| Montering | TIMELINE, AUDIO, VERSION, SCRIPT | `src/app/timeline/`, `core/timeline`, `engine/audio` |
| Utgivelse | EXPORT, PRESENT, L10N | `src/app/publish/`, `core/export`, `core/poster`, `engine/export` |
| Jobbkø (panel) | QUEUE, QUALITYCOST, PROVIDER | `src/app/queue/`, tabeller `generation_jobs`/`render_jobs` |
| Avvik (panel) | VERSION | `src/app/discrepancies/`, `core/impact` |
| Historikk (panel) | VERSION, COLLAB | `src/app/history/`, `change_log` |
| Ressursbibliotek (panel) | LIBRARY, CONTINUITY | `src/app/library/`, `core/resources` |
| Innstillinger | SECURITY, COLLAB, QUALITYCOST | `src/app/settings/` |

URL-er bruker ID-er (INV-02), f.eks. `/p/<projectId>/prod/<productionId>/script?occurrence=<occurrenceId>`.

## 4. Oppgavetelling (mål – oppdateres når flyter bygges)

| Oppgave | Mål | Hvordan |
|---|---|---|
| Finn en scene | ≤ 2 handlinger | `Mod+K` → skriv nummer/navn/karakter → Enter |
| Flytt en scene | 1 dra eller 2 taster | Dra i navigator/tidslinje, eller `Alt+←/→` |
| Spill av fra en replikk | 1 klikk / `Mod+Enter` | I manus |
| Velg aktiv versjon | 2 | Åpne takes på scenen → «Bruk denne» |
| Løs et avvik | 2–3 | Klikk avviksmarkør → velg ett av tre valg → (bekreft kostnad ved regenerering) |
| Se hva som er ferdig etter natten | 0–1 | Oppsummering ved åpning / Jobbkø-panel |
| Deaktiver en scene | 1–2 | `Shift+D` eller kontekstmeny |

## 5. Åpne spørsmål
- Er fem arbeidsflater riktig inndeling for Trollfilms arbeidsmåte (f.eks. egen «Lyd»-flate)?
- Skal Utgivelse være egen flate eller dialoger fra Prosjekt?
- Rekkefølge og navn på arbeidsflatene i velgeren (norske navn fra mandat 30.3 brukes der de finnes: «Manus», «Sceneeditor», «Filmtidslinje», «Produksjonsoversikt»). «Montering» kan erstattes av «Filmtidslinje» hvis Trollfilm foretrekker det.
