---
name: architecture-guardian
description: Holder arkitekturen i Animatic Studio konsistent mellom domene (src/core), database (db/migrations, RLS), tjenester/adaptere (src/adapters, src/engine) og UI. Bruk ved ny modul, ny tabell eller migrasjon, ny eller endret kommando, ny RPC, nye avhengigheter, refaktorering, kodegjennomgang (code review), når noe «bare skal fikses i komponenten», og ved spørsmål om hvordan noe skal lagres, kobles eller modelleres, hvor data eller logikk hører hjemme, eller endringer som berører flere moduler eller både manus og film. Passer på skillet prosjekt/produksjon/scene/sceneforekomst/scenevariant/segment/take, lagreglene (ren TypeScript i src/core – ADR-0003), kommandomønsteret runCommand → applyCommand i kjernen → apply_changes og change_log (ADR-0005, DEC-0022), RLS og revision-kontroll (ADR-0004), tidsmodellen (ADR-0006). Triggere - arkitektur, domenemodell, datamodell, hvordan skal X lagres eller kobles, migrasjon, tabell, RLS, Supabase, adapter, lagdeling, refaktorering, portabilitet, technical debt.
metadata:
  version: "0.2.1"
  owner: "animatic-studio"
  last-reviewed: "2026-10-08"
---

# architecture-guardian

Sørger for at hver ny bit passer inn i én sammenhengende struktur, slik mandat 33.1 og 33.6 krever. Skillen tar tekniske valg innenfor DEC-0006, men endrer aldri produktkrav.

## 1. Ansvar
**Eier:** lagdeling og avhengighetsretning; samsvar mellom `DOMAIN_MODEL.md`, `DATA_RELATIONSHIPS.md`, kode og migrasjoner; kommando-/RPC-mønsteret; tilgang og revisjonskontroll i backend; tidsmodellen; ADR-er for store tekniske valg; varsling om strukturell gjeld.
**Eier ikke:**
- Om noe er et produktkrav → `specification-guardian`.
- Detaljert synkatferd og testmatrise for strukturkommandoene → `scene-sync-invariants`.
- Status/sporbarhet i kravregisteret → `requirements-traceability`.
- Kostnadsporten (INV-12, INV-C3) → `ai-cost-quality-governance` fra M5; inntil da `API_INTEGRATIONS.md` §2 + `secure-development` (DEC-0020 pkt. 11). Denne skillen sjekker bare at endringen ikke omgår den.

## 2. Når den brukes
- Før ny entitet, tabell, migrasjon, RPC, kommando, adapter eller mappe.
- Før en ny avhengighet (npm-pakke, tjeneste) legges til.
- Ved refaktorering, og ved gjennomgang av diff før commit.
- Når en løsning er lokal for én skjerm («vi lagrer rekkefølgen i tidslinjen»).
- Når portabilitet til macOS/Windows kan påvirkes (mandat 1.2, prinsipp 28).
- Når en atferd beskrives (f.eks. «scenen flyttes», «AI-klippet er for langt», «utseendet endres midt i scenen») og svaret krever en ny eller endret kommando, tabell eller kobling, eller berører flere moduler.

## 3. Les først
- `docs/architecture/ARCHITECTURE.md` (lag, modulkart, dataflyt), `DOMAIN_MODEL.md` (§0 begrepsavklaringer, DEC-0015), `DATA_RELATIONSHIPS.md`, `INVARIANTS.md`, `API_INTEGRATIONS.md`.
- ADR-0002 (Lovable/GitHub), ADR-0003 (lagdeling), ADR-0004 (samarbeid/RLS), ADR-0005 (kommandologg), ADR-0006 (tidsmodell), ADR-0008 (rendering).
- Krav: REQ-0016/REQ-0041/REQ-0043 (én modell, transaksjoner), REQ-0034–REQ-0040 (identiteter, scene/forekomst/variant), REQ-0268 (manus- vs. genereringsstruktur), REQ-0524/REQ-0526 (tilgang i backend, samtidighet), REQ-0007/REQ-0411–0412 (portabilitet). Grep `modules:` i `requirements.yaml` for modulen du endrer.
- Sjekkliste: [ARCHITECTURE_REVIEW_CHECKLIST](references/ARCHITECTURE_REVIEW_CHECKLIST.md). Faresignaler: [DEBT_SIGNALS](references/DEBT_SIGNALS.md).

## 4. Arbeidsprosedyre
1. **Plasser endringen i laget den hører hjemme** (`src/core` → `src/engine` → `src/adapters` → UI; backend i `supabase/`). Domenelogikk skal i `src/core`, aldri i komponenter eller SQL alene.
2. **Plasser dataene på riktig entitet.** Bruk tabellen i `DOMAIN_MODEL.md` §0/§2:
   - narrativt innhold → `Scene` / `SceneVariant` / `ScriptBlock` / `DialogueLine`;
   - bruk i én produksjon (rekkefølge `orderKey`, `active`, utdrag, `activeTakeId`, `productionNumbering`) → `SceneOccurrence`;
   - teknisk oppdeling → `ProductionSegment` (`reason`);
   - produsert resultat → `Take` (aldri overskrevet);
   - fortellingstid → `Scene.storyTime`; kontinuitet → `ContinuityEvent`.
   Er du i tvil om et felt hører til scene, forekomst eller variant: spør «endres dette når scenen brukes i en spinoff?» Ja → forekomst/variant.
3. **Uttrykk endringen som kommando** i `src/core/commands` (tilstand + kommando → ny tilstand | feil, med `inverse`; `applyCommand` i `apply.ts`). Kjernen er eneste sted domenelogikken finnes (DEC-0022, erstatter DEC-0020 pkt. 1 og 3). Klienten kaller serverfunksjonen `runCommand` (`src/adapters/storage/commands.functions.ts`), som sjekker medlemskap/rolle (≥ editor), laster prosjektet med admin-klienten, kjører `applyCommand`, lager endringssett med `diffStates` (`src/core/patch.ts`) og lagrer det atomisk via `public.apply_changes` (bare `service_role`; sjekker rolle, prosjekttilhørighet og revisjon per rad – avvik → `P0409` – og skriver `change_log`). Ingen SQL-funksjon per kommando; de eneste RPC-ene klienten kan kalle er `public.create_project`, `public.create_invitation` og `public.accept_invitation`.
4. **Tilgang:** ny tabell har `project_id`, `revision`, RLS aktivert, bare select-policy via `private.is_project_member(project_id)`, `insert/update/delete` revoket for `authenticated`; skriving bare via `runCommand` → `public.apply_changes` (ny skrivbar tabell legges inn i `apply_changes` og `TABLE_ORDER`). Ingen `on delete cascade` på produksjonsdata. Ingen nøkkel med scenenummer, og ingen `UNIQUE(production_id, scene_id)` – samme scene kan forekomme flere ganger i én produksjon (DEC-0020 pkt. 10). Lagringssti: se `DATA_RELATIONSHIPS.md` «Lagringsstruktur».
5. **Tid:** heltall bilder + rasjonell bildefrekvens; lagre lokal tid (scene/segment/kildeklipp), beregn absolutt filmtid (ADR-0006).
6. **Kjør [sjekklisten](references/ARCHITECTURE_REVIEW_CHECKLIST.md)** og søk etter [faresignalene](references/DEBT_SIGNALS.md) i diffen.
7. **Store eller nye tekniske valg:** skriv ADR (`docs/decisions/adr/TEMPLATE.md`) + DEC (Teknisk anbefaling). Påstander om Lovable/Supabase-egenskaper som ikke er verifisert merkes som usikre (33.4; se `docs/references/technical/LOVABLE_PLATFORM_NOTES.md`).
8. **Gjeld som ikke rettes nå:** registrer i `KNOWN_ISSUES.md` med faresignal, risiko (hvilken INV/REQ), og plan.

## 5. Leveranse
- Kort arkitekturnotat i planen (`CURRENT_WORK.md`): lag, entiteter, kommandoer, migrasjoner, berørte INV/REQ, ev. ADR.
- Oppdaterte `DOMAIN_MODEL.md`/`DATA_RELATIONSHIPS.md`/`ARCHITECTURE.md` i samme commit som koden når modellen endres.
- Til Mars bare hvis valget koster penger, gjelder sikkerhet eller påvirker hva produktet gjør – i klartekst.

## 6. Kontrollpunkter
- [ ] `src/core` importerer ikke React, TanStack, Supabase, Lovable eller nettleser-API-er (ADR-0003; `tests/architecture/core-purity.test.ts`).
- [ ] Ingen UI-kode skriver direkte til tabeller; alt går via kommando → `runCommand` → `apply_changes`.
- [ ] Rekkefølge finnes bare som `scene_occurrences.order_key` (INV-01).
- [ ] Ingen ID, URL, filnavn, cache-nøkkel eller relasjon bygger på scenenummer (INV-02).
- [ ] Ny tabell: RLS, `revision`, `project_id`, ingen cascade, migrasjon i `db/migrations/NNNN_navn.sql`.
- [ ] Domenemodell-dokumentene stemmer med koden.

## 7. Typiske feil som må unngås
- Lagre en egen scenerekkefølge i tidslinje/montering (`assembly_items` lagrer trim/spor/overgang, ikke rekkefølge).
- Bruke `Scene` der det skal være `SceneOccurrence` (aktivering, rekkefølge, aktiv take er per produksjon).
- La en spinoff-redigering skrive til den delte `SceneVariant`.
- Modellere produksjonssegmenter som nye scener (INV-10).
- Lagre absolutte tidskoder som sannhet, eller flyttall-sekunder.
- Legge Supabase-klienten i `src/core` «for enkelhets skyld».
- Ta i bruk en plattformegenskap uten å ha verifisert den.

## 8. Akseptansekriterier / tester
- `tests/architecture/core-purity.test.ts` grønn.
- Per ny kommando: enhetstest for validering + `inverse` gir identisk tilstand (ADR-0005), og invarianttester via `scene-sync-invariants`.
- Per ny tabell: RLS-test i `tests/rls/` (rollematrise owner/editor/commenter/viewer/ikke-medlem) og revisjonskonflikt-test (INV-C1).
- `python3 scripts/kb/check_kb.py` OK.

## 9. Dokumentasjon og sporbarhet
`docs/architecture/*`, ADR + DEC (Teknisk anbefaling) ved store valg, `requirements.yaml` (`implementation`/`verification` → `build_docs.py`), `KNOWN_ISSUES.md` for registrert gjeld, `SESSION_HANDOVER.md`, `IMPLEMENTATION_STATUS.md`.

## Eksterne kilder
`SKILLS_ASSESSMENT.md`: `feature-dev` (Anthropic) kan brukes som plugin for *arbeidsflyten* (utforsk → arkitektur → implementer → review); denne skillen leverer *reglene* og har forrang ved konflikt. `supabase-postgres-best-practices` kan brukes som referanse for generelle Postgres/RLS-råd; prosjektets ADR-er gjelder foran.
