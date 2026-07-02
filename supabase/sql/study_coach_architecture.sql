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

-- long-range plan / 长线阶段计划
create table if not exists study_phase_plan (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sort_order integer not null default 0,
  phase_name text not null,
  start_date date,
  end_date date,
  goals text[] not null default array[]::text[],
  focus_modules text[] not null default array[]::text[],
  entry_conditions text[] not null default array[]::text[],
  exit_conditions text[] not null default array[]::text[],
  status text not null default 'pending',
  adjustment_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists study_phase_plan_status_idx on study_phase_plan (status, sort_order);

-- coverage matrix / 考点覆盖矩阵
create table if not exists study_coverage_matrix (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  module text not null,
  point text not null,
  target_count integer not null default 8,
  planned_count integer not null default 0,
  completed_count integer not null default 0,
  mastery integer not null default 0,
  priority text not null default 'medium',
  status text not null default 'not_started',
  last_planned_at date,
  last_completed_at date,
  metadata jsonb not null default '{}'::jsonb,
  unique(module, point)
);

create index if not exists study_coverage_matrix_status_idx on study_coverage_matrix (status, priority, module);

create or replace function increment_study_coverage_planned(p_module text, p_point text, p_date date)
returns void
language sql
as $$
  update study_coverage_matrix
  set planned_count = planned_count + 1,
      last_planned_at = p_date,
      status = case
        when completed_count > 0 then 'in_progress'
        else 'planned'
      end,
      updated_at = now()
  where module = p_module and point = p_point;
$$;

-- Default phase map. Dates can be adjusted by Arch later.
insert into study_phase_plan (sort_order, phase_name, start_date, end_date, goals, focus_modules, entry_conditions, exit_conditions, status) values
  (1, '阅读基础期', '2026-07-01', '2026-07-31',
   array['阅读正确率稳定到70%', '建立词汇与长难句基础', '形成每日训练节奏'],
   array['阅读', '词汇', '长难句'],
   array['开始考研房训练'],
   array['阅读正确率连续7天达到70%', '阅读训练连续7天完成'],
   'active'),
  (2, '阅读强化与翻译启动期', '2026-08-01', '2026-08-31',
   array['阅读稳定到75%', '推理题和干扰项显著下降', '翻译断句与主干识别成型'],
   array['阅读', '翻译', '长难句'],
   array['阅读基础期达标或7月结束'],
   array['阅读限时稳定', '翻译基础模块覆盖过半'],
   'pending'),
  (3, '作文启动与套题过渡期', '2026-09-01', '2026-09-30',
   array['作文结构成型', '套题节奏开始稳定', '阅读错因进入压缩阶段'],
   array['作文', '阅读', '翻译'],
   array['阅读基础稳定', '作文启动阻力下降'],
   array['大小作文模板完成', '至少完成4套组合训练'],
   'pending'),
  (4, '真题二刷与弱项专项期', '2026-10-01', '2026-10-31',
   array['二刷真题并压缩高频错因', '专项补齐薄弱题型', '稳定限时表现'],
   array['阅读', '翻译', '作文'],
   array['主要模块已启动'],
   array['高频错因下降', '整套训练完成率稳定'],
   'pending'),
  (5, '整卷模拟与冲刺期', '2026-11-01', '2026-12-20',
   array['整卷时间管理稳定', '作文可稳定输出', '错题库压缩复盘'],
   array['整卷', '作文', '错题复盘'],
   array['基础模块覆盖完成'],
   array['考前状态稳定'],
   'pending')
on conflict do nothing;

insert into study_coverage_matrix (module, point, target_count, priority, status) values
  ('阅读', '细节题', 20, 'high', 'not_started'),
  ('阅读', '推理题', 18, 'high', 'not_started'),
  ('阅读', '主旨题', 12, 'medium', 'not_started'),
  ('阅读', '态度题', 10, 'medium', 'not_started'),
  ('阅读', '词义题', 10, 'medium', 'not_started'),
  ('阅读', '例证题', 8, 'medium', 'not_started'),
  ('阅读', '篇章结构题', 8, 'medium', 'not_started'),
  ('阅读', '干扰项辨析', 20, 'high', 'not_started'),
  ('长难句', '定语从句', 12, 'high', 'not_started'),
  ('长难句', '状语从句', 10, 'medium', 'not_started'),
  ('长难句', '名词性从句', 10, 'medium', 'not_started'),
  ('长难句', '非谓语', 12, 'high', 'not_started'),
  ('长难句', '插入语', 8, 'medium', 'not_started'),
  ('长难句', '比较结构', 8, 'medium', 'not_started'),
  ('长难句', '倒装', 6, 'low', 'not_started'),
  ('长难句', '省略', 6, 'low', 'not_started'),
  ('长难句', '并列结构', 8, 'medium', 'not_started'),
  ('词汇', '熟词僻义', 16, 'high', 'not_started'),
  ('词汇', '核心动词', 16, 'high', 'not_started'),
  ('词汇', '逻辑连接词', 10, 'medium', 'not_started'),
  ('词汇', '态度词', 8, 'medium', 'not_started'),
  ('词汇', '替换表达', 12, 'medium', 'not_started'),
  ('翻译', '断句', 12, 'high', 'not_started'),
  ('翻译', '主干识别', 12, 'high', 'not_started'),
  ('翻译', '修饰成分处理', 12, 'high', 'not_started'),
  ('翻译', '词义选择', 10, 'medium', 'not_started'),
  ('翻译', '中文重组', 10, 'medium', 'not_started'),
  ('作文', '小作文格式', 8, 'low', 'not_started'),
  ('作文', '大作文结构', 10, 'low', 'not_started'),
  ('作文', '论证句', 10, 'low', 'not_started'),
  ('作文', '例证句', 8, 'low', 'not_started'),
  ('作文', '替换表达', 10, 'low', 'not_started'),
  ('作文', '图表描述', 8, 'low', 'not_started')
on conflict (module, point) do nothing;

-- Seed the study room for Round Table.
insert into rt_rooms (id, name, icon, sort_order) values
  ('room-study', '考研房', '📚', 2)
on conflict do nothing;

insert into rt_topics (id, topic, type, room_id, display_name) values
  ('topic-study-1', '考研房·对话1', 'fixed', 'room-study', '对话 1')
on conflict do nothing;
