# Pågående arbeid

Oppdatert: 2026-10-12 (økt 6, DEC-0061–0076)

## Nå: DEC-0061 – M8 del 1: plakater, karakterkart og relasjoner – ferdig, venter på Mars
- [x] «Utgivelse»: kinopitch-plakat og karakter- og universkart per produksjon, 70 × 100 cm m.fl., norsk og engelsk (REQ-0384–0389, REQ-0403/0404)
- [x] Førsteutkast fra prosjektet, 13 innholdsvalg, ny komposisjon som beholder brukerens endringer, lesbarhetskontroll (REQ-0390–0392, REQ-0396)
- [x] Relasjoner med forslag fra manuset, godkjenning og redigering (REQ-0393–0395); egne elementer og direkte redigering (REQ-0397–0399)
- [x] Trykk-PDF (utfallende kant, skjæremerker, ekte tekst) og PNG (REQ-0387, REQ-0421)
- [x] Migrasjon 0019; Vitest og DB-tester grønne, skjermbilder 60–66, kodegjennomgang (23 funn: rettet, resten KI-128–133)
- [ ] **Mars:** godkjenn kostnad for stilharmonisering med AI (REQ-0137–0145, REQ-0400–0402) – eller vent
- [ ] **Mars:** Prøv: Utgivelse → «Ny» → «Karakter- og universkart» → «Relasjoner» → godkjenn → «Eksporter» → Trykk-PDF

## Nå: DEC-0076 – kravverifisering runde 4 og UX-gjennomgang – ferdig, venter på Mars
- Mars: «Fortsett» (Teknisk anbefaling). Ingen ny migrasjon (0027 venter fortsatt).
- [x] 34 krav vurdert, funn rettet, UX-gjennomgang mot de ni kvalitetene
- [ ] **Mars:** avgjør REQ-0528 (KI-179), KI-176, KI-178, globale ressurser og stilharmonisering

## Før: DEC-0075 – kravverifisering runde 3, kostnadsanslag, versjonssammenligning, tidsmodell – ferdig, venter på Mars
- Mars: «Da fortsetter du videre» (Teknisk anbefaling). Ingen ny migrasjon (0027 fra DEC-0072 venter fortsatt).
- [x] Verifisering runde 3 og rettede funn (REQ-0424, 0426, 0168, 0405, 0280, 0273, 0443)
- [x] REQ-0318, 0078, 0105, 0275, 0311, 0053, 0489; KI-175, KI-177 (delvis)
- [x] Vitest 866 grønne, tsc, eslint, nettlesersjekk 73/73, kodegjennomgang (10 funn rettet)
- [ ] **Mars:** avgjør REQ-0528 (KI-179): skal redaktører uten kostnadsrett kunne starte betalte jobber?
- [ ] **Mars:** avklar KI-176, KI-178 og globale ressurser (REQ-0571).

## Før: DEC-0074 – plakat i trykkoppløsning, spinoff-nummer, språkfikser, tilgjengelighet, verifisering – ferdig, venter på Mars
- Mars: «Fortsett med neste store gruppe ting, er i møte» (Teknisk anbefaling). Ingen migrasjon (0027 fra DEC-0072 venter fortsatt).
- [ ] **Mars:** avklar KI-176, KI-178 og globale ressurser (REQ-0571).

## Før: DEC-0073 – AI-køen uten bakgrunnsjobb, kravverifisering og ti forbedringer – ferdig
- Mars: «Fortsett med neste store gruppe ting, er i møte» (Teknisk anbefaling).
- Ferdig: se DEC-0073. Ingen migrasjon (0027 fra DEC-0072 er ikke kjørt ennå).
- [ ] **Mars:** avklar KI-176 (REQ-0146, 0482, 0102, 0275, 0269) og globale ressurser (REQ-0571).

## Før: DEC-0072 – arbeidsliste, ingen automatisk generering og ti bolker – ferdig, venter på Mars
- Mars: «Tar du de neste 10?», «vi kjører ingen genereringer av video automatisk …» og ønsket om arbeidsliste for oppdaterte ressurser (Bekreftet av bruker).
- Ferdig: arbeidsliste, stillbilder, valgte scener i eksport, sporbarhet, koblinger for en linje, teknisk visning, lagring og eksportinnstillinger, film i spinoff, animerte masker, ende-til-ende-test. Migrasjon 0027.
- [ ] **Mars:** commit og push (slett `src/routes/api/cron/ai-jobs.ts`), kjør LOVABLE_SYNC (0027).
- [ ] **Mars:** prøv arbeidslisten: last opp nytt bilde av en ressurs, godkjenn med «behold» i noen scener, åpne «Gå gjennom scenene …».

## Før: DEC-0071 – ti store bolker til – levert og kjørt i Lovable
- Mars: «I møte, kan du ta de neste 10 store bolkene?» (Teknisk anbefaling; ingen nye produktkrav).
- Ferdig: sammenheng i køen, myke overganger mellom deler, kvalitetssjekkliste, betegnelser i bestemte linjer, stilprofiler per bruk, masker og blanding, eksporttekst, manusdekning, dialog med AI-stemmer, kravgjennomgang (35 krav). Migrasjon 0026. Kodegjennomgang: 9 av 10 funn rettet.
- Akseptanse: overgangen gjør ikke scenen kortere og når aldri forbi nabodelen (enhetstest); en kjede venter aldri for alltid (enhetstest); sjekklisten er alltid merket rådgivende (enhetstest); skjermbilder 30b, 02f, 04b, 80c, 80d.
- [ ] **Mars:** kjør LOVABLE_SYNC (0024–0026, `text/plain` for bøtta `sources`, planlagt kall hvert 5. minutt).
- [ ] **Mars:** velg navn for REQ-0430 (KI-171); prøv AI-stemmer med én kort replikk (KI-168).

## Før: DEC-0070 – ti store bolker – ferdig, venter på Mars
- Mars: «fortsett med de neste 10 store tingene!» (Teknisk anbefaling; ingen nye produktkrav).
- Ferdig: bakgrunnskø, video for flere scener med kø/prioritet/fremdrift, innsatsnivå, modelltilpassede beskrivelser, sammenheng mellom segmenter, kandidater og sammenligning, hybrid sammensetting, oppdatering med AI ved avvik, Fountain, lydkoblinger og -filter. Migrasjon 0025.
- [ ] **Mars:** kjør LOVABLE_SYNC (0024–0025, `text/plain` for bøtta `sources`, planlagt kall hvert 5. minutt).
- [ ] **Mars:** prøv «Video for flere scener» med to korte scener og en billig modell; KI-159–165.

## Før: DEC-0069 – egne AI-leverandører (bilde, video, lyd) – ferdig, venter på Mars
- Mars: «løsningen kan presentere en liste over de mest brukte ai leverandørene … denne nøkkelen må sikres etter alle kunstens regler og det må være mulig å sette et tak på ai kost på overordnet nivå» (Bekreftet av bruker).
- Ferdig: leverandørliste med veiledning og lenker, kryptert nøkkel, overordnet tak, bilder med valgt leverandør, video per segment i «Generer scene», lyd for lydressurser, migrasjon 0024, kodegjennomgang (10 av 11 funn rettet).
- Akseptanse: nøkkelen kan ikke leses fra nettleseren (DB-test), taket kontrolleres før og etter (enhetstest), video legges inn som ny versjon og erstatter aldri 2D-scenen (enhetstest), kostnad bekreftes alltid (skjermbilder 02b–02d, 79).
- [ ] **Mars:** kjør LOVABLE_SYNC (0024); legg helst inn `ANIMATIC_KEY_ENCRYPTION_KEY` før første nøkkel (KI-156).
- [ ] **Mars:** prøv én leverandør med en liten jobb (KI-153); avgjør om deling av eierens nøkkel skal slås på per prosjekt (KI-157).

## Før: DEC-0068 – nattarbeid runde 6–10 – ferdig
- Mars: «grønt lys til at du kjører fem runder til før jeg står opp».
- Ferdig: fortellingstid i manus, utvikling over tid, flere filter, plan ved deling/sammenslåing, rettinger.
- Gjenstår: Mars kjører 0022–0023 i Lovable og prøver; KI-150–152.

## Før: DEC-0067 – nattarbeid 12.10.2026 – ferdig
- Mars: «kan du ta fem runder frem til i morgen?» (ingen nye produktkrav; Teknisk anbefaling).
- Ferdig: AI-bilder som ikke ble lagt inn kan hentes inn; varighet og produksjonsstatus med filter og lenker; planlagt lengde per scene; eieren kan fjerne medlem; kravrevisjon (65 krav).
- Gjenstår: Mars kjører 0022–0023 i Lovable og prøver; KI-146/147.

## Før: DEC-0066 – AI skriver bildebeskrivelsen og ser filmens bilder – ferdig (ikke prøvd mot ekte gateway)
- Mars: «Ja også for spinn off. Og ja trenger maksimal god beskrivelse, ja bilder kan sendes og brukes».
- Ferdig: «Skriv beskrivelsen med AI» (språkmodell, logget, utenfor bildebudsjettet), forbildebilder sendt med (≤ 6), KI-141 avklart, migrasjon 0022.
- Akseptanse: teksten vises og kan endres før generering; bildene og rollen deres står i beskrivelsen; tester grønne (enhet, database, skjermbilde 75).
- Gjenstår: Mars prøver i Lovable (KI-143).

## Også nå: DEC-0065 – filmens visuelle stil og AI-beskrivelser med sammenheng – ferdig (uten språkmodell)
- [x] Stilprofil (migrasjon 0021), «Filmens visuelle stil» med utkast og forhåndsvisning, beskrivelser med FILM/VISUAL STYLE/THIS IMAGE/WHERE IT APPEARS/CONSISTENCY/AVOID, scenen fra sceneeditoren, stilen i video-beskrivelser
- [x] Enhetstester, DB-test, skjermbilder 73–74
- [ ] **Mars:** fyll ut filmens visuelle stil (Prosjektoversikt) og se på en beskrivelse i sceneeditoren
- [ ] **Mars:** ja/nei til språkmodell som skriver beskrivelsen om (kostnad) og til å sende forbildebilder med

## Også nå: DEC-0064 – bilder i fullskjerm, nedlasting med prosjektnavn og opplasting igjen – ferdig
- [x] REQ-0588; skjermbilder 71–72; enhetstester for navn og erstatning
- [ ] **Mars:** Prøv: Bibliotek → Maja → dobbeltklikk et bilde → «Last ned» → endre bildet → «Last opp endrede bilder …» → «Erstatt»
- [ ] **Mars:** svar på spørsmålene om smartere bildebeskrivelser (språkmodell/kostnad, forbildebilder, filmens visuelle bibel)

## Også nå: DEC-0063 – endre rolle etter invitasjon og «Tilbake til …» – ferdig
- [x] REQ-0586 (migrasjon 0020, DB-test), REQ-0587 (enhetstest); skjermbilder 69–70
- [ ] **Mars:** Prøv: Prosjektoversikt → Medlemmer → endre rollen til Anita; gå Manus → Bibliotek → «Tilbake til Manus»

## Også nå: DEC-0062 – «Bruk aktivt utsnitt», grupper med dra og slipp, fjern lag, justerbar lagliste – ferdig
- [x] REQ-0584 (kamera), REQ-0585 (lag); skjermbilder 34, 67, 68
- [ ] **Mars:** Prøv i sceneeditoren: dra et lag inn på «Familien» og ut igjen; velg et kamerautsnitt i scene 2 → «Bruk aktivt utsnitt»

## Forrige: DEC-0060 – M7 del 4: tilbakeføring fra spinoff, kontinuitet i spinoffer, utdrag – ferdig, venter på Mars (leveres sammen med DEC-0049–0059)
- [x] Sammenligning og valg ved tilbakeføring, ny hovedfilmversjon, overføring av ny scene (REQ-0373–0383, REQ-0500)
- [x] Kontinuitet per produksjon: arvet, avslått og lokal (REQ-0166/0167); varsler om hull med «Ta med scenen» (REQ-0325/0369)
- [x] Utdrag av ferdig film og sammenbindende scener i spinoff (REQ-0367/0368/0370)
- [x] Migrasjon 0018; 436 Vitest, 43 DB-tester, skjermbilder 100–102, kodegjennomgang (12 funn: rettet, resten KI-122–127)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Majas jul – kortversjon» → «Tilbakefør» → «Overfør valgte»; Bibliotek → Maja med spinoffen valgt → «Slå av i …»

## Forrige: DEC-0059 – M7 del 3: engelsk film (lyd, bilder, timing og eksport per språk) – ferdig, venter på Mars (leveres sammen med DEC-0049–0058)
- [x] Lyd per språk, felles musikk/effekter, lyd per replikk og språk (REQ-0336–0340); like scenelengder i alle språk
- [x] Bilde per språk i lag (REQ-0337); filmlyd med blandet dialog merkes og varsles (REQ-0341/0342)
- [x] «Språkversjon …»: timingkonflikter med forslag, materialtype og råd om leppesynk, aldri regenerering (REQ-0343–0347)
- [x] Dialogspråk og undertekster uavhengig, eksport per språk og dialogspor som WAV (REQ-0348/0350/0352), spinoff (REQ-0371)
- [x] Migrasjon 0017; 411 Vitest, 42 DB-tester, skjermbilder 96–99, kodegjennomgang (9 funn: rettet, resten KI-117–121)
- [ ] **Mars:** Prøv: Montering → «Dialog: Engelsk» og «Tekst: Engelsk» → spill av; «Språkversjon …»; Eksporter → «Bare dialogspor (WAV)»

## Forrige: DEC-0058 – M7 del 2: engelsk manus – ferdig, venter på Mars (leveres sammen med DEC-0049–0057)
- [x] Oversettelse per linje og scenehode, endrer aldri norsk; «må gjennomgås» ved endret norsk (REQ-0329–0331)
- [x] Import av oversatt manus med automatisk kobling og godkjenning (REQ-0332–0335) – referansemanuset 97/97 scener
- [x] Engelsk visning, redigering i inspektøren, eksport av engelsk manus, undertekster (REQ-0349/0351)
- [x] Migrasjon 0016; 394 Vitest, 41 DB-tester, skjermbilder 93–95, kodegjennomgang (16 funn: rettet, resten KI-113–116)
- [ ] **Mars:** Prøv: Manus → «Engelsk» → «Importer engelsk manus …» (den engelske Word-filen) → kontroller koblingene → Lagre

## Forrige: DEC-0057 – M7 del 1: avledede produksjoner (spinoff) – ferdig, venter på Mars (leveres sammen med DEC-0049–0056)
- [x] «Ny produksjon …» og «Legg til scener …» (REQ-0353/0354), nye scener bare i spinoffen (REQ-0361–0363)
- [x] Felles produksjonsvalg i manus, montering, sceneeditor og bibliotek
- [x] Automatisk egen versjon av en gjenbrukt scene ved endring, med 2D-scene, historikk og koblinger (REQ-0365)
- [x] 384 Vitest, 40 DB-tester, skjermbilder 89–92, kodegjennomgang (11 funn + småting: rettet, resten KI-107–112)
- [ ] **Mars:** avklar KI-107 (deling/sammenslåing i hovedfilmen av scener som også er i en spinoff)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Ny produksjon …» → velg scener → Manus (velg produksjonen) → endre en replikk

## Forrige: DEC-0056 – M6 del 3: konsekvenser ved ressursendring og kontinuitetsanalyse – ferdig, venter på Mars (leveres sammen med DEC-0049–0055)
- [x] Godkjenning med konsekvenser: berørte scener, valg per scene, film som «kan være påvirket» (REQ-0130/0132/0134/0314)
- [x] Eldre versjon flagges i sceneeditoren med «Bruk vN»
- [x] Rådgivende kontinuitetsanalyse på prosjektoversikten (REQ-0319–0324, REQ-0129)
- [x] 376 Vitest, 39 DB-tester, skjermbilder 87–88, kodegjennomgang (12 funn + småting: rettet, resten KI-103–106)
- [ ] **Mars:** Prøv: Prosjektoversikt → «Kontinuitetsanalyse»; Bibliotek → Maja → «Godkjenn» på et nytt bilde

## Forrige: DEC-0055 – M6 del 2: kontinuitet for karakterene – ferdig, venter på Mars (leveres sammen med DEC-0049–0054)
- [x] Kontinuitetshendelser (11 typer, før/etter, scene/linje, varighet) med kommandoer og migrasjon 0015 (REQ-0150–0156)
- [x] Utseende per scene etter fortellingstid, også tilbakeblikk (REQ-0152/0160/0165)
- [x] Tidslinje per karakter, forslag fra manuset som godkjennes/avvises (REQ-0155/0157/0158)
- [x] Sceneeditoren: riktig utseende ved innlegging, visning og advarsel; «Generer scene» med riktig utseende og segmenter før/etter endringen (REQ-0159/0161–0163)
- [x] 369 Vitest, 39 DB-tester, skjermbilder 83–86, kodegjennomgang (10 funn: 9 rettet, 1 registrert som avklaring KI-100)
- [ ] **Mars:** avklar KI-100 (skal en hendelse i en deaktivert scene gjelde?)
- [ ] **Mars:** Prøv: Bibliotek → Maja → «Kontinuitet» → «Ny hendelse» (eller godkjenn et forslag) → se tidslinjen og sceneeditoren

## Forrige: DEC-0054 – M6 del 1: avvik ved manusendring – ferdig, venter på Mars (leveres sammen med DEC-0049–0053)
- [x] Grunnlag for 2D-scener og godkjent grunnlag for versjoner; deteksjon på tekst, berørt tidsrom
- [x] Avvik synlige i monteringen, manuset, sceneeditoren og på prosjektoversikten (REQ-0315)
- [x] Tre valg: godkjenn, oppdater, angre manusendringen (hele scenen eller én linje)
- [x] 0014 utvidet; 355 Vitest, 38 DB-tester, skjermbilder 80–82, kodegjennomgang (10 funn: 8 rettet, resten KI-96–98)
- [ ] **Mars:** Prøv: endre en replikk i en scene med 2D-scene → Montering viser avviket → Godkjenn / Angre

## Forrige: DEC-0053 – M5 del 2: AI med kontroll – ferdig, venter på Mars (leveres sammen med DEC-0049–0052)
- [x] Frilegging med pensel, gratis i nettleseren (REQ-0580)
- [x] AI-budsjett (eier), sperre på serveren, forbruk og anslag (REQ-0279–0284, REQ-0528)
- [x] Liste over AI-jobber med status og «Prøv igjen» (REQ-0292–0303)
- [x] «Generer scene»: segmenter og beskrivelser som kan endres, lagres og kopieres (REQ-0243–0267)
- [x] Migrasjon 0014; 347 Vitest, 37 DB-tester, skjermbilder 77–79, kodegjennomgang (11 funn + småting: rettet, resten KI-91–95)
- [ ] **Mars:** velg og godkjenn videoleverandør og pris (KI-94) – da kan «Generer» slås på
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013, 0014, 0015 og 0016)
- [ ] **Mars:** Prøv: Bibliotek → versjon → «Frilegg …»; Prosjektoversikt → «AI-budsjett og jobber»; Montering → scene → «Generer scene …»

## Forrige: DEC-0052 – sceneeditor del 3 – ferdig, venter på Mars (leveres sammen med DEC-0049–0051)
- [x] Bildeskifte i lag, merke i tidslinjen som kan dras (REQ-0579)
- [x] Grupper med ankerpunkt; lag inn/ut uten å hoppe; sletting av gruppe beholder lagene (REQ-0174)
- [x] Bevegelsesbane: frihånd, «Glatt ut», rett linje, punkter, kurve/hjørne (REQ-0581)
- [x] Ease ut/inn med styrke (bane og nøkkelbilder) og tempokurve (REQ-0582)
- [x] Naboscener som film med lyd og overganger (REQ-0578)
- [x] Lydopptak i sceneeditoren (REQ-0583)
- [x] 0013 utvidet (grupper, `image_swaps`, `motion_path`, `anchor`); 329 Vitest, 36 DB-tester, skjermbilder 73–76, kodegjennomgang (12 funn: 10 rettet, 2 registrert som KI-87/88)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013)
- [ ] **Mars:** Prøv: Sceneeditor → velg lag → «Bytt bilde ved …», «Tegn bane», «Glatt ut», tempo; «Ny gruppe»; «Naboscener»; «Opptak» (med mikrofon)
- [ ] Senere (M5): frilegging med pensel (REQ-0580)

## Forrige: DEC-0051 – overganger, svart-hvitt, eget vindu, hendelser i 2D-scenen – ferdig, venter på Mars (leveres sammen med DEC-0049/0050)
- [x] Sju overgangstyper, overlapp, standardovergang (REQ-0575–0577, REQ-0223)
- [x] Svart-hvitt globalt og per scene, også i eksporten (REQ-0573/0574)
- [x] Forhåndsvisning i eget vindu (REQ-0572)
- [x] Hendelser i 2D-scenen koblet til manus (REQ-0096, REQ-0095 delvis)
- [x] Migrasjon 0013, 312 Vitest, 35 DB-tester, skjermbilder 69–72, kodegjennomgang (10 funn: 8 rettet, 2 registrert som KI-84/85)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0013)
- [ ] **Mars:** Prøv: Montering → «Standardovergang», scene → overgang «Iris» med overlapp, «Svart-hvitt», «Eget vindu»; Sceneeditor → velg lag → «Hendelser i manuset»

## Forrige: DEC-0049 – sikkerhetskopi, manus ↔ film, samlet angring – ferdig, ikke levert ennå (Mac av)
- [x] Sikkerhetskopi som zip med dokumentert format; gjenoppretting som nytt prosjekt (REQ-0411/0412/0448)
- [x] «Vis i filmen» fra manuset, «Vis i manus» med replikken under avspillingshodet (REQ-0092/0100, REQ-0099 delvis)
- [x] «Importer lang film» og «Importer ferdig film» angres som ett steg (KI-75)
- [x] Beslutningsloggen gjenopprettet (KI-78)
- [x] Ingen migrasjon. 302 Vitest, 34 DB-tester, skjermbilder 66–68, kodegjennomgang (11 funn: 9 rettet, 2 registrert som KI-81/82)
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (bare bygg)
- [ ] **Mars:** Prøv: Prosjekter → ⋯ → «Sikkerhetskopi …»; deretter «Gjenopprett fra sikkerhetskopi …» med filen (gir et nytt prosjekt); Manus → velg en replikk → «Vis i filmen»

## Forrige: DEC-0048 – montering del 4: klipping, tidskoblinger, lang film – levert, 0012 kjørt
- [x] Deler av klipp: trim, splitt (S), bildepresise inn/ut, fjerne del, «Hele klippet» (REQ-0220–0222)
- [x] Animatic-rest: film og animatic i samme scene (REQ-0239)
- [x] Tidskoblinger per replikk, «Synk replikker» (T), ikke dekket markeres (REQ-0093/0094/0107/0231)
- [x] Importer lang film over flere scener (REQ-0003, REQ-0237 delvis); status for film (REQ-0241)
- [x] Migrasjon 0012, 286 Vitest, 33 DB-tester, skjermbilder 63–65, kodegjennomgang (13 funn: 10 rettet, 3 registrert som KI-72–74)
- [x] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0012)
- [ ] **Mars:** Prøv: Montering → scene med film → S for å splitte, endre Inn/Ut; «Synk replikker» + T under avspilling; «Importer lang film»

## Forrige: DEC-0046/0047 – slett/forlat prosjekt, zip, importert film, overganger – levert, 0011 kjørt
- [x] Slett prosjekt (eier), forlat prosjekt, ressurser fra slettede prosjekter, zip (REQ-0567–0571)
- [x] Importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode (DEC-0047)
- [x] Migrasjon 0011, 273 Vitest, 32 DB-tester, skjermbilder 56–62, kodegjennomgang (10 funn rettet)
- [x] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0011)
- [ ] **Mars:** Prøv: Montering → velg scene → «Importer ferdig film …»; overgang; klikk på replikk; prosjektlisten → ⋯

## Tidligere: DEC-0045 – lyd over flere scener, lydprofil, varmgult kamerautsnitt, AI-bilder – ferdig, venter på Mars
- [x] Lyd i scenene rundt med «Bruk i scenen» (REQ-0560)
- [x] «Løper videre» over flere scener, varmgult (REQ-0561)
- [x] Lydprofil med volumpunkter som i After Effects (REQ-0562); bølgeformer i sceneeditoren (REQ-0563)
- [x] Aktivt kamerautsnitt varmgult (REQ-0564)
- [x] AI-bilder med Lovable-kreditter: synlig prompt, bekreftelse, grenser, logg (REQ-0565)
- [x] Migrasjon 0010, 264 Vitest, 27 DB-tester, skjermbilder 52–55
- [ ] **Mars:** Commit + Push, lim inn `LOVABLE_SYNC.md` (kjør 0010, slå på Lovable AI)
- [ ] **Mars:** Prøv én AI-generering (dobbeltklikk på et lag → «Generer …»), musikk som løper videre og volumpunkter

## Tidligere (økt 4)

## Nå: Mars' ønsker + notater + M3 del 1 (ressursbibliotek) – ferdig, venter på Mars
- [x] M2 del 2 testet av Mars; migrasjon 0003 kjørt i Lovable
- [x] REQ-0532–0534 (DEC-0029): «Endre rekkefølge og synlighet»-bryter, flyttede scener markert, sammenligning linje for linje
- [x] REQ-0535–0543 (DEC-0031): notater (ord/setning/nål, stempel, sletting med advarsel, vis/skjul, søk, eksport og ny import), søketreff markert, scenelisten følger manuset, valgt scene øverst
- [x] M3 del 1 (DEC-0030): ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag fra manuset; karakterfilter med alle navn (KI-29)
- [x] Migrasjon 0004 (`0004_library_notes.sql`), DB-tester, kodegjennomgang (9 funn rettet)
- [ ] **Mars:** Commit + Push, deretter synkmeldingen for `0004_library_notes.sql` (`docs/development/LOVABLE_SYNC.md`)
- [ ] **Mars:** Prøv: Ressursbibliotek → «Forslag fra manuset», legg til bilde og godkjenn; Manus → merk ord → «Legg til notat»; søk; eksporter med notater og importer filen igjen i et testprosjekt

## Neste (forslag – M3 del 2: 2D-sceneeditor)
1. Lagbasert 2D-komposisjon per scene med ressurser fra biblioteket (bakgrunn, mellomgrunn, forgrunn, karakterer, objekter).
2. Transformasjoner, keyframes/easing, kamera med blå/rød ramme og Bézier-bane, avspilling i nettleseren.
3. Avklaring Q-03 (hvor mye karakteranimasjon) før animasjonsdelen.
