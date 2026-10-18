-- =====================================================================================
-- Animatic Studio – migrasjon 0047: QR-deling av en ferdig filmversjon (GP5, spes. §29–35, Q1–Q8).
-- 1. public.film_shares: én delt filmversjon (en bestemt eksport i eksportloggen) med filen i lagringen
--    (<prosjekt>/shares/<deling>/film.mp4 i bøtten «assets»; eksisterende policy: redaktører laster opp,
--    ingen kan endre). Bare SHA-256 av nøkkelen brukes til oppslag. Nøkkelen selv kan bare leses av
--    redaktører og eiere via film_share_token (kolonnen er ikke lesbar for klienten), så QR-koden kan vises
--    igjen. Utløp: 7 dager, 30 dager eller til den trekkes tilbake (null). Tilbakekalling virker med en gang.
-- 2. Funksjoner (security definer, search_path = ''): create_film_share, activate_film_share,
--    revoke_film_share, film_share_token. Rolle: redaktør eller eier. Den offentlige siden slår opp med
--    service role i en serverfunksjon (aldri klienten).
-- 3. delete_project: som 0041, sletter også delingene og tar med filene i listen over filer som slettes.
--    purge_* endres ikke (delingene peker ikke på ressurser).
-- Ingen SQL mot lagringen (storage). Ingen eksisterende data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0046. Endres aldri etter kjøring.
-- =====================================================================================

create table public.film_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id),
  production_id uuid not null references public.productions (id) on delete cascade,
  -- Filmversjonen lenken gjelder (versjonsbundet, §31)
  export_record_id uuid not null references public.export_records (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  storage_key text not null check (length(storage_key) between 1 and 500),
  mime_type text not null check (mime_type = 'video/mp4'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 524288000),
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 86400000),
  width integer not null check (width between 2 and 8192),
  height integer not null check (height between 2 and 8192),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'revoked')),
  token text check (token is null or length(token) = 64),
  token_hash text unique check (token_hash is null or length(token_hash) = 64),
  expires_at timestamptz,
  share_days integer check (share_days is null or share_days in (7, 30)),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  activated_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  check ((status = 'uploading') = (token_hash is null)),
  check (split_part(storage_key, '/', 1) = project_id::text and split_part(storage_key, '/', 2) = 'shares')
);
create index film_shares_project_idx on public.film_shares (project_id, created_at desc);
create index film_shares_export_idx on public.film_shares (export_record_id);
alter table public.film_shares enable row level security;
create policy film_shares_read on public.film_shares for select to authenticated
  using (private.is_project_member(project_id));
revoke all on public.film_shares from anon, authenticated;
-- Alle kolonner unntatt nøkkelen og hashen
grant select (id, project_id, production_id, export_record_id, title, storage_key, mime_type, byte_size,
  duration_ms, width, height, status, expires_at, share_days, created_at, created_by, activated_at,
  revoked_at, revoked_by) on public.film_shares to authenticated;
grant all on public.film_shares to service_role;

-- Ny deling: raden lages før opplastingen (status uploading), så stien er bundet til prosjektet og delingen
create or replace function public.create_film_share(
  p_project uuid, p_export_record uuid, p_title text, p_byte_size bigint, p_duration_ms integer,
  p_width integer, p_height integer, p_share_days integer
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := gen_random_uuid();
  v_production uuid;
  v_key text;
begin
  if not private.has_project_role(p_project, 'editor') then
    raise exception 'Bare redaktører og eiere kan dele filmen' using errcode = '42501';
  end if;
  select production_id into v_production from public.export_records
    where id = p_export_record and project_id = p_project and kind = 'film';
  if v_production is null then
    raise exception 'Filmversjonen finnes ikke i prosjektet' using errcode = '22023';
  end if;
  if p_share_days is not null and p_share_days not in (7, 30) then
    raise exception 'Ugyldig varighet' using errcode = '22023';
  end if;
  v_key := p_project::text || '/shares/' || v_id::text || '/film.mp4';
  insert into public.film_shares (id, project_id, production_id, export_record_id, title, storage_key, mime_type,
      byte_size, duration_ms, width, height, share_days, created_by)
    values (v_id, p_project, v_production, p_export_record, btrim(p_title), v_key, 'video/mp4', p_byte_size,
      p_duration_ms, p_width, p_height, p_share_days, (select auth.uid()));
  return jsonb_build_object('id', v_id, 'storage_key', v_key);
end $$;
revoke all on function public.create_film_share(uuid, uuid, text, bigint, integer, integer, integer, integer) from public, anon;
grant execute on function public.create_film_share(uuid, uuid, text, bigint, integer, integer, integer, integer) to authenticated;

-- Klar for deling: kalles av serverfunksjonen etter at den har sjekket filen i lagringen. Lager nøkkelen.
create or replace function public.activate_film_share(p_share uuid, p_byte_size bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.film_shares;
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  select * into v_row from public.film_shares where id = p_share for update;
  if v_row.id is null or not private.has_project_role(v_row.project_id, 'editor') then
    raise exception 'Bare redaktører og eiere kan dele filmen' using errcode = '42501';
  end if;
  if v_row.status <> 'uploading' then
    raise exception 'Delingen er allerede aktivert eller trukket tilbake' using errcode = '22023';
  end if;
  if p_byte_size is distinct from v_row.byte_size then
    raise exception 'Filen i lagringen stemmer ikke med filmversjonen' using errcode = '22023';
  end if;
  update public.film_shares
    set status = 'ready', token = v_token,
        token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
        activated_at = now(),
        expires_at = case when share_days is null then null else now() + make_interval(days => share_days) end
    where id = p_share;
  return v_token;
end $$;
revoke all on function public.activate_film_share(uuid, bigint) from public, anon;
grant execute on function public.activate_film_share(uuid, bigint) to authenticated;

-- Tilbakekalling: med en gang (§33). Nøkkelen fjernes, så lenken aldri kan brukes igjen.
create or replace function public.revoke_film_share(p_share uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  select project_id into v_project from public.film_shares where id = p_share for update;
  if v_project is null or not private.has_project_role(v_project, 'editor') then
    raise exception 'Bare redaktører og eiere kan trekke tilbake delingen' using errcode = '42501';
  end if;
  update public.film_shares
    set status = 'revoked', token = null, revoked_at = now(), revoked_by = (select auth.uid())
    where id = p_share and status <> 'revoked';
end $$;
revoke all on function public.revoke_film_share(uuid) from public, anon;
grant execute on function public.revoke_film_share(uuid) to authenticated;

-- Nøkkelen for QR-koden (bare redaktører og eiere, bare aktive og ikke utløpte delinger)
create or replace function public.film_share_token(p_share uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_row public.film_shares;
begin
  select * into v_row from public.film_shares where id = p_share;
  if v_row.id is null or not private.has_project_role(v_row.project_id, 'editor') then
    raise exception 'Bare redaktører og eiere kan se delingslenken' using errcode = '42501';
  end if;
  if v_row.status <> 'ready' or (v_row.expires_at is not null and v_row.expires_at <= now()) then
    return null;
  end if;
  return v_row.token;
end $$;
revoke all on function public.film_share_token(uuid) from public, anon;
grant execute on function public.film_share_token(uuid) to authenticated;

-- ---------- delete_project: som 0041, sletter også delingene ----------
create or replace function public.delete_project(p_project uuid, p_actor uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_sources text[];
  v_films text[];
  v_removed integer;
begin
  -- Lås prosjektraden: skriving som pågår (holder nøkkellås via fremmednøkler) blir ferdig først,
  -- og innholdet den lagret, slettes med resten
  perform 1 from public.projects where id = p_project for update;
  if not exists (select 1 from public.projects where id = p_project and deleted_at is null) then
    raise exception 'Prosjektet finnes ikke eller er allerede slettet' using errcode = '22023';
  end if;
  if not private.is_active_owner(p_project, p_actor) then
    raise exception 'Bare prosjekteieren kan slette prosjektet' using errcode = '42501';
  end if;
  -- Filene i lagringen slettes av serverfunksjonen etterpå
  select coalesce(array_agg(storage_key), '{}') into v_sources
    from public.imported_documents where project_id = p_project;
  select coalesce(array_agg(media_ref), '{}') into v_films
    from public.takes where project_id = p_project and media_ref is not null
      and split_part(media_ref, '/', 1) = p_project::text;
  -- Delte filmer (GP5): filene slettes sammen med filmene fra takes
  v_films := v_films || coalesce((select array_agg(storage_key) from public.film_shares
    where project_id = p_project and split_part(storage_key, '/', 1) = p_project::text), '{}');

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Rekkefølge etter fremmednøkler (barn først)
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Story Lab (SL1): forslag og økter først, så fakta, stadier og profiler (on delete restrict mot ressurser og scener)
  -- Automatisk gjenkjenning (OG2): avledet arbeidslogg, før scenene
  delete from public.script_entity_analysis where project_id = p_project;
  -- Delingslenker (GP5): før eksportloggen og produksjonene
  delete from public.film_shares where project_id = p_project;
  delete from public.story_suggestions where project_id = p_project;
  update public.story_sessions set parent_session_id = null where project_id = p_project;
  delete from public.story_sessions where project_id = p_project;
  -- Canvas (SL7): kanter før noder, gruppekoblingen løses først (on delete restrict mot ressurser og scener)
  delete from public.story_canvas_edges where project_id = p_project;
  update public.story_canvas_nodes set group_id = null where project_id = p_project;
  delete from public.story_canvas_nodes where project_id = p_project;
  delete from public.story_facts where project_id = p_project;
  delete from public.story_profile_stages where project_id = p_project;
  delete from public.story_profiles where project_id = p_project;
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
  delete from public.change_log where project_id = p_project;
  delete from public.project_invitations where project_id = p_project;
  perform set_config('animatic.purge_project', '', true);

  update public.project_members set removed_at = now()
    where project_id = p_project and role <> 'owner' and removed_at is null;
  get diagnostics v_removed = row_count;
  update public.projects set deleted_at = now(), deleted_by = p_actor where id = p_project;
  return jsonb_build_object('sources', to_jsonb(v_sources), 'films', to_jsonb(v_films), 'removed_members', v_removed);
end $$;
revoke all on function public.delete_project(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_project(uuid, uuid) to service_role;

insert into public.schema_version (version, description)
  values (47, '0047_film_shares: versjonsbundet QR-deling av en ferdig filmversjon (GP5)');
