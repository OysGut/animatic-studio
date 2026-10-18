-- =====================================================================================
-- Animatic Studio – migrasjon 0050: scenetyper og sider (Motion Typography Studio MT6, spes. §27–38).
-- 1. scene_occurrences.kind: 'scene' (standard), 'title' (filmtittel), 'text' (tekstscene) og
--    'credits' (rulletekst). Tittel-, tekst- og rulletekstscener er deler av filmen, ikke av manuset:
--    de nummereres aldri og påvirker aldri manusnummerering, manuseksport eller sceneidentiteter.
-- 2. composition_layers.kind får 'page': en side i en tittel- eller tekstscene. En side oppfører seg som
--    en gruppe (viser ingenting selv; lagene i den følger dens bevegelse og synlighet), med active_from/
--    active_to som synlighetsintervall og page_transition som overgangen inn i siden.
-- 3. composition_layers.page_transition (jsonb, høyst 4 kB): {kind, frames}. null = kutt.
-- Ingen eksisterende data endres. Ingen SQL mot lagringen (storage).
-- Kjøres ÉN gang i Lovable Cloud etter 0049. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.scene_occurrences add column if not exists kind text not null default 'scene';
alter table public.scene_occurrences drop constraint if exists scene_occurrences_kind_check;
alter table public.scene_occurrences add constraint scene_occurrences_kind_check
  check (kind in ('scene','title','text','credits'));
comment on column public.scene_occurrences.kind is
  'MTS MT6: scenetypen (scene/title/text/credits). Tittel, tekstscene og rulletekst er deler av filmen, ikke manuset. Skrives bare via apply_changes.';

alter table public.composition_layers drop constraint if exists composition_layers_kind_check;
alter table public.composition_layers add constraint composition_layers_kind_check
  check (kind in ('background','midground','foreground','character','object','effect','other','group','text','page'));

alter table public.composition_layers add column if not exists page_transition jsonb
  check (page_transition is null or (jsonb_typeof(page_transition) = 'object' and pg_column_size(page_transition) <= 4096));
comment on column public.composition_layers.page_transition is
  'MTS MT6: overgangen inn i siden (bare kind = page), {kind, frames}. null = kutt. Skrives bare via apply_changes.';

-- En side viser ingenting selv (som en gruppe); sideovergang bare på sider
alter table public.composition_layers drop constraint if exists composition_layers_shows_something;
alter table public.composition_layers add constraint composition_layers_shows_something
  check (kind in ('group','page') or (kind = 'text' and text_spec is not null) or asset_id is not null or fill is not null);
alter table public.composition_layers drop constraint if exists composition_layers_page_transition_check;
alter table public.composition_layers add constraint composition_layers_page_transition_check
  check ((page_transition is null) or kind = 'page');

insert into public.schema_version (version, description)
  values (50, '0050_occurrence_kinds_pages: scenetyper (tittel/tekst/rulletekst) og sidelag (Motion Typography Studio MT6)');
