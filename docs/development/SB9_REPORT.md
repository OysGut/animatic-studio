# SB-9 – Kontinuitet og blokking

## Bygget
- 0090–0106 låst med oppgitte MD5-er; 107 integritetstester bestått. Ingen låst migrasjon endret.
- Panel-lokal plantegning med mål, veggsegmenter, objekter, karakterer fra scenebruk, kameraer, retning, brennvidde, sensorbredde og beregnet synsfelt. Forrige blokking kan kopieres eksplisitt.
- Akse-, blikk- og bevegelsesavvik i kontinuitetsliste og galleriflagg. Eksisterende fortellingstid styrer kontrollrekkefølgen. Begrunnet godkjenning gjelder et konkret avvik; endret geometri reaktiverer kontrollen.
- Paneloverganger: kutt, overtoning, via svart/hvitt og retningsstyrt wipe. Storyboardfilm og felles kompositor bruker panelovergangene.
- Eksisterende eksportvindu/bildekilde brukes. Separate panel-ID-er og skuddnavn innen samme scene. OTIO lagrer spesialtype/retning i metadata, XML har effekter og fargeparameter, CMX har W001/W002 med retningskommentar.
- SetStoryboardDetails med angre/gjør om, revisjonskontroll og NFC. Backup remapper også sammensatte godkjenningsnøkler. Produksjonslag flyttes ikke automatisk.
- Lokal migrasjon 0107_sb9_blocking.sql: egen registervalidator, uten endring av apply_changes-kjernen; størrelse, struktur, referanser og overganger kontrolleres. SECURITY DEFINER har search_path=''. Skjemaversjon 107.

## Testresultater
- Kjerne 14/0, eksport/backup 2/0, eksisterende PTG6-regresjoner 10/0. Forventningene til eksisterende animasjonseksport er ikke svekket.
- Full lokal DB-suite: 231 bestått, 0 feilet. Migrasjonene ble prøvd kun i en separat, slettbar lokal Postgres-database. Ingen Cloud-migrasjon kjørt.
- Visuell fixture/mock-suite før miljøavbrudd: nb/en desktop/mobil, 10/0. Oppretting, kamera, overgang og retning ble valgt i brukerflaten og lest tilbake. Skjermbilder kontrollert; ingen kjørefeil eller vannrett overflyt.
- Full Vitest før siste EDL-endring: 3019/0/10. Etter miljøavbrudd ble manglende språkdata gjenopprettet; fullkjøring på endelig kode føres nedenfor.
- i18n check og validate grønne. 29 nøkler på alle registrerte språk. fr/es/ru/ja/pt-BR/de/it/ko merket maskinoversatt for gjennomlesing.
- check_kb: OK før miljøavbrudd; PyYAML kun installert under /tmp.
- Previewkontroll build OK. Separat manuell tsc er ikke kjørt; Lovable-miljøet tillater ikke dette. Claude må bekrefte separat typekontroll.

## Ærlige begrensninger
- Synlig overgangsblanding mellom gallerikort under avspilling er ikke bygget. Overgangene vises i storyboardfilm/felles kompositor.
- Felles scenegrunnriss med egen keyframe-tidslinje og dra-redigering i plantegningen er ikke bygget. Lagring er panel-lokal; eksisterende panelnavigasjon viser blokkingen for valgt panel.
- Ekte Cloud-lagring og import i Resolve/Premiere/Avid er ikke prøvd. OTIO bruker generisk dissolve med spesialtype i metadata; mottakerstøtten avgjør visningen. CMX kan ikke uttrykke alle dip-farger/retninger; kommentarer bevarer detaljene.
- Nettleserprøven dekker ikke hele flerkarakter-/godkjenningsflyten eller pikselkontroll av alle overgangene. Geometri, godkjenning, fortellingstid og angre har kjernetester.
- Ingen publisering eller betalte KI-kall. 0107 venter på Claudes Cloud-kjøring.

## Endrede filer
- tests/fixtures/migration-hashes.json; tests/architecture/migration-hashes.test.ts
- db/migrations/0107_sb9_blocking.sql; src/adapters/storage/project-rows.ts; tests/db/run-db-tests.ts
- src/core/storyboard/blocking.ts; src/core/storyboard/editing.ts; src/core/storyboard/editing-commands.ts; src/core/storyboard/playback.ts; src/core/model.ts
- src/app/storyboard/PanelBlocking.tsx; src/app/storyboard/PanelEditor.tsx; src/app/storyboard/StoryboardWorkspace.tsx; src/app/storyboard/AGENTS.md
- src/engine/compositor/film.ts; src/core/backup/index.ts
- src/core/interchange/index.ts; src/core/interchange/types.ts; src/core/interchange/editorial.ts
- src/app/assembly/ShotlistExport.tsx; src/app/assembly/ExportAnimaticDialog.tsx
- tests/unit/sb9-blocking.test.ts; tests/unit/sb9-export.test.ts; tests/visual/sb9-blocking.mjs
- src/core/i18n/authored.json; src/core/i18n/runtime.gen.json
- src/core/i18n/locales/nb.json; en.json; en-XA.json; fr.json; es.json; ru.json; ja.json; pt-BR.json; de.json; it.json; ko.json
- scripts/i18n/mapping.v1.json; scripts/i18n/references.v1.json; scripts/i18n/candidates.v1.json; scripts/i18n/inventory-report.json
- roadmap.md; docs/development/SB9_REPORT.md

Arbeidet følger animatic-arkitektur-og-data, animatic-testing og animatic-oppdrag.
