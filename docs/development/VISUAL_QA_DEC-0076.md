# Verifiseringsrunde 4 – DEC-0076

**Dato:** 12.10.2026 · **Utført av:** Claude (verifiseringsrunde 4) · **Grunnlag:** kravtekst og akseptansekriterier i `docs/product/requirements.yaml` (ikke endret), `docs/design/DESIGN_SYSTEM.md`, forrige runde (`VISUAL_QA_DEC-0075.md`).

## Hvordan kontrollen ble gjort

- **Nettleser:** dev-serveren (`bunx vite dev`, http://127.0.0.1:8080), fixturen `/tmp/claude-0/visual-fixture.json` («Jula på Dovre»), Chromium 1194 fra `/tmp/claude-0/pw`. Skriptet `tests/visual/verifisering4-ui.mjs` (kjøres som kopi fra `/tmp/claude-0/pw` med `ENV_FILE=/home/claude/animatic-studio/.env node verifisering4-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json /tmp/claude-0/qa76`) avslutter med kode 1 ved brudd.
  - Alle Supabase-svar mockes som i `verifisering3-ui.mjs`. **Nytt:** også appens serverfunksjoner besvares av skriptet (ingen kall går videre til dev-serverens server eller Supabase): leverandørlisten (`projectAiProviders` → Lovable, Google, OpenAI, ElevenLabs), lagring av kommandoer (`runCommand` → «lagret», så endringer står og kan følges videre), køen og oppfølgingen. Funksjonene som starter betalte jobber, registreres og skal aldri kalles (kontroll REQ-0029 til slutt: ingen ble kalt).
  - Fixturen utvides i minnet (ikke på disk): AI-video i bruk i scene 3 laget før en replikk ble endret (avvik), AI-video i scene 8, stillbilde (3 s) i scene 9 og en enkel 2D-scene (ett lag, «Tun») i scene 2. Testfilmene lages med ffmpeg: rød film med 440 Hz-tone (importert film), grønn med 880 Hz (AI-video), blått PNG-stillbilde.
  - Mikrofon: Chromiums falske lydenhet (`--use-fake-device-for-media-stream`).
  - **Siste kjøring: 58 kontroller, 57 bestått, 1 feilet** (avviket under REQ-0280). Logg: `/tmp/claude-0/qa76/verifisering4-ui.log`. Skjermbilder (ikke i repoet): `/tmp/claude-0/qa76/v4-*.png`.
- **Vitest (nye filer):** `tests/unit/verifisering4-kjerne.test.ts` (16 tester, node), `tests/unit/verifisering4-ai-ui.test.ts` (13, jsdom), `tests/unit/verifisering4-redaksjon-ui.test.ts` (11, jsdom), `tests/unit/verifisering4-ai-server.test.ts` (8, node, simulert Lovable AI Gateway). Alle 48 bestått; hele testsamlingen er grønn.
- **Gylne tester (REQ-0050):** `tests/golden/reference-screenplay.test.ts` og `tests/unit/verifisering2-manus.test.ts` kjørt mot referansemanuset `/tmp/claude-0/ref_no.pdf` (ligger utenfor repoet): 9 av 9 bestått.
- **Databasetester:** `tests/db/run-db-tests.ts` mot lokal Postgres 16 med Supabase-emulering (port 54329): 52 av 52 bestått (brukt for REQ-0053 og REQ-0407).

## Resultat per krav

| Krav     | Resultat                                                              |
| -------- | --------------------------------------------------------------------- |
| REQ-0029 | Verifisert                                                            |
| REQ-0050 | Verifisert                                                            |
| REQ-0053 | Verifisert                                                            |
| REQ-0120 | **Avvik** (tidligere estimater lagres ikke)                           |
| REQ-0210 | Verifisert                                                            |
| REQ-0214 | Verifisert                                                            |
| REQ-0280 | **Avvik** (Lovable-bilde og AI-stemmer)                               |
| REQ-0318 | Verifisert                                                            |
| REQ-0326 | Verifisert                                                            |
| REQ-0327 | Verifisert                                                            |
| REQ-0407 | Verifisert                                                            |
| REQ-0418 | Verifisert                                                            |
| REQ-0486 | Verifisert                                                            |
| REQ-0489 | Verifisert (merknad om tilgjengelighet)                               |
| REQ-0491 | **Avvik** (samme som REQ-0280)                                        |
| REQ-0522 | Verifisert (merknad: avvist tekst må skrives på nytt)                 |
| REQ-0559 | Verifisert                                                            |
| REQ-0565 | Ikke verifisert – ekte kall gjenstår (alt annet bestått i simulering) |
| REQ-0578 | Verifisert                                                            |
| REQ-0583 | Verifisert (falsk mikrofon)                                           |
| REQ-0589 | Ikke verifisert – ekte kall gjenstår (DEC-0066)                       |
| REQ-0590 | Ikke verifisert – ekte nøkler gjenstår (DEC-0069)                     |
| REQ-0592 | Verifisert                                                            |
| REQ-0002 | Verifisert                                                            |
| REQ-0006 | Verifisert                                                            |
| REQ-0008 | Under arbeid                                                          |
| REQ-0010 | Under arbeid                                                          |
| REQ-0011 | Under arbeid                                                          |
| REQ-0022 | Under arbeid                                                          |
| REQ-0037 | Under arbeid                                                          |
| REQ-0121 | Under arbeid                                                          |
| REQ-0436 | Under arbeid                                                          |
| REQ-0452 | Verifisert                                                            |
| REQ-0506 | Verifisert                                                            |

## Del A – implementert, ikke verifisert

### REQ-0029 / REQ-0592 – ingen automatisk betalt generering

- **Sjekket:** at ingen kode starter en betalt generering uten en brukerhandling, og at det ikke er satt opp noen planlagt bakgrunnsjobb.
- **Hvordan:** (1) Syntakstreet for alle filer i `src/app`, `src/routes` og `src/components` (TypeScript-kompilatoren): de fem startfunksjonene (`generateImage`, `startVideoGeneration`, `generateSound`, `generateSpeech`, `writeImagePrompt`) kalles aldri fra `useEffect`, `useMemo`, spørringer, tidtakere eller modulnivå, og alltid med `approved: true` – med kontrollprøve. (2) Oppfølgingen i nettleseren (`useVideoPolling`) med jobber i kø, i arbeid, ferdige og feilet i tre minutter (falske tidtakere): bare køen sendes og status hentes; ingen start. (3) Ingen migrasjon eller oppsett har `cron.schedule`/`pg_cron`. (4) Nettleseren: ingen startfunksjon kalt i noen av de 58 kontrollene. I tillegg de eksisterende testene i `verifisering-ai.test.ts`.
- **Resultat:** uten avvik.

### REQ-0050 – originaltro manusvisning

- **Hvordan:** gylne tester mot referansemanuset: 106 sider med tittelsiden, over 2000 blokker begynner på samme side som originalen, alle 97 scenestarter riktige, 96 scenenumre. Nettleseren (`manus`): sidene er US Letter (51 × 66 em = 8,5 × 11 tommer), Courier Prime, 10 tegn per tomme (målt 5,99 em), enkel linjeavstand, innrykk 1,5" (scenehode/handling), 2,5" (replikk), 2,9" (parentes), 3,5" (karakter); linjene på hele linjer (`v4-20-manusside.png`).
- **Resultat:** uten avvik. Merk: de gylne testene hopper over seg selv når referansemanuset mangler (DEC-0004).

### REQ-0053 – originaldokumentet bevares uendret

- **Hvordan:** importdialogen (jsdom): bytene som lastes opp, er identiske med filen; registreringen får SHA-256 av de samme bytene. Feiler registreringen, vises varselet og «Prøv registreringen igjen» registrerer samme fil og kontrollsum uten ny opplasting; kom svaret ikke fram selv om registreringen lyktes, registreres den ikke to ganger. Sikkerhetskopien (nedlastingen) etter redigeringer: originalen ligger byte-identisk i zip-filen med samme kontrollsum. Databasetestene: originaldokumentet kan registreres av redaktør, ikke leser, og kan ikke endres.
- **Resultat:** uten avvik. Lagringsbøtta i Lovable Cloud er erstattet av en attrapp.

### REQ-0120 – historiske varighetsprognoser

- **Sjekket på nytt:** `src/core/screenplay/duration.ts:93` (`snapshotDuration`) regner estimatet ut fra versjonens tekst med dagens antakelser; ingenting lagres. **Avvik som før (DEC-0075).**

### REQ-0210 – direkte forhåndsvisning

- **Hvordan:** sceneeditoren, scene 1 (lag, kamera med bane, nøkkelbilder, dialog og musikk). Skriptet registrerer hver lydkilde Web Audio starter. Fra starten: begge lydklippene får felles starttid og riktig sted i filen (avvik 0 ms); bildet går 4 → 75 med 13 ulike lerretsbilder; bilde og lydklokke er i takt (største avvik 40–90 ms over 12 målinger, grense 200 ms). Ny start midt i scenen: klipp som har begynt, starter like langt inn i filen (avvik 0 ms). (`v4-08-sceneeditor-avspilling.png`)
- **Resultat:** uten avvik.

### REQ-0214 / REQ-0418 – hybrid montering og eksport

- **Hvordan:** monteringen med 2D-scene (1), importert film (7, klippet versjon 9 s), AI-video (8, 4 s) og stillbilde (9, 3 s). Monteringen viser rød film, grønn AI-video og blått stillbilde. Eksport av de fire scenene («Valgte scener», halv størrelse) gir én fil på 20,02 s (forventet 20,00 s); bildene fire ganger i sekundet: 2D → rød 9 s → grønn 4 s → blå 3 s; lyd i 2D-scenen (dialog og musikk), filmen (egen tone og vind) og AI-videoen. (`v4-18-montering-stillbilde.png`, `v4-19-eksport-valg.png`)
- **Resultat:** uten avvik.

### REQ-0280 / REQ-0491 – kostnadsanslaget

- **Hvordan:** jsdom og nettleser. Video for én scene (Google Veo), flere scener, «Oppdater med AI» (OpenAI Sora), bilde med OpenAI og lyd med ElevenLabs viser modell, innsatsnivå, oppløsning (når katalogen har den), antall, lengde (video/lyd), ekstrarunder og samlet anslag; ingenting sendes før «Ja …». Designsystemet i bekreftelsene: ingen tekst under 11 px, riktige fonter, tokenfarger, kontrast ≥ 4,5:1. (`v4-01` … `v4-05`)
- **Resultat: avvik.**
  1. **Bilde med innebygd Lovable AI (standardvalget):** bekreftelsen viser bare «Innebygd bildemodell (Lovable AI)», antall, ekstrarunder og anslag – ikke innsatsnivå, oppløsning eller modellnavn, selv om katalogen har dem (`src/core/generation/providers.ts:105–115`: GPT Image 2, «Balansert», 1024–1536 px) og innsatsvelgeren rett over viser «Balansert». Årsak: `chosenModel` er `null` for Lovable (`src/app/library/GenerateImagePanel.tsx:175–176`), så reservelinjene brukes (`:527–547`). Scenario: dobbeltklikk på et lag → «Generer …» (`v4-04a-kostnad-bilde-lovable.png`).
  2. **AI-stemmer («Dialog med AI-stemmer»):** bekreftelsen (`src/app/assembly/AiDialogueDialog.tsx:342–361`) har ikke kostnadsanslaget (`CostLines`): ingen modell, innsatsnivå, antall genereringer eller ekstrarunder – bare leverandør, tegn og samlet pris.
  - REQ-0491 («ingen betalt generering uten valgt/godkjent modell, kvalitetsnivå og estimat») har de samme to hullene.

### REQ-0318 – sammenligne versjoner

- **Hvordan:** monteringen, scene 7 → «Sammenlign versjoner …»: to versjoner side ved side (klippet versjon i bruk og importert film), alle versjonstyper i valgene; felles avspillingshode (begge 00:00:04:00), «Spill begge» flytter begge likt, «samme andel av lengden» gir egen tid per side; ingen kommando sendes. Designsystemet uten avvik. (`v4-06-sammenlign-versjoner.png`, `v4-07-sammenlign-andel.png`)
- **Resultat:** uten avvik. Merknader: «Laget: ukjent» i fixturen (ID-ene er ikke tidsbaserte); sammenligningen er uten lyd (sagt i dialogen).

### REQ-0326 / REQ-0327 – redaksjonell kontroll

- **Hvordan:** i grensesnittet (jsdom): usikker tolkning i inspektøren endres bare med «Tolkningen er riktig», og teksten er uendret; kontinuitetsforslag lagres først ved «Lagre hendelsen» (eller som avvist ved «Avvis»), manuset uendret; manusendringer mot materialet gjør ingenting før et valg. Sammen med `verifisering-redaksjonell-kontroll.test.ts` (analysene endrer ikke prosjektet) og REQ-0548-testene for ressursforslag.
- **Resultat:** uten avvik.

### REQ-0407 – arbeid bevares over tid

- **Hvordan:** prosjektet med data i alle åtte kategorier gjøres om til databaserader og leses tilbake med appens lagringsadapter i en ny økt uten lokal tilstand: hele tilstanden er lik (sceneoppbygging, historikk og manusversjoner, genereringsprompter, ressurser, lyd, jobbstatus, eksportinnstillinger, produksjoner og versjoner). Lokal lagring i nettleseren brukes bare til visningsvalg. Databasetestene (52/52) viser at endringene lagres og leses tilbake identisk via `apply_changes`.
- **Resultat:** uten avvik.

### REQ-0486 – godkjenne, oppdatere eller angre

- **Hvordan:** «Manuset er endret etter materialet» (jsdom): tre valg vises, ingenting skjer før valget; «Godkjenn» fjerner avviket uten å endre manus eller lag; «Oppdater i sceneeditoren» åpner sceneeditoren for scenen og avviket står til materialet er oppdatert; «Angre manusendringene» krever bekreftelse, setter linjene tilbake og avviket forsvinner. «Oppdater med AI» er verifisert i REQ-0309 og over.
- **Resultat:** uten avvik.

### REQ-0489 – modellagnostisk med synlige, redigerbare beskrivelser

- **Hvordan:** «Oppdater med AI»: beskrivelsen per segment kan endres før sending, og den endrede sendes (bare for det segmentet). «Generer scene»: samme lagrede beskrivelse sendt til Google Veo og OpenAI Sora (to adaptere), samme segment. Nettleseren: feltet kan redigeres i bekreftelsen.
- **Resultat:** uten avvik. **Merknad (tilgjengelighet):** i `src/app/assembly/AiUpdateSection.tsx:171–196` ligger knappen «Tilbake til forslaget» inne i samme `<label>` som tekstfeltet. Når beskrivelsen er endret, blir knappen etikettens kontroll: feltet mister navnet sitt, og knappen leses opp som «Beskrivelse for segment N» (påvist i jsdom).

### REQ-0522 – flere brukere på samme manus

- **Hvordan:** `useCommands` med serveren som svarer revisjonskonflikt: endringen godtas lokalt, så vises «Noen andre endret dette samtidig. Siste versjon er hentet – prøv igjen.», prosjektet lastes på nytt, endringen står ikke på angrelisten; revisjonene brukeren så, sendes med. En ny endring etterpå lagres. Kjernen og databasen er testet før.
- **Resultat:** kriteriet er oppfylt. **Merknad:** den avviste teksten beholdes ikke (`src/app/project/use-commands.ts:209–215` og `:229–237`); brukeren må skrive den på nytt.

### REQ-0559 – bildevalget for et lag

- **Hvordan:** nettleseren: dobbeltklikk i laglisten og på et lag i lerretet åpner «Bilde for «…»» for det laget (og velger det). jsdom: et annet bilde brukes med én gang (`UpdateLayers`), et opplastet bilde blir ny versjon og tas i bruk (`AddAssetVersion` → `UpdateLayers`), AI-generering sender ingenting før bekreftelse. (`v4-12`, `v4-13`)
- **Resultat:** uten avvik. Merk: dobbeltklikk på kamerabanen i lerretet bytter kurvet/rett bane (`Stage.tsx:1241–1256`) og åpner ikke bildevalget – med vilje.

### REQ-0565 / REQ-0589 / REQ-0590 – AI mot ekte tjenester

- **Hvordan (simulert gateway):** bare redaktører og eiere; bekreftelse kreves; grenser per bruker per time og prosjekt per døgn stopper før noe sendes; hver generering logges (modell, beskrivelse, forbilde, status, feil); bildet lagres som fil for en ny versjon; nøkkelen finnes aldri i svar eller logg; avslag (402) logges som feilet. «Skriv beskrivelsen med AI» sender tekst og bilder, logges som egen jobb og teller ikke i bildebudsjettet; bildemodellen får bildene i samme rekkefølge som beskrivelsen omtaler dem.
- **Resultat:** ikke verifisert. Et ekte kall i Lovable (REQ-0565, REQ-0589, DEC-0066) og ekte nøkler hos hver leverandør (REQ-0590, DEC-0069) gjenstår.

### REQ-0578 – naboscener

- **Hvordan:** sceneeditoren, scene 2 med «Naboscener»: stripen viser forrige (7), denne (2) og neste (3); hodet kan stå i forrige scene («Forrige scene · bare visning»); «Spill i sammenheng» går fra 7,2 s til 10,4 s inn i scenen; dyppet til svart før scene 2 vises; lydklippene (vind, filmens lyd, AI-videoens lyd) legges inn på riktig sted (avvik ≤ 40 ms, tidsvisningen har én desimal); lagvelgeren viser bare scenens eget lag («Tun»), og i scene 1 bare scenens seks. (`v4-09` … `v4-11`)
- **Resultat:** uten avvik.

### REQ-0583 – lydopptak

- **Hvordan:** falsk mikrofon i Chromium: opptaket startes og stoppes i sceneeditoren, lastes opp og lagres som lydressurs og lydklipp (`CreateAssets`, `CreateAssetVariant`, `AddAssetVersion`, `AddAudioClips`), lydprofilen åpnes, klippet vises i sporet og starter der hodet sto (2,2 s). I monteringen kuttes klippet til 0,5 s og utvides igjen uten ny opplasting. (`v4-14` … `v4-17`)
- **Resultat:** uten avvik. En ekte mikrofon er ikke prøvd.

## Del B – ikke startet / under arbeid

- **REQ-0002 – Verifisert:** hvert av de 15 punktene spores til gjeldende detaljkrav med fase 1–8, og fasene finnes i `ROADMAP.md` (test med kartet i `verifisering4-kjerne.test.ts`).
- **REQ-0006 – Verifisert:** byggeoppsettet er Lovables (`@lovable.dev/vite-tanstack-config` i `vite.config.ts`), Lovable Cloud (`supabase/config.toml`, generert klient) og migrasjonene i `db/migrations/`; `SESSION_HANDOVER.md` viser at migrasjonene er kjørt i Lovable.
- **REQ-0008 – Under arbeid:** Supabase-klienten brukes direkte i 12 filer i `src/app` (bl.a. `src/app/db.ts`, `script/ImportDialog.tsx`, `library/asset-images.ts`, `library/asset-audio.ts`, `project/use-project.ts`, `project/use-presence.ts`, `projects/backup.ts`, `assembly/film-import.ts`, `ai/last-frame.ts`, `auth/*`, `shell/AppHeader.tsx`), ikke bak et grensesnitt; avhengighetene er ikke dokumentert enkeltvis med begrunnelse (bare prinsippet i `ARCHITECTURE.md` §6).
- **REQ-0010 – Under arbeid:** `ARCHITECTURE.md` §3 (linje 63–77) sier hvor operasjonene kjører, men uten begrunnelse, og er utdatert: «Full filmeksport … Medietjeneste (FFmpeg)» – eksporten kjører i nettleseren (WebCodecs, verifisert over); «Renderingskø … vedvarende» – ingen bakgrunnsjobb (DEC-0072).
- **REQ-0011 – Under arbeid:** designsystemet og UX-prinsippene dekker profesjonelt, filmatisk, oversiktlig, effektivt, ikke-destruktivt, pålitelig og brukerstyrt, men ikke «elegant» og «modulært», og de ni kvalitetene brukes ikke som uttalte kriterier i gjennomgangene.
- **REQ-0022 – Under arbeid:** skillet finnes (materialet husker manuslinjenes revisjoner, adskilt fra plasseringen; testet), men 2D-scener og importert film lagrer ikke ressursversjonene de er laget fra (`src/core/model.ts:228`, `:551` – bare `blockRevisions`). AI-jobber har dem i sporet.
- **REQ-0037 – Under arbeid:** alle objekter i tilstanden og radene har en UUID som er nøkkelen og ikke endres (testet), men «filmmontering» (Assembly i `DOMAIN_MODEL.md:48`) og «eksportversjon» (`export_versions` i `DATA_RELATIONSHIPS.md:10, 49`) finnes ikke som egne objekter med ID.
- **REQ-0121 – Under arbeid:** karakterer, objekter/rekvisitter, dyr, lokasjoner, miljøer/bakgrunner og lyd kan opprettes og vises (testet); visuelle stilprofiler ligger på prosjektoversikten, ikke i biblioteket, og genererte ressurser og bilder er versjoner, ikke egne typer.
- **REQ-0436 – Under arbeid:** `ARCHITECTURE.md:47` har «Resource Library», men raden nevner ikke stilprofiler og mediefiler, og stilprofilene (`core/generation/style.ts`) står under Prompt Orchestration (`ARCHITECTURE.md:52`).
- **REQ-0452 – Verifisert:** første migrasjon har prosjekt, produksjon, scene, scenevariant, manusblokk, sceneforekomst, segment og versjon (take); ingen senere migrasjon (heller ikke fase 7) fjerner eller gjør om disse tabellene.
- **REQ-0506 – Verifisert:** kjernen importerer bare seg selv og bruker ingen plattform-API; den kjører i Node (kommandoer, film, bildeberegning) – sammen med `tests/architecture/core-purity.test.ts`.
