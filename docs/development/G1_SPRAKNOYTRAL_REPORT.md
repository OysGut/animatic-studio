# G-1 – språknøytral grunnmur

## Beslutning og status
Øystein besluttet 23.10.2026 at ingen datamodell, logikk eller standardverdi skal anta norsk eller Norge. Det finnes ingen faktiske brukere; testdata kan konverteres eller tapes, men unødvendig sletting skal unngås.

**Status: G-1a delvis levert og lokalt testet; G-1b ikke levert.** G-1 følger etter den delvise N11-leveransen. N11s 17 uverifiserte restkrav forblir separate. 0090 er prøvd bare i en isolert lokal testdatabase. Ingen Cloud-endring eller publisering er utført.

G-1 erstatter eldre norsk-kildekrav uttrykkelig. Historiske rapporter brukes som kode-/testreferanser, ikke som grunnlag for å avvise nye bestilte språk eller importformater.

## Plan

### G-1a – database og kjerne
- Ny migrasjonsfil 0090; 0089 og eldre beholdes byte-for-byte.
- Ett BCP-47-kildespråk på prosjektet; faktisk kildespråk på kildeblokker; språkfri intern kildeidentitet i tekstkart.
- Mål kan være norsk eller hvilket som helst annet språk, men aldri prosjektets kilde. Databasen kontrollerer også eksisterende barn når kilden endres.
- Bruk siste RPC-definisjoner som utgangspunkt og dokumenter alle erstattede/opprettede funksjoner og konverteringsregler.
- Én sourceLanguageOf(state) gjennom lasting, kommandoer, oversettelse, avvik, TTS, eksport og sikkerhetskopi/gjenoppretting. Schema-kontrakt 90.
- INV-05: «Manusets språk (kildespråket) er kilden; kildeteksten endres aldri automatisk av språkversjoner.» Det låste mandatet redigeres ikke.

### G-1b – standardverdier og brukerflate
- Klassifiser alle norske språk-/landantakelser, inkludert prompts, stemmer, fontvalg, formatering, maler og sortering; behold legitime språkregistre og brukerinnhold.
- Manusspråk velges ved prosjektoppretting, foreslått fra grensesnittspråket. Endring senere gir advarsel, bevarer tekst og krever eksplisitt konfliktløsning hvis et mål blir kilde.
- Fountain/FDX/Word/PDF foreslår språk fra metadata eller eksisterende deteksjon og krever bekreftelse; ingen betalte deteksjonskall.
- Talespråk, grensesnittspråk og B-097-land/datoformat er uavhengige av manusets språk.
- Alle nye og endrede tekster leveres gjennom t() på alle registrerte språk i samme endring.

## Planlagt verifisering
Japansk manus med norsk og engelsk mål, engelsk manus med norsk mål, og norsk regresjonsprosjekt. Kjernen og databasen testes for oversettelse, linjejustering, avvik, TTS, PTG/manus-PDF og sikkerhetskopirundtur. Nye kommandoer får angre/gjør om-test. Arkitekturtest tillater bare begrunnede språkverdier, ikke skjulte norske standarder.

Full Vitest, automatisk typekontroll, i18n og isolerte lokale DB-tester skal dokumenteres med faktiske resultater. Brukerflyten testes med faste svar og uten betalte kall. Ingen tester er kjørt i planfasen; ingen krav er flyttet til Verifisert.

## G-1a – resultat

### Levert og kontrollert lokalt
- Ny 0090; 0089 og eldre er uendret, MD5-kontrollen består.
- Prosjektets `source_language` kopieres fra `script_language`, ellers `primary_language`. De to gamle prosjektkolonnene fjernes bare i 0090. Kildeblokkenes språk følger prosjektet. Ingen tekst slettes eller oversettes.
- Intern tekstnøkkel er `source`, ikke en språkkode. Norsk/no har ingen særskilt målspråksperre. Legacy-felt leses fortsatt ved konvertering av gamle sikkerhetskopier.
- Triggere låser prosjektet, nekter mål lik kilde og nekter kildebytte med konflikter også i beholdte fjernede rader. En konverteringskonflikt stopper migrasjonen med prosjekt-/rad-ID; den løses ikke ved stille sletting.
- Versjons-/barnintegritet kontrolleres utsatt ved transaksjonsslutt, også ved endring av forelderens språk/prosjekt.
- Kildefølsomme lyd-, film-, animasjon-, manusvisnings-, PTG-/Dragonframe- og eksportvalg bruker prosjektets kilde eller den språkfrie kildemarkøren. Lyd uten prosjektkontekst beholder markøren; dette er ikke et talespråk til en leverandør.
- Kildebytte oppdaterer lokale blokker og revisjoner reversibelt. Teksten bevares, og lokal state samsvarer med DB-lesingen i ny 0090-test.
- Schema-kontrakt 90, prosjektopprettingens adapter sender valgt grensesnittspråk som foreløpig kilde, og gjenoppretting sender sikkerhetskopiens kilde.
- INV-05 og AGENTS-regel 64 er oppdatert. REQ-0925 er **Under arbeid**, ikke Verifisert.

### Funksjoner i 0090
| Funksjon | Endring og begrunnelse |
| --- | --- |
| `public.apply_changes(uuid,uuid,uuid,jsonb,jsonb,jsonb)` | Siste definisjon fra 0088; kun prosjektets språkfelt byttes til source_language. |
| `public.create_project(text,integer,integer,text)` | Fra 0067; legger til kildeparameter og engelske, landnøytrale standardnavn. Gammel treparameterversjon fjernes. |
| `private.valid_language_tag(text)` | Ny; samme kanoniske språk/skript/region/variant-delmengde som kjerneoversettelser. Ikke full BCP-47; se restlisten. |
| `private.guard_project_language_child()` | Ny; kildeblokken følger prosjektet, mål avvises ved kildekollisjon, versjonskilde fylles fra prosjektet. |
| `private.guard_source_language_change()` | Ny; kildebytte avvises hvis beholdte mål kolliderer. |
| `private.propagate_source_language()` | Ny; oppdaterer språkmetadata på kildeblokker og versjoner, aldri tekst. |
| `private.guard_language_version_scope()` | Ny; utsatt kryssradkontroll på versjoner, oversettelser, linjer og lenker. |

`delete_project`, `purge_project_assets`, `purge_removed_assets` og eksport-RPC-er er ikke erstattet: de bruker permanente ID-er, ikke kildefeltet. Sikkerhetskopi/gjenoppretting håndteres i kjernen og nettleseradapteren. Dette erstatter ikke den brede G-1b-kartleggingen av alle hardkoder.

### Faktisk verifisering
- **Full Vitest:** 338 testfiler bestått, 2 eksisterende hoppet over; **2711 bestått, 0 feilet**, 10 eksisterende hoppet over. Siste standardkjøring: 171,68 sekunder. Ingen pool-/optimizer-endringer er beholdt.
- **Ny kjernetest:** `tests/unit/g1-source-foundation.test.ts`, 3/0: ja/en/nb, norsk mål, kildeidentitet, kildebasert tale/lyd, PTG-språktag, radlesing og angre/gjør om uten tekstendring.
- **Lokale DB-tester:** **182 bestått, 0 feilet** etter at alle 90 migrasjoner ble brukt i et nytt isolert testmiljø. Ny 0090-test dekker ja/en/nb, norske/engelske/japanske mål, linjekobling, kildebytte, lokale/persisterte blokker, foreldreintegritet og sletting/purge.
- **Typekontroll:** harnessens siste kontroll og bygg viser `build OK` (23.10.2026 kl. 08:28 UTC). Ingen manuell tsc-kjøring, i samsvar med miljøets regel.
- **i18n:** `node scripts/i18n/check.mjs` grønn; alle registrerte språk. Én foreldet norskspesifikk feilnøkkel er fjernet på alle språk og fra historikk-fixturen; øvrige historikkhashes er beholdt. To katalog-antallstester er oppdatert tilsvarende. Ingen nye maskinoversettelser.
- **Ingen Cloud-kjøring, betalte AI-kall, pakkeinstallasjon eller publisering.**

## G-1b – resultat og gjenstående arbeid
Ikke levert. Dette er ikke en ferdig språknøytral applikasjon:
1. Brukeren må fortsatt få kildevelger ved oppretting og en tydelig, oversatt advarsel/bekreftelse ved senere kildebytte. Den eksisterende blur-kontrollen er ikke nok.
2. Fountain/FDX/Word/PDF-import må foreslå og kreve bekreftelse av kilde. Ikke implementert.
3. Bred kontroll av norske standarder, prompts, dato/tall/valuta, stemmer, maler, manusord og fonter samt den bestilte arkitekturtesten gjenstår. `PRIMARY_LANGUAGE` er ennå en kompatibilitetsmarkør, ikke fjernet symbol.
4. Full BCP-47 må samordnes mellom Intl-validering for tale og DB/oversettelsenes eksisterende kanoniske delmengde. Unicode-utvidelser/private brukstags er ikke fullt levert for prosjekt/oversettelser.
5. Japansk manus-PDF stoppes fortsatt av eksisterende Courier/WinAnsi-fontkontroll; ingen tapsfri japansk PDF-løsning er levert. Dette må løses, ikke merkes godkjent.
6. Målrettet komplett ja/en/nb-rundtur gjennom backup/gjenoppretting, genererte avvik og faktisk eksportfil (ikke bare PTG-modell) gjenstår, selv om eksisterende backup-/eksportsuiter er grønne.
7. End-to-end i den virkelige brukerflaten er ikke verifisert: Cloud er fortsatt schema 89 og ingen 0090 er kjørt der. SchemaBanner vil varsle mismatch; ikke publiser schema-90-koden før Claudes gjennomgang og migrasjon.
8. Genererte kravoversikter og samlet KB-kontroll gjenstår: miljøet mangler PyYAML. Ingen pakke ble lagt til.

N11s 17 restkrav er fortsatt separate og ikke flyttet til Verifisert. Ingen krav er feilaktig merket ferdig. Claude må gjennomgå 0090 før Cloud-kjøring; G-1b og G-1a-restene må leveres etterpå.

## Endrede filer
Eksakt liste for G-1 frem til denne delrapporten, gruppert med kort formål:
- `.lovable/plan/g-1-språknøytral-grunnmur-2026-10-23.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `AGENTS.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `TODO.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `db/migrations/0090_language_neutral_foundation.sql` — Ny migrasjonsfil; bare lokalt testet.
- `docs/architecture/INVARIANTS.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `docs/development/G1_SPRAKNOYTRAL_REPORT.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `docs/product/requirements.yaml` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `roadmap.md` — Plan, delrapport, invariant, krav eller gjenstående oppgaver.
- `scripts/i18n/baseline.v1.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `scripts/i18n/candidates.v1.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `scripts/i18n/inventory-report.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `scripts/i18n/mapping.v1.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `scripts/i18n/references.v1.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/adapters/ai/line-align.functions.ts` — Kildevalg, visning eller lagring.
- `src/adapters/ai/translation-align.functions.ts` — Kildevalg, visning eller lagring.
- `src/adapters/browser/projects.ts` — Kildevalg, visning eller lagring.
- `src/adapters/storage/project-rows.ts` — Kildevalg, visning eller lagring.
- `src/app/assembly/SubtitleDialog.tsx` — Kildevalg, visning eller lagring.
- `src/app/audio/takes.ts` — Kildevalg, visning eller lagring.
- `src/app/library/DialogueBatchPanel.tsx` — Kildevalg, visning eller lagring.
- `src/app/projects/backup.ts` — Kildevalg, visning eller lagring.
- `src/app/scene-editor/DialogueLanguageControls.tsx` — Kildevalg, visning eller lagring.
- `src/app/script-explorer/ScriptExplorer.tsx` — Kildevalg, visning eller lagring.
- `src/app/script/ExportDialog.tsx` — Kildevalg, visning eller lagring.
- `src/app/script/Inspector.tsx` — Kildevalg, visning eller lagring.
- `src/app/script/ScriptLanguageSelect.tsx` — Kildevalg, visning eller lagring.
- `src/app/script/ScriptWorkspace.tsx` — Kildevalg, visning eller lagring.
- `src/app/script/TranslationPanel.tsx` — Kildevalg, visning eller lagring.
- `src/core/animation/tracks.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/assembly/film.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/audio/index.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/backup/index.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/commands/apply.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/composition/fields.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/dialogue/languages.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/dialogue/navigation.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/export-records.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/i18n/locales/de.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/en-XA.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/en.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/es.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/fr.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/it.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/ja.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/ko.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/nb.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/pt-BR.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/locales/ru.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/i18n/runtime.gen.json` — Katalog/historikk regenerert eller foreldet feilnøkkel avviklet.
- `src/core/interchange/dragonframe-import.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/invariants.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/language/index.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/model.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/patch.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/screenplay/forecast.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/translation/align-prompt.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/translation/language-tags.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/translation/language-versions.ts` — Kildeidentitet og kildefølsom logikk.
- `src/core/translation/line-align-prompt.ts` — Kildeidentitet og kildefølsom logikk.
- `tests/db/run-db-tests.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/helpers/fixtures.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/dv7-dv8.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/g1-source-foundation.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/i18n-ml1.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/i18n-ml2f.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/kildesprak.test.tsx` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/language.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/ml3-language-versions.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/ml4-ai-languages.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/n11-dialogue-batch.test.tsx` — G-1-test eller oppdatert gammel norskforventning.
- `tests/unit/verifisering4-kjerne.test.ts` — G-1-test eller oppdatert gammel norskforventning.
- `tests/visual/fixture-state.ts` — G-1-test eller oppdatert gammel norskforventning.

## G-1b – status etter første arbeidsbolk (2026-10-23)

**Levert og testet (45 målrettede tester grønne, bygg OK, i18n-sjekk grønn):**
- Punkt 1: Kildevelger ved prosjektoppretting (forhåndsvalgt fra grensesnittspråket) og bytte av kildespråk i språkversjonsdialogen med oversatt advarsel, bekreftelse og forklaring av konflikter med eksisterende mål (språkversjoner, oversettelser, oversatte linjer, linjekoblinger). Nye tester: `tests/unit/g1b-source-language.test.tsx`.
- Punkt 2 (Fountain/Word/PDF): importleseren gir språkhint fra Word-metadata (w:lang) eller skriftsystem; importdialogen viser forslaget og krever uttrykkelig bekreftelse før import. **FDX støttes ikke av importleseren i dag** – punktet er ikke levert for FDX. Nye tester: `tests/unit/g1-import-language.test.ts`.
- Punkt 3 (delvis): `PRIMARY_LANGUAGE` fjernet som symbol (den var ubrukt). Fast talespråk «no» fjernet: `SPEECH_LANGUAGE` er borte, `generateSpeech` krever nå eksplisitt språk fra `speechLanguageOf`, og `VoiceControls` får prosjektets kildespråk som forslag. Kostnadsrapportens standardvaluta følger brukerens land (Norge → NOK, ellers USD). UI-sortering bruker `collation()` (grensesnittspråket); innholdsfolding bruker rotkollation («und»). KI-prompter sier ikke lenger «Norwegian» om manuset – de viser til originalspråket, og skriveassistenten svarer på manusets språk.
- Punkt 4: BCP-47 samordnet – `languageTagError` bruker nå samme kanoniske mønster som kjernen og databasen (`canonicalLanguageTag`). Utvidelser (-u-, -x-) avvises likt i alle lag. Ingen 0091 nødvendig. Testen i `dv5-dv6.test.ts` er oppdatert til den samordnede regelen (forventningen om at «en-US-u-ca-gregory» aksepteres, er endret – oppdraget ba om samordning).

**Ikke levert ennå (gjenstår):**
- Punkt 2 for FDX (ingen FDX-leser finnes).
- Punkt 3 resten: arkitekturtesten mot hardkodet «nb»/«no» med unntaksliste; oversettelsesassistentens målspråk er fortsatt fast engelsk (produktvalg kreves); plakat/presentasjon er låst til nb/en (produktvalg); eksportenes tospråklige LESMEG (nb+en) er uendret (produktvalg); manusparserens norske/engelske nøkkelord er språkdata for gjenkjenning, ikke standard.
- Punkt 5: Noto per skriftsystem i manus-PDF.
- Punkt 6: komplett rundtur ja/en/nb (backup, gjenoppretting, avvik, eksportfil).
- Punkt 7: visuell brukerflyt-test.
- Punkt 8: check_kb og genererte kravoversikter.
- Full Vitest-kjøring og DB-tester er ikke kjørt i denne bolken; 45 berørte tester er grønne.

**Avvik:** Testforventningen i `dv5-dv6.test.ts` (en-US-u-ca-gregory) er endret som en del av den bestilte samordningen i punkt 4. Ingen andre avvik.

## G-1b – andre arbeidsbolk (2026-10-23)

**Levert:**
- Punkt 2-rest (FDX): ren kjerneomforming `src/core/screenplay/fdx.ts` (Final Draft-XML → tvungen Fountain), koblet inn i importleseren med språkforslag fra skriftsystemet og samme bekreftelse som de andre formatene. Test: `tests/unit/g1b-fdx.test.ts` (3 grønne).
- Migrasjon `db/migrations/0091_fdx_import_format.sql`: tillater formatet `fdx` for registrerte originalfiler. `EXPECTED_SCHEMA_VERSION` = 91. **Ikke kjørt – Claude kjører den.**
- Punkt 5 (forberedt): Noto Sans Arabic, Hebrew, Devanagari og Thai ligger i `public/fonts/pdf/` med `OFL.txt`. Noto Sans SC (17 MB) er for stor for repoet og ligger i fillageret (`src/assets/fonts/NotoSansSC.ttf.asset.json`).

**Gjenstår (ikke levert):**
- Punkt 5: fontene er ikke koblet til manus-PDF, plakat eller presentasjon ennå. Manus-PDF er en egen PDF-skriver med Courier; plan er jsPDF-vei med Noto når teksten har tegn utenfor WinAnsi. Begrensning: jsPDF former ikke devanagari/thai, og arabisk krever egen høyre-til-venstre-behandling.
- Plakat/presentasjon for alle språk (Øysteins valg): krever at `LocalizedText` blir et språkkart, at `Poster.language` blir BCP-47, og at sperren `language in ('nb','en')` på `posters` fjernes i 0091.
- 3-rest (arkitekturtest nb/no, sceneoverskrift-nøkkelord per språk), 6 (rundtur), 7 (brukerflyt), 8 (check_kb), full Vitest og DB-tester.

## G-1b – rettinger etter Claudes vitest (2026-10-23)

- Oversettelsesassistenten har ikke lenger engelsk som fast mål. `AssistRequest.targetLanguage` er påkrevd for «translate», valideres som BCP-47 og kan aldri være kildespråket. Forhåndsvalget er grensesnittspråket når det ikke er kildespråket, ellers første språkversjon (`defaultTranslateTarget`). Forslag, konfliktsjekk og lagret oversettelse bruker målspråket. Tre gamle tekster er avløst av nye nøkler (`replaces`), med oversettelse til alle språk (maskinoversatt: fr, es, ru, ja, pt-BR, de, it, ko).
- `scene-to-video.test.ts`: sjekker nå «original language» og at «Norwegian» ikke står i prompten.
- `t2-script-assist.test.ts`: snapshot med fast engelsk er fjernet; testen sjekker japansk og engelsk mål, avvisning uten mål og med kildespråket som mål, og forhåndsvalget.
- `verifisering4-redaksjon-ui.test.ts` (REQ-0053): importknappen er sperret til språket er bekreftet; testen sjekker forslaget, bekrefter og kontrollerer deretter byte-identisk original og kontrollsum som før. Ingen getContext-feil i denne filen.
- `fountain.test.ts`: `.fdx` gjenkjennes nå som format (G-1b).
- Resultat: tsc 0; full vitest 2729 bestått, 0 feilet (10 hoppet over som før); DB-tester 182 bestått, 0 feilet (med 0091); i18n-sjekk grønn.
