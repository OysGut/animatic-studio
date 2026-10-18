-- =====================================================================================
-- Animatic Studio – migrasjon 0048: tekstlag, grafiske former og effekter (Motion Typography Studio MT1).
-- 1. composition_layers.kind får verdien 'text'. Et tekstlag viser tekst (text_spec), ikke bilde eller
--    fargeflate. Kontrollen «laget viser noe» utvides tilsvarende.
-- 2. Nye jsonb-kolonner på composition_layers (med størrelsesgrenser):
--    text_spec (tekst, font, typografi og bokstavanimasjon; bare tekstlag), shape (form på en fargeflate),
--    effects (skygge, glød og kontur).
-- 3. template_instance_id, template_key og template_slot: hvilken malforekomst og hvilket malelement laget er
--    bygget fra. Fremmednøkkelen til template_instances kommer i 0049 (tabellen lages der).
-- 4. apply_changes endres ikke: kolonnelistene hentes dynamisk med private.table_columns, så de nye
--    kolonnene skrives uten endring av funksjonen. delete_project og purge_* endres ikke (ingen ny tabell).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres (alle nye kolonner er null).
-- Kjøres ÉN gang i Lovable Cloud etter 0047. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.composition_layers drop constraint if exists composition_layers_kind_check;
alter table public.composition_layers add constraint composition_layers_kind_check
  check (kind in ('background','midground','foreground','character','object','effect','other','group','text'));

alter table public.composition_layers add column if not exists text_spec jsonb
  check (text_spec is null or (jsonb_typeof(text_spec) = 'object' and pg_column_size(text_spec) <= 65536));
alter table public.composition_layers add column if not exists shape jsonb
  check (shape is null or (jsonb_typeof(shape) = 'object' and pg_column_size(shape) <= 4096));
alter table public.composition_layers add column if not exists effects jsonb
  check (effects is null or (jsonb_typeof(effects) = 'object' and pg_column_size(effects) <= 4096));
alter table public.composition_layers add column if not exists template_instance_id uuid;
alter table public.composition_layers add column if not exists template_key text
  check (template_key is null or template_key ~ '^[a-z0-9_-]{1,40}$');
alter table public.composition_layers add column if not exists template_slot text
  check (template_slot is null or template_slot ~ '^[a-z0-9_-]{1,40}$');
alter table public.composition_layers add constraint composition_layers_template_check
  check ((template_instance_id is null) = (template_key is null) and (template_slot is null or template_key is not null));

-- Et lag viser et bilde, en fargeflate eller tekst; en gruppe viser ingenting selv
alter table public.composition_layers drop constraint if exists composition_layers_shows_something;
alter table public.composition_layers add constraint composition_layers_shows_something
  check (kind = 'group' or (kind = 'text' and text_spec is not null) or asset_id is not null or fill is not null);
alter table public.composition_layers add constraint composition_layers_text_check
  check ((kind = 'text') = (text_spec is not null));
create index if not exists composition_layers_template_idx on public.composition_layers (template_instance_id)
  where template_instance_id is not null;

comment on column public.composition_layers.text_spec is
  'MTS MT1: tekst og typografi for tekstlag (kind = text), inkludert bokstavanimasjon. Skrives bare via apply_changes.';
comment on column public.composition_layers.shape is
  'MTS MT1: form for en fargeflate (rect, ellipse, line, hjørner og kantlinje). null = rektangel.';
comment on column public.composition_layers.effects is
  'MTS MT1: skygge, glød og kontur. null = ingen.';
comment on column public.composition_layers.template_instance_id is
  'MTS MT4: malforekomsten laget er bygget fra (fremmednøkkel i 0049). null = ikke fra mal.';

insert into public.schema_version (version, description)
  values (48, '0048_text_layers: tekstlag, former og effekter (Motion Typography Studio)');
