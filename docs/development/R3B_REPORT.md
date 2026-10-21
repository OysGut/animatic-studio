# Oppgave 3b – rapport (21.10.2026)

## 1. Krav som bare er prøvd med mock
Status er uendret («Verifisert») på alle. Hvert krav fikk merknad i `notes` og en historikkpost (decision `3b`).

Merknad «Verifisert med mock, prøving med ekte nøkkel gjenstår»:
- Bestilt: REQ-0623, REQ-0625, REQ-0626, REQ-0627, REQ-0628 (KI-193), REQ-0633 (KI-204).
- Funnet i gjennomgangen: REQ-0203 (lyd, falsk ElevenLabs), REQ-0263 (segmentkontinuitet, falsk Google), REQ-0270 (egne API-kontoer, falske svar), REQ-0489 (modellagnostisk AI, falskt nettverk), REQ-0566 (egne AI-tjenester, KI-153), REQ-0590 (egne leverandører, kostnadstak ikke prøvd mot ekte tjeneste), REQ-0609 (norsk tale), REQ-0643 og REQ-0649 (AI-video, KI-204), REQ-0698 (ord-til-lyd-analyse), REQ-0725 (tekst-AI med egne nøkler).

Merknad «Verifisert med falsk mikrofon, prøving med ekte opptak og utstyr gjenstår»: REQ-0583.

Ikke merket: krav der mocken tester vår egen logikk (kø, kostnadsport, M8-profiler, P5-linjekobling, CA4–CA8), og REQ-0559/0565/0589, som bruker den innebygde AI-tjenesten som Mars prøvde 13.10.2026.
KI-193 og KI-204 er fortsatt åpne, med henvisning til merkingen.

## 2. Migrasjon 0070 – delingsnøkkelen lagres som hash
Fil: `db/migrations/0070_film_share_digest.sql`. Den er bare additiv og er ikke kjørt i Cloud.
- Ny tabell `private.film_share_secret`: én tilfeldig pepper på 32 byte. Ingen rolle har tilgang til den.
- Ny kolonne `film_shares.token_digest`: kan være tom, er unik og lagrer SHA-256(pepper ‖ nøkkel).
- Nye delinger: nøkkelen avledes fra pepperen og delings-ID-en. `token` forblir tom, og `token_hash` og `token_digest` får den peprede hashen. QR-koden kan vises igjen uten at nøkkelen er lagret.
- Eldre lenker virker fortsatt. Oppslaget faller tilbake til den gamle hashen og fyller `token_digest` ved første oppslag. Claude kan også fylle alle på én gang med `select private.film_share_backfill_digests();`.
- Klartekstkolonnen `token` er ikke fjernet, bare merket DEPRECATED. Den beholdes for eldre delinger, slik at QR-koden deres fortsatt kan vises. Ingen nye klartekstnøkler skrives.
- Serverfunksjonen `resolveFilmShare` slår opp via `film_share_lookup`, som bare service role kan kjøre. Nøkkelen logges ingen steder.

**Funksjoner som erstattes:** `public.activate_film_share(uuid,bigint)` og `public.film_share_token(uuid)`, begge fra 0047.
**Nye funksjoner:** `public.film_share_lookup(text)`, `private.film_share_digest(text)`, `private.film_share_derived_token(uuid)` og `private.film_share_backfill_digests()`.
**Uendret:** de seks Cloud-hashene `apply_changes` 758c621f…, `create_project` 06854cbb…, `delete_project` f6d7b8a0…, `purge_project_assets` 9a54a67c…, `purge_removed_assets` 97580c29… og `global_set_version_withdrawn` 3d145d03… gjelder fortsatt. `revoke_film_share` er også uendret.
Ingen nye filstier, så referansesjekken for oppryddingen er uendret. Sikkerhetskopien tar ikke med delinger, som før. Skjemaversjon 70 (`EXPECTED_SCHEMA_VERSION`, `VISUAL_SCHEMA_VERSION`).

## 3. Story Lab-canvas i produksjonsbygget
Bygget ble laget med `vite build`. `vite preview` kan ikke starte bygget fordi Cloudflare-oppsettet ikke har noen `server.js`, så det ble kjørt med `wrangler dev`, i samme kjøretid som publiseringen bruker. Målt med 500-nodersscenariet i `storylab-canvas-ui`, tre kjøringer:
- Fra canvasflaten finnes til nodene er tegnet: **43 / 9 / 13 ms**. Alle 500 noder lastet.
- Hele siden lastet på nytt, til canvasflaten finnes: **3,4 s** første gang (kald start), deretter **1,7 / 1,9 s**.

Tallet er under 3 s, så det trengs ingen tiltak. Avvik: skrivescenariene i suiten (8 av 16) feiler mot produksjonsbygget. Den falske serveren kjenner serverfunksjonene på navnet, og navnene er bare lesbare i dev-serveren. Det gjelder bare testoppsettet.

## 4. Låste sider per dokument
- Importen lagrer `sourceRef.documentId`, som er SHA-256 av originalfilen (samme verdi som `imported_documents.sha256`). Den ligger i jsonb, så det trengs ingen migrasjon.
- `lockedPageMapper`: hvert dokument har sitt eget sidenummerrom. Dokumentene følger hverandre i importrekkefølgen (laveste blokk-ID). Manusvisning og eksport bruker den samme funksjonen.
- Reserve for gamle prosjekter: blokker uten dokument-ID regnes som ett dokument og får nøyaktig samme sider som før.
- Fire nye invariant-tester i `tests/invariants/stable-ids.test.ts`: to manus kolliderer ikke, et gammelt prosjekt er uendret, eldre blokker kan blandes med et nytt dokument, og ombytting eller deaktivering endrer ikke siden.

## Tester
- Full vitest: 2 035 bestått, 10 hoppet over, 0 feilet. To språktester feilet først fordi linjeregisteret var utdatert etter kodeendringene. Registeret ble generert på nytt (katalogen er uendret), og begge testene besto deretter.
- DB-testene lokalt: 146/146, inkludert den nye 0070-testen og den oppdaterte GP5-testen. Testdatabasen ble ryddet bort.
- `global-film-share` (filmdelingssuiten): nb 12/12 og en 12/12. Første kjøring på nb ga ett tidsavbrudd mens dev-serveren startet på nytt.
- `verifisering3-ui`: nb 73/73 og en 73/73. Testen leste oversikten før den var tegnet, og fikk derfor 11 feil på REQ-0405 når maskinen var under last. Den venter nå på oversikten. Én kjøring på nb hadde en tidsfeil i avspillingen (REQ-0101), som besto ved omkjøring.
- `build_docs.py` og `check_kb.py`: OK.
