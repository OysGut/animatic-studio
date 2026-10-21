-- =====================================================================================
-- Animatic Studio – migrasjon 0070: delingsnøkkelen (GP5, film_shares.token) lagres ikke lenger i klartekst.
-- Erstatter to funksjoner: activate_film_share (0047) og film_share_token (0047). Nye funksjoner:
-- public.film_share_lookup (bare service role) og private.film_share_backfill_digests (kjøres eksplisitt av Claude).
-- apply_changes (0067), create_project (0067), delete_project (0066), purge_project_assets (0067),
-- purge_removed_assets (0065), global_set_version_withdrawn (0068) og revoke_film_share (0047) er uendret.
-- Bare additiv:
--   * private.film_share_secret: én hemmelig «pepper» (32 tilfeldige byte) som bare security-definer-funksjonene
--     leser. Ingen rolle har tilgang til tabellen.
--   * ny kolonne film_shares.token_digest (nullable, unik): SHA-256(pepper || nøkkel). Oppslag skjer via denne.
--   * Nye delinger: nøkkelen avledes fra pepper og delings-ID-en, så QR-koden kan vises igjen uten at nøkkelen
--     lagres. token forblir null; token_hash får samme peppede verdi (sjekken «uploading = token_hash null» holder).
--   * Eldre delinger: oppslaget faller tilbake til token_hash = SHA-256(nøkkel) og fyller token_digest ved første
--     oppslag. Klartekstkolonnen token fjernes ikke i denne runden; den beholdes for eldre delinger, så QR-koden
--     deres fortsatt kan vises. Ingen nye klartekstnøkler skrives.
-- Nøkkelen logges aldri (ingen raise/notice med nøkkelen). Ingen nye filstier. Ingen SQL mot lagringen.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- =====================================================================================

create table if not exists private.film_share_secret (
  id boolean primary key default true check (id),
  pepper bytea not null check (length(pepper) = 32)
);
revoke all on private.film_share_secret from public, anon, authenticated;
insert into private.film_share_secret (id, pepper)
  values (true, sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')))
  on conflict (id) do nothing;

alter table public.film_shares add column if not exists token_digest text;
alter table public.film_shares drop constraint if exists film_shares_token_digest_len;
alter table public.film_shares add constraint film_shares_token_digest_len
  check (token_digest is null or length(token_digest) = 64);
create unique index if not exists film_shares_token_digest_key on public.film_shares (token_digest)
  where token_digest is not null;
comment on column public.film_shares.token_digest is
  'GP5 (0070): SHA-256(pepper || nøkkel). Oppslag skjer bare via denne. Null for eldre delinger til første oppslag.';
comment on column public.film_shares.token is
  'DEPRECATED (0070): skrives ikke lenger. Beholdes bare for eldre delinger (QR-visning).';

-- Hjelpere (ingen tilgang for klienten)
create or replace function private.film_share_digest(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256((select pepper from private.film_share_secret where id) || convert_to(p_token, 'UTF8')), 'hex')
$$;
create or replace function private.film_share_derived_token(p_share uuid) returns text
language sql stable security definer set search_path = '' as $$
  select encode(sha256((select pepper from private.film_share_secret where id)
    || convert_to('film-share:' || p_share::text, 'UTF8')), 'hex')
$$;
revoke all on function private.film_share_digest(text) from public, anon, authenticated;
revoke all on function private.film_share_derived_token(uuid) from public, anon, authenticated;

-- ---------- activate_film_share: som 0047, men nøkkelen lagres ikke ----------
create or replace function public.activate_film_share(p_share uuid, p_byte_size bigint)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.film_shares;
  v_token text := private.film_share_derived_token(p_share);
  v_digest text := private.film_share_digest(private.film_share_derived_token(p_share));
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
    set status = 'ready', token = null, token_hash = v_digest, token_digest = v_digest,
        activated_at = now(),
        expires_at = case when share_days is null then null else now() + make_interval(days => share_days) end
    where id = p_share;
  return v_token;
end $$;
revoke all on function public.activate_film_share(uuid, bigint) from public, anon;
grant execute on function public.activate_film_share(uuid, bigint) to authenticated;

-- ---------- film_share_token: som 0047; eldre delinger gir lagret nøkkel, nye avledes ----------
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
  if v_row.token is not null then
    return v_row.token;
  end if;
  if v_row.token_digest is not null
     and v_row.token_digest = private.film_share_digest(private.film_share_derived_token(v_row.id)) then
    return private.film_share_derived_token(v_row.id);
  end if;
  return null;
end $$;
revoke all on function public.film_share_token(uuid) from public, anon;
grant execute on function public.film_share_token(uuid) to authenticated;

-- ---------- Oppslag for den offentlige siden (bare service role i serverfunksjonen) ----------
-- Gir delings-ID-en eller null. Eldre deling: finnes via usaltet hash, og token_digest fylles ved første oppslag.
create or replace function public.film_share_lookup(p_token text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_digest text;
  v_id uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  v_digest := private.film_share_digest(p_token);
  select id into v_id from public.film_shares where token_digest = v_digest;
  if v_id is not null then
    return v_id;
  end if;
  select id into v_id from public.film_shares
    where token_digest is null and token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if v_id is not null then
    update public.film_shares set token_digest = v_digest where id = v_id and token_digest is null;
  end if;
  return v_id;
end $$;
revoke all on function public.film_share_lookup(text) from public, anon, authenticated;
grant execute on function public.film_share_lookup(text) to service_role;

-- ---------- Eksplisitt utfylling for eldre delinger (kjøres av Claude: select private.film_share_backfill_digests()) ----------
create or replace function private.film_share_backfill_digests()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.film_shares
    set token_digest = private.film_share_digest(token)
    where token_digest is null and token is not null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.film_share_backfill_digests() from public, anon, authenticated;

insert into public.schema_version(version,description) values (70,'0070_film_share_digest: delingsnøkkelen lagres bare som pepret hash');
