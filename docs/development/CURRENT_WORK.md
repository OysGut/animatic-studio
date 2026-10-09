# Pågående arbeid

Oppdatert: 2026-10-09 (økt 3)

## Nå: M2 Manus – første del ferdig, venter på Mars
- [x] Tolkning av PDF (pdf.js) og DOCX, gyldne tester mot «Jula på Dovre» (97 scener, numre, (MORE)/(CONT'D), O.S., manuelle linjeskift)
- [x] `ImportScreenplay` (atomisk, kan angres), `SplitScene`/`MergeScenes`, `SetBlockKind`, `EditSceneHeading`, `SetUncertainty`, `RemoveBlock`/`RestoreBlock`
- [x] Migrasjon `0002_import_profiles.sql` (kildereferanse, usikkerhet, fjernet, unik plass, originaldokumenter, bøtte `sources`, profiler) + databasetester
- [x] Sidebryting kalibrert mot Final Draft; låste sider
- [x] Arbeidsflaten «Manus»: scenenavigator (dra-og-slipp, Alt+pil, aktiv-bryter), sidevisning, inspektør, import- og eksportdialog
- [x] Angre/gjør om per bruker, sanntid mellom medlemmer, profilnavn
- [x] Eksport PDF/DOCX med nummereringsvalg og forhåndsvisning
- [x] Uavhengig kodegjennomgang; 15 funn rettet med regresjonstester
- [x] CI: `tests.yml` (typekontroll, Vitest, databasetester)
- [ ] **Mars:** Commit + Push (melding i `NEXT_COMMIT_MESSAGE.txt`), deretter synkmeldingen for `0002_import_profiles.sql` (LOVABLE_SYNC.md B)
- [ ] **Mars:** Åpne prosjektet → Manus → Importer manus → velg «Jula på Dovre» PDF fra `Manus/`. Si fra om noe ser rart ut
- [ ] Claude: følge opp første ekte import (KI-19, KI-23), CI-kjøring (KI-17)

## Neste: M2 andre del
1. Manusversjoner (uforanderlige øyeblikksbilder) og sammenligning med endringstyper (REQ-0032, REQ-0069, REQ-0076–0078); historisk nummerering ved eksport (REQ-0083).
2. Søk og filtrering i manus, «bare scener med valgt karakter» (REQ-0073–0075).
3. Varighetsestimat per scene (sideåttendedeler).
4. Tilstedeværelse (hvem ser på hva) og typet Supabase-klient (KI-14).
5. Lagre tittelside ved import (KI-20).
