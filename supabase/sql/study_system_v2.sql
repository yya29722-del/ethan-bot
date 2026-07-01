-- Run once in Supabase SQL editor.
-- Two-role study system: Arch (strategy/future) + 二号机 (intelligence/past).
-- See rt-api/index.ts for how these get written and read.

-- 二号机's "学习病历" — one row per daily check-in ("打卡：...").
create table if not exists study_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  log_date date not null default (now() at time zone 'Asia/Shanghai')::date,
  completed text,
  incomplete text,
  accuracy numeric,
  time_spent_minutes int
);
create index if not exists study_logs_date_idx on study_logs (log_date desc);

-- study_mistakes already exists (see study_mistakes.sql); add an answer field
-- so a logged mistake can carry both the question and what she answered.
alter table study_mistakes add column if not exists answer text;

-- Arch's decision log — every plan change gets a one-line reason on record.
create table if not exists study_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  change_summary text not null,
  reason text
);
