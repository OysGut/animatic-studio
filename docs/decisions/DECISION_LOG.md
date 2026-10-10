

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

## DEC-0048 – Montering del 4: klipping, presise tidskoblinger, lang film over flere scener
- **Dato:** 2026-10-10 · **Type:** Bekreftet av bruker (Mars: «ok, kjør i gang med neste store ting!», etter anbefalt alternativ 1 «fullføre monteringen»)
- **Beslutning:**
  1. **Klippe i monteringen** (REQ-0220–0222): et klipp kan bestå av flere **deler**. Hver del har kilde (importert film eller animatic), inn- og utpunkt bildepresist (±1 bilde-knapper), og kan fjernes. **Splitt ved avspillingshodet** (tasten S). Trim i tidslinjen virker også for film og klippede scener. Kildemediet endres aldri; alt kan angres. «Hele klippet» fjerner kutt og splitting.
  2. **Animatic-rest** (REQ-0239): en scene kan settes sammen av film og animatic, f.eks. ferdig film for første halvdel og animatic for resten.
  3. **Presise tidskoblinger per replikk** (REQ-0093–0095, REQ-0107, REQ-0231): «Synk replikker» (tasten T) setter tiden for neste replikk der avspillingshodet står. Koblingene er relative til scenen og følger scenen når den flyttes. En kobling som ligger utenfor klippet (scenen er kuttet), markeres med bølget understrek.
  4. **Importer lang film** (REQ-0003, REQ-0235–0237): én filmfil fordeles på flere scener etter starttider (forslag etter scenenes lengde; justeres ved å spole og trykke på nålen). Filen lastes opp én gang; hver scene får filmen som egen versjon med sin del. Et nytt forsøk etter feil fortsetter der det stoppet.
  5. **Status for importert film** (REQ-0241): Godkjent / Utkast / Referanse / Avvist, kan endres og angres.
- **Teknisk:**
  - Migrasjon `0012_clip_parts_time_links.sql`: tabellene `clip_parts` og `time_links` (RLS: medlemmer leser, skriving bare via `apply_changes`), `apply_changes` med de nye tabellene og lås `for key share` på prosjektet (slettet prosjekt avvises), `delete_project`/`purge_project_assets` sletter også de nye tabellene, `schema_version` 12.
  - Kommandoene `SetSceneEdit` (erstatter delene samlet, revisjonen økes alltid), `SetTakeStatus`, `AddTimeLinks`, `UpdateTimeLinks`, `SetTimeLinksRemoved`. Angre av opprettelse stoppes når deler eller koblinger viser til det som ville forsvunnet.
  - Kjernen: `src/core/assembly/edit.ts`, `partAt`/`sourceAt`/`filmMediaPaths` i `film.ts`; lyd og eksport følger delene (én dekoder per fil).
  - Opprydding: `.inputValidator` → `.validator` i serverfunksjonene.
