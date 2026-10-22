# Pen to Glass Community – arkitektur- og fasplan (utkast 21.10, B-114)

**Prinsipp:** alt bygges bak funksjonsbrytere («av», «beta» eller «på») som håndheves i databasen. Når en bryter er av, gir den funksjonen ingen data og ingen synlige spor.

## 1. Hva som finnes i dag (kan gjenbrukes)
| Behov | Finnes | Merknad |
|---|---|---|
| Deling med lenke | `film_shares` med hashet token, `resolveFilmShare` (signert URL i 600 s), `/se/$token`, noindex | Bare én ferdig mp4 per lenke, uten mottakere eller kommentarer |
| Anonym tilgang med token | `upload_sessions`, `/m/$token` | Godt mønster: token-hash, samme svar ved feil, service role i serverfunksjon |
| Roller og invitasjoner | `project_members` (owner, editor, commenter, viewer), `project_invitations`, arbeidsgrupper | Rollen `commenter` virker ikke (runCommand krever editor). Faste roller er duplisert i 7 TS-filer |
| Kommentarer | `script_annotations` (tekstankre), `note_flags` | Ingen tidsanker (frame eller ms), ingen tråder |
| Versjoner til A/B | produksjoner, `scene_variants`, takes, dialogversjoner, `CompareTakesDialog` | Eksport bare i nettleseren (WebCodecs) |
| Profiler | `profiles` (display_name, locale, ui_prefs, country) | Ingen avatar, bio eller offentlig side |
| Bibliotek og pakker | `global_*` per arbeidsgruppe, `copyGlobalToProject`, backup-restore som prosjektkopi | Ingen «nytt prosjekt fra pakke», ingen offentlig bibliotek |
| Lisens og kreditering | bare `font_spec.license`; `credit_participants` med fritekst | Ingen lisensfelt på ressurser |
| Moderering og innstillinger | `account_status`, adminfunksjoner, `service_settings`, `app_status`, Turnstile | Ingen rapportering, blokkering eller funksjonsbrytere |
| Varsler | Realtime på noen tabeller, cron-endepunkt | Ingen varseltabell, ingen e-post fra appen |

## 2. Faser
- **C0, grunnmur (ingen synlig funksjon for vanlige brukere):** funksjonsbrytere, publiseringsmodell, tidskodede kommentarer, utvidet profil, lisensfelt på ressurser, rapportering og blokkering. `film_shares` beholdes og kan senere speiles.
- **C1: faglig respons i lukkede grupper.** Del en scene, et tidsintervall eller en eksport med utvalgte personer eller en testgruppe. Spiller med tidskodede kommentarer (klikk hopper til riktig frame). «Forhåndsvis som mottaker». A/B-test av to varianter med nøytral rekkefølge, egne spørsmål, skjulte svar til testen avsluttes og resultat med usikkerhet. Resultatet velger aldri en versjon automatisk.
- **C2:** profil, portefølje og prosjektside, følgere og produksjonsdagbok, planlagte slipp.
- **C3: samarbeid.** «Vi trenger …», kompetansesøk, kontaktforespørsler, invitasjon med begrensede rettigheter.
- **C4: utfordringer.** Pakker i et community-bibliotek, «Start utfordringen» lager et prosjekt fra pakken, tidsfrister og felles visning.
- **C5: åpne prosjekter og stafett.** Lisenser, grener og opphav, overlevering.
- **C6: filmfond.** Krever betaling og juridisk utredning. Ikke før det.

## 3. Standardvalg i C0 og C1
- bare innloggede brukere kan kommentere;
- testgrupper er inviterte;
- ingenting er offentlig før `community.public` er på.
