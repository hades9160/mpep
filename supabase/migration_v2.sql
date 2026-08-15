-- ============================================================================
-- MPEP v2 migration
-- Run this ONCE in Supabase SQL Editor (Project > SQL Editor > New query),
-- AFTER your original schema.sql has already been run.
-- Safe to run even if you already ran it before — every statement uses
-- IF EXISTS / IF NOT EXISTS guards.
-- ============================================================================

-- 1. The 3rd & 5th Month tracker is now auto-driven from the Probationary
--    employee roster (one row per employee, edited in place) instead of
--    manually "added" per employee. This requires exactly one
--    third_fifth_month row per employee so the app can upsert by
--    employee_id.
--
--    Dedup first: for any employee with more than one row (leftover from
--    the old manual "Add Employee" flow), keep only the most recently
--    created row and delete the rest. This runs automatically and is safe —
--    it only removes duplicates, never an employee's only row.
delete from third_fifth_month t
where t.employee_id is not null
  and t.id in (
    select id from (
      select id, row_number() over (
        partition by employee_id order by created_at desc, id desc
      ) as rn
      from third_fifth_month
      where employee_id is not null
    ) ranked
    where ranked.rn > 1
  );

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'third_fifth_month_employee_id_key'
  ) then
    alter table third_fifth_month
      add constraint third_fifth_month_employee_id_key unique (employee_id);
  end if;
end $$;

-- 2. Progress Highlights has been removed from the app. The table is no
--    longer used. Uncomment the line below if you want to drop it and its
--    data entirely — leave it commented if you'd rather keep the data
--    around (e.g. to export it first) without it affecting the app.

-- drop table if exists progress_highlights;

-- ============================================================================
-- Done.
-- ============================================================================
