-- =====================================================================================
-- Animatic Studio – migrasjon 0116: D1 – klartekstkolonnen film_shares.token fjernes.
-- Bakgrunn: 0070 sluttet å skrive klartekst (nøkkelen avledes av pepper + delings-ID, så QR kan
-- vises igjen uten lagring), og 0097 nullstilte alle eldre klartekstnøkler. Kontroll i Cloud
-- 24.10.2026: 0 rader har token satt. Koden leser ikke kolonnen lenger:
--   * public.activate_film_share og public.revoke_film_share skriver ikke lenger token = null.
--   * public.film_share_token har ikke lenger klartekst-avviket for eldre delinger; den gir den
--     avledede nøkkelen når digesten stemmer, ellers null. Eldre delinger (før 0070) har allerede
--     fått nøklene sine erstattet eller tilbakekalt; lenkene deres virket via hash-oppslag.
--   * private.film_share_backfill_digests hadde klarteksten som eneste kilde og fjernes; det finnes
--     ikke lenger noe å fylle fra.
-- Oppslaget public.film_share_lookup er uendret: eksisterende lenker virker fortsatt via pepret
-- digest, med usaltet hash som fallback for eldre rader uten digest.
-- Til slutt: alter table ... drop column token. Ingen funksjon, test eller appkode refererer
-- kolonnen etter denne migrasjonen. Ingen begin/commit. Ingen SQL mot lagringen.
-- Skrevet for gjennomgang; kjøres ikke i Cloud av Lovable.
-- =====================================================================================

-- ---------- activate_film_share: som 0070, men uten å røre token-kolonnen ----------
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
    set status = 'ready', token_hash = v_digest, token_digest = v_digest,
        activated_at = now(),
        expires_at = case when share_days is null then null else now() + make_interval(days => share_days) end
    where id = p_share;
  return v_token;
end $$;
revoke all on function public.activate_film_share(uuid, bigint) from public, anon;
grant execute on function public.activate_film_share(uuid, bigint) to authenticated;

-- ---------- revoke_film_share: som 0047, men uten å røre token-kolonnen ----------
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
    set status = 'revoked', revoked_at = now(), revoked_by = (select auth.uid())
    where id = p_share and status <> 'revoked';
end $$;
revoke all on function public.revoke_film_share(uuid) from public, anon;
grant execute on function public.revoke_film_share(uuid) to authenticated;

-- ---------- film_share_token: som 0070, men uten klartekst-avviket ----------
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
  if v_row.token_digest is not null
     and v_row.token_digest = private.film_share_digest(private.film_share_derived_token(v_row.id)) then
    return private.film_share_derived_token(v_row.id);
  end if;
  return null;
end $$;
revoke all on function public.film_share_token(uuid) from public, anon;
grant execute on function public.film_share_token(uuid) to authenticated;

-- ---------- Utfyllingshjelperen hadde klarteksten som eneste kilde; ingenting igjen å fylle ----------
drop function if exists private.film_share_backfill_digests();

-- ---------- Selve kolonnen fjernes (ingen gjenværende referanser; Cloud har 0 rader med verdi) ----------
alter table public.film_shares drop column token;

insert into public.schema_version(version,description) values (116,'0116_d1_film_share_token_drop: klartekstkolonnen film_shares.token fjernet; bare pepret hash');
