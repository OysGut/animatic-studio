-- =====================================================================================
-- From Pen to Glass – migrasjon 0087: B-116 Utstillingsvindu, oppå 0086. Bare additiv,
-- bortsett fra utvidet CHECK på content_reports.target_kind og erstattet delete_project.
-- Alt ligger bak bryteren community.public (profildelen bak community.profiles): når bryteren
-- er av, gir hver RPC ingenting. Ingen direkte tabelltilgang; all lesing og skriving går via
-- security-definer-RPC-er (RLS er på, uten policyer). Offentlig lesing (showcase_feed og
-- showcase_comments) returnerer aldri bruker-ID eller e-post, bare visningsnavnet.
--   1. showcase_items: ett bidrag (karakter, ressurs, scene, manusutdrag eller lydbit) med
--      kopiert fil under <prosjekt>/shares/, status pending/live/rejected/revoked og utløp
--      (standard 1 uke, maks 90 dager – håndheves i RPC-ene, ikke i CHECK, som må være uforanderlig).
--   2. showcase_comments: kommentarer på bidrag (innloggede; leses av alle når bidraget vises).
--   3. service_settings.showcase_require_approval (standard på): admin-bryter for godkjenningskravet.
--   4. my_public_profile(): egen handle/bio/avatar/Offentlig-flagg (kolonnene er ellers uleselige, 0073/0080).
--   5. content_reports.target_kind utvides med 'showcase' (rapportering av bidrag).
-- Erstatter (kopiert ordrett fra 0084, med bare utstillingsvinduet lagt til):
--   * public.delete_project (0084): bidrag og kommentarer slettes; de kopierte filene under
--     <prosjekt>/shares/ returneres sammen med filmene, så serverfunksjonen sletter dem.
-- Ikke erstattet: apply_changes (bidrag er ikke prosjektdata via kommandoer), purge_project_assets
--   og purge_removed_assets (filene ligger under <prosjekt>/shares/, ikke i ressursmappene).
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. Bidrag ----------
create table public.showcase_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  kind text not null check (kind in ('character', 'asset', 'scene', 'script', 'audio')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  text text not null default '' check (char_length(text) <= 2000),
  excerpt text check (excerpt is null or char_length(btrim(excerpt)) between 1 and 1000),
  storage_key text check (storage_key is null or (
    char_length(storage_key) <= 500
    and left(storage_key, char_length(project_id::text) + 8) = project_id::text || '/shares/'
    and position('..' in storage_key) = 0)),
  mime text check (mime is null or mime ~ '^(video|audio|image)/[a-z0-9.+-]{1,60}$'),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000),
  width integer check (width is null or width between 1 and 16384),
  height integer check (height is null or height between 1 and 16384),
  status text not null default 'pending' check (status in ('pending', 'live', 'rejected', 'revoked')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (kind = 'script' or (storage_key is not null and mime is not null)),
  check (kind <> 'script' or excerpt is not null)
);
create index showcase_items_feed on public.showcase_items (status, expires_at);
create index showcase_items_creator on public.showcase_items (created_by);

create table public.showcase_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.showcase_items (id) on delete cascade,
  author uuid not null,
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  created_at timestamptz not null default now(),
  removed boolean not null default false
);
create index showcase_comments_item on public.showcase_comments (item_id, created_at);

revoke all on public.showcase_items, public.showcase_comments from public, anon, authenticated;
grant all on public.showcase_items, public.showcase_comments to service_role;
alter table public.showcase_items enable row level security;
alter table public.showcase_comments enable row level security;
-- Ingen policyer: all lesing og skriving går via RPC-ene under.

-- ---------- 3. Godkjenningsbryter ----------
alter table public.service_settings add column if not exists showcase_require_approval boolean not null default true;

create function private.showcase_require_approval() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.showcase_require_approval from public.service_settings s where s.id), true)
$$;
revoke all on function private.showcase_require_approval() from public, anon, authenticated;
grant execute on function private.showcase_require_approval() to service_role;

-- Synlig for alle (også utloggede) når bryteren er på: godkjent, ikke utløpt, ikke blokkert.
create function private.showcase_visible(p_item uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.feature_enabled('community.public', p_user) and exists (
    select 1 from public.showcase_items i
    where i.id = p_item and i.status = 'live' and i.expires_at > now()
      and not private.blocked_between(i.created_by, p_user))
$$;
revoke all on function private.showcase_visible(uuid, uuid) from public, anon, authenticated;
grant execute on function private.showcase_visible(uuid, uuid) to service_role;

-- Karusellen: godkjente, aktive bidrag. Aldri bruker-ID eller e-post; filene signeres av serverfunksjonen.
create function public.showcase_feed() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.feature_enabled('community.public', (select auth.uid())) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'kind', i.kind, 'title', i.title, 'text', i.text, 'excerpt', i.excerpt,
      'storage_key', i.storage_key, 'mime', i.mime, 'duration_ms', i.duration_ms,
      'width', i.width, 'height', i.height, 'created_at', i.created_at,
      'author_name', (select p.display_name from public.profiles p where p.user_id = i.created_by))
      order by i.created_at desc)
    from (select * from public.showcase_items i
      where i.status = 'live' and i.expires_at > now()
        and not private.blocked_between(i.created_by, (select auth.uid()))
      order by i.created_at desc limit 50) i), '[]'::jsonb);
end $$;
revoke all on function public.showcase_feed() from public;
grant execute on function public.showcase_feed() to anon, authenticated, service_role;

-- Oppretting: redaktør i prosjektet, bryter på. Utløp standard 1 uke, maks 90 dager.
create function public.create_showcase_item(
  p_project uuid, p_kind text, p_title text, p_text text, p_excerpt text,
  p_storage_key text, p_mime text, p_duration_ms integer, p_width integer, p_height integer,
  p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; v_expires timestamptz;
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.public', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if not private.is_project_editor(p_project, (select auth.uid())) then
    raise exception 'Krever redaktør' using errcode = '42501';
  end if;
  v_expires := coalesce(p_expires_at, now() + interval '7 days');
  if v_expires <= now() or v_expires > now() + interval '90 days' then
    raise exception 'Ugyldig utløp' using errcode = '22023';
  end if;
  insert into public.showcase_items (project_id, kind, title, text, excerpt, storage_key, mime,
    duration_ms, width, height, status, expires_at, created_by, approved_at)
  values (p_project, p_kind, btrim(p_title), coalesce(p_text, ''), nullif(btrim(coalesce(p_excerpt, '')), ''),
    p_storage_key, p_mime, p_duration_ms, p_width, p_height,
    case when private.showcase_require_approval() then 'pending' else 'live' end,
    v_expires, (select auth.uid()),
    case when private.showcase_require_approval() then null else now() end)
  returning id into v;
  return v;
end $$;
revoke all on function public.create_showcase_item(uuid, text, text, text, text, text, text, integer, integer, integer, timestamptz) from public, anon;
grant execute on function public.create_showcase_item(uuid, text, text, text, text, text, text, integer, integer, integer, timestamptz) to authenticated;

-- Egne bidrag, alle statuser, for «Mine delinger».
create function public.my_showcase_items() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.public', (select auth.uid())) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'project_id', i.project_id, 'project_name', (select p.name from public.projects p where p.id = i.project_id),
      'kind', i.kind, 'title', i.title, 'text', i.text, 'excerpt', i.excerpt,
      'storage_key', i.storage_key, 'mime', i.mime, 'duration_ms', i.duration_ms,
      'width', i.width, 'height', i.height, 'status', i.status, 'expires_at', i.expires_at,
      'created_at', i.created_at, 'approved_at', i.approved_at) order by i.created_at desc)
    from public.showcase_items i where i.created_by = (select auth.uid())), '[]'::jsonb);
end $$;
revoke all on function public.my_showcase_items() from public, anon;
grant execute on function public.my_showcase_items() to authenticated;

-- Endring: bare tittel, tekst, utdrag og utløp. Trukket tilbake kan ikke endres. Når godkjenning
-- kreves, sendes et synlig eller avvist bidrag tilbake til «venter» ved endring av innholdet.
create function public.update_showcase_item(p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.showcase_items; v_expires timestamptz; v_content boolean;
begin
  select * into v from public.showcase_items where id = p_id for update;
  if not found or v.created_by <> (select auth.uid())
     or not private.feature_enabled('community.public', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if v.status = 'revoked' then raise exception 'Bidraget er trukket tilbake' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) <> 'object' or exists (select 1 from jsonb_object_keys(p_patch) k
      where k not in ('title', 'text', 'excerpt', 'expires_at')) then
    raise exception 'Ukjent felt' using errcode = '22023';
  end if;
  v_expires := case when p_patch ? 'expires_at' then (p_patch ->> 'expires_at')::timestamptz else v.expires_at end;
  if v_expires <= now() or v_expires > now() + interval '90 days' then
    raise exception 'Ugyldig utløp' using errcode = '22023';
  end if;
  v_content := (p_patch ? 'title' and btrim(p_patch ->> 'title') is distinct from v.title)
    or (p_patch ? 'text' and coalesce(p_patch ->> 'text', '') is distinct from v.text)
    or (p_patch ? 'excerpt' and nullif(btrim(coalesce(p_patch ->> 'excerpt', '')), '') is distinct from v.excerpt);
  update public.showcase_items set
    title = coalesce(btrim(p_patch ->> 'title'), title),
    text = coalesce(p_patch ->> 'text', text),
    excerpt = case when p_patch ? 'excerpt' then nullif(btrim(coalesce(p_patch ->> 'excerpt', '')), '') else excerpt end,
    expires_at = v_expires,
    status = case when v_content and private.showcase_require_approval() then 'pending' else status end,
    approved_by = case when v_content and private.showcase_require_approval() then null else approved_by end,
    approved_at = case when v_content and private.showcase_require_approval() then null else approved_at end,
    updated_at = now()
  where id = p_id;
end $$;
revoke all on function public.update_showcase_item(uuid, jsonb) from public, anon;
grant execute on function public.update_showcase_item(uuid, jsonb) to authenticated;

-- Tilbaketrekking når som helst: eieren av bidraget, eller administrator.
create function public.revoke_showcase_item(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.public', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  update public.showcase_items set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
    where id = p_id and status <> 'revoked'
      and (created_by = (select auth.uid()) or private.is_admin((select auth.uid())));
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
end $$;
revoke all on function public.revoke_showcase_item(uuid) from public, anon;
grant execute on function public.revoke_showcase_item(uuid) to authenticated;

-- ---------- 2. Kommentarer ----------
-- Kommentarene til et synlig bidrag. Lses av alle (også utloggede); aldri bruker-ID eller e-post.
create function public.showcase_comments(p_item uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.showcase_visible(p_item, (select auth.uid())) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'text', c.text, 'created_at', c.created_at,
      'author_name', (select p.display_name from public.profiles p where p.user_id = c.author),
      'mine', c.author = (select auth.uid())) order by c.created_at)
    from public.showcase_comments c where c.item_id = p_item and not c.removed), '[]'::jsonb);
end $$;
revoke all on function public.showcase_comments(uuid) from public;
grant execute on function public.showcase_comments(uuid) to anon, authenticated;

create function public.add_showcase_comment(p_item uuid, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if (select auth.uid()) is null or not private.showcase_visible(p_item, (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  insert into public.showcase_comments (item_id, author, text)
    values (p_item, (select auth.uid()), btrim(p_text))
  returning id into v;
  return v;
end $$;
revoke all on function public.add_showcase_comment(uuid, text) from public, anon;
grant execute on function public.add_showcase_comment(uuid, text) to authenticated;

-- Egen kommentar fjernes (myk sletting); administrator kan fjerne alle.
create function public.remove_showcase_comment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.public', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  update public.showcase_comments set removed = true
    where id = p_id and not removed
      and (author = (select auth.uid()) or private.is_admin((select auth.uid())));
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
end $$;
revoke all on function public.remove_showcase_comment(uuid) from public, anon;
grant execute on function public.remove_showcase_comment(uuid) to authenticated;

-- ---------- 4. Egen offentlig profil (lesing; skriving er set_my_public_profile fra 0080) ----------
create function public.my_public_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.profiles', (select auth.uid())) then
    return null;
  end if;
  return (select jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'bio', p.bio,
      'avatar_key', p.avatar_key, 'is_public', p.is_public, 'fields', p.profile_fields)
    from public.profiles p where p.user_id = (select auth.uid()));
end $$;
revoke all on function public.my_public_profile() from public, anon;
grant execute on function public.my_public_profile() to authenticated;

-- ---------- 5. Rapportering av bidrag (samme kø som 0080) ----------
alter table public.content_reports drop constraint content_reports_target_kind_check;
alter table public.content_reports add constraint content_reports_target_kind_check
  check (target_kind in ('publication', 'comment', 'profile', 'user', 'showcase'));

-- ---------- 6. Admin: kø, godkjenning og bryter ----------
create function public.admin_showcase_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'require_approval', private.showcase_require_approval(),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'title', i.title, 'text', i.text, 'excerpt', i.excerpt,
        'storage_key', i.storage_key, 'mime', i.mime, 'duration_ms', i.duration_ms,
        'width', i.width, 'height', i.height, 'created_at', i.created_at, 'expires_at', i.expires_at,
        'project_name', (select p.name from public.projects p where p.id = i.project_id),
        'author_name', (select p.display_name from public.profiles p where p.user_id = i.created_by))
        order by i.created_at)
      from public.showcase_items i where i.status = 'pending'), '[]'::jsonb));
end $$;
revoke all on function public.admin_showcase_queue() from public, anon;
grant execute on function public.admin_showcase_queue() to authenticated;

create function public.admin_review_showcase_item(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  update public.showcase_items set
    status = case when p_approve then 'live' else 'rejected' end,
    approved_by = case when p_approve then (select auth.uid()) else null end,
    approved_at = case when p_approve then now() else null end,
    updated_at = now()
  where id = p_id and status = 'pending';
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
end $$;
revoke all on function public.admin_review_showcase_item(uuid, boolean) from public, anon;
grant execute on function public.admin_review_showcase_item(uuid, boolean) to authenticated;

create function public.admin_set_showcase_approval(p_required boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  update public.service_settings set showcase_require_approval = coalesce(p_required, true),
    changed_at = now(), changed_by = (select auth.uid()) where id;
end $$;
revoke all on function public.admin_set_showcase_approval(boolean) from public, anon;
grant execute on function public.admin_set_showcase_approval(boolean) to authenticated;

-- ---------- 7. Sletting av prosjektet (kopiert ordrett fra 0084; bare utstillingsvinduet er lagt til) ----------
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
  -- Publiseringer (B-114, 0080): mediefilene under <prosjekt>/shares/ slettes sammen med filmene
  v_films := v_films || coalesce((select array_agg(storage_key) from public.publication_media
    where project_id = p_project and split_part(storage_key, '/', 1) = p_project::text), '{}');
  -- Utstillingsvindu (B-116, 0087): kopierte bidragsfiler under <prosjekt>/shares/
  v_films := v_films || coalesce((select array_agg(storage_key) from public.showcase_items
    where project_id = p_project and storage_key is not null and split_part(storage_key, '/', 1) = p_project::text), '{}');

  perform set_config('animatic.purge_project', p_project::text, true);
  -- Rekkefølge etter fremmednøkler (barn først)
  -- Plakater og relasjoner først (on delete restrict mot produksjoner og ressurser, DEC-0061)
  -- Story Lab (SL1): forslag og økter først, så fakta, stadier og profiler (on delete restrict mot ressurser og scener)
  -- Automatisk gjenkjenning (OG2): avledet arbeidslogg, før scenene
  delete from public.dialogue_batches where project_id = p_project;
  -- P8: harmoniseringsjobber (0065)
  delete from public.harmonize_batches where project_id = p_project;
  delete from public.script_entity_analysis where project_id = p_project;
  -- Publiseringer (B-114, 0080): kommentarer (svar før foreldre), medier og mottakere før publiseringene
  update public.review_comments set parent_id = null where project_id = p_project;
  delete from public.review_comments where project_id = p_project;
  delete from public.publication_media where project_id = p_project;
  delete from public.publication_recipients where project_id = p_project;
  delete from public.publications where project_id = p_project;
  -- Utstillingsvindu (B-116, 0087): kommentarene forsvinner med bidraget (on delete cascade)
  delete from public.showcase_items where project_id = p_project;
  -- Delte filmer (GP5): før eksportloggen og produksjonene
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
  -- P8: harmoniseringsmetadata og foretrukne referanser før stilprofilene og bildene (on delete restrict)
  delete from public.style_harmonizations where project_id = p_project;
  delete from public.style_preferred_references where project_id = p_project;
  delete from public.style_profiles where project_id = p_project;
  delete from public.posters where project_id = p_project;
  delete from public.asset_relations where project_id = p_project;
  -- Oversettelser (on delete restrict mot linjer og scener, DEC-0058)
  delete from public.translation_line_links where project_id = p_project;
  delete from public.translation_lines where project_id = p_project;
  delete from public.translations where project_id = p_project;
  -- 0066 (ML3): språkversjonene etter oversettelsene (on delete restrict)
  delete from public.language_versions where project_id = p_project;
  delete from public.time_links where project_id = p_project;
  -- Leppesynk (CA5) og mønstre (CA6): før klippene, takene og linjene de peker på
  delete from public.mouth_tracks where project_id = p_project;
  delete from public.mouth_sets where project_id = p_project;
  delete from public.lipsync_results where project_id = p_project;
  delete from public.animation_patterns where project_id = p_project;
  -- DV7/DV8 (0062): lapper og gjennomganger før lydversjonene; personlige bokmerker forsvinner med prosjektet
  delete from public.note_flags where project_id = p_project;
  delete from public.dialogue_reviews where project_id = p_project;
  delete from public.user_bookmarks where project_id = p_project;
  -- M8 (0063): kvalitetsprofilene har ingen avhengigheter og slettes før lydversjonene
  delete from public.quality_profiles where project_id = p_project;
  -- Lydversjoner (DV2, 0060): aktiv kobling løses, så versjonene, før klippene de hører til
  update public.audio_clips set active_version_id = null where project_id = p_project;
  update public.dialogue_versions set parent_version_id = null where project_id = p_project;
  delete from public.dialogue_versions where project_id = p_project;
  delete from public.clip_parts where project_id = p_project;
  delete from public.audio_clips where project_id = p_project;
  delete from public.animation_uses where project_id = p_project;
  update public.animation_rigs set current_version_id = null where project_id = p_project;
  delete from public.animation_rig_versions where project_id = p_project;
  delete from public.animation_rigs where project_id = p_project;
  delete from public.print_copies where project_id = p_project;
  delete from public.print_job_elements where project_id = p_project;
  delete from public.print_jobs where project_id = p_project;
  delete from public.measure_sets where project_id = p_project;
  delete from public.composition_layers where project_id = p_project;
  -- Malforekomster (MTS MT4): etter lagene (on delete restrict), før 2D-scenene og ressursene
  delete from public.template_instances where project_id = p_project;
  -- Rulletekst (MTS MT7): sekvensen peker på forekomsten, deltakerne peker på ressurser (on delete restrict)
  delete from public.credit_sequences where project_id = p_project;
  delete from public.credit_participants where project_id = p_project;
  delete from public.compositions where project_id = p_project;
  delete from public.script_annotations where project_id = p_project;
  update public.scene_occurrences set active_take_id = null where project_id = p_project;
  delete from public.takes where project_id = p_project;
  delete from public.production_segments where project_id = p_project;
  delete from public.scene_occurrences where project_id = p_project;
  delete from public.script_block_revisions where project_id = p_project;
  delete from public.script_blocks where project_id = p_project;
  delete from public.scene_variants where project_id = p_project;
  -- Rigg & 2D-utskrift (B-087, 0071): scenekoblede rigger før scenene (on delete restrict)
  delete from public.rig_setups where project_id = p_project;
  delete from public.rig_templates where project_id = p_project;
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
  values (87, '0087_showcase: B-116 utstillingsvindu – bidrag, kommentarer, godkjenning, offentlig karusell');
