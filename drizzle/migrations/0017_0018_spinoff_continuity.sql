-- =====================================================================================
-- Animatic Studio – migrasjon 0018: kontinuitet i avledede produksjoner (M7 del 4, DEC-0060).
-- 1. continuity_events.production_id: en lokal hendelse som bare gjelder i én avledet produksjon (spinoff).
--    null = hovedfilmens hendelse, som spinoffene arver (REQ-0166).
-- 2. continuity_events.disabled_in: avledede produksjoner der en arvet hendelse er slått av – f.eks. en
--    alternativ spinoff der Maja ikke klipper håret. Hovedfilmen endres ikke (REQ-0167).
-- Tilbakeføring fra spinoff til hovedfilm (REQ-0373–0383) bruker eksisterende tabeller.
-- apply_changes leser kolonnene fra tabellene, så funksjonen endres ikke.
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0017. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.continuity_events add column if not exists production_id uuid
  references public.productions (id) on delete restrict;
create index if not exists continuity_events_production_idx on public.continuity_events (production_id);

alter table public.continuity_events add column if not exists disabled_in jsonb not null default '[]'::jsonb
  check (jsonb_typeof(disabled_in) = 'array' and pg_column_size(disabled_in) <= 16384);

insert into public.schema_version (version, description)
  values (18, '0018_spinoff_continuity: lokale kontinuitetshendelser og hendelser slått av i avledede produksjoner');