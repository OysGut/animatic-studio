# Plan: Den globale pakken GP1–GP5

Kilder: `GLOBAL_RESOURCES_SPEC.md` og `GLOBAL_BYGGEPLAN.md`. Begge lagres ordrett under `docs/product/phase3/` i første byggesteg. GP6 tas med Motion Typography. Ingen migrasjon kjøres av meg: jeg skriver filene, og Claude kjører dem.

## Det som finnes i dag (sjekket)
- Siste migrasjon er 0044. Neste er 0045. Tabellene `project_members`, `project_invitations`, `upload_sessions` og `export_records` (0028) finnes.
- Filmeksporten (`src/engine/export/film-video.ts`) lager filen i nettleseren og laster den **ikke** opp. `export_records` lagrer bare metadata. GP5 trenger derfor en ny, eksplisitt opplasting av den ferdige filen.

## Steg og migrasjoner
| Steg | Migrasjon | Skjema |
|---|---|---|
| GP1 Arbeidsgrupper | 0045_workspaces.sql | 45 |
| GP2 Globalt bibliotek | 0046_global_library.sql | 46 |
| GP3 Videreføring | ingen | – |
| GP4 AI-start | ingen | – |
| GP5 QR-filmvisning | 0047_film_shares.sql | 47 |

Hvert steg leveres og godkjennes for seg (tsc, vitest, i18n, DB-tester og nettlesertest), før neste steg starter.

## GP1 – Arbeidsgrupper (§15, §42)
- `workspaces` (id, name, created_by, archived) og `workspace_members` (role: owner/editor/member, removed_at). `workspace_invitations` kopierer `project_invitations` (token-hash, utløp, tilbakekalling).
- `projects.workspace_id` er nullable. Bare prosjekteieren kan koble eller frakoble prosjektet, og bare til en gruppe der hun selv er medlem.
- Nye funksjoner bygd etter samme mønster som de eksisterende: `private.is_workspace_member` / `private.workspace_role` (security definer), `create_workspace`, `create_workspace_invitation`, `accept_workspace_invitation`, `set_workspace_member_role`, `remove_workspace_member`, `leave_workspace` og `set_project_workspace`. Det må alltid finnes minst én eier.
- RLS: medlemmer leser. Ingen direkte skriving fra klienten.
- UI: ny rute `/gruppe/$workspaceId` (medlemmer, invitasjoner, koblede prosjekter) og lenke fra kontosiden. Invitasjonsruten `/invitasjon` utvides til begge typene.
- Tilgang til prosjektet endres ikke ved kobling (gruppemedlemskap gir ingen prosjekttilgang).

## GP2 – Globalt bibliotek (§2–16, G1–G10)
- Tabellene `global_assets` (workspace_id, kind, name, names, description, categories text[], tags text[], archived, removed), `global_asset_variants` og `global_asset_versions` (uforanderlige: storage_key, sha256, mime, bytes, view, number). Disse ligger utenfor prosjektdataene, men har `revision` og check-constraints som de andre tabellene.
- Skriving skjer gjennom egne security definer-funksjoner (`global_*`), som kaller ikke `apply_changes` siden dataene ikke tilhører et prosjekt. Hver funksjon sjekker gruppens rolle og revisjon. Dette er et bevisst avvik fra «alt via apply_changes», og det trenger godkjenning (se åpne spørsmål).
- Rettigheter: member kan bruke og forhåndsvise, editor kan legge til og publisere ny versjon, og owner kan også arkivere og slette.
- Prosjektkobling: `assets.source_global_asset_id`, `asset_variants.source_global_variant_id` og `asset_versions.source_global_version_id` (nullable), skrevet via vanlige kommandoer (AddAsset osv. med nye felter), slik at angre virker.
- Filer: privat bøtte `global` med stien `<workspace_id>/<global_asset_id>/<sha256>.<ext>`. Storage-RLS gir lesetilgang til gruppemedlemmer.
  - «Lagre i globalt bibliotek» kopierer filobjektet én gang på serveren (service role) fra `assets/` til `global/`. Kopien er nødvendig fordi prosjektets bøtte har prosjekt-RLS (§7, se risiko).
  - «Bruk i prosjekt» kopierer filen inn i prosjektets bøtte. Prosjektet eier da selv det som trengs for gjengivelse og gjenoppretting (§16), også om gruppen eller medlemskapet forsvinner. Metadataen og sha256 hindrer duplikat: samme sha256 i prosjektet gjenbruker den eksisterende filen.
- Ny versjon: kjernefunksjonen `globalUpdates(state, globalIndex)` lister koblede ressurser med nyere global versjon. Biblioteket viser merket «Ny versjon finnes – oppdater?». Oppdateringen legger til en ny prosjektversjon og godkjenner den bare når brukeren velger det. Eksisterende lag og ferdige filmer beholder den gamle versjonen (§9).
- Arkivering eller sletting av en global ressurs i bruk: den arkiveres, og prosjektene beholder sin kopi.
- UI: fanen «Globalt» i biblioteket med søk, filter (type, kategori, merke), forhåndsvisning av bilde, lyd og video, varianter og «Brukt i prosjekter» (bare prosjekter brukeren har tilgang til). Handlingen «Lagre i globalt bibliotek» på en prosjektressurs. «Legg til fra globalt» i ressursdialogene.
- Backup: backupen lagrer koblings-ID-ene og prosjektets egne filer. Gjenoppretting fungerer uten gruppetilgang, og koblingen markeres da som «kilde utilgjengelig».

## GP3 – Videreføring mellom scener (§17–24, S1–S8)
- Ren kjerne `planCarryOver(state, layerId, targetOccurrenceIds, mode)` i `src/core/composition/carry-over.ts`. Den kopierer ressurs, variant, versjon, skala, rotasjon og lagrekkefølge til et nytt lag i målsceneforekomstens komposisjon. Nøkkelbilder og animasjon følger ikke med (§21).
- Duplikatsjekk: målet har allerede et lag med samme ressurs. Dialogen lar brukeren velge «Bruk eksisterende» eller «Legg til ny» per scene.
- Én samlet kommando `CarryOverLayer` (eller gruppe av AddLayers) med invers og én angregruppe. Mangler målet komposisjon, opprettes den i samme kommando.
- Handlingen ligger i lagets meny i sceneeditoren og i Asset Studio. «Bruk videre i neste scene» bruker neste aktive forekomst i produksjonen. «Bruk også i …» har en scenevelger. Fra Asset Studio går skrivingen direkte og markeres som egen skriving (samme mønster som lyd).

## GP4 – AI-start av nytt prosjekt (§25–28, A1–A5)
- I dialogen for nytt prosjekt finnes valget «Utvikle nytt prosjekt med skriveassistent» og et kort idéfelt.
- Prosjektet opprettes med `create_project`, og så åpnes `/prosjekt/$id/storylab` med intervjuet (SL7) og idéen som første svar.
- Ingen ny overføringslogikk: overføringen skjer med den eksisterende transfer-hjelperen, med bekreftelse og angring, og OG2 analyserer automatisk etterpå. Forslag overskriver ikke godkjent innhold (eksisterende regel).

## GP5 – QR-filmvisning (§29–35, Q1–Q8)
- Avklaring: filmversjoner lagres ikke på serveren i dag. Ny flyt: etter eksport velger brukeren «Gjør klar for deling». Filen lastes opp til `exports/<project_id>/<export_record_id>/<sha256>.mp4|webm`, og `export_records` får `storage_key`, `status` (generated/uploading/ready/failed), mime, bredde og høyde.
- `film_shares` (export_record_id, token_hash, expires_at, revoked_at, created_by). Funksjonene `create_film_share` og `revoke_film_share` krever rolle editor/owner.
- Offentlig rute `/se/$token` med en server-funksjon som hasher tokenet, sjekker utløp og tilbakekalling og returnerer bare tittel, format og en signert URL på 10 minutter, som fornyes ved behov. Ingen andre data. Mobilspilleren bruker `<video playsinline>`: spill av og pause, scrubbing, fullskjerm og riktig format.
- I eksportdialogen: status (generert, klar for forhåndsvisning, klar for deling, tilgjengelig via QR, ikke lenger delt), QR (gjenbruker `QrCode.tsx`), kopier lenke, `navigator.share` og tilbakekall. QR vises først når filen er `ready` og lar seg spille av.
- Én lenke per filmversjon, så to versjoner får to lenker (Q7). Transkoding gjøres ikke. Vi bruker formatet nettleseren eksporterte, og viser en advarsel hvis formatet ikke spilles på iOS.

## Sletting og gjenoppretting
- `delete_project` og `purge_*` utvides med `film_shares` og eksportfilene. Globale ressurser slettes aldri av prosjektsletting.
- `delete_workspace` er bare mulig uten koblede prosjekter. Prosjektene beholder sine kopier.

## Tester
- Unit: rettighetsmatrise, `globalUpdates`, koblingskommandoer med invers og angre/gjør om, `planCarryOver` (duplikater, lokal animasjon, angre), GP4-flyt med mock, tokenhashing og status for deling.
- DB (`tests/db/run-db-tests.ts`): RLS for gruppemedlem, ikke-medlem og fjernet medlem; rettigheter for member, editor og owner; tilbakekalt og utløpt film_share gir ingenting; delete og purge.
- Nettleser: `global-library-ui.mjs` (G1–G10), `global-carry-over-ui.mjs` (S1–S8), `global-ai-start-ui.mjs` (A1–A5), `global-film-share-ui.mjs` (Q1–Q8, også mobilvisning), med mockede serverfunksjoner, `VISUAL_SCHEMA_VERSION` og engelsk visning.
- Arkitekturtestene står urørt. All tekst bruker `L()`.

## Risikoer
- Filkopier ved lagring og bruk gir noe duplisering i lagringen, men det er bevisst for §16.
- Store filmfiler kan treffe opplastingsgrensen i lagringen, så grensen må sjekkes eller heves.
- iOS spiller ikke webm.
- En ny skrivevei for globale data (utenfor `apply_changes`) må dekkes godt av DB-tester.

## Åpne spørsmål
1. Godtas egne `global_*`-funksjoner i stedet for `apply_changes` for gruppedata?
2. Godtas filkopi til prosjektets bøtte ved «Bruk i prosjekt» (stabilitet) framfor delt referanse?
3. Skal gruppens owner også kunne koble andres prosjekter, eller bare prosjekteieren (foreslått)?
4. Hva skal standard utløpstid for delingslenker være (forslag: ingen, til den tilbakekalles)?
5. Skal filmen kunne deles som webm, eller kreves mp4?
