# Hastekontroll: språkvelgeren – 22.10.2026

## Resultat
Feilen med bare norsk og engelsk lot seg ikke gjenskape. Ingen endring er gjort i språkvelgeren, språkmanifestet, funksjonsbryteren eller databasen; en årsak er derfor ikke fastslått, og rapporten hevder ikke at feilen er rettet.

- `https://pentoglass.com/` returnerte HTTP 200 og viste alle ti vanlige språk: nb, en, fr, es, ru, ja, pt-BR, de, it og ko. Ingen nettleserfeil.
- Lokal forhåndsvisning viste de samme ti synlige valgene. Skjermbildene bekrefter dette.
- Det faktiske JavaScript-artefaktet fra publisert side inneholder språkmanifestet med de øvrige språkene og testspråkmarkøren. Ingen gammel tokatalogsvariant ble funnet i den undersøkte publiserte økten.
- `availableLanguages` begrenser bare ufullstendige språk og testspråk. Alle ti ordinære språk er komplette. `ui.test_languages` kan derfor ikke filtrere dem bort i nåværende kode. Nettleserspråk velger gjeldende språk, ikke hvilke knapper som tilbys.
- Toppstripen og kontosiden ble kontrollert med en simulert innlogget konto der funksjonsbryterkallet returnerte null. Begge viste alle ti språk. Valg av tysk ble lagret og lest tilbake etter omlasting i denne simulerte flyten. Ingen nettleserfeil.

## Regresjonsvern og tester
- Ny `tests/unit/b107-language-switch.test.tsx`: 7 tester. Krever konkret de ti godkjente språkene og alle ordinære manifestoppføringer, både med testspråk av/på, før og etter funksjonsbryterlesing, med utlogget/innlogget økt og ved feil i funksjonsbrytertjenesten. Begge varianter av LanguageSwitch kontrolleres.
- `tests/visual/b107-languages.mjs` er utvidet til å kreve alle ordinære manifest-språk og synlighet på innloggingssiden, i toppstripen og på kontosiden.
- Målrettet Vitest: 15 bestått, 0 feilet.
- Full Vitest: 2380 bestått, 0 feilet, 10 eksisterende hoppet over (292 filer bestått, 2 hoppet over).
- i18n-sjekk: 0 tekster uten engelsk. Releasekontroll bestått. Ingen brukervendt tekst eller oversettelser endret.
- Siste tilgjengelige byggsignal: `build OK`.
- Nettleserkontrollene ble kjørt med Python/Playwright. Den endrede JavaScript-suiten ble ikke kjørt som egen suite fordi JavaScript-pakken Playwright ikke er tilgjengelig; ingen pakker ble installert.

## Begrensninger og neste kontroll
Den eksterne forhåndsvisningsadressen sendte kontrollen til innlogging for redigeringsverktøyet; lokal forhåndsvisning ble kontrollert i stedet. En ekte innlogget testøkt kunne ikke opprettes automatisk for den forespørrende brukeren. Ekte innlogget publisert toppstripe og kontoside er derfor **ikke verifisert**; simulert kontroll er ikke en erstatning for det.

Hvis problemet fortsatt vises hos Øystein, trengs den konkrete adressen og et skjermbilde fra økten som viser bare to språk, samt innlogging i forhåndsvisningen for ekte kontokontroll. Gammel nettleserøkt/cache er en mulig forklaring, ikke en bekreftet årsak. Ingen publisering er utført.

## Endrede filer
- `tests/unit/b107-language-switch.test.tsx`
- `tests/visual/b107-languages.mjs`
- `roadmap.md`
- `docs/development/B107_LANGUAGE_SWITCH_REPORT.md`