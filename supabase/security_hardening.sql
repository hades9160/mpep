-- ============================================================================
-- MPEP — Security hardening
-- Run once in Supabase > SQL Editor (MPEP project), AFTER schema.sql and
-- activity_log.sql. Safe to re-run.
--
-- It does NOT delete or change any employee / evaluation / HR data. It only:
--   1. Adds an allow-list of who may use the app (pre-filled with every
--      account that exists today, so nobody currently using it is locked out).
--   2. Replaces "any logged-in user can do anything" with "only allow-listed
--      users can do anything". Before this, anyone who signed up through the
--      public anon key would have had full read/write/delete access.
--   3. Makes the activity log append-only (no edits or deletes, even by staff).
--   4. Adds a recycle bin: every deleted row is copied in full to
--      deleted_records first, including rows removed by cascades.
--   5. Makes the summary views respect Row Level Security.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Allow-list
-- ---------------------------------------------------------------------------
create table if not exists app_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text,
  added_at  timestamptz not null default now()
);
alter table app_users enable row level security;

-- First run only: allow every account that already exists. Later runs leave
-- the list alone, so accounts created afterwards are NOT added automatically.
do $$
begin
  if not exists (select 1 from app_users) then
    insert into app_users (user_id, email)
    select id, email from auth.users;
  end if;
end $$;

create or replace function mpep_is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_users where user_id = auth.uid());
$$;
revoke execute on function mpep_is_allowed() from public, anon;
grant execute on function mpep_is_allowed() to authenticated;

drop policy if exists "app_users_read_self" on app_users;
create policy "app_users_read_self" on app_users
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Data tables: replace every existing policy with an allow-list check.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  p text;
begin
  foreach t in array array['employees','evaluations','hr_attention',
                           'progress_highlights','third_fifth_month','sign_off']
  loop
    continue when to_regclass('public.' || t) is null;
    execute format('alter table %I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', p, t);
    end loop;
    execute format(
      'create policy "allowed_users_full_access" on %I for all to authenticated
         using (mpep_is_allowed()) with check (mpep_is_allowed())', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Activity log: allow-listed users can read and add; nobody can edit or
--    delete through the API.
-- ---------------------------------------------------------------------------
do $$
declare
  p text;
  has_user_id boolean;
begin
  if to_regclass('public.activity_log') is null then return; end if;

  alter table activity_log enable row level security;
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'activity_log' loop
    execute format('drop policy %I on activity_log', p);
  end loop;

  create policy "activity_log_read" on activity_log
    for select to authenticated using (mpep_is_allowed());

  select exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'activity_log' and column_name = 'user_id')
    into has_user_id;

  if has_user_id then
    -- activity_log.sql layout: data changes are written by the trigger, the
    -- app only adds its own sign-in / sign-out rows.
    create policy "activity_log_auth_event" on activity_log
      for insert to authenticated
      with check (mpep_is_allowed() and action in ('LOGIN','LOGOUT') and user_id = auth.uid());
  else
    -- add_activity_log.sql layout: the app writes the rows itself.
    create policy "activity_log_insert" on activity_log
      for insert to authenticated with check (mpep_is_allowed());
  end if;

  revoke update, delete, truncate on activity_log from anon, authenticated;
  revoke all on activity_log from anon;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Recycle bin
-- ---------------------------------------------------------------------------
create table if not exists deleted_records (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   text,
  row_data    jsonb not null,
  deleted_by  text,
  deleted_at  timestamptz not null default now()
);
create index if not exists idx_deleted_records_at on deleted_records (deleted_at desc);
alter table deleted_records enable row level security;

drop policy if exists "deleted_records_read" on deleted_records;
create policy "deleted_records_read" on deleted_records
  for select to authenticated using (mpep_is_allowed());
revoke insert, update, delete, truncate on deleted_records from anon, authenticated;

create or replace function archive_deleted_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into deleted_records (table_name, record_id, row_data, deleted_by)
  values (TG_TABLE_NAME, to_jsonb(OLD) ->> 'id', to_jsonb(OLD),
          coalesce(nullif(auth.jwt() ->> 'email', ''), 'system (SQL / admin)'));
  return OLD;
end $$;

do $$
declare t text;
begin
  foreach t in array array['employees','evaluations','hr_attention',
                           'progress_highlights','third_fifth_month','sign_off']
  loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists trg_archive_%s on %I', t, t);
    execute format('create trigger trg_archive_%s before delete on %I
                      for each row execute function archive_deleted_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Views run with the caller's permissions, so RLS applies to them too.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.v_status_summary') is not null then
    alter view v_status_summary set (security_invoker = true);
  end if;
  if to_regclass('public.v_category_summary') is not null then
    alter view v_category_summary set (security_invoker = true);
  end if;
end $$;

commit;

-- ============================================================================
-- After running:
--   * Check who is allowed:   select * from app_users;
--     Remove anyone you don't recognise:  delete from app_users where email = '...';
--   * Give a new staff member access (after creating them in Authentication > Users):
--       insert into app_users (user_id, email)
--       select id, email from auth.users where email = 'new.person@company.com';
--   * Supabase > Authentication > Sign In / Providers: turn OFF "Allow new users to sign up".
--   * See what was deleted:   select * from deleted_records order by deleted_at desc;
-- ============================================================================
