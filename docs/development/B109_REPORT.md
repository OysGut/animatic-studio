# B-109 – stenge for nye registreringer

## Resultat
Administratoren kan stenge tjenesten for nye kontoer på adminsiden. Eksisterende brukere logger inn som før.
Stengingen håndheves i databasen, ikke bare i grensesnittet.

## Migrasjon 0075 (`db/migrations/0075_registration_closed.sql`, bare additiv, ikke kjørt)
- Ny enradstabell `public.service_settings`: `registration_open boolean not null default true`, valgfri melding
  (høyst 500 tegn), `changed_at` og `changed_by`. Det fantes ingen tabell for tjenesteinnstillinger fra før
  (`app_status` er bakgrunnsjobbens status). RLS er på og ingen policyer finnes; `anon` og `authenticated` har
  ingen tabellrettigheter; `service_role` har alle.
- `public.set_registration_open(p_open, p_message)`: bare for administrator (`private.is_admin`, ellers 42501).
  Meldingen trimmes, og tom melding blir null. **Det finnes ingen admin-logg i skjemaet**, så endringen loggføres
  i raden (når og hvem).
- `public.registration_status()`: kan kjøres av `anon` og `authenticated` og gir bare `{open, message}`.
  Meldingen tas bare med når registreringen er stengt.
- `public.admin_registration_settings()`: bare for administrator. Gir status, melding, tidspunkt og
  **visningsnavnet** til den som endret (ingen e-post og ingen bruker-ID).
- `private.guard_registration()` med `BEFORE INSERT`-trigger `guard_registration` på `auth.users`. Når
  registreringen er stengt, stoppes alle nye kontoer med SQLSTATE **`PTG01`** (`registration_closed`). Det gjelder
  passord, innloggingslenke/OTP og innlogging med andre leverandører, fordi alle lager kontoen med en INSERT.
  Unntaket er en e-post med en åpen invitasjon til prosjekt eller arbeidsgruppe, det vil si ikke akseptert, ikke
  trukket tilbake og ikke utløpt. Sammenligningen ser bort fra store og små bokstaver og mellomrom.
  Triggeren gjelder bare INSERT, så innlogging, tilbakestilling av passord og innloggingslenke for eksisterende
  kontoer påvirkes ikke.
- **Erstatter ingen funksjoner.** `apply_changes`, `delete_project` og `purge_*` er uendret.
- `schema_version` 75. `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er satt til 75, så **appen venter
  0074 og 0075 før neste publisering**. Rigg runde 5 får 0076.

## Innloggingssiden (`AuthScreen`)
- Statusen hentes fra `registration_status`. Når registreringen er stengt, skjules «Opprett konto» og
  registreringsskjemaet (land og personvern). En rolig melding vises: standardteksten «Tjenesten tar ikke imot nye
  brukere akkurat nå.» eller administratorens egen tekst.
- `sendSignInLink` sender `shouldCreateUser: false` når registreringen er stengt.
- Feilen fra triggeren («Database error saving new user») og svaret «Signups not allowed» blir den samme rolige
  meldingen, aldri en databasefeil.
- Før migrasjonen eller ved feil regnes registreringen som åpen. Databasen håndhever stengingen uansett.

## Adminsiden
Ny boks «Nye registreringer» (`src/app/admin/RegistrationAdmin.tsx`) har bryteren «Åpen / Stengt» med
bekreftelsesdialog, et valgfritt meldingsfelt («Lagre meldingen» når registreringen er stengt) og linjen
«Sist endret … av …».

## Tester
- `npx tsgo --noEmit`: rent. i18n: 0 tekster uten engelsk, releasekontrollen bestått (21 nye tekster, nb og en).
- Full Vitest: 2 169 bestått, 10 hoppet over, 0 feilet.
- DB (lokal Postgres): **151 bestått, 0 feilet.** Ny test for 0075:
  - stengt gir ingen ny bruker (også uten e-post);
  - invitert e-post slipper inn, både til prosjekt og arbeidsgruppe, også med andre store og små bokstaver og
    mellomrom;
  - utløpt eller trukket invitasjon slipper ikke inn;
  - eksisterende bruker påvirkes ikke;
  - bare administrator kan endre og lese detaljer;
  - anon ser bare `open` og `message`;
  - ingen kan lese eller skrive tabellen direkte;
  - for lang melding avvises;
  - nye kontoer går igjen når registreringen åpnes.
- Ny suite `tests/visual/registration-closed.mjs`: 31/31 på nb og 31/31 med `UI_LANG=en`. Den dekker standard og
  egen melding, at «Opprett konto» og skjemaet er skjult, innloggingslenke med `shouldCreateUser: false` og rolig
  melding, at eksisterende innlogging virker, åpen status, invitasjonsunntaket, rolig melding ved feil fra
  databasen, og adminbryteren med bekreftelse, avbryt, melding, hvem/når og åpning igjen.
- Regresjon, én om gangen: account-admin-ui 58/58 nb og 58/58 en; account-locale 28/28 nb og 28/28 en.

## Avvik
1. **Unntak i sikkerhetstesten 0058.** Testen krever at ingen security definer-funksjon kan kjøres av `anon`.
   Oppdraget krever at `registration_status` kan leses av anon, så den står nå som eneste unntak i testen.
   Funksjonen gir bare `{open, message}`.
2. **Invitasjonslenker:** `/invitasjon` viser fortsatt «Opprett konto» når registreringen er stengt. Ellers kunne
   ikke inviterte kolleger lage konto, slik oppdraget krever. Databasen avgjør: bare e-poster med åpen invitasjon
   slipper gjennom.
3. **Ingen admin-logg** finnes; endringen loggføres med tidspunkt og hvem i innstillingsraden.

## Åpne spørsmål
- Med `shouldCreateUser: false` sier innloggingstjenesten fra når adressen ikke har konto. Vi viser da den rolige
  meldingen om stengt registrering. Det røper at adressen ikke har konto, men bare mens registreringen er stengt.
  Holder det, eller skal svaret være likt uansett («Hvis adressen har en konto, er lenken sendt»)?
