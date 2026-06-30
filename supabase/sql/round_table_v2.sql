-- Round Table v2: rooms + conversations

CREATE TABLE IF NOT EXISTS rt_rooms (
  id   TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '⌂',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns to rt_topics
ALTER TABLE rt_topics ADD COLUMN IF NOT EXISTS room_id       TEXT REFERENCES rt_rooms(id) ON DELETE CASCADE;
ALTER TABLE rt_topics ADD COLUMN IF NOT EXISTS display_name  TEXT;
ALTER TABLE rt_topics ADD COLUMN IF NOT EXISTS parent_summary TEXT;
ALTER TABLE rt_topics ADD COLUMN IF NOT EXISTS msg_count     INT DEFAULT 0;

-- Seed rooms
INSERT INTO rt_rooms (id, name, icon, sort_order) VALUES
  ('room-main',       '圆桌',  '⌂', 0),
  ('room-philosophy', '哲学场', '∞', 1)
ON CONFLICT DO NOTHING;

-- Seed first topic per room
INSERT INTO rt_topics (id, topic, type, room_id, display_name) VALUES
  ('topic-main-1', '圆桌·对话1',  'fixed', 'room-main',       '对话 1'),
  ('topic-phil-1', '哲学场·对话1', 'fixed', 'room-philosophy', '对话 1')
ON CONFLICT DO NOTHING;

-- Update old fixed topics to have room_id if migrating
UPDATE rt_topics SET room_id = 'room-main'       WHERE id = 'room-main'       AND room_id IS NULL;
UPDATE rt_topics SET room_id = 'room-philosophy' WHERE id = 'room-philosophy' AND room_id IS NULL;
