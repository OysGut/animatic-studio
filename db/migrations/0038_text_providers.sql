-- =====================================================================================
-- Animatic Studio – migrasjon 0038: tekst-AI med egne nøkler (T1, grunnmuren for Story Lab).
-- 1. ai_provider_keys: leverandørene «anthropic» (Claude) og «xai» (Grok) i tillegg til de fem fra 0024.
--    text_models: tekstmodellene leverandøren selv oppga da nøkkelen ble prøvd (liste med ID-er,
--    størrelsesbegrenset), og text_models_at: når listen ble hentet. Brukeren kan lese begge kolonnene
--    (kolonnetilgang som i 0024); den krypterte nøkkelen og IV er fortsatt utilgjengelige fra nettleseren.
-- 2. ai_model_settings: administratoren kan slå de nye leverandørene og modellene av og på (som 0034).
-- 3. generation_jobs: jobbtypen «text» (tekstkall via serverfunksjonen generateText). Loggen har leverandør,
--    modell, tokens og anslått kostnad i params – aldri prompttekst eller svar. Alle eksisterende typer
--    (image, video, prompt, sound) beholdes.
-- Constraint-navnene er de faktiske i databasen (Postgres' standardnavn fra 0024 og 0034).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0037. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.ai_provider_keys drop constraint if exists ai_provider_keys_provider_check;
alter table public.ai_provider_keys add constraint ai_provider_keys_provider_check
  check (provider in ('openai', 'google', 'fal', 'runway', 'elevenlabs', 'anthropic', 'xai'));

alter table public.ai_provider_keys add column if not exists text_models jsonb
  check (text_models is null or (jsonb_typeof(text_models) = 'array' and pg_column_size(text_models) <= 32000));
alter table public.ai_provider_keys add column if not exists text_models_at timestamptz;

grant select (text_models, text_models_at) on public.ai_provider_keys to authenticated;

alter table public.ai_model_settings drop constraint if exists ai_model_settings_provider_check;
alter table public.ai_model_settings add constraint ai_model_settings_provider_check
  check (provider in ('lovable', 'openai', 'google', 'fal', 'runway', 'elevenlabs', 'anthropic', 'xai'));

alter table public.generation_jobs drop constraint if exists generation_jobs_kind_check;
alter table public.generation_jobs add constraint generation_jobs_kind_check
  check (kind in ('image', 'video', 'prompt', 'sound', 'text'));

insert into public.schema_version (version, description)
  values (38, '0038_text_providers: tekst-AI med egne nøkler (Anthropic, OpenAI, xAI, Google)');
