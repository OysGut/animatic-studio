# G-2 SKALA – rapport

Dato: 2026-10-23. Grunnlag: Claudes arkitekturrevisjon A1–A4. Ikke publisert. Migrasjon **0093** er skrevet, men ikke kjørt i Cloud (Claude kjører den).

## Resultat

| Kontroll | Resultat |
|---|---|
| Typekontroll (tsc) | 0 feil |
| Full vitest | 2 780 bestått, 0 feilet, 10 hoppet over (som før) |
| DB-tester (lokal Postgres, alle migrasjoner til og med 0093) | 189 bestått, 0 feilet (6 nye for G-2) |
| i18n-sjekk | grønn (ingen nye tekster i grensesnittet) |
| Betalte kall | ingen |

## Målinger før og etter (lokal Postgres 16, `tests/db/g2-scale-bench.ts`)

Syntetisk prosjekt: 50 000 blokker, 50 000 revisjoner, 2 000 scener (varianter, forekomster, komposisjoner), 10 000 lag. I tillegg 39 andre prosjekter, så RLS må skille. Alle lesinger kjøres som innlogget medlem (RLS på), og JSON lages i databasen slik PostgREST gjør. Før = migrasjonene til og med 0092, etter = med 0093.

| Måling | Før (0092) | Etter (0093) |
|---|---|---|
| Åpne prosjektet, gammel metode (OFFSET, 1 000 per side, alle 52 tabeller) | **38 645 ms** | 2 731 ms (bare nye indekser og RLS) |
| Åpne med keyset (id > siste id), uten historikk | 1 478 ms | **632 ms** |
| Åpne med `project_snapshot` (ett kall, gjeldende revisjon) | – | **934 ms** (48 MB JSON før gzip) |
| `project_snapshot` med full historikk | – | 878 ms |
| RLS: tell alle blokker brukeren ser | 392 ms | **16 ms** |
| 10 000 oversettelseslinjer i én transaksjon (g1-kontrollene) | **87 031 ms** | **397 ms** |
| 10 000 blokker i én setning, med g1-trigger | 337 ms | 279 ms |
| 10 000 blokker i én setning, uten g1-trigger | 220 ms | 206 ms |

Med 150 000 revisjoner (tre per blokk): gammel metode 7 954 ms etter 0093, keyset uten historikk 497 ms, øyeblikksbilde med bare gjeldende revisjon 755 ms mot 922 ms med full historikk. Øyeblikksbildet har like mange revisjonsrader som blokker, uansett hvor lang historikken er.

Tallene er databasetid lokalt. I nettleseren kommer nettverk i tillegg. Der sparer ett kall rundt 120 rundturer for et stort prosjekt (52 tabeller, sidevis).

## A3 – indekser

- **25 tabeller med project_id uten indeks** fikk `(project_id, id)`. Unntak: `script_block_revisions` fikk `(project_id, block_id, rev)` (rekkefølgen historikken leses i). `user_bookmarks` har ingen id-kolonne og fikk `(project_id)`.
- **184 fremmednøkler uten indeks:** 25 av dem er `project_id` (dekket over). 93 fikk egen indeks. Det er alle som brukes ved oppslag, ved sletting av en forelder (FK-sjekk), i `delete_project` og i `purge_*`.
- **66 er hoppet over med vilje.** Det er revisjons- og auditkolonner mot `auth.users` (`created_by` 52, `invited_by` 4, `accepted_by` 2, `actor`, `author`, `added_by`, `changed_by`, `deleted_by`, `published_by`, `revoked_by`, `updated_by`). De brukes aldri i oppslag. Bare sletting av en auth-bruker sjekker dem, og det skjer svært sjelden. En indeks ville koste ved hver innsetting, også i store importer.
- **Tre dupliserte indekser fjernet:** `script_blocks_variant_idx` (lik `script_blocks_variant_order_unique`), `scene_occurrences_production_idx` (lik `scene_occurrences_order_unique`) og `script_versions_production_idx` (lik `script_versions_number_unique`; en baklengs skanning gir samme rekkefølge som `desc`). Ingen kode viser til navnene.

## A4 – RLS

- Ny `private.my_project_ids()` (security definer, stable) gir prosjektene der brukeren er aktivt medlem (`removed_at is null`). Den kjøres én gang per spørring.
- **Alle 73 policyer som brukte `private.is_project_member(...)`** er skrevet om med `alter policy`. Alle er lesepolicyer; skriving går som før bare via RPC. `project_id in (select private.my_project_ids())`, for `projects` med `id`. `user_bookmarks_own` fikk i tillegg `(select auth.uid())` i stedet for `auth.uid()` per rad.
- Rollene, `to authenticated` og kommandoen er uendret, fordi `alter policy` bare bytter uttrykket. `private.is_project_member` beholdes, siden den brukes i funksjoner.
- **DB-tester:**
  - På alle berørte tabeller: ikke-medlem 0, aktivt medlem (eier og leser) alle, fjernet medlem 0.
  - Ny og gammel regel gir samme antall rader for fire brukere på alle tabeller og alle prosjekter i testdatabasen.
  - Ingen policy bruker lenger `is_project_member`.

## A1 – innlasting

- `loadProjectRows` leser med keyset: `id > siste id`, ordnet på id. For historikken brukes `(block_id, rev)` med `or`. OFFSET brukes ikke lenger. Serveren (`loadProjectState`) bruker fortsatt full sidevis lesing, nå med keyset.
  - **Valg:** serveren kjører i en Worker med begrenset minne. Ett JSON-svar på 48 MB i tillegg til de ferdige radene kunne gått over grensen.
- **Ny RPC `public.project_snapshot(p_project, p_full_history default false)`:** én SQL-spørring, så alle tabellene og `log_seq` er fra samme øyeblikk.
  - **Valg: SECURITY INVOKER.** RLS avgjør alt. Et ikke-medlem får `project = null` og tomme lister, så det trengs ingen egen tilgangssjekk som kan gå i utakt med policyene. `anon` har ikke kjørerett.
  - JSON lages med `json_agg`/`row_to_json` (raskere enn jsonb for store svar). Tabellene kommer i to grupper (`json_build_object` tar maks 100 argumenter), og klienten slår dem sammen.
  - Komprimering: svaret sendes gzip-komprimert av API-et når nettleseren ber om det. Det er ingen egen komprimering i databasen.
- **Reserve:** mangler funksjonen (0093 ikke kjørt), eller feiler kallet (for eksempel tidsavbrudd), brukes sidevis lesing med keyset. `log_seq` leses før og etter. Er de like, er posisjonen sikker. Ellers prøves det opptil tre ganger, og så settes posisjonen til «ukjent». Da gir en endring fra andre full innlasting, som før.
- **Historikken:** nettleseren åpner prosjektet med bare gjeldende revisjon per blokk (`history: 'current'`, flagget `blockHistory: 'current'` i tilstanden). Full historikk hentes i bakgrunnen rett etter åpning og flettes inn (`mergeBlockHistory`, uten duplikater, lokale revisjoner beholdes).
  - **Valg:** historikken hentes rett etter åpning, ikke først når den vises. Avviksvisningen («hva er endret siden»), forfremming og kopiering av varianter trenger gamle revisjoner, og ventet vi til historikken vises, ville de gitt feil svar en stund.
  - Åpningen venter ikke på historikken. Kommer det endringer fra andre mens den hentes, hentes den én gang til.
  - INV-13-kontrollen sjekker fortsatt at siste revisjon stemmer med blokken. Rekken 1..n sjekkes bare når hele historikken er lastet. Serveren har alltid full historikk, så ingenting lagres annerledes.

## A2 – synkronisering

- **Ny kolonne `change_log.project_seq`:** sammenhengende teller per prosjekt. Den globale `seq` har hull per prosjekt, så hull i den kan ikke oppdages.
  - Telleren tildeles av en BEFORE INSERT-trigger under `pg_advisory_xact_lock` per prosjekt. Låsen holdes til commit, så nummer n+1 kan aldri bli synlig før n.
  - Bare samme prosjekt venter. Låsen tas helt til slutt i `apply_changes` (innsettingen i loggen), så ventetiden er kort.
  - Gamle rader er fylt ut (`row_number` etter `seq`). Uforanderlighetstriggeren er slått av bare under denne ene oppdateringen. Kolonnen har unik indeks `(project_id, project_seq)`.
- **Klienten:** `src/core/sync/remote-log.ts` (ren) og `src/app/project/remote-sync.ts`.
  - Et sanntidsvarsel legges i en buffer. Radene brukes med `applyCommand` på lokal tilstand i rekkefølge etter `project_seq`, med loggradens id, aktør og tid. Det skjer ingen `invalidateQueries` lenger.
  - **Hull eller rad uten kommando** (for stort sanntidsvarsel): bare radene etter siste kjente nummer hentes (maks 500). Etter tre forsøk uten å tette hullet blir det full innlasting.
  - **Ukjent kommando eller kommando kjernen avviser:** full innlasting.
  - All full innlasting logges med grunn (`[sync] full innlasting: …`).
  - **Egne kommandoer** (`ownCommandIds`) hoppes over, som før.
  - **K-1 uendret:** andres endringer brukes ikke mens egne endringer venter på lagring (`commandQueue`), akkurat som innlastingen før ble utsatt. Angrevernet (`foreignChangeListeners`) varsles straks varselet kommer, som før. Revisjonskonflikter ved lagring gir samme valg som før, og etter en feil lastes prosjektet på nytt som før.
- Alle som leser prosjekttilstanden, bruker samme henting (`projectStateQueryFn`), så loggposisjonen alltid hører til tilstanden: prosjektsidene, mobilimport, KI-jobber og entitetsanalyse.
- **Tester** (`tests/unit/g2-remote-sync.test.ts`, to klienter med falsk sanntid):
  - 100 raske endringer fra A gir identisk tilstand hos B uten full innlasting, også når varslene kommer i feil rekkefølge.
  - Hull (10 varsler borte og ett uten kommando) tettes med henting, uten full innlasting.
  - Ukjent kommando gir én logget full innlasting.
  - Hull som ikke kan tettes, gir full innlasting etter tre forsøk.
  - Egne kommandoer hoppes over, og ingenting brukes midt i egen lagring.
- **Kjent begrensning:** tidsstempler som en kommando skriver i nye rader (`createdAt`), får loggradens tid hos B, ikke serverens tid. De kan avvike med noen millisekunder fra databasen til neste fulle innlasting. Revisjoner og innhold er identiske.

## G-1-triggerne (0090)

- **`guard_language_version_scope`** (utsatt constraint-trigger på `language_versions`, `translations`, `translation_lines` og `translation_line_links`) var flaskehalsen. Hver rad skannet alle tre tabellene, så arbeidet vokste med kvadratet av antall rader: 10 000 linjer tok 87 s.
  - Den er nå skrevet om til å sjekke bare raden som er endret, via indeksene på `language_version_id`, mot raden slik den er ved commit. Samme regel og samme feilmelding. 0090-testene for versjonsomfang er grønne.
  - **Valg:** sjekken er beholdt per rad, ikke gjort om til statement-nivå med overgangstabeller. Constraint-triggere kan bare være per rad i Postgres, og sjekken må være utsatt for at grupperte skrivinger skal virke. Med oppslag per rad er kostnaden lineær: 397 ms for 10 000 rader.
- **`guard_project_language_child`** (BEFORE-trigger per rad på `script_blocks` og fire andre tabeller) koster 60–120 ms per 10 000 blokker, rundt 30 %. Den er ingen flaskehals og er beholdt. Den setter `NEW.language`, og det kan bare en radtrigger gjøre. En statement-trigger måtte skrevet hver rad på nytt etterpå og blitt dyrere.

## Alt 0093 oppretter, erstatter eller fjerner

**Funksjoner**
- Ny: `private.my_project_ids()`, `private.assign_project_seq()` (trigger) og `public.project_snapshot(uuid, boolean)`.
- Erstattet: `private.guard_language_version_scope()`.
- Uendret: `apply_changes`, `delete_project`, `purge_*` og `is_project_member`.

**Triggere og kolonner**
- Ny trigger `change_log_project_seq` (BEFORE INSERT på `change_log`).
- Ny kolonne `change_log.project_seq` med tilbakefylling.
- `schema_version` er 93.

**Policyer (endret med `alter policy`, 73):** animation_patterns_read (animation_patterns), animation_rig_versions_read (animation_rig_versions), animation_rigs_read (animation_rigs), animation_uses_read (animation_uses), asset_relations_read (asset_relations), asset_variants_read (asset_variants), asset_versions_read (asset_versions), assets_read (assets), audio_clips_read (audio_clips), change_log_read (change_log), clip_parts_read (clip_parts), composition_layers_read (composition_layers), compositions_read (compositions), continuity_events_read (continuity_events), credit_participants_read (credit_participants), credit_sequences_read (credit_sequences), dialogue_batch_items_read (dialogue_batch_items), dialogue_batches_read (dialogue_batches), dialogue_reviews_read (dialogue_reviews), dialogue_versions_read (dialogue_versions), duration_estimates_read (duration_estimates), export_records_read (export_records), film_shares_read (film_shares), generation_jobs_read (generation_jobs), generation_prompts_read (generation_prompts), harmonize_batch_items_read (harmonize_batch_items), harmonize_batches_read (harmonize_batches), imported_documents_read (imported_documents), language_versions_read (language_versions), lipsync_results_read (lipsync_results), measure_sets_read (measure_sets), mobile_imports_read (mobile_imports), mouth_sets_read (mouth_sets), mouth_tracks_read (mouth_tracks), note_flags_read (note_flags), posters_read (posters), print_copies_read (print_copies), print_job_elements_read (print_job_elements), print_jobs_read (print_jobs), production_segments_read (production_segments), productions_read (productions), project_members_read (project_members), projects_read (projects), quality_profiles_read (quality_profiles), rig_setups_read (rig_setups), rig_templates_read (rig_templates), scene_occurrences_read (scene_occurrences), scene_variants_read (scene_variants), scenes_read (scenes), script_annotations_read (script_annotations), script_block_revisions_read (script_block_revisions), script_blocks_read (script_blocks), script_entity_analysis_read (script_entity_analysis), script_versions_read (script_versions), storage_cleanups_read (storage_cleanups), story_canvas_edges_read (story_canvas_edges), story_canvas_nodes_read (story_canvas_nodes), story_facts_read (story_facts), story_profile_stages_read (story_profile_stages), story_profiles_read (story_profiles), story_sessions_read (story_sessions), story_suggestions_read (story_suggestions), style_harmonizations_read (style_harmonizations), style_preferred_references_read (style_preferred_references), style_profiles_read (style_profiles), takes_read (takes), template_instances_read (template_instances), time_links_read (time_links), translation_line_links_read (translation_line_links), translation_lines_read (translation_lines), translations_read (translations), upload_sessions_read (upload_sessions), user_bookmarks_own (user_bookmarks)

**Indekser opprettet (119)**

`change_log_project_seq_unique` – change_log (project_id, project_seq), unik.

På project_id (25):
- g2_animation_patterns_project_idx – animation_patterns (project_id, id)
- g2_animation_rig_versions_project_idx – animation_rig_versions (project_id, id)
- g2_animation_rigs_project_idx – animation_rigs (project_id, id)
- g2_animation_uses_project_idx – animation_uses (project_id, id)
- g2_asset_variants_project_idx – asset_variants (project_id, id)
- g2_asset_versions_project_idx – asset_versions (project_id, id)
- g2_dialogue_batch_items_project_idx – dialogue_batch_items (project_id, id)
- g2_harmonize_batch_items_project_idx – harmonize_batch_items (project_id, id)
- g2_lipsync_results_project_idx – lipsync_results (project_id, id)
- g2_production_segments_project_idx – production_segments (project_id, id)
- g2_project_invitations_project_idx – project_invitations (project_id, id)
- g2_publication_media_project_idx – publication_media (project_id, id)
- g2_publication_recipients_project_idx – publication_recipients (project_id, id)
- g2_review_comments_project_idx – review_comments (project_id, id)
- g2_scene_occurrences_project_idx – scene_occurrences (project_id, id)
- g2_scene_variants_project_idx – scene_variants (project_id, id)
- g2_scenes_project_idx – scenes (project_id, id)
- g2_script_annotations_project_idx – script_annotations (project_id, id)
- g2_script_block_revisions_project_idx – script_block_revisions (project_id, block_id, rev)
- g2_script_blocks_project_idx – script_blocks (project_id, id)
- g2_script_versions_project_idx – script_versions (project_id, id)
- g2_showcase_items_project_idx – showcase_items (project_id, id)
- g2_showcase_reservations_project_idx – showcase_reservations (project_id, id)
- g2_takes_project_idx – takes (project_id, id)
- g2_user_bookmarks_project_idx – user_bookmarks (project_id)

På fremmednøkler (93):
- g2_productions_parent_production_id_idx – productions (parent_production_id)
- g2_scenes_derived_from_scene_id_idx – scenes (derived_from_scene_id)
- g2_scenes_merged_into_scene_id_idx – scenes (merged_into_scene_id)
- g2_scenes_origin_production_id_idx – scenes (origin_production_id)
- g2_scenes_story_anchor_scene_id_idx – scenes (story_anchor_scene_id)
- g2_scene_variants_based_on_variant_id_idx – scene_variants (based_on_variant_id)
- g2_scene_variants_owner_production_id_idx – scene_variants (owner_production_id)
- g2_scene_variants_scene_id_idx – scene_variants (scene_id)
- g2_scene_occurrences_active_take_id_idx – scene_occurrences (active_take_id)
- g2_scene_occurrences_scene_id_idx – scene_occurrences (scene_id)
- g2_scene_occurrences_variant_id_idx – scene_occurrences (variant_id)
- g2_production_segments_end_block_id_idx – production_segments (end_block_id)
- g2_production_segments_occurrence_id_idx – production_segments (occurrence_id)
- g2_production_segments_start_block_id_idx – production_segments (start_block_id)
- g2_takes_occurrence_id_idx – takes (occurrence_id)
- g2_takes_segment_id_idx – takes (segment_id)
- g2_imported_documents_production_id_idx – imported_documents (production_id)
- g2_script_versions_parent_version_id_idx – script_versions (parent_version_id)
- g2_asset_variants_approved_version_id_idx – asset_variants (approved_version_id)
- g2_composition_layers_asset_variant_id_idx – composition_layers (asset_variant_id)
- g2_composition_layers_version_id_idx – composition_layers (version_id)
- g2_audio_clips_active_version_id_idx – audio_clips (active_version_id)
- g2_audio_clips_asset_variant_id_idx – audio_clips (asset_variant_id)
- g2_audio_clips_block_id_idx – audio_clips (block_id)
- g2_audio_clips_character_asset_id_idx – audio_clips (character_asset_id)
- g2_audio_clips_version_id_idx – audio_clips (version_id)
- g2_generation_jobs_asset_id_idx – generation_jobs (asset_id)
- g2_generation_jobs_occurrence_id_idx – generation_jobs (occurrence_id)
- g2_generation_jobs_provider_key_id_idx – generation_jobs (provider_key_id)
- g2_generation_jobs_segment_id_idx – generation_jobs (segment_id)
- g2_clip_parts_take_id_idx – clip_parts (take_id)
- g2_generation_prompts_segment_id_idx – generation_prompts (segment_id)
- g2_continuity_events_block_id_idx – continuity_events (block_id)
- g2_continuity_events_from_variant_id_idx – continuity_events (from_variant_id)
- g2_continuity_events_to_variant_id_idx – continuity_events (to_variant_id)
- g2_continuity_events_until_scene_id_idx – continuity_events (until_scene_id)
- g2_privacy_acceptances_version_idx – privacy_acceptances (version)
- g2_upload_sessions_parent_id_idx – upload_sessions (parent_id)
- g2_story_profiles_asset_id_idx – story_profiles (asset_id)
- g2_story_profile_stages_from_scene_id_idx – story_profile_stages (from_scene_id)
- g2_story_facts_at_scene_id_idx – story_facts (at_scene_id)
- g2_story_sessions_parent_session_id_idx – story_sessions (parent_session_id)
- g2_story_canvas_nodes_asset_id_idx – story_canvas_nodes (asset_id)
- g2_story_canvas_nodes_scene_id_idx – story_canvas_nodes (scene_id)
- g2_script_entity_analysis_scene_id_idx – script_entity_analysis (scene_id)
- g2_global_asset_variants_workspace_id_idx – global_asset_variants (workspace_id)
- g2_global_asset_versions_workspace_id_idx – global_asset_versions (workspace_id)
- g2_film_shares_production_id_idx – film_shares (production_id)
- g2_template_instances_template_asset_id_idx – template_instances (template_asset_id)
- g2_credit_participants_image_asset_id_idx – credit_participants (image_asset_id)
- g2_credit_participants_image_version_id_idx – credit_participants (image_version_id)
- g2_credit_participants_logo_asset_id_idx – credit_participants (logo_asset_id)
- g2_credit_participants_logo_version_id_idx – credit_participants (logo_version_id)
- g2_animation_rigs_current_version_id_idx – animation_rigs (current_version_id)
- g2_animation_rig_versions_source_version_id_idx – animation_rig_versions (source_version_id)
- g2_animation_uses_occurrence_id_idx – animation_uses (occurrence_id)
- g2_animation_uses_rig_version_id_idx – animation_uses (rig_version_id)
- g2_lipsync_results_block_id_idx – lipsync_results (block_id)
- g2_lipsync_results_dialogue_version_id_idx – lipsync_results (dialogue_version_id)
- g2_lipsync_results_take_id_idx – lipsync_results (take_id)
- g2_animation_patterns_rig_id_idx – animation_patterns (rig_id)
- g2_global_animation_specs_workspace_id_idx – global_animation_specs (workspace_id)
- g2_dialogue_versions_asset_id_idx – dialogue_versions (asset_id)
- g2_dialogue_versions_asset_variant_id_idx – dialogue_versions (asset_variant_id)
- g2_dialogue_versions_asset_version_id_idx – dialogue_versions (asset_version_id)
- g2_dialogue_versions_composition_id_idx – dialogue_versions (composition_id)
- g2_dialogue_versions_parent_version_id_idx – dialogue_versions (parent_version_id)
- g2_dialogue_reviews_block_id_idx – dialogue_reviews (block_id)
- g2_translation_lines_variant_id_idx – translation_lines (variant_id)
- g2_translation_line_links_variant_id_idx – translation_line_links (variant_id)
- g2_style_harmonizations_reference_version_id_idx – style_harmonizations (reference_version_id)
- g2_style_harmonizations_source_version_id_idx – style_harmonizations (source_version_id)
- g2_style_harmonizations_style_profile_id_idx – style_harmonizations (style_profile_id)
- g2_style_harmonizations_version_id_idx – style_harmonizations (version_id)
- g2_style_preferred_references_asset_id_idx – style_preferred_references (asset_id)
- g2_style_preferred_references_style_profile_id_idx – style_preferred_references (style_profile_id)
- g2_style_preferred_references_variant_id_idx – style_preferred_references (variant_id)
- g2_harmonize_batches_reference_version_id_idx – harmonize_batches (reference_version_id)
- g2_harmonize_batches_style_profile_id_idx – harmonize_batches (style_profile_id)
- g2_rig_setups_scene_id_idx – rig_setups (scene_id)
- g2_print_job_elements_layer_id_idx – print_job_elements (layer_id)
- g2_print_job_elements_scene_id_idx – print_job_elements (scene_id)
- g2_print_job_elements_version_id_idx – print_job_elements (version_id)
- g2_review_comments_parent_id_idx – review_comments (parent_id)
- g2_mouth_sets_character_id_idx – mouth_sets (character_id)
- g2_mouth_tracks_block_id_idx – mouth_tracks (block_id)
- g2_mouth_tracks_character_id_idx – mouth_tracks (character_id)
- g2_mouth_tracks_clip_id_idx – mouth_tracks (clip_id)
- g2_mouth_tracks_occurrence_id_idx – mouth_tracks (occurrence_id)
- g2_mouth_tracks_set_id_idx – mouth_tracks (set_id)
- g2_global_version_reservations_committed_version_id_idx – global_version_reservations (committed_version_id)
- g2_global_version_reservations_global_asset_id_idx – global_version_reservations (global_asset_id)
- g2_global_version_reservations_variant_id_idx – global_version_reservations (variant_id)

**Fremmednøkler uten indeks med vilje (66):** created_by.projects deleted_by.projects invited_by.project_members accepted_by.project_invitations invited_by.project_invitations created_by.productions created_by.scenes created_by.scene_variants created_by.script_blocks author.script_block_revisions created_by.scene_occurrences created_by.production_segments created_by.takes actor.change_log created_by.imported_documents created_by.script_versions created_by.assets created_by.asset_variants created_by.asset_versions created_by.script_annotations created_by.compositions created_by.composition_layers created_by.audio_clips created_by.clip_parts created_by.time_links created_by.generation_prompts created_by.continuity_events created_by.translations created_by.asset_relations created_by.posters created_by.style_profiles created_by.duration_estimates created_by.export_records added_by.app_admins changed_by.account_status published_by.privacy_policy updated_by.ai_model_settings created_by.ai_provider_requests created_by.upload_sessions created_by.story_profiles created_by.story_profile_stages created_by.story_facts created_by.story_sessions created_by.story_suggestions created_by.story_canvas_nodes created_by.story_canvas_edges created_by.script_entity_analysis created_by.workspaces invited_by.workspace_members accepted_by.workspace_invitations invited_by.workspace_invitations created_by.global_assets created_by.global_asset_variants created_by.global_asset_versions created_by.film_shares revoked_by.film_shares created_by.template_instances created_by.credit_participants created_by.credit_sequences created_by.animation_rigs created_by.animation_rig_versions created_by.animation_uses created_by.lipsync_results created_by.animation_patterns created_by.global_animation_specs created_by.global_rig_templates

**Indekser fjernet (3):** `script_blocks_variant_idx`, `scene_occurrences_production_idx` og `script_versions_production_idx`.

## Endrede filer

- **Ny:** `db/migrations/0093_g2_scale.sql`
- `src/adapters/storage/project-rows.ts` (keyset, øyeblikksbilde, logghenting, `EXPECTED_SCHEMA_VERSION` 93)
- `src/adapters/browser/project-data.ts`
- **Ny:** `src/core/sync/remote-log.ts`
- `src/core/index.ts`, `src/core/model.ts` (`blockHistory`), `src/core/patch.ts` (`history_partial`) og `src/core/invariants.ts`
- **Ny:** `src/app/project/remote-sync.ts`
- `src/app/project/use-project.ts`, `src/app/mobile/use-mobile-imports.ts`, `src/app/ai/video-jobs.ts` og `src/app/library/use-entity-analysis.ts`
- `tests/db/run-db-tests.ts` (6 nye tester) og **ny:** `tests/db/g2-scale-bench.ts` (måling, ikke i CI)
- **Nye:** `tests/unit/g2-remote-sync.test.ts` og `tests/unit/g2-keyset.test.ts`
- `tests/unit/r1r2-prores-cleanup.test.ts`: den falske klienten støtter nå `limit`/`gt` (keyset) i stedet for `range`. Samme kontroller.
- `scripts/i18n/references.v1.json`, `candidates.v1.json` og `inventory-report.json` (regenerert, bare linjenumre)
- `AGENTS.md` (regel 70; reglene 23, 31 og 69 kortet ned for å holde størrelsen)
- `TODO.md` og `roadmap.md`
