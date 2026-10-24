-- Minimal emulering av Supabase sitt miljø for lokale databasetester (IKKE en migrasjon).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz default now());
-- 0092: kolonnene Google-vernet leser (finnes i ekte Supabase)
alter table auth.users add column if not exists raw_app_meta_data jsonb, add column if not exists raw_user_meta_data jsonb, add column if not exists encrypted_password text;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase gir som standard alle rettigheter på nye tabeller til disse rollene; migrasjonen må selv stramme inn.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- Minimal storage (24.10): lets storage policies in 0002/0004/0108 be created and tested for real.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text,
  owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
