# R3 + R4 – rapport (21.10.2026)

## Status
- **R4 er bygget ferdig.** Ingen migrasjon (ingen 0068).
- **R3 er ikke påbegynt.** Ett punkt må avklares først (se «Åpent spørsmål om R3»).
- Svarene på de to åpne spørsmålene fra R1/R2 er bygget.

## R4 – ProRes med målbitrate, LT og Proxy
- Koderen styrer nå etter Apples målbitrate per profil, oppløsning og bildefrekvens. Kvantisereren velges per
  slice (1–224), og det som spares i enkle deler av bildet, kan brukes i de travle delene.
- Målene er Apples tall for 1920×1080 ved 29,97 bilder/s: Proxy 45, LT 102, 422 147, HQ 220 og 4444 330 Mbit/s.
  Målet skaleres med antall piksler og bildefrekvens (gir for eksempel HQ 1080p23,976 = 176 og HQ 2160p29,97 = 880,
  mot Apples 884).
- Filmeksporten har et nytt valg «ProRes-profil»: 422 HQ (standard), 422, 422 LT og 422 Proxy.
- Lageksporten bruker fortsatt bare ProRes 4444, fordi det er den eneste profilen med alfa.
- Brukeren ser «Estimert filstørrelse: opptil …» før eksporten starter, både i filmeksporten og i lageksporten.
- Eksportloggen lagrer formatet som `mov-prores422hq`, `mov-prores422`, `mov-prores422lt` eller `mov-prores422proxy`.

## Svar på de åpne spørsmålene
1. «Ikke nå» huskes per bruker og prosjekt i nettleseren (localStorage med try/catch). Under kvalitetsprofilene
   vises knappen «Vis ProRes-tilbudet for Endelig igjen». Ingen migrasjon.
2. `AGENTS.md` har fått regel 36: nye tabeller eller kolonner som lagrer filstier, må legges inn i referansesjekken
   for oppryddingen i samme endring, med test.

## Tester
- `tsc`: ingen feil.
- Full vitest: 2 010 bestått, 10 hoppet over, 0 feilet.
- Nye enhetstester (`tests/unit/r3r4-global-prores.test.ts`, 11 tester). ffprobe kontrollerer ekte filer for alle fem
  profilene: FourCC (apch, apcn, apcs, apco, ap4h), bitrate mellom 80 og 110 % av målet, Rec.709 og PCM-lyd
  (pcm_s16le, 48 kHz, stereo). Alfa finnes bare i 4444. ffmpeg dekoder bildene, og avviket fra kilden er lite.
- Ny visuell suite `r3r4-global-prores.mjs`: 36/36 på norsk og 36/36 med `UI_LANG=en`.
- Regresjon på norsk: alt grønt (p7 45/45, r1r2 26/26, ca7 26/26, global-library 28/28, p8 110/110).
- Regresjon med `UI_LANG=en`: p7, r1r2 og global-library er grønne. ca7 (1 feil) og p8 (4 feil) feiler likt på eldre
  kode og står allerede på ML4-listen over avvik.
- DB-testene er ikke kjørt, fordi det ikke er noen migrasjon.

## Avvik
- Målbitraten er et tak, ikke et krav. Enkle bilder (flate flater, som i mange animatics) blir mindre enn målet,
  slik ProRes også gjør hos Apple. Bitratetesten bruker derfor et detaljert testbilde.
- Alfa i 4444 er tapsfri og kommer i tillegg til målet, som i Apples tabell.
- Koderen bruker fortsatt flate kvantiseringsmatriser i alle profiler, også LT og Proxy.

## Åpent spørsmål om R3
Globale versjoner kan ikke endres eller slettes (§8–9, en databaseregel). Derfor er det uklart hva «angrbart» skal
bety når en ny global versjon er publisert.
- **A:** «Angre» angrer bare markeringen i prosjektet (som dagens «Publiser globalt»). Den globale versjonen blir
  liggende. Ingen migrasjon.
- **B:** «Angre» trekker tilbake den globale versjonen. Den skjules for andre og gir ikke lenger varsel, men filen
  og raden beholdes. Dette krever migrasjon 0068 med en ny kolonne og en ny funksjon som kontrollerer rettigheter.
  Prosjekter som allerede har tatt versjonen i bruk, beholder sin egen kopi.
