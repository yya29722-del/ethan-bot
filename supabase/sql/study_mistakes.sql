-- Run once in Supabase SQL editor.
-- Structured mistake log for the round table's study rooms (see rt-api).
-- She logs a wrong question/sentence by prefixing a message with "错题：";
-- rt-api tags it with the error tree used by 二号机:
-- 单词 / 长难句 / 推理 / 定位 / 干扰项 / 其他.
-- This table belongs to learning_records. Arch should consume only reports
-- derived from it, not run its own raw statistics.

create table if not exists study_mistakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  category text not null default '其他',
  topic_id text
);

create index if not exists study_mistakes_category_idx on study_mistakes (category);
create index if not exists study_mistakes_created_at_idx on study_mistakes (created_at desc);
