# B-116 – oppfølging av sikkerhet og innholdsgrenser

Dato: 22.10.2026. Produkt: From Pen to Glass. Oppdrag: de tre restfunnene før migrasjon 0087 kjøres i Cloud.

## Endringer

### 1. Offentlig feed og medier

`showcase_feed()` returnerer bare bidragets ID og visningsfelter: type, tittel, beskrivelse, replikk-snapshot, MIME, varighet, dimensjoner, opprettelsestid og offentlig valgt navn. Ingen storage_key, prosjekt-/produksjons-ID, bruker-ID eller e-post. `showcase_comments()` røper heller ikke kontoidentitet. Kontoens display_name kan være avledet av e-post: offentlige svar bruker derfor bare handle som brukeren selv har valgt og satt offentlig, ellers null. Administratorens private kø og egen profil beholder kontonavnet. Kommentarlesing filtrerer også blokkerte forfattere.

Den eksisterende anon-funksjonen `public_profile(text)` fra 0080 ga avatarsti med bruker-ID og vilkårlig profile_fields. 0087 erstatter den med bare offentlig valgt navn og bio, med samme profil-/blokk-/funksjonskontroll. Dette er en faktisk endring av den eldre offentlige svarkontrakten, ikke en ny migrasjon.

`getShowcaseFeed` leser metadata med en offentlig klient, ikke privilegert klient. Bare deretter hentes hver medienøkkel via service-only `showcase_media(item-ID)`, som kontrollerer bryter, godkjent/live, approved_at, revoked_at, utløp og aktivt prosjekt på nytt. Serveren signerer i **600 sekunder** og sender ingen separat lagringsnøkkel til nettleseren. En signert lagrings-URL inneholder naturlig nok lagringsbanen; kravet er tolket som forbud mot separate nøkkel-/identitetsfelter, ikke en URL-proxy som skjuler URL-ens bane.

### 2. Autorisasjon før kopiering og opprydding

Klienten sender bare ressursversjon-/take-ID eller replikk-ID-er, aldri en sti. `prepare_showcase_item` kontrollerer redaktørrolle, aktivt prosjekt, bryter og registrert kilde i samme prosjekt. Fjernede ressurser/versjoner og arkiverte varianter avvises. Take krever aktiv sceneforekomst. Reservasjonen lagrer godkjent kilde, mål og innsettingsdata. Målet er `<project>/shares/<item-id>/media.<ext>`.

Privilegert klient lastes først etter godkjent reservasjon. Serveren bruker bare RPC-ens kilde/mål. Kopierings- eller bekreftet innsettingsfeil forsøker filsletting og frigjør reservasjonen når slettingen lykkes. Hvis filsletting feiler, beholdes reservasjonen slik at en mulig fil ikke mister referansen. Dette er et bevisst sikkerhetsavvik fra ubetinget frigjøring.

Sluttføring er idempotent. Service-only `showcase_item_outcome` avklarer tapt sluttføringssvar før opprydding: allerede lagret bidrag beholder media. Hvis utfallet ikke kan avklares, slettes ikke filen. Tester dekker autorisasjonsavvisning, kun RPC-kilde, kopieringsfeil, innsettingsfeil, ugyldig mål, tapt svar etter commit og uavklart utfall.

`showcase_reservations` er registrert i ORPHAN_REFERENCE_TABLES sammen med showcase_items. `delete_project` returnerer også reservasjonsmål til filsletting og fjerner reservasjonene.

### 3. Innholdsgrenser

- Scene: registrert stillbilde eller take-klipp. Databasegrensen er **1–15000 ms**, også ved direkte service-skriving; NULL-varighet for video avvises. Kandidatlisten utelater lengre/ukjente klipp.
- Manus: **1–12 ulike replikk-ID-er**, bare ikke-fjernede dialogue-blokker fra samme prosjekt. Fremmede/ukjente ID-er og 13 replikker avvises. Tekst hentes i databasen ved reservasjon og lagres som snapshot, aldri klientfritekst. Senere manusendring endrer ikke snapshot. En defensiv totalgrense på 120000 tegn gjelder snapshot.
- Beskrivelse: **maks 280 tegn**, både oppretting og endring. Forhåndsvisningen beholdes, men manusfeltet er erstattet med replikkvalg. Tittelgrensen er fortsatt 200 tegn.
- Standardutløp er fortsatt 7 dager; 7/14/30/90-dagersvalg, tilbaketrekking, statusvisning, godkjenningskø og karusell beholdes.

To endrede etiketter er oppdatert samtidig på nb/en/fr/es/ru/ja/pt-BR/de/it/ko, med kildehash og maskinmarkering for de åtte oversettelsene. en-XA er regenerert. Tekster slås fortsatt opp med t() ved tegning.

## Migrasjon 0087 – full funksjonsliste

`db/migrations/0087_showcase.sql` er oppdatert direkte. Ingen ny migrasjon er opprettet. Ingen Cloud-kjøring eller publisering er utført. EXPECTED_SCHEMA_VERSION og VISUAL_SCHEMA_VERSION er fortsatt **87**.

### Eksisterende funksjoner som erstattes

| Funksjon | Tidligere definisjon | Endring |
| --- | --- | --- |
| `public.delete_project(uuid, uuid) returns jsonb` | 0084 | Showcase-/reservasjonsfiler i films-listen; slett reservasjoner og bidrag, kommentarer via cascade. |
| `public.public_profile(text) returns jsonb` | 0080 | Bare offentlig valgt navn og bio; fjerner avatar_key, handle og vilkårlige fields fra offentlig svar. |

### Nye funksjoner

1. `private.showcase_require_approval()`
2. `private.showcase_visible(uuid, uuid)`
3. `public.showcase_feed()`
4. `public.showcase_media(uuid)` – service-only
5. `public.prepare_showcase_item(uuid, text, text, text, uuid, uuid[], timestamptz)` – authenticated
6. `public.create_showcase_item(uuid, uuid)` – service-only, reserverte verdier
7. `public.showcase_item_outcome(uuid, uuid)` – service-only
8. `public.cancel_showcase_item(uuid, uuid)` – service-only
9. `public.my_showcase_items()`
10. `public.update_showcase_item(uuid, jsonb)`
11. `public.revoke_showcase_item(uuid)`
12. `public.showcase_comments(uuid)`
13. `public.add_showcase_comment(uuid, text)`
14. `public.remove_showcase_comment(uuid)`
15. `public.my_public_profile()`
16. `public.admin_showcase_queue()`
17. `public.admin_review_showcase_item(uuid, boolean)`
18. `public.admin_set_showcase_approval(boolean)`

Det gamle create_showcase_item-signaturforslaget i tidligere, ukjørte 0087 er fjernet, ikke erstattet som en allerede installert funksjon.

Nye tabeller: showcase_items, showcase_comments, showcase_reservations. Alle har eksplisitte service_role-grants etter CREATE TABLE og RLS uten direkte klientpolicyer. Eksisterende objekter: service_settings.showcase_require_approval, content_reports_target_kind_check (tidligere verdier pluss showcase), schema_version-rad 87. `apply_changes`, `purge_project_assets`, `purge_removed_assets`, `report_content`, `set_my_public_profile`, `globe_points` og `registration_status` erstattes ikke.

## Faktisk verifisering

| Kontroll | Resultat |
| --- | --- |
| Full `bunx vitest run`, siste kjøring | **2434 bestått, 0 feilet, 10 eksisterende hoppet over**; 302 filer bestått, 2 hoppet over |
| Lokal full DB-suite, hele migrasjonskjeden | **176 bestått, 0 feilet** |
| B116 nettlesersuite UI_LANG=nb | **37 bestått, 0 feilet** |
| B116 nettlesersuite UI_LANG=en | **37 bestått, 0 feilet** |
| Målrettet sikkerhet/kjerne/i18n | **45 bestått, 0 feilet** |
| `node scripts/i18n/check.mjs` | **0 tekster uten engelsk i 0 filer** |
| `node scripts/i18n/validate.mjs` | Avsluttet med kode 0 |
| releaseCoverage | **100 % alle ti språk og en-XA; 0 problemer** |
| Automatisk type-/byggkontroll | **build OK**, siste observerte signal 20:06:16 UTC |

`npx tsc --noEmit` er ikke kjørt separat: miljøet forbyr manuell typekontroll/bygging. Tidligere automatiske typefeil er rettet; siste automatiske kontroll er grønn. Ingen test er svekket eller hoppet over i denne endringen, ingen pakker lagt til, ingen betalte AI-/ElevenLabs-kall.

Nettleserprøvene bruker mockede svar og kunstig innlogging, ikke ekte Cloud. De verifiserer brukerflate og kall. Databaseprøvene verifiserer reell SQL/RPC/grants/RLS i isolert lokal Postgres. Ny testfil: `tests/unit/showcase-security-server.test.ts` (9 tester). Eksisterende `showcase-b116.test.ts` er utvidet til 13 tester.

Skjermbilder kontrollert visuelt: `/tmp/browser/b116-followup-nb/b116-01-oppretting.png` (godkjenningsmelding) og `/tmp/browser/b116-followup-en/b116-03-innlogging.png` (innloggingsskjema/globus og karusell adskilt). Login/globus-koden er ikke endret. Ingen nye skjermbilder er kopiert til docs. Mediebidraget i prøvene har ingen ekte fil. Mobil og geometrisk før/etter-baseline er ikke verifisert.

## Gjenværende begrensninger før sikkerhetsgodkjenning

1. **Faktisk videofilvarighet er ikke verifisert.** Grensen håndheves på registrert take-duration_frames omregnet med produksjonens FPS. En take som representerer et utsnitt av en lengre kildefil kan dermed ha kort registrert varighet mens den kopierte filen er lengre. MIME for take er avledet av kind (still PNG, film MP4), ikke målt fra bytes. Oppdragets DB-grense er testet, men dette er ikke bevis for en fysisk 15-sekundersfil. En serververifisert filvarighet eller ferdig kort eksport/derivat må avklares/bygges før fullt produktgodkjent klippdeling.
2. **Krasj-/slettefeilgjenoppretting:** Reservasjonens ti minutters TTL stopper sen sluttføring, men ingen automatisk sweeper eller kvote er bygget. Ved slettefeil/uavklart commit beholdes referansen bevisst; en driftsrutine må rydde slike reservasjoner/files. Frigjøring er testet når oppryddingen faktisk lykkes.
3. **Offentlig server-feed er anon-visning:** Den bruker ikke innlogget seers identitet, så personlige blokkeringer/beta-tester-tilgang følges ikke av akkurat denne feeden. Direkte RPC og kommentarer bruker auth.uid(). Dette viderefører eksisterende offentlige feedmodell og er ikke rettet med ny auth-arkitektur her.
4. **Eksisterende globus:** Stabil forskjøvet posisjon/aktivitet kan følges ved gjentatte anonyme oppslag selv uten ID. Dette er et tidligere vedtatt B-117-krav, ikke endret i B-116.

**Konklusjon:** De opprinnelige nøkkel-/kopierings-/fritekstfeilene er rettet og de bestilte testgrensene er grønne, men punktene over gjør at leveransen ikke erklæres fullt sikkerhetsgodkjent eller Cloud-verifisert. Claude må gjennomgå disse før aktivering.

## Nøyaktig endrede filer i oppfølgingen

- `db/migrations/0087_showcase.sql`: sikkerhetsflyt, reserverte kilder, offentlige svar, innholdsgrenser, utfallsoppslag og sletting.
- `src/core/community/showcase.ts`: 280 tegn, 12 replikk-ID-er, scenegrense og DTO-tilpasning.
- `src/adapters/community/showcase.functions.ts`: offentlig feed, separat serveroppslag og autorisert kilde-ID-flyt.
- `src/adapters/community/showcase-copy.server.ts`: ny kopierings-/kompensasjonshelper og commit-avklaring.
- `src/adapters/browser/showcase.ts`: registrerte versjon-/take-ID-er, kort scene og replikkkandidater.
- `src/app/community/ShowcaseBox.tsx`: replikkvalg, ID-input og 280-tegnsbeskrivelse.
- `src/app/community/MyShowcasePage.tsx`: redigeringsgrense 280 tegn.
- `src/adapters/storage/orphan-cleanup.server.ts`: reservasjonsreferanser beskytter mulige kopier.
- `tests/unit/showcase-b116.test.ts`: nye grenser og referansetabelltest.
- `tests/unit/showcase-security-server.test.ts`: ny sikkerhets-/oppryddings-/signeringsregresjon.
- `tests/db/run-db-tests.ts`: kilde-, rolle-, snapshot-, synlighets-, offentlig-felt-, grense- og idempotensprøver.
- `tests/visual/b116-showcase.mjs`: registrert versjons-ID og replikkvalg i begge språk.
- `src/core/i18n/authored.json`: to endrede etiketter.
- `src/core/i18n/locales/nb.json`, `en.json`, `fr.json`, `es.json`, `ru.json`, `ja.json`, `pt-BR.json`, `de.json`, `it.json`, `ko.json`, `en-XA.json`: samtidige oversettelser og generering.
- `src/core/i18n/runtime.gen.json`: regenererte kjøretekster.
- `scripts/i18n/references.v1.json`, `scripts/i18n/candidates.v1.json`, `scripts/i18n/inventory-report.json`: regenererte henvisninger.
- `AGENTS.md`: regel 52 om autoriserte reservasjoner/offentlige DTO-er.
- `roadmap.md`: oppfølging og begrensninger.
- `docs/development/B116_REPORT.md`: denne oppdaterte rapporten.

Prosjektminne: `mem://constraints/showcase-content` og `mem://index.md`. Arbeidsregelen som styrte omfanget var **animatic-oppdrag**.
