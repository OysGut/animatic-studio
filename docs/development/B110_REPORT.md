# B-110 – CAPTCHA mot roboter (Cloudflare Turnstile)

## Valg av løsning
**Innloggingstjenestens innebygde CAPTCHA kan ikke slås på i Lovable Cloud.** Verktøyet for
innloggingsinnstillinger har ingen innstilling for CAPTCHA eller CAPTCHA-nøkkel. Derfor brukes reserveløsningen
fra oppdraget:

- **Registrering:** nettleseren sender Turnstile-tokenet til serverfunksjonen `requestSignupPass`. Den kontrollerer
  tokenet mot Cloudflare (`siteverify`, med IP fra `cf-connecting-ip` eller `x-forwarded-for`) og gir deretter
  e-postadressen et **registreringspass** (15 minutter, kan brukes én gang). Først da kaller nettleseren `signUp`.
  Passet må hentes før `signUp`, slik at bekreftelseslenken, lenkemålet og innloggingstjenestens
  hastighetsgrense per bruker virker som før.
- **Håndheving i databasen (migrasjon 0076):** triggeren fra B-109 krever passet når innloggingstjenesten lager en
  konto (`session_user = supabase_auth_admin`). Ellers stoppes kontoen med SQLSTATE `PTG02`. Direkte `signUp` eller
  `signInWithOtp` fra nettleseren uten bestått CAPTCHA kan altså ikke lage kontoer. Stengt registrering (B-109)
  gjelder fortsatt først; passet overstyrer den ikke.
- **Innloggingslenke** (`sendSignInLinkCaptcha`) og **«Glemt passord»** (`sendPasswordResetCaptcha`) sendes av
  serveren etter kontrollen. Lenkemålet godtas bare på samme opphav som forespørselen. «Glemt passord» gir samme
  svar uansett om kontoen finnes.
- **Innlogging med passord:** etter 3 feilede forsøk fra samme nettleser (teller i nettleserens lagring, nullstilles
  ved vellykket innlogging) går innloggingen via `signInWithPasswordCaptcha`. Den kontrollerer CAPTCHA og gir
  økten tilbake til nettleseren.

**Begrensning (står i TODO):** uten innebygd støtte kan ikke innloggingstjenesten selv kreve CAPTCHA. Den som kaller
den direkte, kan derfor fortsatt be om innloggingslenke og passordlenke **for eksisterende kontoer**, eller prøve
passord. Det begrenses av innloggingstjenestens egne hastighetsgrenser. **Nye kontoer** kan ikke lages uten
CAPTCHA, fordi det håndheves i databasen.

## Nøkler – dette må Øystein gjøre
1. I Cloudflare: **Turnstile → Add widget**. Velg modus **Managed** (anbefalt; som regel ingen oppgave for
   brukeren). Legg til disse vertsnavnene:
   - `pentoglass.lovable.app`
   - `pentoglass.com` og `www.pentoglass.com`
   - `pentoglass.no` og `www.pentoglass.no`
   - forhåndsvisningsdomenet `id-preview--27853fcb-6a27-4342-b359-72ab82e87cfa.lovable.app`
2. Cloudflare gir to nøkler: **Site Key** (offentlig) og **Secret Key** (hemmelig).
3. Legg begge inn i **Project Settings → Secrets** i Lovable-prosjektet:
   - `TURNSTILE_SITE_KEY` = nettstedsnøkkelen. Den er offentlig og sendes til nettleseren av `captchaConfig`, så den
     kan byttes uten ny bygging.
   - `TURNSTILE_SECRET_KEY` = den hemmelige nøkkelen. Den leses bare på serveren, inne i kallet. Den logges aldri og
     sendes aldri til nettleseren.
4. CAPTCHA er på først når **begge** nøklene finnes. Adminsiden viser «Robotkontroll (Cloudflare Turnstile) er på.»,
   eller et tydelig varsel når nøklene mangler.

**Uten nøkler** (utvikling og tester) er CAPTCHA av. Skjemaene virker som før, og serveren utsteder passet uten
kontroll, slik at registreringen virker etter migrasjon 0076.

## Grensesnitt
- `TurnstileBox` laster Cloudflares skript først når boksen trengs. Den følger språket i grensesnittet
  (`nb` eller `en`) og temaet (mørkt; lyst hvis `html.light`).
- Innlogging og registrering viser boksen der den trengs: registrering, innloggingslenke, «Glemt passord» og
  innlogging etter 3 feil. Ved innloggingslenke og «Glemt passord» vises boksen når man trykker, og handlingen
  fortsetter av seg selv når kontrollen er godkjent.
- Ved feil vises en rolig melding: «Vi fikk ikke bekreftet at du ikke er en robot. Prøv igjen.», med knappen
  «Prøv igjen». Når Cloudflare ikke svarer, vises «Robotkontrollen svarer ikke akkurat nå …».
- **Universell utforming:** Turnstiles egen boks (Managed) er tilgjengelig med tastatur og skjermleser. Ingenting
  fanger tastaturet, og knappene nås med Tab (testet).

## Personvern
Personvernerklæringen (nb og en, avsnitt 3) har nå et avsnitt om Cloudflare Turnstile. Det sier at Cloudflare er
tredjepart, at formålet er å hindre roboter og misbruk, at tekniske opplysninger om nettleser og forbindelse
behandles (blant annet IP-adresse og nettlesersignaler), at Turnstile ikke setter sporingscookies, at IP-adressen
sendes ved kontroll, og at grunnlaget er berettiget interesse (art. 6 nr. 1 bokstav f).

## Migrasjon 0076 (`db/migrations/0076_signup_captcha_pass.sql`, bare additiv, ikke kjørt)
- `public.signup_passes`: bare `service_role`, RLS på, ingen policyer.
- `public.issue_signup_pass(p_email)`: bare `service_role`.
- **Erstatter `private.guard_registration` (0075)**, kopiert ordrett. Eneste tillegg er passkravet for kontoer fra
  innloggingstjenesten. Triggeren er uendret.
- `schema_version` 76. `EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` er satt til 76. **0074, 0075 og 0076 må
  kjøres før neste publisering.** Rigg runde 5 får **0077**.
- **Rekkefølge ved utrulling:** serverkoden tåler at 0076 ikke er kjørt (manglende funksjon regnes som «pass ikke
  nødvendig»). Kjør 0076 etter eller samtidig med publiseringen, ikke før. Ellers stoppes registreringer fra den
  gamle appen, som ikke henter pass.

## Tester
- `npx tsgo --noEmit`: rent. i18n: 0 tekster uten engelsk; releasekontrollen bestått (8 nye tekster nb og en).
- Full Vitest: **2 179 bestått, 10 hoppet over, 0 feilet.**
  - Ny `tests/unit/b110-captcha.test.ts` (9 tester), med mocket Cloudflare-svar og Cloudflares hemmelige testnøkler:
    gyldig, ugyldig, token for et annet skjema, nettverksfeil, HTTP-feil, uventet svar, manglende eller for langt
    token, av uten nøkkel, nøkkelregel, IP-uttrekk og lenkemål bare på samme opphav.
  - `tests/unit/glemt-passord.test.ts` er tilpasset den nye veien via serveren. Regelen om samme svar uansett
    e-postadresse er beholdt, og det er lagt til en test for at bare CAPTCHA-feil meldes tilbake.
- DB (lokal Postgres): **152 bestått, 0 feilet.** Ny test for 0076:
  - uten pass stoppes kontoen (`PTG02`);
  - passet virker uavhengig av store og små bokstaver og mellomrom, og brukes én gang;
  - utløpt pass virker ikke;
  - bare serveren kan utstede pass, og ingen klient kan lese tabellen;
  - stengt registrering gjelder fortsatt, og passet beholdes da;
  - andre roller påvirkes ikke.
- Ny suite `tests/visual/captcha.mjs`: **46/46 nb og 46/46 med `UI_LANG=en`.** Turnstile-skriptet erstattes av en
  lokal etterligning av Cloudflares testnøkler: `1x00000000000000000000AA` godkjenner alltid,
  `2x00000000000000000000AB` avviser alltid. Ingen kall går til Cloudflare.
  - **Dekket:** registrering godkjent og avvist; at serveren avviser; innloggingslenke; «Glemt passord»; CAPTCHA
    etter 3 feil, og at telleren huskes og nullstilles; språk og tema; tastatur; drift uten nøkkel; varselet på
    adminsiden; personvern.
- Regresjon, én om gangen: registration-closed 31/31 nb og en; account-locale 28/28 nb og en.

## Avvik
1. **Migrasjon 0076**, selv om ingen migrasjon var ventet. Den trengs for at direkte `signUp` fra nettleseren ikke
   skal kunne lage kontoer, slik oppdraget krever. Den kombinerer med triggeren fra B-109, som foreslått.
2. **Testmocker:** `registration-closed.mjs` og `account-locale.mjs` mocker nå de nye serverfunksjonene, fordi
   innloggingslenke og registrering går via serveren. Forventningene i testene er uendret.
3. `signUp`, `sendSignInLink` og `sendPasswordReset` er flyttet fra `src/adapters/browser/auth.ts` til
   `src/adapters/browser/captcha-auth.ts`. Da har appen ingen vei utenom CAPTCHA, og moduler som bare trenger
   økten, drar ikke inn serverfunksjonene.

## Åpne spørsmål
- Skal vi be Lovable om innebygd CAPTCHA i innloggingstjenesten? Da kan også lenker og passordforsøk for
  eksisterende kontoer kreve CAPTCHA direkte i tjenesten.
