-- =====================================================================================
-- From Pen to Glass – migrasjon 0091: G-1b, Final Draft-import (.fdx).
-- Ny fil; 0090 og eldre er låst. Claude gjennomgår og kjører i Cloud.
-- Utvider bare formatlisten for registrerte originalfiler. Ingen funksjoner endres, ingen data slettes.
-- =====================================================================================

alter table public.imported_documents drop constraint if exists imported_documents_format_check;
alter table public.imported_documents
  add constraint imported_documents_format_check check (format in ('pdf', 'docx', 'fountain', 'fdx'));

insert into public.schema_version(version, description) values (91, 'G-1b: fdx import format');
