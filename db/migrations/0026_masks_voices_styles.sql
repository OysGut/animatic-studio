-- =====================================================================================
-- Animatic Studio – migrasjon 0026: maskering, overganger mellom segmenter, stemmer, betegnelser i kontekst og
-- stilprofiler per bruk (DEC-0071). Bare nye kolonner; apply_changes håndterer dem uten endring.
-- 1. composition_layers.mask: maske for et lag i 2D-scenen (rektangel, ellipse eller et annet lag) og
--    composition_layers.blend: blandingsmodus (REQ-0175, mandat 11.2).
-- 2. clip_parts.transition_ms: myk overgang (krysstoning) inn i delen fra delen før (REQ-0265).
-- 3. assets.voice: stemmen en karakter får når dialog lages med AI (tekst til tale).
-- 4. assets.context_names: betegnelser som gjelder ressursen bare i bestemte manuslinjer («onkel» = Laurits i
--    disse replikkene), uten å bli et alternativt navn overalt (REQ-0127).
-- 5. style_profiles.applies_to: hva en stilprofil gjelder for (ressurstyper, plakater, 2D-animatic, AI-video;
--    tom = standardprofilen brukes) (REQ-0148).
-- 6. takes.coverage: hvilken del av manuset en importert film eller AI-video dekker (første og siste
--    manuslinje, REQ-0237).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0025. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.composition_layers add column if not exists mask jsonb
  check (mask is null or (jsonb_typeof(mask) = 'object' and pg_column_size(mask) <= 8192));
alter table public.composition_layers add column if not exists blend text not null default 'normal'
  check (blend in ('normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'soft-light', 'color'));

alter table public.clip_parts add column if not exists transition_ms integer not null default 0
  check (transition_ms between 0 and 5000);

alter table public.assets add column if not exists voice jsonb
  check (voice is null or (jsonb_typeof(voice) = 'object' and pg_column_size(voice) <= 4096));
alter table public.assets add column if not exists context_names jsonb not null default '[]'::jsonb
  check (jsonb_typeof(context_names) = 'array' and pg_column_size(context_names) <= 262144);

alter table public.style_profiles add column if not exists applies_to jsonb not null default '[]'::jsonb
  check (jsonb_typeof(applies_to) = 'array' and pg_column_size(applies_to) <= 4096);

alter table public.takes add column if not exists coverage jsonb
  check (coverage is null or (jsonb_typeof(coverage) = 'object' and pg_column_size(coverage) <= 1024));

insert into public.schema_version (version, description)
  values (26, '0026_masks_voices_styles: masker, overganger mellom segmenter, stemmer, betegnelser i kontekst, stilprofiler per bruk, manusdekning for film');
