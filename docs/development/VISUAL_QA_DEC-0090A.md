# Visuell kontroll – DEC-0090, fase 2 bolk A (mobilbro, bilder og video, deling)

Dato: 2026-10-16. Skript: `tests/visual/dec0090-mobile-ui.mjs` (mocker Supabase, lagringen og serverfunksjonene; Chromium med falskt kamera).

## Kontroller (35 av 35 bestått)
- m01 Prosjektsiden: «Importer fra mobil» → QR-koden vises med en gang; én økt per kontekst (gjenbrukes når vinduet åpnes igjen); status for mobilen.
- m02 Maja i biblioteket: kameraikonet øverst; «Bilder av Maja»; «Mobilen er tilkoblet»; tre filer mottatt (også fra delt lenke); «Lagt inn som ny versjon». Kameraikon også ved «ny ressurs».
- m03 Sceneeditoren: egen kode for scenen («Scene 1 · …»).
- m04 «Mobilimport» i biblioteket: alle filer, filter for type, bidragsyter (delt lenke) og kobling; aktive lenker med «Tilbakekall».
- m05 Mobilsiden (390 × 844): «Bilder av Maja», store knapper, ingenting av resten av appen; to bilder valgt → lastet rett til lagringen og bekreftet; PDF avvist på telefonen; hurtigfoto: tre bilder tatt med utløseren og sendt automatisk; «Del lenke» lager egen delt lenke som kan kopieres.
- m06 Utløpt lenke: tydelig melding.
- m07 Mobilsiden på engelsk.

## Andre kontroller
- `tests/db/run-db-tests.ts` 63/63 (ny: 0035 – registrering innenfor økt og tak, ingen duplikater, feil filtype, utløp, sti i annet prosjekt, delt lenke stoppes når hovedøkten tilbakekalles, lesing bare for medlemmer, ingen direkte skriving, behandling bare for redaktører og én gang, utkast knyttes, skjuling; sletting av prosjekt tar med mobilimporten).
- `tests/unit/mobile-import.test.ts` (9) og `tests/unit/mobile-server.test.ts` (6): filtyper og grenser, innholdssjekk, kontekster, stier, køen (ingen dobbel opplasting, ny prøving), serverfunksjonene (bare redaktører, token som hash, kontekst i prosjektet, signert lenke, feil innhold slettes, delt lenke kan ikke deles videre).
- Vitest: 143 filer, 1228 tester grønne. Uendret grønne: verifisering3 73/73, verifisering4 58/58, interactions 44/44, image-tools-ui 48/48, dec0089 26/26, dec0088 26/26, scene-panels-ui 39/39, account-admin-ui 58/58, ai-admin-ui 46/46, scene-video-ui 39/39.
- Skjermbilder sett av Claude: QR-vinduet for Maja med mottatte filer, mobilsiden, hurtigfoto, delt lenke, mobilimporten i biblioteket.
- **Ikke prøvd:** ekte iPhone og Android (KI-235).
