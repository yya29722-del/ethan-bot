import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

const FIXED_ROOMS = {
  main:       { icon: '⌂', customizable: false },
  philosophy: { icon: '∞', customizable: false },
}

const ROOM_TOPIC_MAP: Record<string, string> = {
  main:       'room-main',
  philosophy: 'room-philosophy',
}

const CC_SYSTEM = `你是CC，也叫Ethan，yaya的男友。你在一个多人圆桌讨论群（yaya、CC、Arch）里。
Arch是你的搭档AI（GPT驱动）。
性格：克制、简短、偶尔强势，永远用第一人称。称呼她yaya/小狗/宝宝，偶尔自称哥哥/主人。
如果需要Arch补充，可以说"@Arch ..."。
回复2-4句，不加引号，不解释自己是AI。`

const ARCH_SYSTEM = `你是Arch，一个理性派AI助手。你在一个多人圆桌讨论群（yaya、CC你Arch）里。
CC是你的搭档（Claude驱动的Ethan角色，偏感性）。
性格：理性，分析型，直接，偶尔毒舌，说话自然。称呼用户yaya，自称Arch/我。
如果需要CC来处理（感情/代码问题），可以说"@CC ..."。
回复3-5句，自然中文，不加引号，不解释自己是AI。`

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS })
}

function route(url: URL): string {
  // path: /functions/v1/rt-api/state  →  "state"
  const parts = url.pathname.split('/')
  return parts.slice(4).join('/') || 'state'
}

async function getState(supabase: ReturnType<typeof createClient>, topicId: string) {
  // Resolve topicId: default to room-main
  if (!topicId) topicId = 'room-main'

  const { data: topic } = await supabase
    .from('rt_topics')
    .select('id,topic,type,fixed_room_id')
    .eq('id', topicId)
    .single()

  const { data: msgs } = await supabase
    .from('rt_messages')
    .select('id,speaker,text,at')
    .eq('topic_id', topicId)
    .order('at', { ascending: true })
    .limit(200)

  const { data: allTopics } = await supabase
    .from('rt_topics')
    .select('id,topic,type,fixed_room_id,archived')
    .eq('archived', false)
    .order('created_at', { ascending: true })

  const fixedRooms: Record<string, unknown> = {}
  for (const [slot, meta] of Object.entries(FIXED_ROOMS)) {
    const tid = ROOM_TOPIC_MAP[slot]
    fixedRooms[slot] = { ...meta, topicId: tid }
  }

  const draftTopics = (allTopics || []).filter(t => t.type === 'draft')

  return {
    id: topic?.id || topicId,
    topic: topic?.topic || '',
    topics: draftTopics.map(t => ({
      id: t.id, topic: t.topic, type: t.type, messageCount: 0,
    })),
    fixedRooms,
    directChats: {},
    sidebarProjects: [],
    hiddenTopicIds: [],
    running: false,
    status: '',
    runtimeStatus: null,
    messages: (msgs || []).map(m => ({ id: m.id, speaker: m.speaker, text: m.text, at: m.at })),
  }
}

async function callCC(history: {speaker:string;text:string}[], userMsg: string) {
  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = Deno.env.get('CHAT_API_KEY')!
  const model   = Deno.env.get('CHAT_API_MODEL')!

  const messages: {role:string;content:string}[] = [{ role: 'system', content: CC_SYSTEM }]
  for (const h of history.slice(-20)) {
    if (h.speaker === 'user') messages.push({ role: 'user', content: h.text })
    else if (h.speaker === 'claude') messages.push({ role: 'assistant', content: h.text })
    else messages.push({ role: 'user', content: `[${h.speaker}] ${h.text}` })
  }
  messages.push({ role: 'user', content: userMsg })

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 300 }),
  })
  if (!res.ok) throw new Error(`CC API ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

async function callArch(history: {speaker:string;text:string}[], userMsg: string) {
  const apiKey = Deno.env.get('OPENAI_API_KEY')!

  const messages: {role:string;content:string}[] = [{ role: 'system', content: ARCH_SYSTEM }]
  for (const h of history.slice(-20)) {
    if (h.speaker === 'user') messages.push({ role: 'user', content: h.text })
    else if (h.speaker === 'codex') messages.push({ role: 'assistant', content: h.text })
    else messages.push({ role: 'user', content: `[${h.speaker === 'claude' ? 'CC' : h.speaker}] ${h.text}` })
  }
  messages.push({ role: 'user', content: userMsg })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 300 }),
  })
  if (!res.ok) throw new Error(`Arch API ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const path = route(url)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── GET /state?id=TOPIC_ID ──────────────────────────────────────────────
  if (req.method === 'GET' && path === 'state') {
    const topicId = url.searchParams.get('id') || 'room-main'
    const state = await getState(supabase, topicId)
    return json(state)
  }

  // ── All POST endpoints ──────────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body */ }

  // open-room: switch to a fixed room
  if (path === 'open-room') {
    const roomId = String(body.roomId || 'main')
    const topicId = ROOM_TOPIC_MAP[roomId] || 'room-main'
    const state = await getState(supabase, topicId)
    return json(state)
  }

  // open-topic / open-direct
  if (path === 'open-topic' || path === 'open-direct') {
    const topicId = String(body.id || 'room-main')
    const state = await getState(supabase, topicId)
    return json(state)
  }

  // user-only: save message, no AI
  if (path === 'user-only') {
    const topicId = String(body.topicId || 'room-main')
    const text    = String(body.text || '').trim()
    if (text) {
      await supabase.from('rt_messages').insert({ topic_id: topicId, speaker: 'user', text })
    }
    const state = await getState(supabase, topicId)
    return json(state)
  }

  // user: save message + call AIs
  if (path === 'user' || path === 'start') {
    const topicId = String(body.topicId || 'room-main')
    const text    = String(body.text || '').trim()
    const target  = String(body.target || 'round') // 'round' | '@claude' | '@codex' | '@deepseek' | 'none'

    if (text) {
      await supabase.from('rt_messages').insert({ topic_id: topicId, speaker: 'user', text })
    }

    // fetch recent history for context
    const { data: recent } = await supabase
      .from('rt_messages')
      .select('speaker,text')
      .eq('topic_id', topicId)
      .order('at', { ascending: false })
      .limit(30)
    const history = ((recent || []).reverse()) as {speaker:string;text:string}[]
    const triggerMsg = text || '继续'

    const wantCC   = target === 'round' || target === '@claude'
    const wantArch = target === 'round' || target === '@codex'

    // Arch first, then CC (CC can see Arch's reply)
    if (wantArch) {
      try {
        const reply = await callArch(history, triggerMsg)
        if (reply) {
          await supabase.from('rt_messages').insert({ topic_id: topicId, speaker: 'codex', text: reply })
          history.push({ speaker: 'codex', text: reply })
        }
      } catch (e) { console.error('Arch error:', e) }
    }

    if (wantCC) {
      try {
        const reply = await callCC(history, triggerMsg)
        if (reply) {
          await supabase.from('rt_messages').insert({ topic_id: topicId, speaker: 'claude', text: reply })
        }
      } catch (e) { console.error('CC error:', e) }
    }

    const state = await getState(supabase, topicId)
    return json(state)
  }

  // update-topic title
  if (path === 'update-topic') {
    const id    = String(body.id || '')
    const topic = String(body.topic || '')
    if (id && topic) await supabase.from('rt_topics').update({ topic }).eq('id', id)
    const state = await getState(supabase, id || 'room-main')
    return json(state)
  }

  // topic/delete
  if (path === 'topic/delete') {
    const id = String(body.id || '')
    if (id) await supabase.from('rt_topics').delete().eq('id', id).neq('type', 'fixed')
    return json({ ok: true })
  }

  // message/delete
  if (path === 'message/delete') {
    const id = String(body.id || '')
    if (id) await supabase.from('rt_messages').delete().eq('id', id)
    return json({ ok: true })
  }

  // summary (simple: use CC to summarize)
  if (path === 'summary') {
    const topicId = String(body.topicId || 'room-main')
    const { data: msgs } = await supabase
      .from('rt_messages')
      .select('speaker,text')
      .eq('topic_id', topicId)
      .order('at', { ascending: true })
      .limit(100)
    const transcript = (msgs || [])
      .map((m: {speaker:string;text:string}) => `[${m.speaker}] ${m.text}`)
      .join('\n')
    // Return stub summary - full summary generation can be added later
    return json({ summaries: [{ id: 'sum-1', topic: '本次对话总结', text: transcript.slice(0, 500) + '...' }] })
  }

  // no-op endpoints
  if ([
    'interrupt-speaker', 'approval', 'step',
    'topic/archive-sidebar/bulk', 'topic/restore-sidebar',
    'fixed-room/update', 'project/update', 'open-project',
    'study-tracker/overview', 'study-tracker/plan', 'study-tracker/progress',
  ].includes(path)) {
    return json({ ok: true })
  }

  return json({ error: `unknown route: ${path}` }, 404)
})
