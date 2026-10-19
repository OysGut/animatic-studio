# MU1
# CA designpuss og CA3
- [ ] A: faner, pen tidslinjal, Tilpass, miniatyrer/etiketter, kvadrater, navigator og lyd nederst; tester.
- [ ] B: rigmodell/kommandoer/evaluering, ansiktsmarkering, av/på, backup, migrasjoner og tester.
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
- [ ] GP2 globalt bibliotek – venter på godkjent GP1 og svar på åpne spørsmål 1–2
- [ ] GP3 videreføring
- [ ] GP4 AI-start
- [ ] GP5 QR-filmvisning – venter på svar på spørsmål 4–5
# GP2–GP5
- [x] GP2 globalt bibliotek (0046), GP3 videreføring, GP4 nytt prosjekt med skriveassistent, GP5 QR-deling (0047). Migrasjoner skrevet, ikke kjørt. DB- og nettlesertester kjøres av Øystein.
# MT (Motion Typography) runde 1
- [x] MT1: modell, renderFrame/canvas, 0048, lat fontlasting og fontsReady i eksporten
- [x] MT2 egenskapspanel for tekst, form og effekter, «Legg til tekst»
- [x] MT3 bokstavanimasjon og knapper for inn/ut
- [x] MT4 «Lagre som mal» med miniatyr, varsel og oppdatering ved ny malversjon; 256 kB-grense
- [x] MT5 lower thirds og «Bruk samme design som i scene …»
- [x] DB-tester 0048/0049, nettlesertester mts-engine, mts-lower-thirds, mts-nondestructive (AI–AJ) skrevet; Øystein kjører dem
- [ ] Nettlesertester mts-engine, mts-lower-thirds, mts-nondestructive (AI–AJ)
- [ ] MT6–MT9 neste runde (inkl. occurrences.kind, manusmarkør, filtre i manusutforsker/OG2/oversettelse)

# T2 – AI-skrivehjelp i manuset
- [x] T2.1–T2.6: kjerne, serverfunksjon, panel, diff, hurtigtaster, kontekstmeny, forlatevakt.
- [x] T2.7 unit-tester (17).
- [ ] Nettlesertest tests/visual/t2-writing-ui.mjs – ikke skrevet ennå.

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
- [ ] CA3–CA8 — venter på egne oppdrag; Rhubarb, vektormasker og 512 kB er avklart.
