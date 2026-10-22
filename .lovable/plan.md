# PTG1 – utvekslingsmodell og skuddliste

## Leveranse
- Én ren utvekslingsmodell for valgt produksjon, språk og scener. Ett skudd per sceneforekomst; lag, lyd og dialog fra eksisterende prosjektdata, kamera `null`.
- Felles avrunding av absolutte grenser. Toere bruker 24 bilder/s i tidslinjen med eksponering hvert andre bilde; øvrige opptaksfrekvenser kan velges.
- Prosjektkode med A–Z, 0–9 og bindestrek, maksimalt 32 tegn. Forslag translittererer æ/ø/å til AE/OE/AA. Navn følger `PROSJEKT_SC012_SH010_v003`, med tillegg og arvede scenenumre.
- Skuddliste i CSV med UTF-8 BOM og JSON, standardkolonner fra PTG-A4 samt profiler for Flow, ftrack og Kitsu. PNG-miniatyrer med relative stier i pakken.
- «Til produksjonen» i eksportdialogen; prosjektkode og opptaksinnstillinger kan endres med angring i prosjektinnstillingene.
- Strømmet ZIP64 og norsk/engelsk `LESMEG.txt` i pakkene, uten nye pakker eller AI-kall.

## Avklaring før kode
Dagens film tillater overlappende overganger, mens PTG1 krever at summen av skuddlengdene er lik filmens lengde. Skal hvert skudd slutte ved neste skudds start ved en overlapp (overlappen regnes da til det innkommende skuddet), eller skal overlapp fordeles annerledes? Dette påvirker også hvilke lyd- og ordtider som tilhører skuddet.

## Teknisk gjennomføring
- Legg modell, navngivning, frekvenskonvertering og skuddlisteverdier i `src/core/interchange/`; eksportøren pakker og gjengir miniatyrer uten egne tids-/navneberegninger.
- Bruk sceneforekomstens permanente ID som skuddidentitet. Versjoner skal være kollisjonssikre ved samtidige eksporter og kunne leses tilbake fra eksportloggen; utvid historikklagringen i samme 0081 ved behov.
- Skriv additiv migrasjon 0081 oppå 0080, med prosjektkode og opptaksinnstillinger. Bevar revisjonskontroll og angring via `apply_changes`; kopier siste funksjonsdefinisjon før målrettede endringer. Oppgi alle erstattede funksjoner. Migrasjonen kjøres ikke i Cloud i denne leveransen.
- Bevar innlasting og sikkerhetskopi av de nye prosjektfeltene. Oppdater forventet skjemaversjon og testfixture til 81.
- Alle nye brukerstrenger går gjennom `t()` på samtlige registrerte språk med kildehash og gjennomgangsmerking.
- Utvid eksisterende ZIP-strømming med 64-bits størrelser/posisjoner og test syntetiske store hoder uten å skrive 4 GB.

## Verifisering
- Gyldne tester for 12, 24, 25 og 30 bilder/s, prosjekt 24 → opptak 12/25, toere, absolutte ord-/lydgrenser, tidskode og lengdesum.
- Tester for tomme/svært korte scener, tillegg, spinoff, språk, navnekollisjoner, versjonering samt kommando, invers og angre/gjør om.
- DB-tester for prosjektfelter, revisjonskontroll, rettigheter og eksportversjoner; ingen endring av levende database.
- `ptg1-shotlist.mjs` på norsk og engelsk, der nedlastet pakke leses tilbake og kolonner, navn, miniatyrer og lengder kontrolleres. Export-e2e og p4 kjøres som separate regresjoner.
- Full Vitest, alle språkkontroller og automatisk type-/byggekontroll. Rapporten skiller beståtte kontroller fra kontroller som eventuelt ikke kan kjøres.

## Avgrensning
Ingen PTG2–PTG7, kamerautveksling, nye AI-kall eller publisering. Oppdragets 0081, 32-tegnskode og språkkrav overstyrer den eldre byggeplanens verdier.