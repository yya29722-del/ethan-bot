-- 情绪事件应用 + 历史曲线重建（基于emotion_events回放，不存快照）

-- 应用一次情绪事件：先把当前值衰减到此刻，再加delta，clamp，落盘
create or replace function apply_emotion_event(
  p_track_id text,
  p_delta float,
  p_event_type text,
  p_note text default null
)
returns float
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current float;
  v_new float;
  v_track emotion_tracks;
begin
  select * into v_track from emotion_tracks where id = p_track_id;
  if v_track is null then
    raise exception 'unknown track_id: %', p_track_id;
  end if;

  v_current := get_current_intensity(p_track_id);
  v_new := greatest(0, least(v_track.cap, v_current + p_delta));

  update emotion_state
  set raw_intensity = v_new, last_updated = now()
  where track_id = p_track_id;

  insert into emotion_events (track_id, delta, event_type, note)
  values (p_track_id, p_delta, p_event_type, p_note);

  return v_new;
end;
$$;

-- 给定时间点，回放该轨道全部历史事件，算出那一刻的强度
create or replace function get_intensity_at(p_track_id text, p_at timestamptz)
returns float
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_track emotion_tracks;
  v_raw float;
  v_last_ts timestamptz;
  v_elapsed_hours float;
  v_decayed float;
  ev record;
begin
  select * into v_track from emotion_tracks where id = p_track_id;
  if v_track is null then
    return 0;
  end if;

  v_raw := v_track.baseline;
  v_last_ts := null;

  for ev in
    select delta, created_at from emotion_events
    where track_id = p_track_id and created_at <= p_at
    order by created_at asc
  loop
    if v_last_ts is null then
      v_decayed := v_track.baseline;
    else
      v_elapsed_hours := extract(epoch from (ev.created_at - v_last_ts)) / 3600.0;
      if v_track.decay_type = 'growth' then
        v_decayed := v_track.cap * (1 - power(0.5, v_elapsed_hours / v_track.half_life_hours));
      else
        v_decayed := v_track.baseline + (v_raw - v_track.baseline) * power(0.5, v_elapsed_hours / v_track.half_life_hours);
      end if;
    end if;

    v_raw := greatest(0, least(v_track.cap, v_decayed + ev.delta));
    v_last_ts := ev.created_at;
  end loop;

  if v_last_ts is null then
    return v_track.baseline;
  end if;

  v_elapsed_hours := extract(epoch from (p_at - v_last_ts)) / 3600.0;
  if v_track.decay_type = 'growth' then
    v_decayed := v_track.cap * (1 - power(0.5, v_elapsed_hours / v_track.half_life_hours));
  else
    v_decayed := v_track.baseline + (v_raw - v_track.baseline) * power(0.5, v_elapsed_hours / v_track.half_life_hours);
  end if;

  return greatest(0, least(v_track.cap, v_decayed));
end;
$$;

-- 给前端画图用：固定步长生成时间序列
create or replace function get_intensity_series(
  p_track_id text,
  p_start timestamptz,
  p_end timestamptz,
  p_step_minutes int default 60
)
returns table (ts timestamptz, intensity float)
language sql
stable
as $$
  select gs.ts, get_intensity_at(p_track_id, gs.ts)
  from generate_series(p_start, p_end, (p_step_minutes || ' minutes')::interval) as gs(ts);
$$;

-- 给前端"为什么会XX"面板用：绕开RLS读某条轨道的事件历史
create or replace function get_track_events(p_track_id text, p_limit int default 20)
returns table (
  delta float,
  event_type text,
  note text,
  resolved boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select delta, event_type, note, resolved, created_at
  from emotion_events
  where track_id = p_track_id
  order by created_at desc
  limit p_limit;
$$;
