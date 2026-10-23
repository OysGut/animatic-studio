# Kildespråk = manusets språk (ML3)

## Hva er rettet (uten migrasjon)
- Ny felles regel i `src/core/dialogue/languages.ts`:
  - `sourceLanguageOf(state)` – manusets språk (`project.scriptLanguage`, ellers `primaryLanguage`).
  - `isSourceLanguage(state, tag)` – sant for manusets språk og for den interne nøkkelen `SOURCE_TEXT_KEY` ("nb").
  - `SOURCE_TEXT_KEY = "nb"` – intern nøkkel for «kildeteksten» i velgere og visninger. Betyr «kilden», ikke «norsk», og vises aldri som språknavn.
- Bruker regelen: `translatedState` og filmens tekstlinjer (`translation/index.ts`), PTG-dokumentet (`interchange/index.ts`), Dragonframe (`interchange/dragonframe.ts`), munnliste (`interchange/mouth-export.ts`), linjejustering (`translation/line-align-prompt.ts`, begge sjekkene), språkversjonsregelen (`languageVersionError`, ny kode `source`) og oversettelseskommandoen (`apply.ts`). Avvik (`driftDiff`) brukte allerede `scriptLanguageOf`.
- Dialogen «Språkversjoner»: «Manusets språk (<språknavn>) er alltid kilden. …» med faktisk språknavn.
- Språkvelgeren: kildevalget heter «<språknavn> – manus (kilde)», og manusets språk tilbys ikke som mål.
- Feilmelding når et mål er lik manusets språk: ny nøkkel `ml3-language-versions.error.source`.

## Hva som IKKE går uten migrasjon: norsk som målspråk
Databasen forbyr i dag nb/no som målspråk:
- `translations.language` – `language not in ('nb','no')` (0016/0066)
- `language_versions.language` – samme + `!~ '^(nb|no)-'`, og `source_language = 'nb'` (0066)
- `translation_lines` og `translation_line_links` – `language not in ('nb','no')` (0064)
- `projects.primary_language` og `script_blocks.language` – `check (… = 'nb')` (0001)

Derfor avviser kjernen fortsatt nb/no som mål, med en ærlig melding: «Norsk kan foreløpig ikke lagres som språkversjon.» (`error.norwegian`). For norske manus vises den gamle meldingen som før.

### Forslag til 0090 (ikke laget)
1. Erstatt de faste kontrollene med en regel «målspråk ≠ prosjektets manusspråk», helst i en trigger/sjekkfunksjon som leser `projects.script_language` (CHECK kan ikke lese andre tabeller).
2. `language_versions.source_language`: tillat vilkårlig BCP-47, sett lik `script_language` ved oppretting.
3. `primary_language`/`script_blocks.language`: la stå som intern nøkkel (ingen dataendring), eller gjør om til «source». Ingen omskriving av eksisterende rader er nødvendig.
4. Klientsiden: fjern `isNorwegianSourceTag`-sperren i `languageVersionError`, `translationFieldsOf`, line-align-prompt og de to serverfunksjonene (`line-align.functions.ts`, `translation-align.functions.ts`), og bytt `SOURCE_TEXT_KEY` til en nøytral verdi (f.eks. "source") så den ikke kolliderer med et ekte norsk mål.

Berørte data i Cloud: bare kontrollreglene på de fem tabellene; eksisterende rader er gyldige også etter endringen. Risiko: lav for data; middels for logikk – mens «nb» er intern kildenøkkel, vil et ekte norsk mål kollidere med den. Punkt 4 må derfor gjøres i samme endring som 0090.

## INV-05
INV-05 («norsk er hovedmanus», `PRIMARY_LANGUAGE`, `invariants.ts` sjekker `block.language === "nb"`) må omformuleres til «manusets språk er kilden; kildeteksten endres aldri automatisk av språkversjoner». Den er ikke endret nå; `nb` på blokkene er bare lagringsnøkkelen. Endres sammen med 0090.

## Tester
- `tests/unit/kildesprak.test.tsx` (6): engelsk manus – engelsk er kilde (visning, avvik, språkversjon, oversettelse, linjejustering), tysk mål virker, norsk mål stoppes av lagringsgrensen og ikke som «kilde»; norsk manus som før; velger og dialog viser «English (en)».
- tsc 0, Vitest 2574 bestått / 10 hoppet over, i18n grønn, DB-tester 181 bestått (lokal Postgres). Ingen migrasjon, ingen betalte kall, ikke publisert.

## Oversettelser
Nye/endrede nøkler: `ml3-language-versions.dialog.description`, `.error.source`, `.error.norwegian`, `.select.source`. nb og en skrevet selv; de, es, fr, it, ja, ko, pt-BR og ru maskinoversatt og merket for gjennomlesing.
