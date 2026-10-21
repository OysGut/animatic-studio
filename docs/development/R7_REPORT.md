# R7 – eldre visuelle suiter og `UI_LANG=en` (21.10.2026)

Ingen migrasjon. Ingen databasefunksjoner er erstattet. Ingen pakker er installert eller fjernet.

## Årsak og retting per suite

### Suiter som feilet

| Suite | Årsak | Retting |
|---|---|---|
| `asset-studio-ui` | Suiten byttet ut lydklippene i scenen, men lot fixturens lydversjoner (DV2) ligge igjen uten klipp. Kjernen stopper da med rette alle lydklippendringer («Replikken har lydversjoner som ikke kan fjernes»), så «Lagre demping i scenen» la ingenting i utkastet. | Testen tar bare med lydversjoner som har klippet sitt. Ingen feil i appen. Suiten følger nå også `UI_LANG`. |
| `dec0089-script-panel-ui` | Siden DV3 åpner et dobbeltklikk på en replikk lydredigeringen, ikke manusvinduet (`dialogueOwnerOf` → `onOpenDialogue`). Testen dobbeltklikket linje nr. 2, som er en replikk. Første kontroll ble også lest før panelet var tegnet. | Scenarioet velger første handlingslinje og venter på panelet. Fast skjemaversjon 34 er byttet til den felles konstanten. Navnene velges med `byLang`, og suiten følger `UI_LANG`. |
| `scene-duration-ui` (G, I, J, 13) | Samme foreldreløse lydversjoner som i `asset-studio-ui`. De fire stegene flytter lydklipp, så «Bruk» ble avvist og dialogen lukket seg aldri (tidsavbrudd). H og L flytter ikke lydklipp og besto. | Bare lydversjoner som har klipp, tas med. Rapport-, angre- og «Fra manus»-teksten godtar begge språk, og suiten følger `UI_LANG`. |
| `entity-analysis-ui` | **Feil i appen.** Ved 1280 px flytter verktøylinjen bibliotekets handlinger inn i «Mer …» (U2). Popoveren viste gruppen på én rad, så «Last opp endrede bilder», «Globalt bibliotek» og «Last ned som zip» havnet utenfor skjermen. I tillegg fant testen ikke forslagsknappen, og fast `networkidle` pluss 2,5 s var for kort under last. | En gruppe som er flyttet til «Mer …», brytes nå over flere rader (`ToolbarGroup` i `workspace-chrome.tsx`). «Mer …» har fått `data-testid="toolbar-more"`, og forslagsknappen `library-suggestions-open`. Den nye hjelperen `tests/visual/toolbar.mjs` (`revealInToolbar`) åpner «Mer …» ved behov. Testen venter på selve analysekallet, ikke på en fast pause. |
| `scene-video-ui` | «AI-video …» ligger i «Mer …» ved 1440 px. Suiten svarte i tillegg med skjemaversjon 32, så siden viste et oppdateringsvarsel. Feil i selve scenarioene ble ikke telt i `RESULTAT`. | `revealInToolbar` før hvert klikk og den felles skjemaversjonen. Scenariofeil telles nå som feil. |
| `storylab-canvas-ui` | Klokken startet før første lasting i en fersk nettleserkontekst. Den målte dermed mest Vite-utviklingsserverens kalde modullasting (20 s under last), ikke canvaset. | Siden lastes på nytt, og klokken starter når canvasflaten finnes. Den stopper når første node er tegnet. Grensen er nå 3 s, som i kravet; tidligere var den 3 + 1,5 s. Oppstartstiden logges bare. |
| `mts-global` | Besto 13/13 på nb og en. Tidsavbruddet kom fra last. | Ingen endring. Dekkes av den felles ventingen nedenfor. |
| `dv3-dialogue-editor` | Hos Claude kjøres suiten med `visual-fixture.json`, der klippet har to lydversjoner. I mitt miljø ble den kjørt med `mts-fixture.json`, der klippet har én versjon, så «preserved versions stacked» og trinnene etter feilet. | Suiten legger selv til en bevart alternativ versjon når klippet har bare én. Den gir nå samme resultat med begge fixturene: 48/48 på hver. |

### `UI_LANG=en`-støtte

| Suite | Årsak | Retting |
|---|---|---|
| `backlog-b2-ui` | `lang === "nb" ? … : …` fulgte scenarioets språk, ikke testspråket | `byLang(lang, …)` |
| `ca1-tab` | Avspillingsknappen ble sjekket mot «Stopp»/«Spill» | `byLang("nb", "Stopp", "Stop")` / `("Spill", "Play")` |
| `ca3-rig` | «Panorer bildet» var hardkodet | `byLang` → «Pan image» |
| `ca4-mouth-mask` | «Avbryt» og «Godkjent i utkast» var hardkodet | `byLang` → «Cancel» / «Approved in draft» |
| `ca7-global` | «1 annen scene» var hardkodet | `byLang` → «1 other scene» |
| `dv4-voice` | «Avbryt» fulgte scenarioets språk. «character default preselected» kunne aldri bestå fordi fixturens karakter manglet standardstemme. | `byLang`, og suiten setter standardstemmen i de mockede dataene, slik `p6` gjør |
| `m6-rest` | `nb = lang === "nb"` | `nb = uiLang(lang) === "nb"` |
| `mts-credits`, `mts-nondestructive` | Eksportknappen ble funnet med teksten «Eksporter». I AL var 2 s for kort til at lagene ble tegnet. | `data-testid="assembly-export-open"`, og testen venter på første lagrad |
| `mts-lower-thirds` | Malfeltene heter etter lagnavnene (brukerens språk): `navn,rolle` på norsk og `name,role` på engelsk. Y ble lest før laget var tegnet. | `byLang` på forventningen, og testen venter på laget |
| `p6-quality-profiles` | «Avbryt» fulgte scenarioets språk | `byLang` |
| `p8-style-harmonize` | «Harmoniser …» og «Ja, generer» fulgte scenarioets språk | `byLang` |

Felles: `mts-harness.mjs` venter nå på `scene-stage` (inntil 60 s) i stedet for bare en fast pause, og navigeringsgrensen er hevet til 90 s. Under last tok første lasting over 30 s.

## Avvik fra forrige runde

- **`realtime-channels`:** testen importerte adaptertreet dynamisk inne i testen, og importen alene tok 4,7 s. Nå er importen statisk, og kanalregisteret tømmes før hver test. Full vitest viste at den samme årsaken rammet flere filer: `account-admin`, `dv4-speech-server` og andre filer som laster moduler med `await import` i første test. Derfor er `testTimeout` og `hookTimeout` i `vitest.config.ts` satt til 30 s. Grensen gjelder bare kjøretid; ingen test venter på klokken. Full vitest var grønn to ganger på rad uten omkjøring.
- **`AGENTS.md`:** regel 13 er tilbake: «User quotas exclude these two service tasks; service quotas count only built-in service tasks.» Detaljene i regel 18, 19, 26 og 35 er flyttet til `docs/development/AGENTS_DETAILS.md` og merket †. Ingen regler er fjernet. Delen utenfor Lovable-blokken er 4 705 byte, altså 415 byte under grensen.
- **i18n-inventaret:** de to nye `data-testid`-attributtene flyttet linjenumrene i `references.v1.json`, og inventaret er generert på nytt. `catalog.gen.ts` er uendret, og ingen tekster er lagt til eller tapt.

## Resultat per suite

| Suite | nb | `UI_LANG=en` |
|---|---|---|
| asset-studio-ui | 57/57 | 57/57 |
| dec0089-script-panel-ui | 26/26 | 26/26 |
| scene-duration-ui | 55/55 | 55/55 |
| entity-analysis-ui | 8/8 | 8/8 |
| scene-video-ui | 39/39 | 39/39 |
| storylab-canvas-ui | 33/33 | 33/33 |
| mts-global | 13/13 | 13/13 |
| dv3-dialogue-editor | 48/48 | 48/48 |
| backlog-b2-ui | 14/14 | 14/14 |
| ca1-tab | 17/17 | 17/17 |
| ca3-rig | 20/20 | 20/20 |
| ca4-mouth-mask | 25/25 | 25/25 |
| ca7-global | 26/26 | 26/26 |
| dv4-voice | 24/24 | 24/24 |
| m6-rest | 74/74 | 74/74 |
| mts-credits | 17/17 | 17/17 |
| mts-lower-thirds | 16/16 | 16/16 |
| mts-nondestructive | 16/16 | 16/16 |
| p6-quality-profiles | 18/18 | 18/18 |
| p8-style-harmonize | 110/110 | 110/110 |

Alle 40 kjøringene gikk i tre parallelle løp, så suitene ble også prøvd under last.

- **Vitest:** 2 019 bestått og 10 hoppet over (251 filer). Grønn to ganger på rad.
- **DB (lokal Postgres):** 144/144.
- **`tsc --noEmit`:** rent.
- **Opprydding:** Postgres kjørte som uid 65534 via nss_wrapper, uten endringer i `/etc/passwd` eller `/etc/group` (kontrollsummene er uendret). `/tmp/pg` og Playwright-lenkene er fjernet.

## Avvik og merknader

1. `scene-video-ui`, `storylab-canvas-ui` og `mts-global` følger ikke `UI_LANG`. De har egne engelske scenarioer, og resten kjører på norsk i begge moduser. `scene-video-ui` sjekker over 40 norske tekster; å oversette dem lå utenfor oppdraget.
2. 22 andre suiter utenfor oppdraget har fortsatt en fast skjemaversjon i mocken (for eksempel `dec0090-mobile-ui`, `dec0093-audio-ui`, `storylab-ui` og `u2-chrome-ui`). Regel 13 sier at suitene skal dele én konstant. De bør rettes i en egen runde.
3. Feilen i «Mer …»-menyen kan også ha rammet andre verktøylinjer ved 1280 px. Rettingen er felles, men bare biblioteket og sceneeditoren er kontrollert visuelt.
4. Grensen i `storylab-canvas-ui` måler nå canvaset etter lasting, ikke oppstarten av utviklingsserveren. En måling av ferdig bygget app er ikke gjort.
