# Visuell og manuell kontroll – DEC-0075

**Dato:** 12.10.2026 · **Utført av:** Claude (verifiseringsrunde 3) · **Grunnlag:** `docs/design/DESIGN_SYSTEM.md`, `.claude/skills/design-system-director/references/ANTI_PATTERNS.md`, kravene i `docs/product/requirements.yaml`.

## Hvordan kontrollen ble gjort

- **Miljø:** dev-serveren (`bunx vite dev`, http://127.0.0.1:8080), fixturen fra `bun tests/visual/make-fixture.ts` («Jula på Dovre», 14 scener, hovedfilm og spinoff), Chromium 1194 fra `/tmp/claude-0/pw/node_modules`. Alle Supabase-svar er mocket som i `tests/visual/screens.mjs`; ingen ekte tjenester ble brukt. Lagringen (serverfunksjonen `runCommand`) får aldri svar, så endringer står igjen lokalt (samme metode som `tests/visual/interactions-e2e.mjs`).
- **Automatisk skript:** `tests/visual/verifisering3-ui.mjs` (kjøres som kopi fra `/tmp/claude-0/pw` med `ENV_FILE=/home/claude/animatic-studio/.env node verifisering3-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json /tmp/claude-0/qa75`). Skriptet avslutter med kode 1 ved brudd. Siste kjøring: **73 kontroller, 68 bestått, 5 feilet** – de fem er avvikene beskrevet under (logg: `/tmp/claude-0/qa75/verifisering3-ui.log`).
- **Gjennomgang av sidene:** for hver av 14 visninger (seks arbeidsflater, AI-jobbene på oversikten og sju dialoger) går skriptet gjennom alle synlige elementer (766 tekstelementer): font, skriftstørrelse, tekstfarge mot designtokenene i `src/styles.css`, kontrast mot den faktiske bakgrunnen (lagene blandet, gjennomsiktighet tatt med, deaktiverte kontroller unntatt), engelske grensesnittord i tekst og i `aria-label`, `title`, `placeholder` og `alt`, emoji, gradienter, radier/pilleknapper, «gnist»-ikoner, tilgjengelig navn på knapper/lenker/felt og om hele dokumentet ruller. Materialet (manussidene i sidens målestokk og plakatene i SVG) er unntatt fra font- og størrelseskontrollen, og innhold (manustekst, beskrivelser til AI) fra språkkontrollen.
- **Skjermbilder** (ikke i repoet): `/tmp/claude-0/qa75/`. `v3-*.png` er fra skriptet over; de andre er fra en kopi av `tests/visual/screens.mjs` (`ONLY=…`) kjørt mot samme fixture.
- **Manuell vurdering:** skjermbildene er sett gjennom mot designsystemet og anti-mønstrene.

## Resultat per krav

| Krav             | Resultat                                                    |
| ---------------- | ----------------------------------------------------------- |
| REQ-0013         | Uten avvik                                                  |
| REQ-0014         | Uten avvik                                                  |
| REQ-0101         | Uten avvik                                                  |
| REQ-0119         | Uten avvik                                                  |
| REQ-0168         | **Avvik** (manus og hovedmenyen)                            |
| REQ-0405         | **Avvik** (API-kostnad i USD)                               |
| REQ-0424         | **Avvik** (dokumentet ruller på oversikten; «gnist»-ikoner) |
| REQ-0426         | **Avvik** («gnist»-/tryllestavikoner)                       |
| REQ-0427         | Uten avvik                                                  |
| REQ-0428         | Uten avvik                                                  |
| REQ-0175 (del A) | Uten avvik (pikselkontroll)                                 |
| REQ-0243 (del A) | Uten avvik                                                  |
| REQ-0585 (del A) | Uten avvik (omriss i scenen)                                |

### REQ-0013 – Troverdig kreativt verktøy, ikke chatbot

- **Sjekket:** at hovedarbeidsflatene er manus, montering (tidslinje), sceneeditor og bibliotek, at AI-funksjonene ligger i disse, og at det ikke finnes noen chatflate.
- **Hvordan:** skriptet (`omrader`): menyen har nøyaktig Prosjektoversikt, Manus, Ressursbibliotek, Sceneeditor, Montering, Utgivelse – ingen «AI», «Chat» eller «Assistent». Gjennomgangen fant ingen meldingsfelt («spør AI», «skriv en melding»). AI-handlingene ligger i arbeidsflatene: «Generer scene …» og «Dialog med AI-stemmer …» i scenepanelet i monteringen, «Video for flere scener» i monteringens verktøylinje, «Lag bilde/lyd med AI» i biblioteket, AI-jobbene og budsjettet på prosjektoversikten. Manuell gjennomgang av skjermbildene bekrefter et tett, panelbasert arbeidsverktøy.
- **Skjermbilder:** `v3-01-oversikt.png`, `v3-03-manus.png`, `v3-05-bibliotek.png`, `v3-06-sceneeditor.png`, `v3-07-montering.png`, `45-montering.png`, `54-ai-generering.png`, `02d-ai-lyd.png`.
- **Resultat:** uten avvik for akseptansekriteriet. Brukertesten med filmarbeidere som kravet også nevner, er ikke gjort. «Gnist»-ikonene på AI-knappene er ført under REQ-0426.

### REQ-0014 – Brukergrensesnitt på norsk

- **Sjekket:** at all brukervendt tekst er norsk, også skjermlesertekster.
- **Hvordan:** (1) skriptet: `<html lang="nb">` på alle sider; ingen engelske grensesnittord (Close, Cancel, Save, Delete, Search, Settings, Next, Previous, More, Edit, Toggle Sidebar, Go to …) i synlig tekst eller i `aria-label`/`title`/`placeholder`/`alt` på 14 visninger; lukkeknappen i alle seks dialoger som ble åpnet heter «Lukk». (2) Statisk søk etter de samme ordene i `src/app`, `src/routes` og `src/components`: treff bare i `src/components/ui/sidebar.tsx`, `pagination.tsx` og `breadcrumb.tsx`, som ikke importeres noe sted utenfor `src/components/ui` (kontrollert med grep), og «(Delete)» som navn på en tast i `AudioClipPanel.tsx`.
- **Skjermbilder:** `v3-01` … `v3-15`.
- **Resultat:** uten avvik. Merknad: «Pause» brukes som skjermlesertekst på avspillingsknappen (norsk ord). Feilmeldinger som kommer ordrett fra en AI-leverandør (f.eks. «Transparent background is not supported for this model» i `78-ai-budsjett-og-jobber.png`) er leverandørens tekst i en norsk ramme.

### REQ-0101 – Automatisk rulling av/på

- **Sjekket:** med «Følg avspillingen» av står manuset stille mens markeringen oppdateres; med på følger manuset avspillingen.
- **Hvordan:** skriptet (`folg`), monteringen i lavt vindu (1440 × 560) så manuset må rulle (939 px). Av: hopp til siste replikk → markeringen (aria-current) flytter dit, rulleposisjonen er 0 og replikken er utenfor synsfeltet; avspilling i 4 s → fire ulike markerte blokker, ingen rulling. På: hopp til siste replikk → manuset ruller (970 px) og replikken er synlig; avspilling → markert replikk er synlig ved hver av 16 målinger.
- **Skjermbilder:** `v3-20-folg-av.png`, `v3-21-folg-pa.png`.
- **Resultat:** uten avvik.

### REQ-0119 – Navigasjon fra oversikt til scene

- **Sjekket:** klikk på en scene i oversikten åpner scenen.
- **Hvordan:** skriptet (`navigasjon`): «Per scene» → klikk på scenehodet «INT. STUA …» → `/manus?scene=<forekomst>` og scenen er valgt i scenelisten (`#nav-<forekomst>[aria-current=true]`). Lenken «Åpne i sceneeditoren» på en rad åpner sceneeditoren med samme scene valgt («Velg scene. Valgt: 2 EXT. GÅRDSPLASSEN - KVELD»).
- **Skjermbilder:** `v3-16-oversikt-til-manus.png`, `18-oversikt-varighet.png`.
- **Resultat:** uten avvik.

### REQ-0168 – Sceneeditor som sentral arbeidsflate

- **Sjekket:** at sceneeditoren kan åpnes for valgt scene fra hovedmenyen og fra manus/tidslinje.
- **Hvordan:** skriptet (`navigasjon`): fra monteringen (tidslinjen) åpner «Åpne i sceneeditoren» scene 3 – bestått; fra oversikten – bestått. Fra manuset: scene 4 valgt i scenelisten.
- **Skjermbilder:** `v3-17-montering-til-sceneeditor.png`, `v3-18-manus-scene-valgt.png`, `v3-19-meny-til-sceneeditor.png`.
- **Resultat: avvik.**
  1. Manuset har ingen lenke til sceneeditoren for valgt scene (inspektøren for scenen har lenke til monteringen, `src/app/script/Inspector.tsx:89`, men ikke til sceneeditoren; den eneste lenken er under «Hendelser i 2D-scenen» for en linje med koblet hendelse, `src/app/script/BlockLinksSection.tsx:92`).
  2. «Sceneeditor» i hovedmenyen (`src/app/shell/ProjectNav.tsx`) åpner `/prosjekt/$projectId/scene` uten `?scene=`, så sceneeditoren viser scene 1, ikke scene 4 som var valgt i manuset (`src/app/scene-editor/SceneEditorWorkspace.tsx:140`).

### REQ-0405 – Hovedoversikt over prosjektets tilstand

- **Sjekket:** de ti nøkkeltallene og at de oppdateres.
- **Hvordan:** skriptet (`oversikt`) leser oversikten: produksjoner (tabellen «Produksjoner»), antall scener («13 aktive scener»), total estimert spilletid («Bare manusestimat»), bekreftet spilletid («Bekreftet»), ferdige, under arbeid og mangler produksjon (statusfilteret og tabellen), renderingsjobber («AI-budsjett og jobber» → «Jobber»), synkroniseringsavvik («… manusendringer etter at 2D-scene eller film ble laget») og AI-forbruk («Denne måneden: … anslått … kreditter»). Oppdatering: planlagt lengde 2:00 for scene 3 → «Forventet lengde nå» går fra 2:53 til 4:39 straks.
- **Skjermbilder:** `v3-01-oversikt.png`, `v3-02-oversikt-jobber.png`, `v3-23-oversikt-oppdatert.png`, `18-oversikt-varighet.png`, `78-ai-budsjett-og-jobber.png`.
- **Resultat: avvik.** API-kostnadene med egne nøkler (USD, DEC-0069) summeres ikke på oversikten: `src/app/ai/AiPanel.tsx:224–235` viser antall genereringer og anslag i kreditter (Lovable); USD vises bare per jobb (`AiPanel.tsx:355`) og som forbruk per bruker i «AI-leverandører» (`src/app/ai/use-providers.ts`). Prosjektets kostnad i USD denne måneden finnes ikke på oversikten. «Renderingsjobber» er AI-jobbene; eksport kjører i nettleseren og har ingen jobbliste (merknad, ikke avvik).

### REQ-0424 – Helhetlig profesjonell visuell identitet

- **Sjekket:** samme designsystem på alle skjermer.
- **Hvordan:** skriptets gjennomgang av 14 visninger: all grensesnittekst bruker Inter/JetBrains Mono/Courier Prime; ingen tekst under 11 px; alle tekstfarger er tokenfarger; kontrast ≥ 4,5:1 (3:1 for stor tekst) overalt; alle knapper, lenker og felt har tilgjengelig navn; fokusringen synes på menyvalgene (`v3-09-fokus-meny.png`). Manuell gjennomgang av skjermbildene: samme flater, linjer, radier og ikonfamilie (Lucide) i alle moduler.
- **Skjermbilder:** `v3-01` … `v3-15`, `v3-24-oversikt-rullet.png`, `67-gruppe-lyser.png`, `29-sceneeditor.png`.
- **Resultat: avvik.**
  1. **Prosjektoversikten kan rulles ut i en tom skjerm.** Dokumentet er 2340 px høyt i et vindu på 900 px. Årsaken er de to skjulte etikettene (`sr-only`, `position: absolute`) i invitasjonsskjemaet, `src/app/projects/ProjectOverview.tsx:204` («E-post») og `:215` («Rolle»): de har ingen posisjonert forelder og plasseres langt nede i siden, slik at hele siden blir høyere enn appens ramme. Scenario: åpne prosjektoversikten og rull med musehjulet til bunnen og videre – toppfeltet og menyen forsvinner og skjermen blir tom (`v3-24-oversikt-rullet.png`; også synlig i `78-ai-budsjett-og-jobber.png`, der menyen slutter midt på skjermen).
  2. «Gnist»-ikoner for AI bryter designsystemets ikonregel (§6: «AI-generering = egen nøytral glyf (ikke «gnister»)») – se REQ-0426.
  - Observasjoner (ikke regnet som avvik): enkelte etiketter brytes eller kuttes i verktøylinjen i manuset ved 1440 px («Vis kun valgt scene» på tre linjer, «Alle objekter og s…», `v3-03-manus.png`) og i plakatinspektøren («Karakter- og univer…», `v3-08-utgivelse.png`). Kamerautsnittet på tidslinjen i sceneeditoren har en blå → rød gradient; den er godtatt fordi den har samme betydning som start- og sluttrammen (§2.5).

### REQ-0426 – Unngå leketøy- eller AI-demo-uttrykk

- **Sjekket:** manuell designgjennomgang mot anti-mønstrene, med automatiske kontroller der det går.
- **Hvordan:** skriptet: ingen emoji, ingen gradienter i krom, ingen radier over 8 px eller pilleknapper; ikoner med klassene `lucide-sparkles`/`lucide-wand-sparkles` telles. Manuell gjennomgang av alle skjermbildene: ingen heltebilder, maskoter, glød eller kortgrid-dashbord; prosjektoversikten er tabeller og lister.
- **Skjermbilder:** `v3-07-montering.png`, `v3-11-generer-scene.png`, `v3-13-ai-leverandorer.png`, `v3-08-utgivelse.png`, `45-montering.png`, `79-generer-scene.png`.
- **Resultat: avvik.** «Sparkles»-ikonet brukes som AI-symbol 19 steder i 12 filer, bl.a. «Generer scene …» (`src/app/assembly/ClipPanel.tsx:306`), dialogtittelen «Generer scene …» (`GenerateSceneDialog.tsx:235`), «AI-leverandører …» (`src/app/projects/ProjectsScreen.tsx:128`), «Lag video»/«Ja, generer» (`SceneVideoSection.tsx:489, 510, 525`), `BatchVideoDialog.tsx:422, 457`, `GenerateImagePanel.tsx:296, 526, 541`, `GenerateSoundPanel.tsx:223, 238`, `AiPanel.tsx:558`, `AssetDetail.tsx:832`, `AssetWorklistDialog.tsx:234`, `StyleGuideSection.tsx:598`, `AiUpdateSection.tsx:160, 175`. I tillegg tryllestav (`Wand2`, tegnes som `lucide-wand-sparkles`) på «Lag utkastet på nytt» i plakatinspektøren (`src/app/release/PosterInspector.tsx:500`). Både DESIGN_SYSTEM §1/§6 og ANTI_PATTERNS («Sparkles/tryllestav-ikoner overalt for AI») sier at dette ikke skal brukes. Resten av uttrykket er i tråd med designsystemet.

### REQ-0427 – Logisk tilgang til de 14 hovedområdene

- **Sjekket:** at hvert område nås fra hovedmenyen eller en logisk overordnet visning, også med tastatur.
- **Hvordan:** skriptet (`omrader`, `tastatur`) klikker seg gjennom menyen og finner hvert område: 1 prosjektoversikt, 2 produksjonsvelger (oversiktens «Produksjoner» og velgeren i monteringen/manuset), 3 manus, 4 ressursbibliotek, 5 karakterkontinuitet («Kontinuitetsanalyse» på oversikten, kontinuitet per ressurs i biblioteket), 6 sceneeditor, 7 kamera og tidslinje («Kamera» og sporene i sceneeditoren), 8 lyd og dialog (lydsporene og «Dialog med AI-stemmer …» i monteringen), 9 AI-generering («Generer scene …»), 10 renderingskø («AI-budsjett og jobber»), 11 filmmontering, 12 plakater og presentasjoner (Utgivelse), 13 eksport («Eksporter» i manus, «Eksporter animatic» i monteringen), 14 prosjektinnstillinger (format, bildefrekvens, medlemmer). Tastatur: Tab når de seks menyvalgene i rekkefølge med synlig fokusring, og Enter på «Manus» åpner manuset.
- **Skjermbilder:** `v3-01` … `v3-09`.
- **Resultat:** uten avvik (20 av 20 kontroller).

### REQ-0428 – Hovedområder som funksjonelle moduler

- **Sjekket:** at informasjonsarkitekturen samler flere områder i én visning uten å bryte tilgangen.
- **Hvordan:** resultatet fra REQ-0427 (alle 14 nås) sammen med antall menyvalg (6). Manuell IA-gjennomgang: oversikten samler produksjoner, varighet og status, kontinuitetsanalyse, AI-budsjett og -jobber, format og medlemmer; monteringen samler tidslinje, lyd/dialog, AI-video og eksport; sceneeditoren samler 2D-scene, kamera og tidslinje.
- **Skjermbilder:** `v3-01-oversikt.png`, `v3-06-sceneeditor.png`, `v3-07-montering.png`.
- **Resultat:** uten avvik.

### Kontroller for krav i del A

- **REQ-0175 (maske, pikselkontroll i Chromium):** skriptet (`maske`) importerer kjernen og kompositoren fra dev-serveren og tegner et rødt bildelag (200 × 100) på et ekte lerret. Uten maske dekker laget hele flaten; rektangelmaske (50, 25, 100 × 50): rødt innenfor (også ved kanten), svart utenfor; snudd maske: omvendt; ellipsemaske: midten rød, hjørnet av rektangelet svart. Kildebildet har fortsatt rødt i alle piksler, og ressursversjonen i biblioteket er uendret. **Uten avvik.**
- **REQ-0243 («Generer scene» fra scenevisningen):** scenepanelet i monteringen har «Generer scene …»; den åpner «Generer scene 2 – EXT. GÅRDSPLASSEN - KVELD» med inndeling og beskrivelser (`v3-22-generer-scene.png`, `79-generer-scene.png`). **Uten avvik.**
- **REQ-0585 (omriss i scenen for valgt gruppe):** `67-gruppe-lyser.png` viser gruppen «Familien» valgt: medlemmet «Bestemor Anne» er markert i laglisten og har stiplet omriss på lerretet. Dra og slipp inn i og ut av gruppen i nettleseren: `tests/visual/interactions-e2e.mjs` (`grupper-inn`, `grupper-ut`) – 14 av 14 kontroller bestått 12.10.2026. **Uten avvik.**
