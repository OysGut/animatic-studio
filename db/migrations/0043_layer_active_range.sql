-- =====================================================================================
-- Animatic Studio – migrasjon 0043: lagets aktive tidsområde (Asset Studio AS2, A3).
-- 1. composition_layers.active_from / active_to: laget tegnes bare fra og med active_from til og med active_to
--    (bilder i 2D-scenen). Begge null = hele scenen. Skrives bare via apply_changes (UpdateLayers,
--    UpdateSceneDraft, RetimeScene).
-- 2. Krysstoning mellom bildesegmenter (ImageSwap.transition) ligger i den eksisterende jsonb-kolonnen
--    image_swaps og trenger ingen ny kolonne.
-- 3. apply_changes endres ikke: kolonnelistene hentes dynamisk med private.table_columns, så de nye
--    kolonnene skrives uten endring av funksjonen. delete_project og purge_* endres ikke (ingen ny tabell).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres (standard er null = hele scenen).
-- Kjøres ÉN gang i Lovable Cloud etter 0042. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.composition_layers add column if not exists active_from integer
    check (active_from is null or active_from >= 0);
alter table public.composition_layers add column if not exists active_to integer
    check (active_to is null or active_to >= 0);
alter table public.composition_layers add constraint composition_layers_active_range_check
    check (
      (active_from is null and active_to is null)
      or (active_from is not null and active_to is not null and active_to >= active_from)
    );

comment on column public.composition_layers.active_from is
  'AS2: første bilde laget tegnes (inkludert). null sammen med active_to = hele scenen.';
comment on column public.composition_layers.active_to is
  'AS2: siste bilde laget tegnes (inkludert). null sammen med active_from = hele scenen.';

insert into public.schema_version (version, description)
  values (43, '0043_layer_active_range: aktivt tidsområde for lag (Asset Studio)');
