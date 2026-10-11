-- =====================================================================================
-- Animatic Studio – migrasjon 0020: endre rolle etter invitasjon (DEC-0063, REQ-0586).
-- 1. public.set_member_role: eieren endrer rollen til et medlem (eier, redaktør, kommentator, leser).
--    Prosjektet må alltid ha minst én eier. Eiere kan godkjenne kostnader (som ved opprettelse).
-- 2. public.set_invitation_role: eieren endrer rollen i en invitasjon som ikke er tatt imot ennå.
-- 3. public.revoke_invitation: eieren trekker tilbake en invitasjon som ikke er tatt imot.
-- Ingen SQL mot lagringen (storage). Kjøres ÉN gang i Lovable Cloud etter 0019. Endres aldri etter kjøring.
-- =====================================================================================

create or replace function public.set_member_role(p_project uuid, p_user uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_old text;
begin
  if v_actor is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('owner', 'editor', 'commenter', 'viewer') then
    raise exception 'Ukjent rolle' using errcode = '22023';
  end if;
  -- Rolleendringer i samme prosjekt etter hverandre (to eiere kan ikke fjerne hverandre samtidig).
  -- FOR NO KEY UPDATE stopper ikke vanlig redigering (apply_changes bruker FOR KEY SHARE).
  perform 1 from public.projects where id = p_project and deleted_at is null for no key update;
  if not found then raise exception 'Prosjektet finnes ikke eller er slettet' using errcode = '22023'; end if;
  if not private.is_active_owner(p_project, v_actor) then
    raise exception 'Bare prosjektets eier kan endre roller' using errcode = '42501';
  end if;
  select role into v_old from public.project_members
    where project_id = p_project and user_id = p_user and removed_at is null;
  if v_old is null then raise exception 'Personen er ikke medlem av prosjektet' using errcode = '22023'; end if;
  if v_old = p_role then return; end if;
  if v_old = 'owner' and not exists (
    select 1 from public.project_members
    where project_id = p_project and role = 'owner' and removed_at is null and user_id <> p_user
  ) then
    raise exception 'Prosjektet må ha minst én eier. Gjør en annen til eier først.' using errcode = '42501';
  end if;
  update public.project_members
    set role = p_role, can_approve_costs = (p_role = 'owner')
    where project_id = p_project and user_id = p_user;
end $$;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.set_invitation_role(p_invitation uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  if p_role is null or p_role not in ('editor', 'commenter', 'viewer') then
    raise exception 'Ukjent rolle' using errcode = '22023';
  end if;
  select project_id into v_project from public.project_invitations
    where id = p_invitation and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if v_project is null then
    raise exception 'Invitasjonen er tatt imot, trukket tilbake eller utløpt' using errcode = '22023';
  end if;
  if not private.has_project_role(v_project, 'owner') then
    raise exception 'Bare prosjektets eier kan endre invitasjoner' using errcode = '42501';
  end if;
  update public.project_invitations set role = p_role where id = p_invitation;
end $$;
revoke all on function public.set_invitation_role(uuid, text) from public, anon;
grant execute on function public.set_invitation_role(uuid, text) to authenticated;

create or replace function public.revoke_invitation(p_invitation uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
begin
  if (select auth.uid()) is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select project_id into v_project from public.project_invitations
    where id = p_invitation and accepted_at is null and revoked_at is null
    for update;
  if v_project is null then
    raise exception 'Invitasjonen er allerede tatt imot eller trukket tilbake' using errcode = '22023';
  end if;
  if not private.has_project_role(v_project, 'owner') then
    raise exception 'Bare prosjektets eier kan trekke tilbake invitasjoner' using errcode = '42501';
  end if;
  update public.project_invitations set revoked_at = now() where id = p_invitation;
end $$;
revoke all on function public.revoke_invitation(uuid) from public, anon;
grant execute on function public.revoke_invitation(uuid) to authenticated;

insert into public.schema_version (version, description)
  values (20, '0020_member_roles: endre rolle for medlemmer og invitasjoner, trekke tilbake invitasjoner');