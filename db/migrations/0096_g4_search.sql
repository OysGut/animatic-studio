-- =====================================================================================
-- From Pen to Glass (repo: Animatic Studio) – migrasjon 0096: G-4, aksent- og skriftolerant søk.
-- Ny fil; 0095 og eldre er låst. Claude gjennomgår og kjører i Cloud. Kjøres ÉN gang etter 0095.
-- Endrer ingen eksisterende data. apply_changes, delete_project og purge_* er UENDRET.
-- 1. Utvidelsene unaccent og pg_trgm i schemas extensions (Supabase-standard).
-- 2. private.fold_text: lower + unaccent (databasens motstykke til kjernens foldSearch; NFKC løses
--    av klienten, Postgres har ikke NFKC – dokumentert i G4_SKRIFT_REPORT.md).
-- 3. Trigramindekser (GIN) på manusblokker, ressursnavn, notater, huskelapper, bibliotek og profiler.
--    Trigram dekker også CJK-søk (japansk/kinesisk har ingen ordmellomrom).
-- 4. admin_find_users skrives om fra ilike til foldet (aksenttolerant) søk. auth.users er administrert
--    skjema og kan ikke indekseres – begrunnet i rapporten; profiles.display_name får indeks.
-- 5. public.search_script_blocks: SECURITY INVOKER-søk per prosjekt som bruker indeksen (RLS håndhever
--    medlemskap). Alle SECURITY DEFINER her har search_path = ''.
-- =====================================================================================

create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Fold for søk: små bokstaver + fjerning av diakritiske tegn (aksenttolerant).
-- To-arguments unaccent med eksplisitt ordbok er IMMUTABLE og kan brukes i uttrykksindekser.
create or replace function private.fold_text(v text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(v, '')))
$$;

-- Trigramindekser på de fire søkeområdene (manusblokker, ressursnavn, notater, bibliotek) + profiler.
create index if not exists script_blocks_fold_trgm_idx
  on public.script_blocks using gin (private.fold_text(text) extensions.gin_trgm_ops);
create index if not exists assets_name_fold_trgm_idx
  on public.assets using gin (private.fold_text(name) extensions.gin_trgm_ops);
create index if not exists script_annotations_fold_trgm_idx
  on public.script_annotations using gin (private.fold_text(text) extensions.gin_trgm_ops);
create index if not exists note_flags_fold_trgm_idx
  on public.note_flags using gin (private.fold_text(text) extensions.gin_trgm_ops);
create index if not exists global_assets_name_fold_trgm_idx
  on public.global_assets using gin (private.fold_text(name) extensions.gin_trgm_ops);
create index if not exists profiles_display_name_fold_trgm_idx
  on public.profiles using gin (private.fold_text(display_name) extensions.gin_trgm_ops);

-- SECURITY DEFINER fordi kroppen bruker private.fold_text (authenticated har ikke USAGE på private,
-- og SECURITY INVOKER ville derfor feilet). Medlemskapet sjekkes eksplisitt med samme kilde som RLS
-- (G-2, private.my_project_ids), så en som ikke er medlem, får null treff.
create or replace function public.search_script_blocks(p_project uuid, p_query text, p_limit integer default 50)
returns table (block_id uuid, variant_id uuid, kind text, text text, score real)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.variant_id,
    b.kind,
    b.text,
    extensions.similarity(private.fold_text(b.text), private.fold_text(btrim(p_query))) as score
  from public.script_blocks b
  where b.project_id = p_project
    and p_project in (select private.my_project_ids())
    and not b.removed
    and private.fold_text(b.text) like '%' || private.fold_text(btrim(p_query)) || '%'
  order by score desc, b.order_key
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.search_script_blocks(uuid, text, integer) from public, anon;
grant execute on function public.search_script_blocks(uuid, text, integer) to authenticated;

-- 0080 er låst: funksjonen erstattes her. Samme signatur, rettigheter og admin-sjekk; eneste endring er
-- at ilike byttes med foldet søk (aksenttolerant på e-post og visningsnavn). auth.users kan ikke
-- indekseres (administrert skjema), derfor får profiles.display_name egen trigramindeks over.
create or replace function public.admin_find_users(p_query text)
returns table (user_id uuid, email text, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_query, ''))) < 3 then return; end if;
  return query
    select u.id, u.email::text, (select p.display_name from public.profiles p where p.user_id = u.id)
    from auth.users u
    where private.fold_text(u.email::text) like '%' || private.fold_text(btrim(p_query)) || '%'
       or private.fold_text(coalesce((select p2.display_name from public.profiles p2 where p2.user_id = u.id), ''))
          like '%' || private.fold_text(btrim(p_query)) || '%'
    order by u.email limit 20;
end $$;
revoke all on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;

insert into public.schema_version (version, description)
  values (96, '0096_g4_search: unaccent/pg_trgm, fold_text, trigramindekser, admin_find_users uten ilike');
