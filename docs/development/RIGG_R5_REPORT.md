# Rigg & 2D-utskrift – runde 5 (B-087): utskriftsjobber, kopier, QR og tosidig utskrift

Dato: 22.10.2026. Status: bygget og testet lokalt. Migrasjon 0079 er **ikke** kjørt i Cloud (Claude kjører den).

## Datamodell
- `src/core/print/job/index.ts` (ren kjerne): `PrintJobSettings` (modus, klippelinje, enhet, målestokk, QR-plassering og hjørne, tosidig og vending, papir, retning, marger, tiling, ID-tekst, kopinummer, felles felt fra B-091), `PrintJobElement` (lag, kildeversjon, scene, frame, maske, antall kopier, merknad, opp-pil), `PrintCopy`.
- Snarveier: `thisFrameTimes` («denne framen × N»), `frameRange` («frame X–Y»), `frameRangeTimes` («frame X–Y × N kopier hver»).
- **Ingen deduplisering:** ingen funksjon sammenligner eller slår sammen elementer (A1–A3, egen test).
- Per kopi: egen frame-/tidsangivelse, ID-tekst, kopinummer (bare når slått på), merknad, opp-pil og QR. Felles felt med frame/tid fra gjeldende frame filtreres bort (`PER_COPY_FIELDS`), så hver kopi viser sin egen frame.
- Hver frame i et intervall peker til bildet laget faktisk viser på den framen (`layerVersion(state, layer, frame)`), så bildeskift gir riktig kildeversjon per element.
- Innstillingene (inkl. papir, retning og marger fra utskriftspanelet) lagres på jobben og som brukerens siste valg (`ui_prefs.rigPrintJob`).
- Kommandoer: `SavePrintJob` / `RestorePrintJob` (`src/core/print/job/commands.ts`), angres som ett steg. Backup tar med jobber og elementer.

## Migrasjon 0079 (`db/migrations/0079_rig_print_jobs.sql`)
- Utgangspunkt 0078, skjemaversjon 78 → 79, bare additiv. SHA-256: `d07c81129efb6368506edcf6a9ce74a8981b6a4e97cbacd5cc12c52f021c9f2e`.
- Tabeller: `print_jobs`, `print_job_elements` (prosjektdata via `apply_changes`), `print_copies` (én rad per fysisk kopi, unik på element + kopinummer).
- Koder (B-090 punkt 7): **egen pepper** (`private.print_copy_secret`), ikke gjenbruk av 0070, så delingslenker og kopikoder aldri deler domene. QR-nøkkel = base64url(SHA-256(pepper ‖ 'print-copy:' ‖ kopi-ID)); `code_digest` er pepret SHA-256 av nøkkelen. Kort kode: 8 tegn Crockford base32 med egen pepret hash (`short_digest`), unik per prosjekt. Verken nøkkel eller kort kode lagres i klartekst.
- GRANT og RLS eksplisitt: medlemmer kan lese jobbene; ingen direkte klientskriving; `code_digest`/`short_digest` kan ikke leses av klienten.
- **Funksjoner som erstattes** (kopiert fra siste definisjon): `public.apply_changes` (0072), `public.delete_project` (0072), `public.purge_project_assets` (0078), `public.purge_removed_assets` (0078).
- Nye funksjoner: `private.print_copy_key`, `private.print_copy_digest`, `private.print_short_digest`, `private.print_short_code`, `private.print_normalize_code`, `public.issue_print_copies`, `public.print_copy_codes`, `public.lookup_print_copy`, `public.revoke_print_copies`.
- `lookup_print_copy` krever innlogging og prosjekttilgang og returnerer bare prosjekt, scene, frame, lag og kopinummer.
- Hele 0079 er kjørt lokalt fra 0078 i én transaksjon (78 → 79).

## Brukerflate
- Inspeksjonsvinduet → «Utskriftsjobb» (`src/app/rig/PrintJobSection.tsx`): elementer og antall, felles innstillinger, sum av elementer/kopier/ark, forhåndsvisning av de tre første arkene, «Lag PDF» (lagrer jobben, lager kopiene og én PDF) og gjenåpning/ny utskrift med samme koder.
- QR-plassering: utenfor figuren (med kort kode under), på figuren (valgt hjørne/flate, varsel om at koden blir synlig i opptak), på baksiden (speilvendt bak figuren).
- Tosidig utskrift: testark med kryssmerker, x/y-forskyvning i mm lagret per bruker og skriver, vending langs lang eller kort kant.
- Oppslag: ruten `/k/$code` (QR) og manuell kode fra prosjektsiden og telefonen (normaliserer O/0, I/L/1, mellomrom og bindestrek). Ukjent/tilbaketrukket kode eller manglende tilgang gir nøytral side. QR-innholdet er bare `origin/k/<nøkkel>`; nøkkelen logges aldri og står ikke i klartekst i PDF-en (suiten sjekker det).

## Tester (kjørt én om gangen)
| Suite | Resultat |
|---|---|
| `tests/unit/rigg-r5-job.test.ts` (A1, A2, A3, A14, A15, koder, felt per kopi) | 13/13 |
| `tests/visual/rigg-r5.mjs` nb | 12/12 |
| `tests/visual/rigg-r5.mjs` `UI_LANG=en` | 12/12 |
| rigg-r1 / r2 / r3 / r4 | 12/12, 17/17, 15/15, 12/12 |
| dec0090-mobile-ui / scene-mobile-audio | 35/35, 23/23 |
| global-film-share | 12/12 |
| Full Vitest | 2 246 bestått, 10 hoppet over, 0 feilet |
| DB (`tests/db/run-db-tests.ts`, inkl. 0079: grants, RLS, oppslag uten tilgang, angring, backup) | 155/155 |
| i18n (validate, check, release-check) for alle 10 språk | grønn |
| `npx vite build` | OK, 0 `.map`-filer, egen bunt for `/k/$code` |

`rigg-r5.mjs` lager en jobb med «denne framen × 20», åpner PDF-en og teller 20 figurer, sjekker kort kode og at nøkkelen ikke står i klartekst, skriver ut på nytt med samme koder, slår opp QR-ruten og lander på riktig scene/frame/lag, og prøver manuell kode fra telefonsiden og prosjektsiden.

## Kravstatus
REQ-0879–0881 (A1–A3), REQ-0892 (A14), REQ-0893 (A15) og REQ-0894 (A16) satt til «Verifisert». A4–A13 var allerede verifisert. `build_docs.py` og `check_kb.py` OK.

## Nye tekster
57 nøkler `print-job.*` på nb og en (skrevet selv) og fr, es, ru, ja, pt-BR, de, it, ko (**maskinoversatt**, merket `review: "machine"`).

## Avvik og begrensninger
- Etter «Lag PDF» venter dialogen på at jobben er lagret ved å prøve `issue_print_copies` på nytt (opptil 15 s), i stedet for `useCommands.whenIdle()`.
- Elementene lagrer maske-ID, ikke konturen; konturen beregnes på nytt fra kildeversjonen ved utskrift.
- Forhåndsvisningen viser arkoppsett med figurrammer og QR-felt, ikke selve konturene.
- Kopikodene kan bare lages og leses av redaktør/eier; tilbaketrukne koder skrives ikke ut på nytt.
- Suiten bruker et stort egendefinert ark, så figuren ikke deles over flere ark og kan telles direkte.
