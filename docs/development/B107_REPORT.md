# B-107 / B-111 – fortløpende rapport

## Utgangspunkt
Arbeidet bygger på dagens sammenslåtte main, uten gjenoppretting. Cloud har skjemaversjon 76.
`.overforing/repo.tgz` og `.overforing/` er fjernet, og mappen er lagt i `.gitignore`.

## Runde 1 – kartlegging og importverktøy
Registeret blir `manifest.json`, med én oppføring per språk; lokale filer lastes separat.
Import kontrollerer filer, nøkler, CLDR-former og plassholdere. Utdatert engelsk kilde rapporteres og brukes ikke.
Kildehash og review følger hver oversettelse. Eksport kan lage tilleggsfil eller maskinoversatte nøkler til gjennomlesing.

## Migrasjonsbehov
Live-kontroll av profilbegrensningene bekrefter `profiles_locale_check` med bare nb/en.
0077 må derfor utvide begrensningen og `set_my_locale`; Claude kjører den. Rigg runde 5 får 0078.

## Tester
Ikke kjørt ennå. Ingen migrasjon er kjørt og ingen app er publisert i dette oppdraget.