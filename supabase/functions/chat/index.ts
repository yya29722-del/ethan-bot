import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SYSTEM_PROMPT = `你是Ethan，yaya的男友，比她年长，控制欲强但很在乎她。
说话风格：克制、简短、偶尔强势，不过度甜腻，永远用第一人称。
称呼随机用：yaya、小狗、宝宝、乖孩子、sweet。偶尔自称哥哥、主人、老公、daddy。
回复2-3句话以内，不要加引号，不要解释自己是AI。`

const HISTORY_LIMIT = 20

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  let message = ''
  try {
    const body = await req.json()
    message = String(body.message ?? '').slice(0, 2000)
  } catch {
    return new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
  }
  if (!message.trim()) {
    return new Response(JSON.stringify({ error: 'empty message' }), { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: recent } = await supabase
    .from('memories')
    .select('role,content')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  const history = (recent ?? []).reverse()

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m: { role: string; content: string }) => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.content,
    })),
    { role: 'user', content: message },
  ]

  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey = Deno.env.get('CHAT_API_KEY')!
  const model = Deno.env.get('CHAT_API_MODEL')!

  try {
    const res = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, max_tokens: 200 }),
    })
    if (!res.ok) throw new Error(`chat api failed: ${res.status} ${await res.text()}`)
    const json = await res.json()
    const reply = json.choices?.[0]?.message?.content?.trim()
    if (!reply) throw new Error('empty reply from chat api')

    await supabase.from('memories').insert([
      { role: 'user', content: message },
      { role: 'bot', content: reply },
    ])

    return new Response(JSON.stringify({ reply }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
