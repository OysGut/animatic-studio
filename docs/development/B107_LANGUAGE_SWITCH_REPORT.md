# Hastekontroll: språkvelgeren – 22.10.2026

## Presisering og årsak – oppfølging kl. 09:49 UTC
Den første kontrollen nedenfor gjaldt bare synlige språkvalg og bekreftet ikke oversatt tekst. Etter Øysteins presisering er den faktiske feilen gjenskapt på publisert side: FR og JA velges og `<html lang>` endres riktig, men innloggingsknappene står fortsatt på engelsk, også etter omlasting. Ingen fransk eller japansk katalog ble forespurt. Lokal utviklingsvisning lastet katalogene og viste oversettelsene.

Årsaken ligger i oppstarten av katalogadapteren: routeren importerte en modul bare for dens sideeffekt (`installCatalogLoader`). Prosjektet erklærer `sideEffects: false`, slik at produksjonsoptimalisering kan fjerne denne registreringen. Undersøkte publiserte JavaScript-filer inneholdt manifestet, men ikke katalogimportkartet. Uten registrert adapter returnerer `loadUiCatalog` uten å laste; språket velges likevel, og oversetteren bruker engelsk reserve. Det er ikke testspråkbryteren eller profilspråket som endrer valget tilbake til engelsk.

## Retting og ny verifisering
- Adapteren eksporterer nå `initializeUiCatalogLoader()`, som kalles eksplisitt i routerens oppstart (klient og SSR) og før språkvalg fullføres. Ingen pakker, katalogtekster eller databaseinnstillinger endret.
- Fire nye regresjonstester krever faktisk «Changer de langue» og «言語を変更» etter valg og gjenoppretting av lokalt eller simulert kontovalg; ikke bare knapper eller språk-ID.
- Nettlesersuiten krever «Se connecter» / «ログイン» på innloggingssiden etter valg og omlasting, oversatt SSR-beskrivelse og fransk/japansk tekst i simulert innlogget konto etter lagring og omlasting. Innloggingsskjemaet er klientstyrt og SSR viser derfor en venteskjerm; SSR-kontrollen bruker den reelle sidebeskrivelsen.
- `b107-languages.mjs`: **116 bestått, 0 feilet**. Kjørt med den eksisterende Playwright-pakken som følger Python-installasjonen, via en midlertidig pakkelenke; ingen pakker installert.
- Målrettet Vitest: **19 bestått**. Full Vitest etter regenerert referanseoversikt: **2384 bestått, 0 feilet, 10 eksisterende hoppet over**.
- i18n-sjekk og releasekontroll grønne. Siste byggsignal: **build OK**.
- Oversettelsenes genererte referanse-/kandidatoversikt og inventarrapport er oppdatert etter endrede importlinjer; ingen oversettelser er omskrevet.

**Ikke publisert.** Rettet produksjonsartefakt er derfor ikke kontrollert på offentlig side ennå; den publiserte siden har fortsatt den gjenskapte feilen. Ekte innlogget konto kunne ikke åpnes automatisk i denne økten; innlogget regresjon bruker simulerte kontosvar. Ingen DB-endringer eller migrasjoner.

## Første kontroll (før presiseringen, historisk)
Feilen med bare norsk og engelsk lot seg ikke gjenskape. Denne kontrollen gjaldt språkknappene, ikke katalogene.

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

Dette var begrensningen ved første kontroll. Presiseringen ovenfor erstatter den tidligere cache-hypotesen; feilen med engelsk reservetekst er nå gjenskapt.

## Endrede filer
- `src/adapters/i18n/catalog-loader.ts`
- `src/router.tsx`
- `src/app/i18n/language.tsx`
- `tests/unit/b107-languages.test.ts`
- `tests/unit/b107-language-switch.test.tsx`
- `tests/visual/b107-languages.mjs`
- `scripts/i18n/references.v1.json`
- `scripts/i18n/candidates.v1.json`
- `scripts/i18n/inventory-report.json`
- `AGENTS.md`
- `roadmap.md`
- `docs/development/B107_LANGUAGE_SWITCH_REPORT.md`