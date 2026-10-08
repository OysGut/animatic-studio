# Interaksjonsmønstre – Animatic Studio

**Status: Teknisk anbefaling – foreløpig.** Mønstrene beskriver hvordan mandatets krav oppleves i UI. De oppretter ikke nye krav.

## 1. Tidslinje

### 1.1 Tid og avspillingshode
- All posisjon er heltall bilder (ADR-0006). UI viser tidskode `HH:MM:SS:FF` etter produksjonens bildefrekvens; aldri flyttall-sekunder i state.
- Avspillingshodet er én delt tilstand per produksjon og vises i viewer, filmtidslinje, scenens tidslinje og manus (markert passasje – REQ-0098).
- Klikk på linjal = flytt hodet; dra på linjal = scrub (umiddelbart, ingen animasjon). Klikk på replikk i manus flytter hodet til replikkens `TimeLink` (REQ-0097). Uten kobling: hodet går til scenens start og en diskré melding sier at replikken ikke er koblet.

### 1.2 Zoom
- Zoom rundt avspillingshodet (tast) eller musepekeren (`Mod`/pinch + hjul). Nivåer fra «hele filmen» til «enkeltbilder synlige». Horisontal rulling med `Shift`+hjul / styreflate.
- Zoomnivå per bruker og arbeidsflate (lokal visningstilstand, ikke prosjektdata).

### 1.3 Snapping
- Snapper til: avspillingshode, klippkanter, inn/ut-punkter, scenestart, replikkstart (`TimeLink`), markører. Terskel 8 skjermpiksler.
- Snap-mål vises med en tynn linje i aksentfarge mens man drar. `N` slår av/på; holdt `Mod` under dra = midlertidig av.

### 1.4 Fire ulike operasjoner (REQ-0229)
| Operasjon | Gest | Kommando | Effekt på manus |
|---|---|---|---|
| Flytte narrativ scene | Dra scenehodet (øverste rad/scenebånd) eller i manusnavigator | `MoveOccurrence` | Ny rekkefølge i begge visninger (INV-01); ID og nummer uendret |
| Trimme medieklipp | Dra klippkant | trim-kommando på `AssemblyItem` (navn fastsettes i core) | Ingen; udekket manus → avvik (REQ-0230, REQ-0231) |
| Endre utsnitt | Inspektør eller dra utsnittskant i scenebånd | `excerpt` på sceneforekomst (24.6) | Ingen |
| Deaktivere innhold | `Shift+D` / kontekstmeny | `SetOccurrenceActive(false)` | Scenen vises som deaktivert i manus; ingenting slettes (INV-14) |

Scenehodet og klipp har ulike markører og pekere, slik at brukeren ser forskjell på «flytt scene» og «trim klipp» før hun drar.

### 1.5 Ripple
- **Anbefaling:** trim inne i en scene påvirker bare scenens egen varighet; filmens samlede tidskoder beregnes på nytt automatisk (fordi rekkefølgen er avledet). Det finnes ingen «hull» mellom scener i filmmonteringen, så klassisk ripple-sletting er unødvendig.
- Hull/«svart» mellom klipp *innen* en scene: vises tydelig; lukkes bare ved eksplisitt handling («Lukk hull»).
- Om Trollfilm ønsker eksplisitt ripple/ikke-ripple-modus (som i klippeprogrammer) → `OPEN_QUESTIONS.md`.

### 1.6 Valg
- Klikk = velg; `Shift`+klikk = utvid område; `Mod`+klikk = legg til/fjern. Valget deles mellom manus og tidslinje (valgt scene markeres begge steder).

## 2. Dra og slipp
- **Scener i manus og i tidslinje bruker samme kommando `MoveOccurrence`** med ny `orderKey` beregnet fra naboene. Det finnes ingen separat «tidslinjerekkefølge».
- Under dra: halvgjennomsiktig «spøkelse», innsettingslinje mellom scener, og en liten etikett («Flytt scene 42 etter 45»). `Esc` avbryter uten endring.
- Etter slipp: optimistisk visning → RPC `apply_command` → ved avvisning (revisjon/tilgang) rulles visningen tilbake og årsaken vises.
- Flere valgte scener flyttes som én kommando (én angre).
- Ressurs fra bibliotek → lerret/tidslinje: lager referanse til en *bestemt ressursversjon* (INV-13).
- Filer fra filsystemet → importflyt (validering, se `secure-development`), aldri direkte inn i en scene uten importdialog.
- Tastaturalternativ for alt som kan dras (WCAG 2.2 SC 2.5.7): `Alt+←/→` for scener, flyttmeny i kontekstmenyen.

## 3. Paneler og arbeidsområde
- Arbeidsflater består av paneler i et rutenett: endre størrelse ved å dra skillelinjen, dobbeltklikk = standardstørrelse, kollaps til kant. Oppsettet lagres per bruker (lokal preferanse + backend), aldri i prosjektdata.
- Dokking/flytende paneler: senere (ikke MVP), men panel-API-et skal tillate det.
- Minste bredde 1280 px. Store skjermer: flere paneler synlige samtidig, ikke større elementer.
- «Manus og film side ved side» (REQ-0100) er en standardlayout i Monteringsflaten.

## 4. Angre / gjør om
- Per bruker (REQ-0527, ADR-0004): stakken inneholder bare brukerens egne kommandoer i prosjektet. Angre = utfør `inverse` hvis berørte objekter ikke er endret av andre siden; ellers forklarende konflikt («Scene 42 er senere endret av Anita. Angre likevel / Avbryt»).
- Angre-etiketten beskriver handlingen («Angre: Deaktiver scene 12»). Etter betydelige handlinger vises toast med «Angre»-knapp i ~8 s.
- Selektiv angring av en bestemt manusendring (21.2 C) skjer fra Historikk- eller Avvikspanelet, ikke via `Mod+Z`.
- Lokal visningstilstand (zoom, rulling, panelstørrelse) er ikke i angre-stakken.

## 5. Kontekstmenyer
- Høyreklikk (og `Shift+F10` / menytasten) på scene, klipp, replikk, lag, ressurs, jobb, avvik.
- Rekkefølge: vanligste handling først, deretter navigasjon («Vis i manus», «Vis i tidslinje»), deretter tilstand (aktiver/deaktiver), til slutt sjeldne. Snarvei vises til høyre.
- Ingen handling finnes bare i kontekstmenyen.

## 6. Langvarige jobber
- Start → umiddelbar bekreftelse («Lagt i kø») og jobben vises i Jobbkø-panelet og toppfeltets indikator.
- Status etter mandat 20.3 med ikon + tekst. Fremdrift i prosent bare når pålitelig; ellers trinnvis status og forløpt tid.
- Jobbene lever i backend (mandat 20.2). Ved gjenåpning: oppsummering «3 ferdige til gjennomgang, 1 feilet» (REQ-0296).
- Ferdig resultat erstatter aldri aktiv versjon automatisk; det legges ved siden av med «Bruk denne» (REQ-0030, REQ-0233).
- Betalte jobber går alltid via kostnadsdialogen (INV-12).

## 7. Feilhåndtering
- Mønster: **hva skjedde** · **hva er bevart** · **hva kan du gjøre** («Kunne ikke laste opp lydfilen (for stor: 6,2 GB, grense 5 GB). Ingenting er endret i scenen. Velg en mindre fil eller komprimer den.»).
- Feil vises der de oppsto (inline i panel/dialog), ikke bare som toast.
- Nettverk: tydelig «Frakoblet – endringer venter» i statuslinjen; ventende kommandoer sendes ved gjenoppkobling med revisjonskontroll; konflikter vises, aldri stille tap.
- Teknisk feilinformasjon (feil-ID) kan kopieres, men inneholder aldri hemmeligheter eller manustekst.

## 8. Samarbeid
- Presence (Supabase Realtime Presence): avatarer i toppfeltet; i manus/tidslinje en tynn markering på scenen en annen arbeider i. Ikke markørposisjoner via Presence (for høy frekvens).
- «Redigeres av Anita» på blokk/objekt under aktiv redigering (myk lås – advarsel, ikke blokkering, med mindre ADR sier annet).
- Revisjonskonflikt (INV-C1): dialog med *din endring* / *gjeldende versjon* og valg (behold gjeldende, bruk din på nytt, flett manuelt for tekst). Ingenting forkastes uten valg.
- Endringer fra andre vises med kort varsel og i Historikk («Anita flyttet scene 12»).
- Roller styrer hva som vises som mulig handling, men backend håndhever (INV-C2). En knapp brukeren ikke har rett til, vises deaktivert med forklaring.

## 9. Datatap-sikring
- Ingen «Lagre»-knapp for prosjektdata; hver kommando lagres. Tekstredigering sendes som `EditBlockText` ved pause (debounce) og ved fokus ut.
- Navigering bort med ventende endringer → vent på sending eller vis advarsel (`beforeunload` bare når noe faktisk venter).
