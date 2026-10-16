ANIMATIC STUDIO

FASE 2 – KOMPLETT PROSJEKTSPESIFIKASJON

Mobilbro, QR-koder, bilde- og videoimport, lydopptak og intelligent dialogredigering

Dokumenttype: Funksjonsspesifikasjon og utviklingsmandat
Status: Samlet spesifikasjon basert på gjennomgåtte og bekreftede brukerkrav
Produkt: Animatic Studio
Omfang: Nye funksjoner definert i fase 2

⸻

1. FORMÅL OG AVGRENSNING

Dette dokumentet beskriver en ny, integrert funksjonsgruppe for Animatic Studio.

Målet er å gjøre innsamling av bilder, video og lyd så enkel og direkte som mulig, samtidig som programmet får en avansert, tekstbasert editor for lyd og dialog.

Funksjonene skal gjøre det mulig å:

* Bruke mobiltelefonen som en trådløs opptaks- og innsamlingsenhet.
* Skanne QR-koder og umiddelbart åpne riktig mobilgrensesnitt.
* Overføre bilder, video og lyd til prosjektet.
* Ta flere bilder i rask rekkefølge med automatisk opplasting.
* Ta opp lyd både fra PC og mobil.
* Gjøre flere lydopptak uten å miste tidligere takes.
* Høre og sammenligne opptak før opplasting.
* Dele en mobilimportlenke med andre bidragsytere.
* Knytte nye medieressurser direkte til en karakter, et objekt, en lokasjon eller en scene.
* Redigere dialog gjennom selve manusteksten.
* Markere ett ord, flere ord, setninger eller større tekstområder.
* Oppdage ny og endret manustekst som mangler oppdatert lyd.
* Erstatte hele eller deler av eksisterende dialog.
* Sette inn nye setninger og lydopptak.
* Endre pauser mellom ord visuelt.
* Bevare naturlig romlyd når pauser forlenges.
* Forhåndsspille endringer automatisk dersom brukeren ønsker det.
* Eksportere ferdige lydkomposisjoner direkte fra dialogeditoren.


Dette er en tilleggsspesifikasjon til eksisterende prosjektmandat.

Ikke redesign eller gjenimplementer eksisterende systemer med mindre integrasjonen krever en konkret, begrunnet endring.

⸻

2. OVERORDNEDE PRINSIPPER

2.1 Minst mulig friksjon

Brukeren skal kunne gå fra idé til opptak på kortest mulig tid.

Ingen unødvendige mellomvinduer, ekstra QR-knapper eller gjentatte valg av ressurs.

2.2 Konteksten skal følge med

Når brukeren åpner mobilimport fra en karakter, en lydfil, et objekt eller en scene, skal systemet allerede vite hvor nytt materiale skal plasseres.

Brukeren skal ikke behøve å velge dette på nytt.

2.3 QR-koder skal vises direkte

Når en QR-basert importpopup åpnes, skal QR-koden være synlig umiddelbart.

Brukeren skal aldri måtte klikke på en egen knapp for å vise QR-koden.

2.4 Ikke-destruktiv mediehåndtering

Nye bilder, videoer og lydopptak skal ikke automatisk erstatte eksisterende godkjente medieressurser.

Originalfiler og tidligere lydopptak skal bevares.

2.5 Lokal dialogredigering

Når brukeren redigerer én dialog, skal andre dialoger i scenen aldri automatisk endres, forskyves eller strekkes.

Dette gjelder også hvis et nytt opptak blir lengre enn originalen.

2.6 Bilde og lyd har forskjellige arbeidsflyter

Bilder skal kunne tas raskt og lastes opp automatisk.

Lyd skal kunne tas opp i flere varianter, lyttes til og velges før opplasting.

⸻

DEL A – QR-BASERT MOBILBRO

3. QR-KODE PÅ PROSJEKTSIDEN

På prosjektsiden skal det finnes en tydelig funksjon for mobilimport.

Foreslått navn:

Importer fra mobil

Når brukeren åpner denne funksjonen, skal Animatic Studio vise en QR-kode som er knyttet til det aktive prosjektet.

QR-koden skal vises direkte i importvinduet.

Den skal kunne skannes med mobiltelefonens vanlige kamera.

Skanningen skal åpne en mobiltilpasset nettside som er koblet til det riktige Animatic Studio-prosjektet.

Mobilen skal dermed fungere som en trådløs innsamlingsenhet.

Brukeren skal slippe å:

* Koble telefonen fysisk til datamaskinen.
* Sende filer til seg selv.
* Bruke e-post for filoverføring.
* Eksportere bilder via andre applikasjoner.
* Gjennomføre en separat import på datamaskinen.


Et ferdig opplastet bilde eller lydopptak skal bli tilgjengelig direkte i prosjektet.

⸻

4. MOBILNETTSIDEN

Mobilnettsiden skal være responsiv og tilpasset iPhone og Android.

Grensesnittet skal være enkelt, tydelig og laget for bruk på en liten skjerm.

Fra generell prosjektimport skal brukeren kunne:

* Ta et nytt bilde.
* Ta flere bilder etter hverandre.
* Ta opp video.
* Ta opp lyd.
* Velge eksisterende bilder.
* Velge eksisterende videoer.
* Velge eksisterende lydfiler.


Store, tydelige kontroller skal gjøre det mulig å bruke funksjonen ute på opptakssted eller i andre praktiske situasjoner.

Det skal ikke være nødvendig å åpne hele Animatic Studios vanlige arbeidsgrensesnitt på mobilen.

Mobilnettsiden skal bare vise funksjonene som er relevante for den aktuelle importøkten.

⸻

5. DIREKTE MOBILIMPORT I RESSURSDIALOGER

Mobilimport skal ikke bare finnes på prosjektsiden.

Den skal også være tilgjengelig fra relevante ressursdialoger, popupvinduer og redigeringspaneler.

5.1 Kameraikon

Når en dialog arbeider med bilder eller video, skal det finnes et kameraikon øverst til høyre.

Ikonet skal ha konsekvent plassering i de relevante dialogene.

Når brukeren klikker på kameraikonet, skal en popup åpnes.

Popupen skal vise en QR-kode direkte.

Eksempel:

Brukeren redigerer karakteren Maja.

Brukeren trykker kameraikonet.

Animatic Studio viser umiddelbart QR-koden med informasjon om at bildene skal legges til Maja.

Brukeren skanner QR-koden og tar et bilde.

Bildet blir tilgjengelig i Majas åpne ressursdialog.

5.2 Mikrofonikon

Når en dialog gjelder lydopptak eller lydredigering, skal det brukes et mikrofonikon.

Mikrofonikonet skal også plasseres øverst til høyre i relevante dialoger.

Ikonet skal gi direkte tilgang til lydopptak fra PC og mobil.

Både PC-opptak og QR-koden skal vises straks popupen åpnes.

Ikke bruk en ekstra knapp for å vise QR-koden.

5.3 Eksisterende og nye ressurser

Kontekstbasert mobilimport skal støtte både eksisterende ressurser og ressurser som er under opprettelse.

Dette omfatter blant annet:

* Eksisterende karakter.
* Ny karakter.
* Objekt eller rekvisitt.
* Miljø eller lokasjon.
* Scene.
* Bildeplass i sceneeditoren.
* Eksisterende lydressurs.
* Ny lydressurs.
* Dialogreplikk.


For en ny ressurs som ennå ikke er lagret, må importen kunne kobles til en midlertidig ressurskontekst.

Når ressursen lagres, skal de importerte filene kunne tilknyttes den permanente ressursidentiteten.

Hvis brukeren avbryter opprettelsen, skal filene ikke forsvinne uventet. De skal kunne bevares i mobilimportbiblioteket som uknyttede ressurser.

⸻

6. AUTOMATISK RIKTIG MÅLPLASSERING

Systemet skal huske hvor mobilimporten ble startet.

Eksempler:

Fra Maja: Nye bilder blir tilgjengelige som bilder av Maja.

Fra objekt: Bilder blir tilgjengelige som bilder av objektet.

Fra miljø: Nye bilder knyttes til det aktuelle miljøet.

Fra scene: Bilder, videoer og lyd kan knyttes til den aktuelle scenen.

Fra dialog: Et lydopptak knyttes til den aktuelle replikken.

Fra generell prosjektimport: Filene havner i prosjektets mobilimportbibliotek.

En fil skal kunne ha flere relevante ressurskoblinger uten at selve originalfilen må dupliseres.

Automatisk målplassering betyr at filen registreres på riktig sted, ikke at den automatisk blir aktiv hovedreferanse.

⸻

DEL B – BILDER OG VIDEO

7. HURTIG FOTOGRAFERING

Mobilnettsiden skal støtte en egen hurtigmodus for fotografering.

Brukeren skal kunne ta flere bilder etter hverandre uten å måtte:

* Velge fil på nytt.
* Bekrefte hver opplasting.
* Gå tilbake til en startskjerm.
* Starte en ny importøkt.


Når nødvendig kameratillatelse er gitt, skal brukeren kunne ta et bilde og fortsette direkte med neste bilde.

Hvert bilde skal legges automatisk i opplastingskøen.

Tidligere bilder skal kunne lastes opp mens brukeren tar nye bilder, så langt nettleser og tilkobling tillater dette.

Det skal finnes en tydelig måte å avslutte fotograferingen på.

Kameraet skal ikke begynne å fotografere uten brukerens aktive handling.

7.1 Automatisk opplasting

I hurtigfotograferingsmodus skal bildene lastes opp automatisk.

Brukeren skal ikke behøve å godkjenne hvert enkelt bilde før overføring.

Systemet skal samtidig vise opplastingsstatus.

Hvis nettverket er ustabilt, skal bilder kunne ligge i kø og sendes når tilkoblingen tillater det.

7.2 Valg fra eksisterende bildebibliotek

Mobilnettsiden skal også tillate valg av bilder som allerede finnes på telefonen.

Brukeren skal kunne velge flere bilder samtidig der plattformen støtter det.

⸻

8. VIDEOIMPORT

Den samme mobilbroen skal støtte video.

Brukeren skal kunne:

* Ta opp ny video med mobilen.
* Velge eksisterende video fra telefonen.
* Forhåndsvise opptaket der dette er relevant.
* Laste opp videoen til prosjektet.


Videoen skal bli tilgjengelig i riktig ressurskontekst.

Hvis importen ble startet fra en scene eller en videoressursdialog, skal filen knyttes til denne konteksten.

Originalfilen skal bevares.

Programmet skal kunne opprette forhåndsvisning og hente relevante metadata.

⸻

9. MOBILIMPORTBIBLIOTEK

Alle filer som kommer fra mobilbroen, skal registreres i prosjektets ressursbibliotek.

Det skal finnes en tydelig egen mappe eller visning:

Mobilimport

Brukeren skal kunne filtrere etter:

* Bilder.
* Video.
* Lyd.
* Dato.
* Importøkt.
* Ressurskobling.
* Bidragskilde.


Bilder skal ha miniatyrvisning.

Videoer skal kunne forhåndsavspilles.

Lydfiler skal kunne forhåndslyttes.

Filene skal bli tilgjengelige i prosjektet så snart opplastingen er bekreftet og nødvendig filbehandling er fullført.

Originalfilene skal bevares.

Importer skal ikke automatisk overskrive tidligere godkjente bilder, lydfiler eller videoklipp.

⸻

10. SANNTIDSOPPDATERING

Når mobilen laster opp en fil, skal prosjektet på datamaskinen oppdateres uten manuell sideoppfriskning.

Hvis en ressursdialog står åpen, skal nye filer dukke opp i denne.

Hvis brukeren har åpnet den generelle mobilimportvisningen, skal filen vises der.

Importvinduet skal kunne vise:

* Om mobilen er tilkoblet.
* Antall mottatte filer.
* Siste mottatte fil.
* Status for pågående opplastinger.
* Eventuelle feil.


En fil skal ikke markeres som ferdig mottatt før serveren har bekreftet dette.

⸻

DEL C – DELING MED ANDRE

11. DEL LENKE FRA MOBILNETTSIDEN

Brukeren skal kunne invitere andre til å bidra med bilder, video og lyd.

Dette skal skje fra den mobilnettsiden brukeren selv har åpnet etter å ha skannet QR-koden.

Mobilnettsiden skal ha funksjonen:

Del lenke

Når brukeren trykker på denne, skal telefonens egen delingsfunksjon benyttes der den er tilgjengelig.

Det betyr at brukeren kan dele via applikasjoner og kommunikasjonstjenester som allerede finnes på telefonen.

Animatic Studio skal ikke utvikle egne SMS-, WhatsApp-, Messenger- eller e-postintegrasjoner bare for denne funksjonen.

Hvis telefonens delingsfunksjon ikke er tilgjengelig, skal brukeren kunne kopiere lenken.

11.1 Deling skal bevare konteksten

Hvis mobilimporten gjelder Maja, skal en delt lenke fortsatt gjelde den relevante importkonteksten.

Hvis brukeren inviterer en fotograf til å bidra med bilder av Maja, skal disse bildene kunne knyttes til Maja.

Hvis lenken gjelder en bestemt lydressurs, skal lydopptakene kunne knyttes til denne.

11.2 Eksterne bidragsytere

En person som mottar lenken, skal kunne åpne et enkelt mobilgrensesnitt uten nødvendigvis å ha en egen Animatic Studio-brukerkonto.

Personen skal kunne bidra med relevante mediefiler.

Bidragsyteren skal ikke automatisk få tilgang til resten av prosjektet.

Det skal ikke være mulig å åpne manus, endre andre ressurser, se prosjektinnstillinger eller bruke prosjektets tilkoblede AI-tjenester bare fordi man har en opplastingslenke.

11.3 Separate delingstillatelser

Den personlige QR-sesjonen og den delte bidragslenken skal ha separate tilgangsrettigheter.

En delt lenke skal ikke videreføre den opprinnelige brukerens fulle rettigheter.

Lenken skal kunne tilbakekalles.

Det skal være mulig å begrense gyldighetstid og opplastingsmengde.

11.4 Flere bidragsytere

Systemet skal støtte at flere personer sender inn filer til samme ressurskontekst.

Filer skal kunne spores til riktig importøkt eller bidragslenke.

Der det passer, skal bidragsyteren kunne oppgi et frivillig navn.

Eksterne bidrag skal ikke automatisk erstatte aktive ressurser.

Systemet skal støtte gjennomgang før eksternt materiale godkjennes som aktivt innhold.

11.5 Delingsvisning – ikke endelig avklart

Det er foreløpig ikke besluttet om eksterne bidragsytere skal kunne se andre personers tidligere opplastinger via samme lenke.

Inntil dette avklares, skal løsningen ikke kreve at bidragsytere får innsyn i andres materiale.

En begrenset opplastingsvisning er det tryggeste utgangspunktet.

Dette skal registreres som et åpent produktvalg, ikke presenteres som en endelig brukerbeslutning.

⸻

DEL D – LYDOPPTAK FRA PC OG MOBIL

12. MIKROFONIKON OG LYDPOPUP

Alle relevante lydressursdialoger og dialogredigeringsvinduer skal ha et mikrofonikon øverst til høyre.

Mikrofonikonet skal åpne en lydpopup direkte.

Denne popupen skal vise to opptaksmetoder samtidig:

Ta opp på denne datamaskinen

Ta opp på mobilen via QR-kode

Begge alternativene skal være synlige fra første øyeblikk.

Ingen ekstra knapp skal kreves for å vise QR-koden.

QR-koden skal representere den aktuelle lydkonteksten.

Brukeren skal kunne velge opptaksmetode uten en ekstra navigasjonsrunde.

⸻

13. HELE DIALOGEN SKAL VISES

Når mikrofonpopupen åpnes fra en manusreplikk eller dialogressurs, skal hele den relevante dialogteksten vises.

Eksempel:

MAJA

«Jeg tror det er noen der ute. Vi må gå og se.»

Hele teksten skal være tilgjengelig, også hvis brukeren bare skal spille inn ett ord.

Det valgte ordet eller tekstområdet skal fremheves.

Karakter og scenekontekst skal fremgå.

Dialogteksten skal også kunne vises på mobilnettsiden under opptak.

Dette gjør at brukeren kan lese replikkene direkte fra mobilen uten å måtte se på datamaskinen.

⸻

14. LYDOPPTAK FRA PC

Brukeren skal kunne starte opptak direkte fra datamaskinens mikrofon.

Det skal finnes tydelige kontroller for:

* Start opptak.
* Stopp opptak.
* Spill av.
* Ta opp på nytt.
* Behold opptak.
* Velg opptak.


Nødvendige mikrofontillatelser må håndteres.

Et opptak skal ikke overskrives når et nytt take opprettes.

Opptak fra PC skal følge samme prinsipp for flere takes som opptak på mobil.

⸻

15. LYDOPPTAK FRA MOBIL

QR-koden skal åpne mobilens lydopptaksside direkte.

Mobilnettsiden skal vise relevant dialogtekst og et enkelt opptaksgrensesnitt.

Brukeren skal kunne:

* Starte opptak.
* Stoppe opptak.
* Høre opptaket.
* Ta et nytt opptak.
* Gå tilbake til tidligere opptak.
* Sammenligne flere opptak.
* Velge ett eller flere opptak.
* Laste opp bare de valgte opptakene.


Lyd skal ikke automatisk lastes opp når opptaket stoppes.

Brukeren skal selv velge hvilke takes som skal sendes.

Dette er en uttrykkelig forskjell fra hurtigfotografering.

⸻

16. FLERE TAKES

Alle lydopptak skal bevares som separate takes.

Eksempel:

Take 01 – 12 sekunder

Take 02 – 14 sekunder

Take 03 – 11 sekunder

Brukeren skal kunne høre dem hver for seg.

Det skal være mulig å ta opp Take 02, høre resultatet og likevel bestemme seg for at Take 01 var best.

Det skal også være mulig å laste opp Take 01 og Take 02 samtidig.

Ett nytt take skal aldri automatisk slette et tidligere take.

Brukeren skal kunne velge et opptak som aktivt, eller senere bruke deler fra forskjellige takes i en redigerbar lydkomposisjon.

⸻

17. OPPTAKSSTATUS OG ROBUST OPPLASTING

Det skal være tydelig hvilke lydopptak som:

* Bare finnes lokalt på telefonen.
* Er valgt for opplasting.
* Lastes opp.
* Er ferdig lastet opp.
* Har feilet.


Brukeren skal ikke miste et lokalt opptak uten advarsel når vedkommende navigerer bort fra siden, så langt nettleserens tilgjengelige lagringsmuligheter tillater dette.

Dersom et opptak ikke er lagret varig på telefonen, skal programmet være tydelig på risikoen ved å forlate siden.

Opplastingsfeil skal kunne håndteres uten at opptaket må gjøres på nytt dersom filen fortsatt finnes lokalt.

⸻

DEL E – LYDEDITOR OG KOMPOSISJON

18. REDIGERING AV EKSISTERENDE LYD

Mikrofonikonet skal også finnes i dialogen der brukeren redigerer eller justerer en eksisterende lydfil.

Når et nytt opptak er tilgjengelig, skal brukeren kunne arbeide med den eksisterende lyden og det nye opptaket i samme redigeringsvindu.

Den aktuelle popupen skal kunne vise:

* Eksisterende lyd.
* Nye takes.
* Bølgeformer.
* Tidslinje.
* Avspillingshode.
* Inn- og utpunkter.
* Trimkontroller.
* Flere lydspor når det er nødvendig.
* Forhåndsavspilling av komposisjonen.


Dette skal være en integrert lydeditor, ikke bare en filopplaster.

⸻

19. HVORDAN NY LYD SKAL KUNNE BRUKES

Et nytt lydopptak skal kunne:

Erstatte eksisterende lyd

Hele den relevante lydressursen eller et markert område kan erstattes.

Settes inn før

Det nye opptaket plasseres før eksisterende lyd innenfor den aktuelle dialogkomposisjonen.

Legges oppå

Det nye opptaket plasseres som et eget lydlag eller spor og kan overlappe eksisterende lyd.

Settes inn etter

Det nye opptaket plasseres etter eksisterende lyd innenfor den aktuelle dialogkomposisjonen.

Erstatte et mindre område

En del av et opptak kan trimmes og brukes til å erstatte bare et valgt ord eller en frase.

Brukeren skal kunne forhåndshøre resultatet før komposisjonen godkjennes.

⸻

20. PRESIS REDIGERING AV ENKELTORD

Lydeditoren skal støtte at bare ett ord i en eksisterende replikk byttes ut.

Eksempel:

Eksisterende lyd:

«Jeg kommer tilbake i morgen.»

Brukeren ønsker å endre «morgen» til «kveld».

Brukeren skal kunne markere det aktuelle ordet og ta opp den nye versjonen.

Det nye opptaket skal kunne trimmes og plasseres i riktig tidsområde.

Klippgrensene skal kunne finjusteres.

Programmet skal støtte passende fades og crossfades for å redusere hørbare skjøter.

Originalopptaket skal bevares.

En slik endring skal ikke kreve at hele replikken spilles inn på nytt.

⸻

21. REDIGERING AV FLERE ORD OG STØRRE TEKSTOMRÅDER

Brukeren skal kunne markere:

* Ett ord.
* To ord.
* Flere sammenhengende ord.
* En hel setning.
* Flere setninger.
* Hele replikken.


Markeringen skal kunne brukes både til avspilling, lydopptak, trim og erstatning.

Brukeren skal ikke være begrenset til ett ord om gangen.

Dette skal fungere gjennom selve dialogteksten, ikke bare gjennom markering i bølgeformen.

⸻

DEL F – AUTOMATISK SYNKRONISERING MELLOM TEKST OG LYD

22. ORD-TIL-LYD-KOBLING

Animatic Studio skal kunne analysere en eksisterende lydfil og koble ord i manusteksten til relevante tidsintervaller.

Metoden skal baseres på forced alignment eller en tilsvarende dokumentert teknikk.

Siden systemet allerede har manusteksten, skal denne kunne brukes som utgangspunkt for analysen.

Resultatet skal være tidskoblinger som gjør at brukeren kan klikke på et ord og markere tilhørende lyd.

Eksempel:

MAJA

«Hvor er Ola?»

Brukeren klikker på «Ola».

Programmet markerer lydintervallet der «Ola» uttales.

Brukeren kan deretter spille av, trimme eller erstatte dette intervallet.

⸻

23. KLIKK PÅ TEKST FOR Å REDIGERE LYD

Dialogeditoren skal vise manusteksten som en aktiv del av lydredigeringen.

Når brukeren klikker på et ord, skal riktig lydintervall kunne markeres automatisk.

Når brukeren markerer flere ord, skal det samlede tidsområdet kunne markeres.

Brukeren skal kunne justere grensene manuelt.

Hvis systemet er usikkert på ordkoblingen, skal det vise dette tydelig.

Automatisk ordkobling skal aldri hindre manuell lydredigering.

⸻

24. AVSPILLING MED KONTEKST

Når brukeren markerer et ord eller en tekstpassasje, skal vedkommende kunne høre området med litt lyd før og etter.

Dette skal gjøre det lettere å høre:

* Ordets begynnelse.
* Ordets avslutning.
* Sammenhengen med nabord.
* Talerytmen.
* Naturlige pauser.
* Om klippgrensene er riktige.


Kontekstlengden skal kunne justeres.

Det skal også være mulig å spille av bare det markerte området.

For ny tekst som ennå ikke har lyd, skal omkringliggende eksisterende dialoglyd kunne spilles av der den finnes.

⸻

25. TEKNISK REFERANSE FOR ORD-SYNKRONISERING

Claude skal undersøke aktuelle løsninger for forced alignment.

Relevante kilder:

WhisperX

https://arxiv.org/abs/2303.00747

https://github.com/m-bain/whisperX

CTC-Segmentation

https://arxiv.org/abs/2007.09127

Montreal Forced Aligner

https://montreal-forced-aligner.readthedocs.io/

Disse referansene er kandidater for vurdering, ikke forhåndsgodkjente teknologivalg.

Claude skal vurdere:

* Norsk bokmål.
* Nynorsk.
* Dialekter.
* Egennavn.
* Utydelig tale.
* Opptak med bakgrunnsstøy.
* Ytelse.
* Kostnad.
* Lisens.
* Integrasjon.


Det skal være mulig å bytte alignment-motor senere uten å måtte skrive om hele lydeditoren.

⸻

DEL G – MANUSENDRINGER OG NYTT LYDBEHOV

26. NY OG ENDRET DIALOG SKAL MARKERES

Hvis brukeren endrer dialogteksten i manuset, skal Animatic Studio kunne identifisere hvilke tekstområder som ikke lenger samsvarer med godkjent lyd.

Ny eller endret dialog skal vises med en egen visuell status.

Systemet skal skille mellom:

Synkronisert tekst

Har godkjent lyd som samsvarer med gjeldende manus.

Ny tekst uten lyd

Har ennå ikke et lydopptak.

Endret tekst med gammel lyd

Teksten er endret, men lydopptaket bygger på en tidligere versjon.

Nytt opptak til gjennomgang

Ny lyd finnes, men er ikke godkjent som aktiv dialog.

Godkjent oppdatert tekst og lyd

Gjeldende dialog og lyd er godkjent som samsvarende.

Status skal kunne vises med farger, men også med andre indikatorer slik at betydningen ikke formidles bare gjennom farge.

Markeringene skal ikke endre hvordan det ordinære filmmanuset eksporteres.

⸻

27. NY SETNING I MANUSET

Brukeren skal kunne legge inn en helt ny setning i en eksisterende replikk.

Eksempel:

Opprinnelig:

«Jeg tror det er noen der ute.»

Endret:

«Jeg tror det er noen der ute. Vi må gå og se.»

Systemet skal kunne oppdage at den siste setningen mangler lyd.

Brukeren skal kunne markere bare:

«Vi må gå og se.»

Deretter skal mikrofonikonet kunne åpne lydopptakspopupen med denne teksten fremhevet.

Popupen skal vise PC-opptak og QR-kode direkte.

Når brukeren har spilt inn setningen, skal systemet foreslå å plassere opptaket etter den eksisterende delen av replikken.

Brukeren skal kunne forhåndshøre komposisjonen før godkjenning.

Det skal ikke være nødvendig å spille inn hele replikken på nytt.

⸻

28. ENDRING AV EKSISTERENDE SETNING

Hvis brukeren erstatter en frase med en annen, skal systemet kunne koble den nye teksten til et nytt lydopptak.

Eksempel:

Tidligere:

«Jeg kommer tilbake i morgen.»

Ny tekst:

«Jeg kommer tilbake i kveld, etter at de andre har gått.»

Systemet skal ikke kreve at den nye frasen varer like lenge som den gamle.

Det nye lydopptaket skal kunne ha naturlig lengde og tempo.

Den gamle lydressursen skal bevares.

⸻

29. AUTOMATISK PLASSERING AV NY LYD

Når en ny lydfil kommer inn fra PC eller mobil, skal systemet kunne bruke tekstkoblingene og den aktive dialogkonteksten til å foreslå riktig plassering.

Dette skal fungere for:

* Erstatning av ett ord.
* Erstatning av flere ord.
* Erstatning av en setning.
* Innsetting av en ny setning.
* Innsetting før eller etter eksisterende dialog.
* Overlapping med eksisterende lyd.


Plasseringen skal kunne redigeres manuelt.

Brukeren skal godkjenne komposisjonen før den tas i bruk som aktiv lydversjon.

⸻

30. NYTT OPPTAK KAN VÆRE LENGRE ELLER KORTERE

Et nytt opptak skal ikke tvinges inn i et gammelt tidsintervall.

Hvis det nye opptaket er lengre, skal den åpne dialogkomposisjonen kunne utvides.

Hvis opptaket er kortere, skal brukeren kunne redusere området eller beholde ønsket pause.

Systemet skal ikke automatisk endre hastigheten eller tonehøyden på stemmen for å få opptaket til å passe.

Brukeren skal kunne justere timing og pauser selv.

⸻

31. ANDRE DIALOGER SKAL IKKE BERØRES

Dette er et absolutt krav.

Når brukeren redigerer én dialog, skal ingen andre dialoger i scenen automatisk påvirkes.

Dette innebærer at:

* Andre replikker ikke flyttes.
* Andre lydklipp ikke strekkes.
* Andre replikker ikke forkortes.
* Andre opptak ikke overskrives.
* Andre dialogers starttidspunkter ikke endres.


Dette gjelder selv om den åpne dialogen blir lengre.

Hvis den nye dialogkomposisjonen overlapper tidsområdet til en annen låst replikk, skal systemet vise en konflikt.

Det skal ikke skjule konflikten gjennom automatisk flytting av andre lydklipp.

Brukeren skal kunne håndtere en slik konflikt separat senere.

⸻

DEL H – VISUELL STYRING AV ORD OG PAUSER

32. PAUSER SKAL KUNNE REDIGERES

Brukeren skal kunne øke eller redusere avstanden mellom ord i en dialog.

Eksempel:

Opprinnelig:

«Jeg tror det.»

Etter redigering:

«Jeg … tror det.»

Dette skal kunne gjøres uten nytt lydopptak.

Selve ordenes lydinnhold skal ikke endres.

Systemet skal i stedet endre plasseringen til relevante lydsegmenter og tiden mellom dem.

⸻

33. DRA TO ORD FRA HVERANDRE

I en egen tidsredigeringsmodus skal brukeren kunne velge to ord og dra dem fra hverandre.

Denne handlingen skal øke pausen mellom ordene.

En visuell endring av avstanden mellom ordene skal gjenspeile endringen i lydens timing.

Brukeren skal også kunne redusere en eksisterende pause.

Systemet må skille tydelig mellom:

* Vanlig markering og redigering av manustekst.
* Tidsredigering av lyd gjennom ordene.


Et normalt forsøk på å markere eller redigere tekst skal ikke utilsiktet endre lydens timing.

⸻

34. DRA FLERE ORD FRA HVERANDRE

Hvis brukeren markerer flere ord og trekker dem fra hverandre, skal avstanden mellom ordene i utvalget økes.

Den ekstra tiden skal som standard fordeles mellom de interne pausene.

Eksempel:

«Jeg tror det.»

Brukeren markerer alle tre ordene og øker den samlede pausetiden med 600 millisekunder.

Som standard legges:

* 300 millisekunder mellom «Jeg» og «tror».
* 300 millisekunder mellom «tror» og «det».


Brukeren skal kunne justere hver pause separat etterpå.

Dette skal fungere for både korte fraser og større tekstutvalg.

⸻

35. VISUELL PAUSEREPRESENTASJON

Lydeditoren skal kunne vise sammenhengen mellom ordavstand og faktisk tid.

En lang pause skal kunne vises som økt visuell avstand mellom ordene i tidsredigeringsmodus.

Dette er en produksjonsvisning.

Manusets vanlige tekst og eksporterte manus skal ikke få ekstra mellomrom eller tegn bare fordi brukeren har økt en lydpause.

Systemet skal skille mellom tekstinnhold og tidsinformasjon.

⸻

36. NATURLIG ROMLYD SOM STANDARD

Når brukeren forlenger en pause mellom ord, skal Animatic Studio som standard forsøke å fylle den ekstra tiden med naturlig romlyd.

Pausen skal ikke automatisk bli fullstendig digital stillhet.

Målet er at den redigerte dialogen skal høres naturlig ut.

Eksempel:

«Jeg … tror det.»

Selv om stemmen stopper et øyeblikk, skal man fortsatt kunne høre den naturlige atmosfæren fra opptaksstedet.

⸻

37. HENT ROMLYD FRA EKSISTERENDE OPPTAK

Systemet skal prioritere romlyd fra samme opptak som dialogen.

Dette vil normalt gi best samsvar i:

* Mikrofonkarakter.
* Akustikk.
* Bakgrunnsstøy.
* Romfølelse.


Programmet skal forsøke å identifisere egnede områder uten tydelig tale.

Det skal unngå partier med:

* Andre ord.
* Uønskede klikk.
* Forstyrrende bevegelser.
* Markerte enkelthendelser.
* Pust som ikke passer.
* Andre uegnede lyder.


Hvis ingen egnede områder finnes, skal systemet kunne varsle brukeren.

⸻

38. SØMLØS ROMLYD

Når en pause blir lengre enn tilgjengelig romlyd, skal programmet kunne sette sammen flere egnede romlydsegmenter.

Bruk fades og crossfades for å redusere merkbare skjøter.

Unngå tydelig repeterende lyder.

Ikke endre selve talens hastighet eller tonehøyde for å skape pausen.

Automatisk romlydfylling skal betraktes som hjelp til redigering, ikke en garanti for sømløst resultat.

⸻

39. BRUKERVALG FOR PAUSEFYLLING

Brukeren skal kunne velge mellom:

Naturlig romlyd

Standardinnstilling.

Digital stillhet

For tilfeller der helt stille pause er ønskelig.

Valgt romlydressurs

Brukeren kan velge en bestemt tilgjengelig romlydfil.

Manuelt redigert pause

Brukeren kan selv bestemme lydinnhold og timing.

Når flere ord trekkes fra hverandre, skal de nyopprettede pausene som standard fylles med naturlig romlyd.

⸻

40. ROMLYD VED SAMMENKLIPPING AV TAKES

Romlyd skal også kunne brukes til å gjøre overganger mellom forskjellige takes mer naturlige.

Hvis et nytt ord eller en setning er tatt opp separat, kan romlyd bidra til å redusere hørbare forskjeller ved klippegrensene.

Brukeren skal kunne forhåndshøre resultatet og justere overgangene.

Systemet skal ikke automatisk anta at romlyden fra forskjellige opptak er akustisk identisk.

⸻

DEL I – AVSPILLING OG FORHÅNDSVISNING

41. AVKRYSNING FOR AUTOMATISK AVSPILLING

I dialogeditoren skal det finnes en avkrysningsboks:

Spill av automatisk etter endring

Når boksen er aktivert, skal programmet automatisk forhåndsspille det relevante området etter en fullført endring.

Dette gjelder blant annet:

* Endring av pauselengde.
* Flytting av ordsegmenter.
* Innsetting av nytt opptak.
* Erstatning av et ord.
* Erstatning av en frase.
* Justering av klippgrenser.
* Endring av romlyd eller overgang.


Når boksen er deaktivert, skal programmet ikke starte avspilling automatisk.

Brukeren skal da starte avspillingen manuelt.

⸻

42. AVSPILLING MED KONTEKST

Når automatisk avspilling er aktivert, skal programmet normalt spille litt lyd før og etter det endrede området.

Dette skal gjøre det enklere å høre:

* Om skjøten fungerer.
* Om pausen høres naturlig ut.
* Om betoningen passer.
* Om romlyden er riktig.
* Om et nytt ord passer sammen med de øvrige ordene.


Kontekstlengden skal kunne justeres.

Automatisk avspilling skal ikke starte mens brukeren fremdeles drar en markør kontinuerlig.

Den bør utløses når en konkret redigeringshandling fullføres.

Nye automatiske avspillinger skal ikke legges oppå tidligere avspillinger.

⸻

DEL J – IKKE-DESTRUKTIV LYDKOMPOSISJON

43. BEVAR ALLE ORIGINALOPPTAK

Alle originale lydfiler og takes skal bevares.

Brukeren skal kunne kombinere og redigere dem uten at originalene endres.

Et nytt lydresultat skal behandles som en komposisjon eller versjon basert på kildematerialet.

⸻

44. REDIGERBAR LYDKOMPOSISJON

Komposisjonen skal kunne beskrive:

* Hvilke kildelydfiler som brukes.
* Hvilke områder av hver fil som brukes.
* Hvor segmentene plasseres.
* Hvilke pauser som er lagt til.
* Hvilken romlyd som brukes.
* Eventuelle overlapp.
* Fades og crossfades.
* Volumjustering.
* Varighet.
* Aktiv versjon.


Programmet skal kunne gjenskape lydresultatet fra komposisjonsdata uten å ødelegge kildene.

⸻

45. LOKALE ENDRINGER

Når brukeren endrer en dialogkomposisjon, skal endringen bare gjelde den aktuelle dialogen.

Andre dialoger og ferdige filmklipp skal beholde sine eksisterende data.

En tidskonflikt skal varsles, ikke løses ved å endre andre ressurser automatisk.

⸻

46. ANGRE OG VERSJONER

Brukeren skal kunne:

* Angre en pauseendring.
* Angre innsetting av nytt opptak.
* Gjenopprette tidligere klippgrenser.
* Bytte mellom takes.
* Gå tilbake til opprinnelig lyd.
* Sammenligne lydkomposisjoner.
* Lagre en ny variant.


Det skal være mulig å eksperimentere uten risiko for å ødelegge originalmaterialet.

⸻

DEL K – EKSPORT AV LYD

47. EKSPORT DIREKTE FRA LYDPOPUPEN

Den samme dialogen som brukes til opptak og lydredigering, skal også ha mulighet for eksport.

Brukeren skal kunne eksportere:

* Hele den ferdige lydkomposisjonen.
* Et valgt tidsområde.
* Et enkelt take.


Eksporten skal ikke kreve en egen større arbeidsflyt.

Det skal være mulig å lagre resultatet lokalt eller registrere det som en ny lydvariant i prosjektets ressursbibliotek.

⸻

48. LYDFORMATER

WAV skal prioriteres som et egnet format for videre profesjonell redigering.

I tillegg skal det tilbys minst ett hensiktsmessig komprimert lydformat for enkel deling.

Eksportinnstillingene skal håndtere relevante egenskaper som:

* Filformat.
* Samplingsfrekvens.
* Kanalkonfigurasjon.
* Filnavn.
* Eksportert tidsområde.


Faktisk formatstøtte skal verifiseres mot valgt teknisk løsning.

⸻

49. BEVAR KOMPOSISJONEN ETTER EKSPORT

Eksport skal ikke gjøre komposisjonen permanent flatet ut i prosjektet.

Brukeren skal fortsatt kunne åpne originalkomposisjonen og redigere:

* Ord.
* Pauser.
* Takes.
* Klippgrenser.
* Romlyd.
* Overganger.


Den eksporterte lydfilen skal være et resultat av komposisjonen, ikke erstatte den redigerbare kilden.

⸻

DEL L – TEKNISK GJENNOMFØRING

50. KONTEKSTBASERTE OPPLASTINGSØKTER

Hver QR-kode skal representere en sikker opplastingsøkt som inneholder nødvendig kontekst.

Den skal kunne knyttes til:

* Prosjekt.
* Ressurs eller midlertidig ressurs.
* Scene.
* Karakter.
* Objekt eller miljø.
* Replikk.
* Medietype.
* Opplastingsøkt.


Mobilnettsiden skal bare få tilgang til den informasjonen og de handlingene som er nødvendige for opplasting.

⸻

51. SIKKERHET

QR-koder og delte lenker må bruke sikre, vanskelig gjettbare tilgangstoken.

Opplastingsrettigheter skal begrenses.

Det må finnes mekanismer for:

* Utløpstid.
* Tilbakekalling.
* Kontroll av filtype.
* Filstørrelsesgrenser.
* Beskyttelse mot uautoriserte opplastinger.
* Begrensning av misbruk.
* Sikker håndtering av opplastede filer.


Ikke gi anonyme bidragsytere direkte skriverettigheter til prosjektets øvrige databaseobjekter.

Alle innkommende filer må registreres på en kontrollert måte.

⸻

52. NETTLESERKOMPATIBILITET

Claude skal undersøke relevante nettleser-API-er og tekniske begrensninger.

Dette omfatter:

* Kameratilgang.
* Mikrofontilgang.
* MediaDevices.
* MediaRecorder.
* Filvalg.
* Web Share API.
* Opplasting av store filer.
* Sanntidskommunikasjon.
* Lokal midlertidig lagring.
* HTTPS-krav.
* iPhone- og Android-kompatibilitet.


Løsningen skal respektere brukerens samtykke og operativsystemets rettighetsmodell.

Ikke anta at kamera eller mikrofon kan brukes automatisk uten nødvendig tillatelse.

⸻

53. EGEN ANALYSETJENESTE FOR ORD-TIL-LYD

Forced alignment skal behandles som en separat analysetjeneste.

Lydeditoren skal ikke være låst til én bestemt modell eller leverandør.

Et alignment-resultat skal kunne inneholde:

* Lydressurs-ID.
* Replikk-ID.
* Manusversjon.
* Ordidentitet.
* Ordtekst.
* Starttid.
* Sluttid.
* Usikkerhetsinformasjon der tilgjengelig.
* Manuelle overstyringer.
* Analysemodell.
* Modellversjon.


Et nytt opptak skal kunne analyseres uten at alle andre eksisterende lydopptak må analyseres på nytt.

Hvis automatisk analyse mislykkes, skal manuell redigering fortsatt fungere.

⸻

54. LYDMOTOR FOR KOMPOSISJON

Systemet skal ha en teknisk løsning for tidsnøyaktig forhåndsavspilling og eksport av lydkomposisjoner.

Motoren må kunne håndtere:

* Flere kildelydfiler.
* Trim.
* Klippgrenser.
* Innsetting.
* Overlapp.
* Volum.
* Fades.
* Crossfades.
* Romlyd.
* Pauser.
* Forskjellig opptaksvarighet.


Forhåndsavspilling og eksport bør benytte samme komposisjonsbeskrivelse, slik at eksportresultatet samsvarer med det brukeren har hørt.

⸻

55. YTELSE OG PÅLITELIGHET

Løsningen skal kunne håndtere flere samtidige mobilopplastinger.

Store videofiler må håndteres uten at hele applikasjonen blir ustabil.

Lydeditoren skal kunne arbeide responsivt med bølgeformer og tekstmarkering.

Opplastinger skal ikke opprette utilsiktede duplikater ved gjentatte forsøk.

Brukergrensesnittet skal ha tydelige feil- og statusmeldinger.

⸻

DEL M – TESTING OG AKSEPTANSEKRITERIER

56. MOBILIMPORT

Funksjonen skal testes mot følgende scenarier:

M1. Brukeren åpner mobilimport fra prosjektsiden og ser QR-koden uten ekstra klikk.

M2. Brukeren skanner QR-koden og åpner riktig mobilnettside.

M3. Brukeren tar flere bilder etter hverandre uten å bekrefte hver opplasting.

M4. Bildene blir automatisk registrert i prosjektets mobilimportbibliotek.

M5. Brukeren importerer et eksisterende bilde fra telefonens bildebibliotek.

M6. Brukeren tar opp eller velger en video og laster den opp.

M7. Opplastede filer vises på datamaskinen uten manuell oppfriskning.

M8. En feil under opplasting håndteres uten utilsiktede duplikater.

⸻

57. KONTEKSTSTYRT RESSURSIMPORT

K1. Brukeren åpner Maja og klikker kameraikonet.

K2. QR-koden vises umiddelbart.

K3. Bildet fra mobilen blir tilgjengelig i Majas åpne dialog.

K4. Brukeren oppretter en ny karakter og importerer bilder før karakteren lagres.

K5. Bildene knyttes korrekt når karakteren lagres.

K6. Import til objekt, miljø eller scene plasseres i riktig kontekst.

K7. Nytt materiale erstatter ikke eksisterende godkjente ressurser automatisk.

⸻

58. DELING

D1. Brukeren åpner mobilnettsiden og trykker «Del lenke».

D2. Mobilens delingsfunksjon åpnes når denne er tilgjengelig.

D3. Lenken kan kopieres når direkte deling ikke er tilgjengelig.

D4. Mottakeren kan åpne opplastingssiden uten full prosjektkonto.

D5. Mottakeren kan ikke åpne manus eller prosjektinnstillinger gjennom lenken.

D6. En tilbakekalt lenke kan ikke brukes til nye opplastinger.

⸻

59. LYDOPPTAK

L1. Mikrofonpopupen viser PC-opptak og QR-kode samtidig.

L2. Brukeren kan starte PC-opptak uten ekstra valg av opptaksmetode.

L3. Mobilen viser dialogteksten og opptakskontrollene.

L4. Brukeren kan ta opp Take 01 og Take 02.

L5. Brukeren kan høre begge før opplasting.

L6. Brukeren kan velge å laste opp bare Take 01.

L7. Brukeren kan velge å laste opp begge.

L8. Et nytt take sletter ikke tidligere takes.

⸻

60. INTELLIGENT DIALOGREDIGERING

T1. Brukeren klikker på ett ord og får markert riktig lydområde.

T2. Brukeren markerer to ord og får markert et samlet område.

T3. Brukeren markerer en hel setning og kan høre den med kontekst.

T4. Ny tekst uten lyd får en egen statusmarkering.

T5. Endret tekst med eldre lyd får en egen statusmarkering.

T6. Brukeren spiller inn bare den nye setningen og plasserer den i riktig sammenheng.

T7. Et opptak kan være lengre enn det tidligere lydområdet.

T8. Et opptak kan være kortere enn det tidligere lydområdet.

T9. Brukeren kan erstatte bare ett ord.

T10. Brukeren kan sette ny lyd før, over eller etter eksisterende lyd.

⸻

61. PAUSER OG ROMLYD

P1. Brukeren øker avstanden mellom to ord.

P2. Ordenes opprinnelige lydinnhold bevares.

P3. Flere markerte ord kan trekkes fra hverandre.

P4. Ekstra pausetid fordeles som standard mellom de interne ordmellomrommene.

P5. Pausene kan justeres individuelt.

P6. Nye pauser fylles som standard med naturlig romlyd.

P7. Brukeren kan velge digital stillhet i stedet.

P8. Brukeren kan forhåndshøre resultatet.

P9. Andre dialoger i scenen beholder sine opprinnelige lyddata og tidsposisjoner.

⸻

62. AUTOMATISK AVSPILLING OG EKSPORT

E1. Brukeren kan aktivere «Spill av automatisk etter endring».

E2. Endret område spilles av med kontekst etter fullført redigering.

E3. Når innstillingen er deaktivert, starter ikke avspilling automatisk.

E4. Brukeren kan eksportere hele komposisjonen.

E5. Brukeren kan eksportere et valgt område.

E6. Brukeren kan eksportere et enkelt take.

E7. Originalfilene og den redigerbare komposisjonen bevares etter eksport.

⸻

DEL N – STATUS FOR ÅPNE VALG

Følgende er ikke endelig avklart av brukeren og skal ikke fremstilles som vedtatte funksjoner:

N1. Innsyn mellom eksterne bidragsytere

Det er bestemt at om en person som mottar en delt lenke, skal ikke kunne se bilder og lydopptak som andre har sendt inn gjennom samme lenke.

N2. Egen innspilling av ren romlyd

Det er foreslått at brukeren også skal kunne ta opp noen sekunder med ren romlyd på PC eller mobil.

Dette kan bli nyttig ved dialogredigering og sammenklipping av takes, nyttig, men om dette er vanskelig dropper vi det. 

Automatisk bruk av egnet romlyd fra eksisterende opptak er derimot et bekreftet krav.

N3. Konkrete teknologivalg

Det er ikke valgt en endelig forced-alignment-motor, lydmotor eller opplastingsarkitektur.

Disse skal vurderes gjennom teknisk dokumentasjon og praktiske tester.

⸻

DEL O – INSTRUKSJON TIL CLAUDE

Du skal bruke dette dokumentet som samlet spesifikasjon for den nye funksjonsgruppen i Animatic Studio fase 2.

O1. Ikke mist detaljer

Alle bekreftede brukerkrav skal bevares.

Ikke erstatt kravene med en generisk filopplaster eller en enkel lydopptaker.

O2. Ikke gjenta tidligere utviklingsarbeid

Eksisterende arkitektur, hovedspesifikasjon, designbibliotek og andre ferdigstilte moduler skal ikke defineres på nytt.

Du skal bare kartlegge integrasjonspunktene for denne nye funksjonsgruppen.

O3. Opprett sporbare krav

Registrer nye krav i det eksisterende kravregisteret.

Knytt kravene til kildekapitlene i dette dokumentet.

Ikke endre tidligere produktbeslutninger uten eksplisitt avklaring.

O4. Lag en implementeringsplan

Del den nye funksjonsgruppen inn i gjennomførbare arbeidspakker:

1. QR-basert mobilimport og sikker opplastingsøkt.
2. Kontekststyrt bilde- og videoimport.
3. Deling via mobilnettsidens native delingsfunksjon.
4. Opptak av lyd fra PC og mobil.
5. Flere takes og forhåndslytting.
6. Integrert lydkomposisjonseditor.
7. Automatisk tekst-til-lyd-alignment.
8. Ord- og setningsbasert lydredigering.
9. Visuell pausestyring med naturlig romlyd.
10. Forhåndsavspilling, eksport og regresjonstesting.


Arbeidspakkene skal integreres med eksisterende systemer, ikke kopiere dem.

O5. Prioriter sluttbrukeropplevelsen

Arbeidsflyten skal være rask og intuitiv.

Brukeren skal kunne:

* Trykke kameraikonet.
* Se QR-koden direkte.
* Ta et bilde.
* Finne bildet på riktig sted.


Og tilsvarende:

* Trykke mikrofonikonet.
* Se QR-koden og PC-opptak direkte.
* Spille inn en replikk.
* Høre flere takes.
* Markere et ord.
* Bytte ordet.
* Justere pausen.
* Forhåndshøre resultatet.
* Eksportere komposisjonen.


O6. Beskytt eksisterende materiale

Ikke overskriv originale bilder, lydfiler eller tidligere takes.

Ikke flytt andre dialoger som følge av redigering i én dialog.

Ikke endre ferdige filmklipp automatisk.

O7. Vær presis om tekniske begrensninger

Skill mellom:

* Krav som er teknisk enkle.
* Funksjoner som krever avansert lydbehandling.
* Funksjoner som krever bakgrunnstjenester.
* Funksjoner som må verifiseres mot iPhone, Android og vanlige nettlesere.
* Funksjoner med usikker automatisk presisjon.


Ikke lov sømløs lydredigering i tilfeller der opptakene har tydelige akustiske forskjeller.

O8. Start med en konkret utviklingsplan

Før implementering skal du analysere dette dokumentet, identifisere nødvendige integrasjonspunkter og foreslå en gjennomføringsrekkefølge.

Deretter skal du kunne produsere presise, små Lovable-instruksjoner for hver arbeidspakke.

⸻

ENDELIG PRODUKTMÅL FOR DENNE FUNKSJONSGRUPPEN

Animatic Studio skal gi brukeren en rask forbindelse mellom datamaskin, mobiltelefon, kamera, mikrofon og ressursbibliotek.

Brukeren skal kunne hente bilder og video direkte inn i prosjektet, ta opp lyd fra PC eller mobil, invitere andre til å bidra, og deretter redigere dialog gjennom selve manusteksten.

Man skal kunne erstatte ett enkelt ord, legge inn en ny setning, forlenge pauser mellom flere ord og bevare naturlig romlyd – alt uten å ødelegge tidligere opptak eller påvirke andre dialoger.

Målet er at innsamling og redigering av medieressurser skal oppleves som én sammenhengende, intuitiv arbeidsflyt i Animatic Studio.
