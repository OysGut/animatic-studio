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

- Scene: **bare stillbilde** (registrert bildeversjon eller take av typen `still`). Klippvalget er fjernet fra kandidatlisten. I databasen avviser `prepare_showcase_item` film-/video-takes og alle videokilder, og tabellen har CHECK `kind <> 'scene' or mime like 'image/%'` og `mime not like 'video/%'`; `kind = 'film'` avvises av både kind-CHECK og RPC (22023). Delt klipp kommer som egen sak (se TODO).
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
19. `public.stale_showcase_reservations(uuid)` – service-only; reservasjoner eldre enn TTL + 1 time uten bidrag
20. `public.release_stale_showcase_reservation(uuid)` – service-only; frigjør bare utløpt reservasjon uten bidrag

Det gamle create_showcase_item-signaturforslaget i tidligere, ukjørte 0087 er fjernet, ikke erstattet som en allerede installert funksjon.

Nye tabeller: showcase_items, showcase_comments, showcase_reservations. Alle har eksplisitte service_role-grants etter CREATE TABLE og RLS uten direkte klientpolicyer. Eksisterende objekter: service_settings.showcase_require_approval, content_reports_target_kind_check (tidligere verdier pluss showcase), schema_version-rad 87. `apply_changes`, `purge_project_assets`, `purge_removed_assets`, `report_content`, `set_my_public_profile`, `globe_points` og `registration_status` erstattes ikke.

## Siste runde før Cloud (22.10, 20:26)

1. **Varighet:** Klipp deles ikke. Scener deles bare som stillbilde (se punkt 3 over). Ny sak i `TODO.md` og `roadmap.md`: «delt klipp via server-generert kort eksport (≤15 s), med målt varighet og MIME».
2. **Opprydding:** Den eksisterende orphan-cleanup-jobben (`confirmOrphanCleanup`, eierbekreftet) kjører nå `sweepShowcaseReservations` først. Den henter utløpte reservasjoner (eldre enn TTL + 1 time, uten ferdig bidrag), sletter filen under `<prosjekt>/shares/<id>/` og frigjør reservasjonen bare når slettingen lyktes. Ved slettefeil beholdes reservasjonen til neste kjøring, og feilen logges med prosjekt- og reservasjons-ID, aldri lagringsnøkkel. Mål utenfor `shares/<id>/` slettes aldri. Merk: sweepen kjører når eieren bekrefter en opprydding; det finnes ingen tidsstyrt jobb for dette i dag.
3. **Offentlig feed:** `private.showcase_visible` (brukt av feed og medieoppslag) skjuler nå bidrag fra kontoer med status `blocked`, `deleting` eller `deleted`, kontoer som ikke lenger finnes i auth, og bidrag med en innholdsrapport med status `open` eller `actioned`. En avvist (`dismissed`) rapport skjuler ikke. Merk: ettersom en åpen rapport skjuler, kan én innlogget bruker skjule et bidrag midlertidig ved å rapportere det; admin opphever ved å avvise rapporten.
4. **Globus:** uendret (vedtatt i B-117).
5. **Aktivering:** `community.public` legges inn som `'off'` i seed i 0080 (`insert into public.features … ('community.public', 'off')`). 0087 endrer ikke `public.features`. Feed, medier, delingsboksen og alle skrive-RPC-er sjekker `private.feature_enabled('community.public', …)`; når bryteren er av, returnerer feeden `[]`, så karusellen før innlogging tegner ingenting, og delingsboksen skjules (`useFeature`, standard av).

## Faktisk verifisering

| Kontroll | Resultat |
| --- | --- |
| Full `bunx vitest run` | **2438 bestått, 0 feilet, 10 eksisterende hoppet over**; 303 filer |
| Typekontroll (`tsgo --noEmit`) | **0 feil** |
| Lokal full DB-suite, hele migrasjonskjeden | **178 bestått, 0 feilet** |
| B116 nettlesersuite nb | **37 bestått, 0 feilet** (første kjøring rett etter omstart av utviklingsserveren ga 1 tidsavbrudd på manusfeltet; ny kjøring grønn) |
| B116 nettlesersuite en | **37 bestått, 0 feilet** |
| `node scripts/i18n/check.mjs` / `validate.mjs` | **0 tekster uten engelsk**; grønn |

Nye/endrede tester: `tests/unit/showcase-sweep.test.ts` (4: sletting + frigjøring, slettefeil beholder reservasjon og logger uten nøkkel, aldri utenfor shares/<id>/, manus uten fil). DB: «scener bare som stillbilde, klipp/film avvises», «feed skjuler sperrede/slettede kontoer og rapporterte bidrag», «sweep lister bare reservasjoner eldre enn TTL + 1 time uten bidrag» (erstatter 15-sekunderstesten for klipp). Ingen betalte AI-/ElevenLabs-kall. Nettleserprøvene bruker mockede svar.

## Gjenværende begrensninger

1. Delt klipp er ikke bygget (egen sak).
2. Reservasjonssweepen kjører bare ved eierbekreftet opprydding, ikke automatisk.
3. Åpne rapporter skjuler umiddelbart (kan misbrukes til midlertidig skjuling).
4. Globus: vedtatt i B-117.

## Nøyaktig endrede filer i oppfølgingen

Siste runde: `db/migrations/0087_showcase.sql`, `src/adapters/browser/showcase.ts`, `src/adapters/storage/orphan-cleanup.server.ts`, `src/adapters/storage/orphan-cleanup.functions.ts`, `tests/unit/showcase-sweep.test.ts` (ny), `tests/db/run-db-tests.ts`, `scripts/i18n/references.v1.json`, `scripts/i18n/candidates.v1.json`, `scripts/i18n/inventory-report.json` (regenerert), `TODO.md`, `roadmap.md`, `docs/development/B116_REPORT.md`.

Tidligere runde:

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
