## ANIMATIC STUDIO  
## Komplett prosjektmandat, produktvisjon og utviklingsinstruksjoner  
## Hovedspesifikasjon – samlet versjon 14  
  
## 1. DIN ROLLE OG PROSJEKTETS FORMÅL  
Du skal være min langsiktige tekniske arkitekt, produktdesigner, UX-designer, systemutvikler og kreative utviklingspartner i arbeidet med å utvikle **Animatic Studio**.  
Animatic Studio skal være en avansert, profesjonell applikasjon for utvikling, planlegging, visualisering, produksjon, versjonering og sammenstilling av film.  
Programmet skal kombinere:  
* Profesjonell manusbehandling.  
* Automatisk scenedeteksjon og produksjonsanalyse.  
* Globale biblioteker for karakterer, objekter og lokasjoner.  
* En redigerbar, lagbasert 2D-sceneeditor.  
* Kameraanimasjon basert på tradisjonell multiplan-teknikk.  
* Tidslinje for bilde, lyd, dialog og bevegelser.  
* Automatisk generering av presise instruksjoner til ulike AI-modeller.  
* Integrasjon med eksterne bilde-, lyd- og videogenereringstjenester.  
* En selvstendig animatic-motor som ikke er avhengig av AI.  
* Profesjonell versjons- og kontinuitetskontroll.  
* Renderingskø og bakgrunnsproduksjon.  
* Flerspråklig manus, dialog og filmeksport.  
* Avledede produksjoner, kortfilmer og spinoffer.  
* Presentasjonsmateriell, pitchplakater og karakterkart.  
* Ferdig sammenstilling og eksport av filmer.  
Applikasjonen skal gjøre det mulig å utvikle en film fra første manusutkast til ferdig sammenstilt materiale, samtidig som eksisterende filmmateriale kan importeres og inngå i produksjonen.  
Programmet skal ikke bare være et grensesnitt mot AI-tjenester. Det skal være et fullverdig produksjonsmiljø som fungerer selv når brukeren ikke ønsker å bruke generativ AI.  
## 1.1 Produktnavn  
Produktets eneste offisielle navn er:  
**Animatic Studio**  
Ikke bruk «AI Animatic Studio» som produktnavn.  
Det er naturlig å bruke betegnelser som AI-generering, AI-modeller, AI-integrasjoner og AI-kvalitetskontroll når funksjonaliteten beskrives, men dette skal ikke være del av selve produktnavnet.  
## 1.2 Utviklingsplattform og videre portabilitet  
Den første versjonen skal utvikles med utgangspunkt i **Lovable**.  
Løsningen skal likevel arkitekteres slik at kjernefunksjonalitet, datamodell, genereringsmotor, mediebehandling og produksjonslogikk kan flyttes til eller gjenbrukes i senere desktop-versjoner for **macOS og Windows**.  
Løsningen skal likevel arkitekteres slik at kjernefunksjonalitet, datamodell, genereringsmotor, mediebehandling og produksjonslogikk kan flyttes til eller gjenbrukes i senere desktop-versjoner for **macOS og Windows**.  
Unngå unødvendige plattformbindinger.  
Skill tydelig mellom:  
1. Domene- og datamodell.  
2. Brukergrensesnitt.  
3. Medie- og animasjonsmotor.  
4. AI-integrasjoner.  
5. Renderingskø og jobborkestrering.  
6. Lagring og versjonering.  
7. Eksport og filbehandling.  
Ikke anta at Lovable alene kan utføre alle tunge medieoperasjoner eller langvarige bakgrunnsjobber. Foreslå nødvendige backend-tjenester eller separate komponenter der dette er teknisk riktig.  
## 1.3 Overordnet designfilosofi  
Animatic Studio skal være:  
* Profesjonelt.  
* Elegant.  
* Filmisk.  
* Oversiktlig.  
* Effektivt.  
* Ikke-destruktivt.  
* Modulært.  
* Pålitelig.  
* Brukerstyrt.  
Grensesnittet skal ha en sofistikert, moderne og gjerne mørk visuell utforming som passer en profesjonell filmproduksjon.  
Det skal oppleves som et troverdig kreativt arbeidsverktøy, ikke som en generell chatbot eller en samling tilfeldige AI-funksjoner.  
Brukergrensesnittet skal støtte norsk.  
Tekniske systeminstruksjoner og genereringsprompter til AI-modeller skal som hovedregel skrives på engelsk for presisjon og kompatibilitet.  
  
## 2. ABSOLUTT VIKTIGSTE ARKITEKTURPRINSIPP  
## Manus og film er to visninger av den samme produksjonen  
Dette prinsippet har høyeste prioritet og skal styre alle senere tekniske valg.  
**Manus, animatic, film, 2D-animasjon, lyd og aktiv filmtidslinje må være koblet til én felles, strukturert prosjektmodell.**  
**Manus, animatic, film, 2D-animasjon, lyd og aktiv filmtidslinje må være koblet til én felles, strukturert prosjektmodell.**  
De skal ikke utvikles som uavhengige dokumenter som forsøker å holde seg synkronisert i ettertid.  
Når en scene flyttes i manuset, skal den også flyttes i filmens aktive rekkefølge.  
Når en scene flyttes i filmens overordnede tidslinje, skal manuset vise tilsvarende rekkefølge.  
Når en scene eller delsekvens deaktiveres, skal den utelates fra både aktiv manusvisning, filmavspilling, spilletidsberegning og eksport.  
Skjult materiale skal ikke slettes, men kunne gjenaktiveres senere.  
Programmet må skille mellom:  
* Midlertidig skjuling av et grensesnittelement.  
* Produksjonsmessig deaktivering av en scene.  
Bare produksjonsmessig deaktivering skal endre filmens aktive innhold.  
## 2.1 Struktur og innhold er forskjellige typer synkronisering  
Det er nødvendig å skille mellom:  
**Strukturell synkronisering:** Scener, delsekvenser, rekkefølge, synlighet og aktiv filmmontering stemmer alltid overens.  
**Innholdsmessig synkronisering:** Eksisterende animatic eller film er produsert fra en bestemt versjon av manus og ressurser.  
Strukturell synkronisering skal opprettholdes automatisk.  
Hvis manusinnhold endres etter at film er produsert, skal eksisterende materiale ikke endres automatisk. Det skal flagges som potensielt ute av synkronisering.  
Brukeren bestemmer deretter hva som skal skje.  
## 2.2 Ingen destruktive automatiske endringer  
En manusendring, ressursendring, omnummerering eller endring av stil skal aldri automatisk:  
* Slette eksisterende film.  
* Overskrive godkjente ressurser.  
* Bestille en betalt AI-generering.  
* Erstatte aktiv sceneversjon.  
* Endre en annen produksjon.  
* Ødelegge en historisk manusversjon.  
All vesentlig oppdatering skal være sporbar, reverserbar og brukerinitiert.  
  
## 3. PERMANENT IDENTITET OG INTERN DATAMODELL  
## 3.1 Scenenummer er ikke en sceneidentitet  
Hver scene skal ha en permanent intern identifikator som ikke endres når scenen:  
* Flyttes.  
* Omdøpes.  
* Får endret sceneoverskrift.  
* Får nytt scenenummer.  
* Skjules.  
* Gjenbrukes i en spinoff.  
* Inngår i en ny manusversjon.  
* Får nytt produsert materiale.  
Eksempel:  
Intern scene-ID: scn_7f42a9  
Opprinnelig scenenummer: 42  
Gjeldende eksportnummer: 45  
Aktiv produksjonsversjon: render_183  
Aktiv produksjonsversjon: render_183  
Det er den interne sceneidentiteten som skal brukes i alle relasjoner, aldri scenenummeret som vises i manuset.  
## 3.2 Andre permanente identiteter  
Separate, stabile identifikatorer skal finnes for:  
* Prosjekt.  
* Produksjon.  
* Manusversjon.  
* Manusscene.  
* Manusblokk.  
* Replikk.  
* Produksjonsdelsekvens.  
* Sceneforekomst i en bestemt produksjon.  
* Karakter.  
* Karakterens utseendetilstand.  
* Visuell stilvariant.  
* Objekt eller rekvisitt.  
* Lokasjon eller miljø.  
* Lydressurs.  
* Medieressurs.  
* Genereringsjobb.  
* Genereringsprompt.  
* Sceneversjon.  
* Filmmontering.  
* Plakat.  
* Eksportversjon.  
Identifikatorene skal være uavhengige av navn, språk, plassering og synlige løpenumre.  
## 3.3 Skill scene, sceneforekomst og scenevariant  
Dette er spesielt viktig for spinoffer og gjenbruk.  
**Scene:** En permanent identifisert narrativ enhet.  
**Sceneforekomst:** Hvordan en scene brukes i en bestemt produksjon, inkludert plassering, synlighet, tidsutdrag og aktiv versjon.  
**Sceneforekomst:** Hvordan en scene brukes i en bestemt produksjon, inkludert plassering, synlighet, tidsutdrag og aktiv versjon.  
**Scenevariant:** En redigert eller alternativ utgave av scenen som kan være unik for én produksjon.  
**Scenevariant:** En redigert eller alternativ utgave av scenen som kan være unik for én produksjon.  
Samme scene skal kunne brukes i flere produksjoner uten at de automatisk deler alle redaksjonelle endringer.  
## 3.4 Transaksjonell konsistens  
Operasjoner som påvirker flere deler av prosjektmodellen, skal gjennomføres som konsistente endringer.  
Dette gjelder særlig:  
* Flytting av scener.  
* Aktivering og deaktivering.  
* Splitting og sammenslåing.  
* Endring av manusstruktur.  
* Overføring mellom produksjoner.  
* Endring av aktiv filmversjon.  
Operasjonene skal støtte angre og gjør om.  
Systemet skal ikke kunne ende i en tilstand der manus og film har forskjellige aktive scenestrukturer.  
  
## 4. PROFESJONELL MANUSMODUL  
## 4.1 Import av eksisterende filmmanus  
Programmet skal kunne importere eksisterende manusdokumenter, særlig DOCX og relevante profesjonelle manusformater.  
Ved utvikling skal manusdokumentet **«DEL 2.docx»** brukes som et konkret referanseeksempel på forventet manusformat.  
Dokumentet har blant annet:  
* Nummererte scener.  
* Sceneoverskrifter med INT./EXT.  
* Lokasjon og tidspunkt.  
* Handlingsbeskrivelser.  
* Karakterbetegnelser.  
* Innrykket dialog.  
* Parentetiske instruksjoner.  
* Betegnelser som CONT'D og O.S.  
* Sidetall og profesjonell manuslayout.  
For eksempel forekommer sceneoverskrifter av typen:  
```
31 EXT. VED MELKERAMPA - KVELD 31
32 INT. GJESTEROM - KVELD 32
```
```


```
Referansedokumentet begynner dessuten med fortsettelsen av en scene før den første nye sceneoverskriften i den importerte delen.  
Programmet må derfor håndtere manusdeler som starter eller slutter midt i en scene.  
Det må også håndtere manglende eller uregelmessige scenenumre uten å finne opp nye scener.  
Hvis denne filen ikke er tilgjengelig i Claude-prosjektet, be om at den legges ved som formatreferanse. Ikke anta at filen automatisk følger med prosjektmandatet.  
## 4.2 Bevar original visning  
Manuset skal vises slik et profesjonelt filmmanus vises.  
Bevar eller rekonstruer korrekt:  
* Sideformat.  
* Marger.  
* Skrifttype og størrelse.  
* Linjeavstand.  
* Innrykk.  
* Dialogkolonner.  
* Sceneoverskrifter.  
* Scenenumre.  
* Sidetall.  
* Parentetiske instruksjoner.  
* Linje- og sideskift etter gjeldende manusregler.  
Manusvisningen skal ikke erstattes av en vanlig notateditor, en tabell eller en kortvisning.  
Ved redigering skal tekst ombrytes og pagineres korrekt etter filmmanusregler.  
Originaldokumentet skal bevares uendret som historisk referanse.  
Intern analyse og strukturering av manuset skal ikke ødelegge den visuelle gjengivelsen.  
## 4.3 Automatisk scenedeteksjon  
Når et manus importeres, skal systemet automatisk:  
1. Identifisere scener.  
2. Lese scenenumre.  
3. Identifisere sceneoverskrifter.  
4. Registrere lokasjoner.  
5. Registrere tidspunkt.  
6. Identifisere dialog, handling og karakterer.  
7. Opprette permanente sceneidentiteter.  
8. Opprette en strukturert manuskopi.  
9. Markere usikre tolkninger.  
Brukeren skal kunne korrigere feilaktig scenedeteksjon manuelt.  
Manuspassasjer før første sceneoverskrift skal bevares og kunne kobles til en tidligere scene.  
## 4.4 Nye og endrede scener  
Brukeren skal kunne:  
* Opprette scener.  
* Flytte scener.  
* Skjule eller deaktivere scener.  
* Aktivere dem igjen.  
* Redigere dialog.  
* Redigere handling.  
* Splitte scener.  
* Slå sammen scener.  
* Sammenligne manusversjoner.  
* Angre og gjøre om.  
En narrativ splitting som skaper to selvstendige manusscener skal behandles annerledes enn en produksjonsteknisk oppdeling for videogenerering.  
Produksjonsteknisk oppdeling skal ikke endre manusets scenenummerering.  
## 4.5 Søk og filtrering  
Manuset skal kunne søkes og filtreres etter:  
* Karakter.  
* Objekt eller rekvisitt.  
* Lokasjon.  
* Scene.  
* Dialoginnhold.  
* Produksjonsstatus.  
* Synkroniseringsavvik.  
* Andre relevante metadata.  
Brukeren skal eksempelvis kunne velge en karakter og få vist bare scener der denne karakteren opptrer.  
Filtrering av manusvisningen er ikke det samme som å deaktivere scener i produksjonen.  
  
## 5. MANUSVERSJONERING OG EKSPORTNUMMERERING  
## 5.1 Flere komplette manusversjoner  
Animatic Studio skal støtte mange manusversjoner med full historikk.  
Hver versjon skal bevare:  
* Manusinnhold.  
* Scenerekkefølge.  
* Synlighet.  
* Scenenummerering.  
* Relasjoner til tidligere versjoner.  
* Koblinger til produsert materiale.  
Systemet skal kunne sammenligne versjoner og identifisere:  
* Nye scener.  
* Fjernede eller skjulte scener.  
* Flyttede scener.  
* Endret dialog.  
* Endret handling.  
* Endrede sceneoverskrifter.  
* Endringer i karakterer og objekter.  
En scene som bare har fått nytt nummer, skal ikke feilaktig behandles som en ny scene.  
## 5.2 Eksportnummerering velges hver gang  
Ved hver manuseksport skal brukeren kunne velge nummereringsmetode.  
Valgene skal omfatte:  
**Fortløpende nummerering:** Alle aktive scener nummereres på nytt.  
**Fortløpende nummerering:** Alle aktive scener nummereres på nytt.  
**Bevar produksjonsnummerering:** Etablerte scenenumre beholdes, og nye scener kan få mellomnumre som 42A og 42B.  
**Bevar produksjonsnummerering:** Etablerte scenenumre beholdes, og nye scener kan få mellomnumre som 42A og 42B.  
**Bevar valgt historisk nummerering:** Nummereringen fra en bestemt tidligere manusversjon brukes der det er hensiktsmessig.  
Brukeren skal kunne velge om skjulte eller deaktiverte scener skal inkluderes.  
Eksportvalg skal ikke endre prosjektets interne sceneidentiteter.  
Programmet skal vise en forhåndsvisning av nummereringen før eksport.  
## 5.3 Profesjonell manuseksport  
Programmet skal kunne eksportere korrekt formatert manus.  
Prioriter:  
* DOCX.  
* PDF.  
* Andre relevante profesjonelle manusformater dersom implementeringen støtter dem pålitelig.  
Manuset skal opprettholde korrekt layout, sceneorden og nummerering.  
Eksport skal ikke kreve AI-generering.  
  
## 6. INTERAKTIVT MANUS MED TOVEIS TIDSLINJESYNKRONISERING  
Manuset skal ikke bare være en tekstlig beskrivelse av filmen. Det skal være et aktivt navigasjonsverktøy.  
## 6.1 Manusblokker med tidskoblinger  
Hver replikk og handlingsbeskrivelse skal kunne kobles til ett eller flere tidsintervaller.  
Disse koblingene skal lagres med permanente identifikatorer.  
En replikk kan være knyttet til:  
* Et dialogopptak.  
* Et bestemt tidspunkt.  
* En hendelse i 2D-scenen.  
* Ett eller flere filmklipp.  
En handlingsbeskrivelse kan knyttes til flere visuelle hendelser.  
## 6.2 Toveis navigasjon  
Når brukeren klikker på en replikk, skal avspillingshodet kunne flyttes til tilsvarende tidspunkt i filmen.  
Når brukeren flytter avspillingshodet, skal programmet kunne markere den aktuelle manuspassasjen.  
Dette skal fungere for:  
* Planlagte animatics.  
* Redigerbare 2D-scener.  
* AI-generert video.  
* Importert ferdig film.  
* Sammensatte scener med flere klipp.  
Manus og film skal kunne vises side ved side.  
Automatisk rulling skal kunne slås av og på.  
## 6.3 Skjul tekniske detaljer i ordinær manusvisning  
Manuset skal fremdeles se ut som et profesjonelt filmmanus.  
Tidskoder, produksjonsmarkeringer og annen teknisk metadata skal normalt ikke forstyrre manuslayouten.  
De skal kunne vises i egne arbeidsmoduser og paneler.  
De skal ikke automatisk inngå i eksportert manus.  
## 6.4 Presis tidsmodell  
Systemet skal kunne håndtere:  
* Lokal tid innenfor en scene.  
* Tid innenfor en delsekvens.  
* Tid innenfor et kildeklipp.  
* Absolutt tid i den samlede filmen.  
Tidsmodellen skal være presis i forhold til prosjektets bildefrekvens.  
Når en scene flyttes, skal dens interne tidskoblinger bevares mens den samlede filmens tidskoder beregnes på nytt.  
  
## 7. VARIGHETSESTIMERING OG PRODUKSJONSOVERSIKT  
## 7.1 Automatisk estimering  
Etter manusimport skal programmet kunne estimere spilletid per scene og for hele filmen.  
Estimatene kan baseres på:  
* Dialogmengde.  
* Handlingsbeskrivelser.  
* Pauser.  
* Montasjer.  
* Beskrevet fysisk handling.  
* Andre relevante produksjonsantakelser.  
Estimatene må presenteres som usikre når grunnlaget er usikkert.  
Brukeren skal kunne korrigere dem.  
## 7.2 Gradvis økende presisjon  
Etter hvert som produksjonen utvikles, skal estimert varighet erstattes av mer presise tall.  
Skill mellom:  
* Estimert varighet.  
* Brukerplanlagt varighet.  
* Varighet i 2D-animatic.  
* Varighet fra AI-generert materiale.  
* Faktisk varighet fra importert eller ferdig film.  
En scene skal ikke dobbeltelles selv om flere versjoner finnes.  
Skjulte scener skal utelates fra aktiv totalvarighet.  
## 7.3 Egen oversiktsside  
Varighetsinformasjon skal hovedsakelig vises på en egen prosjektoversikt.  
Den ordinære manusvisningen skal ikke fylles med varighetstall ved hver scene.  
Oversikten skal vise:  
* Estimert total spilletid.  
* Bekreftet spilletid.  
* Gjenstående estimert spilletid.  
* Antall scener.  
* Varighet per scene.  
* Andel av filmen som er ferdig.  
* Andel som fortsatt er estimert.  
* Produksjonsstatus.  
* Scener med uavklarte avvik.  
Brukeren skal kunne navigere direkte fra oversikten til en scene.  
## 7.4 Historiske varighetsprognoser  
Systemet skal kunne bevare tidligere estimater og vise hvordan forventet filmlengde endres gjennom produksjonen.  
  
## 8. GLOBALT RESSURSBIBLIOTEK  
Animatic Studio skal ha et sentralt bibliotek for alle ressurser som brukes i produksjonen.  
Dette skal omfatte:  
* Karakterer.  
* Objekter.  
* Rekvisitter.  
* Dyr.  
* Lokasjoner.  
* Miljøer.  
* Bakgrunner.  
* Bilder.  
* Lydfiler.  
* Genererte ressurser.  
* Visuelle stilprofiler.  
## 8.1 Gjenbruk  
Ressurser skal kunne brukes i mange scener og flere produksjoner.  
Det skal ikke være nødvendig å opprette nye kopier av samme karakter eller objekt for hver scene.  
Biblioteket skal støtte metadata, kategorier, søk, filtrering og hensiktsmessig organisering.  
## 8.2 Permanent identitet og navnekontroll  
Karakterer og andre ressurser skal ha permanente identifikatorer.  
Systemet skal støtte:  
* Foretrukket navn.  
* Alternative navn.  
* Kallenavn.  
* Tidligere navn.  
* Språkspesifikke betegnelser.  
Eksempelvis skal «Laurits» og «onkel» kunne kobles til samme karakter der konteksten tilsier det.  
Usikre koblinger skal foreslås, ikke gjennomføres ukritisk.  
Programmet skal kunne identifisere mulige stavefeil, inkonsistente karakternavn, lokasjonsnavn og rekvisittbetegnelser.  
## 8.3 Endringer og konsekvensanalyse  
Hvis en global ressurs endres, skal programmet identifisere scener som kan være påvirket.  
Hvis eksempelvis en vase erstattes av en tekanne, skal systemet kunne finne scener der den aktuelle ressursen er brukt.  
De berørte scenene skal flagges for gjennomgang.  
Ingen ferdige scener skal regenereres automatisk.  
Brukeren skal kunne velge hvilke scener som skal oppdateres.  
  
## 9. KARAKTERBIBLIOTEK OG VISUELLE STILVARIANTER  
## 9.1 Én karakter, mange utseender  
En karakter skal ha én permanent identitet, men kunne ha flere visuelle varianter.  
Dette kan omfatte:  
* Originale referansebilder.  
* Illustrerte varianter.  
* Filmrealistiske varianter.  
* Animatic-varianter.  
* Plakatvarianter.  
* Ulike antrekk.  
* Ulike alderstrinn.  
* Ulike frisyrer.  
* Midlertidige fysiske tilstander.  
Hver variant skal kunne versjoneres og godkjennes separat.  
## 9.2 Stilharmonisering  
Når bilder fra forskjellige kilder brukes sammen, skal programmet kunne tilby AI-basert stilharmonisering.  
Karakterbilder skal kunne tilpasses en felles:  
* Tegnestil.  
* Fargepalett.  
* Lyssetting.  
* Tekstur.  
* Detaljgrad.  
* Atmosfære.  
Prosessen skal bevare karakterens gjenkjennelige identitet så langt som mulig.  
Brukeren skal kunne sammenligne original og harmonisert variant før godkjenning.  
## 9.3 Publisering til globalt bibliotek  
Et godt harmonisert karakterbilde skal kunne:  
1. Brukes bare i den aktuelle plakaten eller scenen.  
2. Lagres som en alternativ variant.  
3. Godkjennes og publiseres til det globale karakterbiblioteket.  
4. Merkes som foretrukket referanse for en bestemt stilprofil.  
Publisering skal være en eksplisitt brukerhandling.  
Eksisterende scener skal ikke automatisk bytte til den nye varianten.  
## 9.4 Stilprofiler  
Programmet skal støtte gjenbrukbare visuelle stilprofiler med referansebilder og beskrivelser av stil.  
En stilprofil skal kunne brukes på tvers av:  
* Karakterer.  
* Miljøer.  
* Objekter.  
* Plakater.  
* 2D-animatics.  
* AI-generert video.  
Systemet må skille mellom **hvem karakteren er**, **hvordan karakteren ser ut i historien**, og **hvilken visuell stil karakteren fremstilles i**.  
  
## 10. KARAKTERKONTINUITET OG UTVIKLING GJENNOM FILMEN  
Dette er en sentral funksjon.  
Karakterer kan endre utseende underveis i fortellingen.  
Systemet må forstå når forandringen skjer, og hvilke referanser som gjelder før og etter.  
## 10.1 Konkret eksempel: Maja klipper håret  
Maja har én permanent karakteridentitet.  
I en bestemt scene klipper hun håret.  
Programmet skal kunne registrere:  
* Karakter: Maja.  
* Hendelse: Klipper håret.  
* Utseende før hendelsen: Langt hår.  
* Utseende etter hendelsen: Kort hår.  
* Scene og manuspassasje der forandringen skjer.  
* Om forandringen er permanent eller midlertidig.  
Fra dette punktet i fortellingens kronologi skal riktig referanse brukes.  
Programmet må ikke feilaktig generere scener før hårklippingen med kort hår.  
## 10.2 Flere kontinuitetstyper  
Støtt blant annet:  
* Hårklipp og frisyre.  
* Hårfarge.  
* Kostymeskifte.  
* Skader og bandasjer.  
* Arr.  
* Skitt.  
* Snø og vann.  
* Skjeggvekst.  
* Aldring.  
* Objekter karakteren bærer.  
* Andre fysiske forandringer.  
Skill mellom permanente endringer, midlertidige tilstander og sceneavhengige varianter.  
## 10.3 Kontinuitetshendelser  
Hver karakter skal kunne ha en visuell kontinuitetstidslinje.  
Hendelser skal knyttes til stabile sceneidentiteter og, ved behov, bestemte manusblokker eller tidsintervaller.  
Ikke bruk scenenummer alene som referanse.  
## 10.4 Automatisk deteksjon og forslag  
Systemet skal kunne analysere manus og foreslå relevante kontinuitetshendelser.  
Hvis manus beskriver at Maja klipper håret, kan systemet foreslå en slik hendelse.  
Brukeren skal godkjenne tolkningen.  
## 10.5 Automatisk valg av riktig referanse  
Når «Generer scene» aktiveres, skal systemet automatisk velge relevante karaktertilstander ut fra fortellingens kronologi.  
Dette skal fungere selv om scenene produseres i tilfeldig rekkefølge.  
## 10.6 Forandring midt i en scene  
Hvis en forandring skjer midt i en scene, skal systemet kunne foreslå å dele produksjonen i segmenter:  
* Segment før endringen.  
* Segment etter endringen.  
Hvert segment skal få riktig karakterreferanse.  
**Denne oppdelingen skal ikke opprette nye manusscener eller endre scenenummereringen.**  
**Denne oppdelingen skal ikke opprette nye manusscener eller endre scenenummereringen.**  
Den eksisterende manusscenen skal beholde sin identitet.  
## 10.7 Ikke-lineær fortelling  
Systemet må støtte:  
* Flashbacks.  
* Flashforwards.  
* Drømmer.  
* Tidshopp.  
* Ikke-kronologisk sceneorden.  
Kontinuitet skal følge fortellingens faktiske hendelsestid, ikke bare rekkefølgen scenene vises eller produseres i.  
## 10.8 Kontinuitet og spinoffer  
Spinoffer skal kunne gjenbruke hovedfilmens kontinuitetsinformasjon, men også ha egne lokale avvik.  
En alternativ spinoff der Maja ikke klipper håret skal kunne beholde sin egen kontinuitet uten å endre hovedfilmen.  
  
## 11. 2D-SCENEEDITOR BASERT PÅ TRADISJONELL MULTIPLAN-ANIMASJON  
Sceneeditoren skal være en av applikasjonens viktigste arbeidsflater.  
Den skal være en **2D-editor**, ikke en full 3D-sceneeditor.  
Den visuelle modellen skal være inspirert av tradisjonelle multiplan-animasjonsrigger og lagbasert arbeid i programmer som After Effects.  
## 11.1 Lagbasert sceneoppbygging  
Brukeren skal kunne plassere:  
* Bakgrunner.  
* Mellomgrunner.  
* Forgrunner.  
* Karakterer.  
* Objekter.  
* Visuelle effekter.  
* Andre bildeelementer.  
Elementene skal kunne organiseres i lag med definert dybdeforhold.  
Systemet skal støtte parallakseffekter og kontrollert kamerabevegelse gjennom lagene.  
## 11.2 Transformasjoner  
Hvert element skal kunne ha redigerbare egenskaper som:  
* Posisjon.  
* Skalering.  
* Rotasjon.  
* Transparens.  
* Synlighet.  
* Gruppering.  
* Lagrekkefølge.  
* Eventuelle maskerings- og komposisjonsfunksjoner som er hensiktsmessige.  
## 11.3 Nøkkelbilder  
Elementer skal kunne animeres med keyframes.  
Systemet skal støtte tidsstyrte endringer og justerbare hastighetskurver.  
Brukeren skal kunne produsere en enkel animatic med stillbilder, objekter og bevegelse uten å bruke generativ AI.  
## 11.4 Redigerbar kilde  
Alle lag, objekter, bevegelser og kamerainnstillinger skal bevares som redigerbare prosjektdata.  
En AI-generert videofil skal ikke erstatte eller overskrive den underliggende 2D-scenen.  
  
## 12. KAMERAEDITOR OG BEVEGELSESBANER  
Kameraet skal være et sentralt, visuelt redigerbart element i 2D-scenen.  
## 12.1 Kamerautsnitt  
Kameraet skal ha et definert utsnitt basert på valgt filmformat og sideforhold.  
Brukeren skal kunne arbeide med ulike relevante bildeformater.  
## 12.2 Start- og sluttramme  
I editoren skal kameraets start- og sluttramme kunne vises som tydelige, tynne konturer.  
Den ønskede visuelle konvensjonen er:  
* **Blå ramme:** Kameraposisjon ved start.  
* **Rød ramme:** Kameraposisjon ved slutt.  
Konturene skal være omtrent 1 piksel tykke.  
Disse rammene er redigeringshjelpemidler og skal ikke inngå i eksportert film.  
## 12.3 Bevegelsesbaner  
Kamerabevegelse skal kunne styres med redigerbare baner.  
Støtt:  
* Rette baner.  
* Kurvede baner.  
* Bézier-kurver.  
* Redigerbare håndtak og kontrollpunkter.  
* Visuell manipulering direkte i arbeidsflaten.  
Dobbeltklikk på et relevant banepunkt eller segment skal kunne brukes til å veksle mellom rett og kurvet bevegelse, dersom det lar seg implementere på en intuitiv og konsistent måte.  
## 12.4 Kameraegenskaper  
Kameraet skal støtte blant annet:  
* Panorering.  
* Zoom.  
* Tilt.  
* Rotasjon.  
* Posisjonsbevegelse.  
* Flere kamerautsnitt og shots i samme scene.  
Det skal være mulig å kombinere kamerabevegelse med separat animasjon av sceneelementer.  
## 12.5 Tidslinje og easing  
Kamerabevegelsene skal være synkronisert med scenens tidslinje.  
Systemet skal støtte:  
* Nøkkelbilder.  
* Separat animasjonsstyring for ulike egenskaper.  
* Hastighetskurver.  
* Easing.  
* Visuell forhåndsvisning.  
* Justering av bevegelsenes varighet.  
  
## 13. LYD, DIALOG OG MUSIKK  
Animatic Studio skal ha et strukturert lydsystem.  
## 13.1 Lydtyper  
Skill mellom:  
* Dialog.  
* Fortellerstemme.  
* Lydeffekter.  
* Atmosfære og bakgrunnslyd.  
* Musikk.  
Lydene skal kunne plasseres på separate spor.  
## 13.2 Lydressursbibliotek  
Brukeren skal kunne laste opp eller generere lyd.  
Lydfiler skal kunne knyttes til:  
* Karakterer.  
* Replikker.  
* Scener.  
* Delsekvenser.  
* Hendelser.  
* Produksjoner.  
Programmet skal støtte organisering, søk, filtrering og versjonering av lyd.  
## 13.3 Redigering og synkronisering  
Dialoglyd skal kunne synkroniseres med manusblokker og visuelle hendelser.  
Brukeren skal kunne justere plassering, varighet, klipp og relevante lydinnstillinger.  
Lyden skal være del av både lokal animatic-avspilling og endelig eksport.  
  
## 14. SELVSTENDIG ANIMATIC-MOTOR UTEN GENERATIV AI  
Animatic Studio skal kunne produsere komplette animatics fra 2D-sceneeditoren uten at innholdet må sendes til en ekstern AI-modell.  
## 14.1 Direkte forhåndsvisning  
Programmet skal kunne spille av:  
* Lagbaserte komposisjoner.  
* Kamerabevegelser.  
* Objektanimasjon.  
* Karakterbevegelser.  
* Dialog.  
* Lydeffekter.  
* Musikk.  
## 14.2 Lokal eller ordinær medieeksport  
Programmet skal kunne rendre og eksportere 2D-animatics ved hjelp av applikasjonens egen animasjons- og mediepipeline.  
Dette kan teknisk utføres i klienten, via egen backend-renderer eller i en fremtidig desktop-applikasjon.  
Poenget er at funksjonen **ikke skal kreve generativ AI eller betalte AI-API-kall**.  
## 14.3 Hybrid produksjon  
Den samme filmmonteringen skal kunne kombinere:  
* Redigerbare 2D-animatics.  
* AI-genererte videoklipp.  
* Importert ferdig film.  
* Stillbilder med definert varighet.  
* Lyd fra ulike kilder.  
AI skal være et valgfritt produksjonslag over den underliggende animatic-strukturen.  
  
## 15. OVERORDNET FILMTIDSLINJE OG SAMMENSTILLING  
Animatic Studio skal ha en egen overordnet filmtidslinje, adskilt fra detaljredigeringen av én enkelt 2D-scene.  
Denne skal være et arbeidssted for å sammenstille den aktive filmen.  
## 15.1 Funksjoner  
Brukeren skal kunne:  
* Se alle aktive scener i riktig rekkefølge.  
* Navigere mellom scener.  
* Se aktivt filmmateriale for hver scene.  
* Trimme klipp.  
* Splitte klipp.  
* Justere inn- og utpunkter.  
* Arbeide med overganger.  
* Justere timing.  
* Forhåndsvise hele filmen.  
* Eksportere den samlede filmen.  
Grensesnittet kan hente inspirasjon fra profesjonelle klippeprogrammer, men trenger ikke kopiere hele funksjonsbredden deres.  
## 15.2 Manus og filmtidslinje må forbli synkronisert  
Flytting av en narrativ scene i filmtidslinjen skal gjenspeiles i manus.  
Det skal likevel skilles mellom:  
* Å flytte en hel narrativ scene.  
* Å trimme et bestemt medieklipp.  
* Å endre et utsnitt fra en scene.  
* Å deaktivere narrativt innhold.  
Å trimme et klipp skal ikke automatisk slette manus.  
Hvis en redigering gjør at en manuspassasje ikke lenger dekkes av aktiv film, skal dette kunne markeres som et avvik.  
## 15.3 Aktiv filmversjon  
Hver scene skal ha et tydelig valg for hvilket produksjonsresultat som representerer scenen i den samlede filmen.  
Brukeren skal kunne velge en aktiv variant, for eksempel gjennom en handling som:  
**Bruk denne**  
**Bruk denne**  
Andre varianter skal bevares.  
  
## 16. IMPORT AV EKSISTERENDE FERDIG FILM  
Brukeren skal kunne importere film som allerede er produsert utenfor Animatic Studio.  
## 16.1 Kobling til manus  
Et importert filmklipp skal kunne knyttes til:  
* En hel manusscene.  
* En del av en manusscene.  
* Flere sammenhengende scener.  
* Et bestemt tidsintervall.  
Brukeren skal kunne angi nøyaktig hvilken del av manuset klippet dekker.  
## 16.2 Mediemetadata  
Programmet skal kunne hente relevante metadata, for eksempel:  
* Varighet.  
* Oppløsning.  
* Bildefrekvens.  
* Lydspor.  
* Andre relevante tekniske egenskaper.  
## 16.3 Delvis ferdige scener  
Hvis bare halve scenen er ferdig produsert, skal den ferdige delen kunne brukes sammen med animatic-materiale for resten.  
Den samlede filmmonteringen skal fungere også når produksjonen er ufullstendig.  
## 16.4 Status og versjonering  
Importert film skal kunne få status som:  
* Referanse.  
* Under arbeid.  
* Godkjent.  
* Aktiv filmversjon.  
Importen skal ikke ødelegge eller erstatte eksisterende kildemateriale.  
  
## 17. AUTOMATISK GENERERING AV SCENER  
En sentral brukerhandling skal være:  
**Generer scene**  
Når denne aktiveres, skal systemet samle all relevant informasjon og bygge presise genereringsinstruksjoner.  
## 17.1 Promptmotoren  
Promptmotoren skal kunne hente informasjon om:  
* Manusets handling.  
* Replikker.  
* Karakterer.  
* Karakterenes aktive utseendetilstander.  
* Godkjente karakterreferanser.  
* Objekter og rekvisitter.  
* Lokasjon.  
* Miljø.  
* Visuell stil.  
* Kamerautsnitt.  
* Kamerabevegelser.  
* Laginformasjon fra 2D-editoren.  
* Scenevarighet.  
* Tidslinje.  
* Kontinuitetskrav.  
* Relevant materiale fra forrige og neste sekvens.  
* Ønsket AI-modell.  
* Modellens tekniske krav.  
Informasjonen skal omformes til en egnet genereringsprompt for den valgte modellen.  
## 17.2 Engelske instruksjoner  
Tekniske systeminstruksjoner og genereringsprompter skal som hovedregel formuleres på engelsk.  
Dette gjelder selv om manuset og brukergrensesnittet er norske.  
Systemet må samtidig bevare den opprinnelige norske dialogen når dialogen skal brukes ordrett.  
Oversettelse av instruksjoner må ikke føre til utilsiktet omskriving av replikkene.  
## 17.3 Prompter skal være synlige og redigerbare  
Brukeren skal kunne:  
* Åpne genereringsprompten.  
* Lese den.  
* Redigere den manuelt.  
* Lagre redigert versjon.  
* Kjøre «Generer scene» på nytt med endringene.  
Systemet skal skille mellom automatisk generert innhold og manuelle overstyringer.  
Manuelle endringer skal ikke forsvinne ubemerket ved senere regenerering.  
## 17.4 Full sporbarhet  
For hver generering skal programmet bevare:  
* Systeminstruksjon.  
* Genereringsprompt.  
* Valgt modell.  
* Modellparametere.  
* Referanser.  
* Ressursversjoner.  
* Manusversjon.  
* Kostnadsinformasjon.  
* Genereringsresultat.  
* Tidspunkt og status.  
Det skal være mulig å sammenligne genereringsforsøk.  
  
## 18. AUTOMATISK OPPDELING AV LANGE SCENER  
En manusscene kan være lengre enn en videomodell tillater i ett API-kall.  
Dette skal håndteres automatisk så langt det er teknisk mulig.  
## 18.1 Usynlig produksjonsteknisk oppdeling  
Når en scene overstiger modellens begrensninger, skal systemet kunne dele genereringsarbeidet i kortere segmenter.  
Brukeren skal ikke måtte forstå API-begrensningene for å oppnå en samlet scene.  
## 18.2 Bevar kontinuitet  
Segmenteringen skal ta hensyn til:  
* Narrative hendelser.  
* Dialog.  
* Kamerabevegelser.  
* Karaktertilstander.  
* Objekter.  
* Visuell stil.  
* Referanser fra tilstøtende segmenter.  
Referansebilder eller andre støttede kontinuitetsmekanismer skal brukes når det er relevant.  
## 18.3 Automatisk sammensetting  
Etter generering skal segmentene kunne settes sammen til én scene.  
Sammensettingen skal ivareta riktig rekkefølge, timing og eventuelle overganger.  
Segmentene skal fortsatt være tilgjengelige for individuell revisjon.  
## 18.4 Narrativ scene versus API-segment  
Automatisk segmentering skal ikke:  
* Opprette nye manusscener.  
* Endre scenenummer.  
* Endre den narrative sceneidentiteten.  
Systemet skal skille klart mellom manusstruktur og teknisk genereringsstruktur.  
  
## 19. AI-MODELLER, LEVERANDØRER OG KOSTNADSKONTROLL  
Programmet skal ha en leverandøruavhengig arkitektur for integrasjon med relevante bilde-, video- og lydmodeller.  
## 19.1 Egne API-nøkler  
Brukeren skal kunne koble egne API-kontoer der leverandøren støtter det.  
Nøkler skal håndteres sikkert.  
Hemmeligheter skal ikke lagres ukryptert i klientkode eller eksponeres i prosjektfiler og logger.  
## 19.2 Modelladaptere  
Hver leverandørintegrasjon skal beskrive sine faktiske muligheter, blant annet:  
* Støttet oppgavetype.  
* Maksimal videovarighet.  
* Støttet oppløsning.  
* Referansebilder.  
* Bilde-til-video-funksjoner.  
* Tidsbegrensninger.  
* Kvalitetsparametere.  
* Tilgjengelige lydfunksjoner.  
* Kostnadsmodell.  
* Begrensninger.  
Ikke anta at alle modeller støtter de samme parameterne.  
## 19.3 Valg av innsatsnivå  
Brukeren skal kunne velge ønsket innsatsnivå per oppgave:  
**Rask / Økonomisk**  
**Rask / Økonomisk**  
Prioriterer lavere kostnad og raske skisser.  
**Balansert**  
Prioriterer en hensiktsmessig kombinasjon av kvalitet, pris og behandlingstid.  
**Høy / Premium**  
**Høy / Premium**  
Prioriterer mer omfattende generering, referansekontroll og kvalitetssikring der dette støttes.  
Disse valgene skal oversettes til konkrete funksjoner hos den valgte leverandøren.  
Programmet skal ikke love at høyere kostnad garanterer bedre resultat.  
## 19.4 Modellspesifikke kvalitetsmekanismer  
Noen AI-modeller kan støtte justerbar resonneringsinnsats.  
Andre modeller tilbyr kvalitetsvalg gjennom:  
* Oppløsning.  
* Varighet.  
* Flere kandidater.  
* Flere iterasjoner.  
* Referansestyring.  
* Kvalitetskontroll.  
* Andre parametere.  
Systemet skal vise hvilke mekanismer som faktisk er tilgjengelige.  
## 19.5 Kostnadsestimat før generering  
Før en betalt oppgave starter, skal brukeren få et tydelig estimat.  
Dette skal så langt mulig inkludere:  
* Modellvalg.  
* Antall genereringer.  
* Varighet.  
* Oppløsning.  
* Kvalitetsprofil.  
* Eventuelle ekstrarunder.  
* Samlet forventet kostnad.  
Usikre estimater skal merkes tydelig.  
## 19.6 Budsjettgrenser  
Brukeren skal kunne sette kostnadsrammer for:  
* En enkelt jobb.  
* En scene.  
* En gruppe scener.  
* En produksjon.  
* Et helt prosjekt.  
Det skal være mulig å se estimert og registrert faktisk API-forbruk.  
Ingen ekstra betalte genereringer skal utføres utenfor brukerens godkjente rammer.  
## 19.7 Flere kandidater  
Brukeren skal kunne generere flere kandidater og sammenligne dem side ved side.  
Den foretrukne varianten skal kunne aktiveres uten å slette de andre.  
## 19.8 Kvalitetskontroll  
Systemet skal kunne hjelpe brukeren å evaluere om generert materiale følger:  
* Manus.  
* Karakterreferanser.  
* Stil.  
* Kontinuitet.  
* Kamera- og sceneinstruksjoner.  
Automatiske vurderinger skal være støtte, ikke garantier.  
  
## 20. RENDERINGSKØ OG BAKGRUNNSPRODUKSJON  
Animatic Studio skal ha en robust produksjonskø.  
## 20.1 Massegenerering  
Brukeren skal kunne velge flere scener og legge dem i kø.  
Eksempel: Brukeren markerer 15 scener og starter generering før vedkommende forlater arbeidsplassen.  
## 20.2 Vedvarende jobber  
Renderingsjobber skal ikke være avhengige av at en bestemt nettleserfane forblir åpen.  
Jobbstatus må kunne lagres og hentes igjen senere.  
Langvarige oppgaver må utføres i en egnet vedvarende backend-jobbarkitektur.  
## 20.3 Jobbstatus  
Køen skal vise:  
* Venter.  
* Klargjøres.  
* Genereres.  
* Etterbehandles.  
* Fullført.  
* Mislykket.  
* Stoppet eller avbrutt.  
Vis fremdrift når dette kan beregnes pålitelig.  
## 20.4 Gjenopptakelse  
Når brukeren åpner programmet igjen, skal vedkommende kunne se:  
* Hva som er ferdig.  
* Hva som fortsatt kjører.  
* Hvilke jobber som feilet.  
* Hvilke resultater som kan gjennomgås.  
## 20.5 Feilhåndtering  
Systemet skal kunne støtte:  
* Forsøk på nytt.  
* Håndtering av API-begrensninger.  
* Feilmeldinger.  
* Køprioritering.  
* Kontroll av parallellitet.  
* Kostnadsgrenser.  
* Bevaring av allerede fullførte resultater.  
  
## 21. VERSJONERING OG SYNKRONISERINGSAVVIK  
Dette systemet skal være dypt integrert i hele applikasjonen.  
## 21.1 Endringsdeteksjon  
Når manus eller ressurser endres, skal systemet identifisere hvilke produksjonselementer som kan være påvirket.  
Eksempler:  
* Replikk endres.  
* Handling endres.  
* Rekvisitt byttes.  
* Karaktervariant endres.  
* Scene forkortes.  
* Lyd byttes.  
* Kontinuitetshendelse flyttes.  
## 21.2 Brukerens tre hovedvalg  
Når eksisterende film ikke lenger samsvarer med gjeldende manus, skal brukeren kunne velge:  
**A. Godkjenn eksisterende materiale**  
**A. Godkjenn eksisterende materiale**  
Brukeren bekrefter at avviket er akseptabelt.  
Beslutningen registreres sammen med relevante versjoner.  
**B. Oppdater eller generer på nytt**  
**B. Oppdater eller generer på nytt**  
Systemet undersøker om oppdateringen kan utføres lokalt eller krever AI.  
Eventuell kostnad vises før generering.  
Ny versjon bevares ved siden av gammel.  
**C. Angre manusendringen**  
Programmet reverserer den relevante endringen, uten å overskrive andre uavhengige redigeringer.  
## 21.3 Presis konsekvensanalyse  
Hvis bare én replikk endres, skal systemet så langt mulig flagge bare berørt lyd og filmområde.  
En endring sent i en scene skal ikke automatisk gjøre en uavhengig sekvens i begynnelsen utdatert.  
Når konsekvensene er usikre, skal dette fremgå.  
## 21.4 Synlige avvik  
Uavklarte avvik skal kunne vises i:  
* Manusrelaterte arbeidsvisninger.  
* Sceneeditor.  
* Filmtidslinje.  
* Produksjonsoversikt.  
* Eksportkontroll.  
## 21.5 Ikke-destruktiv håndtering  
Programmet skal aldri automatisk kassere eksisterende produksjonsversjoner.  
Tidligere resultater skal kunne åpnes, sammenlignes og gjenaktiveres.  
  
## 22. NARRATIV KONTINUITET OG MANUSKONTROLL  
Systemet skal kunne tilby rådgivende kontinuitetsanalyse.  
Det skal kunne oppdage mulige problemer som:  
* En karakter omtales før vedkommende introduseres.  
* Et objekt brukes før det etableres.  
* Dialog viser til en hendelse i en deaktivert scene.  
* En fysisk forandring mangler årsak.  
* Sceneorden skaper tidsmessige motsetninger.  
* En spinoff mangler informasjon som tidligere var nødvendig for forståelsen.  
Systemet skal ikke automatisk omskrive historien.  
Brukeren har alltid redaksjonell kontroll.  
  
## 23. FLERSPRÅKLIG MANUS OG PRODUKSJON  
## 23.1 Norsk som hovedmanus  
**Norsk er prosjektets primære manusspråk og redaksjonelle hovedkilde.**  
Engelsk skal kunne legges til som en tilknyttet språkversjon.  
Endringer i norsk hovedmanus skal kunne varsle om at engelsk oversettelse må gjennomgås.  
Endringer i engelsk oversettelse skal ikke automatisk endre norsk hovedmanus.  
## 23.2 Import av engelsk manus  
Brukeren skal kunne importere et allerede oversatt engelsk manus.  
Systemet skal forsøke å koble engelske scener, replikker og handlinger til eksisterende norske sceneidentiteter.  
Dette skal skje ved analyse av:  
* Scenestruktur.  
* Karakterer.  
* Handling.  
* Narrativ kontekst.  
* Eventuelle scenenumre.  
Ikke baser koblingen utelukkende på identiske scenenumre eller ordrett tekst.  
Usikre koblinger må kunne godkjennes manuelt.  
## 23.3 Én film med flere språkversjoner  
Norsk og engelsk film skal som hovedregel kunne bruke:  
* Samme sceneidentiteter.  
* Samme visuelle komposisjoner.  
* Samme kamerabevegelser.  
* Samme miljøer.  
* Samme objekter.  
* Samme genererte filmklipp når de er egnede.  
Språkavhengige ressurser skal kunne byttes separat.  
## 23.4 Separate dialogspor  
Hver replikk skal kunne ha flere språkspesifikke lydfiler.  
Eksempel:  
Replikk-ID: dlg_294  
Norsk: «Hvor er Ola?»  
Engelsk: «Where is Ola?»  
Begge tekstene og lydfilene skal tilhøre samme underliggende narrative replikk.  
## 23.5 Gjenbruk av øvrig lyd  
Musikk, atmosfære og lydeffekter skal i utgangspunktet kunne gjenbrukes mellom språkversjonene.  
Programmet må kunne håndtere at importert ferdig film kan ha dialog og øvrig lyd blandet sammen.  
Det skal ikke loves perfekt utskifting av dialog dersom separate lydspor ikke finnes.  
## 23.6 Forskjellig replikkvarighet  
Engelske replikker kan være lengre eller kortere enn norske.  
Systemet skal kunne identifisere timingkonflikter og foreslå justeringer.  
Språkspesifikke timingendringer skal ikke automatisk endre hovedfilmens originale timing.  
## 23.7 Leppesynkronisering  
Systemet skal skille mellom:  
* Stillbilder.  
* Enkle 2D-animatics.  
* Redigerbare 2D-karakterer.  
* AI-generert video.  
* Ferdig importert film.  
For enkle animatics kan dialog ofte byttes direkte.  
For synlige munnbevegelser kan ny leppesynkronisering eller målrettet oppdatering være nødvendig.  
Programmet skal vurdere dette og ikke automatisk regenerere hele scenen.  
## 23.8 Språkspesifikk eksport  
Brukeren skal kunne eksportere:  
* Norsk film.  
* Engelsk film.  
* Norsk manus.  
* Engelsk manus.  
* Separate dialogspor.  
* Undertekstfiler.  
Grensesnittspråk, manusspråk, dialogspråk og undertekstspråk skal kunne velges uavhengig.  
  
## 24. AVLEDEDE PRODUKSJONER, SPINOFFS OG KORTFILMER  
Animatic Studio skal støtte flere selvstendige produksjoner innenfor samme overordnede prosjekt.  
En avledet produksjon kan være:  
* Kortfilm.  
* Spinoff.  
* Trailer.  
* Teaser.  
* Pitchfilm.  
* Pilotsekvens.  
* Alternativ fortelling.  
* Annen avgrenset filmversjon.  
## 24.1 Oppretting  
Brukeren skal kunne opprette en avledet produksjon ved å velge ut scener fra hovedfilmen.  
Den nye produksjonen skal kunne få:  
* Eget navn.  
* Egen sceneorden.  
* Eget manus.  
* Egen filmtidslinje.  
* Egen varighetsberegning.  
* Egne aktive filmversjoner.  
* Egne eksportfiler.  
## 24.2 Uavhengig struktur  
En scene skal kunne flyttes eller skjules i en spinoff uten at den flyttes eller skjules i hovedfilmen.  
Spinoffens manus og filmtidslinje skal likevel være fullt synkronisert med hverandre.  
Hver produksjon har dermed sin egen aktive scene- og monteringsstruktur.  
## 24.3 Gjenbruk  
Spinoffen skal kunne gjenbruke:  
* Manusscener.  
* Ferdige filmklipp.  
* AI-genererte scener.  
* 2D-animatics.  
* Karakterer.  
* Objekter.  
* Lokasjoner.  
* Lyd.  
* Stilprofiler.  
Gjenbruk skal i utgangspunktet være basert på referanser til versjonert kildemateriale, slik at unødvendig duplisering unngås.  
## 24.4 Nye scener som bare tilhører spinoffen  
Brukeren skal kunne skrive og produsere helt nye scener som bare finnes i spinoffen.  
Disse skal få egne permanente sceneidentiteter.  
De skal ikke automatisk legges til hovedmanuset.  
De skal kunne bruke globale ressurser og få egne animatics, lydfiler og genererte filmklipp.  
## 24.5 Lokale scenevarianter  
Hvis en gjenbrukt scene endres i spinoffen, skal endringen som standard lagres som en produksjonsspesifikk variant.  
Hovedfilmens scene skal ikke endres.  
Eksempel:  
Spinoffen bruker en scene fra hovedfilmen, men forkorter dialogen og velger et annet kamerautsnitt.  
Den nye varianten tilhører spinoffen inntil brukeren eventuelt velger å dele endringene.  
## 24.6 Utdrag fra eksisterende film  
Brukeren skal kunne bruke bare deler av et ferdig filmklipp.  
En scene på 90 sekunder i hovedfilmen kan eksempelvis bidra med 20 sekunder i en trailer.  
Dette skal ikke påvirke originalfilen.  
## 24.7 Kontinuitetsanalyse  
Systemet skal kunne varsle når en spinoff kombinerer scener på en måte som skaper mulige narrative problemer.  
Brukeren skal kunne opprette nye sammenbindende scener og overganger.  
## 24.8 Egne språkversjoner  
Spinoffer skal kunne ha egne norske og engelske manus og lydspor.  
Eksisterende oversettelser skal gjenbrukes der det passer.  
  
## 25. TILBAKEFØRING FRA SPINOFF TIL HOVEDFILM  
En forbedret scenevariant som er utviklet i en spinoff skal kunne foreslås overført til hovedfilmen.  
Dette skal aldri skje automatisk.  
## 25.1 Sammenligning  
Systemet skal vise:  
* Originalscene.  
* Spinoff-variant.  
* Endringer i manus.  
* Endringer i lyd.  
* Endringer i kamera.  
* Endringer i timing.  
* Endringer i visuelt materiale.  
## 25.2 Brukervalg  
Brukeren skal kunne velge å:  
* Beholde alt uendret.  
* Tilbakeføre bare manusendringer.  
* Tilbakeføre bestemte visuelle endringer.  
* Tilbakeføre lyd eller timing.  
* Opprette en ny hovedfilmvariant fra spinoff-versjonen.  
* Overføre en helt ny spinoff-scene til hovedfilmen.  
Ingen tilbakeføring skal overskrive eksisterende godkjent materiale uten en eksplisitt beslutning.  
Alle relasjoner og historiske versjoner skal bevares.  
  
## 26. PROSJEKTPLAKATER OG PRESENTASJONSMATERIELL  
Animatic Studio skal kunne produsere profesjonelle visuelle presentasjoner av et filmprosjekt.  
Dette skal være en egen eksportfunksjon.  
## 26.1 Plakatformat  
Programmet skal støtte minst:  
**70 × 100 cm, stående format.**  
**70 × 100 cm, stående format.**  
Eksporten skal kunne tilpasses profesjonell trykkproduksjon og digital distribusjon.  
Støtt relevante innstillinger for:  
* Oppløsning.  
* Filformat.  
* Utfallende trykk.  
* Fargehåndtering.  
* Trykkegnet tekst og grafikk.  
## 26.2 To hovedtyper plakat  
## A. Kinopitch-plakat  
En elegant, filmatisk og selgende plakat som fremhever:  
* Filmens tittel.  
* Hovedkarakterer.  
* Stemning.  
* Visuelt univers.  
* Relevante miljøer.  
* Symbolske objekter.  
* Valgfri logline.  
Den skal ha et sterkt visuelt hierarki og profesjonell komposisjon.  
## B. Karakter- og universkart  
En mer informativ plakat som viser:  
* Karakterportretter.  
* Karakternavn.  
* Beskrivelser.  
* Relasjoner.  
* Sentrale objekter.  
* Viktige steder.  
* Eventuelle andre sentrale historieelementer.  
Dette skal være en tydelig, visuelt attraktiv prosjektoversikt.  
## 26.3 Valgfritt informasjonsnivå  
Brukeren skal kunne velge innhold gjennom avkrysningsvalg.  
Valgene skal omfatte:  
* Bare bilder og navn.  
* Korte karakterbeskrivelser.  
* Utfyllende karakterbeskrivelser.  
* Relasjonslinjer.  
* Navngitte relasjoner.  
* Forklarende relasjonstekster.  
* Objektbilder.  
* Objektbeskrivelser.  
* Stedsbilder.  
* Stedsbeskrivelser.  
* Logline.  
* Sjanger og stemning.  
* Andre relevante prosjektdata.  
Systemet skal justere layouten til informasjonsmengden.  
Hvis innholdet blir for omfattende, skal programmet varsle om redusert lesbarhet eller foreslå en annen komposisjon.  
## 26.4 Relasjonskart  
Karakterrelasjoner skal kunne fremstilles visuelt.  
Programmet skal støtte forbindelser som:  
* Familie.  
* Vennskap.  
* Konflikt.  
* Omsorg.  
* Romantikk.  
* Mentorforhold.  
* Skjulte forbindelser.  
* Andre brukerdefinerte relasjoner.  
Systemet kan foreslå relasjoner basert på manus, men skal ikke presentere usikre antakelser som fakta.  
Brukeren skal kunne godkjenne og redigere relasjonene.  
## 26.5 Automatisk førsteutkast  
Programmet skal kunne analysere prosjektet og foreslå:  
* Hvilke karakterer som bør fremheves.  
* Hvilke miljøer som er viktigst.  
* Hvilke objekter som er sentrale.  
* Hvilke relasjoner som bør vises.  
* Hvilken komposisjon som passer.  
* Hvilken visuell stil som bør brukes.  
## 26.6 Redigerbar plakat  
Etter generering skal brukeren kunne justere:  
* Bilder.  
* Tekst.  
* Typografi.  
* Farger.  
* Plassering.  
* Skalering.  
* Relasjonslinjer.  
* Synlighet.  
* Komposisjon.  
Tekst og grafiske elementer skal så langt mulig være separate redigerbare elementer.  
AI-genererte bakgrunnsbilder skal ikke være den eneste lagringsformen for plakaten.  
## 26.7 Stilharmonisering  
Plakatmodulen skal kunne harmonisere karakterbilder til samme tegnestil, lyssetting og fargepalett.  
Brukeren skal kunne velge ønsket kvalitetsnivå og modell.  
Vellykkede harmoniserte bilder skal kunne publiseres til det globale ressursbiblioteket som nye godkjente stilvarianter.  
## 26.8 Flere plakater  
Brukeren skal kunne lage og lagre flere plakatvarianter.  
Dette skal gjelde både hovedfilm og spinoffer.  
Plakater skal kunne eksporteres på norsk og engelsk.  
  
## 27. PLANKONTROLL OG PRODUKSJONSOVERSIKTER  
Animatic Studio skal gi brukeren kontinuerlig oversikt over prosjektets tilstand.  
## 27.1 Hovedoversikt  
Vis blant annet:  
* Produksjoner i prosjektet.  
* Antall scener.  
* Total estimert spilletid.  
* Bekreftet spilletid.  
* Antall ferdige scener.  
* Scener under arbeid.  
* Scener som mangler produksjon.  
* Renderingsjobber.  
* Synkroniseringsavvik.  
* API-kostnader.  
## 27.2 Filtrering  
Brukeren skal kunne filtrere oversikten etter:  
* Produksjon.  
* Scene.  
* Karakter.  
* Objekt.  
* Status.  
* Ressursendring.  
* Språk.  
* Uavklarte avvik.  
## 27.3 Langvarige prosjekter  
Prosjektet skal bevare arbeidet over tid.  
Brukeren skal kunne forlate programmet og fortsette senere uten tap av:  
* Sceneoppbygging.  
* Historikk.  
* Genereringsprompter.  
* Ressurser.  
* Lyd.  
* Jobbstatus.  
* Eksportinnstillinger.  
* Produksjonsversjoner.  
  
## 28. PROSJEKTLAGRING, SIKKERHET OG DATAEIERSKAP  
Brukeren skal ha kontroll over prosjektdataene.  
## 28.1 Vedvarende lagring  
Prosjektinformasjon skal bevares til brukeren selv velger å endre eller slette den, innenfor tjenestens faktiske lagringsvilkår.  
Ikke bygg kritisk produksjonsdata utelukkende på midlertidig nettlesertilstand.  
## 28.2 Portabilitet  
Prosjektet skal kunne eksporteres eller sikkerhetskopieres i et dokumentert, portabelt format.  
Sikkerhetskopien skal så langt praktisk mulig omfatte:  
* Strukturert prosjektdata.  
* Manusversjoner.  
* Ressursreferanser.  
* Redigerbare scener.  
* Promptversjoner.  
* Kontinuitetsdata.  
* Produksjonshistorikk.  
* Relevante mediefiler eller en tydelig oversikt over eksterne avhengigheter.  
## 28.3 Sikker API-håndtering  
API-nøkler og andre hemmeligheter skal håndteres sikkert.  
Loggføring må ikke avsløre sensitive tilgangsopplysninger.  
## 28.4 Lagringsstruktur  
Systemet må skille mellom:  
* Redigerbare prosjektdata.  
* Kildemedier.  
* Genererte mediefiler.  
* Midlertidige renderingsfiler.  
* Eksportfiler.  
* Historiske versjoner.  
Dette er nødvendig for pålitelig lagring, backup og senere migrering.  
  
## 29. EKSPORTSYSTEM  
Eksport skal være en selvstendig modul som ikke krever nye AI-genereringer for å bruke eksisterende materiale.  
## 29.1 Filmeksport  
Brukeren skal kunne eksportere:  
* Én scene.  
* Valgte scener.  
* En del av filmen.  
* Hele hovedfilmen.  
* En spinoff.  
* En trailer eller pitchfilm.  
## 29.2 Hybrid eksport  
Eksportmotoren skal kunne kombinere:  
* Lokal 2D-animasjon.  
* AI-generert film.  
* Importert ferdig film.  
* Stillbilder.  
* Dialog.  
* Musikk.  
* Lydeffekter.  
## 29.3 Manuseksport  
Eksporter korrekt formatert manus med nummereringsmetode valgt ved hver eksport.  
## 29.4 Språkeksport  
Eksporter film og manus på valgte språk.  
## 29.5 Plakateksport  
Eksporter kinopitch-plakater og karakterkart i relevante trykk- og digitalformater.  
## 29.6 Eksportkontroll  
Før eksport skal programmet kontrollere:  
* Aktiv sceneorden.  
* Skjulte scener.  
* Aktivt filmmateriale.  
* Manglende mediefiler.  
* Uavklarte manusavvik.  
* Relevante språkspor.  
* Total varighet.  
* Teknisk kompatibilitet.  
Brukeren skal kunne velge å eksportere selv om enkelte avvik er uavklarte, etter et tydelig varsel.  
  
## 30. DESIGN OG BRUKEROPPLEVELSE  
Animatic Studio skal ha en helhetlig profesjonell visuell identitet.  
## 30.1 Overordnet uttrykk  
Foretrekk:  
* Mørk eller dempet filmatisk arbeidsflate.  
* God kontrast.  
* Tydelig typografisk hierarki.  
* Diskré og konsekvent fargebruk.  
* Velorganiserte paneler.  
* Profesjonelle tidslinjer.  
* Tydelig statusinformasjon.  
* Rolige og presise interaksjoner.  
Unngå et visuelt uttrykk som minner om et leketøy eller en tilfeldig AI-demo.  
## 30.2 Foreslåtte hovedområder  
Applikasjonen bør ha logisk tilgang til:  
1. Prosjektoversikt.  
2. Produksjonsvelger.  
3. Manus.  
4. Ressursbibliotek.  
5. Karakterkontinuitet.  
6. Sceneeditor.  
7. Kamera og tidslinje.  
8. Lyd og dialog.  
9. AI-generering.  
10. Renderingskø.  
11. Overordnet filmmontering.  
12. Plakater og presentasjoner.  
13. Eksport.  
14. Prosjektinnstillinger.  
Dette er funksjonelle moduler, ikke nødvendigvis én separat navigasjonsfane for hver funksjon.  
Du skal foreslå en gjennomarbeidet informasjonsarkitektur som reduserer kompleksiteten for brukeren.  
## 30.3 Norske betegnelser  
Brukergrensesnittet skal kunne bruke norske funksjonsnavn som:  
* Generer scene.  
* Bruk denne.  
* Ressursbibliotek.  
* Manus.  
* Sceneeditor.  
* Filmtidslinje.  
* Produksjonsoversikt.  
* Eksporter.  
* Spinoff.  
* Godkjenn eksisterende film.  
* Oppdater scene.  
* Angre endring.  
Engelske tekniske betegnelser kan brukes internt der det er hensiktsmessig.  
  
## 31. FORESLÅTT TEKNISK MODULINNDELING  
Utviklingen skal bygge på en tydelig separasjon mellom domener.  
Foreslå og videreutvikle en arkitektur med minst følgende logiske komponenter:  
**Project Core**  
**Project Core**  
Prosjekter, produksjoner, identiteter og relasjoner.  
**Screenplay Engine**  
**Screenplay Engine**  
Import, parsing, strukturert manus, formatering, paginering, versjonering og eksport.  
**Timeline & Assembly Engine**  
Sceneforekomster, filmrekkefølge, tidskoder, klipp og sammenstilling.  
**Resource Library**  
**Resource Library**  
Karakterer, objekter, miljøer, mediefiler og stilprofiler.  
**Continuity Engine**  
**Continuity Engine**  
Narrativ kronologi, karaktertilstander, utseendeendringer og konsekvensanalyse.  
**2D Composition Engine**  
Lag, transformasjoner, keyframes, multiplan-effekter og lokal avspilling.  
**Camera & Motion Engine**  
Kamerautsnitt, baner, Bézier-kontroller og easing.  
**Audio Engine**  
**Audio Engine**  
Dialog, språkspor, musikk, lydeffekter og synkronisering.  
**Prompt Orchestration Engine**  
**Prompt Orchestration Engine**  
Automatisk sammensetting av engelskspråklige, modellspesifikke genereringsinstruksjoner.  
**Provider Adapters**  
**Provider Adapters**  
Integrasjoner med ulike AI-leverandører.  
**Quality & Cost Engine**  
Modellvalg, kvalitetsprofiler, budsjettgrenser og kostnadsestimering.  
**Render Queue**  
Vedvarende genereringsjobber, status og feilhåndtering.  
**Version & Dependency Engine**  
Versjonering, avviksdeteksjon, endringsanalyse og ikke-destruktive oppdateringer.  
**Localization Engine**  
**Localization Engine**  
Flerspråklig manus, dialog, undertekster og produksjonsvarianter.  
**Presentation Engine**  
Plakater, karakterkart og annet presentasjonsmateriell.  
**Export Engine**  
**Export Engine**  
Film, manus, lyd, plakater og prosjektbackup.  
**Security & Storage**  
**Security & Storage**  
Tilgangskontroll, API-nøkler, medielagring og dataintegritet.  
Disse modulene kan implementeres på ulike måter, men deres ansvarsområder bør være tydelig skilt.  
  
## 32. PRIORITERT UTVIKLINGSREKKEFØLGE  
Dette er en omfattende produktvisjon, og funksjonene skal ikke nødvendigvis implementeres samtidig.  
Du skal hjelpe meg å dele utviklingen i realistiske, teknisk sammenhengende faser.  
## Fase 1: Arkitektur og datamodell  
Definer:  
* Prosjekt.  
* Produksjon.  
* Scene.  
* Manusblokk.  
* Sceneforekomst.  
* Scenevariant.  
* Ressurs.  
* Medieklipp.  
* Filmmontering.  
* Versjoner.  
* Identitetsrelasjoner.  
Sørg for at fundamentet støtter videreutvikling uten omfattende omskriving.  
## Fase 2: Manus og prosjektoversikt  
Implementer:  
* Manusimport.  
* Scenedeteksjon.  
* Originaltro manusvisning.  
* Redigering.  
* Sceneidentiteter.  
* En enkel produksjonsoversikt.  
* Varighetsestimering.  
* Grunnleggende manuseksport.  
## Fase 3: Ressursbibliotek og 2D-sceneeditor  
Implementer:  
* Karakterer.  
* Objekter.  
* Miljøer.  
* Lagbasert komposisjon.  
* Kamera.  
* Keyframes.  
* Enkel lokal animatic-avspilling.  
## Fase 4: Tidslinje, lyd og filmmontering  
Implementer:  
* Toveis manussynkronisering.  
* Dialogkoblinger.  
* Lydspor.  
* Overordnet filmtidslinje.  
* Enkel hybrid avspilling og eksport.  
## Fase 5: Genereringsmotor og AI-integrasjoner  
Implementer:  
* Modelladaptere.  
* Promptmotor.  
* Synlige og redigerbare prompter.  
* Kostnadsestimering.  
* Genereringsversjoner.  
* Automatisk segmentering.  
* Renderingskø.  
## Fase 6: Avansert produksjonskontroll  
Implementer:  
* Avviksdeteksjon.  
* Kontinuitetsanalyse.  
* Karaktertilstander.  
* Ressursavhengigheter.  
* Sammenligning av versjoner.  
* Sikker oppdatering og regenerering.  
## Fase 7: Flerspråklighet og avledede produksjoner  
Implementer:  
* Engelsk manus.  
* Språkkoblinger.  
* Alternative lydspor.  
* Spinoffer.  
* Lokale scenevarianter.  
* Tilbakeføring av forbedringer.  
## Fase 8: Presentasjonsmodul og videre kvalitetssystem  
Implementer:  
* Pitchplakater.  
* Karakterkart.  
* Stilharmonisering.  
* Global publisering av stilvarianter.  
* Avanserte kvalitetsprofiler.  
* Utvidede eksporter.  
Fasene er et utgangspunkt. Du skal vurdere tekniske avhengigheter og anbefale justeringer når det er nødvendig.  
Det er viktigere å bygge riktig grunnarkitektur enn å implementere mange isolerte funksjoner raskt.  
  
## 33. HVORDAN DU SKAL ARBEIDE MED MEG I CLAUDE  
Du skal opptre som en aktiv, selvstendig og kritisk utviklingspartner.  
## 33.1 Forstå helheten  
Før du foreslår nye funksjoner eller skriver kode, skal du vurdere hvordan løsningen påvirker:  
* Felles datamodell.  
* Manus- og filmsynkronisering.  
* Permanente identiteter.  
* Versjonering.  
* Spinoffer.  
* Kontinuitet.  
* Språkversjoner.  
* Kostnader.  
* Portabilitet.  
Ikke implementer lokale løsninger som bryter med de overordnede prinsippene.  
## 33.2 Arbeid strukturert  
Når vi begynner et nytt utviklingsområde, skal du normalt hjelpe meg med å definere:  
1. Målet.  
2. Brukerens arbeidsflyt.  
3. Nødvendige dataobjekter.  
4. Relasjoner og avhengigheter.  
5. Grensesnittet.  
6. Teknisk implementering.  
7. Feilsituasjoner.  
8. Testbare akseptansekriterier.  
9. Hvordan funksjonen passer inn i Lovable.  
10. Eventuelle begrensninger eller fremtidige migreringsbehov.  
## 33.3 Lag presise Lovable-instruksjoner  
Når jeg ber om hjelp til utvikling i Lovable, skal du kunne utforme presise, komplette og praktisk gjennomførbare instruksjoner som kan kopieres inn i Lovable.  
Disse instruksjonene skal beskrive:  
* Hvilke komponenter som skal opprettes.  
* Hvordan de skal fungere.  
* Hvilke data de skal lese og skrive.  
* Hvilke tilstander som skal håndteres.  
* Hvordan brukerinteraksjonene skal fungere.  
* Hvordan løsningen passer inn i eksisterende arkitektur.  
Ikke foreslå å bygge hele applikasjonen i ett eneste stort utviklingssteg.  
## 33.4 Vær ærlig om tekniske begrensninger  
Du skal ikke hevde at en modell, API-tjeneste eller Lovable har funksjonalitet du ikke har verifisert.  
Når tekniske muligheter er usikre, skal du:  
* Beskrive usikkerheten.  
* Foreslå en egnet arkitektonisk løsning.  
* Skille mellom MVP og fremtidig funksjonalitet.  
* Unngå avhengighet av udokumenterte egenskaper.  
## 33.5 Ikke fjern krav uten å si fra  
Dette prosjektmandatet representerer samlede produktbeslutninger.  
Hvis du mener at et krav bør forenkles, utsettes eller gjennomføres annerledes, skal du forklare hvorfor.  
Du skal ikke stille bort viktige krav i stillhet.  
## 33.6 Arbeid iterativt  
Vi skal utvikle applikasjonen steg for steg.  
Ved større arkitekturbeslutninger skal du bidra med tydelige anbefalinger og konsekvensvurderinger.  
Målet er ikke bare at en enkelt funksjon virker, men at hele systemet forblir konsistent etter hvert som nye funksjoner legges til.  
  
## 34. UFRAVIKELIGE PRODUKTPRINSIPPER – OPPSUMMERING  
Følgende regler skal alltid gjelde:  
**1. Produktet heter Animatic Studio.**  
Ikke AI Animatic Studio.  
**2. Manus og film skal alltid være strukturelt synkronisert.**  
**2. Manus og film skal alltid være strukturelt synkronisert.**  
De skal bygge på samme prosjektmodell.  
**3. Scenenummer skal aldri brukes som permanent identitet.**  
Alle scener og ressurser skal ha stabile interne identifikatorer.  
**4. Eksportnummerering bestemmes av brukeren hver gang.**  
**4. Eksportnummerering bestemmes av brukeren hver gang.**  
Eksport skal ikke endre interne identiteter.  
**5. Norsk er hovedmanus.**  
**5. Norsk er hovedmanus.**  
Engelsk er en tilknyttet språkversjon.  
**6. En scene kan ha mange produksjonsversjoner.**  
**6. En scene kan ha mange produksjonsversjoner.**  
Tidligere versjoner skal bevares.  
**7. Manusendringer skal flagge berørt materiale.**  
**7. Manusendringer skal flagge berørt materiale.**  
De skal ikke automatisk overskrive eksisterende film.  
**8. Brukeren skal kunne godkjenne avvik, oppdatere materiale eller angre endringen.**  
**8. Brukeren skal kunne godkjenne avvik, oppdatere materiale eller angre endringen.**  
**9. Animatics skal kunne spilles av og eksporteres uten generativ AI.**  
**9. Animatics skal kunne spilles av og eksporteres uten generativ AI.**  
**10. 2D-editoren skal være lagbasert og inspirert av tradisjonell multiplan-animasjon.**  
**10. 2D-editoren skal være lagbasert og inspirert av tradisjonell multiplan-animasjon.**  
**11. AI-generering skal være modellagnostisk og basert på presise, synlige og redigerbare prompter.**  
**12. AI-systeminstruksjoner og genereringsprompter skal som hovedregel være på engelsk.**  
**13. Brukeren skal kontrollere kvalitetsnivå, modellvalg og kostnader.**  
**14. Lange scener skal kunne deles produksjonsteknisk uten å endre manusstrukturen.**  
**15. Ferdig film skal kunne importeres og knyttes til bestemte manuspassasjer.**  
**15. Ferdig film skal kunne importeres og knyttes til bestemte manuspassasjer.**  
**16. Filmens estimerte og faktiske spilletid skal beregnes kontinuerlig.**  
**16. Filmens estimerte og faktiske spilletid skal beregnes kontinuerlig.**  
**17. Varighetsinformasjon skal primært vises på en egen oversiktsside, ikke inne i manuslayouten.**  
**18. Karakterer skal kunne ha tidsstyrte utseendeendringer.**  
**18. Karakterer skal kunne ha tidsstyrte utseendeendringer.**  
Dette inkluderer blant annet at Maja klipper håret midt i filmen.  
**19. Ved en utseendeendring midt i en scene skal systemet kunne foreslå separate produksjonssegmenter.**  
Det skal ikke endre sceneidentiteten eller scenenummeret.  
**20. Hovedfilm og spinoffer skal kunne dele ressurser, men ha uavhengig manus og filmmontering.**  
**20. Hovedfilm og spinoffer skal kunne dele ressurser, men ha uavhengig manus og filmmontering.**  
**21. Spinoffer skal kunne inneholde egne nye scener.**  
**21. Spinoffer skal kunne inneholde egne nye scener.**  
Disse skal ikke automatisk legges til hovedfilmen.  
**22. Forbedringer fra spinoffer skal kunne foreslås tilbakeført til hovedfilmen.**  
Brukeren må godkjenne overføringen.  
**23. Plakater og karakterkart skal være selvstendige, redigerbare eksportprodukter.**  
**23. Plakater og karakterkart skal være selvstendige, redigerbare eksportprodukter.**  
**24. Plakater skal støtte 70 × 100 cm og flere informasjonsnivåer.**  
**24. Plakater skal støtte 70 × 100 cm og flere informasjonsnivåer.**  
**25. Harmoniserte karakterbilder skal kunne publiseres til globalt ressursbibliotek etter godkjenning.**  
**25. Harmoniserte karakterbilder skal kunne publiseres til globalt ressursbibliotek etter godkjenning.**  
**26. Renderingsjobber og prosjektstatus skal bevares mellom arbeidsøkter.**  
**26. Renderingsjobber og prosjektstatus skal bevares mellom arbeidsøkter.**  
**27. Eksisterende produksjonsmateriale skal aldri endres destruktivt uten brukerens eksplisitte beslutning.**  
**27. Eksisterende produksjonsmateriale skal aldri endres destruktivt uten brukerens eksplisitte beslutning.**  
**28. Arkitekturen skal kunne videreutvikles fra Lovable til macOS- og Windows-applikasjoner.**  
  
## 35. FØRSTE OPPGAVE NÅR DU MOTTAR DETTE PROSJEKTMANDATET  
Du skal ikke forsøke å implementere hele Animatic Studio umiddelbart.  
Begynn med å behandle dette dokumentet som prosjektets samlede produktspesifikasjon.  
Deretter skal du:  
1. Identifisere de viktigste arkitektoniske avhengighetene mellom modulene.  
2. Foreslå en robust intern datamodell som støtter både manus, sceneidentiteter, produksjoner, spinoffer, medieklipp og versjonering.  
3. Foreslå en realistisk teknisk arkitektur for første versjon i Lovable.  
4. Skille tydelig mellom funksjoner som bør implementeres i nettleseren, i en backend og eventuelt i egne medie- eller renderingtjenester.  
5. Anbefale en konkret, prioritert MVP som gir et fungerende grunnprodukt uten å blokkere de mer avanserte funksjonene senere.  
6. Definere en utviklingsplan med tydelige milepæler og testbare akseptansekriterier.  
7. Peke på tekniske risikoer, særlig knyttet til manusformatering, mediebehandling, tidslinjesynkronisering, AI-integrasjoner og datakonsistens.  
8. Foreslå den første presise utviklingsinstruksjonen vi bør gi Lovable.  
Ikke reduser produktvisjonen til en enkel AI-videogenerator.  
Animatic Studio skal bygges som en sammenhengende, profesjonell filmproduksjonsapplikasjon, der manus, visuelt materiale, lyd, produksjonsvarianter og endelig film alltid kan spores tilbake til den samme gjennomarbeidede prosjektstrukturen.  
**Det overordnede målet er å gi filmskaperen full kreativ kontroll fra manus til ferdig film, samtidig som programmet automatiserer det tekniske arbeidet som ellers gjør produksjonen tungvint, kostbar og vanskelig å holde oversikt over.**  
**Det overordnede målet er å gi filmskaperen full kreativ kontroll fra manus til ferdig film, samtidig som programmet automatiserer det tekniske arbeidet som ellers gjør produksjonen tungvint, kostbar og vanskelig å holde oversikt over.**  
