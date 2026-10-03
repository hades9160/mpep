-- ============================================================================
-- MPEP — Activity Log
-- Run this ONCE in Supabase SQL Editor. Safe to run even if you're not sure
-- whether it's been run before (IF NOT EXISTS guards throughout).
--
-- Records every Create/Update/Delete made anywhere in the app — who did it,
-- what they changed, and when — shown on the new "Activity Log" tab.
-- ============================================================================

create table if not exists activity_log (
  id          uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action      text not null,              -- 'created' | 'updated' | 'deleted' | 'imported' | 'restored'
  entity      text not null,              -- human label, e.g. 'Employee', 'Evaluation', 'HR Attention record'
  summary     text not null,              -- short human-readable description, e.g. 'Juan Dela Cruz'
  details     text,                       -- optional extra context
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_log_created_at on activity_log(created_at desc);

alter table activity_log enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'activity_log' and policyname = 'authenticated_full_access'
  ) then
    create policy "authenticated_full_access" on activity_log
      for all using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end $$;

-- ============================================================================
-- Done. The app writes to this table automatically going forward — nothing
-- else to configure.
-- ============================================================================
