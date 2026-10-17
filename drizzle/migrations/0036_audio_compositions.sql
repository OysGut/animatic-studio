-- =====================================================================================
-- Animatic Studio – migrasjon 0036: lydkomposisjoner (fase 2, bolk C, DEC-0094, REQ-0693).
-- asset_versions.composition: komposisjonen en lydversjon er miksen av – hvilke opptak (takes) som brukes,
-- hvilke deler, hvor de ligger, spor, volum og inn-/uttoning. Lydfilen i versjonen er miksen; komposisjonen
-- kan redigeres videre og gir samme lyd når den mikses på nytt. Kildeopptakene endres aldri.
-- Kolonnen settes bare når versjonen lages (versjoner er uforanderlige – utløseren er uendret).
-- Formen kontrolleres i domenekjernen før lagring; her bare størrelse og type.
-- apply_changes er uendret: nye kolonner i kjente tabeller tas med automatisk (private.table_columns).
-- Ingen eksisterende data endres. Kjøres ÉN gang i Lovable Cloud etter 0035. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.asset_versions add column if not exists composition jsonb
  check (composition is null or (jsonb_typeof(composition) = 'object' and pg_column_size(composition) <= 262144));

insert into public.schema_version (version, description)
  values (36, '0036_audio_compositions: lydkomposisjoner på lydversjoner');