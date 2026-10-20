# ML4 – ende-til-ende (B-049, PLAN_B049_MULTILANG.md §5)

Dato: 20.10.2026. Ingen migrasjon i ML4. Ingen betalte kall i testene: AI og TTS er mocket.

## 1. Hva som er bygget

### Eksport med N språkversjoner og fontkontroll
- `src/core/screenplay/export-fonts.ts`: `scriptExportFontCheck(tekster, format)` sjekker tegnene mot fonten
  før filen lages.
  - **PDF** (Courier, WinAnsi): tegn utenfor tegnsettet, som kyrillisk og «č ć đ Č Đ» i latinsk serbisk,
    ble tidligere skrevet som «?» uten varsel. Nå stoppes PDF-eksporten med en melding som viser tegnene
    og foreslår Word eller Fountain.
  - **Word** (Courier New: latin, også utvidet latin, gresk og kyrillisk): tegn utenfor fonten gir en advarsel,
    ikke stopp. Teksten beholdes, og Word viser den med en annen font.
  - **Fountain** er ren UTF-8, og alle tegn beholdes.
- Word-filen får språkmerket til språkversjonen (`w:lang`, for eksempel `sr-Latn`). Før stod det alltid `nb-NO`.
- Eksportdialogen viser fontkontrollen. Kravet fra ML3 står fortsatt: ufullstendig oversettelse eksporteres
  bare med norsk reserve eller stoppes, og brukeren må velge.

### Releasekontroll av språkdekningen
- `scripts/i18n/release-check.mjs` sjekker at nb og en har de samme nøklene, ikke-tom tekst, de samme navngitte
  plassholderne og flertallsformer på begge språk. en-XA rapporteres, men er ikke et krav.
- **Bygget stopper** når dekningen ikke er 100 %. Kontrollen ligger som byggetillegg i `vite.config.ts` (`apply: "build"`).
- Nøkler fra ML1-grunnlinjen som er avløst av authored.json (141 stykker), telles ikke, for de lastes aldri.
  En bevisst tom tekst (tom på begge språk) regnes som komplett.
- Rapport: `docs/development/i18n-coverage.json`: 10 140 nøkler; nb 100 %, en 100 %, en-XA 100 % (generert).
  Kjøres med `node scripts/i18n/release-check.mjs --write`.

### Sikkerhetskopi før og etter 0066
- Sikkerhetskopiformatet var allerede klart for ML3. Testene i `tests/unit/ml4-backup-languages.test.ts` viser at:
  - **etter 0066:** tre språkversjoner, oversettelser, importerte linjer og koblinger (også 1:n og n:1)
    gjenopprettes med nye ID-er, og alle referanser er koblet om. Lydvalgene (`*`, språk, talespråk og
    `none`) og norsk kilde er uendret.
  - **før 0066:** en kopi uten `language_versions` og uten `language_version_id` leses inn uten tap.
    Alle ID-er får en ny ID, ingenting fylles inn i ettertid, og språkene avledes fra radene, så alle tre
    vises i manuset.
  - en kopi fra en nyere database avvises fortsatt.

### DV6, B-048 og B-050 med N språkversjoner
- `tests/unit/ml4-ai-languages.test.ts` kjører serverfunksjonene med mocket AI for de, pt-BR og sr-Latn:
  - **B-050:** overslaget kaller aldri AI, og et bekreftet kall krever samme fingeravtrykk.
  - Prompten har bare valgt språk og scene. Forslag med et annet språk eller fra en annen scene forkastes.
  - Norsk og ikke-kanoniske koder (`sr-latn`, `en-us`) avvises, og en leser får nei. Ingen av delene gir AI-kall.
  - **B-048:** målspråket står i prompten, og bare prosjektets kandidatscener sendes.
- DV6 (uavhengige UI-, manus- og talespråk) dekkes av `dv5-dv6.test.ts` og `dv6-languages.mjs`. Begge er grønne på nb og med `UI_LANG=en`.

### Ny visuell suite `tests/visual/ml4-e2e.mjs`
Hele løpet, på nb og en:
1. opprett prosjekt;
2. legg til tre språkversjoner (koden kanoniseres til de, pt-BR og sr-Latn);
3. endre norsk kilde: «må gjennomgås» vises for alle tre språkene, og ingen oversettelse overskrives;
4. koble linjer manuelt: koblingen får riktig språk, scene og språkversjon;
5. eksporter:
   - ufullstendig tysk krever valg, og Fountain med norsk reserve lages;
   - PDF stoppes for latinsk serbisk og viser tegnene som mangler;
   - Word går;
6. ta sikkerhetskopi (zip fra appen);
7. gjenopprett: kopien sendes med alle tre språkversjonene, koblingen og alle oversettelsene, med ID-er.

Den mockede backenden lagrer kommandoene i radene, med revisjon for tekstendringen, så kopien inneholder det som ble gjort i økten.

## 2. Avvik fra ML3 som er rettet
1. **AI-servertesten** (`verifisering4-ai-server`): serverkoden lastes én gang i `beforeAll` med egen grense på 60 s.
   Da måler testene bare oppførselen, ikke importtiden. Full vitest er grønn uten omkjøring (to kjøringer).
2. **ml2-languages med `UI_LANG=en`:** `uiLang("en-XA")` overstyrer nå alltid `UI_LANG`, så en-XA-kontrollene
   gjelder pseudospråket. Resultatet er 318/318 både på nb og med `UI_LANG=en`.
3. **`pgtest`:** ikke lenger i `/etc/passwd` eller `/etc/group`. DB-testene kjøres med et midlertidig skript i
   `/tmp/pg/run-db.sh`:
   - en midlertidig bruker legges inn;
   - en `trap` setter `/etc/passwd` og `/etc/group` tilbake, stopper Postgres og sletter datamappen, også ved feil.

   Etter kjøringen er ingenting igjen i `/etc`.

## 3. Andre rettelser i samme runde
- **Manusets verktøylinje** (ML3-feil):
  - Etter at et målspråk var valgt, ble hele gruppen med produksjons- og språkvelger flyttet til «Mer …».
  - Med norsk valgt viste verktøylinjen «Mer …» allerede ved 1280 px (`u2-chrome-ui` feilet).
  - Rettet slik: import og fjerning av oversettelse ligger i en egen gruppe som går i «Mer …» først, og
    knappen for språkversjoner er en ikonknapp.
  - `u2-chrome-ui` er igjen 25/25.
- **Knappenavnet «Språkversjoner …»** inneholdt ordet «Versjoner». Det ga to treff i `verifisering3-ui`
  (en knapp med navnet «Versjoner» fantes allerede). Ny tekst: «Språk i manuset …» / «Script languages …»
  (egen ML3-nøkkel, ikke i grunnlinjen). `verifisering3-ui` er igjen 73/73.
- Faste `data-testid` på sikkerhetskopi og gjenoppretting (`project-menu`, `project-menu-backup`, `backup-download`,
  `backup-link`, `restore-backup-open`, `restore-name`, `restore-run`, `restore-done`), og `script-export-open`.

## 4. Testtall

| Test | Resultat |
|---|---|
| Full vitest | 1 988 bestått, 10 hoppet over, 0 feilet (248 filer); kjørt to ganger, grønn begge ganger |
| Nye ML4-tester | sikkerhetskopi 8/8, eksport 6/6, AI med N språk 5/5, releasekontroll 5/5 |
| DB (lokal Postgres via `/tmp/pg/run-db.sh`) | 142/142 |
| i18n | check.mjs 0 tekster uten engelsk; releasekontrollen bestått (nb 100 %, en 100 %) |
| `ml4-e2e.mjs` | nb + en 48/48; `UI_LANG=en` 24/24 |
| `ml3-script-languages.mjs` | nb + en 38/38 |
| `ml2-languages.mjs` | nb 318/318; `UI_LANG=en` 318/318 |

### Alle visuelle suiter (71) på nb og med `UI_LANG=en`

Alle suitene er kjørt i begge moduser. Kjørte en suite mens forhåndsvisningsserveren ble startet på nytt, ble den kjørt
på nytt alene. Suiter som feilet, ble også kjørt mot koden fra ML2f (versjonen rett før ML3) på en egen port,
med samme testdata og samme språkmodus. Alle de gjenværende avvikene feiler **likt på ML2f-koden**. De kommer altså
ikke fra ML3 eller ML4.

**Grønne i begge moduser:** de øvrige suitene, blant annet t2, dv1, dv2, dv5, dv6, dv7, dv8, p4, p5, p7, u2, u5,
ca2, ca5, ca6, ca8, mts-engine, mts-textscene, mts-title, ml2, ml3, ml4, storylab-, script-explorer-, image-tools-,
library-suggestions-, account-admin-, global-continuity, global-film-share, global-library,
global-new-project, verifisering3, interactions-e2e, dec0088/0090/0093/0094/0095/0096, funn-0079/0080,
i18n-en-pass og export-e2e.

**Feiler likt på ML2f-koden (nb og en):**

| Suite | Resultat |
|---|---|
| ai-admin-ui | 44/46 (forventer teksten «Lovable AI (innebygd)», som ble fjernet etter regelen om at «Lovable» ikke skal stå i grensesnittet) |
| asset-studio-ui | 56/57 |
| dec0089-script-panel-ui | 17/20 |
| dv3-dialogue-editor | nb 18/22, en 16/20 |
| entity-analysis-ui | 3/4 |
| scene-duration-ui | 41/45 |
| storylab-canvas-ui | 32/33 |
| scene-video-ui | 3/4 |
| translation-ai-align-ui | 0/2 |
| verifisering4-ui | 51/54 (mikrofon og fontmål, kjent fra før) |
| mts-global og screens | stopper med tidsavbrudd, også på ML2f |

**Bare med `UI_LANG=en`, likt på ML2f:** disse suitene finner fortsatt knapper med norsk tekst, og har ikke fått
språkstøtte ennå:

| Suite | Resultat med `UI_LANG=en` |
|---|---|
| backlog-b2-ui | 7/8 |
| ca1-tab | 15/17 |
| ca3-rig | 11/12 |
| ca4-mouth-mask | 20/22 |
| ca7-global | 25/26 |
| dv4-voice | 20/21 |
| m6-rest | 59/61 |
| mts-credits | 14/15 |
| mts-lower-thirds | 15/16 |
| mts-nondestructive | 13/14 |
| p6-quality-profiles | 14/15 |
| p8-style-harmonize | 69/73 |

## 5. Avvik og merknader
- **Eldre suiter:** de gjenværende avvikene er ikke rettet, fordi de ligger utenfor oppdraget.
  Neste runde kan gi de nevnte suitene `byLang`/`data-testid` og rette de eldre feilene. Det trengs et oppdrag for det.
- **«Importer engelsk manus …»:** knappen heter dette også når et annet målspråk er valgt. Teksten ligger i den frosne
  ML1-grunnlinjen. Å bytte den til en språknøytral tekst krever en ny nøkkel, og det er utenfor oppdraget.
- **Fontdekning:** PDF bruker fortsatt standardfonten Courier uten innebygd font. Å bygge inn en Unicode-font (for
  kyrillisk i PDF) er ikke gjort. Det er et produktvalg (fontfil og lisens). Til da stopper kontrollen eksporten i stedet
  for å skrive «?».
- **Byggekontrollen** kjører ved `vite build`. Jeg har ikke kjørt bygget selv. Kontrollen og reglene er testet i vitest.
- **Midlertidige hjelpemidler, alle utenfor repoet:**
  - en kopi av ML2f-koden i `/tmp/old`, med en egen utviklingsserver på port 8090 (stoppet);
  - Postgres i `/tmp/pg` (ryddet automatisk);
  - en Playwright-lenke i `node_modules` (fjernet).

  Ingen pakker er installert.
