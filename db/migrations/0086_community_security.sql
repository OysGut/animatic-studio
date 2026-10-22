-- =====================================================================================
-- From Pen to Glass – migrasjon 0086: S-1 Community-sikkerhet, oppå 0085.
-- Additiv funksjonserstatning og innstramming av eksisterende EXECUTE; ingen data flyttes.
-- Erstatter bare private.can_see_publication(uuid, uuid) og public.publication_for_me(uuid)
-- (siste definisjoner kopiert fra 0080; bare e-posttreff krever email_confirmed_at).
-- Bruker-ID-treff og medlemskap er uendret. Claude kjører i Cloud etter gjennomgang.
-- =====================================================================================

create or replace function private.can_see_publication(p_pub uuid, p_user uuid) returns boolean
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
              and (r.user_id = p_user or r.email = (select lower(u.email) from auth.users u where u.id = p_user and u.email_confirmed_at is not null))))
          or (p.audience = 'public' and private.feature_enabled('community.public', p_user))
        ))
      )
  )
$$;

create or replace function public.publication_for_me(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.publications;
begin
  if (select auth.uid()) is null or not private.can_see_publication(p_id, (select auth.uid())) then
    return null;
  end if;
  select * into v from public.publications where id = p_id;
  update public.publication_recipients set seen_at = coalesce(seen_at, now())
    where publication_id = p_id and (user_id = (select auth.uid())
      or email = (select lower(u.email) from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null));
  return jsonb_build_object(
    'id', v.id, 'title', v.title, 'description', v.description, 'license', v.license,
    'rights', jsonb_build_object('view', v.can_view, 'comment', v.can_comment, 'download', v.can_download, 'remix', v.can_remix),
    'expires_at', v.expires_at,
    'media', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'storage_key', m.storage_key, 'mime', m.mime,
        'duration_ms', m.duration_ms, 'width', m.width, 'height', m.height) order by m.position)
      from public.publication_media m where m.publication_id = p_id), '[]'::jsonb));
end $$;

-- Direkte RLS-kall må fortsatt kunne kjøres av authenticated. Nestede kall fra
-- SECURITY DEFINER og CHECK ved RPC/apply_changes trenger ikke klientens EXECUTE.
revoke execute on function private.publication_open(text, timestamptz, timestamptz),
  private.valid_region(jsonb), private.valid_asset_rights(jsonb)
  from public, anon, authenticated;
-- service_role beholdes også for CHECK ved privilegert skriving.
grant execute on function private.publication_open(text, timestamptz, timestamptz),
  private.valid_region(jsonb), private.valid_asset_rights(jsonb) to service_role;
-- Bevar eksplisitt de fem direkte RLS-avhengighetene fra 0080.
grant execute on function private.feature_enabled(text, uuid), private.any_community(uuid),
  private.blocked_between(uuid, uuid), private.can_see_publication(uuid, uuid),
  private.is_project_editor(uuid, uuid) to authenticated, service_role;

insert into public.schema_version (version, description)
  values (86, '0086_community_security: S-1 bekreftet mottakerepost og minste EXECUTE');
