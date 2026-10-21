# Plan – M6, resten av produksjonskontrollen (20.10.2026)

Bygger de tre gjenstående delene av M6 (ROADMAP) uten ny migrasjon: alt nytt er enten beregnet (prognose),
lagres med eksisterende kommandoer (`SetContextNames`, `AddAssetVersion`, `UpdateLayers`, `AddAnnotations`)
eller går gjennom eksisterende AI-innganger (`generateText`, `generateImage`, DV7 «Generer røde»).

## A. Oppdatering med AI ved avvik (valg B, DEC-0054)
- Kjernen `src/core/assembly/material-update.ts`: `materialUpdateTargets` finner hva endringen berører i
  2D-scenen: bildelag der ressursen nevnes i endret tekst, røde replikker (DV7-drift) og endrede
  handlings-/shotlinjer. `materialUpdatePrompt` (engelsk) og `materialUpdateFromJson` (validering mot målene).
- Brukerflaten `src/app/assembly/MaterialUpdateSection.tsx` i «Manuset er endret etter materialet»:
  1. Tekst-AI med anslag og eksplisitt bekreftelse lager forslag (bildebeskrivelser og shotforslag).
  2. Bilde: ny generering med kostnadsport og kvalitetsprofil → ny versjon (ikke godkjent); «Bruk i scenen»
     er et eget klikk (`UpdateLayers`). Alt kan angres; ferdig film og godkjente versjoner røres ikke.
  3. Shot/scenebeskrivelse: lagres som notat på linjen (`AddAnnotations`) – manuset endres ikke.
  4. Replikker: DV7 «Generer røde replikker» per karakter (egen kostnadsport og kvalitetsprofil).

## B. Varighetsprognose fra historikk (DEC-0028/KI-28)
- Kjernen `src/core/screenplay/forecast.ts`: talehastighet per karakter og språk fra replikklyd som følger
  gjeldende manus; forholdet faktisk/anslått fra ferdige scener (film eller satt lengde). Spenn fra
  20.–80. persentil; for lite data (< 3 ferdige scener og < 5 replikker) gir standardantakelsene og merket
  «standardantakelser». Bare beregnet, aldri lagret.
- Vises i scenenavigatoren (per scene) og på prosjektoversikten («2:40–3:05, basert på 14 scener»).

## C. Kontekstuell kobling av betegnelser (REQ-0127)
- Kjernen `src/core/library/context-links.ts`: regler først – tvetydige navn avgjøres av hvem som er til
  stede i scenen, kjente kontekstnavn følger samme ressurs, pronomen peker på sist nevnte karakter (usikker).
  Bygger på `assetNames`/`assetsInScene`/kontekstnavnene (OG2-sporet), ikke et parallelt register.
- AI vurderer bare de usikre, via `generateText` med anslag og bekreftelse; svaret valideres mot kandidatene.
- Godkjenning i biblioteket: valgte forslag blir `SetContextNames` i én angregruppe.

## Tester
Vitest for prognose (også lite data), koblingsregler, material-oppdatering (mål, validering, ingen
destruktive kommandoer). DB-suiten kjøres uendret (ingen migrasjon). Visuell suite `tests/visual/m6-rest.mjs`
NO/EN. Regresjon: dv7-drift, storylab-ui, t2-writing-ui, u5-screens, p8-style-harmonize, scene-panels-ui,
verifisering4-ui.
