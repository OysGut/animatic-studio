# SB-10 – Gjennomgang med kunde og team

Dato: 24.10.2026. **Ikke publisert. 0108 er bare skrevet; ingen migrasjon eller DB-test kjørt.**

## Bygget
- Ny gjennomgang fra storyboardgalleriet og panelredigeringen: velg scener i produksjonen, lagret panelrevisjon eller gjeldende revisjon, utløp, valgfritt passord og separate tillatelser for kommentar/godkjenning. Lenker kan trekkes tilbake.
- 32 tilfeldige tokenbyte; bare SHA-256 lagres. Passord lagres saltet med PBKDF2-SHA256. Klarteksttoken returneres bare ved opprettelse og holdes i den aktuelle visningen, ikke i prosjektdata.
- Serveren fryser det valgte storyboardet før eksport. Eksport bruker denne frosne tilstanden, ikke en mulig utdatert lokal revisjon. Panelbilder og storyboardfilm bruker eksisterende bildekilde/compositor og SB-4-lydmiks/SB-9-overganger. Originale prosjektdata endres ikke.
- Offentlig `/review/$token` med mobilvennlig avspilling, lydkontroller og panelvalg. Kommentar med koordinatnål, navn og valgfri e-post; ingen konto kreves. Gjestebeslutningen endrer ikke produksjonsstatus.
- Teamoversikt og panelavgrenset innboks med svar, løsning/gjenåpning, oppgavekobling via eksisterende note-flagg og eksplisitt bekreftet statusadopsjon via `SetProductionStatus`. «Endring ønsket» blir `changes_requested`, ikke en automatisk godkjenning.
- Sammenligning av to revisjoner av **ett panel**, side om side eller overlegg med glidebryter og differanse. I tillegg kan to delte storyboardutvalg velges i en samlet liste, der endrede, nye og fjernede paneler merkes.
- Ingen HTML gjengis. NFC, teksttak, koordinatgrenser, G-8-rategrenser, no-store og no-referrer. Gjestesvaret inneholder ikke interne stier, prosjektidentitet, snapshotinnhold, token-/passordhash eller gjestens e-post. Prosjektmedlemmer leser feedback gjennom medlems-RLS; mutasjoner krever redaktør/eier og revisjonssjekk.
- Nye review-referanser inngår i orphan-beskyttelsen. Vindu-ID-er V-175–178 er registrert. Alle registrerte språk har nøklene; nb/en er skrevet direkte, øvrige språk er maskinoversatt og merket for gjennomlesing.

## Kontroller
| Kontroll | Faktisk resultat |
|---|---|
| Full Vitest på siste applikasjonskode | **3036 bestått, 0 feilet, 10 eksisterende hoppet over** |
| Nye SB-10-kjerne/serverprøver | 16 bestått som del av full suite |
| Visuelt nb/en desktop/mobil | **12 bestått, 0 feilet** med falske server-/lagringstjenester |
| Gjesteflyt | navn → kommentar → koordinatnål → endring ønsket → innsending → resultat lest tilbake i UI på nb/en |
| Video | falsk WebM med lyd avspilt, tiden gikk frem; UI lydkontroller til stede. Chromium-miljøet støttet ikke første H.264-testfil |
| Type-/byggsignalet fra forhåndsvisningen | siste `/tmp/observability/build-errors.log`: **build OK**, ingen gjeldende typefeil |
| i18n check og validate | grønne, 0 tekster uten engelsk |
| check_kb | **OK**, PyYAML installert bare i midlertidig miljø |
| DB-suite / 0108 | **ikke kjørt**, i henhold til oppdraget; Claude må kjøre |

DB-testen som er skrevet dekker service-only lookup, skjulte hashkolonner, ikke-medlems-RLS, riktig panelutvalg, kommentar/godkjenning, tekst-/pin-tak, utløp, tilbakekalling og rategrense. Den er ikke rapportert som grønn.

## Ærlige åpne punkter og sikkerhetsbegrensninger
1. Samlet revisjonsutvalg er bygget som liste av to delingers snapshots. Panelenes visuelle side-/overleggssammenligning bruker den eksisterende panelvisningen. Samlet delingsutvalg er ennå ikke prøvd med virkelige Cloud-rader.
2. Faktisk Cloud-opprettelse, eksportopplasting og finalisering, og teamets svar/løsning/oppgave/statusflyt, er ikke verifisert ende-til-ende. DB må først få 0108. Testene kjører ikke betalte tjenester eller ekte gjesteskritt mot produksjon.
3. 0108 har nå restriktive insert/update/delete-policyer som blokkerer medlemsendringer under finaliserte review-prefikser, også etter tilbakekalling. Service-only purge beholder tilgang. Policyene er skrevet og DB-testen utvidet, men ingen policy er kjørt eller DB-verifisert her. Det gjenstår å teste opplasting/finalisering samtidig med medlemsendringer før reell kundedeling.
4. Tilbakekalling sperrer nye oppslag straks; allerede utstedte signerte medielenker kan være gyldige i maksimalt 60 sekunder. Data som allerede er lastet ned kan ikke trekkes tilbake. Spilleren fornyer hver 45. sekund.
5. Ingen nye produktvalg er tatt. Disse kontrollpunktene krever implementering/test, ikke nye betalte tjenester. De er også ført i roadmap/TODO.

## Endrede filer i SB-10
- `roadmap.md`
- `db/migrations/0108_sb10_review.sql`
- `src/core/storyboard/review.ts`
- `src/adapters/review/crypto.server.ts`
- `src/adapters/review/review.functions.ts`
- `src/engine/export/storyboard-review.ts`
- `src/app/storyboard/ReviewCompare.tsx`
- `src/app/storyboard/ReviewSetCompare.tsx`
- `src/app/storyboard/StoryboardReview.tsx`
- `src/app/share/StoryboardReviewPage.tsx`
- `src/routes/review.$token.tsx`
- `src/app/storyboard/StoryboardWorkspace.tsx`
- `src/app/storyboard/PanelEditor.tsx`
- `src/app/storyboard/AGENTS.md`
- `src/adapters/storage/project-rows.ts`
- `src/adapters/storage/orphan-cleanup.server.ts`
- `src/app/ui-ids.ts`
- `src/styles.css`
- `src/core/i18n/authored.json`
- `src/core/i18n/locales/nb.json`
- `src/core/i18n/locales/en.json`
- `src/core/i18n/locales/fr.json`
- `src/core/i18n/locales/es.json`
- `src/core/i18n/locales/ru.json`
- `src/core/i18n/locales/ja.json`
- `src/core/i18n/locales/pt-BR.json`
- `src/core/i18n/locales/de.json`
- `src/core/i18n/locales/it.json`
- `src/core/i18n/locales/ko.json`
- `src/core/i18n/locales/en-XA.json`
- `scripts/i18n/mapping.v1.json`
- `scripts/i18n/references.v1.json`
- `scripts/i18n/candidates.v1.json`
- `scripts/i18n/inventory-report.json`
- `tests/unit/sb10-review.test.ts`
- `tests/unit/sb10-server.test.ts`
- `tests/visual/sb10-review.mjs`
- `tests/db/run-db-tests.ts`
- `docs/development/UI_IDS.md`
- `docs/development/SB10_REPORT.md`
- `TODO.md`

Arbeidsmetoden følger **animatic-testing** og **animatic-arkitektur-og-data**; DB-kjøring er uttrykkelig overlatt til Claude i dette oppdraget.

## Retting av 0108 før Cloud-kjøring (24.10)
- `tests/db/supabase-emulation.sql` har nå et minimalt storage-skjema (`storage.buckets`, `storage.objects` med RLS og `storage.foldername`). DB-testene stoppet før med «schema "storage" does not exist». Lagringsreglene i 0002 og 0004 opprettes nå også lokalt (kontrollert i testen), og de restriktive 0108-reglene prøves for ekte: et medlem kan ikke skrive over en ferdig delingsfil, men kan fortsatt laste opp andre steder.
- Taket på `storyboard_shares.manifest` er senket fra 150 000 000 til 2 000 000 byte (500 paneler), med både `octet_length` og `pg_column_size` (G-5). `replies` fikk også `pg_column_size`.
- `begin;`/`commit;` er fjernet.
- `storyboard_review_comment` tar nå `p_ip` (SHA-256 av gjestens IP, beregnet i serverfunksjonen) og teller både per deling (600/time) og per IP (60/time). En gjest som når grensen, stopper ikke andre gjester. Kall uten gyldig IP-hash avvises.
- Bare lesing for innloggede: 0108 (og 0109) trekker eksplisitt tilbake skriverettigheter fra `authenticated` og alt fra `anon` på de nye tabellene, slik 0058-testen krever.
- DB-tester lokalt (Postgres 17): **233 bestått, 0 feilet**.
