# N7 – Dokumentasjonsavstemming (22.10.2026)

I N7 er bare dokumenter endret. Ingen ny funksjonalitet, ingen migrasjon, ingen betalte kall, ikke publisert. Avstemmingen bygger på Claudes opplysning om at alle migrasjoner til og med 0088 er kjørt i Cloud. Cloud står på versjon 88, og hashene er kontrollert.

## 1. roadmap.md og TODO.md

Krysset av med henvisning i roadmap.md:
- **Migrasjoner kjørt i Cloud (versjon 88):** 0066, 0070, 0077, 0081, 0082 og 0084.
- **DB-testene:** «DB-suite etter 0081» og «DB-testene kjøres av Claude». DB-suiten kjøres nå lokalt og ga 180/0 i N6.
- **Verifisering4:** Grønn etter D-2 og N5, med 60/60.
- **ML2d og ML2e:** Er ferdige. Det står i egne avsnitt i roadmap, og broen er tom etter ML2f (tests/unit/i18n-ml2f.test.ts). Overløpet på 64 px i en-XA er ikke bekreftet rettet. Det er flyttet til «Teknisk gjeld».
- **N4-punktene:** Videreført i N6, eller flyttet til TODO.

Fjernet fra TODO.md fordi de var dobbeltførte eller utdaterte:
- ML1/verifisering4-punktet. Det sto to steder.
- «Claude: lokal DB og migrasjon 0061».
- Kjøringen av 0084.

Det som fortsatt er åpent, er samlet nederst i TODO.md under «Krever Øystein», «Krever ekstern prøving» og «Teknisk gjeld». Avsnittene lenger opp i TODO.md står fortsatt som bakgrunn.

## 2. KNOWN_ISSUES.md

**Lukket:**
- **KI-57:** Bildet og lyden hadde hver sin klokke. Rettet i N2, test: tests/unit/req0210-playback-drift.test.ts.
- **KI-128:** Stilharmonisering manglet. Den er bygget i P8. Tester: style-harmonize.test.ts og p8-style-harmonize.mjs, som ga 110/0 i N6.
- **KI-203:** Krevde at 0030 og 0031 var kjørt. Begge er kjørt i Cloud.

**Delvis rettet:**
- **KI-46:** Panelene tegnes om per bilde under avspilling. N5 frøs flere deler (n5-frame-frozen.test.tsx). Tidslinjen og knappene gjenstår.

Utdaterte merknader om 0061 og manglende lokal Postgres i DV-avsnittene er rettet. De andre feilene er beholdt uendret, fordi de mangler retting eller test.

## 3. Krav med status «Under arbeid»

Det var 12 slike krav, ikke 13: REQ-0451, REQ-0455 og REQ-0740–0749. Alle er satt til «Implementert – ikke verifisert», med en history-post.
- **Begrunnelse:** Koden finnes, og det finnes deltester, men ingen test sjekker det samlede akseptkriteriet. Det gjelder for eksempel hele Story Lab-reisen og bevaring i VennTing.
- **Verifisert:** Ingen av kravene er flyttet til «Verifisert».
- **Nå:** 0 krav står som «Under arbeid».

build_docs og check_kb: OK (924 krav).

## 4. Sjekker

| Sjekk | Resultat |
|---|---|
| tsc | 0 feil |
| Vitest | 2465 bestått, 10 hoppet over, 0 feilet |
| i18n (scripts/i18n/check.mjs) | grønn |
| check_kb | OK |

DB-suiten er ikke kjørt på nytt i N7, fordi ingen kode eller database er endret. Den ga 180/0 i N6.
