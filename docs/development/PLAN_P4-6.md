# Plan P4–P6 (etter DV) – 20.10.2026

Status: A (polering) bygd. B (lageksport) bygd og lokalt testet. D er bygd med 0063 lokalt; C er ikke del av denne runden.

## A. Polering etter DV (ferdig)
- Huskelapp: visningsnavn hentes fra profilene (`useProfiles`) der lappen vises; «ukjent» bare når navnet mangler.
- Batchdialog: produksjonsnavn én gang i gruppeoverskriften; «· produksjon» ved scenen bare ved flere produksjoner.
- Entall/flertall (replikk/replikker, scene/scener) i batchdialogen, plakatinspektøren og «Legg i scener».
- Manglende stemme/modell vises som «stemme ikke valgt» / «modell ikke valgt».

## B. Punkt 4 – lageksport med alfa (REQ-0837–0844)
- Datamodell: ingen ny tabell. Eksportvalg (`layerIds`, `range`, `effects`, `alpha: straight|premultiplied`, `format: png-seq|webm-vp9`) i klientens eksportflyt; valg huskes lokalt per prosjekt. Film og alfa deler en klientkø med global fremdrift/avbryt; dialoglukking stopper ikke eksport.
- Renderer: samme `film.ts`/compositor som vanlig eksport, med `background: transparent` og lagfilter; formatadapter-grensesnitt `AlphaEncoder` (png-seq, webm-vp9; ProRes 4444/MOV senere, DEC-0085).
- Ingen stille fallback: WebM-alfa sjekkes med `VideoEncoder.isConfigSupported({ alpha: "keep" })`; ellers tydelig melding og valget sperres.
- Tester: vitest piksel for piksel (hjørner alfa 0, figur alfa 255, premultiplisert vs. rett), visuell `p4-alpha-export.mjs` (36/36: faktiske PNG-ZIP-nedlastinger på norsk/engelsk, maskering, effektvalg og avbryt). WebM-alfa er sperret i testnettleseren; faktisk WebM-alfa er ikke verifisert.

## C. Punkt 5 – AI-linjekobling (B-050, REQ-0845–0853)
- Regelkobling (DEC-0058) først; bare usikre linjer sendes, per scene, klippet som i `align-prompt.ts`.
- Kjerne: `src/core/translation/line-align-prompt.ts` (prompt, validering av 1:n og n:1, sikkerhet, begrunnelse).
- Server: utvidelse av `translation-align` (innebygd AI, B-047-unntaket), med kostnadsanslag og eksplisitt bekreftelse før kallet.
- Data: planlagt `translation_line_links` (project_id, språk/importreferanse, source_block_ids[], target_line_refs[], origin rule|ai|approved|manual, confidence, reason, revision, removed …) – migrasjon fra 0063. Dagens modell har `translations` per blokk/språk, ikke en `language_versions`-tabell; målreferansens varige identitet må følge importmodellen, ikke et oppdiktet tabellnavn.
- Kommandoer `ApproveLineLinks`, `RejectLineLinks`, `SetLineLink` med invers; samlet godkjenning over terskel er én angregruppe. Norsk manus endres aldri.

## D. Punkt 6 – M8 kvalitetsprofiler (REQ-0854–0862)
- Data: `quality_profiles` (navn, modeller per AI-type, oppløsning, innsats, varianter, eksport, budsjett) og `projects.active_quality_profile_id` – migrasjon 0063.
- Kommandoer `AddQualityProfile`, `UpdateQualityProfile`, `SetQualityProfileRemoved`, `SetActiveQualityProfile`.
- Quality & Cost Engine: `providers.ts`/`cost.ts` tar profilen inn; resultater får `qualityProfileId` + øyeblikksbilde i metadata. Profilbytte endrer aldri gamle resultater.

## Endelig migrasjon 0063 (skrevet og lokalt testet; ikke kjørt i Cloud)
- Nye tabeller med revoke/grant og RLS (medlemmer leser, klient skriver ikke).
- Erstatter `apply_changes`, `delete_project`, `purge_project_assets` (kopiert fra 0062). `purge_removed_assets` urørt.
- Skjemaversjon 63; backup tar med profiler. Linjekoblinger er utsatt til C.
- create_project fra 0001: bare standardprofiler/aktivt valg; create_dialogue_batch fra 0061: bare profilmetadata i reserverte jobber. Ny privat budsjett-trigger.

## Risiko
- WebM-alfa varierer mellom nettlesere; positiv WebCodecs-støtte kreves. Testnettleseren støtter ikke `alpha: keep`.
- Minne ved lange PNG-sekvenser – ett komprimert bilde om gangen til zip (`writeZip`), diskbasert mellomlagring der OPFS finnes. File System Access brukes uten OPFS; uten begge sperres lageksport tydelig.
- AI-linjekobling med 1:n/n:1 krever streng validering for å hindre ugyldige ID-er.
- Stor runde: bygges i rekkefølgen B → D → C, med tester per steg.
