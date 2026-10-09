<!-- GENERERT FIL – ikke rediger. Kilde: docs/product/requirements.yaml. Kjør: python3 scripts/kb/build_docs.py -->
# Sporbarhetsmatrise – Animatic Studio

Svarer på: hvor kravet kommer fra, hvilken modul som oppfyller det, hvilke filer som implementerer det, hvordan det testes, om det er implementert, om det er endret og hvilken beslutning som tillot endringen.

**Regel:** Et krav er ikke ferdig fordi kode er skrevet. Status *Verifisert* krever registrert verifikasjon (test eller kontroll) – håndheves av `scripts/kb/check_kb.py`.

## Invarianter (kritiske systemregler)

| Invariant | Beskrivelse | Krav | Verifiserte |
|---|---|---|---|
| INV-01 | Manus og film er to visninger av samme aktive produksjonsstruktur. | 21 | 13 |
| INV-02 | Scenenumre er ikke permanente identifikatorer. | 24 | 11 |
| INV-03 | En scene beholder identitet gjennom flytting og omnummerering. | 16 | 8 |
| INV-04 | Spinoffer kan bruke samme kildescene med selvstendig rekkefølge og lokale endringer. | 19 | 3 |
| INV-05 | Norsk er hovedmanus. | 7 | 0 |
| INV-06 | Andre språkversjoner endrer ikke norsk hovedmanus automatisk. | 4 | 0 |
| INV-07 | Ferdige filmsekvenser overskrives ikke automatisk etter manusendringer. | 25 | 5 |
| INV-08 | Brukeren kan godkjenne avvik, oppdatere produksjonsmateriale eller angre relevant endring. | 27 | 3 |
| INV-09 | Karakterkontinuitet følger fortellingstid, også ved flashbacks. | 16 | 1 |
| INV-10 | Produksjonsteknisk segmentering endrer ikke manusscenenes identiteter. | 11 | 3 |
| INV-11 | Generativ AI er valgfritt for ordinær 2D-animatic-avspilling og eksport. | 13 | 5 |
| INV-12 | Betalte API-kall følger eksplisitte kostnadsgodkjenninger. | 20 | 1 |
| INV-13 | Delte ressurser er versjonerte og ikke-destruktive. | 25 | 4 |
| INV-14 | Deaktivering/skjuling er aldri sletting; materiale kan gjenaktiveres. | 17 | 11 |
| INV-C1 | Ingen stille overskriving ved samarbeid (revisjonskontroll) – DEC-0003/DEC-0010. | 2 | 1 |
| INV-C2 | Tilgang håndheves i backend (RLS) – teknisk, DEC-0010. | 3 | 3 |
| INV-C3 | Bare medlemmer med kostnadsrett kan godkjenne betalte kall – midlertidig, DEC-0018/Q-01. | 1 | 0 |

## Dekning per modul

| Modul | Navn | Krav | P0 | Implementert | Verifisert |
|---|---|---|---|---|---|
| CORE | Project Core | 118 | 57 | 56 | 40 |
| SCRIPT | Screenplay Engine | 127 | 32 | 78 | 63 |
| TIMELINE | Timeline & Assembly Engine | 94 | 28 | 36 | 23 |
| LIBRARY | Resource Library | 58 | 9 | 23 | 18 |
| CONTINUITY | Continuity Engine | 39 | 11 | 2 | 2 |
| COMPOSE | 2D Composition Engine | 47 | 14 | 26 | 21 |
| CAMERA | Camera & Motion Engine | 29 | 2 | 23 | 19 |
| AUDIO | Audio Engine | 32 | 1 | 16 | 9 |
| PROMPT | Prompt Orchestration Engine | 45 | 14 | 2 | 1 |
| PROVIDER | Provider Adapters | 23 | 6 | 2 | 2 |
| QUALITYCOST | Quality & Cost Engine | 25 | 6 | 1 | 1 |
| QUEUE | Render Queue | 34 | 12 | 3 | 3 |
| VERSION | Version & Dependency Engine | 90 | 36 | 27 | 13 |
| L10N | Localization Engine | 38 | 4 | 3 | 2 |
| PRESENT | Presentation Engine | 30 | 3 | 1 | 1 |
| EXPORT | Export Engine | 54 | 12 | 27 | 23 |
| SECURITY | Security & Storage | 26 | 5 | 13 | 9 |
| COLLAB | Collaboration & Access | 10 | 0 | 8 | 6 |
| UI | Brukergrensesnitt og designsystem | 130 | 19 | 57 | 47 |
| PROCESS | Arbeidsmåte og utviklingsprosess | 50 | 6 | 5 | 1 |

## Dekning per fase

| Fase | Krav | Verifisert |
|---|---|---|
| 1 | 70 | 27 |
| 2 | 97 | 61 |
| 3 | 63 | 41 |
| 4 | 69 | 22 |
| 5 | 70 | 0 |
| 6 | 48 | 0 |
| 7 | 63 | 0 |
| 8 | 39 | 0 |
| Tverrgående/prosess | 40 | 0 |

## Matrise

| Krav | Kilde | Moduler | Implementering | Tester (plan) | Verifikasjon | Status | Siste endring |
|---|---|---|---|---|---|---|---|
| REQ-0001 | Kap. 1 (l. 7, 24) | CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0002 | Kap. 1 (l. 8-23) | CORE, SCRIPT, LIBRARY, COMPOSE, CAMERA, TIMELINE, AUDIO, PROMPT, PROVIDER, VERSION, CONTINUITY, QUEUE, L10N, PRESENT, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0003 | Kap. 1 (l. 24) | TIMELINE, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0004 | Kap. 1 (l. 25) | CORE, COMPOSE, TIMELINE, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0005 | Kap. 1.1 (l. 27-30) | UI | src/app/shell/AppHeader.tsx, src/app/auth/AuthScreen.tsx | 1 | manuell: 2026-10-08 visuell QA av M1-skjermbilder (tests/visual/screens.mjs) | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0006 | Kap. 1.2 (l. 32) | PROCESS, CORE | package.json | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0007 | Kap. 1.2 (l. 33-34) | CORE, PROMPT, COMPOSE, TIMELINE | src/core/ | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0008 | Kap. 1.2 (l. 35) | CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0009 | Kap. 1.2 (l. 36-43) | CORE, UI, COMPOSE, PROVIDER, QUEUE, VERSION, SECURITY, EXPORT | src/core/, src/adapters/, src/app/ | 1 | tests/architecture/core-purity.test.ts::importerer ikke rammeverk, backend eller plattform-API-er | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0010 | Kap. 1.2 (l. 44) | QUEUE, CORE, PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0011 | Kap. 1.3 (l. 46-55) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0012 | Kap. 1.3 (l. 56) | UI | src/styles.css | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0013 | Kap. 1.3 (l. 57) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0014 | Kap. 1.3 (l. 58) | UI, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0015 | Kap. 1.3 (l. 59) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0016 | Kap. 2 (l. 62-66) | CORE, SCRIPT, TIMELINE, COMPOSE, AUDIO | src/core/model.ts, src/core/views.ts | 2 | tests/invariants/random-sequences.test.ts::INV-01: manus og film har alltid samme aktive rekkefølge i alle produksjoner | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0017 | Kap. 2 (l. 67) | SCRIPT, TIMELINE, CORE | src/core/commands/apply.ts#MoveOccurrence, src/core/views.ts, src/app/script/SceneNavigator.tsx | 1 | tests/unit/commands.test.ts::én kommando endrer rekkefølgen i både manus og film, uten nye ID-er, tests/visual/screens.mjs::06-manus (dra-og-slipp i scenenavigatoren, manuell kontroll 2026-10-09) | Verifisert | 2026-10-09 DEC-0023: M2: flytting i scenenavigatoren (dra-og-slipp, Alt+pil); status Verifisert |
| REQ-0018 | Kap. 2 (l. 68) | TIMELINE, SCRIPT, CORE | src/app/assembly/AssemblyWorkspace.tsx, src/core/assembly/film.ts | 1 | tests/unit/assembly.test.ts::tidskodene beregnes på nytt når en scene flyttes, tests/visual/screens.mjs::46-montering-flytt | Verifisert | 2026-10-09 DEC-0043: Filmtidslinjen flytter scener med MoveOccurrence (samme kommando som manuset) |
| REQ-0019 | Kap. 2 (l. 69) | CORE, SCRIPT, TIMELINE, EXPORT | src/core/views.ts, src/core/screenplay/numbering.ts, src/app/script/SceneNavigator.tsx | 1 | tests/unit/commands.test.ts::utelates fra manus og film, men ingenting slettes og den kan gjenaktiveres, tests/unit/numbering.test.ts::deaktiverte scener utelates, eller tas med som UTGÅR / merket (REQ-0084, Q-08) | Verifisert | 2026-10-09 DEC-0023: M2: deaktiverte scener utelates i manusvisning, sider og eksport; status Verifisert |
| REQ-0020 | Kap. 2 (l. 70) | CORE | src/core/commands/apply.ts#SetOccurrenceActive | 1 | tests/unit/commands.test.ts::utelates fra manus og film, men ingenting slettes og den kan gjenaktiveres, tests/invariants/random-sequences.test.ts::INV-14: deaktivering sletter ingenting | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert (datanivå) |
| REQ-0021 | Kap. 2 (l. 71-74) | CORE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0022 | Kap. 2.1 (l. 76-78) | CORE, VERSION | src/core/views.ts#outdatedTakes | 1 | tests/unit/commands.test.ts::ferdig materiale endres ikke, men blir markert som utdatert for berørte blokker | Under arbeid | 2026-10-08 DEC-0022: M1: grunnlag for avvik på plass; avviksflyt i M6 |
| REQ-0023 | Kap. 2.1 (l. 79) | CORE | src/core/views.ts, src/core/commands/apply.ts | 1 | tests/unit/commands.test.ts::én kommando endrer rekkefølgen i både manus og film, uten nye ID-er | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0024 | Kap. 2.1 (l. 80) | VERSION, CORE | src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes | 1 | tests/unit/commands.test.ts::ferdig materiale endres ikke, men blir markert som utdatert for berørte blokker, tests/db/run-db-tests.ts::INV-07: produsert materiale kan ikke slettes eller overskrives | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0025 | Kap. 2.1 (l. 80) | VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0026 | Kap. 2.1 (l. 81) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0027 | Kap. 2.2 (l. 83-84) | VERSION, CORE | src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes | 1 | tests/invariants/random-sequences.test.ts::INV-07/13: produsert materiale og historikk endres eller slettes aldri, tests/db/run-db-tests.ts::INV-07: produsert materiale kan ikke slettes eller overskrives | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0028 | Kap. 2.2 (l. 83, 85) | VERSION, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0029 | Kap. 2.2 (l. 83, 86) | QUEUE, QUALITYCOST, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0030 | Kap. 2.2 (l. 83, 87) | VERSION, TIMELINE | src/core/commands/apply.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0031 | Kap. 2.2 (l. 83, 88) | CORE | src/core/commands/apply.ts#assertCanEditVariant, src/core/invariants.ts | 1 | tests/invariants/random-sequences.test.ts::INV-04: kommandoer i én produksjon endrer aldri en annen produksjons forekomster | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0032 | Kap. 2.2 (l. 83, 89) | VERSION, SCRIPT | db/migrations/0003_script_versions.sql, src/core/screenplay/versions.ts | 1 | tests/db/run-db-tests.ts::0003: manusversjon er et uforanderlig øyeblikksbilde lik kjernens, med løpenummer og forelder, tests/unit/versions.test.ts | Verifisert | 2026-10-09 DEC-0028: Uforanderlige øyeblikksbilder som kan vises og eksporteres; status Verifisert |
| REQ-0033 | Kap. 2.2 (l. 90) | VERSION, CORE | db/migrations/0001_core.sql#change_log, src/core/commands/apply.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0034 | Kap. 3.1 (l. 94-102) | CORE | src/core/ids.ts, src/core/model.ts | 1 | tests/invariants/random-sequences.test.ts::INV-02/03: ingen scene, forekomst eller produksjonsnummer forsvinner eller bytter scene | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0035 | Kap. 3.1 (l. 103-108) | CORE, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0036 | Kap. 3.1 (l. 109) | CORE | src/core/model.ts, db/migrations/0001_core.sql | 2 | tests/invariants/random-sequences.test.ts::INV-02/03: ingen scene, forekomst eller produksjonsnummer forsvinner eller bytter scene, manuell: 2026-10-08 ingen fremmednøkkel eller unik nøkkel i 0001_core.sql bruker scenenummer | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0037 | Kap. 3.2 (l. 111-132) | CORE | src/core/ids.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0038 | Kap. 3.2 (l. 133) | CORE | src/core/ids.ts | 1 | tests/unit/core-basics.test.ts::lager gyldige UUID v7 som sorteres etter tid | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0039 | Kap. 3.3 (l. 135-140) | CORE | src/core/model.ts, db/migrations/0001_core.sql | 1 | tests/unit/commands.test.ts::krever egen variant og lar hovedfilmen være uendret | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0040 | Kap. 3.3 (l. 141) | CORE | src/core/commands/apply.ts#ForkVariant | 1 | tests/unit/commands.test.ts::krever egen variant og lar hovedfilmen være uendret | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0041 | Kap. 3.4 (l. 143-150) | CORE | db/migrations/0001_core.sql#apply_changes, src/adapters/storage/commands.functions.ts | 1 | tests/db/run-db-tests.ts::hele endringssettet rulles tilbake ved feil (atomisk) | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0042 | Kap. 3.4 (l. 151) | CORE, UI | src/core/commands/apply.ts#inverse | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0043 | Kap. 3.4 (l. 152) | CORE | src/core/views.ts, db/migrations/0001_core.sql | 1 | tests/invariants/random-sequences.test.ts::INV-01: manus og film har alltid samme aktive rekkefølge i alle produksjoner | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0044 | Kap. 4.1 (l. 156) | SCRIPT | src/engine/import/docx-lines.ts, src/app/script/ImportDialog.tsx, src/engine/import/browser.ts, src/engine/import/pdf-lines.ts | 1 | tests/golden/reference-screenplay.test.ts::tolker alle scener, numre, tittelside og elementer, tests/golden/reference-screenplay.test.ts::har samme scenestruktur som det norske manuset, tests/visual/screens.mjs::11-import-forhandsvisning (ekte PDF i nettleser) | Verifisert | 2026-10-09 DEC-0023: M2: import av PDF og DOCX i nettleseren (DEC-0023); status Verifisert |
| REQ-0045 | Kap. 4.1 (l. 157) | PROCESS, SCRIPT | src/core/screenplay/paginate.ts, src/core/screenplay/parse.ts | 1 | tests/golden/reference-screenplay.test.ts | Verifisert | 2026-10-09 DEC-0023: M2: referansemanuset brukt som fasit for tolkning og sidebryting; status Verifisert |
| REQ-0046 | Kap. 4.1 (l. 158-172) | SCRIPT | src/core/screenplay/parse.ts | 2 | tests/golden/reference-screenplay.test.ts::tolker alle scener, numre, tittelside og elementer, tests/unit/screenplay-parse.test.ts | Verifisert | 2026-10-09 DEC-0023: M2: overskrifter, handling, karakter, replikk, parentes, overgang, (MORE)/(CONT'D), O.S.; status Verifisert |
| REQ-0047 | Kap. 4.1 (l. 177-178) | SCRIPT | src/core/screenplay/plan.ts, src/core/screenplay/parse.ts | 1 | tests/unit/screenplay-parse.test.ts::håndterer delmanus som starter midt i en scene (mandat 4.1) uten å finne opp en ny scene | Verifisert | 2026-10-09 DEC-0023: M2: tekst før første overskrift blir fortsettelsesscene (valgfritt); status Verifisert |
| REQ-0048 | Kap. 4.1 (l. 179) | SCRIPT | src/core/screenplay/parse.ts | 1 | tests/golden/reference-screenplay.test.ts::tolker alle scener, numre, tittelside og elementer | Verifisert | 2026-10-09 DEC-0023: M2: 96 nummererte + 1 unummerert, hull opp til 109, ingen oppdiktede; status Verifisert |
| REQ-0049 | Kap. 4.1 (l. 180) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0002: Akseptanse/merknad tilpasset nytt referansemanus |
| REQ-0050 | Kap. 4.2 (l. 182-194) | SCRIPT, UI | src/core/screenplay/script-pages.ts, src/app/script/ScriptPageView.tsx | 2 | tests/golden/reference-screenplay.test.ts::hele manuset importeres atomisk, raskt, uten brudd på invarianter, og kan angres | Implementert – ikke verifisert | 2026-10-09 DEC-0024: M2: sidevisning i Courier med låste sider (97/97 scenestarter som originalen); må vurderes av Trollfilm; status Implementert – ikke verifisert |
| REQ-0051 | Kap. 4.2 (l. 195) | SCRIPT, UI | src/app/script/ScriptPageView.tsx | 1 | tests/visual/screens.mjs::06-manus (manuell kontroll 2026-10-09: manusside, ikke tabell/kort) | Verifisert | 2026-10-09 DEC-0023: M2: manuset vises som manussider; status Verifisert |
| REQ-0052 | Kap. 4.2 (l. 196) | SCRIPT | src/core/screenplay/paginate.ts | 1 | tests/unit/paginate.test.ts, tests/golden/reference-screenplay.test.ts::gir samme sideantall og scenestart innen én side av Final Draft | Implementert – ikke verifisert | 2026-10-09 DEC-0024: M2: sidene brytes på nytt ved hver endring (DEC-0024); status Implementert – ikke verifisert |
| REQ-0053 | Kap. 4.2 (l. 197) | SCRIPT, VERSION, SECURITY | db/migrations/0002_import_profiles.sql, src/app/script/ImportDialog.tsx | 1 | – | Implementert – ikke verifisert | 2026-10-09 DEC-0023: M2: originalen lastes opp uendret til bøtten sources med sha256; ikke testet mot Lovable Cloud ennå (KI-19); status Implementert – ikke verifisert |
| REQ-0054 | Kap. 4.2 (l. 198) | SCRIPT | src/core/screenplay/parse.ts | 1 | tests/golden/reference-screenplay.test.ts::eksportert PDF leses inn igjen med samme scener, numre og tekst | Verifisert | 2026-10-09 DEC-0023: M2: manuelle linjeskift og tomme linjer bevares; rundtur gir identisk tekst og sider; status Verifisert |
| REQ-0055 | Kap. 4.3 (l. 200-206) | SCRIPT, LIBRARY | src/core/screenplay/parse.ts | 1 | tests/golden/reference-screenplay.test.ts::tolker alle scener, numre, tittelside og elementer | Verifisert | 2026-10-09 DEC-0023: M2; status Verifisert |
| REQ-0056 | Kap. 4.3 (l. 207) | SCRIPT, CORE | src/core/screenplay/plan.ts, src/core/commands/apply.ts#ImportScreenplay | 1 | tests/unit/import-split-merge.test.ts::lager permanente scener etter eksisterende scener, med nummer, kildereferanse og usikkerhet | Verifisert | 2026-10-09 DEC-0023: M2; status Verifisert |
| REQ-0057 | Kap. 4.3 (l. 208) | SCRIPT | db/migrations/0002_import_profiles.sql, src/core/screenplay/plan.ts | 1 | tests/db/run-db-tests.ts::0002: import av manus lagres atomisk med kildereferanser og usikkerhet | Verifisert | 2026-10-09 DEC-0023: M2: strukturert kopi med kildereferanse per blokk; status Verifisert |
| REQ-0058 | Kap. 4.3 (l. 209) | SCRIPT, UI | src/app/script/Inspector.tsx, src/app/script/ScriptPageView.tsx, src/core/screenplay/parse.ts | 1 | tests/db/run-db-tests.ts::0002: import av manus lagres atomisk med kildereferanser og usikkerhet, tests/visual/screens.mjs::09-manus-usikker | Verifisert | 2026-10-09 DEC-0023: M2: usikre tolkninger markeres i margen og i scenelisten; status Verifisert |
| REQ-0059 | Kap. 4.3 (l. 210) | SCRIPT, UI | src/core/commands/apply.ts#SetBlockKind,EditSceneHeading,SetUncertainty,SplitScene,MergeScenes, src/app/script/Inspector.tsx | 1 | tests/unit/import-split-merge.test.ts::elementtype, overskrift og usikkerhet kan endres og angres | Verifisert | 2026-10-09 DEC-0023: M2; status Verifisert |
| REQ-0060 | Kap. 4.3 (l. 211) | SCRIPT | src/core/screenplay/plan.ts, src/app/script/ImportDialog.tsx | 1 | tests/unit/import-split-merge.test.ts::kan hoppe over fortsettelsesteksten før første overskrift | Verifisert | 2026-10-09 DEC-0023: M2: brukeren velger om teksten tas med som egen unummerert scene; status Verifisert |
| REQ-0061 | Kap. 4.4 (l. 213-214) | SCRIPT, CORE | src/app/script/Inspector.tsx, src/core/commands/apply.ts#CreateScene | 1 | tests/unit/commands.test.ts, tests/invariants/random-sequences.test.ts | Verifisert | 2026-10-09 DEC-0025: M2: «Ny scene etter denne» i inspektøren; status Verifisert |
| REQ-0062 | Kap. 4.4 (l. 215) | SCRIPT, CORE | src/core/commands/apply.ts#MoveOccurrence, src/app/script/SceneNavigator.tsx | 1 | tests/unit/commands.test.ts::én kommando endrer rekkefølgen i både manus og film, uten nye ID-er | Verifisert | 2026-10-09 DEC-0025: M2; status Verifisert |
| REQ-0063 | Kap. 4.4 (l. 216) | SCRIPT, CORE | src/core/commands/apply.ts#SetOccurrenceActive, src/app/script/SceneNavigator.tsx | 1 | tests/unit/commands.test.ts, tests/invariants/random-sequences.test.ts::INV-14: deaktivering sletter ingenting | Verifisert | 2026-10-09 DEC-0025: M2; status Verifisert |
| REQ-0064 | Kap. 4.4 (l. 217) | SCRIPT, CORE | src/core/commands/apply.ts#SetOccurrenceActive, src/app/script/SceneNavigator.tsx | 1 | tests/unit/commands.test.ts | Verifisert | 2026-10-09 DEC-0025: M2; status Verifisert |
| REQ-0065 | Kap. 4.4 (l. 218) | SCRIPT | src/core/commands/apply.ts#EditBlockText, src/app/script/Inspector.tsx | 1 | tests/unit/commands.test.ts, tests/invariants/random-sequences.test.ts | Verifisert | 2026-10-09 DEC-0025: M2; status Verifisert |
| REQ-0066 | Kap. 4.4 (l. 219) | SCRIPT | src/core/commands/apply.ts#EditBlockText,InsertBlock,RemoveBlock, src/app/script/Inspector.tsx | 1 | tests/unit/import-split-merge.test.ts::skjuler blokken i manuset, beholder historikken og gjør ferdig film utdatert | Verifisert | 2026-10-09 DEC-0025: M2; status Verifisert |
| REQ-0067 | Kap. 4.4 (l. 220) | SCRIPT, CORE | src/core/commands/apply.ts#SplitScene | 1 | tests/unit/import-split-merge.test.ts::flytter blokkene fra splittpunktet til en ny scene rett etter, med samme blokk-ID-er | Verifisert | 2026-10-09 DEC-0025: M2 (DEC-0025); status Verifisert |
| REQ-0068 | Kap. 4.4 (l. 221) | SCRIPT, CORE | src/core/commands/apply.ts#MergeScenes | 1 | tests/unit/import-split-merge.test.ts::legger kildescenens blokker sist i målscenen, beholder kildescenen som sammenslått og deaktivert | Verifisert | 2026-10-09 DEC-0025: M2 (DEC-0025); status Verifisert |
| REQ-0069 | Kap. 4.4 (l. 222) | SCRIPT, VERSION | src/core/screenplay/versions.ts#diffSnapshots, src/app/script/VersionsDialog.tsx | 1 | tests/unit/versions.test.ts, tests/visual/screens.mjs::17b-versjon-sammenlign | Verifisert | 2026-10-09 DEC-0028: Sammenligning av to versjoner eller versjon mot nå; status Verifisert |
| REQ-0070 | Kap. 4.4 (l. 223) | SCRIPT, CORE | src/app/project/use-commands.ts, src/core/commands/apply.ts | 1 | tests/invariants/random-sequences.test.ts::ADR-0005: hver kommando etterfulgt av sin invers gir samme innhold | Implementert – ikke verifisert | 2026-10-09 DEC-0025: M2: angre/gjør om per bruker med revisjonskontroll; UI-delen er ikke automatisk testet; status Implementert – ikke verifisert |
| REQ-0071 | Kap. 4.4 (l. 224) | CORE, SCRIPT, TIMELINE | src/core/commands/apply.ts#SplitScene | 1 | tests/invariants/random-sequences.test.ts::INV-10: segmentering endrer aldri scener, manusblokker eller rekkefølge | Verifisert | 2026-10-09 DEC-0025: M2: narrativ splitting er egen kommando; nekter hvis produksjonssegmenter peker på blokkene; status Verifisert |
| REQ-0072 | Kap. 4.4 (l. 225) | CORE, SCRIPT | src/core/commands/apply.ts#CreateSegments | 1 | tests/unit/commands.test.ts::segmentering ved utseendeendring midt i scene endrer ikke manus eller nummer (INV-10), tests/invariants/random-sequences.test.ts::INV-10: segmentering endrer aldri scener, manusblokker eller rekkefølge | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0073 | Kap. 4.5 (l. 227-235) | SCRIPT, UI | src/core/screenplay/filter.ts, src/app/script/SceneNavigator.tsx | 2 | tests/unit/filter.test.ts | Under arbeid | 2026-10-09 DEC-0028: Søk i tekst, sted, nummer og filter på karakter. Objekter, produksjonsstatus og avvik kommer når de finnes; status Under arbeid |
| REQ-0074 | Kap. 4.5 (l. 236) | SCRIPT, LIBRARY, UI | src/core/screenplay/filter.ts#sceneHasCharacter, src/core/screenplay/filter.ts#matchingOccurrences, src/app/script/ScriptWorkspace.tsx | 1 | tests/unit/filter.test.ts::karakterfilter gir nøyaktig scenene der karakteren opptrer (REQ-0074), tests/unit/library.test.ts::finner scener for karakter under alle navn, lokasjon og objekt, tests/visual/screens.mjs::15-filter-karakter | Verifisert | 2026-10-09 DEC-0030: Karakterfilteret bruker alle navnene fra ressursbiblioteket (KI-29 løst); status Verifisert |
| REQ-0075 | Kap. 4.5 (l. 237) | SCRIPT, CORE | src/core/screenplay/filter.ts | 1 | tests/unit/filter.test.ts::filtrering endrer ikke produksjonens aktive innhold (REQ-0075) | Verifisert | 2026-10-09 DEC-0028: Filteret er bare visning; status Verifisert |
| REQ-0076 | Kap. 5.1 (l. 241) | VERSION, SCRIPT | db/migrations/0003_script_versions.sql, src/app/script/VersionsDialog.tsx | 1 | tests/db/run-db-tests.ts::0003: manusversjon er et uforanderlig øyeblikksbilde lik kjernens, med løpenummer og forelder, tests/visual/screens.mjs::17-versjoner | Verifisert | 2026-10-09 DEC-0028: Lagre, liste og åpne versjoner; status Verifisert |
| REQ-0077 | Kap. 5.1 (l. 242-248) | VERSION, SCRIPT | src/core/screenplay/versions.ts | 1 | tests/unit/versions.test.ts | Under arbeid | 2026-10-09 DEC-0028: Innhold, rekkefølge, synlighet, nummer, forelder og aktiv filmversjon lagres. Å gjøre en gammel versjon til gjeldende manus (gjenoppretting) er ikke bygget ennå; status Under arbeid |
| REQ-0078 | Kap. 5.1 (l. 249-256) | VERSION, SCRIPT | src/core/screenplay/versions.ts#diffSnapshots | 1 | tests/unit/versions.test.ts::finner hver endringstype med riktig type (REQ-0078) | Implementert – ikke verifisert | 2026-10-09 DEC-0028: Alle typer unntatt objekter (objekter finnes ikke før ressursbiblioteket, M3); status Implementert – ikke verifisert |
| REQ-0079 | Kap. 5.1 (l. 257) | VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0080 | Kap. 5.2 (l. 259) | EXPORT, SCRIPT, UI | src/app/script/ExportDialog.tsx | 1 | tests/visual/screens.mjs::12-eksport-dialog | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0081 | Kap. 5.2 (l. 261-262) | EXPORT, SCRIPT | src/core/screenplay/numbering.ts | 1 | tests/unit/numbering.test.ts::fortløpende: aktive scener får 1..N (REQ-0081) | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0082 | Kap. 5.2 (l. 263-264) | EXPORT, SCRIPT | src/core/screenplay/numbering.ts | 1 | tests/unit/numbering.test.ts::bevar produksjonsnummerering: nye scener mellom 42 og 43 blir 42A og 42B (REQ-0082) | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0083 | Kap. 5.2 (l. 265) | EXPORT, SCRIPT, VERSION | src/core/screenplay/numbering.ts, src/app/script/ExportDialog.tsx | 1 | tests/unit/versions.test.ts::scener i versjonen får versjonens nummer, nye scener mellomnummer | Verifisert | 2026-10-09 DEC-0028: Historisk nummerering ved eksport; status Verifisert |
| REQ-0084 | Kap. 5.2 (l. 266) | EXPORT | src/app/script/ExportDialog.tsx, src/core/screenplay/numbering.ts | 1 | tests/unit/numbering.test.ts::deaktiverte scener utelates, eller tas med som UTGÅR / merket (REQ-0084, Q-08) | Verifisert | 2026-10-09 DEC-0026: M2 (DEC-0026, midlertidig antakelse); status Verifisert |
| REQ-0085 | Kap. 5.2 (l. 267) | EXPORT, CORE | src/core/screenplay/numbering.ts | 1 | tests/unit/numbering.test.ts::eksport endrer ikke prosjektet (REQ-0085) | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0086 | Kap. 5.2 (l. 268) | EXPORT, UI | src/app/script/ExportDialog.tsx | 1 | tests/visual/screens.mjs::12-eksport-dialog | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0087 | Kap. 5.3 (l. 270-272) | EXPORT, SCRIPT | src/engine/export/screenplay-docx.ts | 1 | tests/golden/reference-screenplay.test.ts::eksportert DOCX leses inn igjen med samme scener, numre og elementer, tests/unit/export.test.ts, manuell: 2026-10-09 DOCX åpnet i LibreOffice, 105 sider med manusformat | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0088 | Kap. 5.3 (l. 270, 273) | EXPORT, SCRIPT | src/engine/export/screenplay-pdf.ts | 1 | tests/golden/reference-screenplay.test.ts::eksportert PDF leses inn igjen med samme scener, numre og tekst, tests/unit/export.test.ts | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0089 | Kap. 5.3 (l. 274) | EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0090 | Kap. 5.3 (l. 275) | EXPORT | src/engine/export/screenplay-pdf.ts, src/engine/export/screenplay-docx.ts | 1 | tests/golden/reference-screenplay.test.ts::eksportert PDF leses inn igjen med samme scener, numre og tekst | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0091 | Kap. 5.3 (l. 276) | EXPORT | src/engine/export/screenplay-pdf.ts, src/engine/export/screenplay-docx.ts | 1 | manuell: 2026-10-09 eksportkoden har ingen nettverkskall (ren funksjon, kjøres i nettleseren) | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0092 | Kap. 6 (l. 279) | SCRIPT, TIMELINE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0093 | Kap. 6.1 (l. 281) | SCRIPT, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0094 | Kap. 6.1 (l. 282) | CORE, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0095 | Kap. 6.1 (l. 283-287) | SCRIPT, AUDIO, COMPOSE, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0096 | Kap. 6.1 (l. 288) | SCRIPT, COMPOSE, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0097 | Kap. 6.2 (l. 290) | SCRIPT, TIMELINE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0098 | Kap. 6.2 (l. 291) | SCRIPT, TIMELINE, UI | src/app/assembly/ClipPanel.tsx | 1 | – | Under arbeid | 2026-10-09 DEC-0043: Avspillingshodet viser scenens manus (scenenivå); markering per replikk kommer med tidskoblinger |
| REQ-0099 | Kap. 6.2 (l. 292-297) | TIMELINE, SCRIPT, COMPOSE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0100 | Kap. 6.2 (l. 298) | UI, SCRIPT, TIMELINE | src/app/assembly/ClipPanel.tsx | 1 | – | Under arbeid | 2026-10-09 DEC-0043: Monteringen viser manuset for scenen ved siden av filmen; presis kobling per replikk kommer med tidskoblinger |
| REQ-0101 | Kap. 6.2 (l. 299) | UI, SCRIPT | src/app/assembly/ClipPanel.tsx | 1 | – | Under arbeid | 2026-10-09 DEC-0043: «Følg avspillingen» av/på i monteringen (scenenivå) |
| REQ-0102 | Kap. 6.3 (l. 301-302) | SCRIPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0103 | Kap. 6.3 (l. 303) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0104 | Kap. 6.3 (l. 304) | EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0105 | Kap. 6.4 (l. 306-310) | TIMELINE, CORE | src/core/time.ts, src/core/views.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0106 | Kap. 6.4 (l. 311) | TIMELINE | src/core/time.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0107 | Kap. 6.4 (l. 312) | TIMELINE, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0108 | Kap. 7.1 (l. 316) | SCRIPT, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0109 | Kap. 7.1 (l. 317-323) | SCRIPT | src/core/screenplay/duration.ts | 1 | tests/unit/duration.test.ts::bygger på dialog og handling med justerbare antakelser | Verifisert | 2026-10-09 DEC-0028: Estimat fra dialog og handling med justerbare antakelser; status Verifisert |
| REQ-0110 | Kap. 7.1 (l. 324) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0111 | Kap. 7.1 (l. 325) | TIMELINE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0112 | Kap. 7.2 (l. 327) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0113 | Kap. 7.2 (l. 328-333) | TIMELINE, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0114 | Kap. 7.2 (l. 334) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0115 | Kap. 7.2 (l. 335) | TIMELINE | src/core/screenplay/duration.ts | 1 | tests/unit/duration.test.ts::deaktiverte scener utelates fra totalen og legges til igjen ved aktivering (REQ-0115) | Verifisert | 2026-10-09 DEC-0028: status Verifisert |
| REQ-0116 | Kap. 7.3 (l. 337) | UI | src/app/projects/DurationOverview.tsx | 1 | tests/visual/screens.mjs::18-oversikt-varighet | Verifisert | 2026-10-09 DEC-0028: Varighet på prosjektoversikten; status Verifisert |
| REQ-0117 | Kap. 7.3 (l. 338) | UI, SCRIPT | src/app/script/ScriptPageView.tsx | 1 | manuell: 2026-10-09 skjermbilde 06 – ingen varighetstall i manusvisningen | Verifisert | 2026-10-09 DEC-0028: status Verifisert |
| REQ-0118 | Kap. 7.3 (l. 339-348) | UI, TIMELINE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0119 | Kap. 7.3 (l. 349) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0120 | Kap. 7.4 (l. 351) | TIMELINE, VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0121 | Kap. 8 (l. 354-366) | LIBRARY | src/core/model.ts#Asset, src/core/commands/apply.ts#CreateAssets, src/core/library/index.ts, src/app/library/LibraryWorkspace.tsx, src/app/library/AssetDetail.tsx, db/migrations/0004_library_notes.sql | 1 | tests/unit/library.test.ts, tests/visual/screens.mjs::20-bibliotek | Under arbeid | 2026-10-09 DEC-0030: Bibliotek for karakterer, objekter, lokasjoner, dyr og miljøer med bilder (M3 del 1). Lyd, genererte ressurser og stilprofiler gjenstår; status Under arbeid |
| REQ-0122 | Kap. 8.1 (l. 368) | LIBRARY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0123 | Kap. 8.1 (l. 369) | LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0124 | Kap. 8.1 (l. 370) | LIBRARY, UI | src/app/library/LibraryWorkspace.tsx, src/core/library/index.ts | 1 | tests/visual/screens.mjs::20-bibliotek, tests/visual/screens.mjs::21-bibliotek-ressurs | Verifisert | 2026-10-09 DEC-0030: Kategori, stikkord, søk og filter på type; status Verifisert |
| REQ-0125 | Kap. 8.2 (l. 372) | LIBRARY, CORE | src/core/model.ts#Asset, db/migrations/0004_library_notes.sql | 1 | tests/unit/library.test.ts::endring, arkivering og angre gir samme innhold tilbake, {'tests/db/run-db-tests.ts::0004': 'ressurs, variant og bildeversjon lagres og leses tilbake'} | Verifisert | 2026-10-09 DEC-0030: Ressurser har permanente UUID-er; status Verifisert |
| REQ-0126 | Kap. 8.2 (l. 373-378) | LIBRARY, L10N | src/core/commands/apply.ts#normalizeAssetFields, src/app/library/AssetDetail.tsx | 1 | tests/unit/library.test.ts::lagrer foretrukket og alternative navn ryddet, og avviser tomt navn | Verifisert | 2026-10-09 DEC-0030: Foretrukket navn, alternative navn, kallenavn, tidligere navn og språknavn; status Verifisert |
| REQ-0127 | Kap. 8.2 (l. 379) | LIBRARY, SCRIPT, CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0128 | Kap. 8.2 (l. 380) | LIBRARY, UI | src/core/library/index.ts#librarySuggestions, src/app/library/SuggestionsDialog.tsx | 1 | tests/unit/library.test.ts::foreslår karakterer og lokasjoner som mangler, med mulige treff som må bekreftes, tests/visual/screens.mjs::22-bibliotek-forslag | Verifisert | 2026-10-09 DEC-0034: Forslagene fra manuset utvidet med gratis regelbasert gjenkjenning av ressurser (REQ-0544–REQ-0548); status uendret Verifisert |
| REQ-0129 | Kap. 8.2 (l. 381) | LIBRARY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0130 | Kap. 8.3 (l. 383) | VERSION, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0131 | Kap. 8.3 (l. 384) | LIBRARY, CORE | src/core/library/index.ts#assetUsage, src/app/library/AssetDetail.tsx | 1 | tests/unit/library.test.ts::finner scener for karakter under alle navn, lokasjon og objekt, tests/visual/screens.mjs::21-bibliotek-ressurs | Verifisert | 2026-10-09 DEC-0030: «Brukt i scener» ut fra navnene i manuset (bruk i 2D-scener kommer i M3 del 2); status Verifisert |
| REQ-0132 | Kap. 8.3 (l. 385) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0133 | Kap. 8.3 (l. 386) | VERSION, QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0134 | Kap. 8.3 (l. 387) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0135 | Kap. 9.1 (l. 391-401) | LIBRARY | src/core/model.ts#AssetVariant, src/app/library/AssetDetail.tsx | 1 | tests/unit/library.test.ts::nummererer versjoner, og ny versjon endrer ikke godkjent versjon | Verifisert | 2026-10-09 DEC-0030: Visuelle varianter med stil og utseende; status Verifisert |
| REQ-0136 | Kap. 9.1 (l. 402) | LIBRARY, VERSION | src/core/commands/apply.ts#ApproveAssetVersion, db/migrations/0004_library_notes.sql | 1 | tests/unit/library.test.ts::nummererer versjoner, og ny versjon endrer ikke godkjent versjon, tests/unit/library.test.ts::godkjenning av en annen variants versjon avvises, {'tests/db/run-db-tests.ts::0004': 'ressurs, variant og bildeversjon lagres og leses tilbake'} | Verifisert | 2026-10-09 DEC-0030: Versjoner per variant (uforanderlige) og egen godkjenning; status Verifisert |
| REQ-0137 | Kap. 9.2 (l. 404) | PROMPT, PROVIDER, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0138 | Kap. 9.2 (l. 405-411) | PROMPT, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0139 | Kap. 9.2 (l. 412) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0140 | Kap. 9.2 (l. 413) | UI, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0141 | Kap. 9.3 (l. 415-416) | LIBRARY, PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0142 | Kap. 9.3 (l. 417) | LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0143 | Kap. 9.3 (l. 418) | LIBRARY, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0144 | Kap. 9.3 (l. 419) | LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0145 | Kap. 9.3 (l. 420) | LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0146 | Kap. 9.3 (l. 421) | LIBRARY, VERSION | src/core/commands/apply.ts#AddAssetVersion | 1 | tests/unit/library.test.ts::nummererer versjoner, og ny versjon endrer ikke godkjent versjon | Implementert – ikke verifisert | 2026-10-09 DEC-0030: Nye bilder endrer ikke godkjent versjon; scener som bruker ressurser kommer i M3 del 2 |
| REQ-0147 | Kap. 9.4 (l. 423) | LIBRARY, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0148 | Kap. 9.4 (l. 424-430) | LIBRARY, PROMPT, COMPOSE, PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0149 | Kap. 9.4 (l. 431) | LIBRARY, CONTINUITY, CORE | src/core/model.ts#Asset, src/core/model.ts#AssetVariant | 1 | tests/unit/library.test.ts::nummererer versjoner, og ny versjon endrer ikke godkjent versjon | Verifisert | 2026-10-09 DEC-0030: Identitet (ressurs), utseendetilstand og stil (variant) er atskilt; status Verifisert |
| REQ-0150 | Kap. 10 (l. 434-436) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0151 | Kap. 10.1 (l. 438-446) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0152 | Kap. 10.1 (l. 447-448) | CONTINUITY, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0153 | Kap. 10.2 (l. 450-461) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0154 | Kap. 10.2 (l. 462) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0155 | Kap. 10.3 (l. 464) | CONTINUITY, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0156 | Kap. 10.3 (l. 465-466) | CONTINUITY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0157 | Kap. 10.4 (l. 468-469) | CONTINUITY, SCRIPT, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0158 | Kap. 10.4 (l. 470) | CONTINUITY, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0159 | Kap. 10.5 (l. 472) | CONTINUITY, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0160 | Kap. 10.5 (l. 473) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0161 | Kap. 10.6 (l. 475-477) | CONTINUITY, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0162 | Kap. 10.6 (l. 478) | CONTINUITY, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0163 | Kap. 10.6 (l. 479-481) | CORE, CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0164 | Kap. 10.7 (l. 483-488) | CONTINUITY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0165 | Kap. 10.7 (l. 489) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0166 | Kap. 10.8 (l. 491) | CONTINUITY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0167 | Kap. 10.8 (l. 492) | CONTINUITY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0168 | Kap. 11 (l. 494-495) | COMPOSE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0169 | Kap. 11 (l. 496) | COMPOSE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0170 | Kap. 11 (l. 497) | COMPOSE, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0171 | Kap. 11.1 (l. 498-506) | COMPOSE, LIBRARY | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/app/scene-editor/*, src/engine/compositor/canvas.ts | 1 | tests/unit/composition.test.ts, tests/db/run-db-tests.ts (0007), tests/unit/storage-contract.test.ts, tests/visual/screens.mjs (28–31) | Verifisert | 2026-10-09 DEC-0035: 2D-sceneeditor del 1 (datamodell og lagbasert komposisjon) bygget; status Verifisert |
| REQ-0172 | Kap. 11.1 (l. 507) | COMPOSE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/app/scene-editor/*, src/engine/compositor/canvas.ts | 2 | tests/unit/composition.test.ts, tests/db/run-db-tests.ts (0007), tests/unit/storage-contract.test.ts, tests/visual/screens.mjs (28–31) | Verifisert | 2026-10-09 DEC-0035: 2D-sceneeditor del 1 (datamodell og lagbasert komposisjon) bygget; status Verifisert |
| REQ-0173 | Kap. 11.1 (l. 508) | COMPOSE, CAMERA | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/app/scene-editor/*, src/engine/compositor/canvas.ts, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/db/run-db-tests.ts (0007), tests/unit/storage-contract.test.ts, tests/visual/screens.mjs (28–31), tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Parallakse vises når kameraet beveger seg (kameravisning og avspilling); status Verifisert |
| REQ-0174 | Kap. 11.2 (l. 509-517) | COMPOSE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/app/scene-editor/*, src/engine/compositor/canvas.ts | 2 | tests/unit/composition.test.ts, tests/db/run-db-tests.ts (0007), tests/unit/storage-contract.test.ts, tests/visual/screens.mjs (28–31) | Verifisert | 2026-10-09 DEC-0035: 2D-sceneeditor del 1 (datamodell og lagbasert komposisjon) bygget; status Verifisert. Gruppering finnes i datamodellen, men ikke i brukergrensesnittet ennå |
| REQ-0175 | Kap. 11.2 (l. 518) | COMPOSE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Revisjon 2026-10-08: tekst/prioritet justert mot mandatet |
| REQ-0176 | Kap. 11.3 (l. 519-520) | COMPOSE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Nøkkelbilder i tidslinjen og egenskapspanelet, automatiske nøkkelbilder, avspilling; status Verifisert |
| REQ-0177 | Kap. 11.3 (l. 521) | COMPOSE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Hastighetskurver per nøkkelbilde (jevn, myk start/slutt, hold); status Verifisert |
| REQ-0178 | Kap. 11.3 (l. 522) | COMPOSE, CAMERA | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Implementert – ikke verifisert | 2026-10-09 DEC-0036: Enkel animatic uten AI: lag, nøkkelbilder, kamera og avspilling; INV-11-testen og eksport kommer; status Implementert – ikke verifisert |
| REQ-0179 | Kap. 11.4 (l. 523-524) | COMPOSE, CAMERA, CORE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/app/scene-editor/*, src/engine/compositor/canvas.ts | 2 | tests/unit/composition.test.ts, tests/db/run-db-tests.ts (0007), tests/unit/storage-contract.test.ts, tests/visual/screens.mjs (28–31) | Verifisert | 2026-10-09 DEC-0035: 2D-sceneeditor del 1 (datamodell og lagbasert komposisjon) bygget; status Verifisert |
| REQ-0180 | Kap. 11.4 (l. 525) | COMPOSE, VERSION, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0181 | Kap. 12 (l. 527-528) | CAMERA, COMPOSE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0182 | Kap. 12.1 (l. 529-530) | CAMERA | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kamerautsnitt følger 2D-scenens format; status Verifisert |
| REQ-0183 | Kap. 12.1 (l. 531) | CAMERA, CORE | src/core/composition/* (COMPOSITION_FORMATS), src/app/scene-editor/*, src/engine/compositor/canvas.ts | 2 | tests/unit/composition.test.ts, tests/visual/screens.mjs (28) | Verifisert | 2026-10-09 DEC-0035: Bildeformat velges ved opprettelse av 2D-scene og i sceneinspektøren (COMPOSITION_FORMATS); status Verifisert |
| REQ-0184 | Kap. 12.2 (l. 532-533) | CAMERA, UI | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Start- og sluttramme vises i scenevisning; status Verifisert |
| REQ-0185 | Kap. 12.2 (l. 534-536) | CAMERA, UI | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Blå startramme, rød sluttramme; status Verifisert |
| REQ-0186 | Kap. 12.2 (l. 537) | CAMERA, UI | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Rammene tegnes 1 piksel tykke uansett zoom; status Verifisert |
| REQ-0187 | Kap. 12.2 (l. 538) | CAMERA, EXPORT | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Implementert – ikke verifisert | 2026-10-09 DEC-0036: Rammene vises aldri i kameravisningen; eksport kommer senere; status Implementert – ikke verifisert |
| REQ-0188 | Kap. 12.3 (l. 539-540) | CAMERA | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kamerabane per utsnitt, redigerbar på lerretet; status Verifisert |
| REQ-0189 | Kap. 12.3 (l. 541-545) | CAMERA | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Rette og kurvede (Bézier) baner; status Verifisert |
| REQ-0190 | Kap. 12.3 (l. 546) | CAMERA, UI | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Dra rammer, hjørner (zoom) og kontrollpunkter direkte; status Verifisert |
| REQ-0191 | Kap. 12.3 (l. 547) | CAMERA, UI | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Dobbeltklikk på banen veksler rett/kurvet; status Verifisert |
| REQ-0192 | Kap. 12.4 (l. 548-554) | CAMERA | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Implementert – ikke verifisert | 2026-10-09 DEC-0036: Panorering, zoom, rotasjon og posisjon; tilt (3D) finnes ikke i 2D-modellen; status Implementert – ikke verifisert |
| REQ-0193 | Kap. 12.4 (l. 555) | CAMERA, TIMELINE | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Flere kamerautsnitt per scene på kamerasporet (uten overlapp); status Verifisert |
| REQ-0194 | Kap. 12.4 (l. 556) | CAMERA, COMPOSE | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kamerabevegelse kombineres med nøkkelbilder på lagene; status Verifisert |
| REQ-0195 | Kap. 12.5 (l. 557-558) | CAMERA, TIMELINE | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kameraet følger scenens tidslinje; status Verifisert |
| REQ-0196 | Kap. 12.5 (l. 559-563) | CAMERA | src/core/composition/*, src/core/commands/apply.ts#applyCommand (CreateComposition, AddLayers, UpdateLayers, MoveLayer, SetLayersRemoved), db/migrations/0007_compositions.sql, src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/composition.test.ts, tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kameraets start/slutt og hastighetskurve per utsnitt; lag har egne kanaler per egenskap; status Verifisert |
| REQ-0197 | Kap. 12.5 (l. 564) | CAMERA, COMPOSE | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Kameravisning og avspilling viser bevegelsen; status Verifisert |
| REQ-0198 | Kap. 12.5 (l. 565) | CAMERA | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 1 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Verifisert | 2026-10-09 DEC-0036: Dra start/slutt på kamerasporet, flytte nøkkelbilder, sette scenens varighet; status Verifisert |
| REQ-0199 | Kap. 13 (l. 567-568) | AUDIO | src/core/audio/index.ts, src/app/assembly/AudioTracks.tsx | 1 | tests/unit/audio.test.ts::lydklipp, tests/visual/screens.mjs::50-montering-lyd | Verifisert | 2026-10-09 DEC-0044: Lydsystem: lydfiler i biblioteket og lydklipp i filmen |
| REQ-0200 | Kap. 13.1 (l. 569-575) | AUDIO | src/core/audio/index.ts | 1 | tests/unit/audio.test.ts::avviser ugyldige verdier og lydfiler som ikke er lyd | Verifisert | 2026-10-09 DEC-0044: Dialog, forteller, effekter, atmosfære og musikk |
| REQ-0201 | Kap. 13.1 (l. 576) | AUDIO, TIMELINE | src/app/assembly/AudioTracks.tsx | 1 | tests/visual/screens.mjs::50-montering-lyd | Verifisert | 2026-10-09 DEC-0044: Ett spor per lydtype i filmtidslinjen; overlappende klipp på egne linjer |
| REQ-0202 | Kap. 13.2 (l. 577-578) | AUDIO, LIBRARY | src/app/library/asset-audio.ts, src/app/assembly/AddAudioDialog.tsx | 1 | tests/db/run-db-tests.ts::0009, tests/visual/screens.mjs::51-legg-til-lyd | Verifisert | 2026-10-09 DEC-0044: Opplasting av lyd i monteringen og i biblioteket (generering kommer med M5) |
| REQ-0203 | Kap. 13.2 (l. 578) | AUDIO, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0204 | Kap. 13.2 (l. 579-585) | AUDIO, CORE | src/core/commands/apply.ts, db/migrations/0009_audio.sql | 2 | tests/unit/audio.test.ts::avviser ugyldige verdier og lydfiler som ikke er lyd | Under arbeid | 2026-10-09 DEC-0044: Lydklipp knyttes til scene og replikk; kobling til karakter, delsekvens og hendelse kommer senere |
| REQ-0205 | Kap. 13.2 (l. 586) | AUDIO, LIBRARY, VERSION | src/app/library/AssetDetail.tsx, src/app/library/LibraryWorkspace.tsx | 2 | – | Under arbeid | 2026-10-09 DEC-0044: Lyd er ressurser i biblioteket (søk, filter, versjoner); egne lydfiltre kommer senere |
| REQ-0206 | Kap. 13.3 (l. 587-588) | AUDIO, SCRIPT, TIMELINE | src/app/assembly/AudioClipPanel.tsx | 1 | – | Under arbeid | 2026-10-09 DEC-0044: Dialoglyd kan kobles til replikken; tidskobling per replikk og avspillingshode kommer med tidskoblingene |
| REQ-0207 | Kap. 13.3 (l. 589) | AUDIO, TIMELINE | src/app/assembly/AudioTracks.tsx, src/app/assembly/AudioClipPanel.tsx, src/engine/audio/mixer.ts | 2 | tests/unit/audio.test.ts::volumkurve, tests/db/run-db-tests.ts::0009 | Verifisert | 2026-10-09 DEC-0044: Flytte, kutte start og slutt, lengde, volum, inn-/uttoning og demping |
| REQ-0208 | Kap. 13.3 (l. 590) | AUDIO, EXPORT | src/app/audio/use-audio-playback.ts, src/engine/export/animatic.ts | 2 | tests/visual/screens.mjs::48-montering-eksport-ferdig | Verifisert | 2026-10-09 DEC-0044: Lyd i avspilling (montering og sceneeditor) og i eksporten |
| REQ-0209 | Kap. 14 (l. 592-593) | COMPOSE, TIMELINE, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0210 | Kap. 14.1 (l. 594-602) | COMPOSE, CAMERA, AUDIO | src/core/composition/animate.ts, src/core/composition/render.ts#renderFrame, cameraAt, valueAt, src/app/scene-editor/Timeline.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/camera-overlay.ts, src/app/scene-editor/CameraPanel.tsx, src/app/scene-editor/use-playback.ts | 2 | tests/unit/animate.test.ts, tests/unit/composition.test.ts, tests/unit/camera-overlay.test.ts, tests/visual/screens.mjs (33–36) | Implementert – ikke verifisert | 2026-10-09 DEC-0036: Avspilling av lag, kamera og nøkkelbilder; dialog og lyd kommer i M4; status Implementert – ikke verifisert |
| REQ-0211 | Kap. 14.2 (l. 603-604) | EXPORT, COMPOSE, QUEUE | src/engine/export/animatic.ts, src/engine/export/animatic.ts | 1 | tests/visual/screens.mjs::48-montering-eksport-ferdig, tests/visual/screens.mjs::48-montering-eksport-ferdig | Verifisert | 2026-10-09 DEC-0044: Eksportert video har bilde og lyd; kontrollert lengde, størrelse, bildefrekvens og lydspor |
| REQ-0212 | Kap. 14.2 (l. 605) | EXPORT, COMPOSE, QUEUE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Revisjon 2026-10-08: tekst/prioritet justert mot mandatet |
| REQ-0213 | Kap. 14.2 (l. 606) | EXPORT, COMPOSE | src/engine/export/animatic.ts | 1 | tests/visual/screens.mjs::48-montering-eksport-ferdig | Verifisert | 2026-10-09 DEC-0043: Eksporten bruker bare nettleserens egen koder; ingen nettverkskall |
| REQ-0214 | Kap. 14.3 (l. 607-613) | TIMELINE, EXPORT, AUDIO | src/engine/compositor/film.ts, src/engine/export/animatic.ts | 2 | – | Under arbeid | 2026-10-09 DEC-0044: Monteringen kombinerer 2D-scener, tittelkort og lyd; importert film og AI-video kommer senere |
| REQ-0215 | Kap. 14.3 (l. 614) | CORE, COMPOSE, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0216 | Kap. 15 (l. 616-618) | TIMELINE, UI | src/app/assembly/AssemblyWorkspace.tsx, src/routes/prosjekt.$projectId.montering.tsx | 1 | tests/visual/screens.mjs::45-montering | Verifisert | 2026-10-09 DEC-0043: Montering: egen filmtidslinje adskilt fra sceneeditoren |
| REQ-0217 | Kap. 15.1 (l. 621) | TIMELINE | src/core/assembly/film.ts | 1 | tests/unit/assembly.test.ts::følger manusets rekkefølge og utelater deaktiverte scener | Verifisert | 2026-10-09 DEC-0043: Alle aktive scener i manusets rekkefølge |
| REQ-0218 | Kap. 15.1 (l. 622) | TIMELINE | src/app/assembly/AssemblyWorkspace.tsx | 1 | tests/visual/screens.mjs::45-montering | Verifisert | 2026-10-09 DEC-0043: Klikk på klipp, pil opp/ned og knapper for forrige/neste scene; dobbeltklikk åpner sceneeditoren |
| REQ-0219 | Kap. 15.1 (l. 623) | TIMELINE | src/app/assembly/FilmTimeline.tsx, src/engine/compositor/film.ts | 1 | – | Under arbeid | 2026-10-09 DEC-0043: Viser 2D-scenen (miniatyr og visning) eller tittelkort; importert film og AI-video kommer senere |
| REQ-0220 | Kap. 15.1 (l. 624) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0221 | Kap. 15.1 (l. 625) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0222 | Kap. 15.1 (l. 626) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0223 | Kap. 15.1 (l. 627) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0224 | Kap. 15.1 (l. 628) | TIMELINE | src/app/assembly/FilmTimeline.tsx, src/app/assembly/ClipPanel.tsx | 1 | tests/unit/assembly.test.ts::å endre lengden på en scene endrer verken manus eller rekkefølge | Verifisert | 2026-10-09 DEC-0043: Lengden endres ved å dra i høyre kant eller i panelet |
| REQ-0225 | Kap. 15.1 (l. 629) | TIMELINE | src/app/assembly/FilmViewer.tsx, src/engine/compositor/film.ts | 1 | tests/visual/screens.mjs::45-montering | Verifisert | 2026-10-09 DEC-0043: Avspilling av hele filmen i monteringen |
| REQ-0226 | Kap. 15.1 (l. 630) | TIMELINE, EXPORT | src/app/assembly/ExportAnimaticDialog.tsx, src/engine/export/animatic.ts | 1 | tests/visual/screens.mjs::48-montering-eksport-ferdig | Verifisert | 2026-10-09 DEC-0043: Eksport av hele filmen som video (uten lyd i del 1) |
| REQ-0227 | Kap. 15.1 (l. 631) | TIMELINE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0228 | Kap. 15.2 (l. 632-633) | TIMELINE, SCRIPT, CORE | src/app/assembly/FilmTimeline.tsx, src/app/assembly/AssemblyWorkspace.tsx | 2 | tests/unit/assembly.test.ts::tidskodene beregnes på nytt når en scene flyttes, tests/unit/commands.test.ts | Verifisert | 2026-10-09 DEC-0043: Flytting i filmtidslinjen er MoveOccurrence; manus og film leses fra samme struktur |
| REQ-0229 | Kap. 15.2 (l. 634-638) | TIMELINE, CORE, SCRIPT | src/app/assembly/AssemblyWorkspace.tsx | 2 | – | Under arbeid | 2026-10-09 DEC-0043: Flytte scene, endre lengde og deaktivere er egne handlinger i monteringen; utsnitt av klipp kommer med importert film |
| REQ-0230 | Kap. 15.2 (l. 639) | TIMELINE, SCRIPT | src/app/assembly/FilmTimeline.tsx | 1 | tests/unit/assembly.test.ts::å endre lengden på en scene endrer verken manus eller rekkefølge | Verifisert | 2026-10-09 DEC-0043: Lengdeendring i filmtidslinjen endrer bare 2D-scenens lengde |
| REQ-0231 | Kap. 15.2 (l. 640) | TIMELINE, VERSION, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0232 | Kap. 15.3 (l. 641-642) | TIMELINE, VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0233 | Kap. 15.3 (l. 643-645) | TIMELINE, VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0234 | Kap. 15.3 (l. 646) | VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0235 | Kap. 16 (l. 648-649) | LIBRARY, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0236 | Kap. 16.1 (l. 650-655) | TIMELINE, SCRIPT, CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0237 | Kap. 16.1 (l. 656) | TIMELINE, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0238 | Kap. 16.2 (l. 657-663) | LIBRARY, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0239 | Kap. 16.3 (l. 664-665) | TIMELINE | src/engine/compositor/film.ts | 1 | – | Under arbeid | 2026-10-09 DEC-0043: Scener uten 2D-scene vises som tittelkort; delvis importert film kommer i del 2 |
| REQ-0240 | Kap. 16.3 (l. 666) | TIMELINE | src/core/assembly/film.ts, src/engine/compositor/film.ts | 1 | tests/unit/assembly.test.ts::bruker 2D-scenens lengde, ellers beregnet lengde fra manus, tests/visual/screens.mjs::45-montering | Verifisert | 2026-10-09 DEC-0043: Monteringen spiller og eksporterer også når scener mangler 2D-scene (tittelkort med beregnet lengde) |
| REQ-0241 | Kap. 16.4 (l. 667-672) | VERSION, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0242 | Kap. 16.4 (l. 673) | LIBRARY, VERSION, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0243 | Kap. 17 (l. 675-677) | PROMPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0244 | Kap. 17 (l. 678) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0245 | Kap. 17.1 (l. 679-698) | PROMPT, CONTINUITY, LIBRARY, COMPOSE, CAMERA | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0246 | Kap. 17.1 (l. 699) | PROMPT, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0247 | Kap. 17.2 (l. 700-702) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0248 | Kap. 17.2 (l. 703) | PROMPT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0249 | Kap. 17.2 (l. 704) | PROMPT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0250 | Kap. 17.3 (l. 706-707) | PROMPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0251 | Kap. 17.3 (l. 708) | PROMPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0252 | Kap. 17.3 (l. 709) | PROMPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0253 | Kap. 17.3 (l. 710) | PROMPT, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0254 | Kap. 17.3 (l. 711) | PROMPT, QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0255 | Kap. 17.3 (l. 712) | PROMPT, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0256 | Kap. 17.3 (l. 713) | PROMPT, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0257 | Kap. 17.4 (l. 714-725) | VERSION, PROMPT, QUALITYCOST, QUEUE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0258 | Kap. 17.4 (l. 726) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0259 | Kap. 18 (l. 728-730) | PROMPT, QUEUE, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0260 | Kap. 18.1 (l. 731-732) | PROMPT, TIMELINE, QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0261 | Kap. 18.1 (l. 733) | PROMPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0262 | Kap. 18.2 (l. 734-742) | PROMPT, CONTINUITY, CAMERA | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0263 | Kap. 18.2 (l. 743) | PROMPT, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0264 | Kap. 18.3 (l. 744-745) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0265 | Kap. 18.3 (l. 746) | TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0266 | Kap. 18.3 (l. 747) | TIMELINE, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0267 | Kap. 18.4 (l. 748-752) | CORE, SCRIPT, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0268 | Kap. 18.4 (l. 753) | CORE, TIMELINE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0269 | Kap. 19 (l. 755-756) | PROVIDER, PROMPT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0270 | Kap. 19.1 (l. 757-758) | PROVIDER, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0271 | Kap. 19.1 (l. 759) | SECURITY, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0272 | Kap. 19.1 (l. 760) | SECURITY, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0273 | Kap. 19.2 (l. 761-772) | PROVIDER, QUALITYCOST | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0274 | Kap. 19.2 (l. 773) | PROVIDER, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0275 | Kap. 19.3 (l. 774-783) | QUALITYCOST, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0276 | Kap. 19.3 (l. 784) | QUALITYCOST, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0277 | Kap. 19.3 (l. 785) | QUALITYCOST, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0278 | Kap. 19.4 (l. 786-796) | QUALITYCOST, PROVIDER, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0279 | Kap. 19.5 (l. 797-798) | QUALITYCOST, QUEUE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0280 | Kap. 19.5 (l. 799-806) | QUALITYCOST, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0281 | Kap. 19.5 (l. 807) | QUALITYCOST, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0282 | Kap. 19.6 (l. 808-814) | QUALITYCOST | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0283 | Kap. 19.6 (l. 815) | QUALITYCOST, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0284 | Kap. 19.6 (l. 816) | QUALITYCOST, QUEUE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0285 | Kap. 19.7 (l. 817-818) | QUALITYCOST, VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0286 | Kap. 19.7 (l. 819) | VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Revisjon 2026-10-08: tekst/prioritet justert mot mandatet |
| REQ-0287 | Kap. 19.8 (l. 820-826) | QUALITYCOST, CONTINUITY | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0288 | Kap. 19.8 (l. 827) | QUALITYCOST, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0289 | Kap. 20 (l. 829-830) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0290 | Kap. 20.1 (l. 831-833) | QUEUE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0291 | Kap. 20.2 (l. 834-835) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0292 | Kap. 20.2 (l. 836) | QUEUE, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0293 | Kap. 20.2 (l. 837) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0294 | Kap. 20.3 (l. 838-846) | QUEUE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0295 | Kap. 20.3 (l. 847) | QUEUE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0296 | Kap. 20.4 (l. 848-853) | QUEUE, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0297 | Kap. 20.5 (l. 854-856) | QUEUE, QUALITYCOST | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Revisjon 2026-10-08: tekst/prioritet justert mot mandatet |
| REQ-0298 | Kap. 20.5 (l. 857) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0299 | Kap. 20.5 (l. 858) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0300 | Kap. 20.5 (l. 859) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0301 | Kap. 20.5 (l. 860) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0302 | Kap. 20.5 (l. 861) | QUEUE, QUALITYCOST | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0303 | Kap. 20.5 (l. 862) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0304 | Kap. 21 (l. 864-865) | VERSION, CORE | src/core/commands/apply.ts, db/migrations/0001_core.sql | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0305 | Kap. 21.1 (l. 866-875) | VERSION, CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0306 | Kap. 21.2 (l. 876-888) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0307 | Kap. 21.2 (l. 880-881) | VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0308 | Kap. 21.2 (l. 884) | VERSION, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0309 | Kap. 21.2 (l. 885) | QUALITYCOST, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0310 | Kap. 21.2 (l. 886) | VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0311 | Kap. 21.2 (l. 887-888) | VERSION, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0312 | Kap. 21.3 (l. 889-890) | VERSION, TIMELINE, AUDIO | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0313 | Kap. 21.3 (l. 891) | VERSION, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0314 | Kap. 21.3 (l. 892) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0315 | Kap. 21.4 (l. 893-899) | VERSION, UI, SCRIPT, COMPOSE, TIMELINE, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0316 | Kap. 21.5 (l. 900-901) | VERSION, SECURITY | src/core/commands/apply.ts, db/migrations/0001_core.sql#protect_takes | 1 | tests/invariants/random-sequences.test.ts::INV-07/13: produsert materiale og historikk endres eller slettes aldri, tests/db/run-db-tests.ts::INV-07: produsert materiale kan ikke slettes eller overskrives | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0317 | Kap. 21.5 (l. 902) | VERSION, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0318 | Kap. 21.5 (l. 902) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0319 | Kap. 22 (l. 904-905) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0320 | Kap. 22 (l. 906-907) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0321 | Kap. 22 (l. 908) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0322 | Kap. 22 (l. 909) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0323 | Kap. 22 (l. 910) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0324 | Kap. 22 (l. 911) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0325 | Kap. 22 (l. 912) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0326 | Kap. 22 (l. 913) | CONTINUITY, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0327 | Kap. 22 (l. 914) | CONTINUITY, SCRIPT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0328 | Kap. 23.1 (l. 917-918) | L10N, SCRIPT, CORE | src/core/model.ts, db/migrations/0001_core.sql | 2 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0329 | Kap. 23.1 (l. 919) | L10N, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0330 | Kap. 23.1 (l. 920) | L10N, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0331 | Kap. 23.1 (l. 921) | L10N, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0332 | Kap. 23.2 (l. 922-923) | L10N, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0002: Akseptanse/merknad tilpasset nytt referansemanus |
| REQ-0333 | Kap. 23.2 (l. 924-930) | L10N, SCRIPT, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0002: Akseptanse/merknad tilpasset nytt referansemanus |
| REQ-0334 | Kap. 23.2 (l. 931) | L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0335 | Kap. 23.2 (l. 932) | L10N, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0336 | Kap. 23.3 (l. 933-940) | L10N, CORE, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0337 | Kap. 23.3 (l. 941) | L10N, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0338 | Kap. 23.4 (l. 942-943) | AUDIO, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0339 | Kap. 23.4 (l. 944-948) | AUDIO, L10N, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0340 | Kap. 23.5 (l. 949-950) | AUDIO, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0341 | Kap. 23.5 (l. 951) | AUDIO, L10N, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0342 | Kap. 23.5 (l. 952) | AUDIO, L10N, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0343 | Kap. 23.6 (l. 953-955) | L10N, AUDIO, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0344 | Kap. 23.6 (l. 956) | L10N, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0345 | Kap. 23.7 (l. 957-963) | L10N, VERSION, AUDIO | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0346 | Kap. 23.7 (l. 964-966) | L10N, AUDIO, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0347 | Kap. 23.7 (l. 966) | L10N, QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0348 | Kap. 23.8 (l. 967-970) | EXPORT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0349 | Kap. 23.8 (l. 971-972) | EXPORT, L10N, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0350 | Kap. 23.8 (l. 973) | EXPORT, AUDIO, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0351 | Kap. 23.8 (l. 974) | EXPORT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0352 | Kap. 23.8 (l. 975) | L10N, UI, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0353 | Kap. 24 (l. 977-987) | CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0354 | Kap. 24.1 (l. 988-989) | CORE, TIMELINE, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0355 | Kap. 24.1 (l. 990-997) | CORE, SCRIPT, TIMELINE, EXPORT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0356 | Kap. 24.2 (l. 998-999) | CORE, TIMELINE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0357 | Kap. 24.2 (l. 1000) | CORE, SCRIPT, TIMELINE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0358 | Kap. 24.2 (l. 1001) | CORE, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0359 | Kap. 24.3 (l. 1002-1012) | CORE, LIBRARY, TIMELINE, AUDIO | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0360 | Kap. 24.3 (l. 1013) | CORE, VERSION, LIBRARY | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0361 | Kap. 24.4 (l. 1014-1015) | SCRIPT, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0362 | Kap. 24.4 (l. 1016) | CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0363 | Kap. 24.4 (l. 1017) | CORE, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0364 | Kap. 24.4 (l. 1018) | LIBRARY, COMPOSE, AUDIO, PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0365 | Kap. 24.5 (l. 1019-1023) | CORE, VERSION, SCRIPT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0366 | Kap. 24.5 (l. 1024) | CORE, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0367 | Kap. 24.6 (l. 1025-1027) | TIMELINE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0368 | Kap. 24.6 (l. 1028) | TIMELINE, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0369 | Kap. 24.7 (l. 1029-1030) | CONTINUITY | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0370 | Kap. 24.7 (l. 1031) | SCRIPT, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0371 | Kap. 24.8 (l. 1032-1033) | L10N, AUDIO, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0372 | Kap. 24.8 (l. 1034) | L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0373 | Kap. 25 (l. 1036-1037) | CORE, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0374 | Kap. 25 (l. 1038) | CORE, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0375 | Kap. 25.1 (l. 1039-1047) | VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0376 | Kap. 25.2 (l. 1050) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0377 | Kap. 25.2 (l. 1051) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0378 | Kap. 25.2 (l. 1052) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0379 | Kap. 25.2 (l. 1053) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0380 | Kap. 25.2 (l. 1054) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0381 | Kap. 25.2 (l. 1055) | CORE, VERSION, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0382 | Kap. 25.2 (l. 1056) | VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0383 | Kap. 25.2 (l. 1057) | VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0384 | Kap. 26 (l. 1059-1060) | PRESENT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0385 | Kap. 26 (l. 1061) | PRESENT, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0386 | Kap. 26.1 (l. 1062-1065) | PRESENT, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0387 | Kap. 26.1 (l. 1066-1072) | PRESENT, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0388 | Kap. 26.2 A (l. 1073-1083) | PRESENT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0389 | Kap. 26.2 B (l. 1084-1093) | PRESENT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0390 | Kap. 26.3 (l. 1094-1109) | PRESENT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0391 | Kap. 26.3 (l. 1110) | PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0392 | Kap. 26.3 (l. 1111) | PRESENT, UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0393 | Kap. 26.4 (l. 1112-1122) | PRESENT, LIBRARY | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0394 | Kap. 26.4 (l. 1123) | PRESENT, SCRIPT, PROMPT | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0395 | Kap. 26.4 (l. 1124) | PRESENT, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0396 | Kap. 26.5 (l. 1125-1132) | PRESENT, PROMPT, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0397 | Kap. 26.6 (l. 1133-1143) | PRESENT, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0398 | Kap. 26.6 (l. 1144) | PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0399 | Kap. 26.6 (l. 1145) | PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0400 | Kap. 26.7 (l. 1146-1147) | PRESENT, PROMPT, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0401 | Kap. 26.7 (l. 1148) | QUALITYCOST, PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0402 | Kap. 26.7 (l. 1149) | LIBRARY, PRESENT, VERSION | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0403 | Kap. 26.8 (l. 1150-1152) | PRESENT, CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0404 | Kap. 26.8 (l. 1153) | PRESENT, L10N, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0405 | Kap. 27.1 (l. 1155-1168) | UI, CORE, QUEUE, QUALITYCOST, VERSION | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0406 | Kap. 27.2 (l. 1169-1178) | UI, CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0407 | Kap. 27.3 (l. 1179-1189) | CORE, SECURITY, QUEUE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0408 | Kap. 28 (l. 1191-1192) | SECURITY, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0409 | Kap. 28.1 (l. 1193-1194) | SECURITY | db/migrations/0001_core.sql, src/adapters/storage/project-rows.ts | 1 | tests/db/run-db-tests.ts::DEC-0022: kommandoer fra kjernen lagres atomisk og leses tilbake identisk, tests/unit/storage-contract.test.ts::loadProjectRows spør bare etter tabeller og kolonner som finnes | Verifisert | 2026-10-08 DEC-0022: Feil KI-18 rettet; kontrakttest lagt til |
| REQ-0410 | Kap. 28.1 (l. 1195) | SECURITY, CORE | src/adapters/storage/commands.functions.ts, src/adapters/storage/project-rows.ts | 1 | tests/db/run-db-tests.ts::DEC-0022: kommandoer fra kjernen lagres atomisk og leses tilbake identisk, tests/unit/storage-contract.test.ts::loadProjectRows spør bare etter tabeller og kolonner som finnes | Verifisert | 2026-10-08 DEC-0022: Feil KI-18 rettet; kontrakttest lagt til |
| REQ-0411 | Kap. 28.2 (l. 1196-1197) | EXPORT, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0412 | Kap. 28.2 (l. 1198-1206) | EXPORT, SECURITY, VERSION | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0413 | Kap. 28.3 (l. 1207-1208) | SECURITY, PROVIDER | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0414 | Kap. 28.3 (l. 1209) | SECURITY | src/adapters/storage/commands.functions.ts | 2 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0415 | Kap. 28.4 (l. 1210-1218) | SECURITY, CORE | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0416 | Kap. 29 (l. 1220-1221) | EXPORT | src/engine/export/animatic.ts | 1 | tests/visual/screens.mjs::48-montering-eksport-ferdig | Verifisert | 2026-10-09 DEC-0043: Eksportmodul uten AI |
| REQ-0417 | Kap. 29.1 (l. 1222-1229) | EXPORT, TIMELINE | src/core/assembly/film.ts, src/app/assembly/ExportAnimaticDialog.tsx | 2 | tests/unit/assembly.test.ts::hele filmen, én scene og et utvalg | Under arbeid | 2026-10-09 DEC-0043: Hele filmen, valgt scene og fra–til scene; spinoff og trailer kommer med M7 |
| REQ-0418 | Kap. 29.2 (l. 1230-1238) | EXPORT, COMPOSE, AUDIO | src/engine/export/animatic.ts | 2 | – | Under arbeid | 2026-10-09 DEC-0044: Eksport av 2D-animasjon med dialog, musikk og effekter; importert og AI-generert film kommer senere |
| REQ-0419 | Kap. 29.3 (l. 1239-1240) | EXPORT, SCRIPT | src/app/script/ExportDialog.tsx, src/core/screenplay/numbering.ts | 2 | tests/unit/numbering.test.ts | Verifisert | 2026-10-09 DEC-0024: M2; status Verifisert |
| REQ-0420 | Kap. 29.4 (l. 1241-1242) | EXPORT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0421 | Kap. 29.5 (l. 1243-1244) | EXPORT, PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0422 | Kap. 29.6 (l. 1245-1254) | EXPORT, VERSION | src/app/assembly/ExportAnimaticDialog.tsx | 2 | tests/visual/screens.mjs::47-montering-eksport | Verifisert | 2026-10-09 DEC-0043: Kontroll før eksport: sceneorden, deaktiverte scener, scener uten 2D-scene, beregnede lengder og manglende bilder |
| REQ-0423 | Kap. 29.6 (l. 1255) | EXPORT, UI | src/app/assembly/ExportAnimaticDialog.tsx | 1 | tests/visual/screens.mjs::47-montering-eksport | Verifisert | 2026-10-09 DEC-0043: «Eksporter likevel» når kontrollen har merknader |
| REQ-0424 | Kap. 30 (l. 1257-1258) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0425 | Kap. 30.1 (l. 1259-1268) | UI | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0426 | Kap. 30.1 (l. 1269) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0427 | Kap. 30.2 (l. 1270-1285) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0428 | Kap. 30.2 (l. 1286) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0429 | Kap. 30.2 (l. 1287) | UI, PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0430 | Kap. 30.3 (l. 1288-1301) | UI, L10N | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0431 | Kap. 30.3 (l. 1302) | UI, PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0432 | Kap. 31 (l. 1304-1306, 1351) | CORE, SCRIPT, TIMELINE, LIBRARY, CONTINUITY, COMPOSE, CAMERA, AUDIO, PROMPT, PROVIDER, QUALITYCOST, QUEUE, VERSION, L10N, PRESENT, EXPORT, SECURITY | src/core/, src/adapters/, src/app/ | 2 | tests/architecture/core-purity.test.ts::importerer ikke rammeverk, backend eller plattform-API-er | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0433 | Kap. 31 (l. 1307-1309) | CORE | src/core/ | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0434 | Kap. 31 (l. 1310-1312) | SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0435 | Kap. 31 (l. 1313-1314) | TIMELINE | src/core/assembly/film.ts | 1 | – | Under arbeid | 2026-10-09 DEC-0043: Timeline & Assembly Engine del 1 |
| REQ-0436 | Kap. 31 (l. 1315-1317) | LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0437 | Kap. 31 (l. 1318-1320) | CONTINUITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0438 | Kap. 31 (l. 1321-1322) | COMPOSE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0439 | Kap. 31 (l. 1323-1324) | CAMERA | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0440 | Kap. 31 (l. 1325-1327) | AUDIO | src/engine/audio/mixer.ts | 1 | – | Under arbeid | 2026-10-09 DEC-0044: Audio Engine del 1: dekoding, plassering, miksing og eksport |
| REQ-0441 | Kap. 31 (l. 1328-1330) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0442 | Kap. 31 (l. 1331-1333) | PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0443 | Kap. 31 (l. 1334-1335) | QUALITYCOST | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0444 | Kap. 31 (l. 1336-1337) | QUEUE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0445 | Kap. 31 (l. 1338-1339) | VERSION | src/core/commands/apply.ts, db/migrations/0001_core.sql | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0446 | Kap. 31 (l. 1340-1342) | L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0447 | Kap. 31 (l. 1343-1344) | PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0448 | Kap. 31 (l. 1345-1347) | EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0449 | Kap. 31 (l. 1348-1350) | SECURITY | db/migrations/0001_core.sql | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0450 | Kap. 32 (l. 1353-1355) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0451 | Kap. Fase 1 (l. 1356-1368) | PROCESS | src/core/, db/migrations/0001_core.sql | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0452 | Kap. Fase 1 (l. 1369) | CORE, PROCESS | – | 2 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0453 | Kap. Fase 2 (l. 1370-1379) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0454 | Kap. Fase 3 (l. 1380-1388) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0455 | Kap. Fase 4 (l. 1389-1395) | PROCESS | src/app/assembly/ | 1 | – | Under arbeid | 2026-10-09 DEC-0043: M4 del 1 levert: filmtidslinje, avspilling og eksport |
| REQ-0456 | Kap. Fase 5 (l. 1396-1404) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0457 | Kap. Fase 6 (l. 1405-1412) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0458 | Kap. Fase 7 (l. 1413-1420) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0459 | Kap. Fase 8 (l. 1421-1428) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0460 | Kap. Fase 8 (l. 1429) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0461 | Kap. Fase 8 (l. 1430) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0462 | Kap. 33 (l. 1432-1433) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0463 | Kap. 33.1 (l. 1434-1444) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0464 | Kap. 33.1 (l. 1445) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0465 | Kap. 33.2 (l. 1446-1457) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0466 | Kap. 33.3 (l. 1458-1459) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0467 | Kap. 33.3 (l. 1460-1466) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0468 | Kap. 33.3 (l. 1467) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0469 | Kap. 33.4 (l. 1468-1469) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0470 | Kap. 33.4 (l. 1470-1471) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0471 | Kap. 33.4 (l. 1472) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0472 | Kap. 33.4 (l. 1473) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0473 | Kap. 33.4 (l. 1474) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0474 | Kap. 33.5 (l. 1475-1477) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0475 | Kap. 33.5 (l. 1478) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0476 | Kap. 33.6 (l. 1479-1480) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0477 | Kap. 33.6 (l. 1481) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0478 | Kap. 33.6 (l. 1482) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0479 | Kap. 34 (l. 1486-1487) | UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0480 | Kap. 34 (l. 1488-1490) | CORE, SCRIPT, TIMELINE | src/core/views.ts | 1 | tests/invariants/random-sequences.test.ts::INV-01: manus og film har alltid samme aktive rekkefølge i alle produksjoner | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0481 | Kap. 34 (l. 1491-1492) | CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0482 | Kap. 34 (l. 1493-1495) | EXPORT, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0483 | Kap. 34 (l. 1496-1498) | SCRIPT, L10N | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0484 | Kap. 34 (l. 1499-1501) | VERSION, CORE | src/core/model.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0485 | Kap. 34 (l. 1502-1504) | VERSION, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0486 | Kap. 34 (l. 1505-1506) | VERSION, UI | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0487 | Kap. 34 (l. 1507-1508) | COMPOSE, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0488 | Kap. 34 (l. 1509-1510) | COMPOSE, CAMERA | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0489 | Kap. 34 (l. 1511) | PROMPT, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0490 | Kap. 34 (l. 1512) | PROMPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0491 | Kap. 34 (l. 1513) | QUALITYCOST, PROVIDER | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0492 | Kap. 34 (l. 1514) | PROMPT, TIMELINE, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0493 | Kap. 34 (l. 1515-1516) | TIMELINE, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0494 | Kap. 34 (l. 1517-1518) | TIMELINE, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0495 | Kap. 34 (l. 1519) | UI, SCRIPT | src/app/projects/DurationOverview.tsx | 1 | tests/visual/screens.mjs::18-oversikt-varighet | Verifisert | 2026-10-09 DEC-0028: status Verifisert |
| REQ-0496 | Kap. 34 (l. 1520-1522) | CONTINUITY, LIBRARY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0497 | Kap. 34 (l. 1523-1524) | CONTINUITY, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0498 | Kap. 34 (l. 1525-1526) | CORE, LIBRARY, TIMELINE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0499 | Kap. 34 (l. 1527-1529) | CORE, SCRIPT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0500 | Kap. 34 (l. 1530-1531) | VERSION, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0501 | Kap. 34 (l. 1532-1533) | PRESENT, EXPORT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0502 | Kap. 34 (l. 1534-1535) | PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0503 | Kap. 34 (l. 1536-1537) | LIBRARY, PRESENT | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0504 | Kap. 34 (l. 1538-1539) | QUEUE, CORE | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0505 | Kap. 34 (l. 1540-1541) | VERSION, CORE, SECURITY | src/core/commands/apply.ts, db/migrations/0001_core.sql | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0506 | Kap. 34 (l. 1542) | CORE, PROCESS | src/core/ | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0507 | Kap. 35 (l. 1545) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0508 | Kap. 35 (l. 1546) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0509 | Kap. 35 (l. 1548) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0510 | Kap. 35 (l. 1549) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0511 | Kap. 35 (l. 1550) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0512 | Kap. 35 (l. 1551) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0513 | Kap. 35 (l. 1552) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0514 | Kap. 35 (l. 1553) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0515 | Kap. 35 (l. 1554) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0516 | Kap. 35 (l. 1555) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0517 | Kap. 35 (l. 1556) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0518 | Kap. 35 (l. 1557) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0519 | Kap. 35 (l. 1558-1559) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet |
| REQ-0520 | Beslutning DEC-0003 | COLLAB, CORE, SECURITY | db/migrations/0001_core.sql | 1 | tests/db/run-db-tests.ts::REQ-0521: eier inviterer, mottaker aksepterer og får lesetilgang | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0521 | Beslutning DEC-0003 | COLLAB, SECURITY, UI | db/migrations/0001_core.sql#create_invitation, src/app/projects/ProjectOverview.tsx, src/routes/invitasjon.tsx | 2 | tests/db/run-db-tests.ts::REQ-0521: eier inviterer, mottaker aksepterer og får lesetilgang, tests/db/run-db-tests.ts::INV-C2: invitasjon for prosjekt X gir ikke tilgang til prosjekt Y | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0522 | Beslutning DEC-0003 | COLLAB, SCRIPT, VERSION | src/core/commands/apply.ts | 2 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0523 | Beslutning DEC-0010 | COLLAB, SECURITY | db/migrations/0001_core.sql | 1 | tests/db/run-db-tests.ts::REQ-0523: leser kan ikke invitere eller skrive | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0524 | Beslutning DEC-0010 | COLLAB, SECURITY, CORE | db/migrations/0001_core.sql | 2 | tests/db/run-db-tests.ts::INV-C2: ikke-medlem ser ingenting, tests/db/run-db-tests.ts::INV-C2: klienten kan ikke skrive direkte i tabellene, tests/db/run-db-tests.ts::INV-C2: klienten kan ikke kalle apply_changes | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0525 | Beslutning DEC-0010 | COLLAB, VERSION | db/migrations/0001_core.sql#change_log | 1 | tests/db/run-db-tests.ts::redigering av replikk gir ny historikkrad med forfatter | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0526 | Beslutning DEC-0010 | COLLAB, CORE, VERSION | src/core/commands/apply.ts, db/migrations/0001_core.sql#apply_changes | 2 | tests/unit/commands.test.ts::en skriving basert på gammel revisjon avvises og endrer ingenting, tests/db/run-db-tests.ts::INV-C1: en endring basert på gammel revisjon avvises av databasen (P0409) | Verifisert | 2026-10-08 DEC-0022: M1: status Verifisert |
| REQ-0527 | Beslutning DEC-0010 | COLLAB, VERSION, UI | src/core/commands/apply.ts | 1 | – | Under arbeid | 2026-10-08 DEC-0022: M1: delvis implementert (se implementation) |
| REQ-0528 | Beslutning DEC-0010, DEC-0018 | COLLAB, QUALITYCOST, SECURITY | – | 1 | – | Ikke startet | 2026-10-08 DEC-0010: Revisjon: kilde satt til DEC-0010 (teknisk anbefaling) |
| REQ-0529 | Beslutning DEC-0010 | COLLAB, VERSION | – | 1 | – | Ikke startet | 2026-10-08 DEC-0010: Revisjon: kilde satt til DEC-0010 (teknisk anbefaling) |
| REQ-0530 | Kap. 1 (l. 6) | PROCESS | – | 1 | – | Ikke startet | 2026-10-08 DEC-0001: Opprettet (lagt til ved dekningskontroll – linje 6 manglet) |
| REQ-0531 | Beslutning DEC-0027 | SCRIPT, UI | src/core/screenplay/filter.ts#filterPages, src/app/script/ScriptWorkspace.tsx | 2 | tests/unit/filter.test.ts::viser bare den valgte scenens linjer med samme sidetall som i hele manuset, tests/visual/screens.mjs::16-vis-kun-valgt-scene | Verifisert | 2026-10-09 DEC-0027: Bygget i M2 del 2; status Verifisert |
| REQ-0532 | Beslutning DEC-0029 | SCRIPT, UI | src/app/script/SceneNavigator.tsx, src/app/script/Inspector.tsx#ScenePanel | 1 | tests/visual/screens.mjs::06-manus, tests/visual/screens.mjs::19-manus-endre-rekkefolge | Verifisert | 2026-10-09 DEC-0029: Bygget med bryteren «Endre rekkefølge og synlighet»; status Verifisert |
| REQ-0533 | Beslutning DEC-0029 | SCRIPT, UI | src/core/screenplay/versions.ts#movedOccurrences, src/app/script/SceneNavigator.tsx | 2 | tests/unit/versions.test.ts::markerer bare scenen som er flyttet, ikke scenene den hoppet over, tests/visual/screens.mjs::06-manus | Verifisert | 2026-10-09 DEC-0029: Bygget; status Verifisert |
| REQ-0534 | Beslutning DEC-0029 | SCRIPT, UI | src/core/screenplay/versions.ts#sceneLineChanges, src/core/screenplay/versions.ts#wordDiff, src/app/script/VersionsDialog.tsx | 1 | tests/unit/versions.test.ts::viser endrede, nye og fjernede linjer med hvem som snakker, tests/unit/versions.test.ts::forteller hvor en flyttet scene sto og står, tests/visual/screens.mjs::17b-versjon-sammenlign | Verifisert | 2026-10-09 DEC-0029: Bygget; status Verifisert |
| REQ-0535 | Beslutning DEC-0031 | SCRIPT, UI | src/core/notes/index.ts, src/core/commands/apply.ts#AddAnnotations, src/app/script/NotesPanel.tsx, src/app/script/ScriptWorkspace.tsx | 2 | tests/unit/notes.test.ts::notat på tekst og nål på scenen, med stempel; sletting kan angres, tests/unit/notes.test.ts::notatet finner teksten igjen når manuset endres, og står ved blokkens start hvis den er borte, tests/visual/screens.mjs::23-notater, tests/visual/screens.mjs::25-nytt-notat, tests/db/run-db-tests.ts::0004: notater lagres med stempel | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0536 | Beslutning DEC-0031 | SCRIPT, UI | src/core/notes/index.ts#formatStamp, src/app/script/NotesPanel.tsx | 1 | tests/unit/notes.test.ts::notat på tekst og nål på scenen, med stempel; sletting kan angres, tests/visual/screens.mjs::23-notater | Verifisert | 2026-10-09 DEC-0032: Endringer av andres notater vises som «endret av [navn] · [tid]» |
| REQ-0537 | Beslutning DEC-0031 | SCRIPT, UI | src/app/script/NotesPanel.tsx, src/core/commands/apply.ts#SetAnnotationRemoved | 1 | tests/unit/notes.test.ts::notat på tekst og nål på scenen, med stempel; sletting kan angres | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0538 | Beslutning DEC-0031 | SCRIPT, UI | src/app/script/ScriptWorkspace.tsx, src/core/notes/index.ts#pageDecorations | 1 | tests/unit/notes.test.ts::markerer søketreff og notater på riktige kolonner i linjene, tests/visual/screens.mjs::23-notater | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0539 | Beslutning DEC-0031 | SCRIPT, UI | src/core/screenplay/filter.ts#matchingOccurrences, src/core/notes/index.ts#searchHits | 1 | tests/unit/notes.test.ts::søk treffer notater og forteller hva som ble truffet | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0540 | Beslutning DEC-0031 | SCRIPT, EXPORT, UI | src/core/notes/transfer.ts, src/engine/export/screenplay-docx.ts, src/engine/export/screenplay-pdf.ts, src/engine/import/docx-lines.ts#docxToLinesAndNotes, src/engine/import/pdf-lines.ts#pdfToLinesAndNotes, src/app/script/ExportDialog.tsx, src/app/script/ImportDialog.tsx | 1 | tests/unit/notes.test.ts::Word: notatene blir kommentarer og gjenopprettes ved import, tests/unit/notes.test.ts::PDF: notatene blir merknader og gjenopprettes ved import, tests/visual/screens.mjs::27-eksport-notater | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0541 | Beslutning DEC-0031 | SCRIPT, UI | src/core/notes/index.ts#searchHits, src/app/script/ScriptPageView.tsx, src/app/script/SceneNavigator.tsx | 2 | tests/unit/notes.test.ts::søk treffer notater og forteller hva som ble truffet, tests/visual/screens.mjs::24-sok-treff | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0542 | Beslutning DEC-0031 | SCRIPT, UI | src/app/script/ScriptWorkspace.tsx#updateInView, src/app/script/SceneNavigator.tsx | 1 | tests/visual/screens.mjs::26-bla-i-manus | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0543 | Beslutning DEC-0031 | SCRIPT, UI | src/app/script/ScriptWorkspace.tsx#scrollTo, src/app/script/ScriptPageView.tsx | 1 | tests/visual/screens.mjs::07-manus-scene-valgt | Verifisert | 2026-10-09 DEC-0031: Opprettet etter ønske fra Mars og bygget samme dag |
| REQ-0544 | Beslutning DEC-0034 | LIBRARY, SCRIPT, UI | src/core/library/suggest.ts#cleanSpeaker, src/core/library/suggest.ts#mergeTypos | 2 | tests/unit/suggest.test.ts, tests/unit/library.test.ts | Verifisert | 2026-10-09 DEC-0034: Opprettet etter beslutning fra Mars og bygget samme dag; status Verifisert |
| REQ-0545 | Beslutning DEC-0034 | LIBRARY, SCRIPT, UI | src/core/library/suggest.ts | 1 | tests/unit/suggest.test.ts, tests/unit/library.test.ts | Verifisert | 2026-10-09 DEC-0034: Opprettet etter beslutning fra Mars og bygget samme dag; status Verifisert |
| REQ-0546 | Beslutning DEC-0034 | LIBRARY, SCRIPT, UI | src/core/library/suggest.ts | 1 | tests/unit/suggest.test.ts, tests/unit/library.test.ts | Verifisert | 2026-10-09 DEC-0034: Opprettet etter beslutning fra Mars og bygget samme dag; status Verifisert |
| REQ-0547 | Beslutning DEC-0034 | LIBRARY, SCRIPT, UI | src/core/library/suggest.ts | 1 | tests/unit/suggest.test.ts, tests/unit/library.test.ts | Verifisert | 2026-10-09 DEC-0034: Opprettet etter beslutning fra Mars og bygget samme dag; status Verifisert |
| REQ-0548 | Beslutning DEC-0034 | LIBRARY, SCRIPT, UI | src/app/library/SuggestionsDialog.tsx | 1 | tests/visual/screens.mjs (32-bibliotek-forslag-ny) | Implementert – ikke verifisert | 2026-10-09 DEC-0034: Opprettet etter beslutning fra Mars og bygget samme dag; visuelt kontrollert (skjermbilde 32-bibliotek-forslag-ny); status Implementert – ikke verifisert |
| REQ-0549 | Beslutning DEC-0037 | COMPOSE, LIBRARY, UI | src/core/library/index.ts#assetsInScene, src/app/scene-editor/SceneAssetsPanel.tsx, src/app/scene-editor/Stage.tsx (onDrop), src/routes/prosjekt.$projectId.bibliotek.tsx (?asset=) | 2 | tests/unit/library.test.ts, tests/visual/screens.mjs (38-sceneeditor-i-scenen) | Verifisert | 2026-10-09 DEC-0037: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0550 | Beslutning DEC-0038 | UI | src/app/shell/pane-size.tsx | 1 | tests/visual/screens.mjs (39-paneler-justert) | Verifisert | 2026-10-09 DEC-0038: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0551 | Beslutning DEC-0039 | COMPOSE, TIMELINE, UI | src/core/composition/format.ts, src/core/commands/apply.ts (SetProjectFormat, UndoSetProjectFormat), db/migrations/0008_project_format.sql, src/app/projects/ProjectFormat.tsx | 2 | tests/unit/format.test.ts, tests/db/run-db-tests.ts (0008), tests/visual/screens.mjs (37-oversikt-format) | Verifisert | 2026-10-09 DEC-0039: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0552 | Beslutning DEC-0040 | UI | src/app/shell/ProjectNav.tsx, src/app/shell/pane-size.tsx#useStoredFlag | 1 | tests/visual/screens.mjs (40-meny-sammenslatt) | Verifisert | 2026-10-09 DEC-0040: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0553 | Beslutning DEC-0040 | UI, COMPOSE | src/app/scene-editor/ScenePicker.tsx | 1 | tests/visual/screens.mjs (41-scenevelger) | Verifisert | 2026-10-09 DEC-0040: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0554 | Beslutning DEC-0040 | COMPOSE, CAMERA, UI | src/app/scene-editor/PreviewWindow.tsx, src/app/scene-editor/SceneEditorWorkspace.tsx | 1 | tests/visual/screens.mjs (42-forhandsvisning) | Verifisert | 2026-10-09 DEC-0040: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0555 | Beslutning DEC-0041 | COMPOSE, UI | src/app/scene-editor/PreviewWindow.tsx, src/app/shell/pane-size.tsx | 1 | tests/visual/screens.mjs (43-forhandsvisning-flyttet-zoom) | Verifisert | 2026-10-09 DEC-0041: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0556 | Beslutning DEC-0041 | COMPOSE, UI | src/app/scene-editor/PreviewWindow.tsx, src/app/scene-editor/SceneEditorWorkspace.tsx | 1 | tests/visual/screens.mjs (44-forhandsvisning-eget-vindu) | Verifisert | 2026-10-09 DEC-0041: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0557 | Beslutning DEC-0042 | COMPOSE, UI | src/app/scene-editor/PreviewWindow.tsx | 1 | tests/visual/screens.mjs::43-forhandsvisning-flyttet-zoom | Verifisert | 2026-10-09 DEC-0042: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0558 | Beslutning DEC-0044 | AUDIO, TIMELINE | src/core/assembly/film.ts, src/core/composition/animate.ts, src/app/audio/use-audio-playback.ts | 1 | tests/unit/audio.test.ts::følger scenen når den flyttes, og en scene uten 2D-scene blir minst så lang som lyden | Verifisert | 2026-10-09 DEC-0044: Opprettet etter beslutning fra Mars og bygget samme dag |
| REQ-0559 | Beslutning DEC-0044 | COMPOSE, LIBRARY, UI | src/app/scene-editor/LayerImageDialog.tsx, src/app/scene-editor/Stage.tsx, src/app/scene-editor/LayersPanel.tsx | 1 | tests/visual/screens.mjs::49-lag-bilde | Under arbeid | 2026-10-09 DEC-0044: Opprettet etter beslutning fra Mars; velg og last opp bygget, AI-generering venter på M5 (kostnader) |
