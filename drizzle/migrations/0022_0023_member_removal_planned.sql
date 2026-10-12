-- =====================================================================================
-- Animatic Studio – migrasjon 0023: fjerne medlem og planlagt lengde per scene (natt til 12.10.2026).
-- 1. public.remove_member: eieren fjerner et medlem fra prosjektet (REQ-0529). Ikke-destruktivt: bare
--    medlemskapet avsluttes (removed_at); alt personen har laget, og historikken, står. Prosjektet må
--    alltid ha minst én eier, og man fjerner ikke seg selv (bruk «Forlat prosjektet»). Ventende
--    invitasjoner personen har laget eller som gjelder personens e-post, trekkes tilbake. En ny invitasjon
--    fra eieren gir tilgang igjen.
-- 2. scene_occurrences.planned_ms: brukerens planlagte lengde for scenen (mandat 7.1–7.2, REQ-0111/0113).
--    apply_changes håndterer kolonnen uten endring (den bruker tabellens kolonner).
-- Ingen eksisterende data endres. Ingen SQL mot lagringen (storage).
-- Kjøres ÉN gang i Lovable Cloud etter 0022. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.scene_occurrences add column if not exists planned_ms integer
  check (planned_ms is null or planned_ms between 1000 and 36000000);

create or replace function public.remove_member(p_project uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
begin
  if v_actor is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  -- Medlemsendringer i samme prosjekt etter hverandre (som set_member_role)
  perform 1 from public.projects where id = p_project and deleted_at is null for no key update;
  if not found then raise exception 'Prosjektet finnes ikke eller er slettet' using errcode = '22023'; end if;
  if not private.is_active_owner(p_project, v_actor) then
    raise exception 'Bare prosjektets eier kan fjerne medlemmer' using errcode = '42501';
  end if;
  if p_user = v_actor then
    raise exception 'Du kan ikke fjerne deg selv. Bruk «Forlat prosjektet».' using errcode = '22023';
  end if;
  select role into v_role from public.project_members
    where project_id = p_project and user_id = p_user and removed_at is null;
  if v_role is null then raise exception 'Personen er ikke medlem av prosjektet' using errcode = '22023'; end if;
  update public.project_members set removed_at = now()
    where project_id = p_project and user_id = p_user;
  -- Ventende invitasjoner personen har laget eller som gjelder personens e-post, trekkes tilbake (en
  -- invitasjon er en nøkkel: ellers kunne personen komme inn igjen med en av dem)
  update public.project_invitations i set revoked_at = now()
    where i.project_id = p_project and i.accepted_at is null and i.revoked_at is null
      and (i.invited_by = p_user
           or lower(i.email) = (select lower(u.email) from auth.users u where u.id = p_user));
end $$;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

insert into public.schema_version (version, description)
  values (23, '0023_member_removal_planned: fjerne medlem, planlagt lengde per scene');