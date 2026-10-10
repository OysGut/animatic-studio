

## DEC-0046 – Slette og forlate prosjekt; ressurser som zip; ressurser slettes i egen operasjon
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker
- **Mars' ord:** «på siden med listen over "Prosjekter" så må vi ha muligheten å "Slett prosjekt" - som bare eiere kan gjøre og "Forlat prosjekt" for de som er invitert inn. Dette med en seriøs popup som sier at dette ikke kan angres, assets skal allikevel kunne lastes ned som zip, per kategori eller samlet. disse må også kunne slettes, men det må gjøres i en egen operasjon, dette fordi det burde være mulig å gjøre assets "Gobale" slik at de kan brukes på tvers av prosjekter, dette gjelder alle ting.»
- **Beslutning:**
  1. **Slett prosjekt** (bare eiere): alvorlig vindu («Dette kan ikke angres»), liste over hva som slettes, antall andre som mister tilgangen, og prosjektnavnet må skrives inn. Manus, versjoner, scener, 2D-scener, lydklipp, notater, historikk, importerte manusfiler og importert film slettes; andre medlemmer mister tilgangen.
  2. **Ressursene (bilder og lyd) slettes ikke sammen med prosjektet.** De blir liggende hos eierne under «Ressurser fra slettede prosjekter» i prosjektlisten, med «Last ned …» og «Slett for godt …» (egen operasjon med egen bekreftelse).
  3. **Last ned som zip:** per kategori eller alt samlet – i vinduet før sletting, for slettede prosjekter og i ressursbiblioteket. Importert film er egen kategori.
  4. **Forlat prosjekt** for inviterte (alvorlig vindu). En eier kan bare forlate når det finnes en annen eier.
  5. **Globale ressurser** på tvers av prosjekter registreres som krav for senere (REQ-0571); det er grunnen til at ressursene slettes i egen operasjon.
- **Forhold til mandatet:** Mandatet sier at produsert materiale og historikk aldri slettes (INV-07, INV-13). Tolkning (meldt til Mars 2026-10-10): vernet gjelder i et prosjekt som er i bruk. Sletting av hele prosjektet er en bevisst handling fra eieren med sterk bekreftelse, og vernet slippes bare i den ene databasetransaksjonen som sletter prosjektet.
- **Teknisk:** Migrasjon `0011_project_delete_film.sql`:
  - `projects.deleted_at`
  - `public.delete_project` og `public.purge_project_assets`, kjørt med `service_role` fra serverfunksjonene i `project-admin.functions.ts` etter kontroll av eier og navn
  - `public.leave_project`
  - `member_role_rank` gir 0 for slettede prosjekter, så all skriving, opplasting og invitasjon avvises
  - filer i lagringen slettes bare innenfor prosjektets egen mappe
  
  Zip: `src/core/library/zip.ts`, `src/engine/export/zip.ts` (fflate), `src/app/library/AssetZip.tsx`. Krav: REQ-0567–0571.

## DEC-0047 – Montering del 3: importert ferdig film, «Bruk denne», overganger, replikk → avspillingshode
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker (Mars: «legger du bare til i neste commit sammen med det andre du har planlagt», etter forslaget i DEC-0045-leveransen)
- **Beslutning:**
  1. **Importer ferdig film** til en scene i monteringen (MP4, MOV, WebM, opptil 2 GB). Filen lagres uendret; lengde, oppløsning, bildefrekvens, kodek og om den har lyd leses ved import og lagres uforanderlig (INV-07). Filmen tas i bruk med én gang.
  2. **«Bruk denne»:** panelet viser versjonene av scenen (animatic og importerte filmer) og hvilken som er i bruk. Ingen versjon kastes; tidligere versjoner kan tas i bruk igjen.
  3. Importert film vises i filmvisningen og eksporteres. Lyden i filmen spilles med (følger sporet «Dialog» når spor dempes; filer over 400 MB spilles foreløpig uten lyd).
  4. **Overganger inn i en scene:** kutt, overtoning eller via svart, med lengde i sekunder. Overgangen ligger midt på klippet, og filmens lengde endres ikke (bildene holdes). Første scene kan tones inn fra svart.
  5. **Replikk → avspillingshode:** klikk på en blokk i monteringens manus flytter avspillingshodet dit. Replikker med koblet lydklipp bruker lydens tid; ellers fordeles teksten over scenens lengde. Blokken under avspillingshodet markeres.
- **Teknisk:**
  - `takes.metadata` og `scene_occurrences.transition_kind`/`transition_frames` (0011)
  - kommandoene `AddTake` (med `media`) og `SetTransition`
  - `frameMix`, `blockSpans`, `filmTakeAudio` i kjernen
  - `drawFilmFrame` blander bilder
  - eksporten dekoder filmen med mediabunny (`film-video.ts`)
  - avspillingen bruker videoelementer
  
  Krav: REQ-0003 (delvis), REQ-0097/0098, REQ-0219, REQ-0223, REQ-0232–0236, REQ-0238, REQ-0242, REQ-0317.
