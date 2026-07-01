import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PORT = Number(process.env.PORT || 8789)
const RELAY_KEY = process.env.ARCH_RELAY_KEY || ''
const CODEX_BIN = process.env.CODEX_BIN || (
  process.platform === 'darwin'
    ? '/Applications/Codex.app/Contents/Resources/codex'
    : 'codex'
)
const DEFAULT_MODEL = process.env.CODEX_MODEL || ''
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 180000)
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
  return (req.headers.authorization || '') === `Bearer ${RELAY_KEY}`
}

function formatMessages(messages = []) {
  const parts = []
  for (const msg of messages) {
    const role = String(msg.role || 'user')
    const label =
      role === 'system' ? 'System' :
      role === 'assistant' ? 'Arch' :
      role === 'user' ? 'yaya' :
      role
    const content = Array.isArray(msg.content)
      ? msg.content.map((part) => part?.text || '').join('\n')
      : String(msg.content || '')
    if (content.trim()) parts.push(`[${label}]\n${content.trim()}`)
  }
  const prompt = [
    '你现在是 Round Table 群聊里的 Arch。只输出要发到群里的回复正文。',
    '不要执行代码、不要改文件、不要解释运行环境。',
    parts.join('\n\n'),
    '[Arch]',
  ].join('\n\n')
  return prompt.length > MAX_PROMPT_CHARS
    ? prompt.slice(prompt.length - MAX_PROMPT_CHARS)
    : prompt
}

async function runCodex(prompt, model) {
  const dir = await mkdtemp(join(tmpdir(), 'arch-codex-'))
  const outFile = join(dir, 'reply.txt')
  const args = [
    'exec',
    '--skip-git-repo-check',
    '--ephemeral',
    '--ignore-rules',
    '--sandbox', 'read-only',
    '--cd', dir,
    '--output-last-message', outFile,
  ]
  if (model || DEFAULT_MODEL) args.push('-m', model || DEFAULT_MODEL)
  args.push(prompt)

  try {
    return await new Promise((resolve, reject) => {
      const env = { ...process.env }
      delete env.OPENAI_API_KEY

      const child = spawn(CODEX_BIN, args, {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stderr = ''
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(`Codex timed out after ${REQUEST_TIMEOUT_MS}ms`))
      }, REQUEST_TIMEOUT_MS)

      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', async (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(stderr.trim() || `Codex exited with code ${code}`))
          return
        }
        try {
          const content = (await readFile(outFile, 'utf8')).trim()
          resolve(content)
        } catch {
          reject(new Error('Codex produced no final message'))
        }
      })
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

async function handleChat(req, res) {
  if (!assertAuth(req)) {
    send(res, 401, { error: { message: 'unauthorized' } })
    return
  }

  const body = await readJson(req)
  const prompt = formatMessages(body.messages || [])
  const content = await runCodex(prompt, body.model)

  send(res, 200, {
    id: `codexrelay-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || DEFAULT_MODEL || 'codex',
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
  console.log(`Arch Codex relay listening on :${PORT}`)
})
