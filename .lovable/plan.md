# Statusrapport og forslag til neste steg (21.10.2026)

Ingen kodeendringer. Hvis planen godkjennes, lagres rapporten som `docs/development/STATUS_2026-10-21.md`, og ingen andre filer endres.

## 1. Status (`requirements.yaml`, 878 krav)

| Prioritet | Verifisert | Implementert, ikke verifisert | Under arbeid (delvis) | Ikke startet |
|---|---|---|---|---|
| P0 | 132 | 8 | 1 | 6 |
| P1 | 363 | 134 | 12 | 34 |
| P2 | 145 | 0 | 0 | 4 |
| P3 | 26 | 11 | 0 | 2 |
| **Sum** | **666** | **153** | **13** | **46** |

Kravene under «Implementert, ikke verifisert» for P0 og P1 er 142 til sammen. 54 av dem har allerede en test oppført, mens 88 mangler en. 34 av P1-kravene under «Ikke startet» (REQ-0450–0530) er prosess- og mandatkrav som beskriver hvordan Claude og Lovable skal jobbe, ikke funksjoner i appen. De kan bare få status ved et vedtak.

**P0 som ikke er verifisert (15):**
- REQ-0022 – skille mellom strukturell og innholdsmessig synk (implementert, har test)
- REQ-0037 – stabile ID-er for alle domeneobjekter (under arbeid)
- REQ-0145 – publisering er en eksplisitt brukerhandling (implementert, har test)
- REQ-0269 – leverandøruavhengig AI (implementert)
- REQ-0291 – jobber som er uavhengige av nettleserfanen (notatet sier at ekte kø gjenstår, M5)
- REQ-0293 – vedvarende jobbarkitektur i backend (implementert)
- REQ-0504 – jobber og status bevares mellom økter (implementert)
- REQ-0503 – publisering av harmoniserte bilder etter godkjenning: står som «Ikke startet», men ble bygget i P8 og R3, så statusen er utdatert
- REQ-0769 / REQ-0770 – DV: gamle lydversjoner og redigeringen deres bevares (har test)
- REQ-0464, 0475, 0508, 0517, 0518 – prosesskrav fra mandatet

**P1 som ikke er verifisert, gruppert (den fullstendige lista med én linje per ID legges i vedlegget til rapporten):**
- DV-pakken REQ-0750–0836 (87 krav): M-, D-, L-, V-, G-, S-, A-, R-, B- og H-kravene. De er bygget og har visuelle suiter, men venter på kontroll hos Claude eller på ekte opptak.
- P4/P5/P7 (REQ-0837–0870), M6 (REQ-0871–0873), P8-retting (REQ-0874), ML1 (REQ-0875–0878).
- Fase 5-AI: REQ-0623, 0625–0628 og 0633 krever prøving med ekte nøkler (KI-193, KI-204).
- Mobil og lyd fra fase 2: REQ-0685, 0687, 0689, 0697, 0699, 0704, 0708, 0709 og 0711 krever ekte telefoner og ekte norsk lyd.
- Story Lab REQ-0740–0749 (under arbeid). Ikke alle reisene er testet fra start til slutt.
- REQ-0049 (be om manglende referansefiler), REQ-0121 (sentralt ressursbibliotek), REQ-0429/0430 (informasjonsarkitektur og norske funksjonsnavn).

**Avvik i dokumentene:** tallene i `TODO.md` er utdaterte (22 implementert og 58 ikke startet, mot 153 og 46 i `requirements.yaml`). TODO-punktene om ProRes og stilharmonisering under «Bestilt, ikke bygget» er allerede bygget (P7/R4 og P8/R3).

## 2. Forslag: de 5 viktigste neste oppgavene

1. **Verifiseringsrunde V1: status lik virkelighet.** Krav: de 54 P0/P1-kravene som har test, REQ-0503 og REQ-0145. Hvorfor nå: 142 uverifiserte P0/P1-krav gir et falskt bilde av hvor langt Trollfilm har kommet. Mange trenger bare at testen kjøres og status oppdateres. Omfang: 1 runde, ingen migrasjon. Produktvalg: nei.
2. **Ekte bakgrunnskø for AI-jobber (M5).** Krav: REQ-0291, 0293, 0504, KI-209. Hvorfor: tre P0-krav, og lange video- og bildejobber til «Jula på Dovre» stopper eller må hentes manuelt når fanen lukkes. Varslingen bygger på det samme. Omfang: 2–3 runder, med migrasjon (0069). Spørsmål til Mars: *Skal du få beskjed når en lang jobb er ferdig? A) bare i appen, B) e-post, C) SMS (koster per melding).*
3. **Stabile ID-er og synkronisering (fullføre P0-grunnmuren).** Krav: REQ-0037, REQ-0022, REQ-0518. Hvorfor: alt annet (språkversjoner, spinoffer, lyd) hviler på dette. Et hull her kan gi tap av data senere. Omfang: 1–2 runder. Første steg er en kartlegging av hvilke objekter som mangler permanent ID. Migrasjon er sannsynlig. Produktvalg: nei.
4. **Prøving med ekte utstyr og nøkler (DV og fase 2).** Krav: REQ-0685–0711, 0623–0633 og DV REQ-0750–0836. Hvorfor: dette er arbeidsflyten Anita skal bruke, og den er bare testet med mock. Omfang: 1 runde med sjekkliste og eventuelle rettinger. Ingen migrasjon. Spørsmål til Mars: *Hvem prøver, og når? A) Mars eller Anita med en sjekkliste fra Claude, B) en testkonto med begrenset budsjett som Claude styrer (koster litt i AI-kall).*
5. **Reservefiler og ressursbibliotek (REQ-0049, REQ-0121).** Hvorfor: «be om manglende referansefiler» er ikke startet, og det gjør det raskere å komme i gang med manusene til Jula på Dovre. Omfang: 1–2 runder, kanskje uten migrasjon. Spørsmål til Mars: *Når en karakter eller lokasjon mangler referansebilde: A) bare en oversikt over hva som mangler, B) oversikt pluss en forespørsel du kan sende til en tegner, C) forslag om å generere med AI (koster).*

Prosesskravene (REQ-0450–0530) bør få et samlet vedtak (forslag: «Utgått – erstattet av arbeidsdelingen i AGENTS.md»). Det krever bare et ja fra Mars.

## 3. Små tekniske ting

- **22 visuelle suiter med fast skjemaversjon**, blant dem `dec0090-mobile-ui`, `dec0093-audio-ui`, `storylab-ui` og `u2-chrome-ui`. Bytt til `VISUAL_SCHEMA_VERSION`, og legg inn en kontroll i testskriptet som stopper nye faste versjoner. Ca. en halv runde. Anbefales.
- **`UI_LANG` i `scene-video-ui`, `storylab-canvas-ui` og `mts-global`:** anbefales for `scene-video-ui` (over 40 norske tekster; bytt til `data-testid`/`byLang`), siden det er den største gjenværende språkrisikoen. `storylab-canvas-ui` og `mts-global` har allerede egne engelske scenarioer, så det holder å la `UI_LANG` overstyre scenarioets språk. Ca. en halv runde til sammen.
- Kontroller visuelt «Mer …»-menyen i de andre verktøylinjene etter R7-rettingen.
- Oppdater `TODO.md`: riktige tall, og fjern ProRes og stilharmonisering fra «Bestilt, ikke bygget».
- Sikkerhet: vurder å kryptere `film_shares.token` (TODO, GP5).
- Mål Story Lab-canvaset i ferdig bygget app, ikke bare på utviklingsserveren.
