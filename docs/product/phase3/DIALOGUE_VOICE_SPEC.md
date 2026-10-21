> Komprimert gjengivelse. Originalen (§1–§147, uendret) ligger i Claude-prosjektet som PHASE3_DIALOGUE_VOICE_SPEC.md.

# ANIMATIC STUDIO – KOMPLETT MASTERSPESIFIKASJON
## MANUSSTYRT DIALOG, KARAKTERSTEMMER, LYDPRODUKSJON, MANUSSYNKRONISERING OG PRODUKSJONSMERKNADER
Arbeidstittel: Script-Driven Dialogue & Voice Studio. Produkt: Animatic Studio. Dokumentstatus: Konsolidert og selvstendig kravspesifikasjon. Omfang: Hele funksjonsgruppen diskutert etter avslutningen av Character Animation Studio. Mottatt 19.10.2026 fra Øystein.

## 1. VIKTIG INSTRUKSJON
Dette dokumentet inneholder alle kravene til den nye funksjonsgruppen for manusstyrt dialog, lydopptak, AI-stemmer, lydversjoner, manus-/lydavvik, bokmerker og produksjonsmerknader. Bruk dette som én samlet masterspesifikasjon. Brukeren har ikke overlevert tidligere delprompter om denne funksjonsgruppen. Derfor må samtlige krav i dokumentet vurderes og integreres. Dette er en selvstendig modul i det eksisterende Animatic Studio-prosjektet. Ikke inkluder eller gjenimplementer tidligere funksjonsgrupper for karakteranimasjon, oransje rytmeverktøy, blinking, bildeoverlegg, Motion Typography Studio eller Story Lab. Koble til eksisterende moduler gjennom deres etablerte data og grensesnitt når det er nødvendig. Før implementasjon skal du kartlegge faktisk eksisterende kode, komponenter, datamodell og tilgjengelige integrasjoner. Spesifikasjonen beskriver ønsket oppførsel. Den hevder ikke at alle tekniske forutsetninger allerede er implementert.

## 2. HOVEDMÅL
Brukeren skal kunne arbeide direkte fra manuset og bevege seg sømløst mellom tekst, scene, dialogopptak, AI-generert tale og lydredigering. Samtidig skal Animatic Studio holde oversikt over: hvem som snakker; hvilken replikk det gjelder; hvor replikken ligger i scenen; hvilke lydversjoner som finnes; hvilken lydversjon som er aktiv; hvilken stemme karakteren normalt bruker; om lyden fortsatt samsvarer med manuset; hvilke dialoger som mangler lyd; hvilke steder brukeren eller andre prosjektmedarbeidere vil undersøke senere; hvor brukeren selv vil fortsette arbeidet. Dette skal gjennomføres uten å miste tidligere opptak, lydredigeringer, stemmeinnstillinger eller produksjonsmerknader.

## DEL A – MANUSET SOM AKTIV NAVIGASJONSFLATE
3. KLIKK DIREKTE I MANUSET. Når manuset vises i sceneeditoren, skal brukeren kunne klikke på et sted i teksten. Animatic Studio skal forsøke å finne det tilsvarende tidspunktet i scenen. Når tidspunktet identifiseres, skal: 1) avspillingshodet flyttes til riktig posisjon; 2) hovedvisningen av scenen oppdateres; 3) riktig sceneinnhold vises for dette tidspunktet; 4) den aktuelle manuspassasjen kunne markeres som valgt. Målet er at manuset skal fungere som en direkte navigasjonsflate for animaticen. Brukeren skal slippe å lete manuelt i tidslinjen.
4. BRUK EKSISTERENDE TIDSKOBLINGER. Manusnavigasjon skal bruke tilgjengelige relasjoner mellom manusprosjekt, scene, manusblokk, replikk, karakter, dialogforekomst, lydsegment, tidslinjeposisjon og eventuell ordnivå-synkronisering. Hvis replikken er presist tidsplassert, skal det faktiske tidspunktet brukes. Hvis ordnivå-synkronisering finnes, skal systemet kunne bruke posisjonen til ordet brukeren klikker på. Hvis bare starten av replikken er kjent, skal systemet navigere dit. Hvis teksten er en handlingsbeskrivelse, skal nærmeste relevante sceneanker brukes.
5. HÅNDTER MANGLENDE TIMING. Hvis programmet ikke vet hvor en passasje ligger i tidslinjen, skal det: bruke en eksisterende relevant kobling dersom en slik finnes; vise at tidspunktet er estimert eller mangler; unngå å presentere usikker plassering som eksakt; aldri velge en tilfeldig replikk eller tidsposisjon i stillhet. Brukeren skal fortsatt kunne lese manuset normalt.
6. DOBBELTKLIKK PÅ DIALOG. Når brukeren dobbeltklikker på en manusreplikk, skal dialogeditoren åpnes direkte for den aktuelle replikken. Editoren skal vite hvilken scene, karakter og replikk det gjelder, hvilke lydversjoner som finnes, hvilken som er aktiv, og hvor replikken ligger i tidslinjen. Brukeren skal ikke måtte velge replikken på nytt. Et dobbeltklikk skal ikke føre til at feil replikk åpnes.
7. KONSEKVENT INTERAKSJON. Enkeltklikk: naviger til riktig tidspunkt i scenen. Dobbeltklikk på en replikk: åpne dialogeditoren for denne replikken. Disse interaksjonene må fungere sammen uten uønsket dobbeltutførelse eller merkbar feilnavigasjon.

## DEL B – FORBEDRET DIALOGEDITOR
8. VIDEREUTVIKLE EKSISTERENDE DIALOGFUNKSJONER. Det finnes allerede en lydprofil og lydopptaksfunksjon. Eksisterende lydprofil: bølgeform, avspilling, justerbar avspillingshastighet, start- og sluttpunkt i lydfilen, grafisk volumkurve, volumpunkter, drahandling for redigering av kurven, dobbeltklikk for å fjerne punkter, tastaturbasert finjustering. Eksisterende opptaksvindu: valg av lydspor, valg av replikk gjennom nedtrekksliste, navn på opptaket i biblioteket, valg om scenen skal spilles mens det tas opp, opptaksknapp, handling for å legge lyd til scenen. Eksisterende scenetidslinje: dialoglyd vises som tidsplasserte segmenter; replikktekst kan i dag fremstå som spornavn. Den nye funksjonaliteten skal bygge videre på dette. Ikke opprett en separat, inkompatibel lydeditor.
9. MANUSET SKAL VÆRE TYDELIG UNDER OPPTAK. Aktiv replikk vises med tydelig font, god lesbarhet, tilstrekkelig tekststørrelse, god kontrast, fornuftig linjebryting og en plassering som gjør den synlig mens opptakskontrollene brukes. Det skal ikke være nødvendig å lese replikken fra en liten nedtrekksliste.
10. VIS MANUSKONTEKST. Brukeren skal kunne se foregående replikk, relevante handlingsbeskrivelser, aktiv replikk og neste replikk. Omkringliggende manustekst vises i omtrent 70 % visuell styrke sammenlignet med den aktive replikken. Den aktive replikken skal være mest fremtredende.
11. KARAKTERMINIATYR. Hvis karakteren har et bilde i ressursbiblioteket, vises et lite portrett i dialogeditoren. Hvis ikke, skal grensesnittet fungere uten. Ikke generer et tilfeldig karakterbilde som erstatning.
12. TYDELIG KARAKTERNAVN. Karakterens navn vises tydelig sammen med replikken. Koblingen bygger på karakterens stabile ressursidentitet, ikke bare på teksten til karakternavnet i manus.
13. GJENBRUK REPLIKKVELGEREN. Nedtrekkslisten med scenens replikker skal også være tilgjengelig i den forbedrede dialogeditoren. Brukeren kan velge en annen replikk i scenen uten unødvendig navigasjon. Listen viser taler og nok replikktekst til å skille replikker fra hverandre.
14. FORHÅNDSVALGT REPLIKK. Åpnes editoren fra dobbeltklikk i manus, er riktig replikk forhåndsvalgt. Åpnes opptaksfunksjonen generelt fra mikrofonikonet, kan brukeren velge replikk fra nedtrekkslisten.
15. BEHOLD SCENEAVSPILLING UNDER OPPTAK. Funksjonen beholdes og kan slås av og på. Spilles scenen under opptak, skal grensesnittet tydelig minne om hodetelefoner.
16. FLERE TAKES. Flere opptak av samme replikk. Hvert opptak lagres som egen versjon. Ingen tidligere lydversjon overskrives automatisk.

## DEL C – EGEN KNAPP FOR AI-GENERERING AV EN REPLIKK
17. «GENERER LYDFIL». Dialogeditoren har knappen «Generer lydfil». Den valgte manusreplikken brukes som grunnlag for talesyntese.
18. STANDARDSTEMME. Har karakteren en definert AI-stemme, er den forhåndsvalgt.
19. LOKAL OVERSTYRING. Brukeren kan velge annen stemme, modell eller innstillinger for én generering. Det endrer ikke karakterens permanente standardstemme.
20. GENERER FLERE ALTERNATIVER. Flere lydversjoner av samme replikk, lagret separat, for å prøve stemme, fremføring, tonefall, hastighet og andre innstillinger leverandøren støtter. Alle versjoner kan sammenlignes senere.

## DEL D – KARAKTERENS LYD- OG STEMMESEKSJON I ASSET LIBRARY
21. EGEN BOKS FOR LYD. Hver karakter har seksjonen «Lyd / Stemme» i Asset Library. Den samler all informasjon om stemme og lydressurser. Dette er karakterens permanente lydprofil, og den kan administreres uten å åpne en scene.
22. INNHOLD. Standard AI-stemme, stemmeleverandør, stemme-ID, stemmeinnstillinger, foretrukket talespråk, innspilte lydressurser, AI-genererte opptak, alternative takes, versjoner, handlingen «Generer all tale for denne karakteren» og handlingen «Generer alle røde replikker». Lydprofilen er tilgjengelig på ressursnivå uavhengig av scene.
23. ELEVENLABS. Er Animatic Studio koblet til ElevenLabs, kan brukeren velge blant stemmer og modeller i den autoriserte kontoen. Valget lagres i lydprofilen. Datamodellen må lagre leverandør, stemme-ID, modell-ID der relevant, synlig stemmenavn, valgte stemmeinnstillinger og språk- og kapabilitetsopplysninger. Kontroller faktisk API og integrasjoner under planleggingen.
24. EGEN AI-STEMME. Opprette eller knytte til egen AI-stemme dersom leverandør og konto tillater det, også en eksisterende egendefinert stemme hos ElevenLabs. Følg leverandørens regler for rettigheter og samtykke. Ikke anta at alle kontoer har samme tilgang.
25. IKKE LÅS ARKITEKTUREN TIL ÉN LEVERANDØR. Skille mellom manuelle opptak, AI-genererte opptak, opplastede lydfiler og forskjellige AI-leverandører.
26. ENDRING AV STANDARDSTEMME påvirker nye genereringer. Tidligere lydfiler endres ikke. En lydfil er et lagret resultat, ikke en referanse til nåværende stemmeinnstilling.

## DEL E – ÉN DIALOGTRACK PER KARAKTER
27. KARAKTERNAVNET SOM SPORNAVN (f.eks. MAJA, ROLF), ikke teksten til en replikk. Erstatter dagens visning der replikktekst kan være sporetikett.
28. SAMLE KARAKTERENS REPLIKKER. Alle ordinære replikker fra samme karakter i én scene ligger som hovedregel på samme dialogspor. Seks replikker gir seks segmenter på sporet MAJA.
29. HVER REPLIKK ER ET EGET SEGMENT med egen replikkidentitet, tidsplassering, varighet, aktiv lydversjon, historikk og synkroniseringsstatus.
30. UNNGÅ UTILSIKTET OVERLAPP. To ordinære replikker fra samme karakter spiller ikke automatisk oppå hverandre på samme spor. Ved ugyldig overlapp varsles eller hindres operasjonen. Ikke flytt en annen replikk uten brukerens godkjenning. Lydversjoner av samme replikk er ikke flere scenehendelser.
31. KNYTT DIALOGEN TIL KARAKTERENS IDENTITET. Stabil kobling til karakteren i ressursmodellen, også mot visuell karakterressurs, slik at manus, tale, karakter, visuell representasjon og senere funksjoner henger sammen. Ikke implementer animasjonsfunksjoner på nytt.
32. KARAKTER UTEN VISUELL REPRESENTASJON kan ha lyd og replikker. Visuell ressurs kan kobles på senere.

## DEL F – FLERE LYDVERSJONER PER REPLIKK
33. STABLE VERSJONER. Alle lydversjoner vises som separate, stablede bølgeformspor i dialogeditoren (f.eks. originalt opptak, nytt opptak, AI-generert, redigert variant). Sammenlignes uten at noen går tapt.
34. SLÅ VERSJONER AV OG PÅ. Skill mellom forhåndslytting (hva brukeren hører under inspeksjon) og aktiv filmversjon (det som brukes i sceneavspilling og eksport). Som standard er én versjon aktiv per replikk.
35. INGEN LYDVERSJONER SKAL FORSVINNE. Historikken er tilgjengelig over tid.
36. BEVAR ALL INDIVIDUELL LYDREDIGERING. ABSOLUTT KRAV. Hver versjon bevarer egne klippinger, inn- og utpunkter, trim, hastighet, tidsstrekking, volum, volumpunkter, volumkurver, inn- og uttoninger, andre lydprofiler og redigering av enkeltord eller delpassasjer. Når versjon A velges igjen, er den nøyaktig slik brukeren forlot den.
37. SKILL LYDVERSJON FRA SCENEPLASSERING. Replikkforekomsten eier startposisjonen i scenen. Lydversjonen eier kildefil og egne redigeringsinnstillinger. Bytter brukeren fra B tilbake til A, starter A på replikkens nåværende plassering og beholder sin egen trimming, hastighet og volumkurve.
38. KILDETID OG SCENETID ER FORSKJELLIGE. Å flytte en replikk endrer ikke versjonenes redigering. Å bytte versjon flytter ikke replikken.
39. ULIK VARIGHET MELLOM VERSJONER. Startposisjonen bevares. Ugyldig overlapp med neste replikk gir varsel. Andre replikker flyttes ikke automatisk.
40. METADATA PER VERSJON: lydkilde, opptak eller AI-generering, leverandør, stemme-ID, modell, genereringsinnstillinger, opprinnelig manusrevisjon, opprettelsestidspunkt, eventuell foreldreversjon, redigeringshistorikk, synkroniseringsstatus.

## DEL G – «GENERER ALL TALE FOR DENNE KARAKTEREN»
41. Handlingen ligger i Lyd / Stemme-seksjonen i Asset Library, ikke i en scene. Kan omfatte flere scener i det aktive filmprosjektet. Brukes karakteren i flere prosjekter, må jobben ha tydelig valgt prosjektomfang.
42. ANALYSER REPLIKKDEKNING. Vis scener som mangler all tale, har lyd for enkelte replikker, har lyd for alle, eller har uavklarte avvik. En scene er ikke komplett bare fordi den har ett lydklipp.
43. OVERSIKT PER SCENE: scenenummer og tittel; antall replikker; med lyd; uten lyd; med rødt avvik; om nye genereringer overtar aktive versjoner.
44. BRUKEREN VELGER SCENER: alle relevante, bare de som mangler lyd, enkelte scener, delvis dekning, eller eksisterende tale som skal genereres på nytt. Med avkrysningsbokser eller tilsvarende. Ikke nødvendig å starte med alle og ekskludere.
45. FØR BEKREFTELSE vises antall valgte scener, valgte replikker, hvor mange mangler lyd, hvor mange har lyd, og hvor mange har avvik.
46. ADVARSEL VED EKSISTERENDE LYD: «Noen av de valgte scenene har allerede innspilt eller generert tale. Nye lydfiler blir lagt til som alternative versjoner og settes som aktive for de aktuelle replikkene. Ingen eksisterende lydfiler eller redigeringer blir slettet. Du kan senere velge tilbake en tidligere versjon.» Eksplisitt før kostnadsbelagte kall.
47. NY LYD BLIR AKTIV: lagres som ny versjon, knyttes til karakter og replikk, plasseres på riktig karakterspor og settes som aktiv. Tidligere versjoner blir inaktive alternativer og slettes ikke.
48. VED FEIL forblir tidligere aktiv versjon aktiv. Delvis feil etterlater ikke replikker uten lyd. Vellykkede genereringer bevares. Feilede kan prøves på nytt.
49. TILBAKE TIL GAMMEL TALE. Brukeren kan velge en tidligere versjon. Alle gamle justeringer er intakte, og versjonen arver gjeldende startposisjon.
50. KOSTNADSESTIMAT basert på leverandør, modell, valgte replikker, tekstmengde, forbruksenhet og gjeldende priser. Ikke finn på pris hvis informasjon mangler. Marker at det er et estimat.
51. ESTIMERT BEHANDLINGSTID basert på tekstmengde, antall replikker, leverandørens begrensninger og observasjoner. Presenteres som usikkert.
52. BEKREFTELSE FØR BETALT GENERERING etter at brukeren har sett hva som genereres, karakter, valgte scener, språk, stemme/modell, estimert kostnad og eventuell advarsel om eksisterende lyd.
53. FREMDRIFT per replikk: venter, genererer, ferdig, feilet, hoppet over. Gjenoppta eller prøv mislykkede deler på nytt uten å generere alle på nytt.

## DEL H – AUTOMATISK PLASSERING AV GENERERT TALE
54. Generert lyd knyttes til riktig scene og replikk og legges på riktig karakterspor. Ingen manuell import.
55. Har replikken tidsplassering, brukes den. Mangler den, foreslås eller etableres plassering ut fra manus- og scenestruktur. Usikkert tidspunkt fremstilles ikke som eksakt.
56. MANGLER 2D-SCENE, opprettes en minimal, gyldig 2D-scene automatisk med riktig manusidentitet og plass i produksjonsstrukturen, som kan inneholde dialogspor og redigeres senere. Ingen genererte bakgrunner eller illustrasjoner.
57. IKKE DUPLISER scener eller spor. Gjentatt generering lager ikke dubletter.
58. GENERERT LYD ER FULLT REDIGERBAR: trimming, hastighet, tidsstrekking, volumkurver, fades, andre justeringer, takes og versjoner.

## DEL I – TRE UAVHENGIGE SPRÅKDIMENSJONER
59. Gjelder hele Animatic Studio. Ingen tvungen sammenheng mellom programspråk (grensesnitt), manusspråk (manus eller passasje) og talespråk (det karakteren snakker eller AI genererer).
60. Eksempel: norsk grensesnitt, engelsk manus, én karakter snakker engelsk, en annen spansk, en tredje fransk, uten at brukeren bytter språk for hele programmet.
61. Språk på nivåene: prosjektets standard manusspråk, karakterens foretrukne talespråk, den enkelte replikks språk, valgt språk eller språkmodus ved generering, valgt modell og leverandør. Lokale overstyringer er mulig.
62. Alle språk den valgte ElevenLabs-modellen faktisk støtter, ikke bare norsk og engelsk. Kontroller mot leverandørens kapabiliteter. Ikke bruk en utdatert hardkodet liste som eneste kilde.
63. Støtter ikke stemmen eller modellen ønsket språk, får brukeren tydelig beskjed. Språk eller stemme endres aldri i skjul.
64. Datamodellen forutsetter ikke at tekst har samme språk som grensesnittet. Unicode og relevante skriftsystemer. Tekstsammenligning håndterer ulike ord- og setningsgrenser.

## DEL J – FLERSPRÅKLIGHET VED MASSEGENERERING
65. Før massegenerering undersøkes om karakteren har replikker på flere språk. Brukeren varsles. Deteksjonen er beslutningsstøtte, ikke en fasit.
66. Melding: «Denne karakteren har replikker på flere språk. Kontroller hvilket språk som skal brukes før du genererer tale.» Vis hva som er oppdaget og hvor det er usikkert.
67. ALTERNATIV 1 – samlet generering som eksplisitt valg, uten garanti for korrekt uttale.
68. ALTERNATIV 2 – del opp etter språk: filtrer scener og replikker etter språk og velg innhold per jobb. Separate jobber med egne replikkvalg, stemme- og modellinnstillinger, kostnadsestimat, status og fremdrift.
69. Brukeren bestemmer språkfordelingen. Programmet foreslår. En scene med flere språk tvinges ikke til ett talespråk.

## DEL K – MANUSENDRINGER OG LYD SOM IKKE LENGER SAMSVARER
70. Når en replikk endres etter at en lydversjon ble laget (nye, fjernede eller endrede ord, nye eller fjernede setninger, omformuleringer), skal det oppdages ved hjelp av stabil replikkidentitet og historikk over hvilken manusrevisjon versjonen ble laget for.
71. Er aktiv versjon ikke dokumentert i samsvar med manus, markeres segmentet rødt i tidslinjen. Lydfilen slettes eller endres ikke.
72. I dialogeditoren fremheves endret tekst i rødt. Slettede ord vises fortsatt i avviksoversikten, slik at brukeren ser hva opptaket kan inneholde.
73. Hver lydversjon har kobling til teksten eller revisjonen den representerer, så versjoner kan ha ulik avviksstatus. Blir en eldre versjon aktiv igjen, kan avviket komme tilbake.
74. Rød status i sceneeditoren gjelder den aktive versjonen. Inaktive versjoner beholder sin revisjonsinformasjon.
75. Manusendring endrer ikke lyden automatisk. Brukeren velger håndtering.
76. REPARASJON fra dialogeditoren: spille inn på nytt, generere ny tale, bruke eksisterende lydredigering, klippe bort ord, erstatte en lydpassasje der verktøyene støtter det, bytte versjon, lytte, godkjenne samsvaret.

## DEL L – GLOBAL SYNLIGHET AV AVVIK
77. Avvik vises overalt der manuset presenteres: sceneeditorens manusvisning, Manusutforskeren, dialogeditoren og andre manusflater. Én felles avviksstatus, ikke lokale registre per vindu.
78. Et tydelig ikon viser at replikken trenger gjennomgang, med forklaring, f.eks. «Manuset er endret etter at aktiv lydversjon ble opprettet.»
79. LENKE-UT-SYMBOL for direkte navigasjon til dialogens plassering i scenen.
80. Klikk: åpne riktig prosjekt, naviger til scenen, finn replikkforekomsten, flytt avspillingshodet til starten av replikken, oppdater hovedvisningen og marker dialogen tydelig.
81. Avspilling starter ikke automatisk.
82. Navigasjonen bruker forekomstens scenetid, ikke lydversjonens interne trim. Er replikken flyttet, går lenken til ny plassering.
83. Mangler gyldig sceneplassering, åpnes manuskonteksten med forklaring. Ingen tilfeldig navigasjon.

## DEL M – EKSPLISITT FJERNING AV AVVIKSMERKING
84. Å åpne dialogeditoren eller spille lyd fjerner ikke avviket.
85. Handlingen «Merk som gjennomgått – fjern avviksmerking» bekrefter at aktiv versjon er vurdert mot gjeldende manus.
86. Historikken bevares: tidligere manustekst, lydversjoner, redigeringshistorikk og informasjon om hvilket avvik som ble gjennomgått. Godkjenningen knyttes til kombinasjonen av manusrevisjon og lydversjon.
87. Ny manusendring gir nytt avvik. Bytte til eldre, ikke gjennomgått versjon kan gi rød markering igjen.
88. Skill mellom dokumentert oppdatert lyd (f.eks. ny generering fra gjeldende manus) og manuelt gjennomgått lyd. Sporbarheten bevares.

## DEL N – «GENERER ALLE RØDE REPLIKKER»
89. Egen handling i Lyd / Stemme-seksjonen. Finner replikker med uavklart avvik for karakteren i aktivt prosjekt.
90. Oversikt over scener og replikker med avvik, hva som er endret, eksisterende versjoner, og hva som er valgt. Brukeren velger hva som inngår.
91. Samme krav til kostnad, tid, stemme, språkdeteksjon, språkfordeling, bekreftelse, fremdrift og feilhåndtering som massegenerering.
92. Vellykket tale lagres som ny versjon, blir aktiv, bevarer gamle versjoner og bevarer sceneposisjonen.
93. Generert fra gjeldende revisjon og aktiv: avviket kan kvitteres ut på dokumentert grunnlag. Velges eldre versjon igjen, kan avviket komme tilbake.

## DEL O – PERSONLIG FORTSETTELSESBOKMERKE
94. Bokmerke der arbeidet stopper, knyttet til prosjekt, scene, tidsposisjon, manuspassasje, replikk og arbeidsvisning.
95. «Fortsett ved bokmerke» i toppmenyen åpner riktig kontekst. I en scene åpnes scenen med avspillingshodet på riktig tid.
96. BOKMERKET FJERNES ETTER BRUK når navigasjonen lykkes. Det er en midlertidig påminnelse, ikke en huskelapp.
97. PERSONLIG: tilhører den enkelte bruker. Ett aktivt per bruker og prosjekt. Nytt erstatter gammelt. Andre brukere kan ikke flytte eller slette det.

## DEL P – GULE UTROPSTEGN OG HUSKELAPPER
98. Rask markering med gult utropstegn på lydopptak, dialogsegment, lydversjon, bildeobjekt, bildevariant og sceneforekomst.
99. Slås av og på. Kan opprettes uten tekst.
100. Valgfri merknad som kan redigeres senere.
101. Deaktivering sletter ikke teksten. Sletting er en egen tydelig handling.
102. Stabil tilknytning til prosjekt, scene, replikk, lydversjon, lydsegment, bilde og sceneforekomst. Referansen mistes ikke når tidsposisjonen endres.
103. HUSKELAPPER ER DELT MELLOM PROSJEKTBRUKERE (brukerens siste uttrykkelige beslutning). Synlige for andre autoriserte brukere, ikke private som standard. Synlig i sceneeditoren og i prosjektets merknadsoversikt.
104. Synkroniseres via eksisterende flerbrukerarkitektur.
105. Metadata: oppretter, opprettet, sist oppdatert og hvem som har endret status.
106. Følger eksisterende roller og rettigheter. Lesetilgang gir ikke automatisk slettetilgang.

## DEL Q – MERKNADER PÅ PROSJEKTOVERSIKTEN
107. Boksen «Merknader og huskelapper» på prosjektsiden.
108. Viser tekst, type, oppretter, opprettet, oppdatert, scene, manusreferanser, tilknyttet lyd- eller bildeelement og aktiv/inaktiv.
109. Sortering etter dato, plassering i manus og scenerekkefølge.
110. Filtrering etter oppretter, type og aktiv/inaktiv, lett å kombinere.
111. Klikk navigerer: replikk gir scene og tidsposisjon; lydversjon gir dialogeditor med versjonen markert; bilde gir scene med elementet markert; sceneforekomst gir scene med forekomsten fremhevet.
112. Bruker elementets nåværende plassering, ikke sekundtallet da merknaden ble laget.
113. Viser alle medarbeideres merknader, med filter for egne.

## DEL R – TRE FORSKJELLIGE OPPFØLGINGSSYSTEMER
114. Automatisk manus-/lydavvik: systemstatus, rød, kvitteres ut ved gjennomgang eller dokumentert ny generering.
115. Fortsettelsesbokmerke: personlig, midlertidig, fjernes etter bruk.
116. Gul huskelapp: delt, brukeropprettet, på lyd, bilde og andre elementer, med valgfri tekst, i prosjektets merknadsoversikt.
117. IKKE BLAND SYSTEMENE. Å fjerne rødt avvik fjerner ikke gul lapp. Å bruke bokmerke fjerner ikke delte merknader. Å deaktivere gul lapp endrer ikke synkroniseringsstatus. Separate data, regler og livssykluser.

## DEL S – DATAARKITEKTUR
118. Stabile koblinger mellom prosjekt, scene, manusreplikk, karakter, visuell karakterressurs, dialogforekomst, dialogspor, lydversjon, lydprofil, stemmekonfigurasjon, manusrevisjon, avviksstatus, bokmerke, merknad og bruker. Ikke basert på visningsnavn eller fritekst.
119. EIERSKAP (obligatorisk): karakteren eier standardstemmen; manusreplikken eier tekstidentitet og revisjonshistorikk; dialogforekomsten eier plasseringen i scenen; lydversjonen eier lydfil og egne justeringer; sceneavspillingen eier valget av aktiv versjon; avviksstatusen knytter manusrevisjon til lydversjon; merknaden eier sin tekst og peker til elementet; bokmerket peker til brukerens arbeidssted.
120. IKKE-DESTRUKTIV VERSJONERING. Versjoner og redigeringsdata bevares ved bytte. Ingen generering sletter takes. Revisjonshistorikken forklarer hvorfor en versjon er utdatert.
121. FLERE BRUKERE via eksisterende samarbeidsmodell. Ingen stille overskriving av lydvalg, manus, merknader eller stemmeprofiler. Huskelapper synkroniseres.
122. INGEN DUPLIKATER ved generering. Jobber har sporbare identiteter. Gjentak eller gjenopptak lager ikke identiske scener, spor eller aktive versjoner. En ny, bevisst generering lager en ny versjon.

## DEL T – ARBEIDSFLYTER
123. Vanlig flyt: leser manus, klikker replikk, avspillingshodet går dit, dobbeltklikker, dialogeditoren åpner riktig replikk med kontekst og bilde, spiller inn eller genererer, flere versjoner vises, velger aktiv versjon, den brukes i scenen, alle tidligere versjoner bevares.
124. Avviksflyt: replikk endres, avvik oppdages, rød markering i alle manusvisninger, lenke-ut åpner scenen med avspillingshodet på replikkstart, dialogeditoren viser endringer i rødt, brukeren redigerer, spiller inn, genererer eller velger annen lyd, merker som gjennomgått, historikken bevares.
125. Merknadsflyt: markerer bilde eller lyd, gult utropstegn, eventuell tekst, andre ser det, merknaden finnes på prosjektsiden, filtreres og sorteres, klikk navigerer til objektet, kan deaktiveres, historikken håndteres uten utilsiktet sletting.

## DEL U – AKSEPTANSEKRITERIER
126 Manusnavigasjon: M1 enkeltklikk på tidsplassert replikk flytter avspillingshodet; M2 hovedvisningen oppdateres; M3 dobbeltklikk åpner riktig dialogeditor; M4 riktig replikk forhåndsvalgt; M5 manglende timing uten falsk presisjon.
127 Dialogeditor: D1 aktiv replikk lesbar under opptak; D2 kontekst i ca. 70 % styrke; D3 miniatyr når den finnes; D4 navn tydelig; D5 velge annen replikk i nedtrekkslisten; D6 sceneavspilling under opptak virker; D7 flere takes uten overskriving; D8 eksisterende lydprofil (volumkurver, hastighet, bølgeform) virker.
128 Stemme og enkeltgenerering: V1 «Generer lydfil»; V2 standardstemme forhåndsvalgt; V3 lokale overstyringer; V4 nye genereringer som separate versjoner; V5 Lyd / Stemme-seksjon per karakter; V6 velge ElevenLabs-stemme når integrasjonen finnes; V7 endret standardstemme endrer ikke tidligere filer.
129 Karakterspor og versjoner: L1 ett felles spor per karakter; L2 spornavn er karakternavn; L3 replikker er separate segmenter; L4 versjoner stablet i dialogeditoren; L5 forhåndslytting; L6 bare aktiv versjon spilles i scenen; L7 tidligere versjoner bevares; L8 volumkurver, klipping, hastighet og fades bevares ved bytte; L9 gjenvalgt versjon arver gjeldende plassering; L10 ulik varighet uten utilsiktet overlapp.
130 Massegenerering: G1 handlingen i Asset Library; G2 scener som mangler tale helt eller delvis; G3 velge scener; G4 advarsel ved eksisterende lyd; G5 ny generering blir aktiv; G6 ingen lyd slettes; G7 feil lar aktiv versjon stå; G8 kostnadsestimat før bekreftelse; G9 tidsestimat når forsvarlig; G10 fremdrift per replikk; G11 automatisk plassering i riktig scene; G12 minimal 2D-scene opprettes ved behov; G13 ingen duplikater.
131 Språk: S1 tre forskjellige språk; S2 flere talespråk i ett prosjekt; S3 overstyring per replikk; S4 støtte kontrolleres mot leverandøren; S5 varsel ved flere språk før massegenerering; S6 samlet generering; S7 separate språkjobber; S8 brukeren velger innhold per jobb.
132 Avvik: A1 manusendring gir rød status; A2 aktiv versjon bestemmer status; A3 endrede og fjernede passasjer identifiseres; A4 synlig overalt der manuset vises; A5 lenke-ut til riktig scene; A6 avspillingshodet på replikkstart; A7 ingen automatisk avspilling; A8 endringer i rødt i dialogeditoren; A9 «Merk som gjennomgått» krever eksplisitt handling; A10 historikken bevares; A11 ny endring gir rødt igjen; A12 eldre versjon kan gi avvik igjen.
133 Generer alle røde: R1 handlingen i Asset Library; R2 berørte scener og replikker vises; R3 velge replikker; R4 språk og kostnad før generering; R5 nye filer aktive, gamle bevart; R6 riktig manusrevisjon registreres.
134 Bokmerke: B1 sette personlig bokmerke; B2 «Fortsett ved bokmerke» åpner riktig sted; B3 fjernes etter vellykket navigasjon; B4 andres bokmerker påvirkes ikke.
135 Huskelapper: H1 merke lyd; H2 merke bilde; H3 valgfri tekst; H4 av/på; H5 avmarkering sletter ikke tekst; H6 andre autoriserte ser det; H7 synkronisering; H8 oppretter og dato; H9 boks på prosjektsiden; H10 sortering etter dato og manusplassering; H11 filter på oppretter; H12 klikk åpner riktig sted; H13 virker selv om elementet er flyttet; H14 rettigheter følger samarbeidsmodellen.

## DEL V – IMPLEMENTERINGSOPPDRAG
136. UNDERSØK KODEBASEN FØRST: manusvisning, avspillingshode, dialogmodell, karakter- og ressursidentiteter, opptaksdialog, replikkvelger, lydprofil, lydversjonering og lagring, Asset Library, ElevenLabs-integrasjoner, sceneopprettelse og 2D-scener, kommentarfunksjoner, bokmerker, flerbrukermodell, autorisasjon og database. Kartlegg hva som finnes, hva som kan utvides og hva som må bygges.
137. DATAMODELL som støtter: 1) standardstemme; 2) replikkens manusidentitet; 3) sceneplassering; 4) flere versjoner per replikk; 5) fullstendige justeringer per versjon; 6) valgt aktiv versjon; 7) manusrevisjon per versjon; 8) avviksstatus og manuelle godkjenninger; 9) språk på relevante nivåer; 10) massegenereringsjobber og kostnad; 11) personlige bokmerker; 12) delte merknader; 13) navigasjon fra merknad til element.
138. ANBEFALT REKKEFØLGE (kan justeres etter avhengigheter): 1 manusnavigasjon; 2 forbedret dialogeditor; 3 karakterspor; 4 lydversjoner; 5 lydprofil i Asset Library; 6 enkeltgenerering; 7 massegenerering; 8 flerspråklighet; 9 manus-/lydavvik; 10 global avviksnavigasjon; 11 manuell avviksgodkjenning; 12 generer alle røde; 13 fortsettelsesbokmerker; 14 delte huskelapper; 15 merknadsoversikt; 16 full regresjonstesting, særlig at lydversjoner og redigeringer aldri går tapt.

## DEL W – PRODUKTPRINSIPPER
139. Ikke destruer tidligere kreativt arbeid: ny generering sletter ikke et godt opptak, nytt opptak fjerner ikke AI-versjoner, bytte av aktiv versjon nullstiller ikke eldre redigering.
140. Ikke bland manus og lyd som samme data.
141. Ikke tving én AI-stemme: standardstemme, men lokale overstyringer.
142. Ikke tving ett språk på hele produksjonen.
143. Ikke gjør huskelapper private. Bokmerket er individuelt.
144. Ikke tving automatisk reparasjon av avvik: nytt opptak, ny generering, redigering, annen versjon eller manuell godkjenning.
145. Ikke opprett flere lydspor enn nødvendig: ett karakterspor, takes på versjonsnivå.
146. Ikke opprett nye scener uten behov.
147. SLUTTMÅL: manus, tale og film blir én sammenhengende redigeringsopplevelse. Ingen kreativ lydversjon går tapt, ingen viktig manusendring blir oversett, og ingen medarbeider må lete unødvendig etter stedet en merknad gjelder.

ENDELIG BESKJED: Én komplett kravspesifikasjon. Undersøk kodebasen, vurder gjenbruk og lag en gjennomførbar implementeringsplan med sporbare akseptansekriterier. Ikke reduser funksjonaliteten til en enkel opptaksdialog, en AI-stemmeknapp eller et generisk kommentarfelt.
