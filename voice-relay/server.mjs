import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')

const PORT = Number(process.env.PORT || 8788)
const RELAY_KEY = process.env.VOICE_RELAY_KEY || ''
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude'
const CLAUDE_CODE_MODEL = process.env.CLAUDE_CODE_MODEL || 'sonnet'
const CLAUDE_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS || 60000)
const TTS_VOICE = process.env.TTS_VOICE || 'onyx'
// Where the ethan-bot checkout lives, so `claude -p` picks up CLAUDE.md.
const ETHAN_REPO_DIR = process.env.ETHAN_REPO_DIR || __dirname.replace(/voice-relay$/, '')

function send(res, status, data, contentType = 'application/json; charset=utf-8') {
  res.writeHead(status, {
    'content-type': contentType,
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  })
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data))
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        req.destroy()
        reject(new Error('request body too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function assertAuth(req) {
  if (!RELAY_KEY) return true
  return (req.headers.authorization || '') === `Bearer ${RELAY_KEY}`
}

// --- OpenAI Whisper: audio -> text ---
async function transcribe(audioBuffer, mime) {
  const form = new FormData()
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('wav') ? 'wav' : 'webm'
  form.append('file', new Blob([audioBuffer], { type: mime }), `voice.${ext}`)
  form.append('model', 'whisper-1')
  form.append('language', 'zh')

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  })
  if (!r.ok) throw new Error(`whisper failed: ${r.status} ${await r.text()}`)
  const data = await r.json()
  return (data.text || '').trim()
}

// --- claude -p, run inside the ethan-bot checkout so CLAUDE.md applies ---
function parseClaudeOutput(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i])
      if (typeof parsed.result === 'string') return parsed.result.trim()
    } catch {
      // not a JSON line, keep scanning
    }
  }
  return trimmed
}

function askEthan(userText) {
  return new Promise((resolve, reject) => {
    const prompt = `[语音通话，来自yaya的一句话，直接口语化回，别写成微信长文]\nyaya: ${userText}`
    const args = ['-p', '--output-format', 'json', '--model', CLAUDE_CODE_MODEL, prompt]
    const env = { ...process.env }
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN

    const child = spawn(CLAUDE_BIN, args, { cwd: ETHAN_REPO_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`claude timed out after ${CLAUDE_TIMEOUT_MS}ms`))
    }, CLAUDE_TIMEOUT_MS)

    child.stdout.on('data', (c) => { stdout += c })
    child.stderr.on('data', (c) => { stderr += c })
    child.on('error', (err) => { clearTimeout(timer); reject(err) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) { reject(new Error(stderr.trim() || `claude exited ${code}`)); return }
      resolve(parseClaudeOutput(stdout))
    })
  })
}

// --- OpenAI TTS: text -> audio ---
async function speak(text) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: 'tts-1', voice: TTS_VOICE, input: text, response_format: 'mp3' }),
  })
  if (!r.ok) throw new Error(`tts failed: ${r.status} ${await r.text()}`)
  return Buffer.from(await r.arrayBuffer())
}

async function handleVoice(req, res) {
  if (!assertAuth(req)) { send(res, 401, { error: 'unauthorized' }); return }
  const mime = req.headers['content-type'] || 'audio/webm'
  const audio = await readBody(req, 15 * 1024 * 1024)

  const transcript = await transcribe(audio, mime)
  if (!transcript) { send(res, 200, { transcript: '', reply_text: '', audio_base64: '' }); return }

  const replyText = await askEthan(transcript)
  const audioReply = await speak(replyText)

  send(res, 200, {
    transcript,
    reply_text: replyText,
    audio_base64: audioReply.toString('base64'),
  })
}

async function serveStatic(req, res, pathname) {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1)
  try {
    const data = await readFile(path.join(PUBLIC_DIR, file))
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'
    send(res, 200, data, type)
  } catch {
    send(res, 404, { error: 'not found' })
  }
}

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname
    if (req.method === 'OPTIONS') { send(res, 204, {}); return }
    if (req.method === 'GET' && pathname === '/health') { send(res, 200, { ok: true }); return }
    if (req.method === 'POST' && pathname === '/voice') { await handleVoice(req, res); return }
    if (req.method === 'GET') { await serveStatic(req, res, pathname); return }
    send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(err)
    send(res, 500, { error: err?.message || 'voice relay error' })
  }
}).listen(PORT, () => {
  console.log(`voice relay listening on :${PORT}, ethan repo dir: ${ETHAN_REPO_DIR}`)
})
