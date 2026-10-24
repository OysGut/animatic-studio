# SB-3 – panelredigering

Dato: 24.10.2026. Ikke publisert. 0103 er låst. `0104_sb3_panel_editing.sql` er skrevet og prøvd lokalt, ikke kjørt i Cloud.

## Bygget

- Panelredigering i eksisterende sceneeditor med permanente ressurs- og versjons-ID-er, proporsjonsbevarende innsetting, flytting, skalering, rotasjon, lagrekkefølge, låsing og synlighet. Ingen kopi av kildebildene.
- Lapp, pil/linje, figur, tekst og kameramerke gjennom eksisterende lagkommandoer og felles compositor. Lapper har type, forankring og behandlet-flagg; notatvisning er et visningsvalg. Kommentarer bruker eksisterende annotasjoner og reversibel avklaring.
- Pil blir bevegelsesbane bare via eksplisitt valg av scenelag og bekreftelse, som et vanlig `UpdateSceneDraft`. Ingen automatisk bane eller endring av ferdig scene.
- Godkjent panel er skrivebeskyttet. «Rediger storyboard» grupperer snapshot før ny status; tidligere revisjoner kan vises uten å skrive over dem.
- Panel- og scenemerker låses på panelmetadata. Nye paneler etter låste paneler får bokstavtillegg (12A, 12B), uten å endre eksisterende nummer. «Nummerer på nytt» viser plan og går via en angregruppe. Permanente ID-er endres ikke.
- Standard-/egendefinerte prosjektfelt, replikker koblet med blokk-ID, utsnitt, vinkel, fokallengde og bevegelsesbeskrivelse. Paneldata følger lasting, endringslogg og sikkerhetskopi; gjenoppretting remapper replikk-ID-er.
- Eksisterende skuddliste får storyboardfelter i CSV/JSON, knyttet til permanent forekomst-ID, og `storyboard.json` i samme ZIP. Uten storyboardpaneler er eksisterende eksportdata uendret. Ingen ny eksportflate eller SB-4-filmeksport.
- Formatmasker, sikre soner og tredjedeler er visningslag; kameramerker lagres som panelinnhold. Verktøyhurtigtaster, neste/forrige panel, nytt panel, duplisering og hjelpevindu.
- SB-2-rest: hele scener kan dras med `MoveOccurrence`; varselet sier at filmrekkefølgen endres. Jsdom-test bekrefter endret rekkefølge og angre.
- Vindu-ID V-167, dialoger V-168–V-170. AGENTS er 12 258 byte utenfor LOVABLE-blokken.

## Database

0104 legger til `compositions.storyboard`, `projects.storyboard_fields` og panel-/lagkoblinger på `script_annotations`, med restriktive fremmednøkler og JSON-størrelsestak. Ingen nye prosjekttabeller. Nye validatorer ligger i G-7-registeret; null preparer er tilsiktet for etterkontroll uten førdata. Panel-/lag-/annotasjonskontroll er avgrenset til endrede rader, så en gammel replikkkobling ikke stopper alle andre prosjektendringer. Prosjektfelt oppdateres i eksisterende prosjektradgrenen. Annotasjoner flyttes bak lag ved innsetting og foran lag ved sletting, med kollisjonsfri midlertidig negativ registerrekkefølge. Slette-/purgefunksjoner tar hensyn til nye FK-er. Alle SECURITY DEFINER har `search_path=''`.

## Tester og kontroll

- Lokalt DB: **227 bestått, 0 feilet**, også ukjent replikk, ugyldig fokallengde/type, feil feltstruktur, prosjektfelt, RLS og search_path.
- SB-3 kjerne: **9 bestått** (nummerering, angre/gjør om, prosjektfelt, row-roundtrip, backup-remapping, eksplisitt bane, lag/duplisering).
- SB-3 brukerflate: **3 bestått**, bokmål/engelsk og snapshot før ny status.
- SB-2 galleri: **13 bestått**, inkludert scenedrag/angre og 2 000 paneler.
- Eksisterende PTG1: **14 bestått**, inkludert storyboardtilleggsfelt og uendret eksport uten paneler.
- Vindus-ID: **11 bestått** (enhet + arkitektur).
- Full Vitest kjøres etter siste endringer; endelig resultat føres nedenfor.
- Forhåndsvisningens typekontroll: grønn. i18n: grønn, 0 tekster uten engelsk. Alle registrerte språk har SB-3-nøkler; fr/es/ru/ja/pt-BR/de/it/ko er maskinoversatt og merket for gjennomlesing.

## Nettleser og begrensninger

Nettleserprøven nb/en er grønn: **10 bestått, 0 feilet**, med skjermbilder kontrollert. Oppsettet venter på førstevisning og bruker intern navigasjon etter mocket innlogging. Tidligere feil kom av navigasjon før startsidens førstevisning var ferdig; ingen feil filtreres bort. Vindusmerket vises etter førstevisningen, så serverens startsidemerke ikke kolliderer med klientens scene-ID. Cloud-endepunktet er ikke prøvd med 0104: Claude må kontrollere og kjøre migrasjonen før lagring av nye felt kan virke der. Ingen betalte kall, ingen private manus og ingen SB-4-funksjoner.


## Endrede filer i SB-3-leveransen

- `AGENTS.md`, `roadmap.md`, `docs/development/SB3_REPORT.md`, `docs/development/UI_IDS.md`.
- `db/migrations/0104_sb3_panel_editing.sql`.
- `src/core/storyboard/{editing.ts,editing-commands.ts,gallery.ts,index.ts}`.
- `src/core/{model.ts,patch.ts}`, `src/core/commands/{types.ts,apply.ts}`, `src/core/composition/{index.ts,render.ts}`, `src/core/backup/index.ts`.
- `src/core/interchange/shotlist.ts`, `src/engine/export/shotlist.ts`, `src/engine/compositor/canvas.ts`.
- `src/app/storyboard/{PanelEditor.tsx,StoryboardWorkspace.tsx,AGENTS.md}`, `src/app/scene-editor/SceneEditorWorkspace.tsx`, `src/app/shared/UiId.tsx`, `src/app/ui-ids.ts`.
- `src/adapters/storage/{project-rows.ts,commands.functions.ts}`.
- `src/core/i18n/{authored.json,runtime.gen.json}`, `src/core/i18n/locales/{nb,en,en-XA,fr,es,ru,ja,pt-BR,de,it,ko}.json`.
- `scripts/i18n/{baseline.v1.json,candidates.v1.json,mapping.v1.json,references.v1.json,inventory-report.json}` (katalog-/inventargenerering).
- `tests/unit/{sb3-panel-editing.test.ts,sb3-panel-editor-ui.test.tsx,sb2-storyboard-gallery.test.tsx,ptg1-interchange.test.ts}`, `tests/db/run-db-tests.ts`.
- `tests/visual/{sb3-panel-editing.mjs,make-sb3-fixture.ts,mts-harness.mjs,schema-version.mjs}`.

Arbeidsmetodene «Arkitektur og data – Animatic Studio» og «Testing – Animatic Studio» er fulgt; de historiske skill-navnene er ikke produktnavn i brukerflaten.
