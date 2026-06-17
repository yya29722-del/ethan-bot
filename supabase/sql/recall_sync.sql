-- 启用所需扩展
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 存储 OpenAI key 的配置表（如果不存在则创建）
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- 把下面的 YOUR_OPENAI_KEY_HERE 替换成真实的 OpenAI key，然后在 Supabase SQL editor 里跑
INSERT INTO app_config (key, value)
VALUES ('openai_key', 'YOUR_OPENAI_KEY_HERE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 创建同步 recall 函数
-- 用法：SELECT * FROM recall_sync('查询文本', 3);
CREATE OR REPLACE FUNCTION recall_sync(query_text text, match_count int DEFAULT 3)
RETURNS TABLE(source_table text, content text, similarity float)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  openai_key text;
  req_id bigint;
  emb_response jsonb;
  embedding vector(1536);
  waited int := 0;
BEGIN
  -- 从 app_config 读取 key
  SELECT value INTO openai_key
  FROM app_config
  WHERE key = 'openai_key';

  IF openai_key IS NULL THEN
    RAISE EXCEPTION 'openai_key not found in app_config';
  END IF;

  -- 发起 embedding 请求
  SELECT net.http_post(
    url := 'https://api.openai.com/v1/embeddings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || openai_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'input', left(query_text, 2000),
      'model', 'text-embedding-3-small'
    )
  ) INTO req_id;

  -- 等待响应（最多 5 秒，每 0.5 秒检查一次）
  LOOP
    PERFORM pg_sleep(0.5);
    waited := waited + 1;

    SELECT (response_body::jsonb) INTO emb_response
    FROM net._http_response
    WHERE id = req_id AND status_code = 200;

    EXIT WHEN emb_response IS NOT NULL OR waited >= 10;
  END LOOP;

  IF emb_response IS NULL THEN
    RETURN;
  END IF;

  -- 提取 embedding 向量
  embedding := (emb_response->'data'->0->>'embedding')::vector;

  -- 查相似记忆并返回
  RETURN QUERY
  SELECT r.source_table::text, r.content::text, r.similarity::float
  FROM match_memory_vectors(embedding, 0.3, match_count) r;
END;
$$;
