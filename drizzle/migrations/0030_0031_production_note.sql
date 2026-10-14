-- =====================================================================================
-- Animatic Studio – migrasjon 0031: notat på produksjonene (DEC-0082).
-- Mars 14.10.2026: prosjektlisten viser hvert prosjekt som en boks med hovedfilmen og spinoffer/varianter,
-- og for hver variant dato og notatene brukeren har gitt om hva den er.
-- productions.description: notatet (tekst, standard tom, høyst 2000 tegn). Datoen er created_at (finnes).
-- Ingen eksisterende data endres. apply_changes er uendret: nye kolonner i kjente tabeller tas med
-- automatisk (private.table_columns).
-- Kjøres ÉN gang i Lovable Cloud etter 0030. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.productions add column if not exists description text not null default ''
  check (char_length(description) <= 2000);

insert into public.schema_version (version, description)
  values (31, '0031_production_note: notat på produksjonene');