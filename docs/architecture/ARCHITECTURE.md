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
| Screenplay Engine | `core/screenplay` (parser, struktur, paginering, nummerering, versjoner, filter, varighetsestimat), `engine/import` (PDF/DOCX), `engine/export/screenplay-pdf.ts` og `screenplay-docx.ts`, `app/script` |
| Timeline & Assembly Engine | `core/time.ts` (tidsmodell), `core/views.ts` (rekkefølge), `core/assembly` (filmklipp, deler, avvik, produksjonsstatus), `app/assembly` |
| Resource Library (REQ-0436) | Karakterer, objekter, miljøer, mediefiler og stilprofiler: `core/library` (ressurser, varianter, versjoner, bruk, konsekvenser, arbeidsliste, filnavn, zip), `core/cutout`, stilprofilene i `core/generation/style.ts` (tabell `style_profiles`, vises under «Visuell stil» i prosjektet), mediefilene i Storage-bøtten `assets` via `adapters/storage` og `app/library/asset-images.ts`/`asset-audio.ts`; tabeller `assets`, `asset_variants`, `asset_versions`; `app/library` |
| Continuity Engine | `core/continuity` (tilstand fra fortellingstid, forslag, analyse), `core/library/impact.ts`, `app/continuity` |
| 2D Composition Engine | `core/composition` (renderFrame, keyframes, easing), `engine/compositor` |
| Camera & Motion Engine | `core/composition` (kamera, `path.ts` Bézier-baner, `camera-handoff.ts`, `animate.ts`), `app/scene-editor/CameraPanel.tsx` og `camera-overlay.ts` |
| Audio Engine | `core/audio`, `engine/audio` |
| Prompt Orchestration Engine | `core/generation` (`prompt.ts`, `image-prompt.ts`, `scene-prompt.ts`, `prompt-writer.ts`; bruker stilprofilene fra Resource Library), serverfunksjoner i `adapters/ai` |
| Provider Adapters | `core/generation/providers.ts` (leverandørkatalog: modeller, priser, lengder, oppløsning, innsatsnivå, begrensninger, modellvalg og kostnadsanslag – DEC-0069/0070/0075), `adapters/ai` (Lovable AI Gateway `gateway.ts`, egne nøkler i nøkkelhvelvet, `generate-image`/`video`/`sound`/`speech`/`write-prompt.functions.ts`, køen i `queue.functions.ts`) |
| Quality & Cost Engine | `core/generation/quality-profile.ts` (prosjektprofiler og uforanderlige øyeblikksbilder), `core/generation/cost.ts` (jobber, budsjett, forbruk i kreditter og USD), `core/generation/providers.ts` (`estimateCostUsd`, `costBreakdown`, kvalitetsmekanismer), sperrene i `adapters/ai`, `app/ai` |
| Render Queue | tabell `generation_jobs`/`render_jobs`, worker |
| Version & Dependency Engine | `core/commands` (kommandoer og inverser), `core/screenplay/versions.ts`, `core/assembly/discrepancy.ts`, `core/production` (spinoffer, tilbakeføring), `change_log` |
| Localization Engine | `core/translation` (oversettelser, kobling, undertekster), `core/language` (filmspråk, timing, leppesynk) |
| Presentation Engine | `core/presentation` (plakatmodell, relasjoner, layout, kontroller), `engine/export/poster-pdf.ts` og `poster-canvas.ts`, `app/release` |
| Export Engine | Film, manus, lyd, plakater og prosjektbackup. `engine/export` (animatic-video, manus PDF/DOCX, zip), `core/backup` + `app/projects/backup.ts` (sikkerhetskopi: ZIP med `animatic-backup.json`, mediefiler og LES-MEG; format i `BACKUP_FORMAT.md`), gjenoppretting via `adapters/storage/backup.functions.ts`. Ingen andre moduler lager eksportfiler |
| Security & Storage | RLS, Storage-policyer, hemmeligheter, `adapters/storage` |
| Collaboration & Access (DEC-0003) | `project_members`, `project_invitations`, Realtime presence |

## 3. Hva kjører hvor (mandat 35.4, REQ-0010) – status DEC-0076

| Funksjon | Kjører nå | Hvorfor | Egen tjeneste foreslås når |
|---|---|---|---|
| Manusvisning, redigering, paginering | Nettleser; lagring via `runCommand` | Umiddelbar respons; Lovable trenger ingen egen server | – |
| PDF/DOCX/Fountain-import | Nettleser (uttrekk og tolkning); original og kontrollsum i backend | Filen forlater ikke maskinen før den er tolket; ingen serverkostnad | Skannede PDF-er som trenger OCR |
| Kommandoer og invarianter | Nettleser validerer; `apply_changes` i Postgres utfører atomisk | Ingen andres endringer går tapt (DEC-0010/0022) | – |
| 2D-sceneeditor, avspilling, montering | Nettleser (Canvas, Web Audio, video-elementer) | Bildepresis respons krever lokal tegning | – |
| Filmeksport (animatic, blandet materiale) | Nettleser med WebCodecs, lyd og undertekster | Fungerer uten egen medietjeneste; prøvd ende-til-ende (`tests/visual/export-e2e.mjs`) | Lange filmer i 4K, ProRes/omkoding eller eksport mens maskinen er av: FFmpeg-tjeneste med jobbtabell (ikke laget; krever kostnadsavklaring med Mars) |
| Mediemetadata ved import | Nettleser (video-/lydelementer) | Nok for vanlige formater | Uvanlige kodeker: ffprobe i medietjeneste |
| Plakat (PDF og PNG i trykkoppløsning) | Nettleser (striper, egen PNG-skriver) | Ingen server nødvendig; se KI-177 for minne | Svært store plakater med mange foto |
| Promptbygging og kostnadsanslag | Kjernen (nettleser og server bruker samme kode) | Samme tekst vises og sendes | – |
| Generering (bilde, video, lyd, tale, beskrivelse) | Serverfunksjoner i `adapters/ai` med rolle-, budsjett- og kostnadssperre; nøkler bare på serveren | Hemmeligheter og sperrer kan ikke ligge i nettleseren | – |
| AI-kø og oppfølging | Jobbene lagres i `generation_jobs`; en åpen redaktørfane sender og følger dem opp (DEC-0072/0073). Ruten `api/public/cron/ai-jobs` finnes, men planlegges ikke | Mars: ingen generering uten brukerens initiativ (DEC-0072, REQ-0592) | Hvis Mars vil at sendte jobber skal hentes uten åpen fane: planlagt kall til ruten (KI-178) |
| Sikkerhetskopi | Zip lages i nettleseren; gjenoppretting via serverfunksjon | Store mediefiler går rett fra lagringen | – |

Lovable alene utfører altså ikke tunge medieoperasjoner eller langvarige bakgrunnsjobber; de to stedene der en egen tjeneste blir teknisk riktig, er markert over (REQ-0010).

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
Desktop-versjon (macOS/Windows) kan bruke samme `core` og `engine` i Tauri eller Electron, med lokal SQLite/Postgres-adapter bak samme repositorigrensesnitt. Alt Lovable-/Supabase-spesifikt skal holdes i `adapters/` og UI-rammeverkets ruter.

### Plattformbindinger og begrunnelse (REQ-0008, DEC-0076)
| Binding | Hvor | Hvorfor den er nødvendig | Slik byttes den |
|---|---|---|---|
| Lovable (bygg, publisering, hemmeligheter) | `src/integrations/` (generert), `routeTree.gen.ts` | Første versjon utvikles i Lovable (REQ-0006) | Vanlig Vite/TanStack-bygg; hemmeligheter i miljøvariabler |
| Supabase/Postgres (data, RLS, Auth, Storage, Realtime) | `db/migrations/`, `adapters/storage`, `adapters/ai`, nettleseradapterne `src/adapters/browser/` | Lovable Cloud er backend; tilgang håndheves i databasen | Standard SQL og Postgres; Storage og Auth bak adapter |
| TanStack Start serverfunksjoner | `adapters/**/*.functions.ts` | Server for nøkler og sperrer uten egen tjeneste | Samme funksjoner som HTTP-endepunkter |
| Nettleser-API (WebCodecs, Canvas, Web Audio, CompressionStream) | `engine/`, `app/` | Bildepresis avspilling og eksport lokalt | Finnes i Electron/Tauri (Chromium/WebKit) |
| AI-leverandører | `adapters/ai`, katalogen `core/generation/providers.ts` | Valgfritt; modellagnostisk (REQ-0269) | Ny adapter + katalogpost |

**Status (DEC-0078):** all Supabase-bruk i nettleseren går via små funksjoner i `src/adapters/browser/` (auth, storage-files, project-data, presence, ai, versions, members, projects, imported-documents, history-records); bare `src/adapters/browser/client.ts` importerer klienten. `src/app` og rutene er uten Supabase-binding (testet i `tests/architecture/app-uten-supabase.test.ts`, tom unntaksliste). `src/app/db.ts` er en bakoverkompatibel videreeksport.

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

## M8 Quality & Cost Engine (0063)
`quality_profiles` er prosjektdata med medlems-SELECT og ingen direkte klientskriving. Add/Update/SetRemoved/SetActive går via kommandoer og `apply_changes` med revisjoner og inverser. Nye prosjekter får Utkast (aktiv), Gjennomgang og Endelig; eksisterende får bare et eksplisitt tilbud. Backup inkluderer profiler og aktivt valg.
Profilen foreslår modeller, innsats, oppløsning, varianter og eksportformat/bitrate/alfa; lokale valg overstyrer. Uten profil brukes tidligere standarder. `generation_jobs.params` får `qualityProfileId` og et validerbart øyeblikksbilde. Månedstaket teller genereringer (ikke USD), inkludert ventende reserverte jobber; feilede frigjør kapasitet. `private.guard_quality_profile_job` låser prosjektet før innsetting, avviser endret/fremmed profil og endring/fjerning av et eksisterende øyeblikksbilde. Eksisterende reserverte jobber kan ferdigstilles etter profilendringer.
Film og alfa bruker `exportQueue`, en seriell klientkø montert i roten. Bekreftede innganger beholdes av jobbens closure; fremdrift/avbryt er global og dialoglukking stopper ikke arbeidet. Tabblukking eller full omlasting kan ikke gjenoppta en canvas-koder. PNG-ZIP strømmer til OPFS; Uten OPFS beholdes den eksisterende minnebaserte reserven for å oppfylle PNG-sekvens alltid og eksisterende testkrav; full strømming er derfor kun verifisert der OPFS finnes. ZIP-grensen uten ZIP64 er uendret.
0063 erstatter apply_changes/delete_project/purge_project_assets fra 0062, create_project fra 0001 og create_dialogue_batch fra 0061 (kun øyeblikksbilde i reserverte jobber). purge_removed_assets er urørt. Migrasjonen kjøres ikke av Lovable.

## B-050 linjekobling (0064)
`translation_line_links` bevarer 1:1, 1:n og n:1 mellom permanente blokk-ID-er og mål-ID-er, avgrenset av variant og språk. Mål er enten en oversettelse (`translations`) eller en importert linje uten regelpar (`translation_lines`). DEC-0058 kobler ved import først; linjene reglene ikke klarte, lagres og kan kobles av AI (bekreftet, tjenestebetalt) eller manuelt.
Forslag valideres og vises med forkastet-teller; godkjenning er én kommando/angring. Godkjente koblinger brukes av `translatedState` uten å endre norske blokker; n:1 vises én gang.
`apply_changes` validerer bare koblinger som legges til eller får nye referanser i samme kall. En kobling som senere peker på en fjernet eller flyttet linje er «utdatert» (`lineLinkStale`) og flagges i gjennomgangen; den blokkerer aldri andre kommandoer.
