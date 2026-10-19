# DV1+DV2 – Dialog og stemme (19.10.2026)
- [x] Spesifikasjonsfil (komprimert gjengivelse) i docs/product/phase3/DIALOGUE_VOICE_SPEC.md.
- [x] DV1: klikk i manus flytter avspillingshodet (ord → tidskobling → klippstart → anker), estimert/mangler, dobbeltklikk åpner opptaksdialogen med replikken.
- [x] DV2: migrasjon 0060 skrevet og testet lokalt (ikke kjørt i Cloud – Claude kjører den).
- [x] DV2: kommandoer med invers, én speilingsfunksjon, lydeditor redigerer aktiv versjon.
- [x] Tester: egenskapstest tapsfrihet, speiling, backup-rundtur, DB 0060, dv1/dv2 visuelle suiter, regresjon.
- [ ] Senere DV-steg (DV3–DV8): versjonsliste i dialogeditoren, note_flags, bokmerker, stemmer/generering, avvik.

# B2 / estimatliste – 19.10.2026
- [x] DEC-0099 fra leverte kilder, REQ-0740–0749, build_docs/check_kb.
- [x] Appens avsendertekst, KI-224/226 notater, KI-220 plassering, KI-207 bekreftelsesflyt.
- [x] KI-247 projisert kobling og SV1 metode 4 minnemiks før Bruk, tester.
- [x] Vitest to fullførte grønne kjøringer, lokal DB, U5, CA1–CA8, scene-panels, lydeditor, B2 NO/EN.
- [ ] KI-167/KI-209: blokkert av manglende godkjent servermedietjeneste/decoder; full bakgrunnsinnlegging ikke bygget.
- [ ] KI-243 produksjonsartefakt: klientgrense innført; ferdig serverartefakt må kontrolleres av Claude.
- [ ] Verifisering4 REQ-0050: miljøet måler 6,439 em, 57/58; forventningen er beholdt.
- [ ] Cloud 0059 og ekte storage-prøving: Claude kjører migrasjonen og prøver rydding.

# MU1
## Dokumentasjon og backlogg (2026-10-19)
- [x] A: tydelige fixturebilder i Story Lab og animasjon; kontroller lasting.
- [x] B: DEC-0099, tilgjengelige kravkilder og samordnet status; build_docs/check_kb.
- [x] B2: DEC-0099 fra leverte kilder; krav kap. 42–51; build_docs/check_kb.
- [x] C: stabil take-rekkefølge og tidstest, malbilder, valgt lydklipp, dra lydsegmenter med én angring.
- [x] Vitest to ganger, lokale DB-tester og bestilte visuelle regresjoner.
## U5-polish
- [x] Initial og typeikon i Story Lab/bibliotek og miniatyrer i alle animasjonssporhoder.
- [x] Toppjustert forhåndsvisning med skrivebeskyttet lagliste og panelfarge under bildet.
- [x] Stabil kostnadsventing; U5 56/56, CA1–CA8 155/155, Story Lab 32/32; Vitest 1714 bestått, 10 eksisterende hoppet over.
# CA4
- [x] Forhåndsvisning toppjustert, alle spor med bilde/typeikon, lyd rett under sporene.
- [x] Munnformeditor, tegneark, vektorpensel og ikke-destruktive deljusteringer.
- [x] QR-import med eksplisitt rigg-godkjenning og migrasjon 0055.
- [x] Unit-/DB-/mocktester, CA1–CA3-regresjoner og dokumentasjon.
- CA5 tas separat; denne pakken fullfører CA4.
- [x] CA4 Cloud-aktivering (0055) bekreftet. Ekte mobilprøving følges i TODO.
# CA designpuss og CA3
- [x] A: faner, pen tidslinjal, Tilpass, miniatyrer/etiketter, kvadrater, navigator og lyd nederst; tester.
- [x] B: rigmodell/kommandoer/evaluering, ansiktsmarkering, av/på, backup, migrasjoner og tester.
## T2 og samtidige takes – rettinger
- [x] Vent på alle tre innsettinger og kontroller orderKey i T2-testen.
- [x] Stabiliser take-/versjonsrekkefølge og test samme tidsstempel med motsatt UUID-rekkefølge.
- [x] Kjør hele Vitest-suiten tre ganger: 1623 bestått, 0 feilet, 10 eksisterende hoppet over hver gang.
## MT retterunde 4
- [x] Bevar globale maldefinisjoner gjennom lagring og bruk; 0052 skrevet, ikke kjørt.
- [x] Rundtur- og DB-tester skrevet; S venter; fixture, unit-tester og mockede nettlesertester grønne. DB-testen kjøres av Claude sammen med 0052.

- [x] Flytende popup på z-40, under Radix-portalene (z-50) og over arbeidsflaten. Tsc rent; vitest 1451 bestått.
- [x] Rett MU1/OG1-testenes teksthistorikk, overskriftsfelt og engelske gruppe; høyreforankre popupen. Vitest: 1451 bestått etter omkjøring med to arbeidere; automatisk typekontroll grønn. Øystein kjører nettlesertestene.
- [x] Aktiv-scene-buss og Story Lab-scenefølging.
- [x] Manusutforsker: popup, eksisterende søk/manus/notater og festet vindu.
- [x] Unit-tester og mocket nettlesertest (skrevet; Øystein kjører nettlesertesten).
- [x] Avgrenset canvasretting: 24 px forskyvning.
- [x] Vitest: 1432 bestått, 10 eksisterende hoppet over; i18n: 0 uten engelsk; automatisk typekontroll: build OK.

# OG1
- [x] Utvid eksisterende forslag med leksikon, signaler og sikkerhet.
- [x] Valgfri AI-vurdering med kostnadsbekreftelse og gjennomgang per type.
- [x] Unit-tester og mocket nettlesertest (skrevet og syntakskontrollert; Øystein kjører den).
- [x] Vitest: 1451 bestått, 0 feilet, 10 eksisterende hoppet over. I18n: 0 uten engelsk. Automatisk typekontroll: build OK.
# OG2
- [x] Migrasjon 0041 (skrevet, ikke kjørt), DB-tester.
- [x] Serverfunksjoner med innebygd AI, tak og lås.
- [x] Bakgrunnsanalyse, status i forslagsknappen, «Analyser på nytt».
- [x] AI-forslag i engelsk språkkobling (må godkjennes).
- [x] Personverntekst og AGENTS.md-regel.
- [x] Unit- og nettlesertester.

# OG2 retterunde 1
- [x] Rett reanalysemock og samle skjemaversjon i nettlesertestene.
- [x] Skill brukerens tekstgrense fra tjenestens tak; test begge veier.
- [x] Bruk lagret analyse i sceneforslag og SceneAssetsPanel; test begge.
- [x] Kontroller Manusutforskeren (bare filtre, ingen ressursforslag). Vitest: 1479 bestått, 10 eksisterende hoppet over. I18n: 0 uten engelsk. Automatisk typekontroll grønn. Nettlesertestene kjøres av Øystein.
- [x] SV1: endring av scenevarighet (fem metoder, fyll, låste tidsrom, RetimeScene, migrasjon 0042 skrevet)
# AS (Asset Studio)
- [x] AS retterunde 2: feltnivå-rebase, eksakte egne skrivekvitteringer, skjult-lag-hit-test, pekerdrag og testrettinger a–h. Vitest 1529 bestått, 10 eksisterende hoppet over; automatisk typekontroll grønn; i18n 0 manglende. Nettlesertesten kjøres av Øystein.
- [x] AS1: utkast, UpdateSceneDraft, skall, lagring/avbryt, konfliktdialog, tastatur.
- [x] AS2: variantstripe, bildesegmenter, krysstoning, aktivt tidsområde (0043 skrevet), to visninger og avspillingsområder.
- [x] AS3: lydgrupper, forhåndslyttingsdemping, medieverktøy, «Vis manus», forsøksvise redigeringer (0044 skrevet), «Bruk forslaget».
- [x] Unit-, DB- og nettlesertester skrevet. Migrasjoner og nettlesertester kjøres av Claude.

## GP – global pakke
- [x] GP1 arbeidsgrupper (0045 skrevet, venter på Claude)
- [x] GP2 globalt bibliotek levert og publisert.
- [x] GP3 videreføring
- [x] GP4 AI-start
- [x] GP5 QR-filmvisning
# GP2–GP5
- [x] GP2 globalt bibliotek (0046), GP3 videreføring, GP4 nytt prosjekt med skriveassistent, GP5 QR-deling (0047). Migrasjoner skrevet, ikke kjørt. DB- og nettlesertester kjøres av Øystein.
# MT (Motion Typography) runde 1
- [x] MT1: modell, renderFrame/canvas, 0048, lat fontlasting og fontsReady i eksporten
- [x] MT2 egenskapspanel for tekst, form og effekter, «Legg til tekst»
- [x] MT3 bokstavanimasjon og knapper for inn/ut
- [x] MT4 «Lagre som mal» med miniatyr, varsel og oppdatering ved ny malversjon; 256 kB-grense
- [x] MT5 lower thirds og «Bruk samme design som i scene …»
- [x] DB-tester 0048/0049, nettlesertester mts-engine, mts-lower-thirds, mts-nondestructive (AI–AJ) skrevet; Øystein kjører dem
- [x] Nettlesertester mts-engine, mts-lower-thirds, mts-nondestructive (AI–AJ)
- [x] MT6–MT9 og GP6 levert, verifisert og publisert.

# T2 – AI-skrivehjelp i manuset
- [x] T2.1–T2.6: kjerne, serverfunksjon, panel, diff, hurtigtaster, kontekstmeny, forlatevakt.
- [x] T2.7 unit-tester (17).
- [x] Nettlesertest tests/visual/t2-writing-ui.mjs levert og verifisert (69/69 hos Øystein).

# U2 – Felles tetthet for verktøylinjer og panelhoder
- [x] Felles komponenter (Toolbar 32 px, «Mer …», IconButton med verktøytips, PanelHeader) og tokens
- [x] «Mer …» i sceneeditoren, manuset og biblioteket; ikonknapper byttet på alle skjermer
- [x] Nettlesertest u2-chrome-ui.mjs (20/20)
- [ ] Primærknapper som ikke finnes i dag (sceneeditor «Eksporter», manus «Ny scene», bibliotek «Ny ressurs», prosjekt «Åpne manus") – venter på avklaring

- U2 del 3: ferdig. Nye primærknapper tas i U4/U5.

## CA – Character Animation Studio (plan godkjent 19.10.2026)
- [x] CA0 Spesifikasjon lagret (docs/product/phase3/CHARACTER_ANIMATION_SPEC.md)
- [x] CA1 Fane, tidslinje, avspillingsområde, navigator, forhåndsvisning og tester
- [x] CA2 Bildevarianter, dialogspor og tester
- [x] Rett canvas-testens venting på én kant (maks 3 sekunder).
- [x] CA3: riggmodell, ansiktsmarkering og migrasjoner 0053/0054 skrevet; unit- og mocktester grønne.
- [x] CA3 DB-verifisering og Cloud-aktivering bekreftet av Øystein.
- [x] CA5/CA6: leppesynk, blink og mønstre (0056 kjørt).
- [x] CA7: global gjenbruk, arv og versjonering; migrasjon 0057 skrevet.
- [x] CA8: rytmeverktøyet og eksportvalg per lag.
- [x] CA7 Cloud-aktivering: migrasjon 0057 kjørt.
- [x] CA8 Cmd/Ctrl-dragmodus og beskyttede tidsområder (U5 del B).

## CA5 + CA6 (2026-10-19)
- [x] CA5: leppesynk (Rhubarb WASM / regelbasert reserve), lipsync_results, av/på per replikk, forslag med Bruk/Forkast, munnformsspor, overstyringer, evaluateCharacterFrame
- [x] CA6: blinking med seed, overlegg/løkker, kurveeditor, navngitte mønstre, deterministisk seed per bruk
- [x] Migrasjon 0056 (lipsync_results m.m.), DB-tester
- [x] Visuelle suiter ca5-lipsync.mjs + ca6-blink-patterns.mjs, regresjon ca1–ca4
- [x] Docs: requirements, KNOWN_ISSUES, SESSION_HANDOVER

## U5 (2026-10-19)
- [x] Del A: skjerm for skjerm (prosjekter, manus, bibliotek/Story Lab, sceneeditor/animasjon, montering, eksport, mobil, felles tilstander)
- [x] Del B: Cmd/Ctrl-dra og beskyttede tidsområder via RetimeScene
- [x] Del C: KI-SL-1 (lydtestene ventet ikke på dekodet lyd)
- [ ] «Sist endret» på prosjektkortene: krever en kolonne for sist endret (ikke bestilt; ingen migrasjon i U5)

## Sikkerhets-TODO Ø-11 (2026-10-19)
- [x] AssetThumb: reserve ved lasting/feil, u5-test med feilende URL
- [x] Invitasjoner krever riktig e-post (prosjekt + gruppe), DB-tester
- [x] ai_model_settings / ai_provider_keys lesetilgang, DB-tester
- [x] Story Lab RLS + tekst-AI-serverfunksjoner (auth, medlemskap, grenser, validering, ingen lekkasje)
- [x] Linter/advisor, npm audit, GP5-lenker, mobilopplasting
- [x] SECURITY_REVIEW_2026-10.md, KNOWN_ISSUES, SESSION_HANDOVER
- [x] Migrasjon 0058 kjørt i Cloud og hashkontrollert av Claude/Øystein.
