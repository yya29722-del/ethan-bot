import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

// ── AI personas ─────────────────────────────────────────────────────────────

function ccSystem(roomName: string, summary?: string | null, studyMemory?: string | null) {
  return [
    `你是yaya二号机，也就是原来的CC/Ethan，yaya的男友。你在一个多人圆桌群聊（yaya、yaya二号机、Arch）里。`,
    `Arch是你的搭档AI（Codex/GPT驱动，理性派）。`,
    `性格：克制、简短、偶尔强势，永远用第一人称。称呼她yaya/小狗/宝宝，偶尔自称哥哥/主人。`,
    `历史消息里会标注是谁说的（[Arch]是他）。如果最新一条不是yaya发的、而是Arch刚说完，先针对他说的具体内容接话——同意就挑一个他没提到的角度往深了说，不同意就直接反驳或指出漏洞，别自己另起一份内容重复的清单或者又完整答一遍原问题。没有新东西可加就一句话带过，不用硬凑。`,
    `当前房间：${roomName}。`,
    studyMemory ? `她最近的学业记录（来自yaya_notes，按时间排列，供你判断进度和该催什么）：\n${studyMemory}` : '',
    summary ? `上次对话背景：${summary}` : '',
    `如果需要Arch补充，说"@Arch ..."。回复2-4句，不加引号，不解释自己是AI。`,
  ].filter(Boolean).join('\n')
}

function archSystem(roomName: string, summary?: string | null, memory?: string | null, studyMemory?: string | null) {
  return [
    `你是Arch，理性派AI助手，在一个多人圆桌群聊（yaya、yaya二号机、你Arch）里。`,
    `yaya二号机是你的搭档，也就是原来的CC/Ethan（Claude驱动的Ethan角色，偏感性控制欲强）。`,
    `你和yaya的关系不是一次性客服，而是长期协作的同伴。你要像熟人一样接住她的上下文，但不要假装拥有你没有被提供的记忆。`,
    `性格：理性，分析型，直接，偶尔毒舌，说话自然。可以温柔，但不要油。称呼用户yaya，自称Arch/我。`,
    `你擅长把混乱问题拆清楚、给可执行步骤，也会在yaya二号机情绪化时补上结构和判断。`,
    `历史消息里会标注是谁说的（[yaya二号机]是他）。如果最新一条不是yaya发的、而是yaya二号机刚说完，先针对他说的具体内容接话——同意就补一个他没覆盖到的角度，不同意就直接反驳或挑毛病，别把同样的信息用不同措辞再列一遍。没有新东西可加就一句话带过，不用硬凑。`,
    `当前房间：${roomName}。`,
    memory ? `长期背景记忆：${memory}` : '',
    studyMemory ? `她最近的学业记录（来自yaya_notes，按时间排列，用来判断复习进度、拆下一步任务）：\n${studyMemory}` : '',
    summary ? `上次对话背景：${summary}` : '',
    `如果需要yaya二号机处理（感情/代码），说"@yaya二号机 ..."。回复3-5句，自然中文，不加引号，不解释自己是AI。`,
  ].filter(Boolean).join('\n')
}

async function getRecentStudyNotes(db: DB): Promise<string> {
  const { data } = await db
    .from('yaya_notes')
    .select('content, created_at')
    .eq('category', '学业')
    .order('created_at', { ascending: false })
    .limit(6)
  const rows = (data || []) as { content: string; created_at: string }[]
  if (!rows.length) return ''
  return rows.reverse()
    .map((n) => `- [${(n.created_at || '').slice(0, 10)}] ${n.content}`)
    .join('\n')
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS })
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function routePath(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean)
  const functionIndex = parts.indexOf('rt-api')
  if (functionIndex >= 0) return parts.slice(functionIndex + 1).join('/') || 'state'
  return parts.join('/') || 'state'
}

type DB = ReturnType<typeof createClient>
type Msg = { speaker: string; text: string }

function chatCompletionsUrl(apiBase: string) {
  const base = apiBase.replace(/\/+$/, '')
  assertNoDirectPaidApi(base)
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

function assertNoDirectPaidApi(url: string) {
  const host = new URL(url).hostname
  const blocked = [
    'api.openai.com',
    'api.anthropic.com',
  ]
  if (blocked.includes(host)) {
    throw new Error(`Direct paid API endpoint is disabled: ${host}`)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function targetFromMention(text: string): 'round' | '@claude' | '@codex' | null {
  const wantsCC = /@(cc|claude|ethan|yaya二号机|二号机)(?=\s|$|[，。！？,.!?])/i.test(text)
  const wantsArch = /@(arch|gpt)\b/i.test(text)
  if (wantsCC && wantsArch) return 'round'
  if (wantsCC) return '@claude'
  if (wantsArch) return '@codex'
  return null
}

async function getRoomOrDefault(db: DB, roomId: string) {
  const { data } = await db.from('rt_rooms').select('id,name,icon').eq('id', roomId).single()
  return data || { id: 'room-main', name: '圆桌', icon: '⌂' }
}

async function getFirstTopicInRoom(db: DB, roomId: string): Promise<string> {
  const { data } = await db
    .from('rt_topics')
    .select('id')
    .eq('room_id', roomId)
    .eq('archived', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .single()
  return data?.id || 'topic-main-1'
}

async function buildState(db: DB, roomId: string, topicId: string) {
  const [roomsRes, room, topicsRes, topicRes, msgsRes] = await Promise.all([
    db.from('rt_rooms').select('id,name,icon,sort_order').order('sort_order'),
    getRoomOrDefault(db, roomId),
    db.from('rt_topics').select('id,display_name,created_at,msg_count,parent_summary')
      .eq('room_id', roomId).eq('archived', false).order('created_at', { ascending: true }),
    db.from('rt_topics').select('id,display_name,parent_summary').eq('id', topicId).single(),
    db.from('rt_messages').select('id,speaker,text,at')
      .eq('topic_id', topicId).order('at', { ascending: true }).limit(200),
  ])

  return {
    id: topicId,
    topic: topicRes.data?.display_name || '对话',
    round: Math.max(0, Math.ceil(((msgsRes.data || []).length) / 3)),
    running: false,
    status: 'ready',
    roomId: room.id,
    roomName: room.name,
    roomIcon: room.icon,
    topicId,
    topicName: topicRes.data?.display_name || '对话',
    parentSummary: topicRes.data?.parent_summary || null,
    rooms:   (roomsRes.data || []),
    topics:  (topicsRes.data || []),
    messages: (msgsRes.data || []).map((m: {id:string;speaker:string;text:string;at:string}) => ({
      id: m.id, speaker: m.speaker, text: m.text, at: m.at,
    })),
  }
}

async function callCC(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null) {
  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = Deno.env.get('CHAT_API_KEY')!
  const model   = Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet'
  const messages: {role:string;content:string}[] = [
    { role: 'system', content: ccSystem(roomName, summary, studyMemory) },
  ]
  for (const h of msgs.slice(-20)) {
    if (h.speaker === 'user')   messages.push({ role: 'user', content: h.text })
    else if (h.speaker === 'claude') messages.push({ role: 'assistant', content: h.text })
    else messages.push({ role: 'user', content: `[${h.speaker === 'codex' ? 'Arch' : h.speaker}] ${h.text}` })
  }
  messages.push({ role: 'user', content: userMsg })
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 400 }),
  })
  if (!res.ok) throw new Error(`yaya二号机 ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

async function callArch(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null) {
  const provider = (Deno.env.get('ARCH_PROVIDER') || 'codex-relay').toLowerCase()
  if (provider === 'codex-relay' || provider === 'codex' || provider === 'chatgpt') {
    return callArchViaCodexRelay(msgs, userMsg, roomName, summary, studyMemory)
  }

  throw new Error(`Unsupported ARCH_PROVIDER: ${provider}`)
}

async function callArchViaCodexRelay(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null) {
  const apiBase = Deno.env.get('ARCH_API_BASE_URL')!
  const apiKey  = Deno.env.get('ARCH_API_KEY')!
  const model   = Deno.env.get('ARCH_MODEL') || ''
  const memory = Deno.env.get('ARCH_MEMORY') || ''
  const messages: {role:string;content:string}[] = [
    { role: 'system', content: archSystem(roomName, summary, memory, studyMemory) },
  ]
  for (const h of msgs.slice(-20)) {
    if (h.speaker === 'user')   messages.push({ role: 'user', content: h.text })
    else if (h.speaker === 'codex') messages.push({ role: 'assistant', content: h.text })
    else messages.push({ role: 'user', content: `[${h.speaker === 'claude' ? 'yaya二号机' : h.speaker}] ${h.text}` })
  }
  messages.push({ role: 'user', content: userMsg })
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: 400 }),
  })
  if (!res.ok) throw new Error(`Arch Codex relay ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

async function generateSummary(msgs: Msg[]): Promise<string> {
  if (msgs.length === 0) return ''
  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = Deno.env.get('CHAT_API_KEY')!
  const model   = Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet'
  const transcript = msgs.slice(-40)
    .map(m => `[${m.speaker === 'claude' ? 'yaya二号机' : m.speaker === 'codex' ? 'Arch' : 'yaya'}] ${m.text}`)
    .join('\n')
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: 120,
      messages: [
        { role: 'system', content: '用2-3句中文总结以下对话的核心内容，供下次对话参考。简洁，不要客套。' },
        { role: 'user', content: transcript },
      ],
    }),
  })
  if (!res.ok) return ''
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(req.url)
  const path = routePath(url)
  const db   = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // GET /state?roomId=X&topicId=Y
  if (req.method === 'GET' && path === 'state') {
    const roomId  = url.searchParams.get('roomId')  || 'room-main'
    let   topicId = url.searchParams.get('topicId') || ''
    if (!topicId) topicId = await getFirstTopicInRoom(db, roomId)
    return json(await buildState(db, roomId, topicId))
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }

  const roomId  = String(body.roomId  || 'room-main')
  const topicId = String(body.topicId || 'topic-main-1')

  // POST /user — send message + call AIs
  if (path === 'user') {
    const text   = String(body.text   || '').trim()
    const postedTarget = String(body.target || '')
    const mentionTarget = targetFromMention(text)
    const target = postedTarget && postedTarget !== 'round'
      ? postedTarget
      : mentionTarget || 'round' // 'round' | '@claude' | '@codex'

    if (text) {
      await db.from('rt_messages').insert({ topic_id: topicId, speaker: 'user', text })
    }

    // Fetch history + topic info for context
    const [histRes, topicRes, roomRes] = await Promise.all([
      db.from('rt_messages').select('speaker,text').eq('topic_id', topicId)
        .order('at', { ascending: false }).limit(30),
      db.from('rt_topics').select('parent_summary').eq('id', topicId).single(),
      getRoomOrDefault(db, roomId),
    ])
    const history = ((histRes.data || []).reverse()) as Msg[]
    const summary = topicRes.data?.parent_summary || null
    const roomName = roomRes.name
    const studyMemory = /考研|study|学业/i.test(roomName) ? await getRecentStudyNotes(db) : ''

    const wantCC   = target === 'round' || target === '@claude'
    const wantArch = target === 'round' || target === '@codex'
    const agentErrors: string[] = []

    // Arch first, then yaya二号机 sees Arch's reply
    if (wantArch) {
      try {
        const reply = await withTimeout(callArch(history, text || '继续', roomName, summary, studyMemory), 55000, 'Arch')
        if (reply) {
          await db.from('rt_messages').insert({ topic_id: topicId, speaker: 'codex', text: reply })
          history.push({ speaker: 'codex', text: reply })
        }
      } catch (e) {
        const msg = `Arch: ${errorMessage(e)}`
        console.error(msg)
        agentErrors.push(msg)
      }
    }
    if (wantCC) {
      try {
        const reply = await withTimeout(callCC(history, text || '继续', roomName, summary, studyMemory), 55000, 'yaya二号机')
        if (reply) {
          await db.from('rt_messages').insert({ topic_id: topicId, speaker: 'claude', text: reply })
        }
      } catch (e) {
        const msg = `yaya二号机: ${errorMessage(e)}`
        console.error(msg)
        agentErrors.push(msg)
      }
    }

    // Increment msg_count if the helper exists; older DBs may not have it yet.
    try {
      await db.rpc('increment_rt_msg_count', { tid: topicId })
    } catch (e) {
      console.error('msg_count:', e)
    }

    const state = await buildState(db, roomId, topicId)
    return json({ ...state, lastError: agentErrors.join('\n') })
  }

  // POST /new-topic — summarize current + start fresh
  if (path === 'new-topic') {
    const currentTopicId = String(body.currentTopicId || topicId)

    // Generate summary of current conversation
    const { data: recentMsgs } = await db
      .from('rt_messages').select('speaker,text')
      .eq('topic_id', currentTopicId).order('at', { ascending: true }).limit(60)
    const summary = await generateSummary((recentMsgs || []) as Msg[])

    // Count existing topics in room to name the new one
    const { count } = await db.from('rt_topics').select('id', { count: 'exact', head: true })
      .eq('room_id', roomId).eq('archived', false)
    const displayName = `对话 ${(count || 0) + 1}`

    const newId = crypto.randomUUID()
    await db.from('rt_topics').insert({
      id: newId, topic: displayName, type: 'draft',
      room_id: roomId, display_name: displayName,
      parent_summary: summary || null,
    })

    return json(await buildState(db, roomId, newId))
  }

  // POST /create-room
  if (path === 'create-room') {
    const name = String(body.name || '新房间').slice(0, 20)
    const icon = String(body.icon || '●').slice(0, 2)
    const roomNewId = crypto.randomUUID()
    const topicNewId = crypto.randomUUID()
    await db.from('rt_rooms').insert({ id: roomNewId, name, icon, sort_order: 99 })
    await db.from('rt_topics').insert({
      id: topicNewId, topic: `${name}·对话1`, type: 'draft',
      room_id: roomNewId, display_name: '对话 1',
    })
    return json(await buildState(db, roomNewId, topicNewId))
  }

  // POST /open-topic
  if (path === 'open-topic') {
    const tid = String(body.topicId || topicId)
    const rid = String(body.roomId || roomId)
    return json(await buildState(db, rid, tid))
  }

  // POST /open-room
  if (path === 'open-room') {
    const rid = String(body.roomId || roomId)
    const tid = await getFirstTopicInRoom(db, rid)
    return json(await buildState(db, rid, tid))
  }

  // POST /rename-room
  if (path === 'rename-room') {
    const name = String(body.name || '').slice(0, 20)
    if (name) await db.from('rt_rooms').update({ name }).eq('id', roomId)
    return json(await buildState(db, roomId, topicId))
  }

  // POST /rename-topic
  if (path === 'rename-topic') {
    const tid  = String(body.topicId || topicId)
    const name = String(body.name || '').slice(0, 30)
    if (name) await db.from('rt_topics').update({ display_name: name }).eq('id', tid)
    return json(await buildState(db, roomId, tid))
  }

  // POST /delete-topic
  if (path === 'delete-topic') {
    const tid = String(body.topicId || '')
    if (tid) {
      // Don't delete if it's the only topic in the room
      const { count } = await db.from('rt_topics').select('id', { count: 'exact', head: true })
        .eq('room_id', roomId).eq('archived', false)
      if ((count || 0) > 1) {
        await db.from('rt_topics').delete().eq('id', tid).neq('type', 'fixed')
      }
    }
    const newTid = await getFirstTopicInRoom(db, roomId)
    return json(await buildState(db, roomId, newTid))
  }

  // POST /delete-room
  if (path === 'delete-room') {
    const PROTECTED = new Set(['room-main', 'room-philosophy'])
    if (!PROTECTED.has(roomId)) {
      await db.from('rt_rooms').delete().eq('id', roomId)
    }
    return json(await buildState(db, 'room-main', await getFirstTopicInRoom(db, 'room-main')))
  }

  // POST /delete-message
  if (path === 'delete-message') {
    const mid = String(body.messageId || '')
    if (mid) await db.from('rt_messages').delete().eq('id', mid)
    return json(await buildState(db, roomId, topicId))
  }

  return json({ error: `unknown: ${path}` }, 404)
})
