# SB-4 – tid, avspilling og delt posisjon

## Implementert
- Felles posisjon utvidet fra bare scene til produksjon, scene, panel, replikk og scenelokal tid. Den tidligere scene-bussen hadde ikke denne komplette posisjonen.
- Manus, storyboard, sceneeditor og montering leser posisjonen ved åpning. Manusutforskeren følger kildens scene/replikk uten å publisere lokal, festet browsing.
- Ctrl/Cmd+Shift+Space veksler arbeidsflate, registrert i «?». Eksisterende tilbakehistorikk gjenbrukes.
- Replikkforankringer slås opp begge veier via en ren posisjonsmodell. Eksakt tid bevares ved åpning; eksplisitt paneltid begrenses til panelets bilder.
- Scenens eksisterende lyd brukes live via filmAudio/audioBank, med samme klipp/versjoner og eksisterende automatisering. Ingen lydfil kopieres. Lydklokken er tidsmaster.
- Galleri har spill/pause/stopp, forrige/neste, fremdrift og demping. Andre scener vises på 40 %, fokus følger panel, deaktiverte scener utelates. Kortene oppdateres under avspilling.
- Vannrett mus-/berørings-/tastaturscrubbing bruker aktiv film/animatic når tilgjengelig, ellers storyboardpaneler. RTL speiler tidsretning, ikke bilder. Scrubbing pauser gallerilyden og starter aldri lyd.
- Timingforslag fra forankret manus/dialog og faktisk scenelyd kan godtas for ett panel eller samlet for en scene. Eksisterende panel-/scene-/estimat-arv vises; ingen automatisk overskriving eller trimming.
- Midlertidig panellyd via eksisterende mikrofonopptak, lydopplasting og mobil-QR. Lyden lagres som vanlig ressurs, referert fra panelet. Varighet kan brukes til paneltiming. «Bruk i scenen» krever bekreftelse og lager vanlig lydklipp med grupperte angrekommandoer.
- Storyboardfilm med kamerabevegelse og eksisterende filmeksport bruker felles bildekildeadapter og eksisterende eksportvindu. SB-6 utskrift/CSV/XLSX er ikke startet.

## Database og sikkerhet
- Ny fil `0105_sb4_temp_audio_safety.sql`; 0104 og eldre er uendret/låst.
- Registrert validator kontrollerer midlertidig lyds prosjekt, ressurs, versjon, MIME og varighet (maks 3 600 000 ms).
- purge_removed_assets beholder lyd referert av paneler, også fjernede paneler som kan angres. Frakobling tillater sletting.
- Sikkerhetskopi avviser manglende eller feiltilknyttede lydreferanser. Eksisterende ressursmedier og rekursiv ID-omskriving gjenbrukes.
- Alle SECURITY DEFINER-funksjoner har search_path=''. Migrasjonen er bare testet lokalt, ikke kjørt i Cloud.

## Verifisering
- Lokal full DB-suite: **228 bestått, 0 feilet** med migrasjoner til 0105; før endring 227/0. Ingen Cloud-data endret.
- Endelig full Vitest etter siste endring: **2913 bestått, 0 feilet, 10 eksisterende hoppet over**, 364 testfiler bestått, 2 hoppet over.
- Målrettet posisjon/backup/galleri/avspilling: **49 bestått, 0 feilet**; ytterligere to konkrete tester er lagt til for posisjonsbuss og backup.
- Nettleser nb/en med syntetiske prosjektdata og mockede tjenester: **18 bestått, 0 feilet**, ingen kjørefeil. Scrubbing, pause/spill, arbeidsflatebytte med panel, timing og eksplisitt lydbruk prøvd.
- Automatisk typekontroll/forhåndsvisning: build OK, ingen typefeil i siste signal.
- Språkinventar og alle registrerte språkkataloger: grønne. Nye fr/es/ru/ja/pt-BR/de/it/ko-tekster er maskinmerket for gjennomlesing.

## Begrensninger og ærlig reststatus
- Ingen live Cloud-lagringsflyt med 0105 er verifisert; Claude må kjøre migrasjonen.
- Fysiske mikrofon-/mobil-QR-opptak og virkelige MP4/ProRes-eksportfiler er ikke prøvd ende-til-ende i denne kjøringen. Nettlesertesten prøver eksisterende midlertidig lyd og bekreftelsesflyt med mockede tjenester.
- Full separat sekvens-/produksjonsarv for paneltiming er ikke innført: dagens panel → scene → filmestimat → standard gjenbrukes. Dette veikartspunktet forblir åpent.
- Komplett femflate-rundtur med faktisk lydavlytting, mobil/RTL-visuell kontroll og alle tilbake/replikkkombinasjoner er ikke verifisert. Testene dekker kjerne-RTL og storyboard→scene-hurtigtast, ikke alle kombinasjoner.
- Mobilimport bruker eksisterende to-minutters claim-utløp for retry; ingen ny claim-frigivelse er laget.
- Ingen publisering og ingen betalte AI-kall.

## Endrede filer
- `AGENTS.md`: kort regel om scenelokal posisjon og N8 innenfor bytegrensen.
- `src/app/shell/active-scene-bus.ts`, `current-scene.ts`, `use-position-playback.ts`, `ProjectNav.tsx`: delt posisjon, tidsoppdatering og veksling.
- `src/app/script/ScriptWorkspace.tsx`, `src/app/assembly/AssemblyWorkspace.tsx`, `src/app/scene-editor/SceneEditorWorkspace.tsx`, `src/app/script-explorer/ScriptExplorer.tsx`: posisjonsgjenbruk i arbeidsflatene.
- `src/app/shortcuts/shortcut-list.ts`: veksling i hurtigtastoversikten.
- `src/app/storyboard/GalleryPlayback.tsx`, `StoryboardWorkspace.tsx`, `StoryboardFilm.tsx`, `PanelAudio.tsx`, `PanelEditor.tsx`: galleriavspilling, stille scrubbing, timing og midlertidig lyd; mobilutkast knyttes til opprettet ressurs.
- `src/core/storyboard/position.ts`, `temp-audio.ts`, `playback.ts`: ren posisjon, timing og eksplisitt lydplan.
- `src/core/backup/index.ts`: kontroll av midlertidige lydreferanser.
- `db/migrations/0105_sb4_temp_audio_safety.sql`, `src/adapters/storage/project-rows.ts`, `tests/visual/schema-version.mjs`: validator, purgevern og versjon 105.
- `tests/db/run-db-tests.ts`: validerings-, purge- og rettighetstester.
- `tests/unit/sb4-playback.test.ts`, `sb2-storyboard-gallery.test.tsx`, `active-scene-bus.test.ts`, `backup.test.ts`: konkret logikk og regresjoner.
- `tests/visual/make-sb4-fixture.ts`, `sb4-playback.mjs`: syntetisk nb/en-flyt uten betalte kall.
- `src/core/i18n/authored.json` og tilhørende genererte språk-/inventarkataloger: alle nye tekster i alle registrerte språk.
- `roadmap.md`, `docs/development/SB4_REPORT.md`: ærlig status og resultater.
