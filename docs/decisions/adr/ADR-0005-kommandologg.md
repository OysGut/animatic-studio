# ADR-0005 – Endringer som kommandologg
- **Status:** Gjeldende · **Dato:** 2026-10-08 · **Beslutning:** DEC-0011 · **Type:** Teknisk anbefaling
- **Berørte krav:** kap. 2.2, 3.4, 4.4, 5.1, 21.2 C, REQ-0525, REQ-0527 · **Moduler:** CORE, VERSION, COLLAB

## Beslutning
Hver endring er en kommando: `{id, project_id, production_id?, author, created_at, type, payload, inverse, affected_ids[], base_revisions}`.
- Kommandoer valideres i `src/core/commands` (rene funksjoner: tilstand + kommando → ny tilstand eller feil). Samme validering kjøres i backend-RPC for atomisk utførelse.
- Strukturkommandoer (flytt, aktiver/deaktiver, splitt, slå sammen, overfør, bytt aktiv versjon) er alltid én transaksjon som oppdaterer både manusvisning og filmmontering (de er samme data – INV-01).
- `inverse` gjør angre mulig. Selektiv tilbakeføring (21.2 C) = utfør inversen av én bestemt kommando hvis berørte objekter ikke er endret siden, ellers vis konflikt.
- Loggen er grunnlag for historikk, «hvem gjorde hva», konsekvensanalyse og avviksdeteksjon (hvilke blokker endret seg etter at en render ble laget).
## Alternativer
Full event sourcing som eneste lagring (for tungt i MVP); kun øyeblikksbilder (gir ikke selektiv angre).
## Konsekvenser
+ Én mekanisme for angre, historikk, samarbeid og avvik. − Krever disiplin: ingen direkte tabellskriving fra UI.
## Verifisering
Egenskapsbaserte tester: utfør kommando → inverse gir identisk tilstand; tilfeldige sekvenser bryter aldri invariantene.
