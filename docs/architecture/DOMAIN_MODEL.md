# Domenemodell – Animatic Studio

Status: Teknisk anbefaling (DEC-0009, DEC-0015). Kravgrunnlag: mandat kap. 2, 3, 5, 6, 8–10, 15, 18, 21, 23–25, 32 fase 1, og DEC-0003.
Denne modellen implementeres i `src/core/model.ts` (typer) og `db/migrations/` (tabeller, DEC-0022). Navn i kode er engelske; norske begreper i parentes.

## 0. Begrepsavklaringer (DEC-0015)

| Begrep i mandatet | Modell | Regel |
|---|---|---|
| Skjule (grensesnitt) | `ViewFilter` (lokal UI-tilstand) | Påvirker aldri film, varighet eller eksport. Lagres per bruker. |
| Deaktivere / «skjult scene» (5.2, 7.2) | `SceneOccurrence.active = false` | Produksjonsmessig. Utelates fra aktivt manus, avspilling, spilletid og eksport. Aldri sletting (INV-14). |
| Delsekvens / produksjonsdelsekvens / produksjonssegment (2, 3.2, 10.6, 18) | `ProductionSegment` med `reason` | Én entitet. `reason ∈ {narrative_subsequence, continuity_change, model_limit, manual}`. Endrer aldri manusstruktur (INV-10). |
| Aktiv filmversjon (15.3, 16.4) | `SceneOccurrence.activeTakeId` | En peker, ikke en status. «Aktiv» vises som avledet status. |
| Produksjonsversjon / sceneversjon / render | `Take` | Ett produsert resultat for en sceneforekomst/segment (2D-render, AI-video, importert film, stillbilde). |
| Fortellingstid | `Scene.storyTime` | Standard = rekkefølge i hovedmanus; overstyres manuelt for flashback, drøm, tidshopp (INV-09). |
| Narrativ splitting | Kommando `SplitScene` | Første del beholder `sceneId`; ny del får ny ID med `derivedFrom`. Tilknyttet materiale flagges for gjennomgang. |
| Bekreftet/faktisk spilletid | `Duration.kind ∈ {estimated, planned, animatic, generated, actual}` | Bekreftet = beste ikke-estimerte varighet for aktiv take; aldri dobbelt telling. |

## 1. Overordnet struktur

```
Project ─┬─ ProjectMember / Invitation               (COLLAB)
         ├─ Production (hovedfilm, spinoff, trailer …) ─┬─ ScreenplayVersion (per språk) ─ ScriptBlock (snapshot)
         │                                              ├─ SceneOccurrence ─┬─ ProductionSegment ─ Take
         │                                              │                   └─ Take (aktiv peker)
         │                                              ├─ Assembly (filmmontering) ─ AssemblyItem → SceneOccurrence
         │                                              └─ Budget, ExportVersion, Poster
         ├─ Scene (narrativ identitet) ─ SceneVariant ─ ScriptBlock ─ DialogueLine ─ LineTranslation / AudioTake
         ├─ Resource (Character, Object, Location, Audio, Media, StyleProfile) ─ ResourceVersion
         │      └─ Character ─ AppearanceState, ContinuityEvent, CharacterVariant
         ├─ TimeLink (manusblokk/replikk ↔ tidsintervall)
         ├─ GenerationJob ─ GenerationPrompt (auto + override) ─ Take
         └─ ChangeLog (kommandoer), Discrepancy (avvik)
```

## 2. Entiteter

Alle entiteter har: `id` (UUID v7, permanent, uavhengig av navn/språk/nummer), `projectId`, `createdAt`, `createdBy`, `revision` (heltall for samtidighetskontroll). Ingen hard sletting av produksjonsdata; `archivedAt` brukes ved behov.

### Prosjekt og samarbeid
- **Project** – navn, standard bildefrekvens, hovedspråk (`nb`, INV-05; at dette gjelder alle produksjoner er en midlertidig antakelse, Q-06), innstillinger.
- **ProjectMember** – `userId`, `role ∈ {owner, editor, commenter, viewer}`, `canApproveCosts`.
- **Invitation** – e-post, rolle, token-hash, utløp, status.

### Produksjon
- **Production** – `kind ∈ {main, spinoff, short, trailer, teaser, pitch, pilot, alternative, other}`, navn, `parentProductionId?`, bildefrekvens, sideforhold. Nøyaktig én `main` per prosjekt.
- **SceneOccurrence (sceneforekomst)** – hvordan en scene brukes i én produksjon: `productionId`, `sceneId`, `variantId` (hvilken scenevariant som gjelder her), `orderKey` (fraksjonell sorteringsnøkkel), `active`, `excerpt? {inFrame, outFrame}` (tidsutdrag, 24.6), `activeTakeId?`, `productionNumbering` (etablert scenenummer i denne produksjonen, f.eks. «42A» – visningsdata, ikke identitet). **Aktiv rekkefølge i manus og film er rekkefølgen av aktive sceneforekomster – én liste, to visninger (INV-01).**
- **Assembly (filmmontering)** – overordnet tidslinje per produksjon og språk. `AssemblyItem` refererer alltid til en sceneforekomst eller segment, med trim (inn/ut), overgang og sporplassering. Assembly lagrer ikke egen scenerekkefølge; den avledes fra sceneforekomstene.

### Scene og manus
- **Scene** – permanent narrativ enhet. `storyTime {order: number, label?, kind: linear|flashback|flashforward|dream|jump}`, `derivedFrom?`, `originProductionId` (der den ble skrevet; spinoff-scener tilhører bare spinoffen til de eksplisitt overføres – 24.4).
- **SceneVariant (scenevariant)** – en redaksjonell utgave av scenen: `sceneId`, `basedOnVariantId?`, `ownerProductionId` (null = delt hovedvariant), `heading {intExt, location, time}`, blokkliste. Endring i spinoff lager som standard ny variant eid av spinoffen (24.5).
- **ScriptBlock (manusblokk)** – `kind ∈ {heading, action, character, parenthetical, dialogue, transition, shot, note, page_break_hint}`, tekst, `language`, `sourceRef` (linje/side i originalimport). Replikker er `DialogueLine` (karakter + parentes + tekst) med egen permanent ID (dlg_…).
- **ScreenplayVersion (manusversjon)** – uforanderlig øyeblikksbilde for en produksjon og et språk: ordnet liste av `{occurrenceId, variantId, blockRevisions, active, numbering}`. Nye versjoner refererer forrige (`previousVersionId`). Historiske versjoner endres aldri (2.2).
- **ImportedDocument** – originalfil (Storage-nøkkel, SHA-256, format, metadata), uendret (4.2).
- **ExportVersion** – resultat av manus-/film-/plakateksport med valgt nummereringsmetode, valgte språk, inkluderte/ekskluderte scener og nummereringstabell `{occurrenceId → visningsnummer}` (5.2, 3.1 «gjeldende eksportnummer» = siste eksports tabell).

### Språk
- **LanguageVersion** – `productionId`, `language` (`nb` er hovedmanus; andre er tilknyttede).
- **LineTranslation** – kobler en norsk replikk/blokk til tekst på annet språk, `status ∈ {current, needs_review}`, `confidence`, `approvedBy`. Endring i norsk → `needs_review` (23.1). Endring i oversettelse endrer aldri norsk (INV-06).

### Tid og koblinger
- **TimeLink** – `{blockId|dialogueLineId} ↔ {ownerKind: segment|take|audioTake|compositionEvent, ownerId, startFrame, endFrame}` (6.1). Lokal tid for eieren; absolutt tid beregnes (ADR-0006).

### Produksjonsmateriale
- **ProductionSegment** – del av en sceneforekomst: `occurrenceId`, `reason`, `startBlockId/endBlockId` eller tidsintervall, `orderKey`. Påvirker aldri scenenummer eller manus (INV-10).
- **Take (produsert versjon)** – `kind ∈ {composition2d, ai_video, imported_film, still, audio_only}`, `status ∈ {reference, in_progress, approved}`, kildepekere (`compositionId`, `mediaAssetId`, `generationJobId`), `producedFrom {screenplayVersionId, blockRevisions, resourceVersionIds}` (grunnlag for avviksdeteksjon), varighet. Overskrives aldri; nye takes legges ved siden av.
- **Composition (2D-scene)** – lag (`Layer {depth, kind, resourceVersionId?, transform, keyframes[], visible, groupId}`), kameraer (`Camera {shots[], path (Bézier), keyframes, easing}`), lydplasseringer. Redigerbar kilde; AI-video erstatter den aldri (11.4).

### Ressurser
- **Resource** – `kind ∈ {character, object, prop, animal, location, environment, background, image, audio, generated, style_profile}`, navn, aliaser (`Alias {text, language, kind: preferred|alternative|nickname|former}`), kategorier, metadata.
- **ResourceVersion** – uforanderlig versjon (fil, beskrivelse). Scener refererer alltid en bestemt versjon. Ny versjon → konsekvensanalyse, aldri automatisk bytte (8.3, INV-13).
- **Character** (spesialisering) – permanent identitet; **CharacterVariant** (utseende × stil, f.eks. «langt hår / animatic-stil») med egen godkjenning og publisering (9.1–9.3). Systemet skiller *hvem* (Character), *hvordan i historien* (AppearanceState) og *i hvilken stil* (StyleProfile) (9.4).
- **AppearanceState** – navngitt tilstand (f.eks. «langt hår», «kort hår», «bandasje»), `permanence ∈ {permanent, temporary, scene_dependent}`.
- **ContinuityEvent** – `characterId`, hendelse, `fromState → toState`, anker `{sceneId, blockId?, frame?}`, `storyTime`, `status ∈ {suggested, approved}`, `productionId?` (lokalt avvik i spinoff, 10.8). Gjeldende tilstand for en scene beregnes fra hendelser ordnet etter **fortellingstid**, ikke manusrekkefølge (INV-09).
- **StyleProfile** – referansebilder + beskrivelse; brukes på tvers av karakterer, miljøer, plakater, animatics og AI (9.4).

### AI, kø og kostnad
- **GenerationJob** – mål (segment/take/ressurs/plakat), leverandør, modell, parametere, `qualityProfile ∈ {fast, balanced, premium}`, kostnadsestimat, `costApproval {approvedBy, approvedAt, limit}`, faktisk kostnad, status (`awaiting_approval, queued, preparing, generating, post_processing, completed, failed, cancelled, blocked_by_budget`), forsøk, feil.
- **GenerationPrompt** – `autoText` (generert, engelsk), `override?` (manuell), `verbatimDialogue[]` (norske replikker som aldri oversettes, 17.2), `systemInstruction`, referanser, `basedOnRevisions`. Manuelle overstyringer bevares og flagges ved endret grunnlag (17.3).
- **Budget** – grense per jobb/scene/gruppe/produksjon/prosjekt; strengeste gjelder; retries teller.
- **ProviderAdapterConfig** – leverandør, kapabiliteter (fra adapter), hemmelighetsreferanse (aldri selve nøkkelen i tabellen).

### Endring og avvik
- **ChangeLogEntry** – kommando (ADR-0005).
- **Discrepancy (avvik)** – `targetId` (take/segment/oversettelse/plakat), årsak (`script_changed, resource_changed, continuity_changed, coverage_gap, translation_outdated, timing_conflict`), berørte blokker, sikkerhet, `resolution ∈ {open, accepted, updated, reverted}`, `resolvedBy`. Tre brukervalg (21.2): godkjenn (registreres med versjoner), oppdater/regenerer (ny take ved siden av, kostnad vist først), angre endringen (selektiv invers kommando).

## 3. Livssyklus for de viktigste operasjonene

| Operasjon | Kommando | Effekt |
|---|---|---|
| Flytt scene i manus eller tidslinje | `MoveOccurrence(occurrenceId, newOrderKey)` | Endrer `orderKey`. Manus og film viser ny rekkefølge (samme data). Tidskoder beregnes. ID og nummer uendret. |
| Deaktiver/aktiver | `SetOccurrenceActive` | Ut av aktivt manus, film, varighet, eksport. Ingenting slettes. |
| Rediger replikk | `EditBlockText` | Ny blokkrevisjon. Takes med eldre `blockRevisions` → avvik (bare berørte segmenter, 21.3). Oversettelser → `needs_review`. |
| Rediger delt scene i spinoff | `EditBlockText` i spinoff-kontekst | Lager/oppdaterer spinoff-eid `SceneVariant`; hovedfilmen uendret (24.5). |
| Ny scene i spinoff | `CreateScene(originProductionId = spinoff)` | Ny `sceneId`; ikke i hovedmanus (24.4). |
| Tilbakefør fra spinoff | `PromoteVariant(…, parts)` | Bare etter eksplisitt valg; lager ny hovedvariant/take, overskriver ikke godkjent materiale (25). |
| Splitt narrativt | `SplitScene` | Ny scene-ID for andre del, `derivedFrom`. |
| Segmenter for produksjon | `CreateSegments(reason)` | Nye `ProductionSegment`; manus og nummer uendret. |
| Lokal kontinuitet i spinoff | `SetContinuityOverride(productionId, eventId, action)` | Slår av/erstatter delt hendelse bare i én produksjon (DEC-0020 pkt. 8). |
| Velg aktiv versjon | `SetActiveTake` | Peker endres; andre takes beholdes (15.3). |
| Ny ressursversjon | `PublishResourceVersion` | Konsekvensanalyse; berørte scener flagges; ingen regenerering (8.3). |
| Eksporter manus | `ExportScreenplay(numberingMethod, includeInactive, language)` | Ny `ExportVersion`; interne ID-er uendret (5.2). |
