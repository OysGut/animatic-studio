-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0093: G-2 skala (Claudes arkitekturrevisjon A1–A4).
-- Ny fil; 0092 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0092.
-- Endrer ingen data utenom tilbakefylling av den nye kolonnen change_log.project_seq.
-- apply_changes, delete_project og purge_* er UENDRET.
-- 1. A4: ny private.my_project_ids(); 73 SELECT-policyer skrives om fra private.is_project_member(project_id)
--    (per rad) til project_id in (select private.my_project_ids()) (én gang per spørring). Samme regel:
--    aktivt medlem (removed_at is null) av prosjektet. private.is_project_member beholdes (brukes i funksjoner).
-- 2. A3: indekser på project_id for 25 tabeller, på 93 fremmednøkler, og tre dupliserte indekser fjernes.
-- 3. A2: change_log.project_seq – sammenhengende teller per prosjekt (seq er global og har hull per prosjekt).
--    Tildeles av en trigger under en transaksjonslås per prosjekt, så rekkefølgen ved commit er lik tellerens.
-- 4. G-1-kontrollen private.guard_language_version_scope sjekker bare raden som er endret, ikke hele tabellene
--    (var O(n²) ved bulkinnsetting: 10 000 linjer tok 87 s lokalt).
-- 5. A1: ny public.project_snapshot(p_project, p_full_history) – kjernetabellene som ett JSON-øyeblikksbilde.
-- =====================================================================================

-- ---------- A4. RLS: medlemskapet regnes ut én gang per spørring ----------
create or replace function private.my_project_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.project_id from public.project_members m
  where m.user_id = (select auth.uid()) and m.removed_at is null
$$;
revoke all on function private.my_project_ids() from public, anon;
grant execute on function private.my_project_ids() to authenticated, service_role;

alter policy animation_patterns_read on public.animation_patterns using ((project_id in (select private.my_project_ids())));
alter policy animation_rig_versions_read on public.animation_rig_versions using ((project_id in (select private.my_project_ids())));
alter policy animation_rigs_read on public.animation_rigs using ((project_id in (select private.my_project_ids())));
alter policy animation_uses_read on public.animation_uses using ((project_id in (select private.my_project_ids())));
alter policy asset_relations_read on public.asset_relations using ((project_id in (select private.my_project_ids())));
alter policy asset_variants_read on public.asset_variants using ((project_id in (select private.my_project_ids())));
alter policy asset_versions_read on public.asset_versions using ((project_id in (select private.my_project_ids())));
alter policy assets_read on public.assets using ((project_id in (select private.my_project_ids())));
alter policy audio_clips_read on public.audio_clips using ((project_id in (select private.my_project_ids())));
alter policy change_log_read on public.change_log using ((project_id in (select private.my_project_ids())));
alter policy clip_parts_read on public.clip_parts using ((project_id in (select private.my_project_ids())));
alter policy composition_layers_read on public.composition_layers using ((project_id in (select private.my_project_ids())));
alter policy compositions_read on public.compositions using ((project_id in (select private.my_project_ids())));
alter policy continuity_events_read on public.continuity_events using ((project_id in (select private.my_project_ids())));
alter policy credit_participants_read on public.credit_participants using ((project_id in (select private.my_project_ids())));
alter policy credit_sequences_read on public.credit_sequences using ((project_id in (select private.my_project_ids())));
alter policy dialogue_batch_items_read on public.dialogue_batch_items using ((project_id in (select private.my_project_ids())));
alter policy dialogue_batches_read on public.dialogue_batches using ((project_id in (select private.my_project_ids())));
alter policy dialogue_reviews_read on public.dialogue_reviews using ((project_id in (select private.my_project_ids())));
alter policy dialogue_versions_read on public.dialogue_versions using ((project_id in (select private.my_project_ids())));
alter policy duration_estimates_read on public.duration_estimates using ((project_id in (select private.my_project_ids())));
alter policy export_records_read on public.export_records using ((project_id in (select private.my_project_ids())));
alter policy film_shares_read on public.film_shares using ((project_id in (select private.my_project_ids())));
alter policy generation_jobs_read on public.generation_jobs using ((project_id in (select private.my_project_ids())));
alter policy generation_prompts_read on public.generation_prompts using ((project_id in (select private.my_project_ids())));
alter policy harmonize_batch_items_read on public.harmonize_batch_items using ((project_id in (select private.my_project_ids())));
alter policy harmonize_batches_read on public.harmonize_batches using ((project_id in (select private.my_project_ids())));
alter policy imported_documents_read on public.imported_documents using ((project_id in (select private.my_project_ids())));
alter policy language_versions_read on public.language_versions using ((project_id in (select private.my_project_ids())));
alter policy lipsync_results_read on public.lipsync_results using ((project_id in (select private.my_project_ids())));
alter policy measure_sets_read on public.measure_sets using ((project_id in (select private.my_project_ids())));
alter policy mobile_imports_read on public.mobile_imports using ((project_id in (select private.my_project_ids())));
alter policy mouth_sets_read on public.mouth_sets using ((project_id in (select private.my_project_ids())));
alter policy mouth_tracks_read on public.mouth_tracks using ((project_id in (select private.my_project_ids())));
alter policy note_flags_read on public.note_flags using ((project_id in (select private.my_project_ids())));
alter policy posters_read on public.posters using ((project_id in (select private.my_project_ids())));
alter policy print_copies_read on public.print_copies using ((project_id in (select private.my_project_ids())));
alter policy print_job_elements_read on public.print_job_elements using ((project_id in (select private.my_project_ids())));
alter policy print_jobs_read on public.print_jobs using ((project_id in (select private.my_project_ids())));
alter policy production_segments_read on public.production_segments using ((project_id in (select private.my_project_ids())));
alter policy productions_read on public.productions using ((project_id in (select private.my_project_ids())));
alter policy project_members_read on public.project_members using ((project_id in (select private.my_project_ids())));
alter policy projects_read on public.projects using ((id in (select private.my_project_ids())));
alter policy quality_profiles_read on public.quality_profiles using ((project_id in (select private.my_project_ids())));
alter policy rig_setups_read on public.rig_setups using ((project_id in (select private.my_project_ids())));
alter policy rig_templates_read on public.rig_templates using ((project_id in (select private.my_project_ids())));
alter policy scene_occurrences_read on public.scene_occurrences using ((project_id in (select private.my_project_ids())));
alter policy scene_variants_read on public.scene_variants using ((project_id in (select private.my_project_ids())));
alter policy scenes_read on public.scenes using ((project_id in (select private.my_project_ids())));
alter policy script_annotations_read on public.script_annotations using ((project_id in (select private.my_project_ids())));
alter policy script_block_revisions_read on public.script_block_revisions using ((project_id in (select private.my_project_ids())));
alter policy script_blocks_read on public.script_blocks using ((project_id in (select private.my_project_ids())));
alter policy script_entity_analysis_read on public.script_entity_analysis using ((project_id in (select private.my_project_ids())));
alter policy script_versions_read on public.script_versions using ((project_id in (select private.my_project_ids())));
alter policy storage_cleanups_read on public.storage_cleanups using ((project_id in (select private.my_project_ids())));
alter policy story_canvas_edges_read on public.story_canvas_edges using ((project_id in (select private.my_project_ids())));
alter policy story_canvas_nodes_read on public.story_canvas_nodes using ((project_id in (select private.my_project_ids())));
alter policy story_facts_read on public.story_facts using ((project_id in (select private.my_project_ids())));
alter policy story_profile_stages_read on public.story_profile_stages using ((project_id in (select private.my_project_ids())));
alter policy story_profiles_read on public.story_profiles using ((project_id in (select private.my_project_ids())));
alter policy story_sessions_read on public.story_sessions using ((project_id in (select private.my_project_ids())));
alter policy story_suggestions_read on public.story_suggestions using ((project_id in (select private.my_project_ids())));
alter policy style_harmonizations_read on public.style_harmonizations using ((project_id in (select private.my_project_ids())));
alter policy style_preferred_references_read on public.style_preferred_references using ((project_id in (select private.my_project_ids())));
alter policy style_profiles_read on public.style_profiles using ((project_id in (select private.my_project_ids())));
alter policy takes_read on public.takes using ((project_id in (select private.my_project_ids())));
alter policy template_instances_read on public.template_instances using ((project_id in (select private.my_project_ids())));
alter policy time_links_read on public.time_links using ((project_id in (select private.my_project_ids())));
alter policy translation_line_links_read on public.translation_line_links using ((project_id in (select private.my_project_ids())));
alter policy translation_lines_read on public.translation_lines using ((project_id in (select private.my_project_ids())));
alter policy translations_read on public.translations using ((project_id in (select private.my_project_ids())));
alter policy upload_sessions_read on public.upload_sessions using ((project_id in (select private.my_project_ids())));
alter policy user_bookmarks_own on public.user_bookmarks using (((user_id = (select auth.uid())) AND (project_id in (select private.my_project_ids()))));

-- ---------- A3. Indekser på project_id (keyset-lesing: project_id, id) ----------
create index if not exists g2_animation_patterns_project_idx on public.animation_patterns (project_id, id);
create index if not exists g2_animation_rig_versions_project_idx on public.animation_rig_versions (project_id, id);
create index if not exists g2_animation_rigs_project_idx on public.animation_rigs (project_id, id);
create index if not exists g2_animation_uses_project_idx on public.animation_uses (project_id, id);
create index if not exists g2_asset_variants_project_idx on public.asset_variants (project_id, id);
create index if not exists g2_asset_versions_project_idx on public.asset_versions (project_id, id);
create index if not exists g2_dialogue_batch_items_project_idx on public.dialogue_batch_items (project_id, id);
create index if not exists g2_harmonize_batch_items_project_idx on public.harmonize_batch_items (project_id, id);
create index if not exists g2_lipsync_results_project_idx on public.lipsync_results (project_id, id);
create index if not exists g2_production_segments_project_idx on public.production_segments (project_id, id);
create index if not exists g2_project_invitations_project_idx on public.project_invitations (project_id, id);
create index if not exists g2_publication_media_project_idx on public.publication_media (project_id, id);
create index if not exists g2_publication_recipients_project_idx on public.publication_recipients (project_id, id);
create index if not exists g2_review_comments_project_idx on public.review_comments (project_id, id);
create index if not exists g2_scene_occurrences_project_idx on public.scene_occurrences (project_id, id);
create index if not exists g2_scene_variants_project_idx on public.scene_variants (project_id, id);
create index if not exists g2_scenes_project_idx on public.scenes (project_id, id);
create index if not exists g2_script_annotations_project_idx on public.script_annotations (project_id, id);
create index if not exists g2_script_block_revisions_project_idx on public.script_block_revisions (project_id, block_id, rev);
create index if not exists g2_script_blocks_project_idx on public.script_blocks (project_id, id);
create index if not exists g2_script_versions_project_idx on public.script_versions (project_id, id);
create index if not exists g2_showcase_items_project_idx on public.showcase_items (project_id, id);
create index if not exists g2_showcase_reservations_project_idx on public.showcase_reservations (project_id, id);
create index if not exists g2_takes_project_idx on public.takes (project_id, id);
create index if not exists g2_user_bookmarks_project_idx on public.user_bookmarks (project_id);

-- ---------- A3. Indekser på fremmednøkler (oppslag, sletting og purge) ----------
-- Hoppet over (66): revisjons- og auditkolonner mot auth.users (*_by, actor, author). De brukes aldri i oppslag,
-- og bare sletting av en auth-bruker sjekker dem; det skjer sjelden og koster mer i indeksvedlikehold enn det sparer.
create index if not exists g2_productions_parent_production_id_idx on public.productions (parent_production_id);
create index if not exists g2_scenes_derived_from_scene_id_idx on public.scenes (derived_from_scene_id);
create index if not exists g2_scenes_merged_into_scene_id_idx on public.scenes (merged_into_scene_id);
create index if not exists g2_scenes_origin_production_id_idx on public.scenes (origin_production_id);
create index if not exists g2_scenes_story_anchor_scene_id_idx on public.scenes (story_anchor_scene_id);
create index if not exists g2_scene_variants_based_on_variant_id_idx on public.scene_variants (based_on_variant_id);
create index if not exists g2_scene_variants_owner_production_id_idx on public.scene_variants (owner_production_id);
create index if not exists g2_scene_variants_scene_id_idx on public.scene_variants (scene_id);
create index if not exists g2_scene_occurrences_active_take_id_idx on public.scene_occurrences (active_take_id);
create index if not exists g2_scene_occurrences_scene_id_idx on public.scene_occurrences (scene_id);
create index if not exists g2_scene_occurrences_variant_id_idx on public.scene_occurrences (variant_id);
create index if not exists g2_production_segments_end_block_id_idx on public.production_segments (end_block_id);
create index if not exists g2_production_segments_occurrence_id_idx on public.production_segments (occurrence_id);
create index if not exists g2_production_segments_start_block_id_idx on public.production_segments (start_block_id);
create index if not exists g2_takes_occurrence_id_idx on public.takes (occurrence_id);
create index if not exists g2_takes_segment_id_idx on public.takes (segment_id);
create index if not exists g2_imported_documents_production_id_idx on public.imported_documents (production_id);
create index if not exists g2_script_versions_parent_version_id_idx on public.script_versions (parent_version_id);
create index if not exists g2_asset_variants_approved_version_id_idx on public.asset_variants (approved_version_id);
create index if not exists g2_composition_layers_asset_variant_id_idx on public.composition_layers (asset_variant_id);
create index if not exists g2_composition_layers_version_id_idx on public.composition_layers (version_id);
create index if not exists g2_audio_clips_active_version_id_idx on public.audio_clips (active_version_id);
create index if not exists g2_audio_clips_asset_variant_id_idx on public.audio_clips (asset_variant_id);
create index if not exists g2_audio_clips_block_id_idx on public.audio_clips (block_id);
create index if not exists g2_audio_clips_character_asset_id_idx on public.audio_clips (character_asset_id);
create index if not exists g2_audio_clips_version_id_idx on public.audio_clips (version_id);
create index if not exists g2_generation_jobs_asset_id_idx on public.generation_jobs (asset_id);
create index if not exists g2_generation_jobs_occurrence_id_idx on public.generation_jobs (occurrence_id);
create index if not exists g2_generation_jobs_provider_key_id_idx on public.generation_jobs (provider_key_id);
create index if not exists g2_generation_jobs_segment_id_idx on public.generation_jobs (segment_id);
create index if not exists g2_clip_parts_take_id_idx on public.clip_parts (take_id);
create index if not exists g2_generation_prompts_segment_id_idx on public.generation_prompts (segment_id);
create index if not exists g2_continuity_events_block_id_idx on public.continuity_events (block_id);
create index if not exists g2_continuity_events_from_variant_id_idx on public.continuity_events (from_variant_id);
create index if not exists g2_continuity_events_to_variant_id_idx on public.continuity_events (to_variant_id);
create index if not exists g2_continuity_events_until_scene_id_idx on public.continuity_events (until_scene_id);
create index if not exists g2_privacy_acceptances_version_idx on public.privacy_acceptances (version);
create index if not exists g2_upload_sessions_parent_id_idx on public.upload_sessions (parent_id);
create index if not exists g2_story_profiles_asset_id_idx on public.story_profiles (asset_id);
create index if not exists g2_story_profile_stages_from_scene_id_idx on public.story_profile_stages (from_scene_id);
create index if not exists g2_story_facts_at_scene_id_idx on public.story_facts (at_scene_id);
create index if not exists g2_story_sessions_parent_session_id_idx on public.story_sessions (parent_session_id);
create index if not exists g2_story_canvas_nodes_asset_id_idx on public.story_canvas_nodes (asset_id);
create index if not exists g2_story_canvas_nodes_scene_id_idx on public.story_canvas_nodes (scene_id);
create index if not exists g2_script_entity_analysis_scene_id_idx on public.script_entity_analysis (scene_id);
create index if not exists g2_global_asset_variants_workspace_id_idx on public.global_asset_variants (workspace_id);
create index if not exists g2_global_asset_versions_workspace_id_idx on public.global_asset_versions (workspace_id);
create index if not exists g2_film_shares_production_id_idx on public.film_shares (production_id);
create index if not exists g2_template_instances_template_asset_id_idx on public.template_instances (template_asset_id);
create index if not exists g2_credit_participants_image_asset_id_idx on public.credit_participants (image_asset_id);
create index if not exists g2_credit_participants_image_version_id_idx on public.credit_participants (image_version_id);
create index if not exists g2_credit_participants_logo_asset_id_idx on public.credit_participants (logo_asset_id);
create index if not exists g2_credit_participants_logo_version_id_idx on public.credit_participants (logo_version_id);
create index if not exists g2_animation_rigs_current_version_id_idx on public.animation_rigs (current_version_id);
create index if not exists g2_animation_rig_versions_source_version_id_idx on public.animation_rig_versions (source_version_id);
create index if not exists g2_animation_uses_occurrence_id_idx on public.animation_uses (occurrence_id);
create index if not exists g2_animation_uses_rig_version_id_idx on public.animation_uses (rig_version_id);
create index if not exists g2_lipsync_results_block_id_idx on public.lipsync_results (block_id);
create index if not exists g2_lipsync_results_dialogue_version_id_idx on public.lipsync_results (dialogue_version_id);
create index if not exists g2_lipsync_results_take_id_idx on public.lipsync_results (take_id);
create index if not exists g2_animation_patterns_rig_id_idx on public.animation_patterns (rig_id);
create index if not exists g2_global_animation_specs_workspace_id_idx on public.global_animation_specs (workspace_id);
create index if not exists g2_dialogue_versions_asset_id_idx on public.dialogue_versions (asset_id);
create index if not exists g2_dialogue_versions_asset_variant_id_idx on public.dialogue_versions (asset_variant_id);
create index if not exists g2_dialogue_versions_asset_version_id_idx on public.dialogue_versions (asset_version_id);
create index if not exists g2_dialogue_versions_composition_id_idx on public.dialogue_versions (composition_id);
create index if not exists g2_dialogue_versions_parent_version_id_idx on public.dialogue_versions (parent_version_id);
create index if not exists g2_dialogue_reviews_block_id_idx on public.dialogue_reviews (block_id);
create index if not exists g2_translation_lines_variant_id_idx on public.translation_lines (variant_id);
create index if not exists g2_translation_line_links_variant_id_idx on public.translation_line_links (variant_id);
create index if not exists g2_style_harmonizations_reference_version_id_idx on public.style_harmonizations (reference_version_id);
create index if not exists g2_style_harmonizations_source_version_id_idx on public.style_harmonizations (source_version_id);
create index if not exists g2_style_harmonizations_style_profile_id_idx on public.style_harmonizations (style_profile_id);
create index if not exists g2_style_harmonizations_version_id_idx on public.style_harmonizations (version_id);
create index if not exists g2_style_preferred_references_asset_id_idx on public.style_preferred_references (asset_id);
create index if not exists g2_style_preferred_references_style_profile_id_idx on public.style_preferred_references (style_profile_id);
create index if not exists g2_style_preferred_references_variant_id_idx on public.style_preferred_references (variant_id);
create index if not exists g2_harmonize_batches_reference_version_id_idx on public.harmonize_batches (reference_version_id);
create index if not exists g2_harmonize_batches_style_profile_id_idx on public.harmonize_batches (style_profile_id);
create index if not exists g2_rig_setups_scene_id_idx on public.rig_setups (scene_id);
create index if not exists g2_print_job_elements_layer_id_idx on public.print_job_elements (layer_id);
create index if not exists g2_print_job_elements_scene_id_idx on public.print_job_elements (scene_id);
create index if not exists g2_print_job_elements_version_id_idx on public.print_job_elements (version_id);
create index if not exists g2_review_comments_parent_id_idx on public.review_comments (parent_id);
create index if not exists g2_mouth_sets_character_id_idx on public.mouth_sets (character_id);
create index if not exists g2_mouth_tracks_block_id_idx on public.mouth_tracks (block_id);
create index if not exists g2_mouth_tracks_character_id_idx on public.mouth_tracks (character_id);
create index if not exists g2_mouth_tracks_clip_id_idx on public.mouth_tracks (clip_id);
create index if not exists g2_mouth_tracks_occurrence_id_idx on public.mouth_tracks (occurrence_id);
create index if not exists g2_mouth_tracks_set_id_idx on public.mouth_tracks (set_id);
create index if not exists g2_global_version_reservations_committed_version_id_idx on public.global_version_reservations (committed_version_id);
create index if not exists g2_global_version_reservations_global_asset_id_idx on public.global_version_reservations (global_asset_id);
create index if not exists g2_global_version_reservations_variant_id_idx on public.global_version_reservations (variant_id);

-- ---------- A3. Dupliserte indekser (samme kolonner som en unik indeks/constraint) ----------
drop index if exists public.script_blocks_variant_idx;        -- = script_blocks_variant_order_unique (variant_id, order_key)
drop index if exists public.scene_occurrences_production_idx; -- = scene_occurrences_order_unique (production_id, order_key)
drop index if exists public.script_versions_production_idx;   -- = script_versions_number_unique (production_id, number); baklengs skanning gir desc

-- ---------- A2. change_log.project_seq: sammenhengende rekkefølge per prosjekt ----------
alter table public.change_log add column if not exists project_seq bigint;

create or replace function private.assign_project_seq() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Låsen holdes til commit: neste endring i samme prosjekt får nummer først når denne er lagret,
  -- så en klient aldri ser n+1 uten n (andre prosjekter påvirkes ikke).
  perform pg_advisory_xact_lock(hashtextextended('change_log:' || new.project_id::text, 0));
  select coalesce(max(c.project_seq), 0) + 1 into new.project_seq
    from public.change_log c where c.project_id = new.project_id;
  return new;
end $$;
revoke all on function private.assign_project_seq() from public;
create trigger change_log_project_seq before insert on public.change_log
  for each row execute function private.assign_project_seq();

-- Tilbakefylling (bare den nye kolonnen; historikken ellers urørt)
alter table public.change_log disable trigger change_log_immutable;
update public.change_log c set project_seq = n.rn
  from (select id, row_number() over (partition by project_id order by seq) rn from public.change_log) n
  where n.id = c.id and c.project_seq is null;
alter table public.change_log enable trigger change_log_immutable;
create unique index if not exists change_log_project_seq_unique on public.change_log (project_id, project_seq);

-- ---------- G-1-kontroll (0090) uten tabellskanning ----------
-- Samme regel som før: en rad med language_version_id må peke på en språkversjon i samme prosjekt og med samme
-- språk. Sjekken leser raden slik den er ved commit (ikke NEW fra hendelsen), så flere endringer i samme
-- transaksjon vurderes på sluttilstanden, som før.
create or replace function private.guard_language_version_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bad boolean := false;
begin
  if tg_table_name = 'language_versions' then
    select exists (
      select 1 from public.language_versions v
      join (
        select project_id, language from public.translations where language_version_id = new.id
        union all select project_id, language from public.translation_lines where language_version_id = new.id
        union all select project_id, language from public.translation_line_links where language_version_id = new.id
      ) c on true
      where v.id = new.id and (v.project_id <> c.project_id or lower(v.language) <> lower(c.language))
    ) into v_bad;
  elsif tg_table_name = 'translations' then
    select exists (select 1 from public.translations c left join public.language_versions v on v.id = c.language_version_id
      where c.id = new.id and c.language_version_id is not null
        and (v.id is null or v.project_id <> c.project_id or lower(v.language) <> lower(c.language))) into v_bad;
  elsif tg_table_name = 'translation_lines' then
    select exists (select 1 from public.translation_lines c left join public.language_versions v on v.id = c.language_version_id
      where c.id = new.id and c.language_version_id is not null
        and (v.id is null or v.project_id <> c.project_id or lower(v.language) <> lower(c.language))) into v_bad;
  elsif tg_table_name = 'translation_line_links' then
    select exists (select 1 from public.translation_line_links c left join public.language_versions v on v.id = c.language_version_id
      where c.id = new.id and c.language_version_id is not null
        and (v.id is null or v.project_id <> c.project_id or lower(v.language) <> lower(c.language))) into v_bad;
  end if;
  if v_bad then raise exception 'Invalid language version scope' using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function private.guard_language_version_scope() from public;


-- ---------- A1. Øyeblikksbilde av prosjektet i ett kall ----------
create or replace function public.project_snapshot(p_project uuid, p_full_history boolean default false) returns json
language sql stable security invoker set search_path = '' as $$
  -- Én spørring = ett konsistent øyeblikksbilde (samme MVCC-snapshot for alle tabeller og log_seq).
  -- SECURITY INVOKER: RLS avgjør hva kalleren ser; en som ikke er medlem, får project = null og tomme lister.
  select json_build_object(
    'format', 1,
    'project', (select row_to_json(p) from public.projects p where p.id = p_project),
    'log_seq', (select coalesce(max(c.project_seq), 0) from public.change_log c where c.project_id = p_project),
    'history', case when p_full_history then 'full' else 'current' end,
    'tables', json_build_array(json_build_object(
    'productions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.productions x where x.project_id = p_project),
    'scenes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scenes x where x.project_id = p_project),
    'scene_variants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scene_variants x where x.project_id = p_project),
    'script_blocks', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.script_blocks x where x.project_id = p_project),
    'script_block_revisions', case when p_full_history then (select coalesce(json_agg(x order by x.block_id, x.rev), '[]'::json) from public.script_block_revisions x where x.project_id = p_project)
      else (select coalesce(json_agg(x order by x.block_id, x.rev), '[]'::json) from public.script_block_revisions x
            join public.script_blocks b on b.id = x.block_id and b.current_rev = x.rev where x.project_id = p_project) end,
    'scene_occurrences', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.scene_occurrences x where x.project_id = p_project),
    'production_segments', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.production_segments x where x.project_id = p_project),
    'takes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.takes x where x.project_id = p_project),
    'assets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.assets x where x.project_id = p_project),
    'asset_variants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_variants x where x.project_id = p_project),
    'asset_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_versions x where x.project_id = p_project),
    'script_annotations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.script_annotations x where x.project_id = p_project),
    'compositions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.compositions x where x.project_id = p_project),
    'composition_layers', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.composition_layers x where x.project_id = p_project),
    'audio_clips', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.audio_clips x where x.project_id = p_project),
    'clip_parts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.clip_parts x where x.project_id = p_project),
    'time_links', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.time_links x where x.project_id = p_project),
    'generation_prompts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.generation_prompts x where x.project_id = p_project),
    'continuity_events', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.continuity_events x where x.project_id = p_project),
    'translations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translations x where x.project_id = p_project),
    'asset_relations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.asset_relations x where x.project_id = p_project),
    'posters', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.posters x where x.project_id = p_project),
    'style_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_profiles x where x.project_id = p_project),
    'story_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_profiles x where x.project_id = p_project),
    'story_profile_stages', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_profile_stages x where x.project_id = p_project),
    'story_facts', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_facts x where x.project_id = p_project),
    'story_canvas_nodes', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_canvas_nodes x where x.project_id = p_project),
    'story_canvas_edges', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.story_canvas_edges x where x.project_id = p_project),
    'template_instances', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.template_instances x where x.project_id = p_project),
    'credit_participants', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.credit_participants x where x.project_id = p_project),
    'credit_sequences', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.credit_sequences x where x.project_id = p_project),
    'animation_rigs', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_rigs x where x.project_id = p_project),
    'animation_rig_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_rig_versions x where x.project_id = p_project),
    'animation_uses', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_uses x where x.project_id = p_project),
    'lipsync_results', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.lipsync_results x where x.project_id = p_project),
    'animation_patterns', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.animation_patterns x where x.project_id = p_project),
    'dialogue_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.dialogue_versions x where x.project_id = p_project),
    'dialogue_reviews', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.dialogue_reviews x where x.project_id = p_project),
    'note_flags', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.note_flags x where x.project_id = p_project),
    'quality_profiles', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.quality_profiles x where x.project_id = p_project)),
  json_build_object(
    'translation_line_links', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translation_line_links x where x.project_id = p_project),
    'translation_lines', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.translation_lines x where x.project_id = p_project),
    'style_harmonizations', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_harmonizations x where x.project_id = p_project),
    'style_preferred_references', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.style_preferred_references x where x.project_id = p_project),
    'language_versions', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.language_versions x where x.project_id = p_project),
    'rig_templates', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.rig_templates x where x.project_id = p_project),
    'rig_setups', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.rig_setups x where x.project_id = p_project),
    'measure_sets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.measure_sets x where x.project_id = p_project),
    'print_jobs', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.print_jobs x where x.project_id = p_project),
    'print_job_elements', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.print_job_elements x where x.project_id = p_project),
    'mouth_sets', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.mouth_sets x where x.project_id = p_project),
    'mouth_tracks', (select coalesce(json_agg(x order by x.id), '[]'::json) from public.mouth_tracks x where x.project_id = p_project)))
  )
$$;
revoke all on function public.project_snapshot(uuid, boolean) from public, anon;
grant execute on function public.project_snapshot(uuid, boolean) to authenticated, service_role;

insert into public.schema_version (version, description)
  values (93, '0093_g2_scale: indekser, RLS via my_project_ids, project_seq i change_log, settbaserte språkkontroller, project_snapshot');
