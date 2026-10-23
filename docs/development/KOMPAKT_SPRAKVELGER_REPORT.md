# Kompakt språkvelger i toppmenyen

## Hva er endret
- Ny `CompactLanguageSwitch` i `src/app/i18n/language.tsx`, brukt i toppmenyen (`AppHeader`). Lukket viser den bare gjeldende kode («NB») som en liten knapp i samme stil som resten av menyen.
- Klikk, Enter eller mellomrom folder ut alle koder på stedet (ingen nedtrekksliste, ingen flytende meny) som `role="radiogroup"` med `role="radio"`/`aria-checked`. Fullt språknavn står i `title` og `aria-label`. Gjeldende språk er markert.
- Piltaster (og Home/End) flytter mellom kodene, Enter/mellomrom velger, Esc lukker og gir fokus tilbake til koden. Klikk utenfor lukker.
- Fokus flyttes bare når det allerede er i velgeren (tastatur). Et åpent felt et annet sted mister derfor ikke fokus ved et programmatisk bytte (ML2-kravet om at utkastet overlever).
- en-XA vises bare når `ui.test_languages` (eller lokal utviklerinnstilling) er på – samme liste som før (`availableLanguages`).
- Er det ikke plass, bryter toppmenyen til en ekstra rad (`min-h-10 flex-wrap`), så kodene og resten av knappene holder seg innenfor menyen.
- Valget går gjennom den eksisterende `chooseLanguage`. Språklasting, eksplisitt initialisering (regel 50) og brukerisolasjon er ikke rørt. Innloggingssiden og prosjektoversikten bruker fortsatt den gamle `LanguageSwitch`.
- Ingen nye tekster: bruker de eksisterende nøklene for «Språk», «Bytt språk» og testspråk-merket.

## Skjermbilder
Ligger i Filer under `kompakt-sprakvelger/`: `nb-lukket.png`, `nb-aapen.png`, `nb-smal.png`, `en-lukket.png`, `en-aapen.png`, `en-smal.png` (smal = 760 px, der menyen bryter til ny rad).

## Tester
- Ny `tests/unit/compact-language-switch.test.tsx` (jsdom, 3): åpning/lukking (klikk utenfor, Esc med fokus tilbake), tastatur (Enter, mellomrom, piler), valget lagres i `animatic:lang` som før og velgeren lukkes.
- `tests/visual/ml2-languages.mjs` er tilpasset den nye velgeren (åpner koden før bytte, leser `aria-label`/`title` fra koden): 323 bestått, 0 feilet, to kjøringer på rad. `tests/visual/b107-languages.mjs`: 146 bestått, 0 feilet (innloggingssiden, uendret).
- tsc 0, full Vitest grønn, i18n grønn. Ingen migrasjon, ingen betalte kall, ikke publisert.
