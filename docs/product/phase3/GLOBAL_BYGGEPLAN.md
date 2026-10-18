# Byggeplan: Den globale pakken (18.10.2026)

*Grunnlag: `PHASE3_GLOBAL_RESOURCES_SPEC.md`.*

*Beslutninger:*
- *B-044: biblioteket eies av arbeidsgrupper.*
- *B-042/B-044: pakken bygges etter Asset Studio og før Motion Typography Studio.*
- *B-047: AI-analyse ved import.*

## Det som finnes, og som gjenbrukes
- Medlemskap per prosjekt (`project_members`: owner, editor, commenter, viewer). Det finnes ikke noe begrep om arbeidsgruppe eller organisasjon ennå.
- Ressurser: `Asset` → `AssetVariant` (godkjent versjon) → `AssetVersion` (uforanderlig fil, `view`). Lagene i scenen peker på ressurs, variant og versjon.
- Mobilbroen (DEC-0090) har token-økter med hash, utløp og tilbakekalling (`upload_sessions`). Det mønsteret kan brukes til delingslenker.
- Eksport av animatic til fil finnes. Filmversjoner finnes som takes/eksporter, men har ingen fast visningsside.
- Story Lab-intervjuet og canvaset (SL7) har overføring til biblioteket og manuset.

## Steg
| Steg | Innhold | Migrasjon |
|---|---|---|
| GP1 | **Arbeidsgrupper:** tabellene `workspaces` og `workspace_members` (owner/editor/member), invitasjon med samme flyt som prosjektinvitasjoner, og valgfri kobling av prosjekter til en gruppe. Adminside per gruppe. | Ja |
| GP2 | **Globalt bibliotek:** `global_assets`, `global_asset_variants` og `global_asset_versions`, eid av gruppen og uforanderlig per versjon. Filene ligger i en egen lagringsbøtte per gruppe.<br>• «Lagre i globalt bibliotek» kopierer metadata og refererer til samme fil når det er mulig, uten duplisering.<br>• «Bruk i prosjekt» lager en prosjektressurs som er en **kobling** (`source_global_asset_id` og `source_version`) og peker på samme fil.<br>• Ny global versjon gir et varsel: «Ny versjon finnes – oppdater?». Den tas aldri inn automatisk (§9, §16).<br>• Søk, filter, kategorier, merker, forhåndsvisning (også lyd), varianter og «brukt i prosjekter».<br>• RLS per gruppemedlemskap. | Ja |
| GP3 | **Videreføring mellom scener:** «Bruk videre i neste scene» og «Bruk også i …» på et lag i sceneeditoren og i Asset Studio. Laget kopieres som ny sceneforekomst med samme ressurs, variant, skala, rotasjon og lag. Det sjekkes for duplikater, og brukeren velger mellom å bruke den eksisterende og å legge til en ny. Én angregruppe. Lokale endringer forblir lokale (§21). | Nei |
| GP4 | **AI-start av nytt prosjekt:** «Utvikle nytt prosjekt med skriveassistent» i dialogen for nytt prosjekt. Den oppretter prosjektet og åpner Story Lab-intervjuet (SL7). Godkjente noder overføres til bibliotek og manus med eksisterende overføring, og OG2 analyserer automatisk. | Nei |
| GP5 | **QR-filmvisning:**<br>• `film_shares` med token-hash, peker på en **bestemt filmversjon** (eksportert fil), utløp og tilbakekalling;<br>• offentlig visningsside `/se/$token` med mobilspiller (play, pause, scrubbing, fullskjerm, riktig format), uten tilgang til noe annet;<br>• signert, kortlivet media-URL;<br>• QR, kopier lenke og `navigator.share`;<br>• status for generert, klar, delt og tilbakekalt.<br>Det krever at filmversjonen lagres som fil i Storage. Avklares i planen. | Ja |
| GP6 | **Integrasjoner:**<br>• Asset Studio får globale varianter i variantstripen (§38);<br>• Motion Typography får globale maler og logoer (§39), og det bygges sammen med MTS. | – |

## Åpne punkter (avklares i Lovable-planen)
- Om filmversjoner allerede lagres som fil på serveren, eller om eksporten bare skjer i nettleseren. GP5 trenger en opplasting av den ferdige filen.
- Rettigheter for global versjonering: hvem kan publisere en ny versjon (eier/redaktør i gruppen).
- Sletting og arkivering av en global ressurs som er i bruk: den arkiveres, og prosjektene beholder filreferansen (§16).
