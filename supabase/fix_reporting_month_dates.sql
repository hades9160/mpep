-- ============================================================================
-- MPEP — one-time data repair for the reporting_month timezone bug
-- Run this ONCE in Supabase SQL Editor.
--
-- Background: before a recent code fix, the app's Reporting Month selector
-- built its dates using Date.toISOString(), which converts to UTC first.
-- For UTC+8 timezones (Philippines), that silently shifted the stored date
-- back by one day — so picking "August 2026" actually saved 2026-07-31
-- instead of 2026-08-01. The CODE is already fixed (every new record saves
-- correctly), but any records created before the fix are still stuck on
-- the wrong day and need to be corrected here.
--
-- What this does: reporting_month is always supposed to be the 1st of a
-- month. Any row where it ISN'T the 1st is a row affected by this bug —
-- nudging it forward by one day restores the month it was actually meant
-- to represent. This only touches rows with the bug; anything already
-- correct (day = 1) is left alone.
-- ============================================================================

-- Preview affected rows first (safe, read-only) — run this block alone to
-- see what will change before applying the fix below.
select 'evaluations' as table_name, id, employee_id, reporting_month,
       (reporting_month + interval '1 day')::date as corrected_month
from evaluations
where extract(day from reporting_month) <> 1
union all
select 'hr_attention', id, employee_id, reporting_month,
       (reporting_month + interval '1 day')::date
from hr_attention
where extract(day from reporting_month) <> 1;

-- ============================================================================
-- Apply the fix. Uncomment and run both UPDATE statements below.
-- ============================================================================

-- update evaluations
-- set reporting_month = reporting_month + interval '1 day'
-- where extract(day from reporting_month) <> 1;

-- update hr_attention
-- set reporting_month = reporting_month + interval '1 day'
-- where extract(day from reporting_month) <> 1;

-- ============================================================================
-- Done. Re-check the preview query above — it should return zero rows
-- after the updates run. Then reload the app and your old records will
-- show up under the correct month.
-- ============================================================================
