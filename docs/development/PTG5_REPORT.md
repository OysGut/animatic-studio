# PTG5 – rundtur fra Dragonframe

## Levert
- Import fra mappe, ZIP eller eksportert MP4/MOV. Mappe/ZIP leser `take.xml` og hovedeksponeringer (`*_X1_*`).
- XML leses med nettleserens namespace-støtte; ren EDL-policy i `src/core/interchange/dragonframe-import.ts` skiller filnummer fra tidslinjeposisjon. Gjentatte eksponeringer beholdes, skjult-bit maskeres og skjulte/slettede bilder utelates med varsel. Manglende bilder varsles som delvis ferdig.
- Entydig PTG1-navn gir foreslått sceneforekomst og viser eksportversjonen. Ukjent eller flertydig navn krever eksplisitt `SceneSelect`.
- For kort/lang take og feil bildefrekvens varsles uten å blokkere lagring. Sammenligningen inkluderer håndtak fra utvekslingsmodellen.
- Bildene kodes til én MP4 i nettleseren. Eksisterende `uploadFilm` og `AddTake` brukes; ingen `SetSceneEdit` eller automatisk aktivering. Eksportversjonen beholdes i filmnavnet.
- Eksisterende takevelger kan aktivere filmen, og eksisterende `filmClips`/`sourceAt` blander film og animatic per skudd. `CompareTakesDialog` gjenbruker `CompareVersionsDialog` for importerte takes.
- `AGENTS.md`: alle scenevalg bruker `SceneSelect`/`SceneMark`, aldri native scene-select.
- `interactions-e2e.mjs`: eksplisitt nb-profil, nb-NO og lokalt nb-valg. Plakattesten velger tittelen eksplisitt via Element-fanen i stedet for å anta gammel plassering.
- 25 nye `ptg5.*`-tekster via `t()`, nb/en og fr/es/ru/ja/ko/de/it/pt-BR med kildehash. De åtte sistnevnte er maskinoversatt og merket for gjennomlesing.

## Verifisering
| Kontroll | Resultat |
|---|---|
| Automatisk type-/byggkontroll | build OK, siste avlest 06:46:12 UTC |
| Full `bunx vitest run` etter regenerering | 2336 bestått, 0 feilet, 10 eksisterende hoppet over; 288 testfiler bestått |
| PTG5 unit | 7/7: EDL, skjult-bit, toere, ugyldig XML, manglende filer, navn, håndtak/fps, inaktiv import, bevarende invers, blandet film |
| Lokal DB, isolert Postgres 54329 | 158 bestått, 0 feilet; ingen Cloud-endringer |
| `i18n/check.mjs` | 0 tekster uten engelsk i 0 filer; alle registrerte språk valideres |
| `i18n/release-check.mjs` | bestått |
| `ptg5-roundtrip.mjs`, nb / UI_LANG=en | 18/18 på hvert språk: ekte MP4-koding, dekoding bilde for bilde, toere, varsel, manuell kobling og MP4-filmimport |
| `ptg2-dragonframe.mjs`, nb / UI_LANG=en | 21/21 på hvert språk, én suite om gangen |
| `interactions-e2e.mjs`, eksplisitt nb, hele suiten | 44/44 |
| `export-e2e.mjs` | lastet ned MP4 922906 byte, ingen blokkert trafikk |

Nettlesersuitene bruker faste innloggede fixturer og mockede tjenester; ingen ekte AI/betalte kall. Opplasting, kommando og gjenlest take er testet mot mock. Sammenligningsvinduet viser den nye filmversjonen, men mocklagringen leverer ikke en ekte videostrøm til avspilleren. Ekte opplasting/avspilling i Cloud er derfor **ikke verifisert**.

## Migrasjon og funksjoner
Ingen ny migrasjon nødvendig. Ingen databasefunksjoner erstattet. Takes og filreferanser bruker eksisterende modell, lasting, backup og oppryddingsreferanser. Ingen rå bildesekvens lagres; den valgfrie sekvenslagringen er ikke implementert.

## Avvik og begrensninger
- H.264 forsøkes først; som eksisterende animatic-eksport brukes VP9/AV1 i MP4 hvis nettleseren ikke kan kode H.264. Testnettleseren brukte denne reserven. Ingen ny pakke eller betalt tjeneste.
- Angring av AddTake bevarer produsert materiale og gjenoppretter aktivt valg etter eksisterende INV-07; den sletter ikke den importerte filmen.
- Navnekobling bruker den gjeldende utvekslingsmodellens navn. Endret scenenummer/prosjektkode kan gjøre eldre eksportnavn ukjent, og krever manuell scenevalg. Eksportloggens reservasjon inneholder ikke et stabilt historisk navn→ID-kart.
- Dragonframe XML-varianter uten kjent fps-felt krever brukerens bildefrekvens. TIFF kan bare importeres dersom nettleseren dekoder formatet. Ekte Dragonframe-versjoner er ikke testet.
- Kunstige fixturer for toere, kort/lang take og skjulte bilder ligger i `tests/fixtures/ptg5/`. Bildene er syntetiske, ikke brukerens medier.

## Endrede filer
- `AGENTS.md`, `roadmap.md`, `TODO.md`.
- `src/core/interchange/dragonframe-import.ts`.
- `src/app/assembly/dragonframe-import.ts`, `DragonframeImportDialog.tsx`, `AssemblyWorkspace.tsx`, `CompareTakesDialog.tsx`.
- `tests/unit/ptg5-roundtrip.test.ts`, `tests/visual/ptg5-roundtrip.mjs`, `tests/visual/interactions-e2e.mjs`.
- `tests/fixtures/ptg5/{twos,short,long}/take.xml` og fire syntetiske `PTG-TEST_SC001_SH010_v003_X1_0001.png`–`0004.png` i hver mappe.
- `src/core/i18n/authored.json`, regenerert `catalog.gen.ts`, `runtime.gen.json`, `locales/{nb,en,en-XA,fr,es,ru,ja,ko,de,it,pt-BR}.json`.
- Regenererte inventarfiler `scripts/i18n/{references.v1.json,candidates.v1.json,inventory-report.json}`.
- Denne rapporten: `docs/development/PTG5_REPORT.md`.

## Åpne spørsmål
Ingen nye produktspørsmål. Ekte Dragonframe-/Cloud-rundtur må prøves av Trollfilm, notert i TODO.md.