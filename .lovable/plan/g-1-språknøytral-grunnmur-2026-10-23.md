# G-1 – språknøytral grunnmur

## Mål og rammer
Manusets språk er prosjektets eneste kildespråk. Norsk behandles som ethvert annet språk. Kildeteksten oversettes eller overskrives aldri automatisk av språkversjoner.

Oppdraget deles i G-1a og G-1b, med egne resultatdeler i `docs/development/G1_SPRAKNOYTRAL_REPORT.md`. N11s 17 uverifiserte restkrav beholdes som separate oppgaver; ingen ny N11-funksjonalitet bygges her.

Ingen publisering, betalte kall, nye pakker eller Cloud-endringer. Migrasjon 0090 leveres som fil til Claude; 0089 og eldre og deres hash-baseline røres ikke.

G-1 er en uttrykkelig ny produktbeslutning og erstatter eldre norsk-kildekrav. Historiske rapporter eller beslutninger brukes ikke til å gjeninnføre norsk som kilde eller be om ny godkjenning av allerede bestilte importformater.

## G-1a – database og kjerne
1. Kartlegg alle språkfelt, siste RPC-definisjoner og hardkodede språkverdier. Rapporten skiller legitime språkregistre, i18n-forfatterspråk og testeksempler fra feilaktige standarder.
2. Skriv `db/migrations/0090_language_neutral_foundation.sql`: ett påkrevd BCP-47-felt `projects.source_language` erstatter de to manusfeltene. Konverter eksisterende testprosjekter fra faktisk manusspråk når tilgjengelig. Bevar data der det er enkelt, og dokumenter konflikter og konvertering før sletting vurderes.
3. Kildeblokker lagrer prosjektets kildespråk, ikke en norsk markør. Erstatt interne kildetekstnøkler med en språkfri identitet, adskilt fra språkversjonsnøkler, slik at norsk kan være et vanlig mål.
4. Databasen validerer språkkoder og håndhever mål ≠ kilde for oversettelser, språkversjoner og linjekoblinger; språkversjonenes kildefelt følger prosjektet. Endring av prosjektets språk må også kontrollere eksisterende barn, ikke bare nye rader.
5. Kopier siste berørte RPC-definisjoner og endre bare nødvendig logikk. Kontroller `apply_changes`, prosjektoppretting, sletting/purge og eksportreservasjoner; list alle opprettede/erstattede funksjoner med begrunnelse. Bevar rettigheter, revisjonssjekker og angregrupper.
   Foreløpig kartlegging: siste `apply_changes` ligger i 0088, slettelogikk i 0087; 0089 inneholder ikke nye RPC-definisjoner. Ingen 0090-fil finnes. Alle definisjoner verifiseres mot siste fil før kopiering.
6. Én `sourceLanguageOf(state)` brukes av kjerne, lasting/lagring, oversettelse, linjejustering, avvik, tale, Story Lab, PTG/manus-PDF og sikkerhetskopi/gjenoppretting. Schema-kontrakten blir 90.
7. Omskriv INV-05 til Øysteins formulering i autoriserte invariant-/kravdokumenter, ikke i det låste mandatet. Oppdater gammel Norge-binding i AGENTS.md uten å endre andre regler.

## G-1b – standardverdier og brukerflate
1. Søk bredt etter norsk/Norwegian/nb/no/no-NO/Norge/Oslo/kr/NOK. Klassifiser hvert treff; ikke bruk blind søk-og-erstatt på tekst, språkregistre eller brukerinnhold.
2. Hold kildespråk, talespråk, grensesnittspråk, land/datoformat og valuta uavhengige. Bruk eksisterende personlige valg og B-097; ikke utled land eller valuta sikkert fra et språknavn. Fjern norske standardstemmer, prompts, eksempler og sorterings-/formatantakelser.
3. Nytt prosjekt får språkvalg med forslag fra grensesnittspråket. Senere endring får tydelig advarsel: teksten oversettes ikke; språkavhengige resultater kan bli utdaterte. Dersom valgt kilde allerede finnes som mål, må brukeren løse konflikten eksplisitt; ingenting overskrives stille.
4. Fountain, FDX, Word og PDF gir språkforslag fra tilgjengelig metadata og eksisterende deteksjon, med brukerbekreftelse. Usikre/korte tekster gir forslag, aldri en sikker påstand eller betalt deteksjonskall.
5. Alle nye/endrede tekster bruker `t()` og leveres på alle registrerte språk samtidig, med kildehash og merking av maskinoversettelser. Språklastingen beholdes.
6. Kontroller skriftdekning og manus-/PDF-format for japansk og engelsk uten norsk terminologi som standard. Bevar eksplisitte formatvalg og norsk prosjektatferd.

## Akseptanse og verifisering
- Faste japanske, engelske og norske testprosjekter. Japansk prosjekt har norsk og engelsk mål; engelsk prosjekt kan ha norsk mål; mål lik kilde avvises.
- Kjernetester følger oversettelse → linjekobling → avvik → TTS-språk → PTG/manus-PDF → sikkerhetskopi og gjenoppretting. Nye kommandoer testes med invers, angre og gjør om; kildeinnhold må være uendret.
- DB-tester dekker 0090-konvertering, BCP-47-validering, mål/kilde-regler, endring av kildespråk, revisjoner, RLS, sletting og purge. Bare isolert lokal database; hvis miljøet mangler, rapporteres dette som blokkert, ikke grønt.
- Arkitekturtest finner hardkodede `nb`/`no`-språkverdier utenfor katalogene; liten konkret unntaksliste med begrunnelse, inkludert legitime språkregistre og eksplisitte norske regresjonsfixturer. Historiske låste migrasjoner endres aldri for å tilfredsstille testen.
- Full Vitest og språk-/kravkontroller. Typekontroll leses fra prosjektets automatiske kontroll; ingen manuell bygging/typekontroll i Lovable-miljøet.
- Oppretting → bekreftet import → norsk/engelsk mål for japansk manus kontrolleres i brukerflaten med faste mocker, uten ekte KI-kall. Rapporten angir nøyaktig hva som er kjørt og hva Claude må kjøre.

## Dokumentasjon og levering
Legg til neste ledige krav for språknøytralitet i `requirements.yaml`, oppdater relevante krav uten å erklære utestede kriterier verifisert, samt AGENTS.md, TODO.md og oppgavekøen. Genererte oversikter oppdateres bare gjennom eksisterende verktøy der oppdragets endringer krever det.

Rapporten inneholder plan, G-1a/G-1b-status, konverteringsregler, komplette RPC-/fillister, testresultater, avvik og åpne blokkeringer. Claude gjennomgår og tester 0090 før Cloud-kjøring. Brukerflaten på schema 90 er ikke klar mot Cloud før denne kjøringen; ingen ferdigpåstand baseres på dagens schema 89.