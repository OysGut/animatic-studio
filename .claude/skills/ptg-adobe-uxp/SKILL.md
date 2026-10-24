---
name: ptg-adobe-uxp
description: "Plugins for Photoshop og Premiere Pro med Adobe UXP mot Connector SDK: manifest v5, tillatelser (network.domains), sikker lagring av tokens, PKCE via systemnettleser og lag/tidslinje-mapping. Bruk ved arbeid på UXP-plugins."
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-adobe-uxp

## Kilder (offisielle)
- Adobe UXP for Photoshop: https://developer.adobe.com/photoshop/uxp/ (manifest, `requiredPermissions`, `secureStorage`, `shell.openExternal`).
- Premiere Pro UXP: https://developer.adobe.com/premiere-pro/uxp/
- Adobe UXP sikkerhet og nettverkstillatelser: https://developer.adobe.com/photoshop/uxp/2022/guides/uxp_guide/uxp-misc/manifest-v5/

## Regler
1. `network.domains` begrenses til appens domene; ingen jokertegn.
2. Tokens lagres i `secureStorage`, aldri i `localStorage` eller pluginfiler.
3. Innlogging: `beginAuthorization` med loopback-redirect eller enhetsflyt; åpne URL med `shell.openExternal`.
4. Lag eksporteres som PNG/PSD fra hvitelisten; opplasting via `upload()` med stabil idempotensnøkkel.
5. Kapabiliteter for Photoshop: read, write, layers, notes. Premiere: read, write, audio, timeline, notes.
