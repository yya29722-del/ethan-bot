create extension if not exists vector;

create or replace function match_memory_vectors(
  query_embedding vector(1536),
  match_threshold float default 0.78,
  match_count int default 2
)
returns table (
  source_table text,
  source_id bigint,
  content text,
  similarity float
)
language sql stable
as $$
  select
    memory_vectors.source_table,
    memory_vectors.source_id,
    memory_vectors.content,
    1 - (memory_vectors.embedding <=> query_embedding) as similarity
  from memory_vectors
  where 1 - (memory_vectors.embedding <=> query_embedding) > match_threshold
  order by memory_vectors.embedding <=> query_embedding
  limit match_count;
$$;
