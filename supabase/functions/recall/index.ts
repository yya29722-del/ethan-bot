import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MATCH_THRESHOLD = 0.3
const MATCH_COUNT = 2

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ matches: [], error: 'method not allowed' }), { status: 405 })
  }

  let query = ''
  try {
    const body = await req.json()
    query = String(body.query ?? '').slice(0, 2000)
  } catch {
    return new Response(JSON.stringify({ matches: [], error: 'bad request' }), { status: 400 })
  }
  if (!query.trim()) {
    return new Response(JSON.stringify({ matches: [] }), { headers: { 'Content-Type': 'application/json' } })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: query, model: 'text-embedding-3-small' }),
    })
    if (!embRes.ok) throw new Error(`embed failed: ${embRes.status}`)
    const embJson = await embRes.json()
    const embedding = embJson.data[0].embedding

    const { data, error } = await supabase.rpc('match_memory_vectors', {
      query_embedding: embedding,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    })
    if (error) throw error

    return new Response(JSON.stringify({ matches: data ?? [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ matches: [], error: String(e) }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
