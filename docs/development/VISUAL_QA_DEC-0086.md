# Visuell kontroll – DEC-0086 (kontoer, adminside, personvern, kostnadsrapport)

Dato: 2026-10-15. Skript: `tests/visual/account-admin-ui.mjs` (mocker Supabase og serverfunksjonene; ingenting endres eller betales).
`ENV_FILE=…/.env node account-admin-ui.mjs http://127.0.0.1:8080 /tmp/claude-0/visual-fixture.json utmappe`.

## Kontroller (58 av 58 bestått)
- k01 Min konto: lenke fra brukernavnet og «Admin» i toppfeltet; profil, språk, passord, AI-forbruk (kroner, Runway-kreditter), personvern og «Slett kontoen min» (den faste administratoren kan ikke slettes). Eksport til Excel (gyldig regneark), PDF (gyldig) og Word.
- k02 Ny versjon av personvernerklæringen må leses (avkrysning) før man fortsetter; godkjenningen lagres.
- k03 Adminsiden: brukerne med laget, sist aktiv, status, prosjekter og forbruk; blokkering med begrunnelse sendes til serveren; den faste administratoren har ingen knapper; låst prosjekt får ny eier.
- k04 Uten innlogging: lenke «Personvern» på forsiden, avkrysning ved ny konto, erklæringen (selger aldri, GDPR, Datatilsynet, USA, API-nøkler, 30 dager, lagringssted).
- k05 Låst prosjekt viser bare meldingen med eierens navn og administrators e-post.
- k06 Prosjektoversikten: «AI-forbruk og kostnadsrapport», eieren ser prosjektet totalt per person.
- k07 Kontosiden på engelsk.
- k08 Språkvelgeren: bytte til engelsk og tilbake blir stående, og valget lagres på kontoen (feilen der kontoens språk satte tilbake valget).
- k09 Klikk på brukernavnet åpner «Min konto», nytt klikk lukker den; «Lukk» nederst går tilbake.

## Andre kontroller
- `tests/db/run-db-tests.ts` 61/61 (ny: 0033 – fast administrator, nettleseren kan ikke gjøre seg til admin, blokkert redaktør vs. blokkert eier, låseinformasjon bare for medlemmer, sletting med dato, språk og personvern).
- `tests/unit/account-admin.test.ts` (9) og `tests/unit/cost-report.test.ts` (5); `tests/unit/verifisering3-ai-server.test.ts` (3 nye for REQ-0649).
- Uendret grønne: scene-video-ui 39/39, verifisering3 73/73, verifisering4 58/58, interactions 44/44, export-e2e.
