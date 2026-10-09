-- =====================================================================================
-- Animatic Studio – migrasjon 0006: filstørrelse på bildeversjoner flyttes helt til byte_size_big.
-- Etter 0005 står den utgåtte kolonnen byte_size fortsatt med NOT NULL og 50 MB-grensen, og den nye
-- byte_size_big er påkrevd. Da kan ingen bilder lastes opp (den ene eller den andre mangler).
-- 1. byte_size blir valgfri og mister 50 MB-grensen (den beholdes bare for gamle rader).
-- 2. Hvis en eldre utgave av appen bare sender byte_size, fylles byte_size_big automatisk.
-- Ingen data endres eller slettes. Kjøres ÉN gang i Lovable Cloud etter 0005. Endres aldri etter kjøring.
-- =====================================================================================

alter table public.asset_versions alter column byte_size drop not null;
alter table public.asset_versions drop constraint if exists asset_versions_byte_size_check;

create or replace function private.asset_versions_fill_size()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.byte_size_big is null then
    new.byte_size_big := new.byte_size;
  end if;
  return new;
end;
$$;

drop trigger if exists asset_versions_fill_size on public.asset_versions;
create trigger asset_versions_fill_size before insert on public.asset_versions
  for each row execute function private.asset_versions_fill_size();

insert into public.schema_version (version, description) values (6, '0006_byte_size_big: filstørrelse på bildeversjoner i byte_size_big (opptil 2 GB i appen)');