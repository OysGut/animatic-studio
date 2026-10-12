# Implementeringsstatus – Animatic Studio

Oppdatert: 2026-10-11 (økt 6). Detaljert status per krav: `docs/product/TRACEABILITY_MATRIX.md` (generert).

## Sammendrag
- **M0 Fundament:** ferdig.
- **M1 Skjelett og kjerne:** ferdig og kjørt i Lovable (migrasjon 0001, innlogging, prosjekt).
- **M2 Manus del 1:** levert og testet av Mars i Lovable (import, visning, redigering, eksport – også i Safari).
- **M2 Manus del 2:** levert og testet av Mars (versjoner, sammenligning, historisk nummerering, søk/filter, «Vis kun valgt scene», varighet, tilstedeværelse). Migrasjon 0003 kjørt.
- **Mars' ønsker etter M2 (DEC-0029, DEC-0031):** rekkefølge/synlighet bare i redigeringsmodus, flyttede scener markert til ny versjon, fyldigere sammenligning (linje for linje), notater i manus (på ord og som nål, stempel, sletting med advarsel, vis/skjul, søk, eksport/import som Word-kommentarer og PDF-merknader), søketreff markert, scenelisten følger manuset, valgt scene øverst. Kode og tester ferdig.
- **M3 del 1 Ressursbibliotek (DEC-0030):** karakterer, objekter, lokasjoner, dyr, miljøer; alternative navn; visuelle varianter med bildeversjoner og godkjenning; «brukt i scener»; forslag fra manuset; karakterfilter med alle navn. Kode og tester ferdig. Venter på push og migrasjon 0004.
- **M3 del 2 Sceneeditor og M4 Montering og lyd (DEC-0035–0045):** 2D-scener med lag, nøkkelbilder og kamera; filmtidslinje og eksport av animatic; lydspor, lyd over flere scener, lydprofil med volumpunkter. Se `SESSION_HANDOVER.md`.
- **M5 del 1 AI-bilder (DEC-0045):** generering av ressursbilder via Lovable AI Gateway med synlig prompt, bekreftelse, grenser og logg. Ikke prøvd mot ekte gateway ennå (KI-61).
- **Prosjektliste (DEC-0046):** slett prosjekt (eier), forlat prosjekt, ressurser fra slettede prosjekter, zip-nedlasting per kategori. **M4 del 3 (DEC-0047):** importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode.
- **M4 del 4 (DEC-0048):** klipping i deler (trim, splitt med S, bildepresise inn- og utpunkt), animatic-rest, tidskoblinger per replikk («Synk replikker», T), lang film fordelt på flere scener, status for importert film. Migrasjon 0012.
- **Sikkerhetskopi og navigasjon (DEC-0049):** sikkerhetskopi av hele prosjektet som zip (dokumentert format), gjenoppretting som nytt prosjekt, «Vis i filmen» fra manuset og «Vis i manus» med replikken under avspillingshodet, samlet angring for filmimport. Ingen migrasjon.
- **Montering del 6 (DEC-0051):** sju overgangstyper med overlapp og standardovergang for prosjektet, svart-hvitt globalt og per scene (også i eksporten), forhåndsvisning i eget vindu, hendelser i 2D-scenen koblet til manus. Migrasjon 0013.
- **Sceneeditor del 3 (DEC-0052):** bildeskifte i lag (merke i tidslinjen som kan dras), grupper med ankerpunkt, bevegelsesbane (frihånd, «Glatt ut», rett linje, punkter), ease ut/inn med styrke og tempokurve, naboscener som film, lydopptak. Migrasjon 0013 utvidet.
- **M5 del 2 – AI med kontroll (DEC-0053):** gratis frilegging med pensel, AI-budsjett (eier) med sperre på serveren, liste over AI-jobber med «Prøv igjen», «Generer scene» med segmenter og redigerbare beskrivelser (selve genereringen venter på godkjent leverandør). Migrasjon 0014.
- **M6 del 1 – avvik ved manusendring (DEC-0054):** materiale husker manuset det ble laget fra; endringer etterpå flagges i tidslinjen, manuset, sceneeditoren og på oversikten, med tre valg: godkjenn, oppdater eller angre manusendringen.
- **M6 del 2 – kontinuitet for karakterene (DEC-0055):** hendelser som endrer utseendet (før/etter, varighet), riktig utseende per scene etter fortellingstid (også tilbakeblikk), tidslinje per karakter, forslag fra manuset som godkjennes eller avvises, riktig utseende og advarsel i sceneeditoren, og i «Generer scene». Migrasjon 0015.
- **M6 del 3 – konsekvenser og kontinuitetsanalyse (DEC-0056):** godkjenning av et nytt bilde viser berørte scener (også bildeskifter, andre produksjoner og film) og lar brukeren velge scene for scene; eldre versjoner flagges i sceneeditoren; rådgivende kontinuitetsanalyse på prosjektoversikten (skrivefeil i navn, før introduksjon/etablering, deaktiverte scener, utseende uten årsak, motsetninger i fortellingstid). Ingen migrasjon.
- **M7 del 1 – avledede produksjoner (DEC-0057):** ny produksjon (spinoff, trailer, kortfilm …) fra utvalgte scener, felles produksjonsvalg i manus, montering, sceneeditor og bibliotek, nye scener bare i spinoffen, og automatisk egen versjon av en gjenbrukt scene (med 2D-scene, historikk og koblinger) når den endres i spinoffen – hovedfilmen endres ikke. Ingen migrasjon.
- **M7 del 2 – engelsk manus (DEC-0058):** oversettelse per linje og scenehode som aldri endrer norsk, «må gjennomgås» når norsk endres, import av ferdig oversatt manus med automatisk kobling (referansemanuset: 97/97 scener, 2192/2193 linjer) og manuell godkjenning, engelsk visning og eksport av manus, undertekster (.srt/.vtt) på norsk eller engelsk. Migrasjon 0016.
- **M7 del 3 – engelsk film (DEC-0059):** lyd per språk (dialog norsk som standard, musikk og effekter felles), bilde per språk i lag, dialogspråk i importert film, samme timing i alle språk, «Språkversjon …» med timingkonflikter og råd om leppesynk, dialogspråk og undertekster valgt uavhengig, eksport per språk med innbrente undertekster og dialogspor (WAV). Migrasjon 0017.
- **M7 del 4 – tilbakeføring og kontinuitet i spinoffer (DEC-0060):** sammenligning av spinoffens og hovedfilmens versjon (manus, lag, kamera, lyd, timing, klipping) med valg av hva som føres over, ny hovedfilmversjon, overføring av nye scener, godkjent film bare med bekreftelse; arvede, avslåtte og lokale kontinuitetshendelser per produksjon; varsler om hull i spinoffen med «Ta med scenen»; utdrag av ferdig film. Migrasjon 0018.
- **M8 del 1 – plakater og karakterkart (DEC-0061):** arbeidsflaten «Utgivelse» med kinopitch-plakat og karakter- og universkart per produksjon, førsteutkast fra prosjektet, 13 innholdsvalg, direkte redigering med egne elementer, relasjoner med forslag fra manuset, lesbarhetskontroll, norsk og engelsk, trykk-PDF med utfallende kant og skjæremerker, og PNG. Migrasjon 0019.
- **Kamera og lag (DEC-0062):** «Bruk aktivt utsnitt», fjern lag fra scenen, dra lag inn i og ut av grupper, valgt gruppe lyser opp, justerbar lagliste.
- **Roller og tilbake (DEC-0063):** eieren endrer roller og ventende invitasjoner; «Tilbake til …» går til forrige vindu. Migrasjon 0020.
- **Bilder i fullskjerm og opplasting igjen (DEC-0064):** zoom/panorering/nedlasting, prosjektnavn på filer, erstatt eller legg til ved opplasting med samme navn.
- **Filmens visuelle stil (DEC-0065):** stilprofil og bildebeskrivelser med film, stil, scener, lys, godkjente bilder og det som skal unngås. Migrasjon 0021. Språkmodell og forbildebilder sendt med venter på kostnadsgodkjenning.
- **AI skriver bildebeskrivelsen (DEC-0066):** språkmodell i Lovable AI Gateway skriver beskrivelsen ut fra grunnlaget og bildene; dagens bilde og filmens godkjente bilder sendes med til bildemodellen (≤ 6). Migrasjon 0022. Implementert – ikke prøvd mot ekte gateway.
- **Produksjonsstatus og planlagt lengde (DEC-0067):** varighet og status per scene på prosjektoversikten med filter og lenker; planlagt lengde brukt i oversikt, montering og sceneeditor; AI-bilder som ikke ble lagt inn kan hentes inn; eieren kan fjerne medlem (migrasjon 0023). Kravrevisjon: nå 377 Verifisert og 59 Implementert – ikke verifisert (før: 344 og 22).
- **Fortellingstid, utvikling over tid og filter (DEC-0068):** tilbakeblikk/drøm/tidshopp i manus, lengde per manusversjon, manusfilter på objekt/sted, status og manusendringer, oversiktsfilter på ressursendring og språk.
- **Egne AI-leverandører (DEC-0069, M5 del 3):** OpenAI, Google Gemini, fal.ai, Runway og ElevenLabs med veiledning og kryptert nøkkel, overordnet kostnadstak i USD, bilder med valgt leverandør, video per segment i «Generer scene» (ny versjon av scenen), lyd for lydressurser. Migrasjon 0024. Ikke prøvd mot de ekte tjenestene (KI-153).
- **Ti store bolker (DEC-0070, M5 del 4):** bakgrunnskø og kø med prioritet/fremdrift, video for flere scener, innsatsnivå, modelltilpassede beskrivelser, sammenheng mellom segmenter, kandidater og sammenligning (bilde og video), hybrid sammensetting, oppdatering med AI ved avvik, Fountain-import/-eksport, lydkoblinger og -filter. Migrasjon 0025.
- **Ti store bolker til (DEC-0071, M5 del 5):** sammenheng i køen, myke overganger mellom deler (visning og eksport), rådgivende kvalitetssjekkliste, betegnelser i bestemte linjer, stilprofiler per bruk, maske og blandingsmodus per lag, manusdekning for film, dialog med AI-stemmer (ElevenLabs). Migrasjon 0026.
- **Krav:** 344 verifisert, 21 implementert – ikke verifisert, 50 under arbeid, 174 ikke startet (av 589).

## Tester (alle grønne 2026-10-09)
| Testsett | Antall | Kjøres med |
|---|---|---|
| Enhet, scenarier, kontrakt, eksport, nummerering, versjoner, filter, varighet, bibliotek, notater (inkl. Word/PDF-rundtur), regresjoner (`tests/unit`, + 1 Lovable-test) | 105 | `bun run test` |
| Egenskapsbaserte invarianttester (`tests/invariants`) – 150 tilfeldige sekvenser × 40 kommandoer, 18 kommandogrupper (også bibliotek og notater) | 9 | `bun run test` |
| Gyldne tester mot referansemanuset (`tests/golden`) – hoppes over uten manusfilene | 6 | `bun run test` (lokalt hos Claude) |
| Arkitektur (`tests/architecture`) | 1 | `bun run test` |
| Database (`tests/db`) – RLS, revisjon, atomisitet, invitasjoner, uforanderlighet, import, profiler, unik plass, versjoner, bibliotek, notater | 22 | `bun tests/db/run-db-tests.ts` |
| Visuell QA (`tests/visual`) – 27 skjermbilder med mockede data, pluss import av ekte PDF i nettleseren | manuell vurdering | `node tests/visual/screens.mjs` |
| GitHub Actions | `knowledge-base.yml`, `tests.yml` (ny: typekontroll, Vitest, databasetester) | automatisk ved push |

## Målinger mot «Jula på Dovre» (norsk PDF, 106 sider)
- Import: 97 scener (96 nummererte, 1 unummerert), 2 193 blokker, 0 usikre elementer; engelsk DOCX gir samme struktur.
- Låste sider: 105 manussider og alle 97 scenestarter på samme side som originalen. Fri sidebryting: alle innen ±1 side, 63 eksakt.
- Eksportert PDF leses inn igjen med identiske scener, numre, tekst og sider. DOCX åpnet i LibreOffice: 105 sider manusformat.

## Moduler
| Modul | Status | Hva finnes |
|---|---|---|
| CORE | Under arbeid | Kommandoer med invers (40 typer), invarianter, visninger, endringssett, notater |
| SCRIPT | Under arbeid | Tolkning PDF/DOCX, import, sidebryting, låste sider, nummerering, arbeidsflaten «Manus» |
| EXPORT | Under arbeid | Manus til PDF (sidetro) og DOCX (redigerbar); animatic-video (MP4/WebM) i nettleseren uten lyd (DEC-0043) |
| VERSION | Under arbeid | Blokkrevisjoner, kommandologg, angre/gjør om per bruker, `outdatedTakes`, manusversjoner med sammenligning linje for linje |
| LIBRARY | Under arbeid | Ressursbibliotek med alternative navn, varianter, bildeversjoner, godkjenning, bruk i manus, forslag (DEC-0030) |
| COLLAB | Under arbeid | Medlemskap, roller, invitasjoner, profiler, sanntid, revisjonskontroll |
| SECURITY | Under arbeid | RLS, `apply_changes` bare for service_role, inverskommandoer bare fra egen historikk, privat bøtte for originaler |
| TIMELINE / CONTINUITY | Under arbeid | Tidsmodell, fortellingstid; filmtidslinjen «Montering» med flytting, lengder, avspilling av hele filmen (DEC-0043) |
| UI | Under arbeid | Prosjekt, manus (navigator, sider, inspektør, import, eksport, versjoner, notater, søketreff), ressursbibliotek |
| AUDIO | Under arbeid | Lydfiler i biblioteket, lydspor i monteringen (dialog, forteller, effekter, atmosfære, musikk), Web Audio-avspilling og miksing i eksporten (DEC-0044); lyd som løper over flere scener, lydprofil med volumpunkter, lyd i scenene rundt og bølgeformer i sceneeditoren (DEC-0045) |
| Øvrige moduler | Ikke startet | – |
