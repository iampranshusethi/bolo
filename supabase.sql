-- Bolo database setup. Paste all of this into Supabase → SQL Editor → Run.
-- One table holds each app (definition, entries, past versions).
-- The public key can't read the table directly: it can only fetch or save one app by its unguessable id,
-- through the two functions below, so nobody can list other people's apps.

create table if not exists public.apps (
  id         text primary key,
  spec       jsonb not null,
  rows       jsonb not null default '[]'::jsonb,
  versions   jsonb not null default '[]'::jsonb,
  lang       text,
  updated_at timestamptz not null default now()
);

alter table public.apps enable row level security;
revoke all on public.apps from anon, authenticated;

create or replace function public.get_app(p_id text)
returns setof public.apps
language sql security definer set search_path = public
as $$ select * from public.apps where id = p_id and length(p_id) >= 20 $$;

create or replace function public.save_app(p_id text, p_spec jsonb, p_rows jsonb, p_versions jsonb, p_lang text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if length(p_id) < 20 then raise exception 'bad id'; end if;
  insert into public.apps (id, spec, rows, versions, lang, updated_at)
  values (p_id, p_spec, coalesce(p_rows, '[]'::jsonb), coalesce(p_versions, '[]'::jsonb), p_lang, now())
  on conflict (id) do update
    set spec = excluded.spec, rows = excluded.rows, versions = excluded.versions,
        lang = excluded.lang, updated_at = now();
end $$;

revoke all on function public.get_app(text) from public;
revoke all on function public.save_app(text, jsonb, jsonb, jsonb, text) from public;
grant execute on function public.get_app(text) to anon, authenticated;
grant execute on function public.save_app(text, jsonb, jsonb, jsonb, text) to anon, authenticated;
