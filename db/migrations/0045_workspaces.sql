-- =====================================================================================
-- Animatic Studio – migrasjon 0045: arbeidsgrupper (GP1, Fase 3 global pakke, B-044, spes. §15 og §42).
-- 1. public.workspaces, public.workspace_members (owner | editor | member) og public.workspace_invitations
--    (samme flyt som prosjektinvitasjoner: bare hash av nøkkelen lagres, utløp og tilbakekalling).
-- 2. public.projects.workspace_id (valgfri kobling). Kobling gir INGEN prosjekttilgang; den bestemmer bare
--    hvilket globalt bibliotek prosjektet kan hente fra (GP2). apply_changes endres ikke: prosjektraden
--    oppdateres der med en fast kolonneliste uten workspace_id.
-- 3. private.workspace_role_rank / private.is_workspace_member / private.has_workspace_role.
-- 4. Funksjoner (security definer): create_workspace, rename_workspace, create_workspace_invitation,
--    accept_workspace_invitation, revoke_workspace_invitation, set_workspace_member_role,
--    remove_workspace_member, leave_workspace, set_project_workspace, list_workspace_members.
--    Gruppen må alltid ha minst én eier.
-- 5. RLS: medlemmer leser gruppen og medlemslisten; eiere leser ventende invitasjoner. Klienten skriver aldri
--    direkte. delete_project og purge_* endres ikke (ingen prosjekttabell).
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0044. Endres aldri etter kjøring.
-- =====================================================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  archived_at timestamptz
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'editor', 'member')),
  invited_by uuid references auth.users (id),
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id) where removed_at is null;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  email text not null check (position('@' in email) > 1 and length(email) <= 320),
  role text not null check (role in ('editor', 'member')),
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  revoked_at timestamptz
);
create index workspace_invitations_ws_idx on public.workspace_invitations (workspace_id);

alter table public.projects add column if not exists workspace_id uuid references public.workspaces (id);
create index if not exists projects_workspace_idx on public.projects (workspace_id) where workspace_id is not null;
comment on column public.projects.workspace_id is
  'GP1: valgfri arbeidsgruppe. Gir ingen prosjekttilgang; avgjør hvilket globalt bibliotek prosjektet bruker.';

-- ---------- Tilgangshjelpere ----------
create function private.workspace_role_rank(p_workspace uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(case m.role when 'owner' then 3 when 'editor' then 2 when 'member' then 1 else 0 end), 0)
  from public.workspace_members m
  where m.workspace_id = p_workspace and m.user_id = p_user and m.removed_at is null
$$;

create function private.is_workspace_member(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.workspace_role_rank(p_workspace, (select auth.uid())) > 0
$$;

create function private.has_workspace_role(p_workspace uuid, p_min_role text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.workspace_role_rank(p_workspace, (select auth.uid()))
    >= case p_min_role when 'owner' then 3 when 'editor' then 2 when 'member' then 1 else 99 end
$$;

-- ---------- Tilgang til tabellene: bare lesing ----------
grant select on public.workspaces, public.workspace_members, public.workspace_invitations to authenticated;
grant all on public.workspaces, public.workspace_members, public.workspace_invitations to service_role;
revoke insert, update, delete on public.workspaces, public.workspace_members, public.workspace_invitations
  from authenticated, anon;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;

create policy workspaces_read on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspace_members_read on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy workspace_invitations_read on public.workspace_invitations for select to authenticated
  using (private.has_workspace_role(workspace_id, 'owner'));

-- ---------- Opprette og gi nytt navn ----------
create function public.create_workspace(p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_id uuid;
begin
  if v_actor is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Navnet må ha 1–200 tegn' using errcode = '22023';
  end if;
  insert into public.workspaces (name, created_by) values (btrim(p_name), v_actor) returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, v_actor, 'owner');
  return v_id;
end $$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

create function public.rename_workspace(p_workspace uuid, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if not private.has_workspace_role(p_workspace, 'owner') then
    raise exception 'Bare gruppens eier kan endre navnet' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 200 then
    raise exception 'Navnet må ha 1–200 tegn' using errcode = '22023';
  end if;
  update public.workspaces set name = btrim(p_name), revision = revision + 1 where id = p_workspace;
end $$;
revoke all on function public.rename_workspace(uuid, text) from public, anon;
grant execute on function public.rename_workspace(uuid, text) to authenticated;

-- ---------- Invitasjoner ----------
create function public.create_workspace_invitation(p_workspace uuid, p_email text, p_role text default 'member')
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if not private.has_workspace_role(p_workspace, 'owner') then
    raise exception 'Bare gruppens eier kan invitere' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('editor', 'member') then
    raise exception 'Ukjent rolle' using errcode = '22023';
  end if;
  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
    values (p_workspace, lower(btrim(p_email)), p_role,
            encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), (select auth.uid()));
  return v_token; -- vises én gang; bare hash lagres
end $$;
revoke all on function public.create_workspace_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_workspace_invitation(uuid, text, text) to authenticated;

create function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_inv public.workspace_invitations;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_inv from public.workspace_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invitasjonen er ugyldig eller utløpt' using errcode = '22023'; end if;
  insert into public.workspace_members (workspace_id, user_id, role, invited_by)
    values (v_inv.workspace_id, v_user, v_inv.role, v_inv.invited_by)
    on conflict (workspace_id, user_id) do update
      set removed_at = null,
          role = case when public.workspace_members.removed_at is null
                       and public.workspace_members.role = 'owner' then 'owner' else excluded.role end;
  update public.workspace_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.workspace_id;
end $$;
revoke all on function public.accept_workspace_invitation(text) from public, anon;
grant execute on function public.accept_workspace_invitation(text) to authenticated;

create function public.revoke_workspace_invitation(p_invitation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select workspace_id into v_ws from public.workspace_invitations
    where id = p_invitation and accepted_at is null and revoked_at is null
    for update;
  if v_ws is null then
    raise exception 'Invitasjonen er allerede tatt imot eller trukket tilbake' using errcode = '22023';
  end if;
  if not private.has_workspace_role(v_ws, 'owner') then
    raise exception 'Bare gruppens eier kan trekke tilbake invitasjoner' using errcode = '42501';
  end if;
  update public.workspace_invitations set revoked_at = now() where id = p_invitation;
end $$;
revoke all on function public.revoke_workspace_invitation(uuid) from public, anon;
grant execute on function public.revoke_workspace_invitation(uuid) to authenticated;

-- ---------- Medlemmer ----------
create function public.set_workspace_member_role(p_workspace uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('owner', 'editor', 'member') then
    raise exception 'Ukjent rolle' using errcode = '22023';
  end if;
  perform 1 from public.workspaces where id = p_workspace for no key update;
  if not found then raise exception 'Gruppen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(p_workspace, 'owner') then
    raise exception 'Bare gruppens eier kan endre roller' using errcode = '42501';
  end if;
  select role into v_old from public.workspace_members
    where workspace_id = p_workspace and user_id = p_user and removed_at is null;
  if v_old is null then raise exception 'Personen er ikke medlem av gruppen' using errcode = '22023'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' and not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and role = 'owner' and removed_at is null and user_id <> p_user
  ) then
    raise exception 'Gruppen må ha minst én eier. Gjør en annen til eier først.' using errcode = '42501';
  end if;
  update public.workspace_members set role = p_role where workspace_id = p_workspace and user_id = p_user;
end $$;
revoke all on function public.set_workspace_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_workspace_member_role(uuid, uuid, text) to authenticated;

create function public.remove_workspace_member(p_workspace uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  perform 1 from public.workspaces where id = p_workspace for no key update;
  if not found then raise exception 'Gruppen finnes ikke' using errcode = '22023'; end if;
  if not private.has_workspace_role(p_workspace, 'owner') then
    raise exception 'Bare gruppens eier kan fjerne medlemmer' using errcode = '42501';
  end if;
  select role into v_old from public.workspace_members
    where workspace_id = p_workspace and user_id = p_user and removed_at is null;
  if v_old is null then raise exception 'Personen er ikke medlem av gruppen' using errcode = '22023'; end if;
  if v_old = 'owner' and not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and role = 'owner' and removed_at is null and user_id <> p_user
  ) then
    raise exception 'Gruppen må ha minst én eier. Gjør en annen til eier først.' using errcode = '42501';
  end if;
  update public.workspace_members set removed_at = now() where workspace_id = p_workspace and user_id = p_user;
end $$;
revoke all on function public.remove_workspace_member(uuid, uuid) from public, anon;
grant execute on function public.remove_workspace_member(uuid, uuid) to authenticated;

create function public.leave_workspace(p_workspace uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old text;
begin
  if v_actor is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  perform 1 from public.workspaces where id = p_workspace for no key update;
  select role into v_old from public.workspace_members
    where workspace_id = p_workspace and user_id = v_actor and removed_at is null;
  if v_old is null then raise exception 'Du er ikke medlem av gruppen' using errcode = '22023'; end if;
  if v_old = 'owner' and not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace and role = 'owner' and removed_at is null and user_id <> v_actor
  ) then
    raise exception 'Gruppen må ha minst én eier. Gjør en annen til eier først.' using errcode = '42501';
  end if;
  update public.workspace_members set removed_at = now() where workspace_id = p_workspace and user_id = v_actor;
end $$;
revoke all on function public.leave_workspace(uuid) from public, anon;
grant execute on function public.leave_workspace(uuid) to authenticated;

-- Medlemslisten med visningsnavn (profiler er ellers bare synlige innen prosjekter). Ingen e-post.
create function public.list_workspace_members(p_workspace uuid)
returns table (user_id uuid, role text, joined_at timestamptz, display_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace) then
    raise exception 'Ingen tilgang til gruppen' using errcode = '42501';
  end if;
  return query
    select m.user_id, m.role, m.joined_at, p.display_name
    from public.workspace_members m
    left join public.profiles p on p.user_id = m.user_id
    where m.workspace_id = p_workspace and m.removed_at is null
    order by m.joined_at;
end $$;
revoke all on function public.list_workspace_members(uuid) from public, anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;

-- ---------- Koble prosjekt til gruppe ----------
-- Bare en aktiv eier av prosjektet, og bare til en gruppe der hun selv er medlem. null = frakoble.
create function public.set_project_workspace(p_project uuid, p_workspace uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  perform 1 from public.projects where id = p_project and deleted_at is null for no key update;
  if not found then raise exception 'Prosjektet finnes ikke eller er slettet' using errcode = '22023'; end if;
  if not private.is_active_owner(p_project, v_actor) then
    raise exception 'Bare prosjektets eier kan koble prosjektet til en gruppe' using errcode = '42501';
  end if;
  if p_workspace is not null then
    if not exists (select 1 from public.workspaces where id = p_workspace and archived_at is null) then
      raise exception 'Gruppen finnes ikke' using errcode = '22023';
    end if;
    if not private.is_workspace_member(p_workspace) then
      raise exception 'Du er ikke medlem av gruppen' using errcode = '42501';
    end if;
  end if;
  update public.projects set workspace_id = p_workspace where id = p_project;
end $$;
revoke all on function public.set_project_workspace(uuid, uuid) from public, anon;
grant execute on function public.set_project_workspace(uuid, uuid) to authenticated;

insert into public.schema_version (version, description)
  values (45, '0045_workspaces: arbeidsgrupper, gruppeinvitasjoner og kobling av prosjekter (GP1)');
