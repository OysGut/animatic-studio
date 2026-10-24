-- 0115: Fase 5 rester. Ingen begin/commit (verktøyet styrer transaksjonen). 0114 og eldre er låst.
-- C-0: overføringer opp til 512 MiB (direkte opplasting via signerte biter over 64 MiB).
-- C-7: panelretur via C-0-mottaket (panel_id + panelrevisjon på overføringen).
-- C-5: retur fra Storyboard Pro via C-1-retursiden (mål «production» med format «sbpro»).

alter table public.connector_transfers drop constraint connector_transfers_byte_size_check;
alter table public.connector_transfers add constraint connector_transfers_byte_size_check check(byte_size between 1 and 536870912);

alter table public.connector_transfers add column panel_id uuid;
alter table public.connector_transfers add column panel_revision integer check(panel_revision is null or panel_revision >= 0);
-- En overføring går enten til en ressursvariant eller til et panel, aldri begge.
alter table public.connector_transfers add constraint c0_transfers_target_check
 check(panel_id is null or (asset_id is null and variant_id is null));
create index c0_transfers_panel on public.connector_transfers(project_id,panel_id) where panel_id is not null;

alter table public.connector_handoffs drop constraint connector_handoffs_target_kind_check;
alter table public.connector_handoffs add constraint connector_handoffs_target_kind_check check(target_kind in('asset','panel','clip','scene','production'));
alter table public.connector_handoffs drop constraint connector_handoffs_format_check;
alter table public.connector_handoffs add constraint connector_handoffs_format_check check(format in('psd','png','svg','wav','otio','sbpro'));
alter table public.connector_handoffs add column production_id uuid;
-- Målet «production» er alltid en sbpro-returfil knyttet til én produksjon.
alter table public.connector_handoffs add constraint c1_handoffs_production_pair
 check(target_kind<>'production' or (production_id is not null and format='sbpro'));

-- Som handoff_create, men med produksjons-ID for målet «production». Redaktørsjekk og takhøyder som i 0110.
create function public.handoff_create_production(p_id uuid,p_project uuid,p_production uuid,p_adapter text,
 p_file_name text,p_token_hash text,p_expires timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.member_role_rank(p_project,auth.uid()) < private.role_rank('editor') then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_expires<=now() or p_expires>now()+interval '7 days' then raise exception 'handoff expiry' using errcode='22023'; end if;
 perform private.rate_limit_hit('handoff_create',array['u:'||auth.uid()::text]);
 insert into public.connector_handoffs(id,project_id,created_by,target_kind,target_id,production_id,adapter,format,file_name,return_token_hash,expires_at)
 values(p_id,p_project,auth.uid(),'production',p_production,p_production,p_adapter,'sbpro',p_file_name,p_token_hash,p_expires);
end $$;
revoke all on function public.handoff_create_production(uuid,uuid,uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.handoff_create_production(uuid,uuid,uuid,text,text,text,timestamptz) to authenticated;

insert into public.schema_version(version,description) values(115,'Fase 5 rester: 512 MiB-overføringer, panelretur, sbpro-retur');
