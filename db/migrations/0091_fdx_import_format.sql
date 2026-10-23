-- =====================================================================================
-- From Pen to Glass – migrasjon 0091: G-1b, Final Draft-import (.fdx).
-- Ny fil; 0090 og eldre er låst. Claude gjennomgår og kjører i Cloud.
-- 1) Utvider formatlisten for registrerte originalfiler med «fdx».
-- 2) Plakater (G-1b, Øystein 23.10): sperren language in ('nb','en') fjernes. Plakatspråket er et vanlig
--    BCP-47-merke (samme mønster som translations/language_versions i 0066/0090), og standardverdien 'nb'
--    fjernes, så klienten alltid oppgir språket.
-- Ingen funksjoner opprettes eller erstattes, og ingen data slettes (eksisterende 'nb'/'en' er gyldige merker).
-- =====================================================================================

alter table public.imported_documents drop constraint if exists imported_documents_format_check;
alter table public.imported_documents
  add constraint imported_documents_format_check check (format in ('pdf', 'docx', 'fountain', 'fdx'));

alter table public.posters drop constraint if exists posters_language_check;
alter table public.posters alter column language drop default;
alter table public.posters
  add constraint posters_language_check check (
    char_length(language) <= 100
    and language ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$'
  );

insert into public.schema_version(version, description) values (91, 'G-1b: fdx import format, poster language BCP-47');
