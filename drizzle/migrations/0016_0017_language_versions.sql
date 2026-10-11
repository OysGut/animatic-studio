-- =====================================================================================
-- Animatic Studio – migrasjon 0017: språkversjoner av filmen (M7 del 3, DEC-0059).
-- 1. audio_clips.language: språket lyden hører til (språkkode, eller «*» = felles i alle språk). null =
--    standard for lydtypen: dialog og forteller hører til hovedspråket (norsk), musikk, atmosfære og
--    effekter er felles (REQ-0338–0340). Eksisterende lyd beholder null og spilles som før.
-- 2. composition_layers.language_images: språkavhengige bilder i et lag – en annen variant av samme ressurs
--    i en språkversjon, f.eks. et skilt med engelsk tekst (REQ-0337). Tom liste = samme bilde i alle språk.
-- 3. takes.audio_language: dialogen i lyden til en importert film – språkkode når dialog og øvrig lyd er
--    blandet, «none» når lyden bare er musikk og effekter, null = ikke angitt (REQ-0341/0342).
-- apply_changes leser kolonnene fra tabellene, så funksjonen endres ikke.
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0016. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.audio_clips add column if not exists language text
  check (language is null or language = '*' or language ~ '^[a-z]{2}(-[A-Z]{2})?$');

alter table public.composition_layers add column if not exists language_images jsonb not null default '[]'::jsonb
  check (jsonb_typeof(language_images) = 'array' and pg_column_size(language_images) <= 16384);

alter table public.takes add column if not exists audio_language text
  check (audio_language is null or audio_language = 'none' or audio_language ~ '^[a-z]{2}(-[A-Z]{2})?$');

insert into public.schema_version (version, description)
  values (17, '0017_language_versions: lyd per språk, språkavhengige bilder i lag og dialogspråket i importert film');