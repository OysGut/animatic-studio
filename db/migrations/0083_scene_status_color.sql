-- =====================================================================================
-- From Pen to Glass – migrasjon 0083: scenestatus og scenefarge (B-118, Øystein 22.10).
-- 1. scene_occurrences.work_status: arbeidsstatus i produksjonen (null = ingen status).
-- 2. scene_occurrences.color: scenefarge som nøkkel, aldri hex (null = ingen farge).
-- Begge hører til sceneforekomsten (produksjonen), ikke scenen. Bare additiv; ingen data endres.
-- apply_changes endres ikke: kolonnelistene hentes dynamisk med private.table_columns. Skriving skjer
-- bare via apply_changes, som allerede krever redaktør eller eier.
-- Kjøres ÉN gang i Lovable Cloud etter 0082. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.scene_occurrences add column if not exists work_status text null;
alter table public.scene_occurrences drop constraint if exists scene_occurrences_work_status_check;
alter table public.scene_occurrences add constraint scene_occurrences_work_status_check
  check (work_status is null or work_status in ('setup','animating','review','retake','approved','post','done'));
comment on column public.scene_occurrences.work_status is
  'B-118: arbeidsstatus for scenen i produksjonen (setup/animating/review/retake/approved/post/done). null = ingen status. Skrives bare via apply_changes.';

alter table public.scene_occurrences add column if not exists color text null;
alter table public.scene_occurrences drop constraint if exists scene_occurrences_color_check;
alter table public.scene_occurrences add constraint scene_occurrences_color_check
  check (color is null or color in ('red','orange','yellow','green','teal','blue','indigo','purple','pink','gray'));
comment on column public.scene_occurrences.color is
  'B-118: scenefarge som palettnøkkel (aldri hex). null = ingen farge. Skrives bare via apply_changes.';

insert into public.schema_version (version, description)
  values (83, '0083_scene_status_color: arbeidsstatus og farge per sceneforekomst (B-118)');
