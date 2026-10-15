-- =====================================================================================
-- Animatic Studio – migrasjon 0032: instrukser til AI-video av en scene (DEC-0083).
-- Mars 15.10.2026: en knapp i sceneeditoren sender 2D-scenen til AI-generering. Videoen bygges fra filmens
-- stil, figurenes beskrivelser og scenens egne instrukser; bare bildet erstattes, lyden beholdes.
-- scene_occurrences.video_instructions: scenens instrukser (tekst, standard tom, høyst 2000 tegn).
-- Jobbene bruker generation_jobs som før (params: kilde, biter og figurer); ingen nye tabeller.
-- Ingen eksisterende data endres. apply_changes er uendret: nye kolonner i kjente tabeller tas med
-- automatisk (private.table_columns).
-- Kjøres ÉN gang etter 0031. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.scene_occurrences add column if not exists video_instructions text not null default ''
  check (char_length(video_instructions) <= 2000);

insert into public.schema_version (version, description)
  values (32, '0032_scene_video_instructions: instrukser til AI-video av scenen');
