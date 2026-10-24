---
name: ptg-adobe-legacy-bridge
description: Bro for eldre Adobe-versjoner (After Effects og CC før UXP) via ExtendScript/CEP: lesing av Manifest v1, import av PTG3-pakker og hvorfor skriving går via SDK i en separat hjelpeprosess. Bruk ved After Effects-integrasjon eller CEP/ExtendScript.
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-adobe-legacy-bridge

## Kilder (offisielle)
- Adobe After Effects Scripting Guide: https://ae-scripting.docsforadobe.dev/
- Adobe CEP Resources: https://github.com/Adobe-CEP/CEP-Resources
- Prosjektets PTG3-eksport og `src/core/interchange/media-formats.ts` (AE_SAFE_EXTENSIONS).

## Regler
1. ExtendScript har ingen moderne kryptografi; tokens og HTTP håndteres av en liten Node/SDK-hjelper, aldri i JSX.
2. Bare formater i AE-hvitelisten importeres; konvertering skjer i appen før pakking.
3. Kapabiliteter: read, layers, timeline. Skriving tilbys ikke; UI viser «Eksporter for After Effects».
