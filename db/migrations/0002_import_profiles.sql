-- =====================================================================================
-- Animatic Studio – migrasjon 0002: manusimport (originalfiler, kildereferanser, usikre tolkninger)
-- og profiler for medlemmer. Kilde: mandat 4.1–4.3, 4.2 (original bevares), DEC-0004, KI-13.
-- Kjøres ÉN gang i Lovable Cloud etter 0001. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- Kildereferanser og usikre tolkninger (mandat 4.3 punkt 9) ----------
alter table public.script_blocks add column if not exists source_ref jsonb;
alter table public.script_blocks add column if not exists uncertainty text;
alter table public.scene_variants add column if not exists uncertainty text;
-- Fjernet tekst skjules, men historikken beholdes (RemoveBlock/RestoreBlock)
alter table public.script_blocks add column if not exists removed boolean not null default false;
-- To blokker kan aldri ha samme plass i en scenevariant (samtidige innsettinger gir konflikt i stedet for uklar rekkefølge)
alter table public.script_blocks add constraint script_blocks_variant_order_unique
  unique (variant_id, order_key) deferrable initially deferred;

-- Tolerant UUID-tolkning for lagringsstier (ugyldig tekst gir null, ikke feil)
create function private.try_uuid(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

-- ---------- Originaldokumenter (mandat 4.2: originalen bevares uendret) ----------
create table public.imported_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id),
  storage_key text not null,
  file_name text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  format text not null check (format in ('pdf', 'docx', 'fountain')),
  page_count integer,
  byte_size bigint not null check (byte_size > 0),
  language text not null default 'nb',
  change_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id)
);
create index imported_documents_project_idx on public.imported_documents (project_id, created_at desc);

alter table public.imported_documents enable row level security;
create policy imported_documents_read on public.imported_documents for select to authenticated
  using (private.is_project_member(project_id));
revoke insert, update, delete, truncate on public.imported_documents from anon, authenticated;
grant select on public.imported_documents to authenticated;

create trigger imported_documents_immutable before update or delete on public.imported_documents
  for each row execute function private.protect_history();

create function public.register_imported_document(
  p_project uuid, p_production uuid, p_storage_key text, p_file_name text, p_sha256 text,
  p_format text, p_page_count integer, p_byte_size bigint, p_language text default 'nb', p_change_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if not private.has_project_role(p_project, 'editor') then
    raise exception 'Du har ikke skriverett i prosjektet' using errcode = '42501';
  end if;
  if length(p_file_name) > 255 or length(p_language) > 10 or length(p_storage_key) > 600 then
    raise exception 'For lange verdier' using errcode = '22023';
  end if;
  if p_change_id is not null and not exists (
    select 1 from public.change_log
    where id = p_change_id and project_id = p_project and actor = (select auth.uid())
  ) then
    raise exception 'Endringen tilhører ikke prosjektet' using errcode = '22023';
  end if;
  if not exists (select 1 from public.productions where id = p_production and project_id = p_project) then
    raise exception 'Produksjonen tilhører ikke prosjektet' using errcode = '22023';
  end if;
  if split_part(p_storage_key, '/', 1) <> p_project::text then
    raise exception 'Ugyldig lagringssti' using errcode = '22023';
  end if;
  insert into public.imported_documents (id, project_id, production_id, storage_key, file_name, sha256, format, page_count, byte_size, language, change_id, created_by)
    values (v_id, p_project, p_production, p_storage_key, p_file_name, lower(p_sha256), p_format, p_page_count, p_byte_size, p_language, p_change_id, (select auth.uid()));
  return v_id;
end $$;
revoke all on function public.register_imported_document(uuid, uuid, text, text, text, text, integer, bigint, text, uuid) from public, anon;
grant execute on function public.register_imported_document(uuid, uuid, text, text, text, text, integer, bigint, text, uuid) to authenticated;

-- ---------- Lagring av originalfiler (privat bøtte «sources», DEC-0020 pkt. 4) ----------
-- Sti: <project_id>/<dokument-id eller sha256>/<filnavn>. Bare medlemmer kan lese; redaktører kan laste opp;
-- ingen kan endre eller slette (originalen er uforanderlig).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('sources', 'sources', false, 104857600,
              array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
      on conflict (id) do update
        set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    execute $p$create policy sources_read on storage.objects for select to authenticated
      using (bucket_id = 'sources' and private.is_project_member(private.try_uuid((storage.foldername(name))[1])))$p$;
    execute $p$create policy sources_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'sources' and private.has_project_role(private.try_uuid((storage.foldername(name))[1]), 'editor'))$p$;
  end if;
end $$;

-- ---------- Profiler (visningsnavn for medlemmer, KI-13) ----------
create table public.profiles (
  user_id uuid primary key references auth.users (id),
  display_name text not null default '' check (length(display_name) <= 100),
  updated_at timestamptz not null default now()
);

create function private.shares_project_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = (select auth.uid()) or exists (
    select 1 from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = (select auth.uid()) and a.removed_at is null
      and b.user_id = p_user and b.removed_at is null
  )
$$;

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (private.shares_project_with(user_id));
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create function public.upsert_my_profile(p_display_name text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select email into v_email from auth.users where id = v_user;
  -- Bare visningsnavn lagres (ikke e-post), så medlemmer ikke ser hverandres adresser
  insert into public.profiles (user_id, display_name)
    values (v_user, left(coalesce(nullif(btrim(p_display_name), ''), split_part(coalesce(v_email, ''), '@', 1)), 100))
    on conflict (user_id) do update
      set display_name = left(coalesce(nullif(btrim(p_display_name), ''), public.profiles.display_name), 100),
          updated_at = now();
end $$;
revoke all on function public.upsert_my_profile(text) from public, anon;
grant execute on function public.upsert_my_profile(text) to authenticated;

insert into public.schema_version (version, description) values (2, '0002_import_profiles: originalfiler, kildereferanser, usikkerhet, fjernede blokker, profiler');
