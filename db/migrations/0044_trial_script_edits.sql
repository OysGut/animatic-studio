-- =====================================================================================
-- Animatic Studio – migrasjon 0044: forsøksvis manusredigering som notat (Asset Studio AS3, C2–C3).
-- 1. script_annotations.kind ('note' | 'trial_edit'): type notat. source ('user' | 'system') endres ikke.
-- 2. script_annotations.suggested_text: den foreslåtte teksten for det markerte utdraget (quote). Bare for
--    trial_edit, som alltid hører til en manuslinje (block_id). Skrives bare via apply_changes
--    (AddAnnotations / UndoAddAnnotations). «Bruk forslaget» går gjennom vanlig manusredigering.
-- 3. apply_changes endres ikke: kolonnelistene hentes dynamisk med private.table_columns. delete_project og
--    purge_* endres ikke (ingen ny tabell).
-- Ingen SQL mot lagringen (storage). Eksisterende notater får kind = 'note'.
-- Kjøres ÉN gang i Lovable Cloud etter 0043. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.script_annotations add column if not exists kind text not null default 'note'
    check (kind in ('note', 'trial_edit'));
alter table public.script_annotations add column if not exists suggested_text text
    check (suggested_text is null or length(suggested_text) <= 10000);
alter table public.script_annotations add constraint script_annotations_trial_edit_check
    check (
      (kind = 'note' and suggested_text is null)
      or (kind = 'trial_edit' and block_id is not null and suggested_text is not null)
    );

comment on column public.script_annotations.kind is
  'AS3: note = vanlig notat, trial_edit = forsøksvis manusredigering (med suggested_text).';
comment on column public.script_annotations.suggested_text is
  'AS3: foreslått tekst for utdraget i quote (bare trial_edit).';

insert into public.schema_version (version, description)
  values (44, '0044_trial_script_edits: forsøksvis manusredigering som notat (Asset Studio)');
