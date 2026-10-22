# B-116 – Utstillingsvindu: ferdigstilling og kontroll

Dato: 22.10.2026. Produkt: From Pen to Glass.

## Oppdraget fra 19:04 UTC

Statusetikettene på `/delinger` slås opp med `t()` under tegning. Type- og utløpsetiketter i delingsdialogen og typeetiketter i administratorkøen evalueres heller ikke ved modulinnlasting. Ingen engelsk kildetekst eller oversettelse er endret i denne ferdigstillingen.

`b116-showcase.mjs` bruker nå `UI_LANG=nb|en` gjennom hele suiten, også i tidligere norskspråklige scenarioer. Kommentarprøven venter på den konkrete kommentaren før den kontrollerer innholdet; forventningen er ikke svekket. Testens kunstige innlogging og språkvalg legges kun i appens egen opprinnelse.

Full Vitest avdekket et forbudt ikon og en foreldet skjemakontrakt. Delingsboksen bruker derfor `Share2` i stedet for `Sparkles`, og forventet skjemaversjon samt den felles visuelle testkonstanten er 87. Språkreferansene er regenerert etter flyttingen av oppslagene.

## Funksjonene som finnes i leveransen

- Delingsboks på prosjektlisten bak `community.public`, med egne redigerbare prosjekter.
- Valg av karakterbilde, ressursbilde, eksportert sceneklipp, manusutdrag eller lyd.
- Forhåndsvisning med samme kort som karusellen og særskilt advarsel om offentlig manus.
- Standardutløp på sju dager, valg av 7/14/30/90 dager og tilbaketrekking med bekreftelse.
- «Mine delinger» med ventende, synlig, utløpt, trukket tilbake og avvist status.
- Administratorkø, godkjenning/avvisning og bryter for godkjenningskrav.
- Karusell før innlogging og på prosjektlisten; automatisk skifte hvert niende sekund, deaktivert ved redusert bevegelse.
- Kommentarer, fjerning av egne kommentarer og rapportering av bidrag/kommentarer.
- Profil og avatar bak `community.profiles`, med eksisterende profil-RPC for lagring.

Dette er en beskrivelse av nåværende kode, ikke en påstand om at alle opprinnelige akseptansekrav er dekket; se restfunn nedenfor.

## Migrasjon 0087 – komplett oversikt over erstatninger

`db/migrations/0087_showcase.sql` er ikke endret eller kjørt i Cloud i denne ferdigstillingen. Claude gjennomgår og kjører migrasjonen.

**Den eneste eksisterende funksjonen som erstattes:**

| Funksjon | Tidligere definisjon | Endring |
| --- | --- | --- |
| `public.delete_project(p_project uuid, p_actor uuid) returns jsonb` | 0084 | Legger showcase-filer til `films`-listen og sletter prosjektets `showcase_items`; tilhørende kommentarer slettes via `ON DELETE CASCADE`. |

**Andre eksisterende objekter som endres:**

- `public.service_settings`: ny kolonne `showcase_require_approval boolean not null default true`.
- `public.content_reports.content_reports_target_kind_check`: slettes og opprettes på nytt med tidligere verdier pluss `showcase`.
- `public.schema_version`: ny rad for versjon 87.

**Nye funksjoner, ikke erstatninger:**

- `private.showcase_require_approval()`.
- `private.showcase_visible(uuid, uuid)`.
- `public.showcase_feed()`.
- `public.create_showcase_item(uuid, text, text, text, text, text, text, integer, integer, integer, timestamptz)`.
- `public.my_showcase_items()`.
- `public.update_showcase_item(uuid, jsonb)`.
- `public.revoke_showcase_item(uuid)`.
- `public.showcase_comments(uuid)`.
- `public.add_showcase_comment(uuid, text)`.
- `public.remove_showcase_comment(uuid)`.
- `public.my_public_profile()`.
- `public.admin_showcase_queue()`.
- `public.admin_review_showcase_item(uuid, boolean)`.
- `public.admin_set_showcase_approval(boolean)`.

Nye tabeller er `public.showcase_items` og `public.showcase_comments`, med indekser, eksplisitte service-role-grants og RLS uten direkte klientpolicyer. `apply_changes`, `purge_project_assets`, `purge_removed_assets`, `report_content` og `set_my_public_profile` erstattes **ikke**.

## Faktiske testresultater

| Kontroll | Resultat |
| --- | --- |
| `UI_LANG=nb node tests/visual/b116-showcase.mjs http://localhost:8080 /tmp/browser/b116-nb` | **37 bestått, 0 feilet**, også ved ny kjøring etter siste testretting |
| `UI_LANG=en node tests/visual/b116-showcase.mjs http://localhost:8080 /tmp/browser/b116-en` | **37 bestått, 0 feilet** |
| `bunx vitest run` | **2422 bestått, 0 feilet, 10 eksisterende hoppet over**; 301 testfiler bestått, 2 hoppet over |
| `DATABASE_URL=postgres://postgres@localhost:54329/postgres bun run test:db` | **170 bestått, 0 feilet**, hele migrasjonskjeden i ny isolert lokal database |
| `node scripts/i18n/check.mjs` | **0 tekster uten engelsk i 0 filer** |
| `node scripts/i18n/validate.mjs` | Avsluttet med kode 0 |
| `releaseCoverage()` / `node scripts/i18n/release-check.mjs` | **0 problemer, 100 %** for nb, en, fr, es, ru, ja, pt-BR, de, it, ko og generert en-XA |
| Automatisk byggsignal | **build OK**; ingen manuell bygging eller TypeScript-kjøring |

`npx tsc --noEmit` er ikke kjørt: miljøets instruksjoner forbyr manuell bygging/typekontroll og bruker automatisk kontroll. Det rapporteres derfor ikke et selvstendig tsc-resultat.

Den utforskende `check.mjs --all` teller også tekniske strenger som HTTP-headere, filstier og testkode og ga ikke grønt resultat. Den ordinære prosjektkontrollen og release-/ferskhetskontrollen for alle registrerte språk er grønne; ingen kontroll er endret eller svekket.

Nettlesersuitene bruker faste, mockede svar og kunstig testinnlogging; de har ingen ekte AI-kall eller Cloud-skriving. De verifiserer derfor brukerflaten og dens kall, ikke ekte lagring/signering i Cloud. DB-suiten verifiserer RPC/RLS lokalt. Innloggingskontrollen viser sentrering og at karusellen ikke overlapper skjemaet ved 1280 × 1800; den sammenligner ikke alle geometriske mål med en før-B-116-baseline og dekker ikke mobil.

Skjermbilder kontrollert visuelt: `B116_LOGIN_SHOWCASE_nb.png` og `B116_LOGIN_SHOWCASE_en.png` i samme mappe som rapporten. Globusen er synlig og skjema/karusell er adskilt. Bidraget i testbildene er en kunstig fixture uten reell mediefil.

## Restfunn som må gjennomgås før Cloud-aktivering

Den nåværende arbeidskopien inneholder **ikke** alle sikkerhetstiltak nevnt i den eldre arbeidsoppsummeringen. Disse funnene dokumenteres uten å endre migrasjon eller serverkode utenfor dette språk-/testoppdraget:

1. `showcase_feed()` returnerer `storage_key`. Banen inneholder prosjektets ID; offentlig feed gir dermed mer enn bare visningsfelter. En separat server-only feed uten offentlig nøkkel finnes ikke i gjeldende 0087.
2. `createShowcaseItem` kopierer med privilegert klient **før** RPC-en kontrollerer redaktørtilgang. Kilden kontrolleres kun med prosjektprefiks og fravær av `..`, ikke mot registrert ressurs/take. Mislykket oppretting rydder ikke opp kopien. Ingen `authorize_showcase_copy` finnes i gjeldende 0087.
3. Scenelisten tilbyr eksporterte takes, ikke stillbilde fra montering, og håndhever ingen kort scenelengde. Manusfeltet er fri tekst med 1000-tegnsgrense, ikke et valgt utdrag begrenset til noen få replikker.

**Konklusjon:** Ferdigstillingsoppdragets språk- og testmål er grønne, og erstatningslisten er komplett. B-116 kan likevel ikke erklæres fullt sikkerhets-/produktgodkjent eller ekte Cloud-verifisert på dette grunnlaget. Claude må gjennomgå restfunnene før 0087 kjøres og funksjonen aktiveres. Ingen publisering er utført.

## Endrede filer i ferdigstillingen

- `src/app/community/MyShowcasePage.tsx`: status- og utløpsoppslag i tegningen.
- `src/app/community/ShowcaseBox.tsx`: forsinkede type-/utløpsoppslag og korrekt delingsikon.
- `src/app/admin/ShowcaseAdmin.tsx`: typeetiketter i tegningen.
- `src/adapters/storage/project-rows.ts`: forventet skjemaversjon 87.
- `tests/visual/schema-version.mjs`: felles testversjon 87.
- `tests/visual/b116-showcase.mjs`: begge språk i alle scenarioer, opprinnelsesavgrenset testtilstand og konkret venting på kommentar.
- `scripts/i18n/references.v1.json`, `scripts/i18n/candidates.v1.json`, `scripts/i18n/inventory-report.json`: regenererte språkhenvisninger.
- `roadmap.md`: ferdigstillingsoppdrag og restfunn.
- `docs/development/B116_REPORT.md`: denne rapporten.
- `docs/development/B116_LOGIN_SHOWCASE_nb.png`, `docs/development/B116_LOGIN_SHOWCASE_en.png`: kontrollerte skjermbilder.

Ingen nye testfiler eller oversettelser; ingen pakker lagt til. Arbeidsregelen som styrte omfanget var **animatic-oppdrag**.