-- C-5 Toon Boom Storyboard Pro (skriptpakke). Skriptet logger inn med enhetsflyten fra C-0 (ingen nettleser
-- i Storyboard Pro), og returen blir kandidater. Ingenting tas i bruk automatisk: «Bruk innkommende» kjører
-- vanlige, angrebare kommandoer i appen, og funksjonen under endrer bare kandidatens status.
-- Takhøyde: alt er per prosjekt og per retur (ingen globale køer); kildeverdien åpner for flere skriptprogrammer.
-- Ingen begin/commit (verktøyet styrer transaksjonen). 0111 og eldre er låst.

insert into private.connector_clients(client_id,name,redirect_patterns) values
 ('ptg.toonboom-sbpro','Toon Boom Storyboard Pro',array['^http://(127\.0\.0\.1|\[::1\]):[0-9]{1,5}(/[^#]*)?$','^ptg-toonboom-sbpro://[^#]*$'])
on conflict (client_id) do nothing;

create table public.connector_returns (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 production_id uuid not null,
 source text not null check(source in('sbpro')),
 session_id uuid,
 created_by uuid not null,
 manifest_hash text not null check(manifest_hash ~ '^[0-9a-f]{64}$'),
 panel_count integer not null check(panel_count between 1 and 5000),
 created_at timestamptz not null default now(),
 unique(project_id,source,manifest_hash)
);
revoke all on public.connector_returns from public,anon,authenticated;
grant select on public.connector_returns to authenticated;
grant all on public.connector_returns to service_role;
alter table public.connector_returns enable row level security;
create policy c5_returns_read on public.connector_returns for select to authenticated using(project_id in(select private.my_project_ids()));
create index connector_returns_project_idx on public.connector_returns(project_id,created_at desc);

create table public.connector_panel_candidates (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 return_id uuid not null references public.connector_returns(id) on delete cascade,
 item_key text not null check(length(item_key) between 1 and 160),
 panel_id uuid,
 kind text not null check(kind in('text','timing','image','new_panel','conform')),
 incoming jsonb not null default '{}' check(jsonb_typeof(incoming)='object' and pg_column_size(incoming)<=512000),
 media_path text check(media_path is null or length(media_path)<=500),
 media_sha256 text check(media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$'),
 media_bytes bigint check(media_bytes is null or media_bytes between 1 and 26214400),
 conflict boolean not null default false,
 status text not null default 'open' check(status in('awaiting_file','open','resolved','rejected')),
 choice text check(choice is null or choice in('keep_both','choose_current','choose_incoming','reject')),
 revision integer not null default 1,
 resolved_by uuid,
 resolved_at timestamptz,
 created_at timestamptz not null default now(),
 unique(return_id,kind,item_key)
);
revoke all on public.connector_panel_candidates from public,anon,authenticated;
grant select on public.connector_panel_candidates to authenticated;
grant all on public.connector_panel_candidates to service_role;
alter table public.connector_panel_candidates enable row level security;
create policy c5_candidates_read on public.connector_panel_candidates for select to authenticated using(project_id in(select private.my_project_ids()));
create index connector_panel_candidates_open_idx on public.connector_panel_candidates(project_id,status,created_at);

-- Brukerens valg (de tre fra C-0 + avvis). Krever redaktør; revisjonen hindrer dobbeltvalg.
create function public.connector_resolve_panel_candidate(p_id uuid,p_choice text,p_revision integer) returns text language plpgsql security definer set search_path='' as $$
declare c public.connector_panel_candidates;
begin
 if p_choice not in('keep_both','choose_current','choose_incoming','reject') then return 'choice'; end if;
 select * into c from public.connector_panel_candidates where id=p_id for update;
 if not found then return 'not_found'; end if;
 if private.member_role_rank(c.project_id,(select auth.uid())) < private.role_rank('editor') then return 'forbidden'; end if;
 if c.revision<>p_revision or c.status<>'open' then return 'stale'; end if;
 update public.connector_panel_candidates set status=case when p_choice='reject' then 'rejected' else 'resolved' end,choice=p_choice,
  resolved_by=(select auth.uid()),resolved_at=now(),revision=revision+1 where id=p_id;
 return 'ok';
end $$;
revoke all on function public.connector_resolve_panel_candidate(uuid,text,integer) from public,anon;
grant execute on function public.connector_resolve_panel_candidate(uuid,text,integer) to authenticated,service_role;

insert into public.schema_version(version,description) values(113,'C-5 Storyboard Pro script package');
