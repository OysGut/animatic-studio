# N11 – teknisk gjeld uten produktvalg

## Leveranse
- Finn årsaken til feilene i scene-paneltesten, og rett testen eller eksisterende kode. Kjør samme kontroller på bokmål og engelsk.
- Gå gjennom «Gjenstår uten målrettet test» i N6-rapporten. Legg til tester som faktisk sjekker akseptansekriteriene for allerede bygget funksjonalitet. Bare krav med bestått, dekkende test flyttes til Verifisert; eventuelle udekkede kriterier beskrives konkret.
- Mål en full Vitest-kjøring før og etter. Fjern unødvendig importarbeid eller juster testinnstillinger med bevart isolasjon og alle eksisterende kontroller.
- La eksisterende plassholderregel også gjelde Asset Studio-utkast, med bevart feltvis sammenslåing, revisjonskontroll og angring. Krever det produktvalg eller databaseendring, dokumenteres hindringen i stedet.
- Lever norsk rapport i `docs/development/N11_REPORT.md` med årsaker, målinger, tester, kravstatus og nøyaktig filliste.

## Avgrensning
Ingen ny funksjonalitet, migrasjoner, betalte tjenestekall eller publisering. Migrasjoner til og med 0089 forblir uendret. Arbeidet holdes innenfor omtrent 300 credits; undersøkelser deles i tre avgrensede spor.

## Teknisk gjennomføring og kontroll
- Bruk eksisterende testoppsett og samme metode som N4/N6. Ingen endring av mandat eller akseptansekriterier.
- Sammenlign før/etter under samme forhold og oppgi at lokale tider ikke nødvendigvis matcher Claudes maskin.
- Bevar kataloglasting i appen og brukerisolasjon; optimalisering av tester må ikke skjule språkfeil.
- Kjør berørte tester, full Vitest og relevante språk-/dokumentasjonskontroller. Automatisk type- og byggekontroll må være uten feil.
- Dokumentasjon og kravregister oppdateres bare for N11-resultater; øvrige oppdrag i køen berøres ikke.