# SB-2 – Storyboardgalleri og navigasjon (rapport)

Status: bygget og testet lokalt. Ikke publisert. Migrasjon `0103` ikke kjørt i Cloud.

## Teknisk gjeld fra G-7: tabellrekkefølgen i `apply_changes` (0103)
- Ny registertabell `private.apply_change_tables(table_name, insert_order, delete_order)`, fylt med de 55 tabellene i nøyaktig samme rekkefølge som 0102 (innsetting/oppdatering og sletting er to ulike rekkefølger, derfor to kolonner).
- `apply_changes` leser begge rekkefølgene fra registeret. Kjernen endres ikke lenger når nye tabeller kommer; en ny tabell får én rad i registeret (regel lagt i `docs/agents/APPLY_CHANGES.md`).
- Ellers lik oppførsel. DB-tester: to nye (rekkefølgen er identisk med 0102, og en registrert tabell håndteres uten endring i kjernen). Eldre tester som leste rekkefølgen ut av funksjonsteksten, leser den nå fra registeret. Hele DB-suiten: **226 bestått, 0 feilet**.
- `schema_version` 103 og `EXPECTED_SCHEMA_VERSION = 103`.

## Brukerflate
- Ny fane «Storyboard» mellom Manus og Scene, rute `prosjekt/$projectId/storyboard` (søkeparametre `scene`, `panel` validert). Vindu-ID tildelt i registeret.
- Galleriet viser filmen i fortellerrekkefølge for valgt produksjon (samme rekkefølge som manuset, `orderedOccurrences`), panelene gruppert per scene. Deaktiverte scener vises ikke. Miniatyrer bruker felles `Thumbnail` (contain).
- Kontroller: panelstørrelse (glidebryter) og zoom-knapper, vis/skjul scenenavn, scenenummer, dialog, manustekst, notater, timing og status; tekstvisning uten bilder; filter på status per fagområde og produksjon; vis skjulte; «Hopp til manus». Alt lagres per bruker via `useUiPref` (`storyboard-gallery`).
- Enkeltklikk velger. Dobbeltklikk eller Enter åpner sceneeditoren med produksjon, forekomst og `panel` i URL-en; sceneeditoren viser et merke for panelet med lenke tilbake (referansepanelet kommer i SB-5).
- Omorganisering: flytt paneler innen scenen (dra og slipp, og knapper/tastatur), flytt hele scener med tydelig merknad «endrer filmens scenerekkefølge» via den eksisterende `MoveOccurrence` (manus og montering følger). Legg til, dupliser, skjul, deaktiver og gjeninnfør. Flytt til annen scene via dialog med ny forankring (`SceneSelect`). Alt går via kommandoer og kan angres; ingenting slettes.
- Første åpning: forslag om ett tomt panel per scene (`planStoryboardSeed`), opprettes bare etter bekreftelse.
- Statusmerker per fagområde på kort og scene; status redigeres med `SetProductionStatus` (historikk fra SB-1).
- Tilgjengelighet: rutenett med `role="grid"`, piltaster/Home/End, fokus følger valget, aria-etiketter. Høyre-til-venstre: layouten følger `dir`, og piltastene speiles.
- Ytelse: galleriet virtualiseres (bare synlige rader tegnes).

## Feil funnet og rettet (SB-1)
Kjernens invariant «én 2D-scene per variant» og `compositionOfVariant` talte også storyboardpaneler. Et panel nummer to i en scene ble derfor avvist, og et panel kunne i verste fall blitt tatt for scenens 2D-scene. Rettet slik at bare `kind = 'scene'` teller, også i `CreateComposition`, retiming, video, materialoppdatering og avviksanalysen. Databasens unike indeks gjaldt allerede bare 2D-scener.

## Valg og begrunnelser
- Flytting av scener bruker eksisterende `MoveOccurrence`, så manus og montering følger uten egen logikk.
- Dupliser lager nytt panel rett etter originalen med samme forankring og felter; lagene kopieres ikke (ingen løsrevne kopier; laginnhold kommer i SB-3).
- Virtualisering per rad med faste høyder (scenehode + panelrader), regnet ut rent i `gallery-prefs.ts`, så 2 000 paneler tegner bare noen titalls kort.

## Tester
- `tests/unit/sb2-storyboard-gallery.test.tsx` (12, jsdom): fortellerrekkefølge og deaktiverte scener, filter og skjulte, dupliser med angre, piltaster med høyre-til-venstre, validering av valg, virtualisering; flaten: dobbeltklikk/Enter navigerer med forekomst og panel, scenerekkefølge endrer manusets rekkefølge og kan angres, vis/skjul/filter/tekstvisning huskes, forslag krever bekreftelse, deaktiver uten sletting, 2 000 paneler tegner under 300 kort.
- `tests/visual/sb2-storyboard-gallery.mjs` (nb og en): skrevet for Claude; ikke kjørt av meg.
- Typekontroll 0, i18n-sjekk grønn, DB 226/0. Full Vitest: 2879 bestått, 1 feilet (tekststørrelse 10 px i galleriet), rettet til 11 px; den testen og arkitekturtestene består etterpå. Full suite ikke kjørt på nytt etter rettingen.

## Oversettelser
90 nye `sb2.*`-nøkler. nb og en skrevet; fr, es, ru, ja, pt-BR, de, it og ko maskinoversatt og merket for gjennomlesing.
