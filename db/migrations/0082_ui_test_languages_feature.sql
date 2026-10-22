-- 0082: funksjonsbryter for testspråket en-XA (admin slår av/på, standard av).
-- Bygger på 0080 (features). Claude kjører i Cloud etter verifisering.
insert into public.features (key, state) values ('ui.test_languages', 'off')
on conflict (key) do nothing;
