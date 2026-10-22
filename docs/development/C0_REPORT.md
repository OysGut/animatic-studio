# C0_REPORT – Grunnmur for Community bak funksjonsbrytere (B-114)

Status: bygget og verifisert lokalt. Migrasjon 0080 er **ikke kjørt i Cloud**. Claude kjører den etter kontroll.
Alle fem bryterne starter som **av**, så vanlige brukere ser ingenting.

## Hva som er bygget
- **Funksjonsbrytere:** tabellene `features` og `feature_testers`, `private.feature_enabled(key, user)`, RPC-ene `my_features()`, `admin_list_features()`, `admin_set_feature`, `admin_set_feature_testers` og `admin_find_users` (de tre siste bare for administrator). Nøklene er `community.sharing`, `community.review`, `community.abtest`, `community.profiles` og `community.public`. Alle starter som `off`. `beta` gir tilgang bare til testerne, og `on` gir tilgang til alle innloggede.
- **Adminsiden:** seksjonen «Funksjoner» (`src/app/admin/FeaturesAdmin.tsx`) har av/beta/på per bryter. I beta får du en testerliste med søk på e-post blant eksisterende brukere.
- **`useFeature(key)`** (`src/app/community/use-feature.ts`): standardverdien er av, også mens svaret lastes og ved feil. Kroken brukes bare til å skjule ting. Håndhevingen skjer i RLS og RPC-ene.
- **Publiseringer:** tabellene `publications`, `publication_recipients` og `publication_media`, med scope, publikum, rettigheter, tidsrom og status. Media kan bare ligge under `<prosjekt>/shares/`. RPC-er for create/update/revoke, mottakere og medier (bare redaktør). Utenfor bryteren avvises all deling, og ingen rader er synlige, heller ikke for redaktøren. Oppslaget for mottakere er serverfunksjonen `getPublicationForMe` (`src/adapters/community/publication.functions.ts`). Den gir signerte lenker som varer i 600 sekunder, og bare for filer under `shares/`.
- **Tidskodede kommentarer:** `review_comments` med tråd (svaret må høre til samme publisering), frame, tid og region (0–1) og kategori. RPC-ene er add/edit/remove. En mottaker med kommentarrett kan kommentere uten å være redaktør. Kommentarer krever `community.review`. Rettigheter, synlighet og blokkering sjekkes på nytt ved hver redigering.
- **Profiler:** feltene `handle`, `bio`, `avatar_key`, `is_public` (standard privat) og `profile_fields`. De kan ikke leses direkte; tilgangen til kolonnene fra 0073 er uendret. `public_profile(handle)` gir bare offentlige felt, og bare når `community.profiles` er tilgjengelig og profilen er offentlig.
- **Ressursrettigheter:** `asset_versions.rights` er nullable (kilde, lisens, kreditering, deling og bearbeiding) og valideres med CHECK. Null betyr privat og forbeholdt. Feltet er koblet inn i modellen og i patch-mappingen, så vanlige oppdateringer sletter det ikke. Backup tar det med via modellen. Det vises bare i ressursdetaljen bak `community.sharing`.
- **Moderering:** `content_reports` og `user_blocks`, RPC-ene report, block og unblock, og admin-køen `admin_report_queue` og `admin_handle_report` bak `community.review`. En blokkering skjuler publiseringen for den blokkerte, begge veier.
- **Sletting:** `delete_project` er erstattet (kopiert ordrett fra 0079). Kommentarer, medier, mottakere og publiseringer slettes før prosjektet, og mediefilene returneres for sletting på serveren. `purge_project_assets` og `purge_removed_assets` er ikke endret: de sletter bare ressursfiler, og publiseringsradene er allerede borte etter `delete_project`. `publication_media` er lagt til i `ORPHAN_REFERENCE_TABLES` (regel 36).

## Migrasjon 0080 (`db/migrations/0080_community_foundation.sql`)
Additiv fra 0079. Alle nye tabeller har RLS og eksplisitte GRANT. Klienten kan ikke skrive direkte, og anon har ingen tabelltilgang. Erstattet funksjon: `public.delete_project`. Skjemaversjonen er 80 (`EXPECTED_SCHEMA_VERSION` og `VISUAL_SCHEMA_VERSION` = 80).

## Tester
- DB: **156/156** (ny test «0080 (B-114 C0)»). Den dekker tilgang, brytere av/beta/på, testere, utløp, tilbaketrekking, kommentarrett, privat profil, blokkering, rapportkø, rettighets-CHECK og delete_project.
- Unit: `tests/unit/community-c0.test.ts` 17/17.
- Full Vitest: **2265 bestått, 10 hoppet over, 0 feilet**. `tsc --noEmit` er grønn. i18n-kontrollen er grønn for alle språk.
- Visuell: `tests/visual/community-c0.mjs` **30/30** (nb og en: vanlig bruker ser ingenting, admin styrer brytere og testere).

## Unntak i en eksisterende test
0058-testen forbyr anon-kjøring av security definer-funksjoner. `public_profile` er lagt til som unntak ved siden av `registration_status`, fordi oppdraget krever offentlig lesing av profiler. Funksjonen gir bare offentlige felt og bare når bryteren og profilen er offentlige.

## Maskinoversatte tekster
26 nye nøkler `b114.*` (admin, tilstander, funksjonsnavn og rettigheter). nb og en er skrevet for hånd. fr, es, ru, ja, pt-BR, de, it og ko er maskinoversatt og merket `review: machine`.
