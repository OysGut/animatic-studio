-- C-3 Premiere Pro (UXP-panel). Klienten ptg.premiere finnes allerede i klientlisten (0111).
-- Returen fra Premiere lagres i de samme tabellene som C-5 (0113): kilde «premiere», og ett forslag per panel
-- med typen «edit» (ny plass i scenen og/eller ny varighet). Forslag brukes aldri automatisk; brukeren godtar
-- eller avviser per panel med public.connector_resolve_panel_candidate (uendret fra 0113).
-- Takhøyde: alt er per prosjekt og per retur (ingen globale køer). Ingen begin/commit. 0113 og eldre endres ikke.

alter table public.connector_returns drop constraint connector_returns_source_check;
alter table public.connector_returns add constraint connector_returns_source_check check(source in('sbpro','premiere'));

alter table public.connector_panel_candidates drop constraint connector_panel_candidates_kind_check;
alter table public.connector_panel_candidates add constraint connector_panel_candidates_kind_check check(kind in('text','timing','image','new_panel','conform','edit'));

insert into public.schema_version(version,description) values(114,'C-3 Premiere Pro UXP panel');
