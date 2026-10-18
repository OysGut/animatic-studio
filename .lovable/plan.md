# Plan: Motion Typography Studio (MT1–MT9) med GP6

Skjemaversjon 47, så neste migrasjon er 0048. Når planen er godkjent, lagres spesifikasjonen ordrett i `docs/product/phase3/MOTION_TYPOGRAPHY_SPEC.md`. Migrasjonene skrives, men kjøres ikke. Merking: **[B]** betyr brukerbekreftet krav (spesifikasjonen §75). **[T]** betyr mitt tekniske forslag, som må godkjennes.

## 1. Kartlegging (§73): hva som gjenbrukes

| Del | Fil | Bruk i MTS |
|---|---|---|
| Lagmodell | `src/core/model.ts` (`CompositionLayer`, `LayerKind`, `Composition`) | Utvides med tekst og form. Ingen ny objektmodell |
| Tegning | `src/core/composition/render.ts` (`renderFrame`, `DrawItem`) | Ny `DrawItem.kind = "text"`. Bokstavanimasjonen beregnes her |
| Lerret | `src/engine/compositor/canvas.ts` (`drawFrame`, `paintItem`) | Ny tegnegren for tekst og effekter |
| Film og eksport | `src/engine/compositor/film.ts` og `src/engine/export/animatic.ts` (WebCodecs og mediabunny, mp4) | Uendret vei. Tekst er bare nye tegneelementer |
| Nøkkelbilder og baner | `composition/animate.ts`, `path.ts`, `group.ts`, `segments.ts`, `timing.ts`, `retime.ts` | Gjenbrukes som de er. Inn- og utoppsett lager nøkkelbilder |
| Aktivt tidsområde | `activeRange` (AS2) | Synlighetsintervall for elementer og sider |
| Grupper | `kind: "group"` (DEC-0052) | Brukes til navn, rolle og logo-grupper (§5) |
| Maske og blending | `mask`, `blend` (REQ-0175) | Wipe-overganger og blend mode |
| Sceneeditor | `src/app/scene-editor/*` (`LayerInspector`, `inspector-fields.tsx`, `AddLayerDialog.tsx`, `LayerMotion.tsx`) | Får nye tekstfelt og effektfelt. Lerretet og tidslinjen brukes av alle arbeidsflatene |
| Asset Studio | `src/app/asset-studio/*` (`VariantStrip.tsx`) | GP6: globale varianter |
| Bibliotek | `src/core/library/*` og `global.ts` (`kind "template"` finnes) | Maler lagres som ressurs, variant og versjon |
| Lyd | `src/core/audio/*` og `engine/audio/*` | Sekvensenes lydspor er vanlige lydklipp på komposisjonen |
| Produksjon | `SceneOccurrence`, `Scene`, `production/*`, `assembly/*` | Tekstscene, tittel og rulletekst blir sceneforekomster med egen type |
| Videreføring | `carry-over.ts` (GP3) | «Bruk samme design som i scene 5» |
| Backup | `src/core/backup` | Utvides med nye felt og tabeller |
| Fonter | `@fontsource/*` i `src/styles.css` | Utvides med fontkatalogen |

## 2. Datamodell

**Tekstlag [T]:** et nytt `LayerKind` `"text"`, ikke et felt på alle lag. Laget får et nytt valgfritt felt `text: TextSpec`:
- innhold;
- font, størrelse, vekt og stil;
- farge og opasitet;
- bokstavavstand, linjehøyde og justering (horisontalt og vertikalt);
- boksbredde og bryting;
- effekter: skygge, glød og kontur;
- `letterAnim` (se punkt 3).

`width` og `height` er tekstboksen. Transformasjonen, nøkkelbildene, masken, blendingen, gruppen og `activeRange` er de samme som for alle andre lag. En egen tekstmotor finnes ikke.

**Former [T]:** et nytt felt `shape: { type: "rect" | "ellipse" | "line", radius, stroke }` på dagens fargeflatelag (`fill`). Det blir ikke en ny lagtype. Effektene (`shadow`, `glow`, `outline`) er et felles valgfritt felt `effects` på alle lag (§4).

**Mal, innhold og forekomst (§11–12), tre nivåer [B] med teknisk løsning [T]:**
1. **Maldefinisjon** er en ressurs med `kind = "template"`, en variant per oppsett og en uforanderlig `AssetVersion`. `template_json` beskriver lagene, felt-plassene (`slot`: tekst, bilde eller logo, med en nøkkel som `name`), animasjonene og tiden. Prosjektbiblioteket og det globale biblioteket (GP2) bruker de samme tabellene og den samme «Bruk i prosjekt»-kopien. Malen er en JSON-fil i lagringen, kopiert én gang per global versjon.
2. **Innhold** er en ny tabell `template_contents`: `values` (slot → tekst eller ressurs-ID) og et valgfritt `participant_id`.
3. **Forekomst** er en ny tabell `template_instances`, med komposisjon, `template_version_id` (låst), lokale overstyringer og gruppelaget som er laget i scenen.

Når en mal brukes, bygges vanlige lag i scenen fra malversjonen og innholdet, slik at alt kan redigeres. Lagene får `templateInstanceId` og `slot`. Ny malversjon gir bare et varsel: «Ny versjon – oppdater?». Ved oppdatering bevares lokale overstyringer, og godkjente forekomster endres aldri automatisk (§15, AI/AJ).

**Rulletekst (§19–21):** to nye tabeller.
- `credit_participants`: rekkefølge (`order_key`), gruppe (`group_key`), `hidden`, felt (`fields` jsonb) og logo- og bildereferanser.
- `credit_sequences`: per forekomst, med presentasjonsform (`roll`, `one_at_a_time`, `positions`), varighet per deltaker, pause, overgang, hastighet, retning og malvariant per gruppe.

Deltakerne er adskilt fra malen.

**Scenetype [T]:** `SceneOccurrence.kind?: "scene" | "title" | "text" | "credits"`. Når feltet mangler, er det `"scene"`. Tittel- og tekstscener har sider. **Side [T]** er en ny lagtype `"page"`: et gruppelag med `activeRange` og en overgang. Sidene sorteres, dupliseres og skjules med eksisterende kommandoer, og det trengs ingen egen sidetabell.

**Migrasjoner:**
- `0048_text_layers.sql`: lagkolonnene `text`, `shape`, `effects`, `template_instance_id` og `slot`, kind-sjekk og størrelsesgrenser på jsonb, og `occurrences.kind`.
- `0049_templates_credits.sql`: tabellene `template_contents`, `template_instances`, `credit_participants` og `credit_sequences` etter sjekklisten (project_id, removed, revision, RLS for medlemmer), samt `apply_changes`, `delete_project` og `purge_*` (siste definisjoner kopieres ordrett, med delete-rekkefølge barn før foreldre).
- `0050_export_credits.sql` (kanskje): eksportinnstillingen `include_credits`, hvis den ikke får plass i eksisterende `export_settings`-json.

`schema_version` og `EXPECTED_SCHEMA_VERSION` økes for hver migrasjon.

**Backup:** de nye tabellene og lagfeltene tas med i `src/core/backup`. Malfilene er vanlige prosjektfiler. Koblingen til det globale biblioteket lagres bare som metadata, som i GP2, så en gjenoppretting virker uten gruppemedlemskap.

## 3. Animasjon på bokstavnivå (§9, §29)

`text.letterAnim` har:
- `unit`: bokstav, ord eller linje;
- `effect`: fade, appear, slide eller scale, med retning;
- `delayFrames` mellom enhetene, varighet, easing og `order` (fra start, slutt, midten eller tilfeldig med frø).

`renderFrame` beregner hver enhets tilstand ut fra tiden i laget, og legger den som `glyphs[]` på tekst-elementet. Lerretet tegner enhetene hver for seg. Hele lagets nøkkelbilder virker samtidig. Teksten lagres som tekst og kan redigeres. Eksempelet F → FI → FIL → FILM er `appear` med per-bokstav-forsinkelse.

Bokstavplasseringen (bryting og bredder) trenger måling av fonten. **[T]** En liten port `TextMeasurer` i `src/core` gjør det. Nettleseren og eksporten bruker samme implementasjon med `OffscreenCanvas.measureText`, og testene bruker en fast måler. Kjernen forblir plattformnøytral.

## 4. Inn- og utanimasjoner (§8) og overganger (§10)

Ren kjernefunksjon `applyMotionPreset(layer, preset, {phase: in|out, durationFrames, direction})`. Den gir nøkkelbilder og eventuelt en maske (wipe), og lagres som én kommando med invers, så alt kan redigeres etterpå.

- Oppsettene: fade, slide, wipe, zoom, rotasjon, bane og gradvis fremkomst.
- Overganger mellom sider og deltakere er de samme oppsettene, brukt ut og inn på to sider som overlapper.
- Mellom sceneforekomster brukes eksisterende `Transition`.

## 5. Arbeidsflatene

Alle bruker sceneeditorens lerret, tidslinje og egenskapspanel med en egen sidekolonne. Det blir ingen kopi.

| Flate | Plassering | Lagring |
|---|---|---|
| Frittstående tekst (§46–49) | Sceneeditoren: «Legg til tekst» i `AddLayerDialog` | Vanlig tekstlag. «Lagre som mal» |
| Lower thirds (§39–45) | Sceneeditoren: «Lower third» (velg mal eller «Bruk samme design som i scene …») | `template_instance` og gruppelag. Innholdet redigeres i egenskapspanelet |
| Filmtittel (§27–33) | Ny sceneforekomst `kind = "title"` i monteringen. Åpner sceneeditoren i tittelmodus med sidepanel | Egen del av filmen, med sider som `page`-lag og eget lydspor |
| Tekstscene (§34–38) | «Ny tekstscene» mellom scener i monteringen og manuset | `kind = "text"`, flyttes med eksisterende produksjonsfunksjoner, uten bilde av teksten |
| Rulletekst (§16–26) | `kind = "credits"`, editor med to faner: «Design» (lerret) og «Medvirkende» (tabell) | Valgfri del av filmen (`credit_sequences` og deltakerne) |

**Rulletekst og ytelse (§63) [T]:** lagene for deltakerne lagres ikke. `renderFrame` lager dem virtuelt fra mal, deltakere og tid, og tegner bare de som er synlige i bildet. Rullingen er en ren funksjon av tiden, så resultatet er forutsigbart. Tabellen er virtualisert. Målet er 2000 deltakere uten treghet, og det testes med en ytelsestest i kjernen.

**«Bruk samme design som i scene 5» (§14, §43):** listen over forekomster i prosjektet, med scenenummer og miniatyr. Valget lager en ny forekomst av samme malversjon med tomt innhold (eller en kopi), og gjenbruker GP3-mønsteret.

## 6. Lyd og eksport

- Tittelen, tekstscenen og rulleteksten får lydklipp på sin egen komposisjon med eksisterende lydvinduer. Avspillingen og eksporten bruker samme tidsakse (§53–55).
- Eksporten (§26, §57) får et avkrysningsfelt «Inkluder rulletekst», som er på som standard. Valget filtrerer bort forekomster med `kind = "credits"` bare i eksporten, og ingenting slettes eller deaktiveres.
- Grafikken tegnes rett inn i videostrømmen gjennom `renderFrame` og `drawFrame` (§56). Det blir ingen forhåndsflating. Komposisjonen bevares og kan redigeres etter eksport (W, AL).

## 7. Fonter (§61)

**[T]** En fast, kuratert fontkatalog i `src/core/typography/fonts.ts`: OFL-lisenserte fonter fra `@fontsource`, med ID, familie, vekter, lisens og tegnsett.
- Det kreves én nye pakke per font. Hvilke fonter det blir, avgjør Øystein (se åpne spørsmål).
- Fontene lastes med `FontFace` og `document.fonts.load` før forhåndsvisningen og før eksporten. Eksporten starter ikke før alle fontene i filmen er lastet (`fontsReady(state)`).
- Fontfilene ligger i appbunten. Brukeropplastede fonter er utenfor denne runden.
- Manglende font gir en reservefont og en synlig advarsel i egenskapspanelet og i eksportdialogen.
- Testen tegner «ÆØÅ æøå» og spesialtegn i nettleseren og i eksportveien (OffscreenCanvas), og sammenligner bredder og piksler innenfor en toleranse.

## 8. GP6

- **Asset Studio (§38 global):** variantstripen får en seksjon «Fra globalt bibliotek» for ressurser som er koblet til det globale biblioteket. Et drag kopierer versjonen inn med GP2-«Bruk i prosjekt» (én kopi per versjon) og legger det inn som vanlig `ImageSwap` i utkastet.
- **MTS:** logo- og bildeplasser og malvalget åpner `GlobalLibraryDialog` filtrert på logo eller `template`. «Lagre mal globalt» bruker `SaveToGlobalButton`. Dette dekker M1–M5.

## 9. Arbeidspakker og rekkefølge

| Pakke | Innhold | Migrasjon |
|---|---|---|
| MT1 | Lagre spesifikasjonen. Tekstlag, former og effekter i modell, kommandoer, patch, backup og `renderFrame`. Fontkatalog og `TextMeasurer`. Lerretet tegner tekst | 0048 |
| MT2 | Egenskapspanel for tekst og effekter, «Legg til tekst», frittstående tekst (AD–AF) | – |
| MT3 | Bokstavanimasjon og inn- og utoppsett (N, D, C) | – |
| MT4 | Mal, innhold og forekomst. «Lagre som mal», versjonsvarsel og oppdatering (E, AG, AH, AI, AJ) | 0049 |
| MT5 | Lower thirds og «Bruk samme design som i scene …» (X–AB) | – |
| MT6 | Scenetypene tittel og tekstscene, sider, sideoverganger og lydspor (O–S, T–W) | (i 0048) |
| MT7 | Rulletekst med deltakerregister, presentasjonsformer, virtuell tegning og lyd (F–L) | (i 0049) |
| MT8 | Eksport med «Inkluder rulletekst» og fontsjekk før eksport (M, W, AL) | 0050? |
| MT9 | GP6 og globale maler og logoer (K, Q, AC, M1–M5) | – |

## 10. Tester

- **Unit:** én eller flere tester per pakke.
  - Kommandoer med invers, angre og gjør om.
  - `renderFrame`-tester for tekst og bokstavtid (FILM-sekvensen).
  - Oppsettene gir nøkkelbilder.
  - Malbygging, overstyringer og versjonsoppdatering, som aldri skriver over godkjente forekomster.
  - Rulleteksten: rekkefølge og skjuling endrer ikke malen, og ytelse med 2000 deltakere.
  - Eksportfilteret for rulletekst.
  - En test som viser at forhåndsvisning og eksport kaller samme `renderFrame` med samme resultat (§60).
- **Arkitekturtester:** ingen ny tegnefunksjon for tekst utenfor `render.ts` og `canvas.ts`.
- **DB:** RLS, `apply_changes` og sletting og purge for de fire nye tabellene, og at `occurrences.kind` og lagkolonnene håndheves.
- **Nettlesertester:**

| Fil | Dekker |
|---|---|
| `tests/visual/mts-engine.mjs` | A–E, AD–AH |
| `tests/visual/mts-credits.mjs` | F–M |
| `tests/visual/mts-title.mjs` | N–R |
| `tests/visual/mts-textscene.mjs` | S–W |
| `tests/visual/mts-lower-thirds.mjs` | X–AC |
| `tests/visual/mts-nondestructive.mjs` | AI–AL |
| `tests/visual/mts-global.mjs` | M1–M5 |

Alle bruker `VISUAL_SCHEMA_VERSION`, `data-*`-ID-er og mockede serverfunksjoner, og de tester også engelsk visning.

## 11. Risikoer

- **Fonter:** ulik tegning mellom nettlesere og manglende fonter. Det håndteres med pakkede fonter, lasting før tegning og sammenligningstesten.
- **Ytelse:** lange rulletekster og bokstavanimasjon på lange tekster. Det håndteres med virtuell tegning og en øvre grense for antall tegn per lag ([T], for eksempel 2000).
- **Glød og skygge** i canvas er tunge. De tegnes med `shadowBlur`, slik masken gjør i dag.
- **Scenetypene** berører montering, manussynk og nummerering. Tittel- og tekstscener er ikke manusscener, og det må avklares.

## 12. Åpne spørsmål

1. **Fonter:** hvilke fonter skal være med (for eksempel 8–12 OFL-fonter)? Det gir nye npm-pakker, som må godkjennes.
2. **Manus:** skal tekstscener og titler vises i manuset (som «MELLOMTEKST»), eller bare i filmstrukturen? Jeg foreslår at de bare vises i filmstrukturen, med en markør i manusvisningen.
3. Er en øvre grense på 2000 tegn per tekstlag og 2000 deltakere akseptabel?
4. Skal «Inkluder rulletekst» være på som standard?
5. Skal deling via QR (GP5) følge eksportvalget for rulletekst? Jeg foreslår ja.
