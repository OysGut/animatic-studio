# Retningslinjer for eksterne skills og plugins

Status: Teknisk anbefaling (DEC-0016). Krav: oppdraget del F/F1/F2. Vurdering av konkrete kandidater: `docs/references/technical/SKILLS_ASSESSMENT.md`.

## Før noe eksternt installeres
Registrer i tabellen under og kontroller:
1. **Utgiver og autentisitet** – offisiell organisasjon (anthropics, vercel-labs, supabase, microsoft) eller kjent vedlikeholder? Repo-URL stemmer?
2. **Lisens** – LICENSE-fil finnes og tillater bruk (MIT/Apache-2.0). Mangler lisens → ikke installer, bruk høyst som lesereferanse.
3. **Versjon** – pinnet commit-SHA eller versjonsnummer. Aldri `main`/`latest`.
4. **Oppdatert** – siste commit-dato; vedlikeholdt?
5. **Kodekjøring** – skript, hooks, `npx …@latest`, MCP-servere? Les dem før installasjon. Upinnede kommandoer erstattes med pinnede eller fjernes.
6. **Tilgang** – ber den om hemmeligheter, `.env`, nettverk, OAuth, databasetilgang, publisering? Sender den kode/diff til tredjepart?
7. **Konflikt med mandatet** – instruksjoner som strider mot CLAUDE.md, invariantene eller designsystemet (f.eks. «ta estetisk risiko»)?
8. **Duplisering** – finnes en innebygd eller allerede installert skill som dekker det samme? (F2)

Installer bare etter at punktene er dokumentert. Plugins som kan koste penger, publisere eller skrive til database krever Mars' godkjenning (DEC-0006).

## Register

| Navn | Kilde | Versjon/SHA | Lisens | Kjører kode | Status | Vurdert |
|---|---|---|---|---|---|---|
| (ingen installert) | | | | | | |

## Gjennomgang
Ved hver milepælsrevisjon: er pinnede versjoner fortsatt riktige, finnes sikkerhetsmeldinger, brukes skillen faktisk?
