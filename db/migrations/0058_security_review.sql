-- =====================================================================================
-- Animatic Studio – migrasjon 0058: sikkerhetsgjennomgang Ø-11 (docs/development/SECURITY_REVIEW_2026-10.md).
-- 1. accept_invitation / accept_workspace_invitation: invitasjonen kan bare godtas av brukeren med samme
--    e-postadresse (auth.users.email, trimmet og uten forskjell på store og små bokstaver). Feil e-post gir
--    feilkoden AS403. Engangsbruk og utløp er som før. En eier av prosjektet blir aldri nedgradert av en
--    invitasjon (samme regel som for arbeidsgrupper i 0045).
-- 2. ai_model_settings: innloggede leser bare kolonnene appen bruker (ikke updated_by, administratorens ID).
-- 3. mobile_register_upload / mobile_confirm_upload: tom eller negativ størrelse avvises, og en tilbakekalt
--    eller utløpt økt kan ikke bekrefte flere filer.
-- 4. anon mister lesetilgangen på alle tabeller i public unntatt schema_version og privacy_policy, som
--    skal være åpne før innlogging (RLS ga allerede ingen rader;
--    dette er dybdeforsvar). Nye tabeller får heller ikke anon-tilgang som standard.
-- Erstatter funksjonene accept_invitation, accept_workspace_invitation, mobile_register_upload og
-- mobile_confirm_upload (siste versjoner: 0001, 0045, 0035, 0035). apply_changes, delete_project og
-- purge-funksjonene røres ikke. Ingen SQL mot lagringen (storage). Ingen data endres.
-- Kjøres ÉN gang i Lovable Cloud etter 0057. Endres aldri etter kjøring.
-- =====================================================================================

-- ---------- 1. Invitasjoner krever riktig e-post ----------
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv public.project_invitations;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_inv from public.project_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invitasjonen er ugyldig eller utløpt' using errcode = '22023'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_user;
  if v_email is null or v_email = '' or v_email <> lower(btrim(v_inv.email)) then
    raise exception 'Invitasjonen gjelder en annen e-postadresse' using errcode = 'AS403';
  end if;
  insert into public.project_members (project_id, user_id, role, invited_by)
    values (v_inv.project_id, v_user, v_inv.role, v_inv.invited_by)
    on conflict (project_id, user_id) do update
      set removed_at = null,
          role = case when public.project_members.removed_at is null
                       and public.project_members.role = 'owner' then 'owner' else excluded.role end;
  update public.project_invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  return v_inv.project_id;
end $$;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.accept_workspace_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  v_inv public.workspace_invitations;
begin
  if v_user is null then raise exception 'Ikke innlogget' using errcode = '28000'; end if;
  select * into v_inv from public.workspace_invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found then raise exception 'Invitasjonen er ugyldig eller utløpt' using errcode = '22023'; end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = v_user;
  if v_email is null or v_email = '' or v_email <> lower(btrim(v_inv.email)) then
    raise exception 'Invitasjonen gjelder en annen e-postadresse' using errcode = 'AS403';
  end if;
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

-- ---------- 2. ai_model_settings: bare kolonnene appen trenger ----------
revoke all on public.ai_model_settings from anon, authenticated;
grant select (id, provider, model, enabled, custom, kind, label, price_usd, price_unit, note, updated_at)
  on public.ai_model_settings to authenticated;
grant all on public.ai_model_settings to service_role;

-- ---------- 3. Mobilopplasting ----------
create or replace function public.mobile_register_upload(
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
  if p_bytes is null or p_bytes <= 0 then
    raise exception 'Filen er tom' using errcode = '22023';
  end if;
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

create or replace function public.mobile_confirm_upload(
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
    -- Ø-11: bare en aktiv økt kan bekrefte en fil, og størrelsen må være reell
    if v_s.revoked_at is not null or v_s.expires_at <= now()
       or (v_s.parent_id is not null and exists (select 1 from public.upload_sessions p
             where p.id = v_s.parent_id and p.revoked_at is not null)) then
      raise exception 'Økten er utløpt eller tilbakekalt' using errcode = '28000';
    end if;
    if p_bytes is null or p_bytes <= 0 then
      raise exception 'Filen er tom' using errcode = '22023';
    end if;
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
revoke all on function public.mobile_register_upload(text, uuid, text, text, text, bigint, text, text) from public, anon, authenticated;
revoke all on function public.mobile_confirm_upload(text, uuid, boolean, bigint, text) from public, anon, authenticated;
grant execute on function public.mobile_register_upload(text, uuid, text, text, text, bigint, text, text) to service_role;
grant execute on function public.mobile_confirm_upload(text, uuid, boolean, bigint, text) to service_role;

-- ---------- 4. anon: ingen tabelltilgang utenom schema_version og privacy_policy ----------
do $$
declare
  r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and c.relname not in ('schema_version', 'privacy_policy')
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;

insert into public.schema_version (version, description)
  values (58, '0058_security_review: invitasjoner krever riktig e-post, smalere lesing av AI-modeller, mobilbekreftelse bare i aktiv økt, ingen anon-tabelltilgang');
