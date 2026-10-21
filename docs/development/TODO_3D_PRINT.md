# TODO – 3D-print (B-087, §15–§16)

Status: **utsatt**. 3D-print blokkerer ikke Rigg og 2D-utskrift (runde 1–5). Kilde: `docs/product/phase3/RIGG_3DPRINT_SPEC_v3.md` §16.
Ingenting her bygges før Rigg og 2D-utskrift er levert og verifisert. Betalte kall krever alltid kostnadsport og eksplisitt bekreftelse.

## Felles forutsetninger fra runde 1–5
- **Riggmodellen (runde 1, migrasjon 0071)** er grunnlaget. Den må definere ett riggkoordinatsystem i mm (platenivåer, kameraakse, linse) som kan utvides med dybde uten migrasjon av 2D-data.
- **Størrelsesmatematikken (runde 1):** m = f / (d − f), kalibreringsfelt per plate, mm internt og inches bare som visning.
- **Kontur og maske (runde 2), inspeksjon og måling (runde 3, migrasjon 0072), kode og mobiloppslag (runde 5, migrasjon 0073).**
- **AI-leverandører:** eksisterende adaptermodell, nøkler bare på serveren, kostnadsport, generation_jobs og jobbstatus.

## Arbeidspunkter

### 3D-01 – Generering av 3D-modell fra bilde (REQ-0896)
- **Mål:** Lage en 3D-modell av en figur fra et valgt bilde (frame eller ressursversjon) via en ekstern bilde-til-3D-tjeneste.
- **Avhengigheter:** 3D-09, 3D-10, 3D-11, 3D-12; kildebildet og masken fra runde 2 (kontur fra maske/alfa).
- **Akseptansekriterium:** Et valgt bilde gir en 3D-modell som lagres som ny versjon knyttet til kildebildet; ingenting starter uten bekreftet kostnad.
- **Åpne spørsmål:** Hvilke kildetyper er tillatt (bare godkjente versjoner, eller også frames midt i en animasjon)?

### 3D-02 – Flat underside eller full tredimensjonal figur (REQ-0897)
- **Mål:** Brukeren velger mellom en figur med flat bakside (ligger på glassplaten) og en full 3D-figur.
- **Avhengigheter:** 3D-01; riggmodellen fra runde 1 (platenivå som underlag).
- **Akseptansekriterium:** Valget lagres per modell; flat underside gir en plan flate i platens plan innenfor printtoleransen.
- **Åpne spørsmål:** Skal flat underside være standard for figurer på glassplater?

### 3D-03 – 2,5D-relieff og silhuetteffekter (REQ-0898)
- **Mål:** Relieff der dybden følger bildet innenfor silhuetten, uten full 3D-rekonstruksjon.
- **Avhengigheter:** 3D-04/05 (dybde); konturen fra runde 2.
- **Akseptansekriterium:** Relieffets ytterkant følger den faktiske silhuetten (som A5), ikke rektangelet.
- **Åpne spørsmål:** Kan relieff lages lokalt uten betalt tjeneste (dybdekart i nettleseren)?

### 3D-04 – Fysisk dybde med slider (REQ-0899)
- **Mål:** Brukeren setter figurens fysiske dybde i mm med en slider.
- **Avhengigheter:** Riggmodellens mm-geometri fra runde 1.
- **Akseptansekriterium:** Slideren viser dybden i valgt enhet (mm/inches) og endrer modellens dybde tilsvarende.
- **Åpne spørsmål:** Hva er standard dybdeområde?

### 3D-05 – Direkte numerisk dybdeverdi (REQ-0900)
- **Mål:** Dybden kan skrives inn som tall i stedet for slider.
- **Avhengigheter:** 3D-04; enhetshåndteringen fra runde 1 (mm internt).
- **Akseptansekriterium:** Inntastet verdi og slider viser alltid samme dybde; inches regnes om til mm uten avrundingstap utover visningen.
- **Åpne spørsmål:** Ingen.

### 3D-06 – Gjenbruk av nylig brukte dybdemål (REQ-0901)
- **Mål:** Siste brukte dybdeverdier kan velges raskt.
- **Avhengigheter:** 3D-04/05.
- **Akseptansekriterium:** De siste dybdemålene vises som valg og gir nøyaktig samme verdi som sist.
- **Åpne spørsmål:** Per bruker, per prosjekt eller per figur?

### 3D-07 – Skalakorreksjon når volumet bringer deler nærmere kameraet (REQ-0902)
- **Mål:** En 3D-figur har deler som stikker ut mot kameraet; de ville blitt for store i bildet. Størrelsen korrigeres med samme linseformel som i 2D.
- **Avhengigheter:** Størrelsesmatematikken fra runde 1 (m = f / (d − f), kalibreringsfelt per plate) og 3D-08.
- **Akseptansekriterium:** Den fremste og bakerste delen av figuren får beregnet avbildningsmål ut fra sin egen avstand til kameraet; den synlige størrelsen i kamera avviker ikke mer enn toleransen fra 2D-figuren.
- **Åpne spørsmål:** Skal korreksjonen være per figur (én skala) eller ikke-lineær i dybden?

### 3D-08 – Samme riggkoordinatsystem som 2D (REQ-0903)
- **Mål:** 3D-modeller plasseres i det samme riggkoordinatsystemet (mm, platenivåer, kameraakse) som 2D-figurene.
- **Avhengigheter:** Riggmodellen fra runde 1 (krav: runde 1 må definere koordinatsystemet slik at det kan utvides med dybde).
- **Akseptansekriterium:** En 3D-figur og en 2D-figur på samme plate og posisjon gir samme plassering og målestokk i kamera.
- **Åpne spørsmål:** Hvor ligger origo for dybden: platens overflate eller figurens bakside?

### 3D-09 – Leverandørvalg for eksterne bilde-til-3D-jobber (REQ-0904)
- **Mål:** Brukeren velger leverandør og modell for bilde-til-3D.
- **Avhengigheter:** 3D-10; det eksisterende AI-leverandørgrensesnittet (egne nøkler og modellvalg).
- **Akseptansekriterium:** Bare leverandører med gyldig nøkkel kan velges; valgt leverandør og modell lagres med resultatet.
- **Åpne spørsmål:** Hvilke leverandører skal støttes først?

### 3D-10 – Integrasjon gjennom eksisterende AI-leverandørgrensesnitt (REQ-0905)
- **Mål:** Bilde-til-3D bygges som en ny adapter i den eksisterende adaptermodellen, ikke som et eget system.
- **Avhengigheter:** Adaptermodellen i src/core/generation og serverfunksjonene i src/adapters/ai; nøkler bare på serveren.
- **Akseptansekriterium:** Adapteren bruker samme nøkkellagring, logging uten hemmeligheter og testmønster (falskt nettverk) som de andre leverandørene.
- **Åpne spørsmål:** Ingen.

### 3D-11 – Kostnadsinformasjon før generering (kostnadsport) (REQ-0906)
- **Mål:** Anslått kostnad vises, og ingenting starter før brukeren bekrefter innenfor budsjettet.
- **Avhengigheter:** Kostnadsporten og budsjettet i eksisterende AI-flyt (kvalitetsprofiler, generation_jobs).
- **Akseptansekriterium:** Uten bekreftelse gjøres ingen betalte kall; over budsjett stopper jobben før sending.
- **Åpne spørsmål:** Hvordan prises leverandører som tar betalt per modell vs. per sekund?

### 3D-12 – Jobbstatus og feilhåndtering (REQ-0907)
- **Mål:** 3D-jobber vises i den samme jobblisten med status, fremdrift, feilmelding og nytt forsøk.
- **Avhengigheter:** generation_jobs og jobbstatusen i toppfeltet; kvitteringer så betalt arbeid aldri sendes på nytt.
- **Akseptansekriterium:** En jobb som feiler, viser forståelig feil på norsk og engelsk; et nytt forsøk dobbeltbetaler ikke en fullført jobb.
- **Åpne spørsmål:** Ingen.

### 3D-13 – Interaktiv 3D-inspeksjon (REQ-0908)
- **Mål:** Et 3D-inspeksjonsvindu (rotere, zoome, panorere) som motstykke til 2D-inspeksjonen.
- **Avhengigheter:** Inspeksjonsvinduet fra runde 3 (samme måleprinsipper, fysisk målestokk).
- **Akseptansekriterium:** Modellen kan roteres og måles i mm uavhengig av skjermzoom (som A11).
- **Åpne spørsmål:** Hvilket 3D-bibliotek (ny pakke krever godkjenning)?

### 3D-14 – Kontroll av fysisk størrelse og modellgeometri (REQ-0909)
- **Mål:** Vis modellens fysiske mål (bredde, høyde, dybde) og sammenlign med 2D-figurens beregnede størrelse.
- **Avhengigheter:** 3D-07, 3D-08; størrelsesmatematikken fra runde 1.
- **Akseptansekriterium:** Avvik mot beregnet størrelse over toleransen gir varsel.
- **Åpne spørsmål:** Hvilken toleranse (mm eller prosent)?

### 3D-15 – Printbarhetskontroll (REQ-0910)
- **Mål:** Kontroll av at modellen kan printes: lukket nett (manifold), minste veggtykkelse, overheng og byggevolum.
- **Avhengigheter:** 3D-14.
- **Akseptansekriterium:** En modell med hull eller for tynne vegger flagges før eksport; eksport er mulig bare med eksplisitt bekreftelse.
- **Åpne spørsmål:** Hvilken printer/materiale er referanse for minste veggtykkelse?

### 3D-16 – STL- og 3MF-eksport (REQ-0911)
- **Mål:** Eksport av modellen som STL og 3MF i mm.
- **Avhengigheter:** 3D-15; eksportkøen i nettleseren.
- **Akseptansekriterium:** Eksporterte filer har riktig fysisk størrelse i mm når de åpnes i en sliceprogramvare; 3MF tar med enhet og navn.
- **Åpne spørsmål:** Skal farger tas med i 3MF?

### 3D-17 – Identifikasjonskode på egnet fysisk overflate (REQ-0912)
- **Mål:** En kort ID-kode (samme ordning som QR i runde 5) preges eller trykkes på en flate som ikke synes i kamera (for eksempel undersiden).
- **Avhengigheter:** QR- og kodeordningen fra runde 5 (tilfeldig kode, oppslag krever innlogging og tilgang); 3D-02.
- **Akseptansekriterium:** Koden plasseres automatisk på en flate som vender bort fra kameraet og kan leses etter print.
- **Åpne spørsmål:** Preget relieff eller bare trykt etikett?

### 3D-18 – Manuell inntasting av identifikasjonskode (REQ-0913)
- **Mål:** Koden kan tastes inn for hånd når den ikke kan skannes.
- **Avhengigheter:** Mobiloppslaget fra runde 5.
- **Akseptansekriterium:** Inntastet kode gir samme resultat som skanning; feil kode gir samme svar som ukjent kode.
- **Åpne spørsmål:** Ingen.

### 3D-19 – Navigasjon fra fysisk figur tilbake til digital scene (REQ-0914)
- **Mål:** Oppslag på koden åpner riktig scene, frame og modellversjon.
- **Avhengigheter:** Mobiloppslaget fra runde 5; permanente ID-er (ID3).
- **Akseptansekriterium:** Oppslaget åpner riktig scene og frame også etter omnummerering eller omrokkering av scener.
- **Åpne spørsmål:** Ingen.

### 3D-20 – Versjonering og ikke-destruktiv håndtering (REQ-0915)
- **Mål:** Hver 3D-modell er en ny versjon; kildebilde, 2D-figur og aktiv versjon endres aldri automatisk.
- **Avhengigheter:** Versjonsmodellen for ressurser (asset_versions, derived_from_version_id fra 0069).
- **Akseptansekriterium:** En ny 3D-modell endrer ikke 2D-figuren eller eksisterende versjoner; tidligere 3D-versjoner kan hentes fram.
- **Åpne spørsmål:** Ingen.
