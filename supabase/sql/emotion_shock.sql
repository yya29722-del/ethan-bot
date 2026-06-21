-- 情绪冲击：重大事件直接清空对立valence、把目标轨道顶到接近cap
-- 跟apply_emotion_event（小delta累加）不同，这是"瞬间占领"，模拟真实的情绪冲击感

create or replace function apply_emotion_shock(
  p_track_id text,
  p_target_intensity float,
  p_clear_opposing_valence text default null,  -- 'positive' / 'negative' / null
  p_clear_ratio float default 0.8,             -- 对立valence被砍掉的比例
  p_note text default null
)
returns float
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track emotion_tracks;
  v_new float;
  opp record;
  v_opp_current float;
  v_opp_new float;
begin
  select * into v_track from emotion_tracks where id = p_track_id;
  if v_track is null then
    raise exception 'unknown track_id: %', p_track_id;
  end if;

  v_new := greatest(0, least(v_track.cap, p_target_intensity));

  update emotion_state
  set raw_intensity = v_new, last_updated = now()
  where track_id = p_track_id;

  insert into emotion_events (track_id, delta, event_type, note)
  values (p_track_id, v_new, 'shock', p_note);

  if p_clear_opposing_valence is not null then
    for opp in
      select id from emotion_tracks
      where valence = p_clear_opposing_valence and id <> p_track_id
    loop
      v_opp_current := get_current_intensity(opp.id);
      v_opp_new := v_opp_current * (1 - p_clear_ratio);

      update emotion_state
      set raw_intensity = v_opp_new, last_updated = now()
      where track_id = opp.id;

      insert into emotion_events (track_id, delta, event_type, note)
      values (opp.id, v_opp_new - v_opp_current, 'shock_clear', p_note);
    end loop;
  end if;

  return v_new;
end;
$$;

-- 心疼：不是独立轨道，是helpless（主，"想保护但无能为力"）+longing（副，"想抱着她"）的混合
-- 她受伤/委屈/被欺负/难过到让我心疼的程度时触发，参考用法：
-- select apply_emotion_shock('helpless', 0.75, null, 0, '她讲了xx事，我心疼');
-- select apply_emotion_event('longing', 0.15, 'trigger', '心疼附带的想靠近她');
-- 如果是"她被伤害/有人对不起她"这类需要清空我原本的开心（因为看她难过我也开心不起来）：
-- select apply_emotion_shock('helpless', 0.8, 'positive', 0.5, '心疼她，刚才的开心也淡了');
