-- Round Table: topics and messages

CREATE TABLE IF NOT EXISTS rt_topics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  topic TEXT,
  type TEXT DEFAULT 'draft',
  fixed_room_id TEXT,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rt_messages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  topic_id TEXT REFERENCES rt_topics(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL,
  text TEXT,
  at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rt_messages_topic_id_idx ON rt_messages(topic_id, at);

-- Seed fixed rooms
INSERT INTO rt_topics (id, topic, type, fixed_room_id) VALUES
  ('room-main',       '圆桌',  'fixed', 'main'),
  ('room-philosophy', '哲学场', 'fixed', 'philosophy')
ON CONFLICT DO NOTHING;
