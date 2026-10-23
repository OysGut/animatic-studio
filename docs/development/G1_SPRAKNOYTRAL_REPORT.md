# G-1 – språknøytral grunnmur

## Beslutning og status
Øystein besluttet 23.10.2026 at ingen datamodell, logikk eller standardverdi skal anta norsk eller Norge. Det finnes ingen faktiske brukere; testdata kan konverteres eller tapes, men unødvendig sletting skal unngås.

**Status: planlegging, ikke implementert eller verifisert.** G-1 følger etter den delvise N11-leveransen. N11s 17 uverifiserte restkrav forblir separate. Ingen migrasjon eller publisering er utført.

## Plan

### G-1a – database og kjerne
- Ny migrasjonsfil 0090; 0089 og eldre beholdes byte-for-byte.
- Ett BCP-47-kildespråk på prosjektet; faktisk kildespråk på kildeblokker; språkfri intern kildeidentitet i tekstkart.
- Mål kan være norsk eller hvilket som helst annet språk, men aldri prosjektets kilde. Databasen kontrollerer også eksisterende barn når kilden endres.
- Bruk siste RPC-definisjoner som utgangspunkt og dokumenter alle erstattede/opprettede funksjoner og konverteringsregler.
- Én sourceLanguageOf(state) gjennom lasting, kommandoer, oversettelse, avvik, TTS, eksport og sikkerhetskopi/gjenoppretting. Schema-kontrakt 90.
- INV-05: «Manusets språk (kildespråket) er kilden; kildeteksten endres aldri automatisk av språkversjoner.» Det låste mandatet redigeres ikke.

### G-1b – standardverdier og brukerflate
- Klassifiser alle norske språk-/landantakelser, inkludert prompts, stemmer, fontvalg, formatering, maler og sortering; behold legitime språkregistre og brukerinnhold.
- Manusspråk velges ved prosjektoppretting, foreslått fra grensesnittspråket. Endring senere gir advarsel, bevarer tekst og krever eksplisitt konfliktløsning hvis et mål blir kilde.
- Fountain/FDX/Word/PDF foreslår språk fra metadata eller eksisterende deteksjon og krever bekreftelse; ingen betalte deteksjonskall.
- Talespråk, grensesnittspråk og B-097-land/datoformat er uavhengige av manusets språk.
- Alle nye og endrede tekster leveres gjennom t() på alle registrerte språk i samme endring.

## Planlagt verifisering
Japansk manus med norsk og engelsk mål, engelsk manus med norsk mål, og norsk regresjonsprosjekt. Kjernen og databasen testes for oversettelse, linjejustering, avvik, TTS, PTG/manus-PDF og sikkerhetskopirundtur. Nye kommandoer får angre/gjør om-test. Arkitekturtest tillater bare begrunnede språkverdier, ikke skjulte norske standarder.

Full Vitest, automatisk typekontroll, i18n og isolerte lokale DB-tester skal dokumenteres med faktiske resultater. Brukerflyten testes med faste svar og uten betalte kall. Ingen tester er kjørt i planfasen; ingen krav er flyttet til Verifisert.

## G-1a – resultat
Ikke påbegynt. Funksjonslisten, konverteringsreglene og testresultatene fylles inn under implementeringen. Claude gjennomgår og kjører 0090 i Cloud.

## G-1b – resultat
Ikke påbegynt. Brukerflyt, standardvalg, språkdekning og testresultater fylles inn under implementeringen.

## Avvik og åpne punkter
- N11 er delvis levert; restkravene er ikke gjort ferdige eller skjult av dette oppdraget.
- Cloud beholdes uendret til Claudes gjennomgang. En schema-90-brukerflate kan ikke kontrolleres mot dagens Cloud uten 0090.
- Lokal DB-testtilgang og japansk PDF-skriftdekning må kontrolleres; det er ennå ikke grunnlag for grønne resultater.

## Endrede filer i planfasen
- `.lovable/plan.md`: gjennomføringsplan og akseptansekriterier.
- `docs/development/G1_SPRAKNOYTRAL_REPORT.md`: plan og separate resultatseksjoner for G-1a/G-1b.
- `roadmap.md`: G-1 registrert som neste hovedoppdrag etter N11.
- Prosjektminnet: Øysteins språknøytralitetsbeslutning lagret; eldre norsk-kildekrav erstattes av denne beslutningen.