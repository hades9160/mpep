-- ============================================================================
-- Aurion Solar — Monthly Performance Evaluation Dashboard
-- Supabase schema
-- Run this whole file once in Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================================

-- Extensions ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. EMPLOYEES  (shared master list used by every other table)
-- ============================================================================
create table if not exists employees (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  position        text,
  department      text,
  date_hired      date,
  employment_type text not null check (employment_type in ('Probationary','Regular')),
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- 2. EVALUATIONS  (one row per employee per reporting month)
--    Covers both the "Probationary Employees" and "Regular Employees" sheets.
-- ============================================================================
create table if not exists evaluations (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references employees(id) on delete cascade,
  employment_type    text not null check (employment_type in ('Probationary','Regular')),
  reporting_month    date not null,                 -- store as first day of month, e.g. 2026-08-01
  stage              text,                           -- Probationary: "Month 1", "Month 3"... Regular: eval period
  evaluation_result  text not null check (
                        evaluation_result in ('Passed','Failed','Satisfactory',
                                               'Needs Improvement','PIP','For Review','Completed')
                       ),
  kpi_score          numeric(5,2),                   -- percentage, e.g. 87.50
  lates              int default 0,
  absences           int default 0,
  undertime          int default 0,
  action_notes       text,                           -- "Performance Status / Action" (Regular sheet)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_eval_month on evaluations(reporting_month);
create index if not exists idx_eval_employee on evaluations(employee_id);

-- ============================================================================
-- 3. HR ATTENTION  ("Employees Requiring HR / Management Attention")
-- ============================================================================
create table if not exists hr_attention (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid references employees(id) on delete set null,
  reporting_month       date not null,
  employment_status     text,
  key_performance_issue text,
  coaching_support      text,
  expected_target       text,
  next_review_date      date,
  recommendation        text,
  created_at            timestamptz not null default now()
);

-- ============================================================================
-- 4. PROGRESS HIGHLIGHTS  (narrative summary per month)
-- ============================================================================
create table if not exists progress_highlights (
  id                        uuid primary key default gen_random_uuid(),
  reporting_month           date not null unique,
  key_improvements          text,
  common_gaps               text,
  attendance_concerns       text,
  training_needs            text,
  overall_recommendation    text,
  updated_at                timestamptz not null default now()
);

-- ============================================================================
-- 5. THIRD & FIFTH MONTH TRACKER
-- ============================================================================
create table if not exists third_fifth_month (
  id                    uuid primary key default gen_random_uuid(),
  employee_id           uuid references employees(id) on delete set null,
  department             text,
  position                text,
  date_hired              date,
  third_month_date        date,
  third_month_result      text check (third_month_result in ('Passed','Failed','PIP')),
  fifth_month_date        date,
  fifth_month_result      text check (fifth_month_result in ('Qualified','Not Qualified','Review')),
  final_recommendation    text,
  remarks                 text,
  created_at              timestamptz not null default now()
);

-- ============================================================================
-- 6. SIGN-OFF  (report preparation & review, one row per reporting month)
-- ============================================================================
create table if not exists sign_off (
  id                   uuid primary key default gen_random_uuid(),
  reporting_month      date not null unique,
  prepared_by          text,
  prepared_date        date,
  department_head      text,
  department_head_date date,
  hr_representative    text,
  hr_representative_date date,
  management_approval  text,
  management_date      date
);

-- ============================================================================
-- VIEW: overall status summary (drives the dashboard donut chart)
-- ============================================================================
create or replace view v_status_summary as
select
  reporting_month,
  count(*) filter (where evaluation_result in ('Passed','Satisfactory')) as on_track,
  count(*) filter (where evaluation_result = 'Needs Improvement')        as needs_improvement,
  count(*) filter (where evaluation_result = 'Failed')                  as failed,
  count(*) filter (where evaluation_result = 'PIP')                     as pip_action_plan,
  count(*) filter (where evaluation_result = 'For Review')              as for_review,
  count(*) filter (where evaluation_result = 'Completed')               as completed,
  count(*) as total
from evaluations
group by reporting_month;

-- VIEW: category totals (Probationary vs Regular breakdown, like Monthly Summary sheet)
create or replace view v_category_summary as
select
  reporting_month,
  employment_type,
  count(*) as total,
  count(*) filter (where evaluation_result in ('Passed','Satisfactory')) as on_track,
  count(*) filter (where evaluation_result = 'Needs Improvement')        as needs_improvement,
  count(*) filter (where evaluation_result = 'Failed')                  as failed,
  count(*) filter (where evaluation_result = 'PIP')                     as pip_action_plan,
  count(*) filter (where evaluation_result = 'For Review')              as for_review,
  count(*) filter (where evaluation_result = 'Completed')               as completed
from evaluations
group by reporting_month, employment_type;

-- ============================================================================
-- ROW LEVEL SECURITY
-- Internal HR tool: any authenticated (logged-in) Supabase user gets full
-- read/write access. Anonymous (not logged in) users get nothing.
-- ============================================================================
alter table employees            enable row level security;
alter table evaluations          enable row level security;
alter table hr_attention         enable row level security;
alter table progress_highlights  enable row level security;
alter table third_fifth_month    enable row level security;
alter table sign_off             enable row level security;

do $$
declare
  t text;
begin
  for t in select unnamed.tbl from (values
    ('employees'), ('evaluations'), ('hr_attention'),
    ('progress_highlights'), ('third_fifth_month'), ('sign_off')
  ) as unnamed(tbl)
  loop
    execute format(
      'create policy "authenticated_full_access" on %I
         for all using (auth.role() = ''authenticated'')
         with check (auth.role() = ''authenticated'');', t);
  end loop;
end $$;

-- ============================================================================
-- Done. Next steps:
-- 1. In Supabase: Authentication > Providers > enable Email, disable public sign-ups
--    if you only want HR staff to log in (Authentication > Settings).
-- 2. Add your HR users manually: Authentication > Users > Add user.
-- 3. Copy your Project URL and anon public key into js/supabaseClient.js.
-- ============================================================================
