# Datarelasjoner – Animatic Studio

Status: Teknisk anbefaling. Utkast til databaseskjema (Postgres/Lovable Cloud) som realiserer `DOMAIN_MODEL.md`. Første migrasjon skrives i fase 1 (`supabase/migrations/`). Navn er engelske.

## Felles regler
- Alle tabeller: `id uuid primary key` (UUID v7 generert i klient eller med funksjon), `project_id uuid not null references projects`, `created_at`, `created_by uuid references auth.users`, `revision int not null default 1`.
- RLS aktivert på alle tabeller; lese = `private.is_project_member(project_id)`. Skriving bare via `public.apply_command(...)` (`security definer`) som kaller `private.cmd_*`; `insert/update/delete` tilbakekalt for `authenticated` (DEC-0020).
- Ingen `on delete cascade` på produksjonsdata. Sletting av prosjekt er en egen, eksplisitt og bekreftet eieroperasjon.
- Ingen fremmednøkkel eller unik nøkkel inneholder scenenummer (INV-02).
- Uforanderlige tabeller (bare insert): `screenplay_versions`, `resource_versions`, `takes` (filpekere), `change_log`, `imported_documents`, `export_versions`, `generation_prompts` (versjonert).

## Tabeller og relasjoner

```
projects 1─* project_members (role, can_approve_costs, invited_by, joined_at, removed_at) *─1 auth.users
projects 1─* project_invitations
projects 1─* productions (kind, parent_production_id → productions)
projects 1─* scenes (story_order, story_kind, derived_from → scenes, origin_production_id → productions)
scenes   1─* scene_variants (owner_production_id → productions NULL=delt, based_on_variant_id → scene_variants)
scene_variants 1─* script_blocks (kind, order_key, current_rev, language='nb', source_ref)
script_blocks 1─* script_block_revisions (rev, text, author, created_at)            -- DEC-0020 pkt. 5
scenes.merged_into → scenes (DEC-0020 pkt. 9)
script_blocks 1─0..1 dialogue_lines (character_id → resources)
dialogue_lines 1─* line_translations (language, text, status, confidence)
productions 1─* scene_occurrences (scene_id, variant_id, order_key, active, excerpt_in, excerpt_out,
                                   active_take_id → takes (kan eies av annen produksjon, DEC-0020 pkt. 7), production_numbering)
                                   -- ingen UNIQUE(production_id, scene_id): samme scene kan forekomme flere ganger (DEC-0020 pkt. 10)
scene_occurrences 1─* production_segments (reason, start_block_id, end_block_id, start_frame, end_frame, order_key)
scene_occurrences|production_segments 1─* takes (kind, status, composition_id, media_asset_id,
                                   generation_job_id, produced_from jsonb, duration_frames)
productions 1─* screenplay_versions (language, previous_version_id, snapshot jsonb, created_by)
productions 1─* assemblies (language) 1─* assembly_items (occurrence_id|segment_id, track, trim_in, trim_out, transition)
projects 1─* resources (kind, name) 1─* resource_versions (storage_key, sha256, meta, approved_by)
resources 1─* resource_aliases (text, language, kind)
resources(character) 1─* appearance_states, character_variants (appearance_state_id, style_profile_id, resource_version_id, status)
resources(character) 1─* continuity_events (scene_id, block_id, frame, story_order, from_state, to_state, production_id NULL=hovedfilm, status)
productions 1─* continuity_overrides (event_id, action disable|replace, replacement_event_id)   -- DEC-0020 pkt. 8
compositions (occurrence_id|segment_id) 1─* layers, cameras, keyframes   (lagres som jsonb-dokument med revision i MVP)
time_links (block_id|dialogue_line_id, owner_kind, owner_id, start_frame, end_frame)
media_assets (storage_key, sha256, kind, duration_frames, fps_num, fps_den, width, height, audio_tracks jsonb)
imported_documents (storage_key, sha256, format, page_count, imported_as_version_id)
generation_jobs (target_kind, target_id, provider, model, params jsonb, quality_profile, estimate, cost_approval jsonb,
                 actual_cost, status, attempts, error, result_take_id)
generation_prompts (job_id, auto_text, override_text, verbatim_dialogue jsonb, system_instruction, based_on jsonb)
budgets (scope_kind, scope_id, limit_amount, currency)
discrepancies (target_kind, target_id, cause, blocks jsonb, certainty, resolution, resolved_by, resolved_at)
render_jobs (kind, input jsonb, status, progress, worker_id, output_storage_key, error)   -- medietjeneste (ADR-0008)
change_log (production_id, command_type, payload jsonb, inverse jsonb, affected_ids uuid[], base_revisions jsonb, author, created_at)
export_versions (kind, production_id, language, numbering_method, numbering_table jsonb, include_inactive, storage_key)
posters (production_id, kind, layout jsonb, language) 1─* poster_versions
schema_version (version, description, applied_at)   -- UI sjekker at forventet skjemaversjon er kjørt (Lovable-synk)
```

## Viktige spørringer (må være raske)
- Aktivt manus for produksjon P, språk L: `scene_occurrences where production_id=P and active order by order_key` → variant → blokker (+ oversettelser for L).
- Filmmontering for P: samme liste → aktive takes → assembly_items for trim/overganger. **Ingen egen rekkefølge.**
- Gjeldende utseende for karakter C i scene S: `continuity_events where character_id=C and (production_id is null or production_id=P) and story_order <= S.story_order order by story_order desc limit 1` (+ hendelser innen scenen per blokk/bilde).
- Berørt materiale ved endring av blokk B: `takes where produced_from->blockRevisions ? B` + `time_links` for presis flagging (21.3).

## Lagringsstruktur (mandat 28.4)
Storage-bøtter (private): `sources/` (originalmanus og importert film, uforanderlig), `resources/`, `generated/`, `renders-tmp/` (kan ryddes), `exports/`, `backups/`. Sti (kanonisk, DEC-0020 pkt. 4): `<bucket>/<project_id>/<entity_id>/<sha256>.<ext>`. Policy: bare prosjektmedlemmer; signerte URL-er med kort levetid.
