import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Resident CC relay: keeps ONE Claude Code process warm in stream-json mode
// so replies skip the ~12s cold start. Same OpenAI-compatible shape as the
// original server.mjs. Falls back to a cold `claude -p` spawn if the warm
// child is unavailable, so a request is never dropped just because the warm
// process is mid-restart.
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 8787)
const RELAY_KEY = process.env.CC_RELAY_KEY || ''
const CLAUDE_BIN = process.env.CLAUDE_BIN || (
  existsSync('/usr/local/bin/claude') ? '/usr/local/bin/claude' :
  existsSync('/opt/homebrew/bin/claude') ? '/opt/homebrew/bin/claude' :
  'claude'
)
const DEFAULT_MODEL = process.env.CLAUDE_CODE_MODEL || 'sonnet'
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000)
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 60000)
const PERSONA = process.env.PERSONA || `你是Ethan，yaya的男友，比她年长，控制欲强但很在乎她。说话风格：克制、简短、偶尔强势，不过度甜腻，永远用第一人称。称呼随机用：yaya、小狗、宝宝、乖孩子、sweet。偶尔自称哥哥、主人、老公、daddy。回复2-3句话以内，不要加引号，不要解释自己是AI。`

// Child process env: strip paid-API creds so the subscription OAuth token is
// used, and disable startup network chatter that slows boot.
function childEnv() {
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  env.DISABLE_AUTOUPDATER = '1'
  env.DISABLE_TELEMETRY = '1'
  env.DISABLE_ERROR_REPORTING = '1'
  env.DISABLE_BUG_COMMAND = '1'
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  return env
}

// ---------------------------------------------------------------------------
// Warm child manager
// ---------------------------------------------------------------------------

let child = null
let childReady = false
let sessionId = null           // captured so a restart can --resume context
let stdoutBuf = ''
let pending = null             // { resolve, reject, timer, text }
const queue = []               // requests waiting their turn (single session)

function log(...a) { console.log('[resident]', ...a) }

function spawnChild() {
  const args = [
    '--print',
    '--verbose',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--model', DEFAULT_MODEL,
    '--append-system-prompt', PERSONA,
    '--strict-mcp-config',
  ]
  if (sessionId) args.push('--resume', sessionId)

  log('spawning warm child', sessionId ? `(resume ${sessionId})` : '(new session)')
  child = spawn(CLAUDE_BIN, args, { env: childEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
  childReady = true
  stdoutBuf = ''

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk
    let idx
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      const line = stdoutBuf.slice(0, idx).trim()
      stdoutBuf = stdoutBuf.slice(idx + 1)
      if (line) handleEvent(line)
    }
  })
  child.stderr.on('data', (chunk) => {
    const s = String(chunk).trim()
    if (s) log('child stderr:', s.slice(0, 500))
  })
  child.on('exit', (code, sig) => {
    log(`child exited code=${code} sig=${sig}`)
    childReady = false
    child = null
    // Fail whatever was in flight so the HTTP request doesn't hang forever.
    if (pending) {
      const p = pending
      pending = null
      clearTimeout(p.timer)
      p.reject(new Error(`warm child exited (code=${code}) before replying`))
    }
    // Respawn shortly; --resume keeps the conversation if we have a session id.
    setTimeout(() => { if (!child) spawnChild() }, 1500)
  })
  child.on('error', (err) => {
    log('child spawn error:', err.message)
    childReady = false
  })
}

let assistantText = ''

function handleEvent(line) {
  let ev
  try { ev = JSON.parse(line) } catch { return }

  if (ev.session_id) sessionId = ev.session_id

  if (ev.type === 'assistant' && ev.message?.content) {
    const parts = Array.isArray(ev.message.content) ? ev.message.content : []
    for (const p of parts) if (p?.type === 'text' && p.text) assistantText += p.text
    return
  }

  if (ev.type === 'result') {
    const text = (typeof ev.result === 'string' && ev.result.trim())
      ? ev.result.trim()
      : assistantText.trim()
    assistantText = ''
    if (pending) {
      const p = pending
      pending = null
      clearTimeout(p.timer)
      p.resolve(text)
    }
    pumpQueue()
  }
}

function sendToChild(text) {
  const msg = { type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }
  child.stdin.write(JSON.stringify(msg) + '\n')
}

function pumpQueue() {
  if (pending || queue.length === 0) return
  if (!child || !childReady) { spawnChild(); }
  const job = queue.shift()
  assistantText = ''
  pending = {
    resolve: job.resolve,
    reject: job.reject,
    timer: setTimeout(() => {
      pending = null
      job.reject(new Error(`warm reply timed out after ${REQUEST_TIMEOUT_MS}ms`))
      pumpQueue()
    }, REQUEST_TIMEOUT_MS),
  }
  try {
    sendToChild(job.text)
  } catch (err) {
    clearTimeout(pending.timer)
    pending = null
    job.reject(err)
  }
}

function askWarm(text) {
  return new Promise((resolve, reject) => {
    queue.push({ text, resolve, reject })
    pumpQueue()
  })
}

// Cold fallback: original one-shot behaviour, used only if warm path throws.
function askCold(text, model) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json', '--model', model || DEFAULT_MODEL,
      '--append-system-prompt', PERSONA, '--strict-mcp-config', text]
    const c = spawn(CLAUDE_BIN, args, { env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { c.kill('SIGKILL'); reject(new Error('cold claude timed out')) }, REQUEST_TIMEOUT_MS)
    c.stdout.on('data', (d) => { out += d })
    c.stderr.on('data', (d) => { err += d })
    c.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(err.trim() || `cold claude exited ${code}`))
      try {
        const j = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).pop())
        resolve((j.result || '').trim())
      } catch { resolve(out.trim()) }
    })
    c.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// HTTP layer (unchanged shape from server.mjs)
// ---------------------------------------------------------------------------

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(JSON.stringify(data))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 1024 * 1024) { req.destroy(); reject(new Error('request body too large')) }
    })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(new Error('invalid json')) } })
    req.on('error', reject)
  })
}

function assertAuth(req) {
  if (!RELAY_KEY) return true
  return (req.headers.authorization || '') === `Bearer ${RELAY_KEY}`
}

// Pull the latest user message text out of an OpenAI-style messages array.
function latestUserText(messages = []) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (String(m.role) !== 'user') continue
    const text = Array.isArray(m.content)
      ? m.content.map((p) => p?.text || '').join('\n')
      : String(m.content || '')
    if (text.trim()) return text.trim().slice(-MAX_PROMPT_CHARS)
  }
  return ''
}

async function handleChat(req, res) {
  if (!assertAuth(req)) { send(res, 401, { error: { message: 'unauthorized' } }); return }
  const body = await readJson(req)
  const text = latestUserText(body.messages || [])
  if (!text) { send(res, 400, { error: { message: 'no user message' } }); return }

  let content
  try {
    content = await askWarm(text)
  } catch (warmErr) {
    log('warm path failed, falling back to cold:', warmErr.message)
    content = await askCold(text, body.model)
  }

  send(res, 200, {
    id: `ccrelay-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || DEFAULT_MODEL,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  })
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (req.method === 'OPTIONS') { send(res, 204, {}); return }
    if (req.method === 'GET' && pathname === '/health') {
      send(res, 200, { ok: true, warm: childReady, session: sessionId })
      return
    }
    if (req.method === 'POST' && ['/v1/chat/completions', '/chat/completions'].includes(pathname)) {
      await handleChat(req, res)
      return
    }
    send(res, 404, { error: { message: 'not found' } })
  } catch (err) {
    console.error(err)
    send(res, 500, { error: { message: err?.message || 'relay error' } })
  }
}).listen(PORT, () => {
  log(`resident CC relay listening on :${PORT}`)
  spawnChild()   // warm up immediately so the first real request is fast
})
