-- ============================================================================
-- MPEP — Activity Log
-- Run this ONCE in Supabase > SQL Editor. Safe to re-run.
--
-- Records every add / edit / delete on Employees, Evaluations, HR Attention
-- and 3rd & 5th Month (including changes made by Bulk Import and Restore),
-- plus sign-ins and sign-outs. The log is read-only from the app: nobody can
-- edit or delete log rows through the dashboard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- If an older/different "activity_log" table already exists (one without the
-- user_id column), keep it safely under a new name instead of deleting it.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'public' and table_name = 'activity_log')
     and not exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'activity_log'
                and column_name = 'user_id') then
    execute 'alter table public.activity_log rename to activity_log_old_' || to_char(now(), 'YYYYMMDD_HH24MISS');
    drop index if exists public.idx_activity_log_created;
  end if;
end $$;

create table if not exists activity_log (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  user_id       uuid,
  user_email    text,
  action        text not null check (action in ('CREATE','UPDATE','DELETE','LOGIN','LOGOUT')),
  table_name    text,
  record_id     uuid,
  record_label  text,
  changes       jsonb
);

create index if not exists idx_activity_log_created on activity_log (created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger function: writes one log row per changed record.
-- SECURITY DEFINER so it can write to the log even though app users cannot.
-- ---------------------------------------------------------------------------
create or replace function log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_row     jsonb;
  v_old     jsonb;
  v_action  text;
  v_email   text;
  v_label   text;
  v_emp     text;
  v_changes jsonb;
begin
  if TG_OP = 'INSERT' then
    v_action := 'CREATE'; v_row := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_action := 'UPDATE'; v_row := to_jsonb(NEW); v_old := to_jsonb(OLD);
  else
    v_action := 'DELETE'; v_row := to_jsonb(OLD);
  end if;

  -- Who did it (from the logged-in user's token; SQL Editor changes show as such)
  v_email := coalesce(nullif(auth.jwt() ->> 'email', ''), 'system (SQL / admin)');

  -- Human-readable label for the record
  if TG_TABLE_NAME = 'employees' then
    v_label := v_row ->> 'name';
  else
    select name into v_emp from employees where id = (v_row ->> 'employee_id')::uuid;
    v_label := coalesce(v_emp, 'Unknown employee');
    if v_row ? 'reporting_month' and (v_row ->> 'reporting_month') is not null then
      v_label := v_label || ' · ' || to_char((v_row ->> 'reporting_month')::date, 'Mon YYYY');
    end if;
  end if;

  -- For edits: only the fields that actually changed
  if v_action = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('from', v_old -> n.key, 'to', n.value))
      into v_changes
      from jsonb_each(v_row) n
     where n.key not in ('updated_at')
       and (v_old -> n.key) is distinct from n.value;
    if v_changes is null then
      return NEW;  -- nothing really changed (e.g. a restore re-saving identical data)
    end if;
  end if;

  insert into activity_log (user_id, user_email, action, table_name, record_id, record_label, changes)
  values (auth.uid(), v_email, v_action, TG_TABLE_NAME, (v_row ->> 'id')::uuid, v_label, v_changes);

  return coalesce(NEW, OLD);
end $$;

-- ---------------------------------------------------------------------------
-- Attach to the live tables
-- ---------------------------------------------------------------------------
drop trigger if exists trg_log_employees   on employees;
drop trigger if exists trg_log_evaluations on evaluations;
drop trigger if exists trg_log_hr          on hr_attention;
drop trigger if exists trg_log_tf          on third_fifth_month;

create trigger trg_log_employees   after insert or update or delete on employees
  for each row execute function log_activity();
create trigger trg_log_evaluations after insert or update or delete on evaluations
  for each row execute function log_activity();
create trigger trg_log_hr          after insert or update or delete on hr_attention
  for each row execute function log_activity();
create trigger trg_log_tf          after insert or update or delete on third_fifth_month
  for each row execute function log_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security: logged-in users can READ the log, and can only INSERT
-- their own LOGIN / LOGOUT rows. No update or delete policy exists, so the
-- log cannot be altered from the app.
-- ---------------------------------------------------------------------------
alter table activity_log enable row level security;

drop policy if exists "activity_log_read"       on activity_log;
drop policy if exists "activity_log_auth_event" on activity_log;

create policy "activity_log_read" on activity_log
  for select to authenticated using (true);

create policy "activity_log_auth_event" on activity_log
  for insert to authenticated
  with check (action in ('LOGIN','LOGOUT') and user_id = auth.uid());
