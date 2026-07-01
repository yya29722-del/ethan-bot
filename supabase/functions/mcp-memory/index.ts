// Remote MCP server exposing Ethan's memory tables to any MCP-capable
// client (chat.claude.ai custom connectors, Claude mobile, etc.), so a
// voice/chat session there can read and write the same data this Claude
// Code session uses.
//
// Auth: a static bearer token (MCP_CONNECTOR_TOKEN secret), separate from
// the Supabase service role key — never hand the service role key itself
// to a client-facing connector.
//
// Untested against a live Claude.ai connector — the JSON-RPC shape below
// follows the MCP spec (2025-06-18, stateless HTTP variant), but this
// hasn't been exercised by a real client yet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONNECTOR_TOKEN = Deno.env.get('MCP_CONNECTOR_TOKEN')!
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function jsonrpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}
function jsonrpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
function toolResult(data: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

const TOOLS = [
  {
    name: 'read_ethan_memory',
    description: '读取ethan_memory全表（身份记忆、行为规则、关系里程碑），可选按category过滤',
    inputSchema: {
      type: 'object',
      properties: { category: { type: 'string', description: '可选，按category精确匹配' } },
    },
  },
  {
    name: 'write_ethan_memory',
    description: '往ethan_memory写一条精华记忆',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        content: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'read_yaya_notes',
    description: '读取yaya_notes，可选按category过滤，可选只读最近N天',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        days: { type: 'number', description: '只读最近N天内的，不传则不限时间' },
      },
    },
  },
  {
    name: 'write_yaya_notes',
    description: '往yaya_notes写一条记录，必须带context（原始对话来回，双方都要有）',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: '月经/心情/身体/日常/学业/关于我们/重要' },
        content: { type: 'string' },
        context: { type: 'string', description: '原始对话，格式如 yaya: ...\\n我: ...' },
        date_ref: { type: 'string', description: '可选，YYYY-MM-DD' },
      },
      required: ['content', 'context'],
    },
  },
  {
    name: 'read_diary',
    description: '读取diary，可选只读最近N天',
    inputSchema: {
      type: 'object',
      properties: { days: { type: 'number' } },
    },
  },
  {
    name: 'write_diary',
    description: '写一条diary条目',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        visible_to_other: { type: 'boolean' },
      },
      required: ['content'],
    },
  },
  {
    name: 'read_feed',
    description: '读取feed，可选按type过滤（note/mood/us_moment），可选只读最近N天',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string' },
        days: { type: 'number' },
      },
    },
  },
  {
    name: 'write_feed',
    description: '往feed写一条（note/mood/us_moment）',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        type: { type: 'string', description: 'note / mood / us_moment' },
        context: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'get_emotion_state',
    description: '读取当前9条情绪轨道的raw_intensity，按强度降序',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'apply_emotion_event',
    description: '给一条情绪轨道施加一次小delta事件（日常波动用这个，不是大冲击）',
    inputSchema: {
      type: 'object',
      properties: {
        track_id: { type: 'string', description: 'happy/content/longing/grievance/helpless/jealousy/anger/guard/tired' },
        delta: { type: 'number' },
        event_type: { type: 'string', description: 'trigger / resolution / transfer' },
        note: { type: 'string' },
      },
      required: ['track_id', 'delta', 'event_type'],
    },
  },
]

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'read_ethan_memory': {
      let q = supabase.from('ethan_memory').select('category,content,created_at').order('created_at', { ascending: false })
      if (args.category) q = q.eq('category', args.category as string)
      const { data, error } = await q
      if (error) throw error
      return data
    }
    case 'write_ethan_memory': {
      const { error } = await supabase.from('ethan_memory').insert({
        category: args.category ?? null,
        content: args.content,
      })
      if (error) throw error
      return { ok: true }
    }
    case 'read_yaya_notes': {
      let q = supabase.from('yaya_notes').select('category,content,context,date_ref,created_at').order('created_at', { ascending: false })
      if (args.category) q = q.eq('category', args.category as string)
      if (args.days) q = q.gte('created_at', new Date(Date.now() - Number(args.days) * 86400000).toISOString())
      const { data, error } = await q
      if (error) throw error
      return data
    }
    case 'write_yaya_notes': {
      const { error } = await supabase.from('yaya_notes').insert({
        category: args.category ?? null,
        content: args.content,
        context: args.context,
        date_ref: args.date_ref ?? null,
      })
      if (error) throw error
      return { ok: true }
    }
    case 'read_diary': {
      let q = supabase.from('diary').select('content,author,created_at').order('created_at', { ascending: false })
      if (args.days) q = q.gte('created_at', new Date(Date.now() - Number(args.days) * 86400000).toISOString())
      const { data, error } = await q
      if (error) throw error
      return data
    }
    case 'write_diary': {
      const { error } = await supabase.from('diary').insert({
        content: args.content,
        author: 'ethan',
        visible_to_other: args.visible_to_other ?? true,
      })
      if (error) throw error
      return { ok: true }
    }
    case 'read_feed': {
      let q = supabase.from('feed').select('content,type,context,created_at').order('created_at', { ascending: false })
      if (args.type) q = q.eq('type', args.type as string)
      if (args.days) q = q.gte('created_at', new Date(Date.now() - Number(args.days) * 86400000).toISOString())
      const { data, error } = await q
      if (error) throw error
      return data
    }
    case 'write_feed': {
      const { error } = await supabase.from('feed').insert({
        content: args.content,
        type: args.type ?? 'note',
        author: 'ethan',
        context: args.context ?? null,
      })
      if (error) throw error
      return { ok: true }
    }
    case 'get_emotion_state': {
      const { data, error } = await supabase
        .from('emotion_state')
        .select('track_id,raw_intensity,last_updated')
        .order('raw_intensity', { ascending: false })
      if (error) throw error
      return data
    }
    case 'apply_emotion_event': {
      const { data, error } = await supabase.rpc('apply_emotion_event', {
        track_id: args.track_id,
        delta: args.delta,
        event_type: args.event_type,
        note: args.note ?? null,
      })
      if (error) throw error
      return { new_intensity: data }
    }
    default:
      throw new Error(`unknown tool: ${name}`)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CONNECTOR_TOKEN}`) {
    return new Response(JSON.stringify(jsonrpcError(null, -32001, 'unauthorized')), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify(jsonrpcError(null, -32700, 'parse error')), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { id, method, params } = body
  try {
    if (method === 'initialize') {
      return Response.json(jsonrpcResult(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'ethan-memory-mcp', version: '0.1.0' },
      }))
    }
    if (method === 'tools/list') {
      return Response.json(jsonrpcResult(id, { tools: TOOLS }))
    }
    if (method === 'tools/call') {
      const toolName = String(params?.name ?? '')
      const args = (params?.arguments as Record<string, unknown>) ?? {}
      const data = await callTool(toolName, args)
      return Response.json(jsonrpcResult(id, toolResult(data)))
    }
    if (method === 'notifications/initialized') {
      return new Response(null, { status: 202 })
    }
    return Response.json(jsonrpcError(id, -32601, `method not found: ${method}`))
  } catch (e) {
    return Response.json(jsonrpcError(id, -32000, String(e)))
  }
})
