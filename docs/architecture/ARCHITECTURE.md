# Arkitektur – Animatic Studio

Status: Arbeidsform bekreftet av bruker (DEC-0005); tekniske valg er Teknisk anbefaling (DEC-0008, DEC-0009, DEC-0014, DEC-0020). Svarer på mandat kap. 1.2, 31 og 35 punkt 1–4.
Relaterte dokumenter: `DOMAIN_MODEL.md`, `DATA_RELATIONSHIPS.md`, `INVARIANTS.md`, `API_INTEGRATIONS.md`, ADR-0002–0008.

## 1. Plattform og leveranse

```
 Claude (Cowork/Claude Code) ──skriver──> Git-repo på Mars' Mac (Claude/Projects/Animatic Studio/animatic-studio)
                                              │  GitHub Desktop: Commit + Push
                                              ▼
                                     GitHub (privat repo, opprettet av Lovable)
                                              │  toveis synk, gren main
                                              ▼
                     Lovable-prosjekt: forhåndsvisning, publisering, hemmeligheter (API-nøkler)
                                              │
                                              ▼
                     Lovable Cloud (Supabase): Postgres + RLS, Auth, Storage, Realtime, funksjoner
                                              │  jobbtabell / webhook
                                              ▼
                     Ekstern medietjeneste (fase 4–5): FFmpeg-rendering, omkoding, sammensetting
                                              │
                                              ▼
                     AI-leverandører (fase 5): bilde, video, lyd – via adaptere, kun med kostnadsgodkjenning
```

**Verifisert stack (2026-10-08, fra Lovables genererte repo `OysGut/animatic-studio`, mal `tanstack_start_ts_current`):** TanStack Start 1.168 med SSR (Nitro-server, `src/server.ts`), TanStack Router med filbasert ruting i `src/routes/` (ikke `src/pages/`; `routeTree.gen.ts` genereres), React 19, TypeScript 5.8, Vite 8, Tailwind CSS 4, shadcn/ui (stil new-york, Radix, lucide-ikoner) i `src/components/ui/`, TanStack Query, react-hook-form + zod, react-resizable-panels, Vitest 4 + Testing Library (jsdom), ESLint + Prettier, bun som pakkebehandler i Lovable (`bun.lock`). Backend (Lovable Cloud) er ikke aktivert ennå.

## 2. Lag og moduler

| Lag | Mappe | Innhold | Avhengigheter |
|---|---|---|---|
| Domenekjerne | `src/core/` | Typer og ID-er, kommandoer (+ inverse), invariantkontroller, tidsmodell, nummerering, manusparser og -paginering, varighetsestimat, kontinuitetsberegning, konsekvensanalyse, promptbygger (ren funksjon) | Ingen (ren TS). Testes med Vitest. |
| Motorer | `src/engine/` | Komposisjon/avspilling (Canvas2D/WebGL), kamera, lyd (Web Audio), eksport (WebCodecs), PDF/DOCX-uttrekk | core + nettleser-API-er; lastes bare på klient (SSR-sikkert) |
| Adaptere | `src/adapters/` | `storage/` (Supabase-repositorier og RPC-kall), `providers/` (AI-leverandører, kjøres på server), `media/` (medietjeneste-klient) | core-grensesnitt |
| Applikasjon/UI | Lovables struktur (`src/routes/`, `src/components/`) + `src/app/` | Arbeidsflater, designsystem, tilstand, tastatursnarveier, angre/gjør om | core, engine, adapters |
| Backend | `db/migrations/` (SQL), serverfunksjoner i `src/adapters/**/*.functions.ts` | Skjema, RLS, `apply_changes`, invitasjoner, senere kostnadsport og jobbkø | – |
| Medietjeneste | `services/media-worker/` (senere) | Container med FFmpeg; henter jobber, rendrer, laster opp | Storage, jobbtabell |

### Kobling til mandatets moduler (kap. 31)

| Mandatmodul | Kode |
|---|---|
| Project Core | `core/model`, `core/commands`, `core/invariants`, RPC-er |
| Screenplay Engine | `core/screenplay` (parser, struktur, paginering, nummerering, diff), `engine/import` (PDF/DOCX), `core/export/screenplay` |
| Timeline & Assembly Engine | `core/timeline` (tidsmodell, rekkefølge → tidskoder), `app/timeline` |
| Resource Library | `core/resources`, tabeller `resources`, `resource_versions` |
| Continuity Engine | `core/continuity` (tilstand fra fortellingstid, forslag), `core/impact` |
| 2D Composition Engine | `core/composition` (renderFrame, keyframes, easing), `engine/compositor` |
| Camera & Motion Engine | `core/camera` (Bézier-baner, shots), `app/scene-editor/camera` |
| Audio Engine | `core/audio`, `engine/audio` |
| Prompt Orchestration Engine | `core/prompt` (strukturert prompt, ordrett dialog), server for sending |
| Provider Adapters | `adapters/providers/*` (server) |
| Quality & Cost Engine | `core/cost` (estimat, budsjett), backend-port for godkjenning |
| Render Queue | tabell `generation_jobs`/`render_jobs`, worker |
| Version & Dependency Engine | `core/versioning`, `change_log`, `discrepancies` |
| Localization Engine | `core/l10n` (språkversjoner, koblingsforslag, timing), UI-i18n |
| Presentation Engine | `core/poster` (layoutmodell), `engine/poster` (rendering/PDF) |
| Export Engine | `core/export`, `engine/export`, worker for tunge eksporter, prosjektbackup (ZIP: JSON + medieliste) |
| Security & Storage | RLS, Storage-policyer, hemmeligheter, `adapters/storage` |
| Collaboration & Access (DEC-0003) | `project_members`, `project_invitations`, Realtime presence |

## 3. Hva kjører hvor (mandat 35.4)

| Funksjon | Nettleser | Backend (Cloud) | Medietjeneste | AI-leverandør |
|---|---|---|---|---|
| Manusvisning, redigering, paginering | ✓ | lagring/RPC | | |
| PDF/DOCX-import (uttrekk + tolkning) | ✓ (MVP) | lagring av original | ev. senere | |
| Kommandoer og invarianter | ✓ (validering) | ✓ (atomisk utførelse) | | |
| 2D-sceneeditor og avspilling | ✓ | | | |
| Animatic-eksport (kort) | ✓ WebCodecs | lagring | | |
| Full filmeksport, omkoding, sammensetting | | jobbkø | ✓ FFmpeg | |
| Mediemetadata ved import | ✓ (enkel) | | ✓ (ffprobe) | |
| Promptbygging | ✓/server | ✓ | | |
| Generering (bilde/video/lyd) | | ✓ adapter + kostnadsport | etterbehandling | ✓ |
| Renderingskø, gjenopptakelse | visning | ✓ vedvarende | ✓ | |
| Plakat-layout og forhåndsvisning | ✓ | | trykk-PDF ved behov | harmonisering (valgfritt) |

## 4. Dataflyt for kjerneoperasjoner
1. UI sender kommando → `core` validerer mot lokal tilstand og invarianter (rask tilbakemelding).
2. Klienten kaller serverfunksjonen `runCommand` (`src/adapters/storage/commands.functions.ts`).
3. Serveren sjekker rolle, laster prosjektet, kjører samme kjerne autoritativt og lagrer endringssettet atomisk med `public.apply_changes` (revisjon per rad, `change_log`) – ADR-0009/DEC-0022.
4. Realtime varsler andre klienter; de henter endrede objekter.
5. Etter endring i manus/ressurser: konsekvensanalyse lager `discrepancies` (aldri endring av takes).

## 5. Ikke-funksjonelle mål (første versjon)
- Manus på 120+ sider: åpne < 2 s, rulling 60 fps (virtualisering), paginering inkrementelt.
- Tidslinje med 150 scener og 20 spor: interaksjon < 16 ms per bilde.
- Ingen kritiske data bare i nettleseren (28.1): alt lagres i backend; lokal kladd bare som cache.
- Tilgjengelighet: WCAG 2.2 AA der det er relevant for et profesjonelt redigeringsverktøy (tastaturbruk i alle arbeidsflater).

## 6. Portabilitet (prinsipp 28)
Desktop-versjon (macOS/Windows) kan bruke samme `core` og `engine` i Tauri eller Electron, med lokal SQLite/Postgres-adapter bak samme repositorigrensesnitt. Alt Lovable-/Supabase-spesifikt holdes i `adapters/` og UI-rammeverkets ruter.

## 7. Tekniske hovedrisikoer (mandat 35.7) – se også KNOWN_ISSUES
| Risiko | Tiltak |
|---|---|
| Manusformatering/paginering ikke identisk med Final Draft | Gyldne tester mot referansemanus; toleranse dokumenteres; original vises alltid som PDF ved siden av. |
| PDF-import av mellomromsbasert layout | Posisjonsbasert klassifisering + usikkerhetsmerking + manuell korrigering. |
| Tidslinjesynk og invarianter | Én kilde til rekkefølge (sceneforekomster), egenskapsbaserte tester. |
| Mediebehandling i nettleser/Workers | Bare lette operasjoner i nettleser; tung rendering i medietjeneste. |
| AI-leverandørers ulike kapabiliteter | Adaptere med kapabilitetsbeskrivelse; aldri anta felles parametere. |
| Lovable-synk (migrasjoner kjøres ikke automatisk) | Fast synkmelding; versjonstabell i databasen som UI sjekker mot forventet skjemaversjon. |
| Samtidig redigering | Revisjonskontroll, tydelige konflikter, presence. |
| Lovables agent endrer filer den ikke skal | AGENTS.md; CI-sjekk (kontrollsum, check_kb). |
