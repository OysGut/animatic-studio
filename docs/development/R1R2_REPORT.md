# R1 og R2 – ProRes i «Endelig» og opprydding av foreldreløse AI-filer (migrasjon 0067)

Dato: 21.10.2026. Én samlet migrasjon: `db/migrations/0067_prores_cleanup.sql` (skjemaversjon 67).
Ikke kjørt i Cloud; Claude kjører den.

## 1. Hva som er bygget

### R1 – «Endelig» foreslår ProRes
- Nye prosjekter: `create_project` lager «Endelig» med `export: { format: "prores" }` (uten bitrate, som ikke
  gjelder ProRes). «Utkast» og «Gjennomgang» er uendret. `defaultQualityProfiles()` speiler dette, så
  «Legg til standardprofilene» gir det samme.
- Eksisterende prosjekter endres aldri stille. På prosjektsiden vises et tilbud: «Bruk ProRes som standard i
  Endelig-profilen?», med «Bruk ProRes» og «Ikke nå». Godtar brukeren, sendes `UpdateQualityProfile` via
  `apply_changes` (angrbar, gjør om virker). Bare eksportformatet endres; bitraten tas ut, alt annet beholdes.
- Tilbudet gjelder bare en profil som heter «Endelig» og fortsatt har MP4 (standardoppsettet fra før R1).
  Har brukeren valgt noe annet, eller gitt profilen et annet navn, vises ingen tilbud.
  Regel: `proresOfferProfile` og `proresSpecOf` i `src/core/generation/quality-profile.ts`.

### R2 – opprydding av foreldreløse AI-filer (valg C)
- Knapp for eieren i AI-delen på prosjektsiden: «Rydd opp i ubrukte AI-filer …».
- Forhåndsvisningen viser antall, samlet størrelse og miniatyrer (bilder får kortvarige signerte lenker;
  video og lyd vises med filtype). Ingenting slettes før brukeren trykker «Slett filene».
- Ved sletting regner serveren ut kandidatene på nytt og sletter bare filer som fortsatt er foreldreløse.
  Filer som er tatt i bruk i mellomtiden, beholdes og telles som «beholdt».
- Hver sletting logges i den nye tabellen `storage_cleanups` (hvem, når, antall, byte, beholdte og stiene).
- Regler (`src/core/generation/orphan-files.ts`, server i `src/adapters/storage/orphan-cleanup.server.ts`):
  - bare filer i prosjektets egen mappe for AI-genererte filer (`<prosjekt>/generated/`); aldri opplastede
    filer (`source/`), midlertidige filer (`temp/`), delte filmer (`shares/`), globale filer (`global/`)
    eller andre prosjekters filer;
  - ingen rad peker på filen. Alle prosjekttabeller leses med `select *`, og alle prosjektstier i verdiene
    (også inne i JSON og URL-er) teller: versjoner (også de i «Slettede objekter»), harmoniseringer, opptak,
    plakater, delte filmer, mobilimport, lydversjoner, eksporter og angrehistorikken (`change_log`, både
    kommando og invers). En referanse beskytter også resten av mappen (siste bilde, miniatyrer);
  - jobber og kvitteringer beholdes, men teller ikke som referanser (valg C). Finnes én jobb eller massejobb
    (også et enkelt element) som ikke er avsluttet, viser oppryddingen ingenting;
  - filen er eldre enn 24 timer.
- Serverfunksjonene sjekker at brukeren er eier med brukerens egen klient før admin-klienten lastes.
  Filene listes med lagrings-API-et; det er ingen SQL mot `storage.objects`.

### Innstrammingen av språkversjonssjekken
`apply_changes` sjekker nå:
- alle oversettelser, linjer og lenker som endres i kallet (ikke bare de som sender `language_version_id`);
- alle lenker som er endret i kallet, og alle lenker som peker på en oversettelse eller linje som er endret i
  kallet. En lenke som får nye mål uten å sende versjonen, og en linje som flyttes til en annen versjon mens
  en lenke peker på den, avvises nå med `22023`.
Eldre rader uten versjon blokkeres fortsatt ikke (samme regel som i 0066).

## 2. Erstattede funksjoner
| Funksjon | Grunnlag | Endring |
|---|---|---|
| `apply_changes` | 0066 (ordrett) | ny språkversjonssjekk (`v_lang_changed`, `v_link_scope`) |
| `create_project` | 0063 (ordrett) | «Endelig» får `{"format":"prores"}` |
| `purge_project_assets` | 0066 (ordrett) | sletter `storage_cleanups` før `change_log` og prosjektet |

Uendret: `delete_project` (0066, mykt slettet prosjekt; loggen slettes ved endelig sletting) og
`purge_removed_assets` (0065).

## 3. Tester
- Typekontroll (`tsc --noEmit`): ren.
- Full vitest: se svaret (antall).
- Nye enhetstester `tests/unit/r1r2-prores-cleanup.test.ts`: 11/11 (tilbud og angre/gjør om, regler for sti,
  alder og mapper, eierkontroll, angrehistorikk beskytter, jobber gjør det ikke, aktive jobber sperrer, ingen
  sletting uten bekreftelse, ny beregning ved sletting, logg).
- DB (lokal Postgres): 143/143. Ny test for 0067: ProRes i nye prosjekter, grants/RLS på `storage_cleanups`
  (anon ingen, klient bare lese, ingen skriving, medlem leser, ikke-medlem ser ingenting), sletting ved
  purge, og fire tilfeller for språkversjonssjekken (to av dem slapp gjennom i 0066).
  Postgres kjørte som uid 65534 med `nss_wrapper` og midlertidige passwd/group-filer i `/tmp`; ingen endringer
  i `/etc/passwd` eller `/etc/group`, og datamappen ble slettet.
- Ny visuell suite `tests/visual/r1r2-prores-cleanup.mjs`: nb 26/26, `UI_LANG=en` 26/26.
- Regresjon (nb / `UI_LANG=en`): p7 45/45 og 45/45, ml3-script-languages 38/38 og 19/19, ml4-e2e 48/48 og
  24/24, p6 18/18 og 14/15, m6-rest 74/74 og 59/61, p8 110/110 og 69/73. Feilene med `UI_LANG=en` i p6, m6-rest
  og p8 står på ML4-listen over avvik som feiler likt på eldre kode (knapper søkt med norsk navn).

## 4. Avvik
- DB-testen fra 0066 krevde skjemaversjon nøyaktig 66; den krever nå minst 66 (0067 øker versjonen).
- Oppryddingsfunksjonene ligger i `src/adapters/storage/`, ikke `src/adapters/ai/`: testen for REQ-0326
  tillater ikke at AI-koden skriver til andre tabeller enn jobb-, nøkkel- og grensetabellene.
- En jobb med status `lost` (serveren har gitt opp) regnes som feilet; ellers ville én tapt jobb sperre
  oppryddingen for alltid.
- Eldre AI-filer uten kategorimappe (fra før KI-178) ryddes ikke, fordi de ikke kan skilles fra opplastede filer.
- «Ikke nå» på ProRes-tilbudet skjuler det til siden lastes på nytt; valget lagres ikke.
