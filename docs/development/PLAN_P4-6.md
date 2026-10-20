# Plan P4–P6 (etter DV) – 20.10.2026

Status: A (polering) bygd. B (lageksport) bygd og lokalt testet. D/0063 er verifisert og publisert av Øystein. C er implementert lokalt med 0064; DB og Cloud-verifikasjon gjenstår.

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
- Minne ved lange PNG-sekvenser – ett komprimert bilde om gangen til zip (`writeZip`), diskbasert mellomlagring der OPFS finnes. Uten OPFS beholdes minnebasert reserve for PNG alltid; dette er et rapportert avvik fra ubetinget strømming.
- AI-linjekobling med 1:n/n:1 krever streng validering for å hindre ugyldige ID-er.
- Stor runde: bygges i rekkefølgen B → D → C, med tester per steg.

## D / M8 og P4-rester – 20.10.2026
- 0063 er endelig lokalt, IKKE kjørt i Cloud. Erstatter apply_changes, delete_project og purge_project_assets fra 0062; create_project fra 0001 (bare tre standardprofiler/aktivt valg); create_dialogue_batch fra 0061 (bare snapshot i jobbreservasjoner). purge_removed_assets urørt. Ny private.guard_quality_profile_job serialiserer månedskapasitet og beskytter metadata.
- Profiler i prosjektinnstillinger og bilde/video/lyd/tale/DV-batch/eksport/alfa, lokale overstyringer, budsjettport, profilnavn og uforanderlige snapshots. Nye prosjekter får standardprofiler; eksisterende får bare tilbud. Backup inkluderer profilene.
- Film/alfa deler seriell klientkø som fortsetter etter dialoglukking; fremdrift/avbryt globalt. OPFS strømmer PNG-ZIP. Uten OPFS beholdes minnebasert reserve for «PNG alltid»: rapportert avvik fra ubetinget strømming. Køen overlever ikke tabblukking/omlasting. WebM-alfa ikke støttet i testnettleseren.
- Automatisk typekontroll/build OK. Vitest 1861 bestått, 0 feilet, 10 eksisterende hoppet over. Lokal DB 135/135. P6 18/18 NO/EN, P4 39/39, DV4 24/24, DV5 20/20, U5 65/65, CA8 22/22, MTS engine 42/42, scene panels 39/39. Verifisering4 51/54: Courier Prime og to falsk-mikrofonkontroller; hybrid-eksport og avspilling bestått på siste kjøring.
- i18n/build_docs/check_kb OK; REQ-0854–0862 registrert, C-krav 0845–0853 utsatt, ingen implementasjon av C. Ingen ekte/betalte AI-kall. Kredittoversikt viser 1033 totalt i perioden 16.10–16.11, ikke et isolert tall for dette oppdraget.

## C / B-050 – 20.10.2026, delvis levert; ikke klart for Cloud
- 0064_translation_line_links.sql skrevet, IKKE kjørt. Erstatter apply_changes/delete_project/purge_project_assets fra 0063_quality_profiles.sql; ingen andre funksjoner erstattet. Schema 64, medlems-SELECT, ingen klientskriving, service-role ALL. purge_removed_assets urørt.
- Gjennomgang per scene etter DEC-0058-import: 1:1/1:n/n:1, sikkerhet og begrunnelse, validering med forkastet-teller, kildefilter, godkjenn/avvis/juster, terskelgodkjenning i én kommando med invers. Godkjente koblinger brukes i oversatt visning uten norsk kildeendring; backup omskriver arrayreferanser.
- Eksplisitt bekreftelse og fingeravtrykkskontroll før eksisterende tjenestebetalte translation_align. Brukerkostnad 0 USD; M8 vises som kontekst og overstyrer ikke tjenestens tekstmodell. Ingen ekte AI-kall eller betalte testkall. Oppdragsisolert kredittforbruk ikke tilgjengelig.
- Språknavn i opptaksdialogen og stablet profilfelt med avstand i alfaeksport er rettet.
- Automatisk typesignal: build OK. Full Vitest 1871 bestått, 0 feilet, 10 eksisterende hoppet over. Nye line-linking unit 10/10. P5 18/18 med norsk/engelsk skjermbilder. DV6 16/16, T2 69/69, Story Lab 32/32 ved isolert gjentak, U5 65/65, P6 18/18. Scene-panels 38/39: Alt-klikk-kontroll feiler også isolert; ingen retting utenfor oppdraget. Verifisering4 full kjøring 50/54: lyd/bilde-avvik 231 ms, Courier Prime-måling og to mikrofonkontroller; isolert gjentak ble avbrutt og teller ikke som full kjøring.
- DB-testkjøring blokkert før første test: lokal Postgres localhost:54329 utilgjengelig. To nye 0064 DB-tester skrevet for RLS/grants, apply_changes, fremmede referanser, delete og purge, men ikke kjørt. Migrasjonen er ikke DB-verifisert og anbefales ikke kjørt i Cloud ennå.
- ÅPENT: Eksisterende import bevarer ikke oversatte linjer uten DEC-0058-regelpar. Gjennomgangen støtter derfor bare lagrede oversettelseslinjer; full B-050 for uparrede importlinjer er ikke ferdig. Dette krever varig importlinjemodell/utvidet importflyt. Ikke rapportert som full C-leveranse.
- i18n 0 uten engelsk; build_docs/check_kb OK (862 krav, 0 udekkede mandatlinjer). REQ-0845–0853 er Implementert – ikke verifisert med eksplisitt importavgrensning.

