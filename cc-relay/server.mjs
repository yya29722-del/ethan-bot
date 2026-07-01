import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const PORT = Number(process.env.PORT || 8787)
const RELAY_KEY = process.env.CC_RELAY_KEY || ''
const CLAUDE_BIN = process.env.CLAUDE_BIN || (
  existsSync('/usr/local/bin/claude') ? '/usr/local/bin/claude' :
  existsSync('/opt/homebrew/bin/claude') ? '/opt/homebrew/bin/claude' :
  'claude'
)
const DEFAULT_MODEL = process.env.CLAUDE_CODE_MODEL || ''
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 120000)
const MAX_PROMPT_CHARS = Number(process.env.MAX_PROMPT_CHARS || 60000)

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
      if (raw.length > 1024 * 1024) {
        req.destroy()
        reject(new Error('request body too large'))
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function assertAuth(req) {
  if (!RELAY_KEY) return true
  const auth = req.headers.authorization || ''
  return auth === `Bearer ${RELAY_KEY}`
}

function formatMessages(messages = []) {
  const parts = []
  for (const msg of messages) {
    const role = String(msg.role || 'user')
    const label =
      role === 'system' ? 'System' :
      role === 'assistant' ? 'yaya二号机' :
      role === 'user' ? 'yaya' :
      role
    const content = Array.isArray(msg.content)
      ? msg.content.map((part) => part?.text || '').join('\n')
      : String(msg.content || '')
    if (content.trim()) parts.push(`[${label}]\n${content.trim()}`)
  }
  const prompt = `${parts.join('\n\n')}\n\n[yaya二号机]\n`
  return prompt.length > MAX_PROMPT_CHARS
    ? prompt.slice(prompt.length - MAX_PROMPT_CHARS)
    : prompt
}

function parseClaudeOutput(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''

  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i])
      if (typeof parsed.result === 'string') return parsed.result.trim()
      if (typeof parsed.content === 'string') return parsed.content.trim()
      if (Array.isArray(parsed.content)) {
        return parsed.content.map((part) => part?.text || '').join('').trim()
      }
      if (parsed.message?.content) {
        if (typeof parsed.message.content === 'string') return parsed.message.content.trim()
        if (Array.isArray(parsed.message.content)) {
          return parsed.message.content.map((part) => part?.text || '').join('').trim()
        }
      }
    } catch {
      // Keep looking for JSON lines; fall back to raw text below.
    }
  }
  return trimmed
}

function runClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'json']
    if (model || DEFAULT_MODEL) args.push('--model', model || DEFAULT_MODEL)
    args.push(prompt)
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN

    const child = spawn(CLAUDE_BIN, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Claude timed out after ${REQUEST_TIMEOUT_MS}ms`))
    }, REQUEST_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(new Error(`Failed to start Claude at ${CLAUDE_BIN}: ${err.message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Claude at ${CLAUDE_BIN} exited with code ${code}`))
        return
      }
      resolve(parseClaudeOutput(stdout))
    })

  })
}

async function handleChat(req, res) {
  if (!assertAuth(req)) {
    send(res, 401, { error: { message: 'unauthorized' } })
    return
  }

  const body = await readJson(req)
  const prompt = formatMessages(body.messages || [])
  const content = await runClaude(prompt, body.model)

  send(res, 200, {
    id: `ccrelay-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || DEFAULT_MODEL || 'claude-code',
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
  })
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (req.method === 'OPTIONS') {
      send(res, 204, {})
      return
    }
    if (req.method === 'GET' && pathname === '/health') {
      send(res, 200, { ok: true })
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
  console.log(`CC relay listening on :${PORT}`)
})
