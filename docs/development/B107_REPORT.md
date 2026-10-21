# B-107 / B-111 – sluttrapport 21.10.2026

## Resultat
Bygget videre på sammenslått main, uten gjenoppretting eller tilbakestilling.
`.overforing/repo.tgz` og mappen er fjernet; `.overforing/` er ignorert.

Alle ordinære grensesnittspråk har 100 % oppdatert dekning: nb, en, fr, es, ru, ja,
pt-BR, de, it og ko. Releasekontrollen viser 0 problemer; en-XA er fortsatt testspråk.
Øysteins aktuelle oversettelser er bevart. Utdaterte og nye tekster er oversatt på nytt;
256 aktive oppføringer per nytt språk har `review: "machine"` og må gjerne gjennomleses.
Tallet omfatter både tidligere nyoversettelser og tilleggsnøkler i oppdraget; det er ikke
en påstand om at alle var utdaterte. SHA-256-vakten finner ingen aktive utdaterte nøkler.

## Språkregister, lasting og formatering
- `manifest.json` er registeret; én katalogfil og én registeroppføring legger til et språk.
- Grensesnittets åpne UiLang holdes adskilt fra manus-/datakontrakten Lang (nb/en).
- nb/en er innebygd; øvrige kataloger lastes enkeltvis gjennom en Vite-adapter.
  Kjernen bruker ingen Vite-, React-, nettleser- eller databaseløsninger.
- Reserve er engelsk, med én utviklingsadvarsel per manglende nøkkel/språk.
- Intl.PluralRules velger CLDR-kategorier; språkets formateringslocale brukes for tall,
  datoer, sortering og relativ tid. Land styrer fortsatt bare dato/klokke.
- Bare komplette språk vises normalt. `animatic:incomplete-languages=1` åpner ufullstendige
  språk for utviklerkontroll; en-XA følger den eksisterende testspråkinnstillingen.
- UI-grener er flyttet til katalog/Intl; gamle nb/en-grener for manus, data og eldre lagrede
  tekster er beholdt. Språkord-plassholdere har fått hele setninger med naturlig grammatikk.
- Serverfeilkodenes lukkede nøkkelkart er med i runtime-katalogen. Mobilvisninger og
  sikkerhetskopiens LES-MEG.txt bruker samme katalog. Ingen app-genererte e-postmaler ble
  funnet i repoet; innloggingstjenestens eksterne e-postmaler er ikke endret.

## B-111 – prioritet og første side
Engelsk er standard. Kontoens profiles.locale vinner over eksplisitt lokalt valg,
som vinner over nettleserens språk og engelsk reserve. Automatisk gjenkjenning lagrer
aldri et nytt kontovalg. Eksisterende lokale valg og manusspråk er ikke omskrevet.

Serveren bruker preferansekapsel og Accept-Language, uten IP-oppslag. Routeren leser
serverens html-lang og laster samme katalog før hydrering; ingen delt global serverlocale.
Kontopreferansen vinner når kontoen er hentet i nettleseren. **Avgrensning:** med dagens
nettleserbaserte innlogging kan serveren ikke lese profiles.locale ved første besøk på
en helt ny enhet; første serverside bruker da Accept-Language, og kontovalget overtar
etter innlogging/kontolesing. På tidligere besøkte enheter representerer kapselen det
sist anvendte valget. Dette er ikke verifisert som profilbasert SSR på en ny enhet.

Språkvelgere finnes på innlogging og offentlige sider. Valg lastes asynkront med en
revisjonsvakt, slik at et tregt tidligere valg ikke overskriver et senere valg.
Feilgrensen kan laste sin valgte katalog også når vanlig sideoppstart feiler.

## Import, eksport og etterslepsvakt
`node scripts/i18n/import-locale.mjs <kode> <mappe>` kontrollerer JSON, delnummer,
duplikater, kjente nøkler, plassholdere og alle gyldige CLDR-former.
Ugyldige eller utdaterte deler skriver aldri over språkkatalogen; prosessen feiler og
rapporten oppgir fil/nøkkel. Tidligere aktuelle katalogoppføringer bevares ved tilleggsimport.

`node scripts/i18n/export-new.mjs <kode>` eksporterer bare aktive manglende/utdaterte
nøkler med nb/en/oversatt og sourceHash. `--machine` eksporterer maskinmerkede tekster
til gjennomlesing. Ny eksport inkluderer SHA av tekst, flertallskontrakt og formater;
endret metadata med uendrede engelske ord kan dermed ikke stemples som fersk ved import.
Eldre leveranser uten SHA godtas med kontroll av engelsk tekst; hele metadatahistorikken
kan ikke gjenopprettes fra det gamle formatet. Etter import håndheves full SHA-vakt.

AGENTS.md og CLAUDE.md krever alle registrerte språk i samme tekstendring.
Inventory/build-catalog er regenerert; katalogbyggerens eksisterende tom-filvakt består.

## Migrasjon og publisering – Claude
0077 er additiv fra 0076 og erstatter bare `public.set_my_locale(text)`.
Den utvider profiles.locale-begrensningen til språkmerker, beholder eksisterende verdier
og rettigheter, og avviser anonym skriving, ugyldige merker og testspråk i RPC-en.
SHA-256: `54d17a126868cfcd83e42887eedc5f9995b98bba1b5235f6738a893343c1ff1d`.

**Cloud-migrasjonen er ikke kjørt, og appen er ikke publisert av Lovable.** App og
visual-fixtures forventer nå skjemaversjon 77. Claude må kjøre 0077 og publisere denne
versjonen sammen; den eksisterende publiserte appen og Cloud 76 er ikke endret her.
Rigg runde 5 får neste ledige migrasjonsnummer etter 0077.

## Verifikasjon
- Full Vitest: **2195 bestått, 10 eksisterende hoppet over, 0 feilet**; 271 beståtte filer.
- Lokale DB-tester: **153 bestått, 0 feilet**. Ingen tester kjørt mot produksjonsdata.
- Inventory, build-catalog, check, validate og releasekontroll: bestått; alle språk 100 %.
- Automatisk forhåndsvisningsbygg: **build OK**. Ingen separat manuell typekontroll kjørt;
  plattformen kjører bygg/typekontroll automatisk.
- Ny b107-languages.mjs: **26/26**. nb/fr/ja/ukjent kode på server og klient,
  eksplisitt valg etter reload, profil fr over lokalt nb/nettleser ja, eksplisitt de lagres
  og leses tilbake etter reload. Mocket konto, ingen ekte AI eller betalte kall.
- account-locale.mjs: **28/28 nb og 28/28 en**, kjørt sekvensielt.
- account-admin-ui.mjs: **58/58**, inkludert engelsk/norsk bytte og lagring.
- Mobil 390×844: fransk oppstart, koreansk valg, ingen horisontal overflyt.
  Tysk kontoside og mobilvelger inspisert fra skjermbilder.
- Alle innholdsruter kontrollert for egen head med tittel, beskrivelse, OG og twitter:card.

Nye testfiler: b107-import.test.ts (8), b107-languages.test.ts og
b107-language-priority.test.ts (3), samt visual/b107-languages.mjs (26 kontroller).
Tidligere testforventninger for tysk språkvalg og grammatikk er oppdatert til bestilte krav.
DB-testenes gamle norske feilmeldinger godtar også engelsk standard, uten svekket domenevilkår.

## Avvik og åpne forhold
- 0077 var nødvendig fordi profiles.locale/set_my_locale var begrenset til nb/en.
- Profilprioritet på en ny enhets aller første servertegning har avgrensningen ovenfor.
- Språk er maskinoversatt der nyoversetting var bestilt; 100 % betyr teknisk dekning/ferskhet,
  ikke menneskelig godkjent oversettelseskvalitet.
- Den autogenererte `src/integrations/supabase/types.ts` kan vises i prosjektets samlede diff;
  den er ikke manuelt redigert som del av oppdraget.
- Ingen nye prosjektpakker, betalte tjenester, manuelt publiseringskall eller Cloud-migrasjoner.

## Endrede filer
Den nøyaktige filoversikten følger nedenfor, sammenlignet med sammenslått main b044d53.