---
name: ptg-plugin-security
description: Sikkerhetsregler for plugins og Creative Connectors: OAuth 2.0 Authorization Code + PKCE (S256), enhetsflyt, kortlivede prosjekt-/scope-tokens lagret som SHA-256, rotasjon med gjenbruksdeteksjon, fartsgrenser, kvoter, innholdssjekk og ingen hemmeligheter i pluginkode. Bruk ved all auth-, token-, opplastings- eller pluginsikkerhet.
metadata:
  version: "0.1.0"
  owner: "animatic-studio"
  last-reviewed: "2026-10-24"
---

# ptg-plugin-security

## Kilder (offisielle)
- RFC 6749 (OAuth 2.0), RFC 7636 (PKCE), RFC 8628 (Device Authorization Grant), RFC 8252 (OAuth for native apps, loopback-redirect), RFC 7009 (revocation), OAuth 2.0 Security BCP (RFC 9700).
- OWASP File Upload Cheat Sheet.

## Regler
1. Bare `S256`; `plain` avvises. Koden er engangs og lever 120 s.
2. Tilgangstoken 15 min, refresh 30 dager (maks 90 fra opprettelse), rotasjon ved hver bruk; gjenbruk trekker tilbake sesjonen.
3. Serveren lagrer bare `tokenHash`; klartekst returneres én gang.
4. Hver forespørsel: hash-oppslag, utløp, tilbaketrekking, medlemskap, prosjekt og scope (`checkSession`). Fartsgrense (G-8) og kvote (G-5).
5. Filer: endelse i hvitelisten, innholdssniffing og SHA-256 før kandidat.
6. Ingen klienthemmeligheter i plugins; klient-ID er offentlig.
