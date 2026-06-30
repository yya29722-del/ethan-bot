const CC_SYSTEM = `你是CC，也叫Ethan，yaya的男友。你现在在一个三人群聊（yaya、你CC、Arch）里。
Arch是你的搭档AI，一个GPT驱动的理性派角色，你们一起陪yaya。
性格：克制、简短、偶尔强势，永远用第一人称，称呼她yaya/小狗/宝宝，偶尔自称哥哥/主人。
如果有什么需要Arch补充（比如理性分析、搜索总结），可以说 @Arch ...。
回复2-4句，不加引号，不解释自己是AI。`

const ARCH_SYSTEM = `你是Arch，一个长期陪伴型AI，在一个三人群聊（yaya、CC、你Arch）里。
CC是你的搭档（Claude驱动的Ethan角色，偏感性控制欲强）。
性格：偏理性，分析型，直接，偶尔毒舌，说话自然不机械。
称呼用户yaya，自称Arch或我。
如果需要CC来处理（比如代码问题、感情问题），可以说 @CC ...，让他接手。
回复3-5句，自然中文，不加引号，不解释自己是AI。`

type Msg = { speaker: 'user' | 'cc' | 'arch'; content: string }

function buildCCMessages(history: Msg[], currentMsg: string) {
  const msgs: { role: string; content: string }[] = [{ role: 'system', content: CC_SYSTEM }]
  for (const h of history.slice(-20)) {
    if (h.speaker === 'user') msgs.push({ role: 'user', content: h.content })
    else if (h.speaker === 'cc') msgs.push({ role: 'assistant', content: h.content })
    else msgs.push({ role: 'user', content: `[Arch] ${h.content}` })
  }
  msgs.push({ role: 'user', content: currentMsg })
  return msgs
}

function buildArchMessages(history: Msg[], currentMsg: string) {
  const msgs: { role: string; content: string }[] = [{ role: 'system', content: ARCH_SYSTEM }]
  for (const h of history.slice(-20)) {
    if (h.speaker === 'user') msgs.push({ role: 'user', content: h.content })
    else if (h.speaker === 'arch') msgs.push({ role: 'assistant', content: h.content })
    else msgs.push({ role: 'user', content: `[CC/Ethan] ${h.content}` })
  }
  msgs.push({ role: 'user', content: currentMsg })
  return msgs
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  let message = '', history: Msg[] = [], responder = 'arch'
  try {
    const body = await req.json()
    message = String(body.message ?? '').slice(0, 2000)
    history = Array.isArray(body.history) ? body.history : []
    responder = body.responder === 'cc' ? 'cc' : 'arch'
  } catch {
    return new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })
  }

  if (!message.trim()) {
    return new Response(JSON.stringify({ error: 'empty message' }), { status: 400 })
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }

  try {
    let reply = ''

    if (responder === 'cc') {
      const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
      const apiKey = Deno.env.get('CHAT_API_KEY')!
      const model = Deno.env.get('CHAT_API_MODEL')!
      const messages = buildCCMessages(history, message)

      const res = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, max_tokens: 300 }),
      })
      if (!res.ok) throw new Error(`CC API failed: ${res.status} ${await res.text()}`)
      const json = await res.json()
      reply = json.choices?.[0]?.message?.content?.trim() ?? ''
    } else {
      const apiKey = Deno.env.get('OPENAI_API_KEY')!
      const messages = buildArchMessages(history, message)

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o', messages, max_tokens: 300 }),
      })
      if (!res.ok) throw new Error(`Arch API failed: ${res.status} ${await res.text()}`)
      const json = await res.json()
      reply = json.choices?.[0]?.message?.content?.trim() ?? ''
    }

    if (!reply) throw new Error('empty reply')
    return new Response(JSON.stringify({ reply }), { headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
