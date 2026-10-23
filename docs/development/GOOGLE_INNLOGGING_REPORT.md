# Innlogging og registrering med Google – rapport (23.10.2026)

Ikke publisert. Migrasjon 0092 er skrevet og testet lokalt; **Claude kjører den i Cloud**. Før 0092 er kjørt, vil en
ny Google-bruker bli stoppet av passkravet fra 0076 (se punkt 3). Eksisterende brukere kan logge inn med Google
allerede nå, fordi kontoen deres finnes.

## 1. Hva som er slått på, og hva Øystein må gjøre

- **Google er slått på** som innloggingsmetode i Lovable Cloud med Lovables administrerte Google-nøkkel
  (Cloud → Users → Auth settings → Sign In Methods → Google). Det er gjort fra denne økten; Øystein trenger ikke slå
  noe på. Ingen nøkler ligger i koden.
- **Er Lovables administrerte nøkkel nok for pentoglass.com?** Ja, den virker på eget domene. Innloggingen går
  gjennom Lovables OAuth-tjeneste, som også betjener egne domener. Forskjellen er bare det brukeren ser i Googles
  samtykkevindu: der står Lovables appnavn og domene, ikke «From Pen to Glass». Vil Øystein ha eget navn og logo i
  Google-vinduet, trengs en egen Google Cloud OAuth-klient:
  1. Google Cloud Console → OAuth consent screen: appnavn «From Pen to Glass», logo, autoriserte domener
     `pentoglass.com` (og `lovable.app`), omfang `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
  2. Credentials → Create credentials → OAuth Client ID → Web application. Under «Authorized redirect URIs» legges
     callback-adressen som vises i Cloud → Users → Auth settings → Google.
  3. Lim inn klient-ID og hemmelighet i samme Google-innstilling i Cloud. Ikke i chat og ikke i repoet.
  Dette er valgfritt og kan gjøres når som helst uten kodeendring.
- **Omdirigeringsadresser:** kontrollert. Tillatte adresser er blant annet `https://pentoglass.com/**`,
  `https://www.pentoglass.com/**`, `https://pentoglass.lovable.app/**` og forhåndsvisningsadressene. Appen bruker
  alltid nettstedets egen rot (`window.location.origin`) som `redirect_uri`, så det virker likt i
  forhåndsvisning, på lovable.app og på pentoglass.com. Site URL står i dag til `https://pentoglass.lovable.app`; den
  brukes bare når en lenke ikke oppgir adresse og påvirker ikke Google-flyten. Øystein kan sette den til
  `https://pentoglass.com` i Cloud → Users → Auth settings → Advanced hvis e-postlenker skal lande der.

## 2. Innloggingsboksen

Bare én ting er nytt: under de eksisterende feltene og lenkene står en skillelinje med «eller» og knappen
«Fortsett med Google». Knappen følger Googles stilregler for mørkt tema: original «G»-logo i fire farger, fyll
#131314, kant #8E918F, tekst #E3E3E3, 40 px høy og logo til venstre. Fargene er egne tokens i stilarket
(`--google-*`), fordi Googles regler krever nøyaktig disse fargene. Ingenting annet i boksen, globusen eller
layouten er endret. Visuell kontroll på nb og en: bildene ble tatt med Playwright (`/tmp/browser/google/form-*.png`).
De viser at bare skillelinjen og knappen er nye. Teksten på knappen er «Fortsett med Google» / «Continue with Google».

## 3. Samme regler som for e-post

- **Stengt registrering (B-109):** gjelder uendret. Databasevakten på `auth.users` stopper en ny Google-konto når
  registreringen er stengt, med samme unntak for åpne invitasjoner til prosjekt eller arbeidsgruppe. Ingen konto og
  ingen profil opprettes. Innloggingstjenesten sender brukeren tilbake med «Database error saving new user». Appen
  viser da den samme rolige meldingen som ved e-postregistrering (eller administratorens egen melding), på alle
  språk. Eksisterende brukere påvirkes ikke, fordi vakten bare gjelder nye kontoer.
- **Registreringspass (0076) og Turnstile (B-110):** passet er bundet til e-postadressen og utstedes etter Turnstile
  i nettleseren. Ved Google kjenner appen ikke adressen før Google har svart, så et pass kan ikke utstedes på
  forhånd. Uten endring ville alle nye Google-brukere blitt stoppet. **Valg (0092):** en ny konto der
  innloggingstjenesten oppgir `provider = google` og e-posten er bekreftet, slipper passkravet. Begrunnelse:
  - Formålet med B-110 er å stoppe skriptede massekontoer via det åpne registrerings-API-et.
  - En Google-konto kan bare lages med et gyldig id-token fra Google for en ekte Google-konto.
  - Google har sin egen robotkontroll.
  - Google-kontoer uten bekreftet e-post og alle andre veier krever fortsatt pass.
  - Turnstile vises derfor ikke i Google-flyten.
  - **Dette avviker fra ordlyden «uten gyldig pass opprettes ingen konto» og bør bekreftes av Øystein.** Det
    strengeste alternativet er å stoppe alle nye Google-kontoer når pass kreves. Da kan Google bare brukes av
    eksisterende kontoer og inviterte. Det er en endring på én linje i 0092.
- **Personvernerklæringen:** en ny Google-bruker har ingen godkjenning i `privacy_acceptances`. Første innlogging
  viser derfor samme personverndialog som i dag, og appen kan ikke brukes før den er godtatt. Landet (B-097) spørres
  om i det vanlige landsteget. Begge deler er testet.
- **Visningsnavn:** første gang hentes navnet fra Google-kontoen (`full_name`/`name`) inn i profilen. Det skjer bare
  når profilen fortsatt har standardnavnet fra e-postadressen. Navnet kan endres på Konto-siden, og et eget navn
  overskrives aldri.
- **E-posten** regnes som bekreftet: Google oppgir bekreftet adresse, og 0092 krever det.
- **Profilbilde:** profilen har ikke noe bildefelt, og ingenting fra Google lagres der. Innloggingstjenesten legger
  likevel `avatar_url`/`picture` i brukerens metadata. 0092 fjerner disse feltene ved oppretting og ved hver senere
  oppdatering, så ingen bilde-URL fra Google lagres.
- **Samme adresse som en e-postkonto:** Lovable Cloud kobler automatisk en Google-identitet til en eksisterende konto
  med samme e-postadresse, når Google har bekreftet adressen. Det blir én konto med begge metoder, og passordet
  virker fortsatt.
  - Risikoen er at noen oppretter en passordkonto med en annen persons adresse uten å bekrefte den, og venter på at
    eieren logger inn med Google.
  - Vern i 0092: når Google kobles til en konto med *ubekreftet* e-post, fjernes passordet som ble satt før
    bekreftelsen. Eieren av Google-kontoen beholder tilgangen og kan sette nytt passord på Konto-siden.
  - En bekreftet konto beholder passordet.
  - Den omvendte veien er ikke en risiko: den som kontrollerer en Google-konto med adressen, kontrollerer adressen.
  - Begrensning: vernet er testet mot den lokale databaseemuleringen, ikke mot innloggingstjenestens egne
    oppdateringer i Cloud. Claude bør prøve det én gang i Cloud med en testadresse.

## 4. Tilbake til siden brukeren kom fra

Før Google åpnes, lagres siden brukeren står på for økten (sti og søk, for eksempel
`/invitasjon?token=…&type=gruppe`, `/k/…`, `/m/…` eller en prosjektside). Etter innlogging åpnes den én gang. Bare
stier på samme nettsted godtas, aldri fullstendige adresser eller «//…». I forhåndsvisningen fullføres innloggingen
i et lite vindu, og brukeren blir stående på samme side.

## 5. Konto-siden

Under e-posten står nå «Innlogging» med «Google», «E-post og passord» eller begge.

## 6. Tester og kontroller

- `tests/unit/google-sign-in.test.tsx` (13, falsk auth-klient): ny bruker ved åpen registrering, stengt
  registrering, eksisterende bruker ved stengt registrering, tolking av feil, retur fra invitasjon (prosjekt og
  gruppe), QR- og mobilsider og prosjekt, avvisning av fremmede adresser, navn fra Google, innloggingsmetoder, og
  personvernsteget med navn ved første innlogging.
- `tests/db/run-db-tests.ts` (0092): Google uten pass ved åpen registrering, Google uten bekreftet e-post og vanlig
  e-post krever pass, stengt registrering stopper Google uten å lage konto, profilbilde fjernes ved oppretting og
  oppdatering, ubekreftet konto mister passordet ved kobling, og bekreftet konto beholder det. Testdatabasens
  `auth.users` har fått kolonnene som finnes i ekte Supabase.
- Visuell kontroll av innloggingsboksen på nb og en (se punkt 2).

## 7. 0092 – funksjoner

- Erstatter `private.guard_registration` (siste definisjon i 0076, kopiert ordrett). Den er endret på tre punkter:
  - Google med bekreftet e-post slipper passkravet.
  - Bilde-URL fjernes fra metadata.
  - Stengt registrering gjelder for alle.
- Oppretter `private.guard_identity_update` og triggeren `guard_identity_update` (BEFORE UPDATE på `auth.users`).
  Den fjerner bilde-URL og vernet mot overtakelse.
- `schema_version` = 92, og `EXPECTED_SCHEMA_VERSION` = 92. `apply_changes`, `delete_project` og `purge_*` er
  uendret. Ingen data slettes.

## Nye tekster (maskinoversatt for fr, es, ru, ja, pt-BR, de, it, ko)

`google.sign-in.button`, `google.sign-in.or`, `google.sign-in.failed`, `google.account.methods`,
`google.account.method-google`, `google.account.method-email`.

## Resultat

tsc 0. Full Vitest: 2770 bestått, 0 feilet, 10 hoppet over som før. DB-tester: 183 bestått, 0 feilet, med 0092. Språksjekken (i18n) er grønn. Ingen betalte kall, ingen publisering og ingen kjøring av migrasjoner i Cloud.
