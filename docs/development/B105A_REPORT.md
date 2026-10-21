# B-105a / KR-1 – fortløpende rapport

## Status 21.10.2026

**Ikke ferdig.** Denne leveransen er bildegrunnlaget og kartleggingen, ikke ferdig integrasjon. Eksisterende opplasting, eksport og AI-kall er fortsatt uendret. KR-1 er kartlagt, men ikke utført; det gjøres etter B-105a som bestilt.

## Implementert grunnlag

- `src/core/library/image-ingest.ts`: ren størrelsesplan og eksplisitt filvalg. Originalen beholder størrelsen; arbeidskopien følger `workingImageMaxSide`; proxy følger minste av filmens lengste side og 1920 px; miniatyr begrenses til 256 px. Ingen oppskalering.
- `src/adapters/browser/image-ingest.ts`: nettleseradapteren `ingestImage(file, context)` returnerer uendret original, arbeidskopi og WebP-proxy/miniatyr. TIFF dekodes til en renderbar PNG for avledning, men råfilen returneres uendret. **Adapteren er ennå ikke koblet til opplasting/lagring.**
- Bildeforberedelsen er flyttet til `src/adapters/browser/image-prep.ts`; den gamle inngangen `src/app/library/image-prep.ts` videresender eksportene, så eksisterende opplasting og tester beholder kompatibilitet.
- `src/core/library/lru.ts` og `src/app/rig/contour-client.ts`: eksplisitt LRU med 64 elementer, testet for grense og nylig bruk. `ImageCache` er ikke endret.
- Arkitekturregelen for bildeforberedelse er lagt til i `AGENTS.md`.

## Kartlegging

Samme nåværende opplastingsfunksjon brukes i AssetDetail, LayerImageDialog, ReuploadDialog, CutoutDialog, image-actions, mts-actions og MouthShapeEditor. De sekundære inngangene sender i dag ofte ingen størrelsesgrense. Mobilimport og gjenoppretting av lagrede AI-filer bruker `mediaFromStoredFile` og må også integreres.

Andre bildeveier som må vurderes eksplisitt: AI-resultater, uttrekk av videoframes, referansebilder til scenevideo, backupgjenoppretting og kopier fra globalt bibliotek. Eksisterende TIFF-opplasting bevarer ikke rå TIFF; den lagrer konvertert PNG. Dette er funnet i kartleggingen, ikke rettet i dagens aktive opplastingsflyt.

Proxyvalg må knyttes til konkret bruk. Kompositor, filmforhåndsvisning og rigg bruker i dag valgt versjons `mediaPath`; høyere eksportoppløsning alene gjenoppretter ikke detaljer fra originalen.

Story Lab-klientene bygger fortsatt promptene. Kartlagte innganger: ConversationView, GroupConversationView, SceneLab, InterviewView, ProfileGenerateDialog og scene-batch. Bildeinnganger inkluderer GenerateImagePanel, ImageAiPanels, ImagePartsPanel, HarmonizePanel og MaterialUpdateSection. Serverflytting må gjenbruke `runTextGeneration`/`runImageGeneration` og eksisterende medlemskontroll, kvoter og kvitteringer uten leverandør- eller modellendring.

## Migrasjon

Ingen migrasjon er skrevet eller kjørt i denne delrunden. Neste ledige nummer i repoet er 0078 etter 0077. En nullable versjonskolonne for avledede filer kan håndteres av dagens dynamiske `apply_changes`, men `purge_project_assets` og `purge_removed_assets` fra 0072 samler bare eksisterende mediestier og må utvides hvis avledede filer lagres der. Endelig modell, backup og global kopiering er ikke ferdig implementert; ingen skjemaversjon er økt.

## Faktisk kontroll

- Full Vitest: **2205 bestått, 10 eksisterende hoppet over, 0 feilet**; 272 testfiler bestått og 2 hoppet over.
- Målrettet kjøring: **52/52** (ny størrelses-/filvalgtest, konturtest, eksisterende bildefunn og arkitekturtestene).
- Ny `tests/unit/b105a-image-ingest.test.ts`: **10/10**. Testene dekker størrelser, ikke-oppskalering, original/proxy/miniatyrvalg og 64-elementers LRU.
- Nettleseradapter: **6/6**, ekte syntetisk PNG på 6000 × 4000; råfilidentitet og SHA-256 uendret; arbeidskopi 3840 × 2560; WebP-proxy 1920 × 1280; WebP-miniatyr 256 × 171. Skjermbildet er kontrollert og begge avledede bilder vises. **Dette er ikke en test av alle opplastingsinngangene eller eksporten.**
- `tests/visual/b105a-ingest-adapter.mjs` med Python-reserve bruker eksisterende Playwright uten ny npm-pakke. Første Node-kjøring manglet Playwright-pakken; kontrollen ble gjennomført med eksisterende Python Playwright.
- Språkinventar og `build-catalog.mjs` regenerert; `check.mjs`: 0 tekster uten engelsk. Ingen nye språkstrenger er opprettet; adapteren gjenbruker eksisterende oversatte feiltekster.
- Automatisk kontroll viste `build OK` etter kompatibilitetsinngangen ble gjenopprettet. Manuell prosjektbygging/typekontroll er ikke kjørt; miljøet kjører dette automatisk.
- DB og bestilte visuelle regresjoner er **ikke kjørt** i denne delrunden.

## Produksjonskontroll

Ingen eksisterende produksjonsoutput (`dist`, `build`, `.output` osv.) ble funnet. Antall kildekart, rutebunter og størrelser i produksjonsbygget er derfor **uverifisert**, ikke rapportert som null eller godkjent. Bygget må inspiseres når faktisk produksjonsoutput finnes.

## Gjenstående arbeid

1. Koble ingest til alle innganger; lagre og validere filreferanser, migrasjon, backup/global kopiering og opprydding.
2. Ikke-blokkerende oppgradering av eldre bilder; konkret proxy/originalvalg i visning, eksport og rigg.
3. Serverbygde Story Lab- og bildeprompter med zod, autorisert prosjektlesing og arkitekturvakt.
4. Full inngangs-/eksporttest, bestilte regresjoner én om gangen og lokale DB-tester.
5. Produksjonsoutput med rutebunt-/kildekarttall.
6. KR-1: kravregister og genererte KB-dokumenter etter B-105a.

## Avvik / åpne spørsmål

Ingen produktvalg er endret, ingen betalte AI-kall, ingen nye npm-pakker eller direkte databaseendringer. Ingen spørsmål til produkteieren; rester er implementasjonsarbeid, ikke blokkerte brukeravklaringer. Delrunden er uttrykkelig ikke fullføring av oppdraget.