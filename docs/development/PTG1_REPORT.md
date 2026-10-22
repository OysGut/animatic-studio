# PTG1 – sluttrapport (B-102)

## Status
PTG1 er implementert. Automatisk type-/byggekontroll, full Vitest, språk- og nettlesertester er grønne. Databaseverifisering er **ikke fullført**: lokal Postgres på localhost:54329 svarer ikke. Migrasjon 0081 er ikke kjørt i Cloud. Leveransen kan derfor ikke betegnes som fullt verifisert før Claude har kjørt DB-suiten og prøvd lagring og eksport mot 0081.

## Leveranse
- Ren `buildInterchange` for produksjon, språk og utvalg av sceneforekomster; ett skudd per forekomst, permanente ID-er, lag/lyd/dialog/ord og kamera `null`.
- Felles tidsgrenser, opptaksinnstillinger og navngivning. Toere har 24 bilder/s på tidslinjen og eksponering hvert andre bilde.
- Prosjektkode med maksimalt 32 tegn og AE/OE/AA-translitterering, reversible innstillingskommandoer og backup/innlasting.
- Skuddliste i CSV med UTF-8 BOM og JSON, standard/Flow/ftrack/Kitsu, relative PNG-miniatyrer, interchange.json og tospråklig LESMEG.
- ZIP-strømming med ZIP64-størrelser/offsetter, OPFS der tilgjengelig og ZIP64-lesing. Syntetiske store hoder testes uten å skrive 4 GB. Alle ZIP-pakker får LESMEG.
- «Til produksjonen» i eksportdialogen, prosjektkode/opptaksfrekvens i prosjektinnstillinger og eksporthistorikk uten ufullførte reservasjoner.
- Alle nye tekster bruker `t()`. nb/en er skrevet direkte; øvrige produksjonsspråk fr/es/de/it/pt-BR/ru/ja/ko er maskinoversatt og merket for gjennomlesing; en-XA er generert.

## Overlapp og tidsregler
Klippunktet er overgangens absolutte midtpunkt avrundet én gang på eksportens tidslinje. Utgående og innkommende skudd deler samme grense. Lengder er differansen mellom grensene; summen er filmens lengde. Håndtak angir overlappdelen på naboens side og står etter lengde i skuddlisten. Overgangstype og lengde følger modellen. Animatorens opptak inkluderer begge håndtak.

Ved fem bilders overlapp på 24 bilder/s blir innkommende handleIn=3 og utgående handleOut=2. Den gyldne 24→25-testen gir klippunkt 22, skuddlengder 22+23=45 og håndtak ut=3/inn=2.

Lyd og ord eies av skuddet hvor deres avrundede start ligger. Absolutte og relative grenser følger med; hele hendelsen beholdes, med crossesCut=true når slutten passerer klippunktet. Ordtider i lydkomposisjoner bruker eksisterende komposisjonsmapping. Uten overlapp er håndtak null. Sluttgrenser og Frame Out/Cut Out er eksklusive. Tomt utvalg gir tom film; en svært kort scene kan få null bilder etter avrunding, men beholdes som skudd og blir aldri negativ.

## Migrasjon 0081
Fil: `db/migrations/0081_ptg_interchange.sql`, additiv oppå 0080, skjemaversjon 81.

**Erstattet funksjon:** `public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)`. Siste eksisterende definisjon ligger i 0079 (0080 erstatter den ikke). Kontrollen av funksjonsdiffen viser bare fire nye prosjektfelt: code, capture_mode, capture_fps_num og capture_fps_den.

**Nye funksjoner:** `public.reserve_interchange_export` og `public.complete_interchange_export`. Prosjektlåsen serialiserer versjonsallokering per permanent forekomst-ID. Reservasjoner er append-only eksportloggrader; fullføring er egen rad. Avbrutte versjoner gjenbrukes ikke. Fullføring kontrollerer eier og batchstørrelse. Historikk skjuler reservasjoner.

Ingen nye tabeller. Eksisterende prosjekttilgang/RLS bevares; RPC-er har eksplisitt REVOKE/GRANT. `record_export`, `delete_project` og `purge_*` er uendret; eksisterende eksportloggkaskade brukes. Migrasjonen er **ikke kjørt i Cloud**.

## Tester
| Kontroll | Resultat |
|---|---|
| Automatisk type-/byggekontroll | build OK, siste kontroll 2026-10-22 02:50:29 UTC |
| Full `bunx vitest run` | 2280 bestått, 0 feilet, 10 eksisterende hoppet over; 281 beståtte filer, 2 eksisterende hoppet over |
| Fokuserte PTG/ZIP64/uten-AI-tester | 19/19 bestått før siste full-suite; inngår også i full-suite |
| `ptg1-shotlist.mjs`, nb | 35/35, nedlastede pakker lest tilbake for alle fire profiler |
| `ptg1-shotlist.mjs`, UI_LANG=en | 35/35, nedlastede pakker lest tilbake for alle fire profiler |
| `export-e2e.mjs`, film | Bestått; nedlastet videofil 922906 byte |
| `p4-alpha-export.mjs` | 41/41, inkludert eksport etter lukking av dialog |
| `scripts/i18n/inventory.mjs` | Regenerert inventar |
| `scripts/i18n/check.mjs` | Grønn, 0 tekster uten engelsk; alle språk kontrollert av full Vitest |
| `scripts/i18n/release-check.mjs` | Grønn |
| DB-suite | Blokkert: ECONNREFUSED localhost:54329; ingen DB-test rapporteres bestått |

Nye testfiler: `tests/unit/ptg1-interchange.test.ts`, `tests/unit/ptg1-zip64.test.ts`, `tests/visual/ptg1-shotlist.mjs`. Arkitektur-, DB- og alfaeksportregresjoner er utvidet. Suitene er kjørt sekvensielt, uten betalte AI-kall. Nettlesertestene brukte innlogget fixture med mockede tjenester, ikke levende DB; ekte reservering/fullføring og lagring må bekreftes etter migrasjonen. Skjermbildet av norsk eksportseksjon er inspisert.

`npx tsc --noEmit` er ikke kjørt manuelt: miljøets regel forbyr manuelle typekontroller og bruker automatisk type-/byggekontroll. Resultatet over er denne kontrollen, ikke en påstått separat tsc-kjøring.

## Avvik og åpne spørsmål
- Full DB-verifisering og ekte eksportflyt er blokkert av manglende lokal Postgres. Claude kjører DB-suiten og migrasjonen som avtalt.
- PTG2–PTG7, kameraeksport og publisering er ikke utført, i samsvar med avgrensningen.
- Ingen åpne produktavklaringer. Ingen Cloud-endring eller nye pakker.

## Endrede filer
- `.lovable/plan.md` — Plan, leveransestatus eller denne rapporten.
- `AGENTS.md` — Regel for felles utvekslingsmodell og eksportversjoner.
- `db/migrations/0081_ptg_interchange.sql` — Additiv 0081; ikke kjørt i Cloud.
- `docs/development/PTG1_REPORT.md` — Plan, leveransestatus eller denne rapporten.
- `roadmap.md` — Plan, leveransestatus eller denne rapporten.
- `scripts/i18n/candidates.v1.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `scripts/i18n/inventory-report.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `scripts/i18n/mapping.v1.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `scripts/i18n/references.v1.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/adapters/browser/history-records.ts` — Eksportlogg/RPC eller prosjektinnlasting.
- `src/adapters/browser/interchange.ts` — Eksportlogg/RPC eller prosjektinnlasting.
- `src/adapters/storage/project-rows.ts` — Eksportlogg/RPC eller prosjektinnlasting.
- `src/app/assembly/ExportAnimaticDialog.tsx` — Prosjektinnstillinger, eksportdialog eller eksporthistorikk.
- `src/app/assembly/ShotlistExport.tsx` — Prosjektinnstillinger, eksportdialog eller eksporthistorikk.
- `src/app/projects/ExportHistory.tsx` — Prosjektinnstillinger, eksportdialog eller eksporthistorikk.
- `src/app/projects/InterchangeSettings.tsx` — Prosjektinnstillinger, eksportdialog eller eksporthistorikk.
- `src/app/projects/ProjectFormat.tsx` — Prosjektinnstillinger, eksportdialog eller eksporthistorikk.
- `src/core/backup/index.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/commands/apply.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/commands/types.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/i18n/authored.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/de.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/en-XA.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/en.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/es.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/fr.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/it.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/ja.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/ko.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/nb.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/pt-BR.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/locales/ru.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/i18n/runtime.gen.json` — PTG-tekster, språkdekning eller regenerert inventar.
- `src/core/index.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/index.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/naming.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/readme.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/settings.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/shotlist.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/interchange/types.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/model.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/core/patch.ts` — Utvekslingsmodell, prosjektinnstillinger eller reversibel persistens.
- `src/engine/export/shotlist.ts` — Skuddlistepakking, ZIP64 eller ZIP64-lesing.
- `src/engine/export/zip.ts` — Skuddlistepakking, ZIP64 eller ZIP64-lesing.
- `src/engine/export/zip64.ts` — Skuddlistepakking, ZIP64 eller ZIP64-lesing.
- `src/engine/import/zip-read.ts` — Skuddlistepakking, ZIP64 eller ZIP64-lesing.
- `tests/architecture/eksport-uten-ai.test.ts` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/db/run-db-tests.ts` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/unit/layer-alpha.test.ts` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/unit/ptg1-interchange.test.ts` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/unit/ptg1-zip64.test.ts` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/visual/p4-alpha-export.mjs` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/visual/ptg1-shotlist.mjs` — PTG-dekning eller tilpasset eksportregresjon.
- `tests/visual/schema-version.mjs` — PTG-dekning eller tilpasset eksportregresjon.
