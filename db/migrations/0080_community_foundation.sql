-- =====================================================================================
-- Animatic Studio – migrasjon 0080: Community-grunnmur bak funksjonsbrytere (B-114, C0).
-- Utgangspunkt: 0079 (skjemaversjon 79). Bare additiv. Ingenting blir synlig for vanlige brukere:
-- alle brytere starter som «av», og hver tabell og RPC sjekker bryteren i databasen.
--   1. features / feature_testers, private.feature_enabled, my_features(), admin_list_features(),
--      admin_set_feature(), admin_set_feature_testers(), admin_find_users().
--   2. publications / publication_recipients / publication_media med RPC-er (krever redaktør og community.sharing).
--   3. review_comments (tidskodede kommentarer, krever community.review og comment-rettighet eller redaktør).
--   4. profiles: handle, bio, avatar_key, is_public, profile_fields. Kolonnetilgangen fra 0073 holdes:
--      de nye kolonnene kan ikke leses direkte; offentlig lesing bare via public_profile(handle).
--   5. asset_versions.rights (jsonb, null = privat med alle rettigheter forbeholdt). Skrives som en del av
--      versjonen via apply_changes (generiske kolonner); versjoner er fortsatt uforanderlige.
--   6. content_reports og user_blocks med RPC-er og admin-kø bak community.review.
-- Erstatter (kopiert ordrett fra 0079, med bare publiseringstabellene lagt til):
--   * public.delete_project (0079): publiseringer, mottakere, medier og kommentarer slettes; mediefilene
--     returneres sammen med filmene, så serverfunksjonen sletter dem.
-- Ikke erstattet: apply_changes (ingen nye prosjekttabeller via kommandoer), purge_project_assets og
--   purge_removed_assets (publiseringene har ingen fremmednøkler mot ressurser, og mediefilene ligger under
--   <prosjekt>/shares/, ikke i ressursmappene), private.protect_asset_version (rights er en del av den
--   uforanderlige versjonen).
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable. Ingen SQL mot storage.
-- =====================================================================================

-- ---------- 1. Funksjonsbrytere ----------
create table public.features (
  key text primary key check (key ~ '^[a-z]+\.[a-z_]+$' and char_length(key) <= 60),
  state text not null default 'off' check (state in ('off', 'beta', 'on')),
  message text check (message is null or char_length(message) <= 500),
  changed_at timestamptz,
  changed_by uuid
);
create table public.feature_testers (
  key text not null references public.features (key) on delete cascade,
  user_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (key, user_id)
);
create index feature_testers_user on public.feature_testers (user_id);
revoke all on public.features, public.feature_testers from public, anon, authenticated;
grant all on public.features, public.feature_testers to service_role;
alter table public.features enable row level security;
alter table public.feature_testers enable row level security;
-- Ingen policyer: tabellene leses bare via security-definer-funksjonene under.

insert into public.features (key, state) values
  ('community.sharing', 'off'), ('community.review', 'off'), ('community.abtest', 'off'),
  ('community.profiles', 'off'), ('community.public', 'off')
on conflict (key) do nothing;

create function private.feature_enabled(p_key text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case f.state
      when 'on' then true
      when 'beta' then p_user is not null
        and exists (select 1 from public.feature_testers t where t.key = f.key and t.user_id = p_user)
      else false end
    from public.features f where f.key = p_key
  ), false)
$$;
revoke all on function private.feature_enabled(text, uuid) from public, anon, authenticated;

create function private.any_community(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.features f where f.key like 'community.%' and private.feature_enabled(f.key, p_user))
$$;
revoke all on function private.any_community(uuid) from public, anon, authenticated;

create function public.my_features() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Krever innlogging' using errcode = '42501';
  end if;
  return coalesce((select jsonb_object_agg(f.key, private.feature_enabled(f.key, (select auth.uid())))
    from public.features f), '{}'::jsonb);
end $$;
revoke all on function public.my_features() from public, anon;
grant execute on function public.my_features() to authenticated;

create function public.admin_list_features() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'key', f.key, 'state', f.state, 'message', f.message, 'changed_at', f.changed_at,
      'changed_by_name', (select p.display_name from public.profiles p where p.user_id = f.changed_by),
      'testers', coalesce((select jsonb_agg(jsonb_build_object('user_id', t.user_id,
          'email', (select u.email from auth.users u where u.id = t.user_id),
          'display_name', (select p.display_name from public.profiles p where p.user_id = t.user_id))
        order by t.added_at) from public.feature_testers t where t.key = f.key), '[]'::jsonb))
    order by f.key) from public.features f), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_features() from public, anon;
grant execute on function public.admin_list_features() to authenticated;

create function public.admin_set_feature(p_key text, p_state text, p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if p_state not in ('off', 'beta', 'on') then
    raise exception 'Ugyldig tilstand' using errcode = '22023';
  end if;
  update public.features set state = p_state, message = nullif(btrim(coalesce(p_message, '')), ''),
    changed_at = now(), changed_by = (select auth.uid())
  where key = p_key;
  if not found then raise exception 'Ukjent funksjon' using errcode = '22023'; end if;
end $$;
revoke all on function public.admin_set_feature(text, text, text) from public, anon;
grant execute on function public.admin_set_feature(text, text, text) to authenticated;

-- Erstatter hele testerlisten for én funksjon (bare eksisterende brukere).
create function public.admin_set_feature_testers(p_key text, p_users uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if not private.is_admin((select auth.uid())) then
    raise exception 'Bare for administrator' using errcode = '42501';
  end if;
  if not exists (select 1 from public.features where key = p_key) then
    raise exception 'Ukjent funksjon' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_users, '{}')) > 500 then
    raise exception 'For mange testere' using errcode = '22023';
  end if;
  delete from public.feature_testers where key = p_key and not (user_id = any (coalesce(p_users, '{}')));
  insert into public.feature_testers (key, user_id)
    select p_key, u.id from auth.users u where u.id = any (coalesce(p_users, '{}'))
  on conflict do nothing;
  select count(*) into v from public.feature_testers where key = p_key;
  update public.features set changed_at = now(), changed_by = (select auth.uid()) where key = p_key;
  return v;
end $$;
revoke all on function public.admin_set_feature_testers(text, uuid[]) from public, anon;
grant execute on function public.admin_set_feature_testers(text, uuid[]) to authenticated;

-- Søk etter eksisterende brukere på e-post (minst 3 tegn, maks 20 treff). Bare for administrator.
create function public.admin_find_users(p_query text)
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
    where u.email ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by u.email limit 20;
end $$;
revoke all on function public.admin_find_users(text) from public, anon;
grant execute on function public.admin_find_users(text) to authenticated;

-- ---------- 6a. Blokkering (brukes av publiseringer og kommentarer) ----------
create table public.user_blocks (
  blocker uuid not null,
  blocked uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index user_blocks_blocked on public.user_blocks (blocked);
revoke all on public.user_blocks from public, anon, authenticated;
grant select on public.user_blocks to authenticated;
grant all on public.user_blocks to service_role;
alter table public.user_blocks enable row level security;
create policy user_blocks_own on public.user_blocks for select to authenticated
  using (blocker = (select auth.uid()) and private.any_community((select auth.uid())));

create function private.blocked_between(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_a is not null and p_b is not null and exists (
    select 1 from public.user_blocks b
    where (b.blocker = p_a and b.blocked = p_b) or (b.blocker = p_b and b.blocked = p_a))
$$;
revoke all on function private.blocked_between(uuid, uuid) from public, anon, authenticated;

create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.any_community((select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if p_user = (select auth.uid()) or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Ugyldig bruker' using errcode = '22023';
  end if;
  insert into public.user_blocks (blocker, blocked) values ((select auth.uid()), p_user) on conflict do nothing;
end $$;
create function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.any_community((select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  delete from public.user_blocks where blocker = (select auth.uid()) and blocked = p_user;
end $$;
revoke all on function public.block_user(uuid), public.unblock_user(uuid) from public, anon;
grant execute on function public.block_user(uuid), public.unblock_user(uuid) to authenticated;

-- ---------- 2. Publiseringer ----------
create table public.publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  scope_kind text not null check (scope_kind in ('project', 'production', 'occurrence', 'range', 'variant', 'take', 'export')),
  scope_ref jsonb not null default '{}'::jsonb
    check (jsonb_typeof(scope_ref) = 'object' and octet_length(scope_ref::text) <= 8192),
  audience text not null default 'private' check (audience in ('private', 'selected', 'testgroup', 'public')),
  can_view boolean not null default true,
  can_comment boolean not null default false,
  can_download boolean not null default false,
  can_remix boolean not null default false,
  license text check (license is null or char_length(license) <= 200),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  publish_at timestamptz,
  expires_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'closed', 'revoked')),
  revoked_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or publish_at is null or expires_at > publish_at)
);
create index publications_project on public.publications (project_id);

create table public.publication_recipients (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  user_id uuid,
  email text check (email is null or (email = lower(email) and char_length(email) <= 320 and position('@' in email) > 1)),
  invited_at timestamptz not null default now(),
  seen_at timestamptz,
  check (user_id is not null or email is not null)
);
create unique index publication_recipients_user on public.publication_recipients (publication_id, user_id) where user_id is not null;
create unique index publication_recipients_email on public.publication_recipients (publication_id, email) where email is not null;
create index publication_recipients_lookup on public.publication_recipients (user_id);

create table public.publication_media (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  storage_key text not null check (
    char_length(storage_key) <= 500
    and left(storage_key, char_length(project_id::text) + 8) = project_id::text || '/shares/'
    and position('..' in storage_key) = 0),
  mime text not null check (mime ~ '^(video|audio|image)/[a-z0-9.+-]{1,60}$'),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 86400000),
  width integer check (width is null or width between 1 and 16384),
  height integer check (height is null or height between 1 and 16384),
  position integer not null default 0 check (position between 0 and 1000),
  created_at timestamptz not null default now()
);
create index publication_media_pub on public.publication_media (publication_id);

create function private.publication_open(p_status text, p_publish timestamptz, p_expires timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select p_status in ('live', 'scheduled')
    and (p_publish is null or p_publish <= now())
    and (p_expires is null or p_expires > now())
$$;
revoke all on function private.publication_open(text, timestamptz, timestamptz) from public, anon, authenticated;

-- Hvem ser en publisering: prosjektets medlemmer (forhåndsvisning), eller – når den er åpen – mottakere
-- (selected/testgroup) og, med community.public, alle. Alltid bare når community.sharing er på for brukeren,
-- og aldri når brukeren og avsenderen har blokkert hverandre.
create function private.can_see_publication(p_pub uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.publications p
    where p.id = p_pub and p.status <> 'revoked'
      and private.feature_enabled('community.sharing', p_user)
      and not private.blocked_between(p.created_by, p_user)
      and (
        (p_user is not null and exists (select 1 from public.project_members m
          where m.project_id = p.project_id and m.user_id = p_user and m.removed_at is null))
        or (private.publication_open(p.status, p.publish_at, p.expires_at) and p.can_view and (
          (p.audience in ('selected', 'testgroup') and p_user is not null and exists (
            select 1 from public.publication_recipients r where r.publication_id = p.id
              and (r.user_id = p_user or r.email = (select lower(u.email) from auth.users u where u.id = p_user))))
          or (p.audience = 'public' and private.feature_enabled('community.public', p_user))
        ))
      )
  )
$$;
revoke all on function private.can_see_publication(uuid, uuid) from public, anon, authenticated;

create function private.is_project_editor(p_project uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and private.member_role_rank(p_project, p_user) >= private.role_rank('editor')
$$;
revoke all on function private.is_project_editor(uuid, uuid) from public, anon, authenticated;

revoke all on public.publications, public.publication_recipients, public.publication_media from public, anon, authenticated;
grant select on public.publications, public.publication_recipients, public.publication_media to authenticated;
grant all on public.publications, public.publication_recipients, public.publication_media to service_role;
alter table public.publications enable row level security;
alter table public.publication_recipients enable row level security;
alter table public.publication_media enable row level security;
create policy publications_read on public.publications for select to authenticated
  using (private.can_see_publication(id, (select auth.uid())));
-- Mottakerlisten: redaktører ser hele listen, en mottaker bare sin egen rad
create policy publication_recipients_read on public.publication_recipients for select to authenticated
  using (private.feature_enabled('community.sharing', (select auth.uid())) and (
    private.is_project_editor(project_id, (select auth.uid()))
    or (user_id = (select auth.uid()) and private.can_see_publication(publication_id, (select auth.uid())))));
create policy publication_media_read on public.publication_media for select to authenticated
  using (private.can_see_publication(publication_id, (select auth.uid())));

create function private.require_sharing_editor(p_project uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.sharing', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if not private.is_project_editor(p_project, (select auth.uid())) then
    raise exception 'Krever redaktør' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_sharing_editor(uuid) from public, anon, authenticated;

create function private.check_audience(p_audience text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_audience = 'public' and not private.feature_enabled('community.public', (select auth.uid())) then
    raise exception 'Offentlig publisering er ikke tilgjengelig' using errcode = '42501';
  end if;
end $$;
revoke all on function private.check_audience(text) from public, anon, authenticated;

create function public.create_publication(
  p_project uuid, p_scope_kind text, p_scope_ref jsonb, p_audience text, p_rights jsonb,
  p_license text, p_title text, p_description text, p_publish_at timestamptz, p_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform private.require_sharing_editor(p_project);
  perform private.check_audience(coalesce(p_audience, 'private'));
  insert into public.publications (project_id, scope_kind, scope_ref, audience, can_view, can_comment, can_download,
    can_remix, license, title, description, publish_at, expires_at, created_by)
  values (p_project, p_scope_kind, coalesce(p_scope_ref, '{}'::jsonb), coalesce(p_audience, 'private'),
    coalesce((p_rights ->> 'view')::boolean, true), coalesce((p_rights ->> 'comment')::boolean, false),
    coalesce((p_rights ->> 'download')::boolean, false), coalesce((p_rights ->> 'remix')::boolean, false),
    nullif(btrim(coalesce(p_license, '')), ''), btrim(p_title), coalesce(p_description, ''), p_publish_at, p_expires_at,
    (select auth.uid()))
  returning id into v;
  return v;
end $$;

-- Endring: bare oppgitte felt. status kan settes til draft, scheduled, live eller closed (tilbaketrekking er egen RPC).
create function public.update_publication(p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.publications;
begin
  select * into v from public.publications where id = p_id for update;
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
  perform private.require_sharing_editor(v.project_id);
  if v.status = 'revoked' then raise exception 'Publiseringen er trukket tilbake' using errcode = '22023'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Ugyldig endring' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('scope_kind', 'scope_ref', 'audience', 'view',
      'comment', 'download', 'remix', 'license', 'title', 'description', 'publish_at', 'expires_at', 'status')) then
    raise exception 'Ukjent felt' using errcode = '22023';
  end if;
  if p_patch ? 'status' and p_patch ->> 'status' not in ('draft', 'scheduled', 'live', 'closed') then
    raise exception 'Ugyldig status' using errcode = '22023';
  end if;
  if p_patch ? 'audience' then perform private.check_audience(p_patch ->> 'audience'); end if;
  update public.publications set
    scope_kind = coalesce(p_patch ->> 'scope_kind', scope_kind),
    scope_ref = case when p_patch ? 'scope_ref' then p_patch -> 'scope_ref' else scope_ref end,
    audience = coalesce(p_patch ->> 'audience', audience),
    can_view = coalesce((p_patch ->> 'view')::boolean, can_view),
    can_comment = coalesce((p_patch ->> 'comment')::boolean, can_comment),
    can_download = coalesce((p_patch ->> 'download')::boolean, can_download),
    can_remix = coalesce((p_patch ->> 'remix')::boolean, can_remix),
    license = case when p_patch ? 'license' then nullif(btrim(coalesce(p_patch ->> 'license', '')), '') else license end,
    title = coalesce(btrim(p_patch ->> 'title'), title),
    description = coalesce(p_patch ->> 'description', description),
    publish_at = case when p_patch ? 'publish_at' then (p_patch ->> 'publish_at')::timestamptz else publish_at end,
    expires_at = case when p_patch ? 'expires_at' then (p_patch ->> 'expires_at')::timestamptz else expires_at end,
    status = coalesce(p_patch ->> 'status', status),
    updated_at = now()
  where id = p_id;
end $$;

create function public.revoke_publication(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  select project_id into v_project from public.publications where id = p_id for update;
  if v_project is null then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
  perform private.require_sharing_editor(v_project);
  update public.publications set status = 'revoked', revoked_at = coalesce(revoked_at, now()), updated_at = now()
    where id = p_id;
end $$;

-- Erstatter mottakerlisten. E-post normaliseres til små bokstaver; kjente brukere kobles med ID.
create function public.set_publication_recipients(p_id uuid, p_users uuid[], p_emails text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v integer;
begin
  select project_id into v_project from public.publications where id = p_id for update;
  if v_project is null then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
  perform private.require_sharing_editor(v_project);
  if cardinality(coalesce(p_users, '{}')) + cardinality(coalesce(p_emails, '{}')) > 500 then
    raise exception 'For mange mottakere' using errcode = '22023';
  end if;
  delete from public.publication_recipients r where r.publication_id = p_id
    and not (coalesce(r.user_id = any (coalesce(p_users, '{}')), false)
      or coalesce(r.email = any (select lower(btrim(e)) from unnest(coalesce(p_emails, '{}')) e), false));
  insert into public.publication_recipients (publication_id, project_id, user_id)
    select p_id, v_project, u.id from auth.users u where u.id = any (coalesce(p_users, '{}'))
  on conflict do nothing;
  insert into public.publication_recipients (publication_id, project_id, email)
    select distinct p_id, v_project, lower(btrim(e)) from unnest(coalesce(p_emails, '{}')) e where btrim(e) <> ''
  on conflict do nothing;
  select count(*) into v from public.publication_recipients where publication_id = p_id;
  return v;
end $$;

create function public.add_publication_media(
  p_id uuid, p_storage_key text, p_mime text, p_duration_ms integer, p_width integer, p_height integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_project uuid; v uuid;
begin
  select project_id into v_project from public.publications where id = p_id;
  if v_project is null then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
  perform private.require_sharing_editor(v_project);
  if (select count(*) from public.publication_media where publication_id = p_id) >= 50 then
    raise exception 'For mange filer' using errcode = '22023';
  end if;
  insert into public.publication_media (publication_id, project_id, storage_key, mime, duration_ms, width, height, position)
    values (p_id, v_project, p_storage_key, p_mime, p_duration_ms, p_width, p_height,
      (select coalesce(max(position) + 1, 0) from public.publication_media where publication_id = p_id))
    returning id into v;
  return v;
end $$;

-- For mottakeren: tittel, rettigheter og mediefiler, eller null (samme svar for ukjent, tilbaketrukket,
-- utløpt, bryter av og manglende tilgang). Serverfunksjonen signerer mediefilene i 600 s.
create function public.publication_for_me(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.publications;
begin
  if (select auth.uid()) is null or not private.can_see_publication(p_id, (select auth.uid())) then
    return null;
  end if;
  select * into v from public.publications where id = p_id;
  update public.publication_recipients set seen_at = coalesce(seen_at, now())
    where publication_id = p_id and (user_id = (select auth.uid())
      or email = (select lower(u.email) from auth.users u where u.id = (select auth.uid())));
  return jsonb_build_object(
    'id', v.id, 'title', v.title, 'description', v.description, 'license', v.license,
    'rights', jsonb_build_object('view', v.can_view, 'comment', v.can_comment, 'download', v.can_download, 'remix', v.can_remix),
    'expires_at', v.expires_at,
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'storage_key', m.storage_key, 'mime', m.mime,
        'duration_ms', m.duration_ms, 'width', m.width, 'height', m.height) order by m.position)
      from public.publication_media m where m.publication_id = p_id), '[]'::jsonb));
end $$;

revoke all on function public.create_publication(uuid, text, jsonb, text, jsonb, text, text, text, timestamptz, timestamptz),
  public.update_publication(uuid, jsonb), public.revoke_publication(uuid),
  public.set_publication_recipients(uuid, uuid[], text[]),
  public.add_publication_media(uuid, text, text, integer, integer, integer),
  public.publication_for_me(uuid) from public, anon;
grant execute on function public.create_publication(uuid, text, jsonb, text, jsonb, text, text, text, timestamptz, timestamptz),
  public.update_publication(uuid, jsonb), public.revoke_publication(uuid),
  public.set_publication_recipients(uuid, uuid[], text[]),
  public.add_publication_media(uuid, text, text, integer, integer, integer),
  public.publication_for_me(uuid) to authenticated;

-- ---------- 3. Tidskodede kommentarer ----------
create function private.valid_region(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare x numeric; y numeric; w numeric; h numeric;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 512 then return false; end if;
  if jsonb_typeof(p -> 'x') is distinct from 'number' or jsonb_typeof(p -> 'y') is distinct from 'number'
     or jsonb_typeof(p -> 'width') is distinct from 'number' or jsonb_typeof(p -> 'height') is distinct from 'number' then
    return false;
  end if;
  x := (p ->> 'x')::numeric; y := (p ->> 'y')::numeric; w := (p ->> 'width')::numeric; h := (p ->> 'height')::numeric;
  return x >= 0 and y >= 0 and w >= 0 and h >= 0 and x + w <= 1 and y + h <= 1;
end $$;
revoke all on function private.valid_region(jsonb) from public, anon, authenticated;

create table public.review_comments (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.publications (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete restrict,
  parent_id uuid references public.review_comments (id) on delete restrict,
  author uuid not null,
  at_ms integer not null check (at_ms between 0 and 86400000),
  frame integer check (frame is null or frame between 0 and 10000000),
  region jsonb check (private.valid_region(region)),
  category text not null default 'general'
    check (category in ('general', 'story', 'animation', 'sound', 'timing', 'technical', 'other')),
  text text not null check (char_length(btrim(text)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  removed boolean not null default false
);
create index review_comments_pub on public.review_comments (publication_id, at_ms);
revoke all on public.review_comments from public, anon, authenticated;
grant select on public.review_comments to authenticated;
grant all on public.review_comments to service_role;
alter table public.review_comments enable row level security;
create policy review_comments_read on public.review_comments for select to authenticated
  using (not removed and private.feature_enabled('community.review', (select auth.uid()))
    and private.can_see_publication(publication_id, (select auth.uid()))
    and not private.blocked_between(author, (select auth.uid())));

create function public.add_review_comment(
  p_pub uuid, p_parent uuid, p_at_ms integer, p_frame integer, p_region jsonb, p_category text, p_text text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.publications; v_id uuid;
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.review', (select auth.uid()))
     or not private.can_see_publication(p_pub, (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  select * into v from public.publications where id = p_pub;
  if not (private.is_project_editor(v.project_id, (select auth.uid()))
          or (v.can_comment and private.publication_open(v.status, v.publish_at, v.expires_at))) then
    raise exception 'Mangler kommentarrett' using errcode = '42501';
  end if;
  if p_parent is not null and not exists (select 1 from public.review_comments c
      where c.id = p_parent and c.publication_id = p_pub and not c.removed) then
    raise exception 'Ugyldig svar' using errcode = '22023';
  end if;
  insert into public.review_comments (publication_id, project_id, parent_id, author, at_ms, frame, region, category, text)
    values (p_pub, v.project_id, p_parent, (select auth.uid()), p_at_ms, p_frame, p_region, coalesce(p_category, 'general'), btrim(p_text))
    returning id into v_id;
  return v_id;
end $$;

create function public.edit_review_comment(p_id uuid, p_text text, p_category text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.review', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  update public.review_comments set text = btrim(p_text), category = coalesce(p_category, category), edited_at = now()
    where id = p_id and author = (select auth.uid()) and not removed;
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
end $$;

create function public.remove_review_comment(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.review', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  update public.review_comments set removed = true, edited_at = now()
    where id = p_id and author = (select auth.uid()) and not removed;
  if not found then raise exception 'Ikke tilgjengelig' using errcode = '42501'; end if;
end $$;
revoke all on function public.add_review_comment(uuid, uuid, integer, integer, jsonb, text, text),
  public.edit_review_comment(uuid, text, text), public.remove_review_comment(uuid) from public, anon;
grant execute on function public.add_review_comment(uuid, uuid, integer, integer, jsonb, text, text),
  public.edit_review_comment(uuid, text, text), public.remove_review_comment(uuid) to authenticated;

-- ---------- 4. Utvidet profil ----------
alter table public.profiles add column if not exists handle text
  check (handle is null or handle ~ '^[a-z0-9_]{3,30}$');
alter table public.profiles add column if not exists bio text check (bio is null or char_length(bio) <= 1000);
alter table public.profiles add column if not exists avatar_key text
  check (avatar_key is null or (char_length(avatar_key) <= 300 and position('..' in avatar_key) = 0));
alter table public.profiles add column if not exists is_public boolean not null default false;
alter table public.profiles add column if not exists profile_fields jsonb not null default '{}'::jsonb
  check (jsonb_typeof(profile_fields) = 'object' and octet_length(profile_fields::text) <= 8192);
create unique index if not exists profiles_handle on public.profiles (handle) where handle is not null;
-- Kolonnetilgangen fra 0073 holdes: select (user_id, display_name, updated_at, locale, ui_prefs) til authenticated.
-- De nye kolonnene får ingen direkte lesetilgang.

create function public.set_my_public_profile(
  p_handle text, p_bio text, p_avatar_key text, p_is_public boolean, p_fields jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.feature_enabled('community.profiles', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if p_avatar_key is not null and left(p_avatar_key, char_length((select auth.uid())::text) + 9)
     <> 'avatars/' || (select auth.uid())::text || '/' then
    raise exception 'Ugyldig bilde' using errcode = '22023';
  end if;
  update public.profiles set handle = nullif(lower(btrim(coalesce(p_handle, ''))), ''), bio = nullif(p_bio, ''),
    avatar_key = p_avatar_key, is_public = coalesce(p_is_public, false), profile_fields = coalesce(p_fields, '{}'::jsonb),
    updated_at = now()
  where user_id = (select auth.uid());
end $$;
revoke all on function public.set_my_public_profile(text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.set_my_public_profile(text, text, text, boolean, jsonb) to authenticated;

create function public.public_profile(p_handle text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('handle', p.handle, 'display_name', p.display_name, 'bio', p.bio,
    'avatar_key', p.avatar_key, 'fields', p.profile_fields)
  from public.profiles p
  where p.handle = lower(btrim(p_handle)) and p.is_public
    and private.feature_enabled('community.profiles', (select auth.uid()))
    and not private.blocked_between(p.user_id, (select auth.uid()))
$$;
revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- ---------- 5. Rettigheter på ressursversjoner ----------
create function private.valid_asset_rights(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' or octet_length(p::text) > 4096 then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    if k in ('source', 'license', 'attribution') then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 500 then return false; end if;
    elsif k in ('shareable', 'adaptable') then
      if jsonb_typeof(v) <> 'boolean' then return false; end if;
    else
      return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function private.valid_asset_rights(jsonb) from public, anon, authenticated;
alter table public.asset_versions add column if not exists rights jsonb
  check (private.valid_asset_rights(rights));
comment on column public.asset_versions.rights is
  'B-114: kilde, lisens, attribusjon, kan deles, kan bearbeides. null = privat med alle rettigheter forbeholdt.';

-- ---------- 6b. Rapportering og admin-kø ----------
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('publication', 'comment', 'profile', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'abuse', 'copyright', 'privacy', 'other')),
  text text not null default '' check (char_length(text) <= 2000),
  reporter uuid not null,
  status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  handled_by uuid,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index content_reports_once on public.content_reports (reporter, target_kind, target_id) where status = 'open';
revoke all on public.content_reports from public, anon, authenticated;
grant all on public.content_reports to service_role;
alter table public.content_reports enable row level security;
-- Ingen policyer: innsending og køen går bare via RPC-ene.

create function public.report_content(p_kind text, p_target uuid, p_reason text, p_text text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if (select auth.uid()) is null or not private.any_community((select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  insert into public.content_reports (target_kind, target_id, reason, text, reporter)
    values (p_kind, p_target, p_reason, coalesce(p_text, ''), (select auth.uid()))
  on conflict do nothing
  returning id into v;
  return v;
end $$;
revoke all on function public.report_content(text, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

create function public.admin_report_queue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) or not private.feature_enabled('community.review', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'target_kind', r.target_kind, 'target_id', r.target_id,
      'reason', r.reason, 'text', r.text, 'created_at', r.created_at,
      'reporter_name', (select p.display_name from public.profiles p where p.user_id = r.reporter)) order by r.created_at)
    from public.content_reports r where r.status = 'open'), '[]'::jsonb);
end $$;

create function public.admin_handle_report(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin((select auth.uid())) or not private.feature_enabled('community.review', (select auth.uid())) then
    raise exception 'Ikke tilgjengelig' using errcode = '42501';
  end if;
  if p_status not in ('dismissed', 'actioned') then raise exception 'Ugyldig status' using errcode = '22023'; end if;
  update public.content_reports set status = p_status, handled_by = (select auth.uid()), handled_at = now()
    where id = p_id and status = 'open';
end $$;
revoke all on function public.admin_report_queue(), public.admin_handle_report(uuid, text) from public, anon;
grant execute on function public.admin_report_queue(), public.admin_handle_report(uuid, text) to authenticated;

-- ---------- 7. Sletting av prosjektet ----------
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

-- ---------- 8. Hjelpefunksjoner brukt i RLS og CHECK (samme mønster som private.is_project_member) ----------
grant execute on function private.feature_enabled(text, uuid), private.any_community(uuid), private.blocked_between(uuid, uuid),
  private.publication_open(text, timestamptz, timestamptz), private.can_see_publication(uuid, uuid),
  private.is_project_editor(uuid, uuid), private.valid_region(jsonb), private.valid_asset_rights(jsonb)
  to authenticated, service_role;

insert into public.schema_version (version, description)
  values (80, '0080_community_foundation: B-114 C0 – funksjonsbrytere, publiseringer, kommentarer, profil, rettigheter, rapportering');
