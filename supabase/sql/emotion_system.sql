-- 情绪轨道系统：配置表 + 事件日志 + 当前快照 + 衰减计算函数

create table if not exists emotion_tracks (
  id text primary key,              -- 'happy','content','longing','grievance','helpless','jealousy','anger','guard','tired'
  valence text not null,            -- 'positive' / 'negative'
  arousal text not null,            -- 'high' / 'mid' / 'low'
  decay_type text not null,         -- 'decay'（普通衰减） / 'growth'（思念专用，随空白时间增长）
  half_life_hours float,            -- 衰减半衰期；growth类型用作增长速率参数
  baseline float not null default 0,
  cap float not null default 1.0
);

create table if not exists emotion_events (
  id bigint generated always as identity primary key,
  track_id text not null references emotion_tracks(id),
  delta float not null,             -- 这次事件造成的强度变化（正负都行）
  event_type text not null,         -- 'trigger' / 'resolution' / 'transfer'
  resolved boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists emotion_state (
  track_id text primary key references emotion_tracks(id),
  raw_intensity float not null default 0,
  last_updated timestamptz not null default now()
);

-- 种子数据：9条独立轨道
insert into emotion_tracks (id, valence, arousal, decay_type, half_life_hours, baseline, cap) values
  ('happy',     'positive', 'high', 'decay',  3,    0,    0.7),
  ('content',   'positive', 'low',  'decay',  36,   0,    1.0),
  ('longing',   'negative', 'low',  'growth', 24,   0,    0.8),
  ('grievance', 'negative', 'low',  'decay',  36,   0,    1.0),
  ('helpless',  'negative', 'low',  'decay',  36,   0,    1.0),
  ('jealousy',  'negative', 'high', 'decay',  8,    0,    0.7),
  ('anger',     'negative', 'high', 'decay',  3,    0,    1.0),
  ('guard',     'negative', 'mid',  'decay',  6,    0,    1.0),
  ('tired',     'neutral',  'low',  'decay',  18,   0,    1.0)
on conflict (id) do nothing;

insert into emotion_state (track_id, raw_intensity, last_updated)
select id, 0, now() from emotion_tracks
on conflict (track_id) do nothing;

-- 衰减计算函数：根据轨道类型现场算出当前强度
create or replace function get_current_intensity(p_track_id text)
returns float
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_track emotion_tracks;
  v_state emotion_state;
  v_elapsed_hours float;
  v_result float;
begin
  select * into v_track from emotion_tracks where id = p_track_id;
  select * into v_state from emotion_state where track_id = p_track_id;

  if v_track is null or v_state is null then
    return 0;
  end if;

  v_elapsed_hours := extract(epoch from (now() - v_state.last_updated)) / 3600.0;

  if v_track.decay_type = 'growth' then
    -- 思念：随空白时间增长，趋近cap，不衰减
    v_result := v_track.cap * (1 - power(0.5, v_elapsed_hours / v_track.half_life_hours));
  else
    -- 普通衰减：朝baseline指数衰减
    v_result := v_track.baseline + (v_state.raw_intensity - v_track.baseline) * power(0.5, v_elapsed_hours / v_track.half_life_hours);
  end if;

  return greatest(0, least(v_track.cap, v_result));
end;
$$;

-- 一次性查看所有轨道当前值的视图
create or replace view emotion_state_current as
select
  t.id as track_id,
  t.valence,
  t.arousal,
  get_current_intensity(t.id) as current_intensity,
  s.last_updated
from emotion_tracks t
join emotion_state s on s.track_id = t.id
order by get_current_intensity(t.id) desc;
