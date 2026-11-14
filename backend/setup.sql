-- Bierwart · Abgleich über mehrere Geräte
-- Einmal im SQL Editor des Supabase-Projekts ausführen (kann das Zeitwerk-Projekt sein).
-- Ein gemeinsamer Datensatz je Team. Lesen und Schreiben nur für angemeldete Benutzer,
-- die in bierwart_members eingetragen sind. Kein anonymer Zugriff.
begin;

create table if not exists public.bierwart_documents (
  team text primary key check (team ~ '^[a-z0-9-]{3,40}$'),
  version bigint not null check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  operation_id uuid not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.bierwart_members (
  team text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (team, user_id)
);

alter table public.bierwart_documents enable row level security;
alter table public.bierwart_members enable row level security;
revoke all on public.bierwart_documents from anon, authenticated;
revoke all on public.bierwart_members from anon, authenticated;
grant select on public.bierwart_documents to authenticated;
grant select on public.bierwart_members to authenticated;

drop policy if exists bierwart_members_read_own on public.bierwart_members;
create policy bierwart_members_read_own on public.bierwart_members
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists bierwart_documents_read_team on public.bierwart_documents;
create policy bierwart_documents_read_team on public.bierwart_documents
  for select to authenticated using (
    exists (select 1 from public.bierwart_members m
            where m.team = bierwart_documents.team and m.user_id = (select auth.uid())));

create schema if not exists bierwart_private;
revoke all on schema bierwart_private from public, anon;
grant usage on schema bierwart_private to authenticated;

create or replace function bierwart_private.write_document(p_team text, p_expected bigint, p_body jsonb, p_operation uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); v_doc public.bierwart_documents%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.bierwart_members where team = p_team and user_id = v_uid) then
    raise exception 'Not a member of this team' using errcode = '42501';
  end if;
  if p_expected is null or p_expected < 0 or p_operation is null or p_body is null
     or jsonb_typeof(p_body) is distinct from 'object'
     or jsonb_typeof(p_body->'deliveries') is distinct from 'array'
     or jsonb_typeof(p_body->'debts') is distinct from 'array'
     or jsonb_typeof(p_body->'members') is distinct from 'array'
     or octet_length(p_body::text) > 5000000 then
    raise exception 'Invalid Bierwart document';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bierwart:' || p_team, 0));
  select * into v_doc from public.bierwart_documents where team = p_team;
  if found then
    if v_doc.operation_id = p_operation then
      return jsonb_build_object('ok', true, 'version', v_doc.version);
    end if;
    if v_doc.version <> p_expected then
      return jsonb_build_object('ok', false, 'conflict', true);
    end if;
    update public.bierwart_documents
       set body = p_body, version = version + 1, operation_id = p_operation, updated_by = v_uid, updated_at = now()
     where team = p_team returning * into v_doc;
  else
    if p_expected <> 0 then return jsonb_build_object('ok', false, 'conflict', true); end if;
    insert into public.bierwart_documents(team, version, body, operation_id, updated_by)
    values (p_team, 1, p_body, p_operation, v_uid) returning * into v_doc;
  end if;
  return jsonb_build_object('ok', true, 'version', v_doc.version);
end $fn$;
revoke all on function bierwart_private.write_document(text, bigint, jsonb, uuid) from public, anon;
grant execute on function bierwart_private.write_document(text, bigint, jsonb, uuid) to authenticated;

create or replace function public.bierwart_write(p_team text, p_expected bigint, p_body jsonb, p_operation uuid)
returns jsonb language sql security invoker set search_path = '' as $fn$
  select bierwart_private.write_document(p_team, p_expected, p_body, p_operation);
$fn$;
revoke all on function public.bierwart_write(text, bigint, jsonb, uuid) from public, anon;
grant execute on function public.bierwart_write(text, bigint, jsonb, uuid) to authenticated;

commit;

-- Mitglieder freischalten: E-Mail-Adresse(n) eintragen und ausführen.
-- Der Benutzer muss vorher unter Authentication → Users existieren (einladen oder anlegen).
insert into public.bierwart_members (team, user_id)
select 'tv-anrath', id from auth.users where email in ('DEINE-EMAIL@example.com')
on conflict do nothing;
