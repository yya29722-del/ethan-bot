-- recall_trigger: 发 OpenAI embedding 请求，返回 req_id（pg_net 异步）
create or replace function public.recall_trigger(query_text text)
returns bigint
language plpgsql
security definer
as $function$
declare
  openai_key text;
  req_id bigint;
begin
  select value into openai_key from app_config where key = 'openai_key';
  if openai_key is null then raise exception 'openai_key not found in app_config'; end if;
  select net.http_post(
    url := 'https://api.openai.com/v1/embeddings',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || openai_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'input', left(query_text, 2000),
      'model', 'text-embedding-3-small'
    )
  ) into req_id;
  return req_id;
end;
$function$;

-- recall_fetch: 用 req_id 取 embedding 结果，跑 match_memory_vectors
-- 在 recall_trigger 调用后稍等片刻（1-2秒）再调
create or replace function public.recall_fetch(req_id bigint, match_count integer default 3)
returns table(source_table text, content text, similarity double precision)
language plpgsql
security definer
as $function$
declare
  emb_response jsonb;
  embedding vector(1536);
begin
  select (r.content::jsonb) into emb_response
  from net._http_response r
  where r.id = req_id and r.status_code = 200;
  if emb_response is null then return; end if;
  embedding := (emb_response->'data'->0->>'embedding')::vector;
  return query
  select r.source_table::text, r.content::text, r.similarity::float
  from match_memory_vectors(embedding, 0.3, match_count) r;
end;
$function$;
