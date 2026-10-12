# UX-gjennomgang mot de ni kvalitetene (REQ-0011, DEC-0076)

Dato: 2026-10-12 · Type: heuristisk gjennomgang, kun lesing (ingen kode endret)
Grunnlag: skjermbilder 1440 × 900 i `/tmp/claude-0/qa76/` (v4-*, nyeste), `/tmp/claude-0/qa75b/` (v3-*, omkjøring 17:11) og loggene `qa76/verifisering4-ui.log` og `qa75/verifisering3-ui.log` (første v3-kjøring, 16:16 – noen funn kan være rettet i qa75b).
Kriterier: `docs/design/UX_PRINCIPLES.md` («De ni kvalitetene som gjennomgangskriterier»), `DESIGN_SYSTEM.md`, `ANTI_PATTERNS.md`.

Merk: Rødt/blått helbilde i montering og sammenligning (v4-18a, v4-06, v4-19) er testmedier, ikke en designfeil.

## De ni kvalitetene

| Kvalitet | Vurdering | Belegg (skjermbilde) | Kommentar |
|---|---|---|---|
| Profesjonelt | Delvis | v4-20-manusside, v3-08-utgivelse, v3-13-ai-leverandorer, v4-04a | Manus i standardformat med scenenummer i begge marger og filmbegreper (scene, opptak, montering, klipp) er solid. Trekker ned: «~$NaN» vises til brukeren (v3-13), leverandørnavnet «Lovable AI (innebygd)» og «Lovable-arbeidsområdet» lekker plattformnavn inn i et filmverktøy (v3-02, v4-04a), og «Visuelle varianter» brukes som overskrift for en lydressurs (v4-05). |
| Elegant | Delvis | v3-01-oversikt, v3-06-sceneeditor, v4-04a, v4-20 | Rolig mørk palett, én ikonfamilie og konsekvente tokens. Men verktøylinjene i manus og sceneeditor bryter tekst over 2–3 linjer («Vis kun valgt scene», «Automatisk visning», «4 sider») og ser trange ut. Bildedialogen i v4-04a har en tom venstrekolonne og en smal, overfylt høyrekolonne. qa75-loggen fant AI-ikon i strid med §6 på 6 steder (REQ-0426) – må bekreftes rettet. |
| Filmisk | Oppfylt | v3-06, v4-18a, v4-06-sammenlign-versjoner, v4-19 | Mørk flate rundt bildet, riktig 16:9, tidskoder (00:00:05:06), bildeantall (225 bilder) og scenenummer overalt. Montering med bildespor og fargekodede lydspor leses som et NLE-verktøy. |
| Oversiktlig | Delvis | v4-18a-montering-film, v4-20, v3-01, v4-02 | Status med ikon og tekst finnes (Usikker, Flyttet, Deaktivert). Men monteringens verktøylinje har ni ikonknapper uten tekst og en avkuttet «13 s…», og høyrepanelet har mange like sterke handlinger. Oversiktens radhandlinger i kontinuitetsanalysen er bare ikoner (bibliotek, skjul). Manussiden har tre konkurrerende brytere i én linje. |
| Effektivt | Delvis | v3-19-meny-til-sceneeditor, v4-12-lag-bildevalg-liste, v3-09-fokus-meny | Kryssnavigasjon (Åpne i sceneeditoren / Vis i manus), scenevelger med piler og fokusring i menyen (v3-09) fungerer. Søkefeltet i bildevalget får fokus straks (v4-12). Snarveier synes ikke noe sted i grensesnittet (ingen hint i verktøytips/knapper på skjermbildene). qa75-loggen hadde FEIL på REQ-0168 (manus → sceneeditor åpnet feil scene). v3-19 i qa75b viser nå riktig scene (4), men dette må bekreftes i loggen. |
| Ikke-destruktivt | Oppfylt | v3-15-versjoner, v4-06, v4-19-eksport-valg, v3-01 | Angre/gjør om finnes i alle arbeidsflater. Teksten sier eksplisitt at versjoner «aldri kan endres i ettertid», at sammenligning og eksport «endrer ingenting», at kontinuitetsanalysen «ingenting endres automatisk» og at en ny produksjon ikke endrer hovedfilmen. |
| Modulært | Ikke vurderbart fra skjermbilder | – | Hører til arkitekturtestene (`tests/architecture/`). Fra brukersiden virker produksjoner, bibliotek og utgivelse som tydelig adskilte moduler (v3-10, v3-05, v3-08). |
| Pålitelig | Delvis | v3-13, v3-02-oversikt-jobber, v4-05-kostnad-lyd, v4-14-opptak-pagar | «Lagret» står i alle verktøylinjer. Feilede og ikke-innlagte AI-jobber vises med «Legg inn» og «Prøv igjen» (v3-02), noe som er godt. Men «Brukt denne måneden: ~$NaN» betyr at kostnadssummen kan gå i stykker uten feilmelding. Lydressursen «Vind i trærne» står med «0 scener» i biblioteket (v4-05), selv om den ligger på Atmosfære-sporet i monteringen (v4-18a). Bruksantallet kan altså være feil. |
| Brukerstyrt | Oppfylt (med en mangel) | v4-01-kostnad-generer-scene, v4-02, v4-05, v4-04a | Alle betalte handlinger krever en eksplisitt bekreftelse som viser modell, antall, lengde, «ingen automatiske ekstrarunder» og samlet anslag. Hva som sendes til modellen kan vises. Mangel: bekreftelsen for innebygd bilde mangler innsatsnivå og oppløsning (v4-04a; FEIL i verifisering4-loggen, REQ-0280). |

## Funn rangert etter alvorlighet

**Høy**

1. **«~$NaN» i kostnadstaket** – AI-leverandører (v3-13). Kostnad er et tillitspunkt. *Tiltak:* Når et beløp er ugyldig, vis «$0.00» eller «ikke beregnet» og logg feilen. Legg også inn en test som avviser `NaN` i all pengeformatering.
2. **Primærknappen havner utenfor skjermen i bulkbekreftelsen** – Video for flere scener (v4-02). Knappen «Ja, legg i kø» er halvveis kuttet nederst, og dialogtittelen er rullet bort (også v4-01). *Tiltak:* Gi dialogen fast topp og bunn (tittel og handlingsfelt låst) og la bare innholdet rulle. Sett maks høyde til 100vh minus marg.
3. **Bekreftelsen for innebygd bilde mangler innsatsnivå og oppløsning** – sceneeditor/bildedialog (v4-04a). Den bryter REQ-0280 og P2 (brukeren ser ikke hva hun betaler for). *Tiltak:* Bruk samme anslagskomponent som Veo/ElevenLabs med alle sju feltene.
4. **Feil bruksantall i biblioteket** – Ressursbibliotek (v4-05 mot v4-18a). Lyd som brukes i monteringen står med «0 scener». Det kan føre til at noen arkiverer eller sletter en ressurs som er i bruk. *Tiltak:* Tell også lydklipp i monteringen og lag i 2D-scener. Skill mellom «i scener» og «i monteringen».

**Middels**

5. **Ikonknapper uten tekst og avkuttet etikett i monteringens verktøylinje** (v4-18a, v4-06). *Tiltak:* Samle visningsvalg i én meny («Vis ▾»), behold tekst på de 3–4 viktigste handlingene og gi «13 s…» en fast bredde eller et verktøytips.
6. **Overfylte verktøylinjer i manus og sceneeditor** – tekst brytes over 2–3 linjer (v4-20: «Vis kun valgt scene», «Låste sider», «4 sider»; v3-06: «Automatisk visning»). *Tiltak:* Flytt visningsbrytere til en «Visning»-meny, og vis sideantall i høyrepanelet (det står allerede «Siste scene starter på side»).
7. **Plattformnavn i produktet** – «Lovable AI (innebygd)», «Lovable-arbeidsområdet», «Lovable viser forbruket» (v3-13, v3-02, v4-04a). *Tiltak:* Kall den «Innebygd AI» og forklar kreditter uten å vise leverandørens produktnavn.
8. **Bildedialogen er skjevt fordelt** – en stor tom venstrekolonne og en smal høyrekolonne med lange tekster (v4-04a). *Tiltak:* Vis bildekandidater eller dagens bilde til venstre, eller bruk én kolonne når det ikke finnes kandidater.
9. **Feil overskrift for lydvarianter** – «Visuelle varianter» over en lydressurs (v4-05). *Tiltak:* Velg overskrift etter ressurstype («Varianter» eller «Lydvarianter»).
10. **Kontinuitetsanalysen har handlinger som bare er ikoner** (bibliotek, skjul) (v3-01). *Tiltak:* Gi dem tekst («Bibliotek», «Skjul») eller i det minste synlige verktøytips. Det er i dag tre like tunge handlinger per rad.

**Lav**

11. **«Bruk» på prosjektoversikten ser deaktivert ut** (dempet teal, v3-01), og det samme gjelder «Lagre» i AI-budsjettet (v3-02). *Tiltak:* Vis tydelig tilstand: deaktivert med en forklaring når ingenting er endret, og full primærfarge når noe er endret.
12. **Plakatforhåndsvisningen har svært liten brødtekst** (v3-08) og tomme stiplede rammer uten etikett. *Tiltak:* Vis plassholdere med tekst («Slagord», «Lokasjoner»). Panelet sier selv at minste lesbare tekst er 12 pt, så kontrollfanen bør varsle når teksten er mindre.
13. **Utydelig tilbakelenke i toppfeltet** – «← Ressursbibliotek / ← Manus / ← Montering» står foran merkenavnet og ser ut som en del av brødsmulestien (v3-06, v3-05, v3-08). *Tiltak:* Skill den visuelt fra brødsmulen, eller skriv «Tilbake til …».
14. **Store deler av utgivelsen ser tomme ut** – det er lite bakgrunnsrom rundt plakatlerretet, og høyrepanelet krever lang rulling (v3-08). *Tiltak:* Bruk de eksisterende fanene (Plakat/Element/Kontroll) til å dele opp skjemaet.
15. **Dokumentet ruller horisontalt (1452 px)** på oversikt og i Ny produksjon ifølge qa75-loggen (REQ-0424). *Tiltak:* Bekreft at dette er rettet i qa75b, ellers finn elementet som er bredere enn visningen.

## Samlet

Fire kvaliteter er oppfylt eller nesten oppfylt: filmisk, ikke-destruktivt, brukerstyrt og modulært (det siste kan ikke vurderes visuelt). De svake punktene er oversikt og eleganse i de tette verktøylinjene og pålitelighet i tall som vises til brukeren (NaN og bruksantall). Funn 1–4 bør rettes før neste verifisering, fordi de svekker tilliten til kostnad og data.
