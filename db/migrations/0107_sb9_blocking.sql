-- SB-9: kompakt blokking og paneloverganger; 0106 og eldre er låst.
create function private.validate_sb9_blocking(p_project uuid,p_changes jsonb,p_ids uuid[]) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare c record; b jsonb; v jsonb; a jsonb; n text;
begin
 for c in select storyboard from public.compositions where project_id=p_project and id in (select (r->>'id')::uuid from jsonb_array_elements(coalesce(p_changes->'inserts'->'compositions','[]')||coalesce(p_changes->'updates'->'compositions','[]')) r) loop
  b:=c.storyboard->'blocking';
  if b is not null and b <> 'null'::jsonb then
   if jsonb_typeof(b) is distinct from 'object' or octet_length(b::text)>10000 then raise exception 'Invalid blocking size' using errcode='22023'; end if;
   foreach n in array array['width','height'] loop
    if jsonb_typeof(b->n) is distinct from 'number' or (b->>n)::numeric<=0 or (b->>n)::numeric>10000 then raise exception 'Invalid blocking extent' using errcode='22023'; end if;
   end loop;
   foreach n in array array['walls','objects','characters','cameras'] loop
    if jsonb_typeof(b->n) is distinct from 'array' then raise exception 'Invalid blocking collection' using errcode='22023'; end if;
   end loop;
   if jsonb_array_length(b->'walls')>100 or jsonb_array_length(b->'objects')>50 or jsonb_array_length(b->'characters')>50 or jsonb_array_length(b->'cameras')>20 then raise exception 'Blocking limit' using errcode='22023'; end if;
   for v in select value from jsonb_array_elements(b->'walls') loop
    if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>4 then raise exception 'Invalid wall' using errcode='22023'; end if;
    for a in select value from jsonb_array_elements(v) loop
     if jsonb_typeof(a)<>'number' or abs((a#>>'{}')::numeric)>10000 then raise exception 'Invalid wall coordinate' using errcode='22023'; end if;
    end loop;
   end loop;
   foreach n in array array['objects','characters','cameras'] loop
    for v in select value from jsonb_array_elements(b->n) loop
     if jsonb_typeof(v)<>'object' then raise exception 'Invalid blocking item' using errcode='22023'; end if;
     for a in select to_jsonb(k) from unnest(case n when 'objects' then array['x','y','width','height'] when 'characters' then array['x','y','facing'] else array['x','y','heading','focal','sensor'] end) k loop
      if jsonb_typeof(v->(a#>>'{}')) is distinct from 'number' or abs((v->>(a#>>'{}'))::numeric)>10000 then raise exception 'Invalid blocking number' using errcode='22023'; end if;
     end loop;
     if n='objects' and (jsonb_typeof(v->'name') is distinct from 'string' or length(v->>'name')>100 or (v->>'width')::numeric<=0 or (v->>'height')::numeric<=0) then raise exception 'Invalid blocking object' using errcode='22023'; end if;
     if n<>'objects' and (jsonb_typeof(v->'id') is distinct from 'string' or length(v->>'id')>100) then raise exception 'Invalid blocking identity' using errcode='22023'; end if;
     if n='characters' then
      if not exists(select 1 from public.assets where project_id=p_project and id::text=v->>'id' and not removed and kind='character') then raise exception 'Invalid blocking character' using errcode='22023'; end if;
      if v->'movement' is distinct from 'null'::jsonb then
       if jsonb_typeof(v->'movement') is distinct from 'number' or abs((v->>'movement')::numeric)>10000 then raise exception 'Invalid movement' using errcode='22023'; end if;
      end if;
     end if;
     if n='cameras' and ((v->>'focal')::numeric<=0 or (v->>'sensor')::numeric<=0) then raise exception 'Invalid lens' using errcode='22023'; end if;
    end loop;
    if n<>'objects' and (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(b->n)) then raise exception 'Duplicate blocking identity' using errcode='22023'; end if;
   end loop;
   if not (b ? 'cameraId' and b ? 'axis') then raise exception 'Missing blocking links' using errcode='22023'; end if;
   if b->'cameraId' is distinct from 'null'::jsonb and not exists(select 1 from jsonb_array_elements(b->'cameras') cam where cam->>'id'=b->>'cameraId') then raise exception 'Invalid camera link' using errcode='22023'; end if;
   if b->'axis' is distinct from 'null'::jsonb then
    if jsonb_typeof(b->'axis') is distinct from 'array' or jsonb_array_length(b->'axis')<>2 then raise exception 'Invalid axis' using errcode='22023'; end if;
    if b->'axis'->0=b->'axis'->1 or exists(select 1 from jsonb_array_elements(b->'axis') ax where not exists(select 1 from jsonb_array_elements(b->'characters') ch where ch->'id'=ax)) then raise exception 'Invalid axis character' using errcode='22023'; end if;
   end if;
   if jsonb_typeof(b->'approvals') is distinct from 'object' then raise exception 'Invalid approvals' using errcode='22023'; end if;
   if (select count(*) from jsonb_each(b->'approvals'))>30 or exists(select 1 from jsonb_each(b->'approvals') approval where length(approval.key)>2000 or jsonb_typeof(approval.value)<>'string' or length(btrim(approval.value#>>'{}'))=0 or length(approval.value#>>'{}')>500) then raise exception 'Invalid approval reason' using errcode='22023'; end if;
  end if;
  v:=c.storyboard->'transition';
  if v is not null and v<>'null'::jsonb then
   if jsonb_typeof(v)<>'object' or coalesce(v->>'kind','') not in ('cut','dissolve','dip','dipWhite','wipe') or jsonb_typeof(v->'frames') is distinct from 'number' or jsonb_typeof(v->'overlap') is distinct from 'boolean' then raise exception 'Invalid panel transition' using errcode='22023'; end if;
   if (v->>'frames')::numeric<0 or (v->>'frames')::numeric>600 or trunc((v->>'frames')::numeric)<>(v->>'frames')::numeric or (v->>'kind'='cut' and (v->>'frames')::numeric<>0) or (v ? 'direction' and coalesce(v->>'direction','') not in ('left','right','up','down')) then raise exception 'Invalid transition geometry' using errcode='22023'; end if;
  end if;
 end loop;
end $$;
revoke all on function private.validate_sb9_blocking(uuid,jsonb,uuid[]) from public;
insert into private.apply_change_validators(table_name,validator,preparer,sort_order) values ('compositions','private.validate_sb9_blocking'::regproc,null,110);
insert into public.schema_version(version,description) values (107,'SB-9 blocking and panel transitions');
