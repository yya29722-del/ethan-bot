-- Run once in Supabase SQL editor.
-- Structured mistake log for the round table's study rooms (see rt-api).
-- She logs a wrong question/sentence by prefixing a message with "错题：";
-- rt-api tags it with a category and stores it here so patterns can be
-- tracked over time instead of living only in prose summaries.

create table if not exists study_mistakes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  content text not null,
  category text not null default '其他',
  topic_id text
);

create index if not exists study_mistakes_category_idx on study_mistakes (category);
create index if not exists study_mistakes_created_at_idx on study_mistakes (created_at desc);
