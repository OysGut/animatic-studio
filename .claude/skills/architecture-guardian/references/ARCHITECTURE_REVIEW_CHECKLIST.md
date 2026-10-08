# Arkitekturgjennomgang – sjekkliste

Brukes på hver plan og hver diff som berører domene, database, adaptere eller struktur. Kryss av eller skriv «ikke relevant». Henvisninger: ADR-0003–0006, `DOMAIN_MODEL.md`, `DATA_RELATIONSHIPS.md`, `INVARIANTS.md`, mandat 33.1.

## A. Helhetspåvirkning (mandat 33.1)
For endringen – hvordan påvirkes:
- [ ] felles datamodell
- [ ] manus- og filmsynk (INV-01)
- [ ] permanente identiteter (INV-02/03)
- [ ] versjonering (INV-07/13, `ScreenplayVersion`, `ResourceVersion`, `Take`)
- [ ] spinoffer (INV-04, `SceneVariant.ownerProductionId`)
- [ ] kontinuitet (INV-09, `storyTime`, `ContinuityEvent`)
- [ ] språkversjoner (INV-05/06, `LineTranslation`)
- [ ] kostnader (INV-12/INV-C3, `GenerationJob.costApproval`; regler i `API_INTEGRATIONS.md` §2 + `secure-development` inntil `ai-cost-quality-governance` finnes)
- [ ] portabilitet (ADR-0003)
- [ ] samarbeid (INV-C1/C2, DEC-0003)

## B. Lagdeling (ADR-0003)
- [ ] Domenelogikk ligger i `src/core/` som rene funksjoner.
- [ ] `src/core/` har ingen import fra `react`, `@tanstack/*`, `@supabase/*`, Lovable-pakker, `window`/`document`/Web Audio/WebCodecs.
- [ ] `src/engine/` bruker nettleser-API-er bak grensesnitt definert i core, og lastes bare på klient (SSR-sikkert).
- [ ] `src/adapters/` er eneste sted med Supabase-klient, AI-leverandører og medietjeneste-klient. AI-kall kjører på server.
- [ ] UI (`src/routes`, `src/components`, `src/app`) kaller core/adaptere – ingen forretningsregler i komponenter.
- [ ] Ny avhengighet: nødvendig, vedlikeholdt, lisens OK, ikke i `src/core` hvis den er plattformbundet.

## C. Domeneskiller (DOMAIN_MODEL §0, §2)
- [ ] **Project** – prosjektnivå (medlemmer, ressurser, scener).
- [ ] **Production** – hovedfilm/spinoff/trailer …; nøyaktig én `main`.
- [ ] **Scene** – narrativ identitet, `storyTime` (linear = avledet av hovedproduksjonens rekkefølge, ellers manuelt anker; DEC-0020 pkt. 6), `derivedFrom`, `originProductionId`, `merged_into` (DEC-0020 pkt. 9). Ingen produksjonsspesifikke felt.
- [ ] **SceneOccurrence** – per produksjon: `orderKey`, `active`, `excerpt`, `activeTakeId`, `productionNumbering`, `variantId`. Ingen UNIQUE(production, scene) – samme scene kan forekomme flere ganger (DEC-0020 pkt. 10); referer alltid til `occurrenceId`.
- [ ] **SceneVariant** – redaksjonell utgave; `ownerProductionId` null = delt. Spinoff-redigering lager/oppdaterer spinoff-eid variant.
- [ ] **ProductionSegment** – teknisk oppdeling med `reason`; aldri ny scene.
- [ ] **Take** – produsert resultat, uforanderlig fil, `producedFrom` for avviksdeteksjon; aktiv er en peker.
- [ ] **ScriptBlock/DialogueLine** – egne permanente ID-er; tekstendring gir ny rad i `script_block_revisions` og ny `current_rev` (DEC-0020 pkt. 5); `revision` er bare samtidighetskontroll.
- [ ] Skjuling i UI (`ViewFilter`) er skilt fra deaktivering (`SceneOccurrence.active`).

## D. Kommandoer og transaksjoner (ADR-0005)
- [ ] Endringen er en kommando med `type`, `payload`, `inverse`, `affected_ids`, `base_revisions`.
- [ ] Samme validering i core og i backend (`apply_command` → `private.cmd_<kommando>`); én transaksjon.
- [ ] `change_log` skrives i samme transaksjon.
- [ ] `inverse` gir identisk tilstand (test).
- [ ] Strukturkommandoer oppdaterer manus og montering i samme operasjon (de er samme data).
- [ ] Ingen automatisk destruktiv effekt (mandat 2.2): ingen sletting av takes, ingen bytte av aktiv take, ingen endring av annen produksjon, ingen betalt jobb.

## E. Database, RLS og revisjon (ADR-0004, DATA_RELATIONSHIPS)
- [ ] Migrasjon i `supabase/migrations/` (aldri endring direkte i Lovable Cloud).
- [ ] Felles kolonner: `id uuid`, `project_id`, `created_at`, `created_by`, `revision`.
- [ ] RLS aktivert; bare select-policy via `private.is_project_member(project_id)`; `insert/update/delete` revoket for `authenticated`; skriving via `apply_command` med rollekontroll (`private.has_project_role`); hjelpefunksjoner `security definer` med `search_path = ''` (DEC-0020 pkt. 1–2).
- [ ] Revisjonskontroll: skriving med utdatert `revision` avvises (INV-C1).
- [ ] Ingen `on delete cascade` på produksjonsdata; ingen hard sletting.
- [ ] Ingen FK/unik nøkkel med scenenummer (INV-02).
- [ ] Uforanderlige tabeller (bare insert) respektert: `screenplay_versions`, `resource_versions`, `takes`, `change_log`, `imported_documents`, `export_versions`, `generation_prompts`.
- [ ] Storage-sti og bøtter som i `DATA_RELATIONSHIPS.md` «Lagringsstruktur» (kanonisk, DEC-0020 pkt. 4); ingen overskriving.
- [ ] `schema_version` oppdatert; Lovable-synkmelding notert (migrasjoner kjøres ikke automatisk via Git – DEC-0005).
- [ ] Hemmeligheter bare i backend-hemmelighetslageret.

## F. Tid (ADR-0006)
- [ ] All tid i heltall bilder; bildefrekvens som `{num, den}`.
- [ ] Bare lokal tid lagres (scene, segment, kildeklipp); absolutt filmtid beregnes fra aktiv rekkefølge.
- [ ] `TimeLink` refererer `{ownerKind, ownerId, startFrame, endFrame}` i eierens lokale tid.
- [ ] Lyd i samples med egen rate; konvertering dokumentert.

## G. Ikke-funksjonelt
- [ ] Ytelsesmål i `ARCHITECTURE.md` §5 ikke truet (virtualisering av manus, tidslinje < 16 ms).
- [ ] Ingen kritiske data bare i nettleseren (28.1).
- [ ] Tastaturbruk og tilgjengelighet vurdert for nye arbeidsflater.

## H. Dokumentasjon
- [ ] `DOMAIN_MODEL.md` / `DATA_RELATIONSHIPS.md` / `ARCHITECTURE.md` oppdatert ved modellendring.
- [ ] ADR + DEC ved stort teknisk valg; usikre plattformpåstander merket.
- [ ] Gjeld registrert i `KNOWN_ISSUES.md`.
