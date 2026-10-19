# ANIMATIC STUDIO – FASE 3: CHARACTER ANIMATION STUDIO & DIRECTOR'S RHYTHM ENGINE
Konsolidert kravspesifikasjon fra Øystein (19.10.2026). Den erstatter alle tidligere delprompter i denne runden. Bygger på sceneeditor, Asset Studio, bildevarianter, lydredigering, QR-mobilimport, ressursbiblioteker, flerbrukersamarbeid og filmeksport. Ikke lag konkurrerende systemer der eksisterende komponenter kan utvides.

DEL 1 – MÅL
§1 Avansert, men intuitivt miljø for å animere en karakter eller et objekt med stillbilder og minianimasjoner. Brukeren skal kunne:
- se alle bildene i scenen;
- styre visningen frame for frame;
- bruke flere vinkler av samme karakter;
- se og høre dialogen;
- generere leppebevegelser automatisk fra tale;
- lage egne munnformer;
- blinke automatisk eller manuelt, med venstre og høyre øye hver for seg;
- lage egne bildeoverlegg (piperøyk);
- lage repeterende og seed-baserte mønstre;
- gjenbruke dette på tvers av scener og prosjekter;
- velge hvilke animasjoner som tas med i eksporten;
- endre rytmen med et oransje tidsverktøy.
Automatikk og presis manuell kontroll skal kunne kombineres.
§2 Prinsipper:
1. Framepresis tid.
2. Ikke-destruktivt.
3. Stabil ressursidentitet.
4. Skille mellom ressurs, oppsett og forekomst.
5. Forhåndsvisning og eksport gir samme resultat.
6. Eksplisitt beslutning før andre scener oppdateres.
7. Full angring.
8. Gjenbruk av eksisterende funksjoner.
9. Samspill med flerbruker- og versjoneringssystemet.
10. Høy kontroll med få klikk.

DEL 2 – ARKFANE
§3 Sceneeditoren får fanene «Scene» (dagens visning) og «Animasjon». Begge bruker de samme scenedataene, og bytte av fane gir ikke tap av endringer.
§4 Animasjonsfanen er én integrert arbeidsflate, ikke separate editorer. Den inneholder:
- stor lagvis tidslinje som hovedområde;
- lagnavn og miniatyrbilder til venstre;
- forhåndsvisning til høyre;
- avspilling, tidsnavigasjon og zoom;
- lydspor nederst;
- automatiske og egendefinerte lag;
- oransje rytmeverktøy øverst.
§5 Forhåndsvisningen kan zoome, få valgt zoomnivå, panorere, vise ansikt og overlegg i detalj, og spille av. Kanten mot tidslinjen kan dras. Zoom og panorering endrer ikke transformasjonen i scenen.

DEL 3 – TIDSLINJE
§6 Prosjektets frame-rate. Viser hele scenen, intervaller og enkeltframes, framepresist.
§7 Vertikalt avspillingshode: kan dras, klikk hopper dit, og man kan gå én frame frem eller tilbake. Forhåndsvisningen følger hodet.
§8 Spill av blir til Stopp. Samme intervall kan spilles om igjen under redigering.
§9 Zoom fra hele scenen til enkeltframes. Kompakt navigator i stil med After Effects. Navigatoren hører ikke til rytmeverktøyet, og det finnes ingen rytmeslider.
§10 Avspillingsområde med start- og sluttmarkører som kan justeres visuelt. Bare intervallet spilles, også i løkke.

DEL 4 – BILDELAG
§11 Alle bilder karakteren eller objektet bruker i scenen, vises lagvis. Hvert lag har navn, miniatyrbilde og segmenter. Musepekeren over gir en større visning.
§12 Ett frame vises som et lite kvadrat. Bilder over flere frames gir bredere segmenter. Plassering og varighet kan justeres.
§13 Varianter (forfra, side, bakfra, positurer, uttrykk, opplastet eller generert) har samme ressursidentitet. Maja forfra, side, bakfra og forfra igjen skal ikke kreve fire ressurser.
§14 Bildehendelser kan legges inn, flyttes, få endret varighet, erstattes, kopieres og fjernes, og angres. Fjerning sletter ikke grunnressursen.
§15 Bildebytter fungerer med posisjon, skalering, rotasjon, transparens, keyframes og easing, uten å nullstille transformasjonen.

DEL 5 – LYD
§16 Karakterens dialogopptak nederst, som fylte segmenter med start, varighet, kobling til replikken og opptakets identitet. Synkron avspilling.
§17 Godkjente opptak fra de eksisterende lydfunksjonene brukes, uten nytt opptak. Opplasting, takes, mobil- og PC-opptak og lydredigering nås via eksisterende integrasjoner.
§18 Leppesynk bruker take-en som er valgt for scenen. Når valget endres, kan leppesynk oppdateres.

DEL 6 – LEPPESYNK
§19 Eget leppesynklag over dialogsporet. Uten oppsett står det en knapp på plassen til lagnavnet. Oppsettet åpnes igjen fra samme sted.
§20 Popupen viser bildet. Brukeren kan zoome, panorere og markere hode, munn, nese, venstre øye og høyre øye. Manuell markering er alltid mulig. Automatiske forslag kan overstyres.
§21 Eget sett med munnbilder. Systemet viser hvilke munnformer motoren trenger. Per munnform:
- eksempel;
- opplasting, eller generering eller variant med eksisterende verktøy;
- plassering over munnregionen;
- størrelse, rotasjon og finjustering.
Stiliserte og tegnede figurer støttes.
§22 Nedlastbart tegneark med hver form og eksempel, i samsvar med motorens visemsett.
§23 QR-mobilimport fra munnformeditoren. Mobilen vet karakter eller objekt, variant, manglende munnform, prosjekt og ressurs. Mobilen viser en referanse, og brukeren kan fotografere eller velge et bilde.
§24 På mobilen: zoom, rotasjon, flytting, tilpasning til ramme og forhåndsvisning. Opplastingen må godkjennes eksplisitt (i motsetning til den automatiske hurtigimporten).
§25 Godkjent bilde vises i PC-editoren uten oppfriskning, koblet til riktig munnform, og kan finjusteres.
§26 Ikke-destruktiv maskering med pensel som pusser bort og legger tilbake. Ingen piksler går tapt.
§27 Justering med normalisering mot underliggende bilde, kontrast, hue, saturation og mer, med forhåndsvisning.
§28 OK lukker detaljkontrollene. Plassering, størrelse og rotasjon kan fortsatt endres. «Rediger» åpner maskering og korrigering igjen.
§29 Automatisk leppesynk fra valgt dialoglyd og manusinformasjon, synlig og redigerbar i tidslinjen.
§30 Rhubarb Lip Sync er primærkandidat (github.com/DanielSWolf/rhubarb-lip-sync, OpenToonz-integrasjon) og gir tidsstemplede visemer. Undersøk:
- MIT-lisensen og avhengigheter;
- integrasjon;
- norsk tale og dialekter;
- kvalitet ved ulike lydforhold;
- manus som støtte;
- konvertering til framer;
- overstyringer;
- reanalyse når take-valget endres.
Ikke anta at manustekst alene gir presis fonemtiming.
§31 Munnformsettet er varig og trenger ingen nye tegninger når dialogen endres. Leppesynk regenereres fra oppdatert lyd. Endres teksten uten nytt opptak, vises det at synken må gjennomgås.
§32 Manuelle rettelser er redigerbare og ikke-destruktive. Ny analyse håndterer dem kontrollert og overskriver dem aldri i stillhet.
§33 Ett segment per replikk. Klikk slår av leppesynk for den replikken (indre monolog, tankestemme, voice-over). Brukeren bestemmer, og lyden blir værende.

DEL 7 – BLINKING
§34 Eget lag over leppesynk, automatisk og manuelt.
§35 Automatisk blinking av/på. Brukeren kan legge til, fjerne eller undertrykke blink og endre timing, uten å tegne bildet på nytt.
§36 Popup fra lagnavnet: venstre og høyre øye hver for seg, med egen tidslinje og egne innstillinger.
§37 Et blink kan strekkes eller forkortes. Kort segment er et blink, langt segment er et lukket øye.
§38 Egne bilder eller masker for åpne og lukkede øyne, relativt til øyeregionen. Maskering og ikke-destruktiv redigering som for munnformene.

DEL 8 – OVERLEGG
§39 Egne lag med bilder over grunnbildet (røyk fra pipe), ikke bare munn og øyne.
§40 Overlegget kan være større enn grunnbildet og beskjæres ikke.
§41 Grunnbildet beholder størrelse, posisjon, rotasjon og transformasjoner. Overlegget har egne transformasjonsdata.
§42 Ett bilde, sekvens, mellomrom, overlapp eller gjentagelser. Varighet og avstand kan redigeres.
§43 Maskering og gjenoppretting, posisjon, skalering, rotasjon, kontrast, hue, saturation og blending, alt ikke-destruktivt.
§44 Intensitet per bilde og globalt for laget.

DEL 9 – GJENBRUKBARE MINIANIMASJONER
§45 Oppsettene lagres varig per bildevariant: munnformsett, leppesynkregler, blinkebilder og -mønstre, overlegg og røyk, masker, ankerpunkter, lagrekkefølge, loop, intensitet og andre regler.
§46 Ved bildebytte blir den nye variantens oppsett tilgjengelig automatisk (front-sett, profil-sett, front-sett igjen), uten manuell aktivering.
§47 Et oppsett tegnes bare på sin egen variant, med mindre brukeren eksplisitt har valgt noe annet. Front-munner blir ikke hengende igjen på profilen. Lyden følger tidslinjen.
§48 Ankerpunkter per variant: hode, munn, nese, øyne og egne punkter. Koordinatene er relative, så alt følger bildet ved flytting, rotasjon og skalering i andre scener.
§49 Oppsettet følger ressursen, men kan slås av per scene uten global effekt.
§50 Å slå av er ikke å slette. Det kan slås på igjen. Permanent sletting er en egen handling med advarsel.
§51 Systemet finner andre scener med samme variant og spør: «Dette bildet brukes i fem andre scener. Vil du gjøre det nye animasjonsoppsettet tilgjengelig eller aktivere det også der?» Ingenting skjer automatisk, og et nei sletter ingenting.
§52 Ved deling via det globale biblioteket følger med: varianter, munnformsett per bilde, øyebilder, blinkemønstre, overlegg, ankerpunkter, masker, justeringer, loopregler, frekvens, lagrekkefølge, mønsterfarger, seed og standardinnstillinger. Ingenting må bygges opp på nytt.
§53 En global oppdatering endrer ikke godkjente scener eller filmer. Forekomster beholder versjonen sin, og brukeren velger aktivt en nyere.

DEL 10 – MINI ANIMATION PATTERN STUDIO
§54 Grafeditor for hendelser, varighet, tidsavstand, frekvens, løkke, repetisjon, lagrekkefølge og deterministisk variasjon. Tid horisontalt, hendelses- eller intensitetsverdier vertikalt. Hendelsene redigeres visuelt.
§55 Øynene har uavhengige mønstre med egen frekvens, varighet, avstand, start, loop, seed og variasjon. Et felles mønster for begge er også mulig.
§56 Grafeditoren brukes også på overleggslag (røyk med ulike varigheter og intensiteter, rekkefølge og mellomrom).
§57 Lagrekkefølgen, foran eller bak, lagres som standard og kan overstyres lokalt.
§58 Mønster med definert varighet (8 s med 3 blink), som kan gjentas.
§59 Kontinuerlig, med mellomrom, et antall ganger, én gang, eller mellom start og stopp. Loopvarighet og tid mellom repetisjoner er separate innstillinger.
§60 Flere mønstre per lag (rolig, nervøs, trøtt, blunk, svak eller kraftig røyk), og brukeren velger per scene.
§61 Mønstre har navn og farge og kan redigeres, lagres og gjenbrukes. Fargen er bare en markør, ikke en filmfarge.
§62 Navngitte mønstre plasseres på tidsområder («Rolig», «Nervøs», «Rolig») som fargede segmenter.
§63 Seed-basert, deterministisk variasjon (seed 18427). Samme seed og innstillinger gir samme resultat i forhåndsvisning, ny avspilling, etter gjenåpning, ved eksport og ved ny rendering.
§64 Brukeren velger hva som varieres: avstand, varighet, forskyvning mellom øynene, pause, valg mellom varianter, timing og intensitet. Låste egenskaper varieres ikke.
§65 Min- og maksgrenser (intervall 3–8 s, varighet 3–7 frames). Seed bestemmer rekkefølgen innenfor grensene.
§66 Algoritmen er stabil på tvers av oppfriskning og maskiner. Gamle prosjekter beholder resultatet sitt om algoritmen endres.
§67 Karakteren har et standard-seed. Forekomsten kan overstyre lokalt uten å påvirke andre scener.

DEL 11 – KARAKTERATFERD
§68 Standardatferd per karakter: nervøse eller langsomme blink, ulik oppførsel per øye, effektmønstre, intensitet, loopfrekvens og seed. Atferden følger karakteren, også globalt.
§69 Kan overstyres i én scene uten at den globale standarden endres.
§70 Tre nivåer: enkelthendelse, mønster og karakteratferd. Hvert overstyres på riktig nivå uten utilsiktet global effekt.

DEL 12 – ORANSJE RYTMEVERKTØY (Director's Rhythm Engine)
§71 Svært rask justering av rytmen. Tid forskyves eller fordeles proporsjonalt på tvers av spor uten at synken ødelegges. Testes med løkke og angring.
§72 Varmt oransje rytmelag øverst som dekker hele scenen. Sonen går fra skjæringspunktet til scenens slutt.
§73 Aktiv mens Cmd holdes (Mac), og tilsvarende tast, i utgangspunktet Ctrl, på Windows hvis det ikke gir uakseptable konflikter. Ingen knapp.
§74 Med tasten holdt følger sonens venstre kant musepekeren til slutten av scenen. Bare forhåndsvisning, ingen endring før brukeren bevisst drar.
§75 Klikkpunktet er skjæringspunktet og låses under draget. Det kan dras til høyre og venstre.
§76 Klipp som startet før skjæringspunktet, er helt uendret, selv om de går inn i sonen. Gjelder bilder, dialog, lyd, animasjonssegmenter og andre tidsobjekter. De flyttes, trimmes og strekkes ikke, og keyframes og lydinnhold endres ikke.
§77 Uten Shift forskyves alle kvalifiserte hendelser fra skjæringspunktet samlet. Innbyrdes timing bevares, og sporene behandles ikke uavhengig.
§78 Med Shift fordeles tid proporsjonalt på mellomrommene i den felles strukturen. Komprimering skjer innenfor gyldige grenser. Medier strekkes ikke.
§79 Alle inkluderte spor er én kronologisk komposisjon. Det som er synkronisert, forblir synkronisert (replikkstart og bildebytte). Ingen beregning per spor.
§80 Verktøyet kjenner igjen redigerbare mellomrom, låste intervaller, beskyttede klipp, koblinger og ulovlige overlapp. Komprimering stopper ved siste gyldige tilstand. Ingen overlappende dialog og ingen skjulte destruktive endringer.
§81 Manuelle lag kan tas med. Automatiske og løkkebaserte lag (blinking, leppesynk, løkker, prosedyriske lag) er utelatt som standard.
§82 I rytmemodus vises en kolonne med avkrysningsbokser til høyre for lagene, utenfor scenens slutt, med oransje kobling. Skjult ellers.
§83 Oransje overdekning med cirka 12 % opasitet over de inkluderte lagene. Utelatte lag får ingen markering.
§84 Uberørte elementer i eller foran sonen (klipp som startet før, utelatte spor, beskyttede hendelser) får 50 % sort overdekning. Bare redigeringsvisning, eksporteres ikke.
§85 Mellomromstall vises. I Shift-modus vises alle relevante mellomrom i sonen. Tallene er små og hvite med sort omriss, står på riktig spor foran elementet, helst midt i mellomrommet, og har høyest prioritet, også over annet innhold.
§86 Null frames gir ikke noe tall (aldri «0 f»).
§87 Under ett sekund vises frames («7 f», «18 f»). Fra ett sekund vises sekunder og frames («1 s 04 f», «2 s 12 f»). Prosjektets frame-rate brukes.
§88 Under draget vises reell tillatt endring med sort tekst midt i toppfeltet («+ 14 f», «− 1 s 06 f»).
§89 Til høyre: «Ny scenetid: 00:43:12» (mm:ss:ff), uten timefelt. Minuttfeltet kan få flere siffer over 59 minutter.
§90 Endring, varighet, mellomrom, sone og posisjoner oppdateres i sanntid.
§91 Gul linje på sonens venstre kant mens museknappen holdes. Den markerer det eksakte skjæringspunktet.
§92 Musepekeren skjules under draget og kommer tilbake ved slutt, avbrudd eller tap av fokus. Aldri permanent skjult.
§93 Midlertidig gul markør i toppfeltet ved klikkpunktet. Tidligere markører blir stående og blekner gradvis, den nyeste er tydeligst. De eksporteres ikke og lagres ikke permanent.
§94 Horisontalt drag gir rask justering: høyre legger til eller forskyver senere, venstre fjerner eller forskyver tidligere.
§95 Rett opp gir +1 frame per trinn, rett ned −1 frame. En faktisk tidsjustering, ikke følsomhet.
§96 Skrått drag kombinerer og gir langsommere og mer presis justering, med naturlig overgang fra grov til fin. Ingen dobbelttelling og ingen hopp.
§97 Ingen rytmeslider. Vanlig navigator og zoom beholdes.
§98 Hvert fullført drag er én angring, som gjenoppretter posisjoner, mellomrom, koblinger og total varighet. Et avbrutt drag etterlater ingen delvise endringer.
§99 Arbeidsflyt: kort område, løkke, juster, se og hør, angre, prøv igjen.

DEL 13 – SAMSPILL
§100 Leppesynk er avhengig av replikklyden og følger lydstarten når den flyttes. Ikke et uavhengig manuelt spor.
§101 Blinking, røyk og genererte animasjoner er utelatt fra forskyvningen og beregnes på nytt fra mønster, tidsankre og seed. Determinismen bevares.
§102 Manuelle overstyringer på automatiske lag er knyttet enten til et tidsanker eller til en absolutt frame (tydelig modell). Regenerering sletter dem aldri i stillhet.

DEL 14 – EKSPORT
§103 Velg «Alle valgfrie animasjonslag» eller «Ingen valgfrie animasjonslag».
§104 Deretter unntak per lag: leppesynk, automatisk blinking, manuelle blink, overlegg, løkker og andre valgfrie animasjoner.
§105 Eksportvalg sletter eller slår ikke av noe permanent.
§106 Eksporten bruker samme framepresise modell og data som forhåndsvisningen. Samme seed og innstillinger gir identisk resultat.

DEL 15 – DATASTRUKTUR
§107 Nivåer:
- karakter eller objekt (identitet);
- bildevariant;
- animasjonsoppsett (munnformer, blink, overlegg, masker og regler per variant);
- mønsterdefinisjon;
- sceneforekomst;
- lokal overstyring;
- genererte hendelser (frameposisjoner fra lyd, regler, mønster og seed).
§108 Ressursen eier mulighetene, og scenen bestemmer bruken. Et munnformsett er ikke det samme som munnbevegelsene i en replikk, og et blinkemønster er ikke det samme som de konkrete blinkene.
§109 Maskering, farge, plassering og konfigurasjon er ikke-destruktive. Originaler overskrives aldri uten godkjenning.
§110 Andre scener oppdateres ikke uten tydelig valg og kan beholde gamle versjoner.
§111 Eksisterende flerbruker- og vindusstøtte brukes. Aldri stille overskriving.
§112 Gjengivelsen er konsistent i tidslinje, isolert visning, hele-scenen-visning og eksport. Samme visemer, blinketider og plassering av overlegg.

DEL 16 – AKSEPTANSETESTER
§113 Fane:
- fanene «Scene» og «Animasjon»;
- zoom til frame;
- hodet kan klikkes og dras;
- frame frem og tilbake;
- Spill av blir Stopp;
- forhåndsvisningen kan zoome, panorere og endre bredde;
- navigatoren virker innzoomet;
- avspillingsområde i løkke.
§114 Varianter:
- alle varianter vises på tidslinjen;
- navn og miniatyrbilde;
- musepekeren over gir større bilde;
- ett frame er et kvadrat, og lengre segmenter er bredere;
- bytter nullstiller ikke andre egenskaper.
§115 Leppesynk:
- knappen åpner editoren;
- markering av ansiktsområder;
- munnformene vises;
- tegnearket kan lastes ned;
- egne munnformer kan importeres;
- QR-import kobles til riktig form;
- mobilen har zoom, rotasjon og plassering;
- bildet dukker opp på PC-en;
- maskering pusser bort og legger tilbake;
- normalisering, kontrast, hue og saturation virker;
- etter OK kan plassering og rotasjon fortsatt endres;
- detaljredigering kan åpnes igjen;
- riktig godkjent lyd brukes;
- leppesynk kan slås av per replikk uten at lyden forsvinner;
- settet gjenbrukes etter manusendring.
§116 Blinking:
- av/på;
- venstre og høyre øye hver for seg;
- legge til og fjerne;
- forlenge til lukket øye;
- øynene følger transformasjonen.
§117 Overlegg:
- røyk;
- større enn grunnbildet;
- grunnbildet er uendret;
- sekvens;
- avstand og varighet kan redigeres;
- løkkeregler;
- startpunktet kan flyttes;
- maskering;
- intensitet per bilde og globalt.
§118 Mønstre:
- flere navngitte;
- farge;
- ulike mønstre per øye;
- frekvens og varighet uavhengig;
- loopvarighet og intervall;
- aktivering i et intervall;
- numerisk seed;
- samme seed gir samme resultat ved avspilling og eksport.
§119 Global gjenbruk:
- oppsettet følger varianten;
- automatisk valg av munnformsett ved bytte;
- avslåing per scene;
- kan slås på igjen;
- det globale biblioteket lagrer varianter med minianimasjoner;
- en annen produksjon bruker dem uten å bygge på nytt;
- global endring krever godkjenning for eldre scener.
§120 Rytme:
- Cmd og tilsvarende Windows-tast;
- kanten følger musepekeren;
- klikk setter skjæringspunktet;
- klipp som startet før, er uendret;
- berørte og uberørte er visuelt ulike;
- 50 % sort på uberørte;
- avkrysningsbokser bare i modus;
- automatiske lag utelatt som standard;
- Shift gir proporsjonal fordeling;
- én synkron komposisjon;
- ingen «0 f»;
- små hvite tall med sort omriss som kan dekke annet innhold;
- endringen vises i toppfeltet;
- ny varighet uten timefelt;
- gul linje mens knappen holdes;
- musepekeren skjules og kommer tilbake;
- gule markører som blekner;
- opp gir +1 frame, ned gir −1 frame, skrått gir finere justering;
- ingen slider;
- ett drag er én angring;
- et avbrutt drag lagrer ingenting;
- løkke virker sammen med rytmejustering.

DEL 17 – IKKE BESLUTTET
- A. Om et nytt mønster starter fra første frame eller fortsetter i kontinuerlig fase (regelen må være deterministisk).
- B. Endelig leppesynkmotor (Rhubarb må verifiseres for norsk).
- C. Responskurven for musebevegelse (framepresis og reversibel).
- D. Konflikter mellom låste hendelser og synkronisering (feil hindres, grensesnittet må planlegges).
- E. Algoritmen for automatisk blinking (ingen fordeling er vedtatt).
Skal ikke redusere omfanget.

DEL 18 – MANDAT
§121 Kartlegg sceneeditor, tidslinje og keyframes, karakter- og objektmodell, varianter, Asset Studio, lyd og dialogkoblinger, QR-import, globalt bibliotek, animasjons- og eksportmotor, flerbruker og versjonering og angring. Ikke bygg om det som fungerer.
§122 Én felles modell for framehendelser, minianimasjoner, mønstre, seed-genererte hendelser, overstyringer, ressursversjoner og avhengigheter mellom lyd, bilde og animasjon.
§123 Rekkefølge:
1. Fane.
2. Tidslinje og avspilling.
3. Forhåndsvisning.
4. Varianter og lyd.
5. Modell for minianimasjoner og ankerpunkter.
6. Munnformeditor.
7. QR-import av munnformer.
8. Maskering og justering.
9. Leppesynk.
10. Blinking.
11. Overlegg og løkker.
12. Grafeditor og mønstre.
13. Seed.
14. Global gjenbruk og versjonering.
15. Rytmeverktøyet.
16. Eksportvalg.
17. Regresjonstest.
Kan justeres etter avhengigheter.
§124 Ikke forenkle til en lip-sync-knapp, en blinkebryter, en vanlig ripple-edit, et ordinært lagpanel eller GIF-aktige løkker.
§125 En karakter gjøres klar til animasjon én gang og brukes overalt, med framepresis kontroll over detaljer og rytme. Alle oppsett følger varianten som del av en gjenbrukbar ressurs. Rytmefunksjonen gir en unik, rask og informativ måte å justere timing på.
