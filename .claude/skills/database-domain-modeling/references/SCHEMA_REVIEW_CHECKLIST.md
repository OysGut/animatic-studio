# Sjekkliste for skjemagjennomgang

Gå gjennom før hver migrasjon committes. Skriv «OK/ikke relevant/avvik + begrunnelse» per punkt i PR-/commit-beskrivelsen eller `CURRENT_WORK.md`.

## A. Fil og levering
- [ ] Ny fil `db/migrations/NNNN_navn.sql` (neste løpenummer); ingen tidligere migrasjon er endret; ingenting i `drizzle/`.
- [ ] Toppkommentar med formål, krav-ID-er, invarianter, skjemaversjon.
- [ ] Versjonsvakt i starten og `insert into public.schema_version` til slutt.
- [ ] `EXPECTED_SCHEMA_VERSION` i `src/adapters/storage/project-rows.ts` er økt.
- [ ] Synkmelding til Mars er klar (LOVABLE_SYNC.md).

## B. Domene og identitet
- [ ] Tabellen svarer til en entitet i `DOMAIN_MODEL.md`; navn engelske, snake_case.
- [ ] `id uuid primary key`, `project_id not null` + FK, `created_at`, `created_by`, `revision` (hvis redigerbar), `archived_at` (hvis arkiverbar).
- [ ] Ingen unik nøkkel, FK, URL-del eller oppslag basert på scenenummer eller navn (INV-02, REQ-0036, REQ-0038).
- [ ] Skille scene / sceneforekomst / scenevariant er bevart (REQ-0039). **Ingen** `UNIQUE(production_id, scene_id)` på forekomster – samme scene kan forekomme flere ganger i én produksjon (DEC-0020 pkt. 10).
- [ ] Én rekkefølgekilde: `scene_occurrences.order_key` (`collate "C"`); ingen egen rekkefølge i `assemblies`/`assembly_items` (INV-01).
- [ ] «Aktiv versjon» er peker (`active_take_id`), ikke status (DEC-0015).
- [ ] Produksjonsspesifikke overstyringer (`owner_production_id`, `production_id` null = delt/hovedfilm, `continuity_overrides`) er riktig håndhevet (INV-04, DEC-0020 pkt. 8). `active_take_id` kan peke på hovedfilmens take i spinoff (DEC-0020 pkt. 7). `scenes.merged_into` hindrer gjenaktivering uten `UnmergeScene` (pkt. 9).
- [ ] Segmenter (`production_segments`) har ingen kolonne som endrer manusstruktur eller nummer (INV-10).
- [ ] Tid i heltall bilder; bildefrekvens som `fps_num`/`fps_den` (ADR-0006).

## C. Historikk og ikke-destruktivitet
- [ ] Ingen `on delete cascade`; ingen `delete`-vei for produksjonsdata (INV-14, REQ-0316, REQ-0505).
- [ ] Versjonstabeller har uforanderlighetstrigger (INV-07, INV-13), også `script_block_revisions` (DEC-0020 pkt. 5); `script_blocks.current_rev` peker på siste `rev`, og `revision` brukes bare til samtidighetskontroll.
- [ ] Endringer skjer via `runCommand` → `public.apply_changes`, som skriver `change_log` med `inverse` (ADR-0005, DEC-0022).
- [ ] Ressursversjon byttes aldri automatisk i scener (INV-13).

## D. Tilgang
- [ ] `enable row level security` på alle nye tabeller.
- [ ] Lese-policy `to authenticated` med `private.is_project_member(project_id)`.
- [ ] Ingen skrivepolicy for prosjektdata (skriving bare via `runCommand` → `public.apply_changes`); `revoke insert, update, delete, truncate` fra `anon, authenticated` og `grant select` til `authenticated` (DEC-0022).
- [ ] Skrivbar tabell er lagt til i `v_tables` i `public.apply_changes` (ny migrasjon) og i `TABLE_ORDER` i `src/core/patch.ts`, i FK-rekkefølge. `apply_changes`: `security definer`, `set search_path = ''`, rolle ≥ editor for `p_actor`, rader må tilhøre `p_project`, revisjon per rad (`P0409`); `execute` bare til `service_role`. Ingen SQL-funksjon per kommando.
- [ ] Nye klient-RPC-er (som `create_project`, `create_invitation`, `accept_invitation`) er få, begrunnet, sjekker `auth.uid()` og rolle, og har `execute` bare til `authenticated`.
- [ ] Kostnadsrelaterte kommandoer sjekker `private.can_approve_costs` og budsjetter (INV-12, INV-C3, REQ-0528; regler i `API_INTEGRATIONS.md` §2).
- [ ] Storage-sti og bøtter som i `DATA_RELATIONSHIPS.md` «Lagringsstruktur»; policy følger prosjekt-ID i stien; ingen overskriving; ingen sletting i `sources/`.
- [ ] Ingen hemmeligheter eller API-nøkler i tabeller (bare referanser, REQ-0413).

## E. Ytelse
- [ ] Indeks på `project_id`, alle FK-kolonner og policy-kolonner.
- [ ] `(production_id, order_key)` for aktivt manus/filmmontering.
- [ ] `(select auth.uid())` i policyer og funksjoner.
- [ ] Spørringene i DATA_RELATIONSHIPS «Viktige spørringer» er sjekket med `explain` på testdata (150 scener, 120 sider).

## F. Tester
- [ ] Rollematrise i `tests/db/run-db-tests.ts` utvidet med den nye tabellen/funksjonen (INV-C2).
- [ ] Revisjonskonflikt-test (`P0409`) for nye skrivbare tabeller (INV-C1).
- [ ] Tilbakerulling ved feil midt i `apply_changes`.
- [ ] Statiske skjemasjekker (ingen `cascade`, ingen nummer-FK) består.
