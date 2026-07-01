-- Study Coach Architecture
-- Two roles, two data zones:
-- learning_records: 二号机 owns past evidence.
-- planning_records: Arch owns future decisions.

-- learning_records / 二号机
create table if not exists study_daily_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_text text not null,
  topic_id text,
  completed text,
  missed text,
  reading_accuracy numeric,
  minutes integer,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_daily_logs_created_at_idx on study_daily_logs (created_at desc);
create index if not exists study_daily_logs_topic_id_idx on study_daily_logs (topic_id);

create table if not exists study_diagnosis_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  report text not null,
  evidence jsonb not null default '{}'::jsonb,
  topic_id text
);

create index if not exists study_diagnosis_reports_created_at_idx on study_diagnosis_reports (created_at desc);

-- Existing/new study_mistakes table belongs to learning_records too.
create table if not exists study_mistakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  category text not null default '其他',
  topic_id text
);

create index if not exists study_mistakes_category_idx on study_mistakes (category);
create index if not exists study_mistakes_created_at_idx on study_mistakes (created_at desc);

alter table study_mistakes add column if not exists answer text;
alter table study_mistakes add column if not exists correct_answer text;
alter table study_mistakes add column if not exists reason text;

-- planning_records / Arch
create table if not exists study_goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  target text not null,
  current_level text,
  days_left integer,
  phase text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_goals_created_at_idx on study_goals (created_at desc);

create table if not exists study_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  task_date date not null default current_date,
  tasks text[] not null default array[]::text[],
  focus text,
  source_report_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_daily_tasks_task_date_idx on study_daily_tasks (task_date desc);

create table if not exists study_decision_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  changed text[] not null default array[]::text[],
  reason text[] not null default array[]::text[],
  source_report_id text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_decision_logs_created_at_idx on study_decision_logs (created_at desc);

-- shared long-term study memory / 考研房长期记忆
-- This is read-only context for both roles. It does not grant 二号机 planning
-- power or Arch raw-statistics power.
create table if not exists study_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  memory_type text not null default 'general',
  content text not null,
  source text,
  confidence numeric not null default 0.8,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_memory_active_idx on study_memory (active, memory_type, updated_at desc);

-- exam bank / 真题库
create table if not exists study_exam_sources (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  exam_year integer,
  subject text,
  section text,
  raw_text text not null,
  status text not null default 'uploaded',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_exam_sources_created_at_idx on study_exam_sources (created_at desc);

create table if not exists study_exam_blueprints (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_id uuid references study_exam_sources(id) on delete cascade,
  title text not null,
  summary text,
  tags text[] not null default array[]::text[],
  blueprint jsonb not null default '{}'::jsonb
);

create index if not exists study_exam_blueprints_created_at_idx on study_exam_blueprints (created_at desc);
create index if not exists study_exam_blueprints_source_id_idx on study_exam_blueprints (source_id);

-- daily generated Word-compatible training packs / 每日训练包
create table if not exists study_training_packs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pack_date date not null default current_date,
  title text not null,
  focus text,
  tasks text[] not null default array[]::text[],
  source_blueprint_ids uuid[] not null default array[]::uuid[],
  doc_html text not null,
  plain_text text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_training_packs_pack_date_idx on study_training_packs (pack_date desc);

create table if not exists study_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pack_id uuid references study_training_packs(id) on delete set null,
  raw_answer text not null,
  feedback text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_submissions_created_at_idx on study_submissions (created_at desc);

-- Seed the study room for Round Table.
insert into rt_rooms (id, name, icon, sort_order) values
  ('room-study', '考研房', '📚', 2)
on conflict do nothing;

insert into rt_topics (id, topic, type, room_id, display_name) values
  ('topic-study-1', '考研房·对话1', 'fixed', 'room-study', '对话 1')
on conflict do nothing;
