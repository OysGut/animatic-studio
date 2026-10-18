-- =====================================================================================
-- Animatic Studio – migrasjon 0042: endring av scenevarighet (SV1, B-041).
-- 1. compositions.timing: låste tidsrom og fyll i ny tid (frys / bakgrunn / svart) i starten og slutten
--    av 2D-scenen. Skrives bare via apply_changes (kommandoene UpdateComposition og RetimeScene).
-- 2. apply_changes endres ikke: kolonnelistene hentes dynamisk med private.table_columns, så den nye
--    kolonnen skrives uten endring av funksjonen. delete_project og purge_* endres ikke (ingen ny tabell).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres (standardverdien er tomt oppsett).
-- Kjøres ÉN gang i Lovable Cloud etter 0041. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.compositions add column if not exists timing jsonb not null
    default '{"lockedRanges":[],"padding":{"start":null,"end":null}}'::jsonb
    check (
      jsonb_typeof(timing) = 'object'
      and pg_column_size(timing) <= 65536
      and (not (timing ? 'lockedRanges') or jsonb_typeof(timing -> 'lockedRanges') = 'array')
      and (not (timing ? 'padding') or jsonb_typeof(timing -> 'padding') in ('object', 'null'))
    );

comment on column public.compositions.timing is
  'SV1 (B-041): låste tidsrom {id,startFrame,endFrame,label}[] og fyll {frames,fill} i start og slutt.';

insert into public.schema_version (version, description)
  values (42, '0042_composition_timing: låste tidsrom og fyll i ny tid for 2D-scener');
