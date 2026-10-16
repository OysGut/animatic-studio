-- =====================================================================================
-- Animatic Studio – migrasjon 0035: mobilbro – opplastingsøkter og mobilimport (fase 2, bolk A, DEC-0090).
-- Mars 16.10.2026: QR-kode på prosjektsiden og i ressursdialogene; mobilen laster opp bilder og video rett inn i
-- prosjektet; «Del lenke» til andre bidragsytere med egne, begrensede rettigheter; alt havner i riktig kontekst.
-- 1. upload_sessions: én økt per QR-kode eller delt lenke. Tokenet lagres bare som SHA-256 (hex). Konteksten
--    (prosjekt, ressurs, utkast, scene …), utløp, tilbakekalling og tak på antall filer og bytes.
-- 2. mobile_imports: hver fil fra en mobil (bilde, video, lyd), med økt, bidragsyter og koblingen til versjonen
--    eller filmen den ble til. Én rad per (økt, filens ID fra telefonen) – nye forsøk gir aldri duplikater.
-- 3. RPC-er bare for serveren (service_role): registrere og bekrefte en opplasting innenfor økten og taket.
--    RPC-er for innloggede redaktører: ta en import til behandling, knytte den til versjon/take, knytte utkast
--    til en lagret ressurs, skjule en import og tilbakekalle en økt.
-- Lesing: medlemmer av prosjektet. Skriving: bare via funksjonene over. Ingen SQL mot lagringen (storage).
-- 4. purge_project_assets tar også med mobilimporten; øktene stenges når et prosjekt slettes.
-- Ingen eksisterende data endres. Kjøres ÉN gang etter 0034. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Opplastingsøkter ----------
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('personal', 'shared')),
  parent_id uuid references public.upload_sessions (id),
  created_by uuid not null references auth.users (id),
  creator_name text not null default '' check (char_length(creator_name) <= 100),
  context jsonb not null check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 4096),
  label text not null default '' check (char_length(label) <= 200),
  media_kinds text[] not null default array['image', 'video']::text[]
    check (media_kinds <@ array['image', 'video', 'audio']::text[] and cardinality(media_kinds) >= 1),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_files integer not null check (max_files between 1 and 5000),
  max_bytes bigint not null check (max_bytes between 1 and 107374182400),
  files_count integer not null default 0 check (files_count >= 0),
  bytes_total bigint not null default 0 check (bytes_total >= 0),
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);
create index upload_sessions_project_idx on public.upload_sessions (project_id, created_at desc);
alter table public.upload_sessions enable row level security;
create policy upload_sessions_read on public.upload_sessions for select to authenticated
  using (private.is_project_member(project_id));
revoke all on public.upload_sessions from public, anon, authenticated;
grant select on public.upload_sessions to authenticated;

-- ---------- 2. Filer fra mobilen ----------
create table public.mobile_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  session_id uuid not null references public.upload_sessions (id),
  client_file_id uuid not null,
  path text not null check (char_length(path) between 1 and 600 and position('..' in path) = 0),
  kind text not null check (kind in ('image', 'video', 'audio')),
  mime_type text not null check (char_length(mime_type) between 3 and 100),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 5368709120),
  file_name text not null default '' check (char_length(file_name) <= 255),
  contributor_name text not null default '' check (char_length(contributor_name) <= 100),
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  error text check (error is null or char_length(error) <= 500),
  context jsonb not null check (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 4096),
  -- Koblinger etter behandling (en fil dupliseres aldri; flere koblinger er mulig via konteksten)
  asset_id uuid,
  asset_version_id uuid,
  take_id uuid,
  claimed_by uuid,
  claimed_at timestamptz,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (session_id, client_file_id)
);
create index mobile_imports_project_idx on public.mobile_imports (project_id, created_at desc);
alter table public.mobile_imports enable row level security;
create policy mobile_imports_read on public.mobile_imports for select to authenticated
  using (private.is_project_member(project_id));
revoke all on public.mobile_imports from public, anon, authenticated;
grant select on public.mobile_imports to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.mobile_imports, public.upload_sessions;
  end if;
end $$;

-- ---------- 3. Funksjoner for serveren (mobilsiden har ingen innlogging) ----------

-- Gyldig økt for et token (oppdaterer «sist sett»). Null når tokenet er ukjent, utløpt eller tilbakekalt.
create function public.mobile_session_touch(p_token_hash text) returns public.upload_sessions
language plpgsql security definer set search_path = '' as $$
declare v public.upload_sessions;
begin
  update public.upload_sessions s set last_seen_at = now()
    where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
      and (s.parent_id is null or exists (select 1 from public.upload_sessions p
             where p.id = s.parent_id and p.revoked_at is null))
    returning * into v;
  return v;
end $$;

-- Registrer en fil før opplastingen (innenfor taket). Samme fil på nytt gir den eksisterende raden.
create function public.mobile_register_upload(
  p_token_hash text, p_client_file_id uuid, p_path text, p_kind text, p_mime text, p_bytes bigint,
  p_file_name text, p_contributor text
) returns public.mobile_imports
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.upload_sessions;
  v_row public.mobile_imports;
begin
  select * into v_s from public.upload_sessions s
    where s.token_hash = p_token_hash and s.revoked_at is null and s.expires_at > now()
    for update;
  if v_s.id is null then raise exception 'Økten er utløpt eller tilbakekalt' using errcode = '28000'; end if;
  if v_s.parent_id is not null and exists (select 1 from public.upload_sessions p
       where p.id = v_s.parent_id and p.revoked_at is not null) then
    raise exception 'Økten er utløpt eller tilbakekalt' using errcode = '28000';
  end if;
  select * into v_row from public.mobile_imports m
    where m.session_id = v_s.id and m.client_file_id = p_client_file_id;
  if v_row.id is not null then return v_row; end if;
  if not (p_kind = any (v_s.media_kinds)) then
    raise exception 'Denne filtypen kan ikke lastes opp her' using errcode = '22023';
  end if;
  if v_s.files_count >= v_s.max_files or v_s.bytes_total + p_bytes > v_s.max_bytes then
    raise exception 'Taket for opplastinger er nådd' using errcode = '54000';
  end if;
  if position(v_s.project_id::text || '/' in p_path) <> 1 then
    raise exception 'Ugyldig lagringssti' using errcode = '22023';
  end if;
  insert into public.mobile_imports (project_id, session_id, client_file_id, path, kind, mime_type, byte_size,
      file_name, contributor_name, context)
    values (v_s.project_id, v_s.id, p_client_file_id, p_path, p_kind, p_mime, p_bytes,
      left(coalesce(p_file_name, ''), 255), left(coalesce(p_contributor, ''), 100), v_s.context)
    returning * into v_row;
  update public.upload_sessions set files_count = files_count + 1, bytes_total = bytes_total + p_bytes,
    last_seen_at = now() where id = v_s.id;
  return v_row;
end $$;

-- Filen er sjekket i lagringen: ferdig (med faktisk størrelse) eller feilet.
create function public.mobile_confirm_upload(
  p_token_hash text, p_client_file_id uuid, p_ok boolean, p_bytes bigint, p_error text
) returns public.mobile_imports
language plpgsql security definer set search_path = '' as $$
declare
  v_s public.upload_sessions;
  v_row public.mobile_imports;
begin
  select * into v_s from public.upload_sessions s where s.token_hash = p_token_hash;
  if v_s.id is null then raise exception 'Ukjent økt' using errcode = '28000'; end if;
  select * into v_row from public.mobile_imports m
    where m.session_id = v_s.id and m.client_file_id = p_client_file_id for update;
  if v_row.id is null then raise exception 'Ukjent fil' using errcode = 'P0002'; end if;
  if v_row.status = 'done' then return v_row; end if;
  if p_ok then
    update public.upload_sessions set bytes_total = greatest(0, bytes_total - v_row.byte_size + p_bytes)
      where id = v_s.id;
    update public.mobile_imports set status = 'done', byte_size = p_bytes, error = null, confirmed_at = now()
      where id = v_row.id returning * into v_row;
  else
    update public.mobile_imports set status = 'failed', error = left(coalesce(p_error, ''), 500)
      where id = v_row.id returning * into v_row;
  end if;
  return v_row;
end $$;

revoke all on function public.mobile_session_touch(text) from public, anon, authenticated;
revoke all on function public.mobile_register_upload(text, uuid, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.mobile_confirm_upload(text, uuid, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.mobile_session_touch(text) to service_role;
grant execute on function public.mobile_register_upload(text, uuid, text, text, text, bigint, text, text) to service_role;
grant execute on function public.mobile_confirm_upload(text, uuid, boolean, bigint, text) to service_role;

-- ---------- 4. Funksjoner for redaktører på datamaskinen ----------

-- Ta en ferdig fil til behandling (bare én fane vinner; et krav som er eldre enn 2 minutter kan tas over).
create function public.claim_mobile_import(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.mobile_imports where id = p_id;
  if v_project is null or not private.has_project_role(v_project, 'editor') then
    raise exception 'Ingen skriverett' using errcode = '42501';
  end if;
  update public.mobile_imports set claimed_by = (select auth.uid()), claimed_at = now()
    where id = p_id and status = 'done' and asset_version_id is null and take_id is null and not dismissed
      and (claimed_at is null or claimed_at < now() - interval '2 minutes' or claimed_by = (select auth.uid()));
  return found;
end $$;

-- Knytt filen til versjonen eller filmen den ble til (og ressursen).
create function public.link_mobile_import(p_id uuid, p_asset uuid, p_version uuid, p_take uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.mobile_imports where id = p_id;
  if v_project is null or not private.has_project_role(v_project, 'editor') then
    raise exception 'Ingen skriverett' using errcode = '42501';
  end if;
  update public.mobile_imports set
      asset_id = coalesce(p_asset, asset_id),
      asset_version_id = coalesce(p_version, asset_version_id),
      take_id = coalesce(p_take, take_id),
      claimed_by = null, claimed_at = null
    where id = p_id;
end $$;

-- Ressursen som var under opprettelse, er lagret: filene fra utkastet knyttes til den.
create function public.attach_mobile_draft(p_project uuid, p_draft text, p_asset uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.has_project_role(p_project, 'editor') then
    raise exception 'Ingen skriverett' using errcode = '42501';
  end if;
  update public.mobile_imports set asset_id = p_asset
    where project_id = p_project and context ->> 'draftKey' = p_draft and asset_id is null;
  get diagnostics n = row_count;
  update public.upload_sessions set context = context || jsonb_build_object('assetId', p_asset)
    where project_id = p_project and context ->> 'draftKey' = p_draft;
  return n;
end $$;

-- Skjul en fil i mobilimporten (filen og koblingene beholdes).
create function public.dismiss_mobile_import(p_id uuid, p_dismissed boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.mobile_imports where id = p_id;
  if v_project is null or not private.has_project_role(v_project, 'editor') then
    raise exception 'Ingen skriverett' using errcode = '42501';
  end if;
  update public.mobile_imports set dismissed = p_dismissed where id = p_id;
end $$;

-- Tilbakekall en økt (og dermed lenkene som er delt fra den). Den som laget den, eller eieren.
create function public.revoke_upload_session(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.upload_sessions;
begin
  select * into v_s from public.upload_sessions where id = p_id;
  if v_s.id is null or not (v_s.created_by = (select auth.uid()) or private.has_project_role(v_s.project_id, 'owner')
      or (private.has_project_role(v_s.project_id, 'editor') and v_s.kind = 'shared')) then
    raise exception 'Ingen rett til å tilbakekalle økten' using errcode = '42501';
  end if;
  update public.upload_sessions set revoked_at = coalesce(revoked_at, now())
    where id = p_id or parent_id = p_id;
end $$;

revoke all on function public.claim_mobile_import(uuid) from public, anon;
revoke all on function public.link_mobile_import(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function public.attach_mobile_draft(uuid, text, uuid) from public, anon;
revoke all on function public.dismiss_mobile_import(uuid, boolean) from public, anon;
revoke all on function public.revoke_upload_session(uuid) from public, anon;
grant execute on function public.claim_mobile_import(uuid) to authenticated;
grant execute on function public.link_mobile_import(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.attach_mobile_draft(uuid, text, uuid) to authenticated;
grant execute on function public.dismiss_mobile_import(uuid, boolean) to authenticated;
grant execute on function public.revoke_upload_session(uuid) to authenticated;

-- ---------- 5. Sletting av prosjekt: mobilimporten slettes for godt sammen med ressursene ----------
-- (samme funksjon som i 0021, med mobilimporten og øktene i tillegg)
create or replace function public.purge_project_assets(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_paths text[];
begin
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is not null) then
    raise exception 'Prosjektet må være slettet før ressursene kan slettes' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette ressursene' using errcode = '42501';
  end if;
  select coalesce(array_agg(p), '{}') into v_paths from (
    select media_path as p from public.asset_versions where project_id = p_project
    union select result_path from public.generation_jobs where project_id = p_project and result_path is not null
    -- Filer fra mobilen (DEC-0090), også de som aldri ble en versjon
    union select path from public.mobile_imports where project_id = p_project
  ) x;

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Innhold som ble lagret samtidig med slettingen av prosjektet, fjernes også her
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Mobilimport og opplastingsøkter (DEC-0090)
  delete from public.mobile_imports where project_id = p_project;
  update public.upload_sessions set parent_id = null where project_id = p_project;
  delete from public.upload_sessions where project_id = p_project;
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translations where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  delete from public.clip_parts where project_id = p_project;
  delete from public.audio_clips where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  delete from public.scenes where project_id = p_project;
  delete from public.imported_documents where project_id = p_project;
  delete from public.script_versions where project_id = p_project;
  delete from public.productions where project_id = p_project;
  delete from public.generation_jobs where project_id = p_project;
  update public.asset_variants set approved_version_id = null where project_id = p_project;
  delete from public.asset_versions where project_id = p_project;
  delete from public.asset_variants where project_id = p_project;
  delete from public.assets where project_id = p_project;
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  delete from public.project_members where project_id = p_project;
  delete from public.projects where id = p_project;
  perform set_config('animatic.purge_project', '', true);
  return jsonb_build_object('paths', to_jsonb(v_paths));
end $$;
revoke all on function public.purge_project_assets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.purge_project_assets(uuid, uuid) to service_role;

-- Et slettet prosjekt tar ikke imot flere filer
create or replace function private.close_upload_sessions_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.upload_sessions set revoked_at = coalesce(revoked_at, now()) where project_id = new.id;
  end if;
  return new;
end $$;
create trigger projects_close_upload_sessions after update of deleted_at on public.projects
  for each row execute function private.close_upload_sessions_on_delete();

insert into public.schema_version (version, description)
  values (35, '0035_mobile_import: opplastingsøkter (QR og delte lenker) og mobilimport');