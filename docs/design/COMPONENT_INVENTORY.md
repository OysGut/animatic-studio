# Komponentoversikt – Animatic Studio

> **Status: Teknisk anbefaling – foreløpig, skal valideres med skjermbilder og med Trollfilm.**
> Oversikt over planlagte UI-komponenter, hvilke krav og moduler de tjener, og status. Oppdateres av `design-system-director` (visuelt) og `ux-interaction-design` (oppførsel) når komponenter bygges.
> Status-verdier: **Planlagt** → **Under arbeid** → **Implementert – ikke verifisert** → **Verifisert** (krever test + godkjent skjermbilde, se `.claude/skills/design-system-director/references/VISUAL_QA.md`).
> Plassering (forslag): felles byggesteiner i `src/components/ui/` (shadcn/ui-baserte, tilpasset tokens); domenekomponenter i `src/app/<arbeidsflate>/`. Komponentene skriver aldri direkte til tabeller – de sender kommandoer via `src/adapters/storage` (ADR-0005).

## 1. Grunnkomponenter (designsystem)

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| Button / IconButton | Primær, sekundær, stille, destruktiv; ikonknapp med `aria-label` + verktøytips med snarvei | REQ-0424, REQ-0425 · UI | Planlagt |
| TextField, NumberField, TimecodeField | Inndata; tidskodefelt i `HH:MM:SS:FF` med bildefrekvens fra produksjonen | ADR-0006 · UI, TIMELINE | Planlagt |
| Select, Combobox, SegmentedControl | Valg; segmentert for få gjensidig utelukkende valg (f.eks. nummereringsmetode) | REQ-0080 · UI | Planlagt |
| Checkbox, Switch | Av/på (f.eks. automatisk rulling) | REQ-0101 · UI | Planlagt |
| Tooltip, Kbd | Verktøytips og visning av snarvei | UX P7 · UI | Planlagt |
| StatusBadge | Ikon + tekst + statusfarge for jobb, avvik, usikkerhet, aktiv versjon | REQ-0294, REQ-0315, REQ-0058 · UI, QUEUE, VERSION | Planlagt |
| Toast / InlineNotice | Kortvarige bekreftelser (med «Angre») og vedvarende meldinger i panel | REQ-0042, REQ-0299 · UI | Planlagt |
| EmptyState, LoadingState, ErrorState | Faste mønstre for tomme, lastende og feilende flater | UX P6, P12 · UI | Planlagt |
| ContextMenu, Menu, CommandPalette | Kontekstmenyer og søkbar kommandoliste (Cmd/Ctrl+K) | UX P7, P10 · UI | Planlagt |

## 2. Arbeidsflate og paneler

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| AppShell | Toppfelt (prosjekt, produksjon, språk, presence, jobbindikator), arbeidsflatevelger, statuslinje | REQ-0427–REQ-0429 · UI, COLLAB | Planlagt |
| ProductionSwitcher | Velg hovedfilm/spinoff/trailer og språkversjon | mandat 24, 23.3 · CORE, L10N | Planlagt |
| WorkspaceLayout | Panelrutenett med endre størrelse, kollaps og lagret oppsett per bruker; senere dokking | UX P15 · UI | Planlagt |
| Panel / PanelHeader | Felles panelramme med tittel, verktøy, tetthet | DESIGN_SYSTEM §4 · UI | Planlagt |
| Inspector | Egenskaper for valgt objekt (scene, klipp, lag, ressurs) | mandat 11, 15 · UI | Planlagt |
| PresenceAvatars / EditingIndicator | Hvem er i prosjektet og hvor; «redigeres av …» på objekt | REQ-0522, REQ-0526 · COLLAB | Planlagt |
| ConnectionStatus | Lagret / lagrer / frakoblet med ventende endringer | REQ-0410 · CORE | Planlagt |

## 3. Manus

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| ScriptView | Virtualisert, paginert manusvisning med manusformatering (Courier Prime), mørk side | REQ-0050–REQ-0052, REQ-0102 · SCRIPT | Planlagt |
| ScriptBlockEditor | Redigering av `ScriptBlock`/`DialogueLine` med element-type og korrekt ombrytning | REQ-0052, mandat 4.4 · SCRIPT | Planlagt |
| SceneHeadingGutter | Scenenummer i marg (visningsdata, aldri identitet), deaktivert-markering, avviksmarkør | INV-02, REQ-0315 · SCRIPT | Planlagt |
| SceneNavigator | Sceneliste med søk/filter (karakter, lokasjon, status); dra for å flytte (`MoveOccurrence`) | REQ-0073, REQ-0074, REQ-0228 · SCRIPT | Planlagt |
| UncertaintyMarker | Markerer usikker tolkning fra import med «Korriger» | REQ-0058, REQ-0059 · SCRIPT | Planlagt |
| ScriptMetadataPanel | Tidskoder, varighet, produksjonsmarkeringer – utenfor manuslayout | REQ-0103, REQ-0117 · SCRIPT, TIMELINE | Planlagt |
| OriginalDocumentViewer | Original PDF/DOCX ved siden av (skrivebeskyttet) | REQ-0053 · SCRIPT | Planlagt |
| ScriptVersionCompare | Sammenlign manusversjoner | mandat 5.1 · VERSION | Planlagt |

## 4. Tidslinje og avspilling

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| Viewer | Avspilling (Canvas2D/WebGL) med tidskode og transportkontroller | REQ-0225, ADR-0008 · TIMELINE, COMPOSE | Planlagt |
| TransportBar | Spill/pause, J/K/L, steg per bilde, inn/ut | UX P7 · TIMELINE | Planlagt |
| FilmTimeline | Filmtidslinje: scenerekke avledet fra sceneforekomster, spor for bilde/lyd/dialog | REQ-0216–REQ-0224, INV-01 · TIMELINE | Planlagt |
| TimelineRuler / Playhead | Linjal i bilder/tidskode, avspillingshode, zoom | ADR-0006 · TIMELINE | Planlagt |
| TimelineClip | Klipp med trim-håndtak, aktiv-versjon-merke, avviksmarkør | REQ-0220, REQ-0222, REQ-0231 · TIMELINE | Planlagt |
| TransitionHandle | Overganger mellom klipp | REQ-0223 · TIMELINE | Planlagt |
| ScriptSyncHighlighter | Markerer manuspassasje ved avspillingshodet; klikk på replikk flytter hodet | REQ-0097, REQ-0098 · SCRIPT, TIMELINE | Planlagt |
| TakePicker | Varianter/takes for scene med «Bruk denne» | REQ-0232–REQ-0234 · VERSION | Planlagt |

## 5. Sceneeditor og kamera

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| SceneCanvas | Lagbasert multiplan-lerret med zoom/pan | REQ-0168, REQ-0170 · COMPOSE | Planlagt |
| LayerPanel | Lag med dybde, synlighet, låsing, grupper | mandat 11.1 · COMPOSE | Planlagt |
| TransformGizmo | Flytt, skaler, roter direkte på lerretet | mandat 11.2 · COMPOSE | Planlagt |
| KeyframeTrack / CurveEditor | Nøkkelbilder per egenskap, easing og hastighetskurver | mandat 11.3, 12.5 · COMPOSE, CAMERA | Planlagt |
| CameraFrameOverlay | Blå startramme / rød sluttramme (~1 px), aldri i eksport | REQ-0184–REQ-0187 · CAMERA | Planlagt |
| CameraPathEditor | Bézier-baner med håndtak; dobbeltklikk veksler rett/kurvet | REQ-0190, REQ-0191 · CAMERA | Planlagt |
| ShotList | Flere kamerautsnitt/shots i scenen | mandat 12.4 · CAMERA | Planlagt |

## 6. Ressursbibliotek og kontinuitet

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| ResourceBrowser | Søk, kategorier, filtre; dra ressurs inn i scene | REQ-0124 · LIBRARY | Planlagt |
| ResourceCard / ResourceDetail | Ressurs med versjoner, aliaser, bruk i scener | mandat 8.2, INV-13 · LIBRARY | Planlagt |
| VersionHistoryList | Uforanderlige ressursversjoner; ny versjon bytter aldri automatisk | REQ-0132, REQ-0134 · LIBRARY, VERSION | Planlagt |
| CharacterVariantGrid | Utseende × stil for en karakter | mandat 9.1 · LIBRARY | Planlagt |
| ContinuityTimeline | Kontinuitetstilstander per karakter ordnet etter fortellingstid | REQ-0155, INV-09 · CONTINUITY | Planlagt |
| SuggestionReview | Godkjenn/avvis forslag (kontinuitet, språkkobling, ressurskobling) | REQ-0158, REQ-0335, REQ-0128 · CONTINUITY, L10N | Planlagt |

## 7. Jobbkø, kostnad og AI

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| JobQueuePanel | Jobber med status (mandat 20.3), fremdrift når pålitelig, prøv igjen/stopp | REQ-0290–REQ-0303 · QUEUE | Planlagt |
| JobIndicator | Liten indikator i toppfeltet med antall kjørende/feilede | REQ-0296 · QUEUE | Planlagt |
| CostEstimateDialog | Estimat med usikkerhet, budsjett, godkjenning av medlem med kostnadsrett | REQ-0279–REQ-0284, REQ-0528, INV-12 · QUALITYCOST | Planlagt |
| PromptInspector | Åpne, lese, redigere og lagre genereringsprompt; overstyring flagges | REQ-0250–REQ-0252 · PROMPT | Planlagt |
| CandidateCompare | Sammenlign kandidater/forsøk side ved side | REQ-0258, REQ-0285 · VERSION | Planlagt |

## 8. Avvik og versjoner

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| DiscrepancyMarker | Markør i manus, sceneeditor, tidslinje, oversikt, eksportkontroll | REQ-0315 · VERSION | Planlagt |
| DiscrepancyPanel | Liste over åpne avvik med årsak, sikkerhet og berørte blokker | REQ-0306, REQ-0314 · VERSION | Planlagt |
| DiscrepancyResolution | De tre valgene: Godkjenn eksisterende film / Oppdater scene / Angre endring | REQ-0306–REQ-0311, INV-08 · VERSION | Planlagt |
| HistoryPanel | Kommandologg: hvem gjorde hva, selektiv angring | REQ-0033, REQ-0525 · VERSION, COLLAB | Planlagt |
| ConflictDialog | Revisjonskonflikt: din versjon / deres versjon / flett | REQ-0526, INV-C1 · COLLAB | Planlagt |

## 9. Dialoger og oversikter

| Komponent | Formål | Krav / modul | Status |
|---|---|---|---|
| ImportScriptDialog | Import av PDF/DOCX med forhåndsvisning av tolkning og usikkerhet | REQ-0044–REQ-0049 · SCRIPT | Planlagt |
| ExportDialog | Manus/film/språk/plakat; nummereringsvalg og forhåndsvisning; varsel om avvik | REQ-0080, REQ-0086, REQ-0423 · EXPORT | Planlagt |
| ConfirmDialog | Bekreftelse som forklarer hva som bevares (ingen «Er du sikker?» uten innhold) | UX P1 · UI | Planlagt |
| InviteMemberDialog / MembersPanel | Inviter, rolle, kostnadsrett, fjern medlem (ikke-destruktivt) | REQ-0521, REQ-0523, REQ-0529 · COLLAB | Planlagt |
| ProductionOverview | Produksjonsoversikt: varighet, status, avvik, kostnad, filtre | REQ-0116–REQ-0119, REQ-0405, REQ-0406 · UI | Planlagt |
| ProjectSettings | Bildefrekvens, språk, budsjetter, API-tilkoblinger (aldri visning av nøkler) | REQ-0270–REQ-0272 · SECURITY | Planlagt |
| SpinoffCreateDialog / PromoteFromSpinoff | Opprette avledet produksjon; tilbakeføring med valg | REQ-0354, REQ-0376–REQ-0381 · CORE | Planlagt |
| PosterEditor | Plakat/karakterkart (fase 8) | mandat 26 · PRESENT | Planlagt |
