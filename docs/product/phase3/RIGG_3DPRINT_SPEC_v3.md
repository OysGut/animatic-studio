# ANIMATIC STUDIO – RIGG & 3D PRINT, versjon 3

2D-produksjon prioriteres, måleverktøy og konturutskrift. Oppdaterer tidligere krav til fysisk rigg, PDF-utskrift, QR-koder, papiranimasjon og 3D-generering. Tidligere bekreftede krav gjelder fortsatt, med denne prioriteringsendringen: Rigg og 2D-utskrift er første implementeringsprioritet. 3D-print dokumenteres i en egen, fullstendig TODO, men implementeres ikke nå.

## 1. 2D-utskrift er hovedprioriteten
Produksjonsklar arbeidsflyt for: vertikal multiplanrigg; kamera- og linsekonfigurasjon; fysiske glassplateavstander; visning av platenivåer i sceneeditoren; matematisk beregning av fysisk figurstørrelse; PDF med nøyaktig målestokk; QR-identifisering av fysiske figurer; mobilbasert gjenfinning av riktig scene; flere figurer eller kopier i én utskriftsjobb; konturutskrift; forhåndsinspeksjon med måleverktøy. Implementeres og testes før 3D-print.

## 2. Brukeren bestemmer antall utskrifter
Skille mellom antall unike bilder (varianter/frames valgt) og antall utskriftskopier (eksemplarer per valgt bilde). Eksempel: én figur fra én frame, 20 identiske utskrifter, uten sammenslåing eller fjerning av duplikater. Grunner: fargelegge, male, klippe ulikt, prøve materialer, separate fysiske animasjonsstadier, maler for leire. Ingen automatisk deduplisering av kopier brukeren har bedt om.

## 3. Sekvens- og kopiproduksjon
En jobb kan inneholde både en serie ulike frames og flere eksemplarer av samme frame (20 frames gir 20 utskrifter; ett bilde gir 20; 20 frames med 2 kopier hver). Brukeren bestemmer. Jobben bevarer kobling til digitalt kildeobjekt, scene og tidspunkt, også for identiske kopier.

## 4. Egen konturmodus
Moduser: Full figur (bildet med farger, teksturer, detaljer); Full figur med klippekontur (tynn valgfri klippelinje); Kun kontur (bare omriss, uten farge eller tekstur). Konturmodus brukes som fysisk mal (leire, tegne på nytt, skjære i annet materiale, mål for videre bearbeiding).

## 5. Konturens geometri
Konturen skal gjenspeile synlig silhuett eller maskekontur. Bruk alfakanal, maske eller annen objektkontur der mulig. Mangler egnet kontur: tilby redigerbar eller kontrollerbar kontur før utskrift. Ikke anta at rektangelet er klippekonturen. Konturmodus bevarer korrekt fysisk målestokk.

## 6. Tynn hårstrek
Valgbar tynn klippekontur, synlig nok til å klippe etter også når figuren er hvit, men så tynn at den ikke gjør figuren vesentlig større. Strektykkelsen skal ikke gi utilsiktet skaleringsendring.

## 7. Inspeksjonsvindu før PDF
Dedikert inspeksjons- og målevindu med figuren i korrekt fysisk målestokk. Brukeren kan: zoome inn og ut; panorere; se hele figuren; se fysisk avgrensning; se glassplatenivå; se beregnet bredde og høyde; bytte mellom de tre modusene; kontrollere referansemålestokk; kontrollere QR-plassering; kontrollere PDF-oppsett før ferdigstilling. Et reelt inspeksjonsverktøy, ikke et statisk bilde av PDF-forsiden.

## 8. Måleverktøy
Minst: bredde og høyde (total fysisk i mm eller inches); avstand mellom to punkter; vinkel mellom to retninger eller linjesegmenter; forholdstall mellom to valgte avstander. Eksempler: hodebredde mot kroppshøyde, armvinkel mot kroppen, avstand mellom to detaljer.

## 9. Visuelle målemarkører
Linjer, punkter, vinkler eller målestreker oppå figuren. Enkle å flytte, redigere og fjerne. Resultatene oppdateres når punktene endres. Beregninger bygger på fysisk figurgeometri, ikke skjermpiksler på nåværende zoom.

## 10. Målinger trenger ikke skrives ut
Inspeksjonsvinduet kan brukes kun til måling. Målinger og hjelpelinjer er som standard visuelle hjelpemidler og vises ikke på produksjons-PDF. Brukeren kan måle, lukke og fortsette uten å generere utskrift.

## 11. Valgfri måleannotasjon på PDF
Brukeren kan eksplisitt velge å ta med bestemte målinger på en teknisk referanseutskrift. Aldri standard for figurer som skal fotograferes. Ingen måleanmerkning på figuren uten at brukeren har bedt om det.

## 12. Referansemålestokk
Kalibreringsmålestokk i mm eller inches, også i kun-kontur-modus. Eksakte fysiske dimensjoner, kontrollerbar med linjal. Forhåndsvisningen varsler at utskrift i annet enn 100 % ødelegger kalibreringen.

## 13. Batchinnstillinger
Felles for hele jobben: antall eksemplarer; valgte frames; utskriftsmodus; klippekontur; mm eller inches; kalibreringsmålestokk; QR utenfor figuren; QR på figuren; QR på baksiden; tosidig utskrift; papirformat; marginer; oppdeling over flere ark; relevante identifikasjonsopplysninger. Brukeren skal slippe å gjenta valgene per utskrift.

## 14. Identitet også for identiske kopier
Alle kopier kan kobles til riktig digital kilde. QR kan peke til samme scene og frame for alle kopier. Ved behov for å skille kopier: eget kopinummer. Skal ikke gjøre vanlig utskrift mer komplisert enn nødvendig.

## 15. 3D-print utsettes
3D print-fanen inngår i planlagt funksjonsstruktur. Egen TODO. Ikke implementer 2D-til-3D-generering, 3D-inspeksjonseditor eller 3D-printpipeline i denne runden.

## 16. 3D-TODO må bevare kravene
Senere støtte for: generering av 3D-modell fra bilde; valg mellom flat underside og full tredimensjonal figur; 2,5D-relieff og silhuetteffekter; fysisk dybde med slider; direkte numerisk dybdeverdi; gjenbruk av nylig brukte dybdemål; skaleringskorreksjon når volumet bringer deler nærmere kameraet; samme riggkoordinatsystem som 2D; leverandørvalg for eksterne bilde-til-3D-jobber; integrasjon gjennom eksisterende AI-leverandørgrensesnitt; kostnadsinformasjon før generering; jobbstatus og feilhåndtering; interaktiv 3D-inspeksjon; kontroll av fysisk størrelse og modellgeometri; printbarhetskontroll; STL- og 3MF-eksport; identifikasjonskode på egnet fysisk overflate; manuell inntasting av identifikasjonskode; navigasjon fra fysisk figur tilbake til digital scene; versjonering og ikke-destruktiv håndtering. En veldefinert fremtidig oppgave, ikke en vag merknad.

## 17. Implementeringsfokus
1 vertikal riggkonfigurasjon; 2 kamera- og linsebaserte størrelsesberegninger; 3 platenivåer i Scene- og Rigg-fanen; 4 PDF i korrekt fysisk størrelse; 5 konturutskrift; 6 kalibreringsmålestokk; 7 interaktiv inspeksjon og måling; 8 batch og brukerbestemte kopier; 9 QR med valgfri plassering, inkludert tosidig; 10 gjenfinning av scene via mobilskanning; 11 egen utsatt 3D-TODO.

## 18. Akseptansekriterier
- A1: Én figur kan skrives ut i 20 identiske eksemplarer.
- A2: Identiske utskrifter fjernes ikke automatisk.
- A3: 20 etterfølgende frames gir 20 utskrifter selv om enkelte er identiske.
- A4: Valg mellom full farge, full figur med klippelinje og bare kontur.
- A5: Konturen er figurens faktiske silhuett, ikke rektangelet.
- A6: Inspeksjonsvinduet kan åpnes uten å skrive ut.
- A7: Bredde og høyde kan måles.
- A8: Avstand mellom valgfrie punkter kan måles.
- A9: Vinkler kan måles.
- A10: Forholdstall mellom valgte avstander kan måles.
- A11: Måleverktøyene bruker fysisk målestokk uavhengig av skjermzoom.
- A12: Målelinjer skrives ikke automatisk ut.
- A13: mm eller inches.
- A14: Felles utskriftsinnstillinger for en hel batch.
- A15: QR og konturmodus fungerer også i batch.
- A16: 2D-utskrift kan leveres uten 3D-generering.
- A17: Hele 3D-omfanget er dokumentert i en egen fremtidig TODO.

## Endelig instruksjon
Prioriter en nøyaktig, brukervennlig 2D-utskriftsarbeidsflyt for den vertikale riggen. Brukeren skal kunne undersøke, måle og skrive ut figurer i fysisk riktig størrelse, som komplette bilder eller rene konturer, og selv bestemme antall kopier. 3D-print spesifiseres grundig i en separat TODO og skal ikke blokkere Rigg og 2D-utskrift.

## B-087 Beslutninger (Øystein 21.10)
- **Kamerabevegelse velges av brukeren.** Det kan være ulikt fra prosjekt til prosjekt. To moduser:
  - *Fast kamera:* digital zoom og panorering bakes inn i figurstørrelsen per frame.
  - *Kameraet beveger seg fysisk:* figurstørrelsen regnes fra scenens hvileposisjon.
  - Valget ligger i riggoppsettet og kan overstyres per scene.
- **Skala følger animasjonen.** Endrer en figur størrelse digitalt, endrer utskriften seg fysisk. Hver frame skrives ut i sin egen beregnede størrelse.
- **Masker:**
  - En maske brukeren allerede har laget i Animatic Studio, brukes alltid først.
  - Systemet kan foreslå en maske, men forslaget kan slås av. Da skrives bildet ut som det er.
  - Et maskeforslag lagres bare når brukeren godtar det.
- **Riggoppsett:**
  - Oppsettet kan gjenbrukes som en navngitt mal, og hver bruk kan justeres individuelt.
  - Oppsettet kan være ulikt fra scene til scene.
  - Det sist satte oppsettet kommer opp som standard for nye scener.

**Tekniske valg (Claude):**
- Malen gir prosjektets standardrigg, som igjen gir riggen per scene. En justering i scenen endrer aldri malen.
- Malene lagres i prosjektet og kan publiseres til arbeidsgruppens globale bibliotek.
- Platenivået er fasit for parallaksen. Parallaksen kan overstyres, med en advarsel om avvik.
- Størrelsen regnes med linseformelen for nærfoto, m = f / (d − f), og et valgfritt kalibreringsfelt per plate (målt synsfelt i mm) overstyrer teorien. All geometri regnes i mm internt, og inches er bare en visningsenhet.
- Klippelinjen er 0,1 mm og tegnes sentrert på den faktiske konturen.
- Inspeksjonsvinduet varsler under 150 dpi i fysisk størrelse.
- QR-koden inneholder bare en tilfeldig kode, og oppslaget krever innlogging og tilgang til prosjektet. En kort kode står under QR-en for manuell inntasting.
- Tosidig utskrift har et testark som justerer forskyvningen på baksiden.
- Ingen deduplisering: hver kopi er en egen rad med kopinummer, og kopinummeret skrives bare på arket når brukeren ber om det.
- Ingen betalte AI-kall: maskeforslaget lages lokalt ut fra alfa og bakgrunnsfarge.
