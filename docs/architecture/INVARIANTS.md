# Systeminvarianter – Animatic Studio

Disse reglene skal **alltid** gjelde (CLAUDE.md, mandat kap. 2, 3, 34, del B3). Hver invariant har en testbar formulering og en planlagt automatisk test i `tests/invariants/`. Invariantkontrollene implementeres som rene funksjoner i `src/core/invariants/` og kjøres (a) i enhetstester, (b) etter hver kommando i utviklingsmodus, (c) i egenskapsbaserte tester med tilfeldige kommandosekvenser.

Status per invariant oppdateres i `TRACEABILITY_MATRIX.md` (generert).

| ID | Regel | Testbar formulering | Planlagt test | Status |
|---|---|---|---|---|
| INV-01 | Manus og film er to visninger av samme aktive produksjonsstruktur | For hver produksjon: rekkefølgen av aktive scener i manusvisningen == rekkefølgen av scener i filmmonteringen, etter enhver kommandosekvens. Det finnes ingen separat lagret rekkefølge for montering. | `inv01-structure-sync.test.ts` (egenskapsbasert: tilfeldige flytt/aktiver/splitt/slå sammen) | Ikke implementert |
| INV-02 | Scenenumre er ikke identiteter | Ingen relasjon, fremmednøkkel eller oppslag bruker scenenummer. Omnummerering endrer ingen ID og ingen relasjon. | `inv02-numbering-not-identity.test.ts` + statisk sjekk av skjema (ingen FK til nummerfelt) | Ikke implementert |
| INV-03 | Scene beholder identitet gjennom flytting og omnummerering | Etter flytt, omdøping, ny overskrift, nytt nummer, deaktivering, gjenbruk i spinoff og ny manusversjon er `sceneId` uendret og alle takes/koblinger peker fortsatt riktig. | `inv03-identity-stable.test.ts` | Ikke implementert |
| INV-04 | Spinoffer: samme kildescene, selvstendig rekkefølge og lokale endringer | Flytt/deaktiver/rediger i spinoff endrer ingenting i hovedfilmens sceneforekomster, varianter eller takes – og omvendt bare for delte varianter som ikke er lokalt overstyrt. | `inv04-spinoff-isolation.test.ts` | Ikke implementert |
| INV-05 | Norsk er hovedmanus | Prosjektets hovedmanus er norsk (`nb`) (mandat 23.1). *Midlertidig antakelse (Q-06):* alle produksjoner har `nb` som hovedspråk. *Teknisk regel:* strukturendringer gjøres via hovedmanuset. | `inv05-norwegian-primary.test.ts` | Ikke implementert |
| INV-06 | Andre språk endrer ikke norsk automatisk | Ingen kommando med språk ≠ `nb` endrer norske blokker. Norsk endring setter oversettelser til `needs_review`. | `inv06-translation-oneway.test.ts` | Ikke implementert |
| INV-07 | Ferdig film overskrives ikke etter manusendringer | Etter enhver manusendring er alle eksisterende takes (fil, status, aktiv peker) uendret; berørte får `Discrepancy`. | `inv07-no-overwrite.test.ts` | Ikke implementert |
| INV-08 | Brukeren kan godkjenne, oppdatere eller angre | For hvert åpent avvik finnes de tre handlingene, og hver av dem gir forventet tilstand (godkjent med versjoner / ny take ved siden av / selektiv invers). | `inv08-discrepancy-resolution.test.ts` | Ikke implementert |
| INV-09 | Kontinuitet følger fortellingstid | Gjeldende utseende for karakter i scene S beregnes fra kontinuitetshendelser ordnet etter `storyTime`, uavhengig av visnings- og produksjonsrekkefølge. Testscenario: Maja klipper håret i scene X; en flashback plassert etter X men med tidligere fortellingstid får langt hår. | `inv09-story-time-continuity.test.ts` | Ikke implementert |
| INV-10 | Segmentering endrer ikke manus | Oppretting/sletting av `ProductionSegment` (alle årsaker) endrer ingen scene-ID, ingen manusblokk og ingen nummerering. | `inv10-segmentation.test.ts` | Ikke implementert |
| INV-11 | AI er valgfritt for 2D-animatic | Avspilling og eksport av en produksjon med bare 2D-komposisjoner, stillbilder, importert film og lyd utfører null kall til AI-adaptere (adaptere byttes med en «feiler hvis kalt»-stub i testen). | `inv11-no-ai-required.test.ts` | Ikke implementert |
| INV-12 | Betalte kall krever kostnadsgodkjenning | En betalt jobb kan ikke gå fra `queued` til `generating` uten eksplisitt kostnadsgodkjenning innen alle gjeldende budsjetter (mandat 2.2, 19.5, 19.6; retries og ekstrarunder teller). Håndheves i backend. *Teknisk tolkning:* strengeste budsjett gjelder. | `inv12-cost-approval.test.ts` + RLS/RPC-test | Ikke implementert |
| INV-13 | Delte ressurser er versjonerte og ikke-destruktive | Ressursversjoner er uforanderlige; scener refererer en bestemt versjon; ny versjon bytter ikke automatisk i noen scene eller produksjon. | `inv13-resource-versioning.test.ts` | Ikke implementert |
| INV-14 | Deaktivering er ikke sletting | Etter `SetOccurrenceActive(false)` finnes all data uendret og kan gjenaktiveres til identisk tilstand. Ingen kommando sletter takes, manusversjoner eller ressursversjoner. | `inv14-deactivate-not-delete.test.ts` | Ikke implementert |
| INV-C1 | Ingen stille overskriving ved samarbeid (DEC-0003; løsning DEC-0010) | En skriving med utdatert `revision` avvises; en annen brukers endring går aldri tapt. | `invC1-revision-conflict.test.ts` | Ikke implementert |
| INV-C2 | Tilgang håndheves i backend (teknisk, DEC-0010) | Ikke-medlem får ingen rader/filer; rolle uten skriverett kan ikke skrive. | `tests/rls/role-matrix` | Ikke implementert |
| INV-C3 | Kostnadsrett (midlertidig, DEC-0018, Q-01) | Bare medlemmer med `can_approve_costs` kan gi kostnadsgodkjenning. | `invC3-cost-role.test.ts` | Ikke implementert |

## Hvor invariantene kan brytes (risikoområder)
- Kode i UI som skriver direkte til tabeller i stedet for via kommandoer/RPC.
- Separat lagret rekkefølge i tidslinjekomponenten (bryter INV-01).
- Bruk av scenenummer som nøkkel i URL-er, filnavn eller cache (INV-02). URL-er skal bruke ID.
- «Lagre»-knapper som erstatter filer i Storage i stedet for å lage nye versjoner (INV-07, INV-13).
- Bakgrunnsjobber som retrier betalte kall uten å sjekke budsjett (INV-12).
- Oversettelsesflyt som skriver tilbake til norsk blokk (INV-06).

## Regel for endring av invarianter
INV-01–INV-13 er Mars' liste (DEC-0019, del B3); INV-14 er fra mandat kap. 2. De kan bare endres av en beslutning **Bekreftet av bruker**. Tekniske tolkninger i tabellen er merket. INV-C1/C2 er tekniske utledninger av DEC-0003 (DEC-0010); INV-C3 er en midlertidig antakelse (DEC-0018).
