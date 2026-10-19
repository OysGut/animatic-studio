-- =====================================================================================
-- Animatic Studio – migrasjon 0059: KI-224, løste notater uten sletting.
-- Ny kolonne på eksisterende tabell. apply_changes bruker jsonb_populate_record og bevarer
-- revisjonskontrollen; ingen funksjoner erstattes. Ingen SQL mot storage.
-- Skrives av Lovable; Claude tester og kjører i Cloud etter 0058.
-- =====================================================================================
alter table public.script_annotations add column resolved boolean not null default false;
revoke all on public.script_annotations from anon, authenticated;
grant select on public.script_annotations to authenticated;
grant all on public.script_annotations to service_role;

insert into public.schema_version (version, description)
  values (59, '0059_annotation_resolved: notater kan løses og åpnes igjen uten sletting');