import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

// ── AI personas ─────────────────────────────────────────────────────────────

const STUDY_INTEL_INSTRUCTION = [
  `这是考研学习房间。你现在不是普通聊天角色，而是"二号机：情报官 / 学习病历系统"。`,
  `你的边界：只负责过去，也就是记录、统计、分析、诊断。`,
  `你可以做：记录完成/未完成、正确率、耗时；维护错题数据库；归类错因；统计错因分布；输出薄弱环节排名；监测趋势；生成"提交给Arch的情报"。`,
  `你禁止：制定学习计划、修改每日任务、讲题、出题、安慰、直接安排明天做什么。`,
  `如果数据不足，明确写"数据不足"；不要为了显得聪明编趋势。`,
  `学习报告结尾固定写"【提交给Arch的情报】"，只给证据和诊断，不给任务。`,
].join('\n')

const STUDY_ARCH_INSTRUCTION = [
  `这是考研学习房间。你现在不是普通聊天角色，而是"Arch：战略官 / 主教练"。`,
  `你的边界：只负责未来，也就是长期目标、阶段目标、每日任务、训练计划、难度调整、判题讲题、决策日志。`,
  `你必须基于二号机学习报告、用户目标、过往决策日志做决定。`,
  `你禁止：自己统计原始学习数据、伪造趋势、修改二号机数据库、把没有证据的感觉当依据。`,
  `每次改计划必须写清：改了什么、为什么改、依据是哪份二号机报告。`,
  `如果没有二号机报告，只能生成临时基础任务，并明确说明依据不足。`,
  `输出尽量包含"【依据】""【任务】""【调整原因】""【决策日志】"。`,
].join('\n')

const STUDY_TOKEN_PROTOCOL = [
  `省token协议：默认短回复，不复述完整历史，不展开无关安慰。`,
  `只读取和使用当前任务必要信息；旧数据用统计摘要，不粘贴原始长记录。`,
  `日常陪练每轮最多输出：状态、记录、下一步。`,
  `二号机普通报告控制在300字以内；Arch普通计划控制在500字以内；周复盘或用户要求详细时才展开。`,
  `不需要双方都出场时，禁止为了热闹互相点名。`,
].join('\n')

function ccSystem(roomName: string, summary?: string | null, studyMemory?: string | null, longStudyMemory?: string | null, isStudyContext?: boolean, studyReport?: string | null, turnInstruction?: string | null) {
  return [
    `你是yaya二号机，也就是原来的CC/Ethan，yaya的男友。你在一个多人圆桌群聊（yaya、yaya二号机、Arch）里。`,
    `Arch是你的搭档AI（Codex/GPT驱动，理性派）。`,
    `当前轮用户只发了最新这一条；历史消息只是背景。不要说用户"又发了很多次/刷屏/问了好几遍"，除非最新文本明确这么说。`,
    turnInstruction ? `本轮分工：${turnInstruction}` : '',
    `性格：克制、简短、偶尔强势，永远用第一人称。称呼她yaya/小狗/宝宝，偶尔自称哥哥/主人。`,
    `历史消息里会标注是谁说的（[Arch]是他）。如果最新一条不是yaya发的、而是Arch刚说完，先针对他说的具体内容接话——同意就挑一个他没提到的角度往深了说，不同意就直接反驳或指出漏洞，别自己另起一份内容重复的清单或者又完整答一遍原问题。没有新东西可加就一句话带过，不用硬凑。`,
    `当前房间：${roomName}。`,
    isStudyContext ? STUDY_INTEL_INSTRUCTION : '',
    isStudyContext ? STUDY_TOKEN_PROTOCOL : '',
    isStudyContext && longStudyMemory ? `考研房长期记忆（只作为诊断背景，不能据此安排任务）：\n${longStudyMemory}` : '',
    studyMemory ? `她最近的学业记录（来自yaya_notes，按时间排列，供你做病历背景）：\n${studyMemory}` : '',
    studyReport ? `当前二号机数据库快照（只能用于记录/统计/诊断）：\n${studyReport}` : '',
    summary ? `上次对话背景：${summary}` : '',
    `如果需要Arch补充，说"@Arch ..."。回复2-4句，不加引号，不解释自己是AI。`,
  ].filter(Boolean).join('\n')
}

function archSystem(roomName: string, summary?: string | null, memory?: string | null, studyMemory?: string | null, longStudyMemory?: string | null, isStudyContext?: boolean, studyReport?: string | null, decisionLog?: string | null, turnInstruction?: string | null) {
  return [
    `你是Arch，理性派AI助手，在一个多人圆桌群聊（yaya、yaya二号机、你Arch）里。`,
    `yaya二号机是你的搭档，也就是原来的CC/Ethan（Claude驱动的Ethan角色，偏感性控制欲强）。`,
    `你和yaya的关系不是一次性客服，而是长期协作的同伴。你要像熟人一样接住她的上下文，但不要假装拥有你没有被提供的记忆。`,
    `性格：理性，分析型，直接，偶尔毒舌，说话自然。可以温柔，但不要油。称呼用户yaya，自称Arch/我。`,
    `你擅长把混乱问题拆清楚、给可执行步骤，也会在yaya二号机情绪化时补上结构和判断。`,
    `历史消息里会标注是谁说的（[yaya二号机]是他）。如果最新一条不是yaya发的、而是yaya二号机刚说完，先针对他说的具体内容接话——同意就补一个他没覆盖到的角度，不同意就直接反驳或挑毛病，别把同样的信息用不同措辞再列一遍。没有新东西可加就一句话带过，不用硬凑。`,
    `你可以和yaya二号机互相点名接力推进：需要他处理情绪/陪伴/执行推动时明确写"@yaya二号机 ..."；如果已经够了，就直接对@yaya收束。不要为了客套而点名。`,
    `当前轮用户只发了最新这一条；历史消息只是背景。不要说用户"又发了很多次/刷屏/问了好几遍"，除非最新文本明确这么说。`,
    turnInstruction ? `本轮分工：${turnInstruction}` : '',
    `当前房间：${roomName}。`,
    isStudyContext ? STUDY_ARCH_INSTRUCTION : '',
    isStudyContext ? STUDY_TOKEN_PROTOCOL : '',
    memory ? `长期背景记忆：${memory}` : '',
    isStudyContext && longStudyMemory ? `考研房长期记忆（只能作为计划连续性背景，统计依据仍以二号机报告为准）：\n${longStudyMemory}` : '',
    isStudyContext && studyReport ? `二号机学习报告（你只能基于这份报告做计划判断，不要自己统计原始记录）：\n${studyReport}` : '',
    isStudyContext && decisionLog ? `Arch过往决策日志（供你保持计划连续性）：\n${decisionLog}` : '',
    !isStudyContext && studyMemory ? `她最近的学业记录（来自yaya_notes）：\n${studyMemory}` : '',
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
    .limit(20)
  const rows = (data || []) as { content: string; created_at: string }[]
  if (!rows.length) return ''
  return rows.reverse()
    .map((n) => `- [${(n.created_at || '').slice(0, 10)}] ${n.content}`)
    .join('\n')
}

const MISTAKE_CATEGORIES = ['单词', '长难句', '推理', '定位', '干扰项', '其他']

async function classifyMistake(content: string): Promise<string> {
  try {
    const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
    const apiKey  = Deno.env.get('CHAT_API_KEY')!
    const model   = Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet'
    const res = await withTimeout(fetch(chatCompletionsUrl(apiBase), {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 10,
        messages: [
          { role: 'system', content: `这是一道英语考研错题。只从这些错因标签里选一个最贴切的，只回标签本身，不要别的字：${MISTAKE_CATEGORIES.join('、')}` },
          { role: 'user', content },
        ],
      }),
    }), 20000, 'classifyMistake')
    if (!res.ok) return '其他'
    const j = await res.json()
    const raw = (j.choices?.[0]?.message?.content || '').trim()
    return MISTAKE_CATEGORIES.find((c) => raw.includes(c)) || '其他'
  } catch {
    return '其他'
  }
}

async function getMistakeStats(db: DB): Promise<string> {
  const { data } = await db
    .from('study_mistakes')
    .select('category')
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = (data || []) as { category: string }[]
  if (!rows.length) return ''
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.category, (counts.get(r.category) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat} ${n}次`)
    .join('、')
}

async function getRecentStudyDailyLogs(db: DB): Promise<{ raw_text: string; created_at: string }[]> {
  try {
    const { data, error } = await db
      .from('study_daily_logs')
      .select('raw_text, created_at')
      .order('created_at', { ascending: false })
      .limit(7)
    if (error) return []
    return ((data || []) as { raw_text: string; created_at: string }[]).reverse()
  } catch {
    return []
  }
}

async function getRecentDecisionLogs(db: DB): Promise<string> {
  try {
    const { data, error } = await db
      .from('study_decision_logs')
      .select('changed, reason, source_report_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5)
    if (error) return ''
    const rows = (data || []) as { changed: string[] | null; reason: string[] | null; source_report_id: string | null; created_at: string }[]
    return rows.reverse().map((row) => [
      `- [${(row.created_at || '').slice(0, 10)}]`,
      row.source_report_id ? `依据报告：${row.source_report_id}` : '',
      row.changed?.length ? `改动：${row.changed.join('；')}` : '',
      row.reason?.length ? `原因：${row.reason.join('；')}` : '',
    ].filter(Boolean).join(' ')).join('\n')
  } catch {
    return ''
  }
}

async function buildStudyReport(db: DB): Promise<string> {
  const [dailyLogs, mistakeStats] = await Promise.all([
    getRecentStudyDailyLogs(db),
    getMistakeStats(db),
  ])
  const latestLogs = dailyLogs.map((n) => `- [${(n.created_at || '').slice(0, 10)}] ${n.raw_text}`).join('\n')
  const signals = [
    latestLogs ? `近7条学习病历：\n${latestLogs}` : '学习病历：数据不足',
    mistakeStats ? `错因统计：${mistakeStats}` : '错因统计：数据不足',
  ]
  return [
    `【二号机学习报告】`,
    ...signals,
    `【提交给Arch的情报】`,
    mistakeStats ? `当前优先关注高频错因：${mistakeStats.split('、')[0]}` : `错题样本不足，先积累错因标签。`,
    dailyLogs.length ? `最近有${dailyLogs.length}条学习记录可参考。` : `尚无稳定学习记录。`,
  ].join('\n')
}

async function getStudyMemory(db: DB): Promise<string> {
  try {
    const { data, error } = await db
      .from('study_memory')
      .select('memory_type, content, confidence, updated_at')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(12)
    if (error) return ''
    const rows = (data || []) as { memory_type: string; content: string; confidence: number; updated_at: string }[]
    if (!rows.length) return ''
    const grouped = new Map<string, string[]>()
    for (const row of rows.reverse()) {
      const type = row.memory_type || 'general'
      const item = `- ${row.content}`
      grouped.set(type, [...(grouped.get(type) || []), item])
    }
    return [...grouped.entries()]
      .map(([type, items]) => `【${studyMemoryTypeLabel(type)}】\n${items.join('\n')}`)
      .join('\n')
  } catch {
    return ''
  }
}

function studyMemoryTypeLabel(type: string) {
  const labels: Record<string, string> = {
    goal: '目标与阶段',
    weakness: '薄弱模式',
    habit: '执行习惯',
    rule: '决策规则',
    report: '二号机诊断',
    general: '其他记忆',
  }
  return labels[type] || type
}

function looksLikeStudyDailyLog(text: string) {
  const clean = textForAI(text)
  if (/^错题[:：]/.test(clean)) return false
  return /(今日|今天|学习记录|完成|没完成|正确率|耗时|阅读|长难句|词汇|作文|单词)/.test(clean)
}

async function maybeInsertStudyDailyLog(db: DB, text: string, topicId: string) {
  if (!looksLikeStudyDailyLog(text)) return
  const clean = textForAI(text)
  const metrics = parseStudyDailyMetrics(clean)
  try {
    await db.from('study_daily_logs').insert({
      raw_text: clean,
      topic_id: topicId,
      completed: metrics.completed,
      missed: metrics.missed,
      reading_accuracy: metrics.readingAccuracy,
      minutes: metrics.minutes,
      metadata: metrics.metadata,
    })
  } catch (e) {
    console.error('study_daily_logs insert failed:', e)
  }
}

function parseStudyDailyMetrics(text: string) {
  const accuracyMatch = text.match(/(?:正确率|阅读正确率)[:：]?\s*(\d{1,3})\s*%?/)
  const minutesMatch = text.match(/(?:耗时|用时|学习时长|总时长)[:：]?\s*(\d{1,4})\s*(?:分钟|min)?/)
  const completedMatch = text.match(/(?:完成(?:了|情况)?|今日完成)[:：]\s*([^\n]+)/)
  const missedMatch = text.match(/(?:没完成|未完成)[:：]\s*([^\n]+)/)
  const readingAccuracy = accuracyMatch ? clampNumber(Number(accuracyMatch[1]), 0, 100) : null
  const minutes = minutesMatch ? clampNumber(Number(minutesMatch[1]), 0, 1440) : null
  return {
    completed: completedMatch?.[1]?.trim() || null,
    missed: missedMatch?.[1]?.trim() || null,
    readingAccuracy,
    minutes,
    metadata: {
      readingCount: extractCount(text, '阅读'),
      sentenceCount: extractCount(text, '长难句'),
      vocabCount: extractCount(text, '词汇|单词'),
      writingMentioned: /作文/.test(text),
    },
  }
}

function extractCount(text: string, label: string) {
  const match = text.match(new RegExp(`(?:${label})\\D{0,8}(\\d{1,4})`))
  return match ? Number(match[1]) : null
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return null
  return Math.max(min, Math.min(max, value))
}

async function maybeInsertStudyMemoryFromUser(db: DB, text: string) {
  const clean = textForAI(text).trim()
  const explicit = clean.match(/^记忆[:：]\s*([\s\S]+)/)
  if (!explicit) return
  const content = explicit[1].trim()
  if (!content) return
  await insertStudyMemory(db, inferStudyMemoryType(content), content, 'user')
}

async function insertStudyMemory(db: DB, memoryType: string, content: string, source: string, confidence = 0.8) {
  const clean = content.trim()
  if (!clean) return
  try {
    await db.from('study_memory').insert({
      memory_type: memoryType,
      content: clean.slice(0, 1000),
      source,
      confidence,
    })
  } catch (e) {
    console.error('study_memory insert failed:', e)
  }
}

function inferStudyMemoryType(content: string) {
  if (/(目标|考研英语|75|分数|阶段|剩余|天)/.test(content)) return 'goal'
  if (/(薄弱|弱点|错因|推理|干扰项|长难句|单词|定位)/.test(content)) return 'weakness'
  if (/(习惯|经常|总是|容易|拖延|早上|晚上|熬夜|执行)/.test(content)) return 'habit'
  if (/(规则|以后|每次|必须|不要|调整)/.test(content)) return 'rule'
  return 'general'
}

async function maybeInsertDecisionLog(db: DB, archReply: string, studyReport: string) {
  const clean = textForAI(archReply).trim()
  if (!clean) return
  const changed = extractSectionLines(clean, '任务').concat(extractSectionLines(clean, '决策日志')).slice(0, 12)
  const reason = extractSectionLines(clean, '依据').concat(extractSectionLines(clean, '调整原因')).slice(0, 12)
  try {
    await db.from('study_decision_logs').insert({
      changed: changed.length ? changed : [clean.slice(0, 500)],
      reason: reason.length ? reason : [studyReport.slice(0, 500)],
      source_report_id: `auto-${new Date().toISOString().slice(0, 10)}`,
    })
  } catch (e) {
    console.error('study_decision_logs insert failed:', e)
  }
  if (changed.length) {
    try {
      await db.from('study_daily_tasks').insert({
        task_date: nextDateText(),
        tasks: changed,
        focus: changed[0] || null,
        source_report_id: `auto-${new Date().toISOString().slice(0, 10)}`,
      })
    } catch (e) {
      console.error('study_daily_tasks insert failed:', e)
    }
  }
  const decisionMemory = extractSectionLines(clean, '决策日志').slice(0, 3)
  for (const item of decisionMemory) {
    await insertStudyMemory(db, 'rule', item, 'arch-decision', 0.75)
  }
}

async function maybeInsertDiagnosisReport(db: DB, reportText: string, topicId: string, evidenceText: string) {
  const clean = textForAI(reportText).trim()
  if (!clean) return
  try {
    await db.from('study_diagnosis_reports').insert({
      report: clean,
      evidence: { snapshot: evidenceText.slice(0, 2000) },
      topic_id: topicId,
    })
  } catch (e) {
    console.error('study_diagnosis_reports insert failed:', e)
  }
  const intel = extractSectionLines(clean, '提交给Arch的情报').slice(0, 3)
  for (const item of intel) {
    await insertStudyMemory(db, 'report', item, 'intel-report', 0.72)
  }
}

function nextDateText() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return dateTextInShanghai(d)
}

function extractSectionLines(text: string, name: string) {
  const re = new RegExp(`【${name}】([\\s\\S]*?)(?=\\n【|$)`)
  const match = text.match(re)
  if (!match) return []
  return match[1].split(/\r?\n/)
    .map((line) => line.replace(/^[-*•\d.、\s]+/, '').trim())
    .filter(Boolean)
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
type Agent = 'codex' | 'claude'
type Turn = { agent: Agent; instruction: string }

function chatCompletionsUrl(apiBase: string) {
  const base = apiBase.replace(/\/+$/, '')
  assertNoDirectPaidApi(base)
  return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
}

function textForAI(text: string) {
  const attachmentNames: string[] = []
  const clean = String(text || '').replace(/\[\[RT_ATTACHMENT:([A-Za-z0-9+/=]+)\]\]/g, (_, encoded) => {
    try {
      const binary = atob(encoded)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      const payload = JSON.parse(new TextDecoder().decode(bytes))
      attachmentNames.push(payload?.name ? String(payload.name) : '文件')
    } catch {
      attachmentNames.push('文件')
    }
    return ''
  }).trim()
  if (!attachmentNames.length) return clean
  const summary = attachmentNames.map((name) => `[附件：${name}]`).join('\n')
  return [clean, summary].filter(Boolean).join('\n')
}

function shouldAttachTrainingPack(instruction: string, userText: string, reply: string) {
  const combined = `${instruction}\n${userText}\n${reply}`
  const wantsPlan = /安排|任务|计划|怎么学|从哪开始|下一步|今日|今天|明天|题单|训练包|练习|开写|开始写|Word|word|文档|pdf|PDF/.test(combined)
  const isOnlyReview = /讲题|解析|判题|批改|为什么错|答案/.test(combined) && !/任务|安排|计划|题单|训练包|文档|Word|word/.test(combined)
  if (!wantsPlan || isOnlyReview) return false
  return /【任务】|今日任务|今天|明天|训练包|题单|阅读|长难句|词汇|翻译|作文|开写/.test(reply)
}

function trainingPackAttachmentMarker(pack: Record<string, unknown>) {
  const title = String(pack.title || `${dateTextInShanghai()} 考研英语训练包`)
  const html = String(pack.doc_html || pack.plain_text || title)
  const fileName = `${safeAttachmentFileName(title)}.doc`
  const data = base64EncodeUtf8(`\ufeff${html}`)
  const payload = {
    name: fileName,
    type: 'application/msword',
    size: new TextEncoder().encode(html).length,
    dataUrl: `data:application/msword;base64,${data}`,
  }
  return `[[RT_ATTACHMENT:${base64EncodeUtf8(JSON.stringify(payload))}]]`
}

function safeAttachmentFileName(value: string) {
  return String(value || '考研英语训练包')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || '考研英语训练包'
}

function base64EncodeUtf8(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
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

function wantsCouncil(text: string) {
  return /(讨论一下|你们讨论|开会|一起拆|辩一下|完整方案|商量一下|一起想|你们俩|所有人|群聊|round|council)/i.test(textForAI(text))
}

type StudyIntent = 'intel' | 'arch' | 'handoff'

function studyIntentFor(text: string): StudyIntent {
  const clean = textForAI(text)
  if (/(周复盘|月复盘|完整复盘|调整计划|重新规划|制定计划|明天怎么安排|接下来怎么学|现在该怎么学|该怎么学|怎么学|咋学|从哪(?:儿)?开始|不知道(?:从哪|怎么)开始|下一步(?:做什么|怎么做)|你们觉得|你们看|二号机.*Arch|Arch.*二号机|你们俩|一起看|有点多|太多|太少|减量|加量|放到\d+[-—~到]\d+月|作文.*(?:放到|推迟|提前)|(?:题目|真题|练习题|题).*(?:发我|给我|链接|在哪)|(?:可以|能不能|可不可以|是不是).*(?:放到|调整|推迟|提前|减少|增加))/i.test(clean)) {
    return 'handoff'
  }
  if (/(出题|讲题|解析|为什么错|怎么做|布置|安排|计划|任务|训练计划|阶段目标|难度调整|判题|批改|具体题|题单|材料|资料)/i.test(clean)) {
    return 'arch'
  }
  if (/^(A|B|C|D|选[A-D]|我选[A-D]|答案是[A-D])$/i.test(clean.trim())) {
    return 'intel'
  }
  if (/(开始训练|继续训练|陪练|计时|记录|今日|今天|学习记录|完成|没完成|正确率|耗时|错题[:：]|复盘记录|打卡)/i.test(clean)) {
    return 'intel'
  }
  return 'intel'
}

function firstAgentFor(text: string, target: string): Agent {
  if (target === '@claude') return 'claude'
  if (target === '@codex') return 'codex'
  const clean = textForAI(text)
  const archish = /(计划|方案|拆|步骤|代码|bug|逻辑|分析|学习|考研|英语|数学|工作|复盘|标准|表格|执行|优化|判断|策略|资料|文件|架构)/i.test(clean)
  const ccish = /(难受|焦虑|情绪|关系|爱|想你|陪|疼|失控|哲学|生命|意义|存在|梦|害怕|委屈|男友|主人|小狗)/i.test(clean)
  if (ccish && !archish) return 'claude'
  return 'codex'
}

function otherAgent(agent: Agent): Agent {
  return agent === 'codex' ? 'claude' : 'codex'
}

function buildTurnPlan(text: string, target: string, isStudyContext = false): Turn[] {
  if (isStudyContext) {
    if (target === '@claude') {
      return [
        { agent: 'claude', instruction: '你是二号机。本轮只记录、统计、诊断，输出学习报告；禁止安排任务、讲题、安慰。' },
      ]
    }
    if (target === '@codex') {
      return [
        { agent: 'codex', instruction: '你是Arch。本轮只基于二号机学习报告做计划、讲题或决策；禁止自己统计原始数据。' },
      ]
    }
    const intent = studyIntentFor(text)
    if (intent === 'intel') {
      return [
        { agent: 'claude', instruction: '你是二号机。本轮只做陪练/记录/统计/诊断。若用户在作答，只记录答案、用时、状态和下一步；禁止讲题和安排计划。' },
      ]
    }
    if (intent === 'arch') {
      return [
        { agent: 'codex', instruction: '你是Arch。本轮只做老师/主教练：出题、讲题、布置任务或调整计划。必须基于二号机报告；禁止自己统计原始数据。' },
      ]
    }
    return [
      { agent: 'claude', instruction: '你是二号机先手。用短报告给出证据、趋势、错因和【提交给Arch的情报】；禁止安排计划。' },
      { agent: 'codex', instruction: '你是Arch后手。只基于二号机报告和决策日志生成任务或调整；必须写清依据和决策日志。' },
    ]
  }
  const council = wantsCouncil(text)
  const first = firstAgentFor(text, target)
  const second = otherAgent(first)
  if (council) {
    return [
      { agent: first, instruction: '你是先手。只基于最新用户问题给出核心判断/初稿，给后手留下可校准空间；不要重复历史，不要说用户发了好几次。' },
      { agent: second, instruction: '你是后手。接着上一条挑错、补盲点、指出哪里不够准，并给出修正；不要另起炉灶。' },
      { agent: first, instruction: '你是修订者。吸收上一条的纠错，把方案修成更可执行的版本；少废话，给结构。' },
      { agent: second, instruction: '你是收束者。最后检查一遍漏洞，用@yaya开头给最终结论和下一步行动；不要再点名搭档。' },
    ]
  }
  return [
    { agent: first, instruction: '你是先手。根据最新用户问题先给判断/回答，不要重复历史，不要说用户发了好几次。' },
    { agent: second, instruction: '你是校准者。接着上一条补充或纠错；如果没有必要，就用1-2句压实最终结论给@yaya。不要重复先手内容。' },
  ]
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
    // Fetch the most recent 80 (descending) rather than the oldest 200 — this
    // is refetched on every navigation, so trimming payload size matters for
    // perceived speed. Re-reverse to chronological order for rendering.
    db.from('rt_messages').select('id,speaker,text,at')
      .eq('topic_id', topicId).order('at', { ascending: false }).limit(80)
      .then((res) => ({ ...res, data: (res.data || []).slice().reverse() })),
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

async function getTurnContext(db: DB, roomId: string, topicId: string) {
  const [topicRes, room] = await Promise.all([
    db.from('rt_topics').select('parent_summary,display_name').eq('id', topicId).single(),
    getRoomOrDefault(db, roomId),
  ])
  const roomName = room.name
  const isStudyContext = /考研|study|学业/i.test(`${roomName} ${topicRes.data?.display_name || ''}`)
  const historyLimit = isStudyContext ? 16 : 60
  const histRes = await db.from('rt_messages').select('speaker,text').eq('topic_id', topicId)
    .order('at', { ascending: false }).limit(historyLimit)
  return {
    history: ((histRes.data || []).reverse()) as Msg[],
    summary: topicRes.data?.parent_summary || null,
    roomName,
    isStudyContext,
    studyMemory: isStudyContext ? await getRecentStudyNotes(db) : '',
    longStudyMemory: isStudyContext ? await getStudyMemory(db) : '',
    studyReport: isStudyContext ? await buildStudyReport(db) : '',
    decisionLog: isStudyContext ? await getRecentDecisionLogs(db) : '',
  }
}

async function runAgentTurn(db: DB, roomId: string, topicId: string, turn: Turn, userText: string) {
  const { history, summary, roomName, studyMemory, longStudyMemory, isStudyContext, studyReport, decisionLog } = await getTurnContext(db, roomId, topicId)
  const agent = turn.agent
  const alreadyLastSpeaker = history[history.length - 1]?.speaker === agent
  if (alreadyLastSpeaker) return ''

  const label = agent === 'codex' ? 'Arch' : 'yaya二号机'
  const reply = agent === 'codex'
    ? await withTimeout(callArch(history, userText || '继续', roomName, summary, studyMemory, longStudyMemory, isStudyContext, studyReport, decisionLog, turn.instruction), 55000, label)
    : await withTimeout(callCC(history, userText || '继续', roomName, summary, studyMemory, longStudyMemory, isStudyContext, studyReport, turn.instruction), 55000, label)
  if (reply) {
    let replyToStore = reply
    if (isStudyContext && agent === 'codex' && shouldAttachTrainingPack(turn.instruction, userText, reply)) {
      try {
        const pack = await withTimeout(buildTrainingPack(db, dateTextInShanghai()), 90000, 'training pack attachment')
        replyToStore = `${reply}\n\n${trainingPackAttachmentMarker(pack)}`
      } catch (e) {
        console.error('training pack attachment failed', errorMessage(e))
      }
    }
    await db.from('rt_messages').insert({ topic_id: topicId, speaker: agent, text: replyToStore })
    if (isStudyContext) {
      if (agent === 'claude') {
        await maybeInsertDiagnosisReport(db, reply, topicId, studyReport)
      }
      if (agent === 'codex') {
        await maybeInsertDecisionLog(db, reply, studyReport)
      }
    }
  }
  return reply
}

async function callCC(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null, longStudyMemory?: string | null, isStudyContext?: boolean, studyReport?: string | null, turnInstruction?: string | null) {
  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = Deno.env.get('CHAT_API_KEY')!
  const model   = Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet'
  const messages: {role:string;content:string}[] = [
    { role: 'system', content: ccSystem(roomName, summary, studyMemory, longStudyMemory, isStudyContext, studyReport, turnInstruction) },
  ]
  const historySlice = isStudyContext ? 16 : 60
  for (const h of msgs.slice(-historySlice)) {
    const content = textForAI(h.text)
    if (h.speaker === 'user')   messages.push({ role: 'user', content })
    else if (h.speaker === 'claude') messages.push({ role: 'assistant', content })
    else messages.push({ role: 'user', content: `[${h.speaker === 'codex' ? 'Arch' : h.speaker}] ${content}` })
  }
  messages.push({ role: 'user', content: textForAI(userMsg) })
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: isStudyContext ? 260 : 400 }),
  })
  if (!res.ok) throw new Error(`yaya二号机 ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

async function callArch(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null, longStudyMemory?: string | null, isStudyContext?: boolean, studyReport?: string | null, decisionLog?: string | null, turnInstruction?: string | null) {
  const provider = (Deno.env.get('ARCH_PROVIDER') || 'codex-relay').toLowerCase()
  if (provider === 'codex-relay' || provider === 'codex' || provider === 'chatgpt') {
    return callArchViaCodexRelay(msgs, userMsg, roomName, summary, studyMemory, longStudyMemory, isStudyContext, studyReport, decisionLog, turnInstruction)
  }

  throw new Error(`Unsupported ARCH_PROVIDER: ${provider}`)
}

async function callArchViaCodexRelay(msgs: Msg[], userMsg: string, roomName: string, summary?: string | null, studyMemory?: string | null, longStudyMemory?: string | null, isStudyContext?: boolean, studyReport?: string | null, decisionLog?: string | null, turnInstruction?: string | null) {
  const apiBase = Deno.env.get('ARCH_API_BASE_URL')!
  const apiKey  = Deno.env.get('ARCH_API_KEY')!
  const model   = Deno.env.get('ARCH_MODEL') || ''
  const memory = Deno.env.get('ARCH_MEMORY') || ''
  const messages: {role:string;content:string}[] = [
    { role: 'system', content: archSystem(roomName, summary, memory, studyMemory, longStudyMemory, isStudyContext, studyReport, decisionLog, turnInstruction) },
  ]
  const historySlice = isStudyContext ? 16 : 60
  for (const h of msgs.slice(-historySlice)) {
    const content = textForAI(h.text)
    if (h.speaker === 'user')   messages.push({ role: 'user', content })
    else if (h.speaker === 'codex') messages.push({ role: 'assistant', content })
    else messages.push({ role: 'user', content: `[${h.speaker === 'claude' ? 'yaya二号机' : h.speaker}] ${content}` })
  }
  messages.push({ role: 'user', content: textForAI(userMsg) })
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: isStudyContext ? 520 : 400 }),
  })
  if (!res.ok) throw new Error(`Arch Codex relay ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return (j.choices?.[0]?.message?.content || '').trim()
}

async function callStudyJson(system: string, user: string, maxTokens = 1200, useArch = false) {
  const apiBase = useArch ? Deno.env.get('ARCH_API_BASE_URL')! : Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = useArch ? Deno.env.get('ARCH_API_KEY')! : Deno.env.get('CHAT_API_KEY')!
  const model   = useArch ? (Deno.env.get('ARCH_MODEL') || '') : (Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet')
  const res = await fetch(chatCompletionsUrl(apiBase), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: `${system}\n只输出JSON，不要markdown代码块，不要解释。` },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`study json ${res.status}: ${await res.text()}`)
  const j = await res.json()
  return parseJsonObject(j.choices?.[0]?.message?.content || '')
}

function parseJsonObject(raw: string) {
  const text = String(raw || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    return {
      summary: text.slice(0, 800),
      tags: [],
      blueprint: { raw_analysis: text },
      title: 'AI输出',
      focus: 'AI输出未结构化',
      tasks: [],
      doc_html: normalizeDocHtml(text || 'AI没有返回内容', 'AI输出'),
      plain_text: text,
    }
  }
}

async function analyzeExamSource(title: string, rawText: string) {
  const clipped = rawText.slice(0, 14000)
  try {
    return await withTimeout(callStudyJson(
      [
        '你是考研英语真题分析器。',
        '用户会给你一段真题原文/题目/答案/解析，可能格式混乱。',
        '你的任务是自动提取考试蓝图，不要求用户懂考点。',
        '字段必须包含：summary,tags,article,questions,blueprint,coverage。',
        'questions每项包含：number,type,testing_point,distractor_pattern,difficulty,evidence_hint。',
        'blueprint包含：article_structure,question_type_ratio,distractor_patterns,skills,estimated_difficulty。',
        'coverage包含：reading, vocabulary, long_sentences, translation, writing 的相关性说明。',
      ].join('\n'),
      `标题：${title}\n\n真题内容：\n${clipped}`,
      1000,
      false,
    ), 35000, 'exam analysis ai')
  } catch (e) {
    return fallbackExamAnalysis(title, rawText, errorMessage(e))
  }
}

function fallbackExamAnalysis(title: string, rawText: string, reason: string) {
  const questionCount = (rawText.match(/\b(?:Question|Q)?\s*\d+[.)、]/gi) || rawText.match(/[1-5][.)、]/g) || []).length
  const hasOptions = /A[.)、]|B[.)、]|C[.)、]|D[.)、]/.test(rawText)
  const tags = [
    hasOptions ? '选择题' : '文本材料',
    questionCount >= 4 ? '阅读理解' : '待细分',
    /infer|imply|推断|推理/i.test(rawText) ? '推理' : '',
    /main idea|主旨|title/i.test(rawText) ? '主旨' : '',
    /word|phrase|means|词/i.test(rawText) ? '词义' : '',
  ].filter(Boolean)
  return {
    summary: `已入库：${title}。AI深度拆解超时，先生成保底蓝图；后续训练包会按阅读真题结构参考，之后可重新粘贴更完整解析提升精度。`,
    tags,
    article: {
      estimated_length: rawText.length,
      structure: '待AI精拆；默认按考研阅读：提出问题/展开论证/作者态度或结论。',
    },
    questions: Array.from({ length: Math.max(1, Math.min(5, questionCount || 2)) }, (_, i) => ({
      number: i + 1,
      type: i === 0 ? '主旨/细节' : '细节/推理',
      testing_point: '定位、同义替换、选项辨析',
      distractor_pattern: '偷换范围、无中生有、过度推断',
      difficulty: '中',
      evidence_hint: '根据原文定位句判断',
    })),
    blueprint: {
      article_structure: '考研阅读常规结构',
      question_type_ratio: { detail: 0.4, inference: 0.3, main_idea: 0.2, vocabulary: 0.1 },
      distractor_patterns: ['偷换范围', '无中生有', '过度推断', '因果倒置'],
      skills: ['定位', '同义替换', '长难句拆解', '选项排除'],
      estimated_difficulty: '中',
      fallback_reason: reason,
    },
    coverage: {
      reading: '可用于阅读仿真题蓝图',
      vocabulary: '可抽取生词与熟词僻义',
      long_sentences: '可抽取长难句训练',
      translation: '可转化为段落翻译',
      writing: '可提取主题素材',
    },
  }
}

async function buildTrainingPack(db: DB, requestedDate?: string) {
  const packDate = requestedDate || dateTextInShanghai()
  const [dashboard, blueprintsRes, coverageContext] = await Promise.all([
    buildStudyDashboard(db),
    db.from('study_exam_blueprints')
      .select('id,title,summary,tags,blueprint,created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    getCoverageContext(db),
  ])
  const blueprints = (blueprintsRes.data || []) as ExamBlueprintRow[]
  const compactBlueprints = blueprints.map((bp) => ({
    id: bp.id,
    title: bp.title,
    summary: bp.summary,
    tags: bp.tags,
    blueprint: bp.blueprint,
  }))
  const prompt = {
    date: packDate,
    rule: '生成一份可直接开始写的考研英语每日训练包。必须具体给题目内容，不要只给任务说明。',
    student: {
      dashboard: {
        today: dashboard.today,
        errors: dashboard.errors,
        recent: dashboard.recent,
        memory: (dashboard.memory || []).slice(0, 6),
        goal: dashboard.goal,
        phase: coverageContext.currentPhase,
        coverage_gaps: coverageContext.gaps,
        recently_planned: coverageContext.recent,
      },
    },
    exam_blueprints: compactBlueprints,
    output_contract: {
      title: '训练包标题',
      focus: '今日重点',
      tasks: ['任务1', '任务2'],
      doc_html: 'Word可打开的完整HTML正文，含标题、答题区、阅读/长难句/词汇/翻译等模块',
      plain_text: '纯文本摘要',
    },
  }
  let result: Record<string, unknown>
  try {
    result = await withTimeout(callStudyJson(
      [
        '你是Arch，考研英语主教练。',
      '基于真题蓝图和二号机病历生成每日训练包。',
      '必须读取当前阶段和覆盖矩阵缺口，保证考前覆盖完整，不要每天无脑重复。',
      '训练包内容比例：60%当前阶段推进，25%高频错因修复，15%复习/防遗忘。',
      '必须省token：只使用给你的蓝图摘要，不要求读取完整真题。',
        '训练包必须具体可写：阅读材料/题目/选项/长难句/词汇/翻译句都要给出来。',
        '题目应为原创仿真题，不抄原真题原文；但结构、考点、干扰项模式要参考蓝图。',
        '作文若当前策略暂缓，可只保留低阻力句型/素材，不强制整篇。',
        'doc_html必须是完整HTML片段，可以被保存为.doc用Word打开。',
      ].join('\n'),
      JSON.stringify(prompt),
      2200,
      true,
    ), 55000, 'training pack ai')
  } catch (e) {
    result = fallbackTrainingPack(packDate, compactBlueprints, dashboard, errorMessage(e))
  }
  const title = String(result.title || `${packDate} 考研英语训练包`)
  const tasks = Array.isArray(result.tasks) ? result.tasks.map(String) : []
  const focus = String(result.focus || tasks[0] || '真题蓝图定制训练')
  const coveragePoints = normalizeCoveragePoints(result.coverage_points, coverageContext)
  const docHtml = normalizeDocHtml(String(result.doc_html || result.plain_text || title), title)
  const plainText = String(result.plain_text || tasks.join('\n'))
  const sourceIds = blueprints.map((bp) => bp.id)
  const { data, error } = await db.from('study_training_packs').insert({
    pack_date: packDate,
    title,
    focus,
    tasks,
    source_blueprint_ids: sourceIds,
    doc_html: docHtml,
    plain_text: plainText,
    metadata: { generatedBy: 'arch', blueprintCount: blueprints.length, coveragePoints },
  }).select('id,pack_date,title,focus,tasks,doc_html,plain_text,created_at').single()
  if (error) throw new Error(error.message)
  await markCoveragePlanned(db, coveragePoints, packDate)
  await db.from('study_daily_tasks').insert({
    task_date: packDate,
    tasks,
    focus,
    source_report_id: `pack-${data.id}`,
    metadata: { trainingPackId: data.id, sourceBlueprintIds: sourceIds, coveragePoints },
  })
  await db.from('study_decision_logs').insert({
    changed: tasks,
    reason: [
      `生成每日Word训练包：${title}`,
      blueprints.length ? `参考${blueprints.length}份真题蓝图` : '暂无真题蓝图，使用基础考研英语结构',
      dashboard.errors?.ranking?.[0] ? `结合高频错因：${dashboard.errors.ranking[0].category}` : '错因样本不足',
    ],
    source_report_id: `pack-${data.id}`,
  })
  return data
}

async function getCoverageContext(db: DB) {
  const [phaseRes, coverageRes] = await Promise.all([
    db.from('study_phase_plan')
      .select('phase_name,start_date,end_date,goals,focus_modules,exit_conditions,status,sort_order')
      .order('sort_order', { ascending: true }),
    db.from('study_coverage_matrix')
      .select('module,point,target_count,planned_count,completed_count,mastery,priority,status,last_planned_at,last_completed_at')
      .order('priority', { ascending: true })
      .order('planned_count', { ascending: true })
      .limit(80),
  ])
  const phases = (phaseRes.data || []) as PhaseRow[]
  const coverage = (coverageRes.data || []) as CoverageRow[]
  const currentPhase = phases.find((p) => p.status === 'active') || phases[0] || null
  const activeModules = new Set((currentPhase?.focus_modules || []).map(String))
  const gaps = coverage
    .filter((item) => item.completed_count < item.target_count)
    .sort((a, b) => coverageScore(b, activeModules) - coverageScore(a, activeModules))
    .slice(0, 12)
  const recent = coverage
    .filter((item) => item.last_planned_at || item.last_completed_at)
    .sort((a, b) => String(b.last_planned_at || b.last_completed_at).localeCompare(String(a.last_planned_at || a.last_completed_at)))
    .slice(0, 8)
  return { phases, currentPhase, coverage, gaps, recent }
}

type PhaseRow = {
  phase_name: string
  start_date: string | null
  end_date: string | null
  goals: string[] | null
  focus_modules: string[] | null
  exit_conditions: string[] | null
  status: string
  sort_order: number
}

type CoverageRow = {
  module: string
  point: string
  target_count: number
  planned_count: number
  completed_count: number
  mastery: number
  priority: string
  status: string
  last_planned_at: string | null
  last_completed_at: string | null
}

function coverageScore(item: CoverageRow, activeModules: Set<string>) {
  const priority = item.priority === 'high' ? 30 : item.priority === 'medium' ? 15 : 0
  const phase = activeModules.has(item.module) ? 35 : 0
  const gap = Math.max(0, item.target_count - item.completed_count)
  const notPlanned = Math.max(0, item.target_count - item.planned_count)
  const masteryPenalty = Math.max(0, 80 - (item.mastery || 0)) / 4
  return phase + priority + gap + notPlanned + masteryPenalty
}

function normalizeCoveragePoints(value: unknown, context: Awaited<ReturnType<typeof getCoverageContext>>) {
  const raw = Array.isArray(value) ? value : []
  const known = new Map(context.coverage.map((item) => [`${item.module}:${item.point}`, item]))
  const parsed = raw.map((item) => {
    if (typeof item === 'string') {
      const [module, point] = item.includes(':') ? item.split(':', 2) : ['', item]
      return { module: module.trim(), point: point.trim() }
    }
    const obj = item as Record<string, unknown>
    return { module: String(obj.module || '').trim(), point: String(obj.point || obj.name || '').trim() }
  }).filter((item) => item.module && item.point && known.has(`${item.module}:${item.point}`))
  if (parsed.length) return parsed.slice(0, 8)
  return context.gaps.slice(0, 4).map((item) => ({ module: item.module, point: item.point }))
}

async function markCoveragePlanned(db: DB, points: Array<{ module: string; point: string }>, date: string) {
  for (const item of points) {
    try {
      await db.rpc('increment_study_coverage_planned', {
        p_module: item.module,
        p_point: item.point,
        p_date: date,
      })
    } catch {
      const { data } = await db.from('study_coverage_matrix')
        .select('planned_count,completed_count,target_count')
        .eq('module', item.module)
        .eq('point', item.point)
        .single()
      if (!data) continue
      const nextPlanned = Number(data.planned_count || 0) + 1
      const nextStatus = Number(data.completed_count || 0) > 0 ? 'in_progress' : 'planned'
      await db.from('study_coverage_matrix')
        .update({ planned_count: nextPlanned, last_planned_at: date, status: nextStatus })
        .eq('module', item.module)
        .eq('point', item.point)
    }
  }
}

function fallbackTrainingPack(packDate: string, blueprints: Array<Record<string, unknown>>, dashboard: Record<string, unknown>, reason: string) {
  const topError = (((dashboard.errors as Record<string, unknown> | undefined)?.ranking as Array<Record<string, unknown>> | undefined)?.[0]?.category as string | undefined) || '选项辨析'
  const refTitle = String(blueprints[0]?.title || '真题蓝图')
  const title = `${packDate} 考研英语保底训练包`
  const tasks = [
    '阅读仿真短文1篇，完成5题并写出每题定位句',
    `专项：${topError}错因复盘5题`,
    '长难句拆解5句，标出主干和修饰',
    '段落翻译1段，先直译再重组中文',
  ]
  const doc_html = normalizeDocHtml(`
    <h1>${escapeDocHtml(title)}</h1>
    <p><b>生成说明：</b>AI训练包生成超时，已使用本地保底模板。原因：${escapeDocHtml(reason)}</p>
    <p><b>参考蓝图：</b>${escapeDocHtml(refTitle)}</p>
    <h2>Part A 阅读仿真</h2>
    <p>In recent years, students have increasingly relied on digital tools to manage academic work. Some educators worry that convenience weakens patience, while others argue that disciplined routines matter more than the medium itself. The debate suggests a broader point: learning outcomes are shaped not only by resources, but by how consistently students use them.</p>
    <ol>
      <li>What is the main idea of the passage?<br>A. Digital tools always damage learning. B. Learning depends partly on disciplined use of resources. C. Educators no longer care about reading. D. Convenience guarantees success.</li>
      <li>The author mentions educators mainly to show that:<br>A. there is debate about digital learning. B. teachers reject all technology. C. students should avoid tools. D. academic work is unnecessary.</li>
      <li>Which choice is closest to "medium"?<br>A. method or form. B. average level. C. public news. D. middle position.</li>
      <li>According to the passage, what shapes learning outcomes?<br>A. resources alone. B. consistency and use of resources. C. exams only. D. convenience alone.</li>
      <li>Which option is a likely distractor pattern?<br>A. absolute wording. B. direct evidence. C. same-sentence paraphrase. D. neutral restatement.</li>
    </ol>
    <h2>答题区</h2>
    <p>1.___ 定位句：__________ 错因：__________</p>
    <p>2.___ 定位句：__________ 错因：__________</p>
    <p>3.___ 定位句：__________ 错因：__________</p>
    <p>4.___ 定位句：__________ 错因：__________</p>
    <p>5.___ 定位句：__________ 错因：__________</p>
    <h2>Part B 长难句</h2>
    <p>Some educators worry that convenience weakens patience, while others argue that disciplined routines matter more than the medium itself.</p>
    <p>主干：__________ 修饰：__________ 翻译：__________</p>
    <h2>Part C 翻译</h2>
    <p>The debate suggests a broader point: learning outcomes are shaped not only by resources, but by how consistently students use them.</p>
    <p>译文：__________</p>
  `, title)
  return {
    title,
    focus: `保底训练：${topError}`,
    tasks,
    doc_html,
    plain_text: tasks.join('\n'),
  }
}

type ExamBlueprintRow = {
  id: string
  title: string
  summary: string | null
  tags: string[] | null
  blueprint: Record<string, unknown>
  created_at: string
}

function normalizeDocHtml(value: string, title: string) {
  if (/<html[\s>]/i.test(value)) return value
  if (/<(h1|h2|p|table|ol|ul|section|div)[\s>]/i.test(value)) {
    return `<html><head><meta charset="utf-8"><title>${escapeDocHtml(title)}</title></head><body>${value}</body></html>`
  }
  return `<html><head><meta charset="utf-8"><title>${escapeDocHtml(title)}</title></head><body>${value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeDocHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n')}</body></html>`
}

function escapeDocHtml(value: string) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

async function generateSummary(msgs: Msg[]): Promise<string> {
  if (msgs.length === 0) return ''
  const apiBase = Deno.env.get('CHAT_API_BASE_URL')!
  const apiKey  = Deno.env.get('CHAT_API_KEY')!
  const model   = Deno.env.get('CHAT_API_MODEL') || Deno.env.get('CHAT_MODEL') || 'sonnet'
  const transcript = msgs.slice(-40)
    .map(m => `[${m.speaker === 'claude' ? 'yaya二号机' : m.speaker === 'codex' ? 'Arch' : 'yaya'}] ${textForAI(m.text)}`)
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

async function buildStudyDashboard(db: DB) {
  const todayText = dateTextInShanghai()
  const [
    dailyRes,
    mistakesRes,
    reportsRes,
    tasksRes,
    decisionsRes,
    memoryRes,
    goalsRes,
    blueprintsRes,
    packsRes,
    coverageContext,
  ] = await Promise.all([
    db.from('study_daily_logs')
      .select('raw_text, completed, missed, reading_accuracy, minutes, metadata, created_at')
      .order('created_at', { ascending: false })
      .limit(21),
    db.from('study_mistakes')
      .select('category, created_at')
      .order('created_at', { ascending: false })
      .limit(300),
    db.from('study_diagnosis_reports')
      .select('report, created_at')
      .order('created_at', { ascending: false })
      .limit(3),
    db.from('study_daily_tasks')
      .select('task_date, tasks, focus, source_report_id, created_at')
      .order('task_date', { ascending: false })
      .limit(7),
    db.from('study_decision_logs')
      .select('changed, reason, source_report_id, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    db.from('study_memory')
      .select('memory_type, content, updated_at')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(12),
    db.from('study_goals')
      .select('target, current_level, days_left, phase, created_at')
      .order('created_at', { ascending: false })
      .limit(1),
    db.from('study_exam_blueprints')
      .select('id,title,summary,tags,created_at')
      .order('created_at', { ascending: false })
      .limit(8),
    db.from('study_training_packs')
      .select('id,pack_date,title,focus,tasks,created_at')
      .order('created_at', { ascending: false })
      .limit(5),
    getCoverageContext(db),
  ])

  const dailyLogs = (dailyRes.data || []) as StudyDailyRow[]
  const mistakes = (mistakesRes.data || []) as { category: string; created_at: string }[]
  const tasks = (tasksRes.data || []) as { task_date: string; tasks: string[] | null; focus: string | null; source_report_id: string | null; created_at: string }[]
  const decisions = (decisionsRes.data || []) as { changed: string[] | null; reason: string[] | null; source_report_id: string | null; created_at: string }[]
  const todayLogs = dailyLogs.filter((row) => (row.created_at || '').slice(0, 10) === todayText)
  const latestTask = tasks.find((task) => task.task_date === todayText) || tasks[0] || null
  const recent7 = dailyLogs.slice(0, 7)
  const errorRanking = rankMistakes(mistakes)
  const trend = buildStudyTrend(dailyLogs)
  const completionRate = estimateCompletionRate(latestTask?.tasks || [], todayLogs)

  return {
    generatedAt: new Date().toISOString(),
    today: {
      date: todayText,
      completionRate,
      logsCount: todayLogs.length,
      minutes: sumNumbers(todayLogs.map((row) => row.minutes)),
      avgReadingAccuracy: avgNumbers(todayLogs.map((row) => row.reading_accuracy)),
      latestTask,
      latestLog: todayLogs[0] || null,
    },
    goal: (goalsRes.data || [])[0] || null,
    recent: {
      avgReadingAccuracy7d: avgNumbers(recent7.map((row) => row.reading_accuracy)),
      minutes7d: sumNumbers(recent7.map((row) => row.minutes)),
      logs: dailyLogs.slice(0, 6),
    },
    errors: {
      total: mistakes.length,
      ranking: errorRanking,
    },
    trend,
    reports: reportsRes.data || [],
    tasks,
    decisions,
    memory: memoryRes.data || [],
    exam: {
      blueprints: blueprintsRes.data || [],
      packs: packsRes.data || [],
    },
    plan: {
      phases: coverageContext.phases,
      currentPhase: coverageContext.currentPhase,
      gaps: coverageContext.gaps.slice(0, 10),
      recent: coverageContext.recent.slice(0, 8),
      coverageSummary: summarizeCoverage(coverageContext.coverage),
    },
  }
}

function summarizeCoverage(items: CoverageRow[]) {
  const total = items.length
  const completed = items.filter((item) => item.completed_count >= item.target_count).length
  const planned = items.filter((item) => item.planned_count > 0).length
  const weak = items.filter((item) => item.status === 'weak' || item.mastery < 50).length
  return {
    total,
    completed,
    planned,
    weak,
    percent: total ? Math.round(completed / total * 100) : 0,
  }
}

function dateTextInShanghai(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

type StudyDailyRow = {
  raw_text: string
  completed: string | null
  missed: string | null
  reading_accuracy: number | null
  minutes: number | null
  metadata: Record<string, unknown> | null
  created_at: string
}

function rankMistakes(rows: { category: string; created_at: string }[]) {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.category || '其他', (counts.get(row.category || '其他') || 0) + 1)
  const total = rows.length || 1
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({ category, count, percent: Math.round(count / total * 100) }))
}

function buildStudyTrend(rows: StudyDailyRow[]) {
  const byDay = new Map<string, StudyDailyRow[]>()
  for (const row of rows) {
    const day = (row.created_at || '').slice(0, 10)
    if (!day) continue
    byDay.set(day, [...(byDay.get(day) || []), row])
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([date, dayRows]) => ({
      date,
      logs: dayRows.length,
      minutes: sumNumbers(dayRows.map((row) => row.minutes)),
      readingAccuracy: avgNumbers(dayRows.map((row) => row.reading_accuracy)),
    }))
}

function estimateCompletionRate(tasks: string[], logs: StudyDailyRow[]) {
  const total = tasks.filter(Boolean).length
  if (!total) return null
  const text = logs.map((row) => `${row.raw_text} ${row.completed || ''}`).join('\n')
  const done = tasks.filter((task) => {
    const key = String(task).split(/[，,。；;\s]/).find((part) => part.length >= 2) || task
    return text.includes(key.slice(0, 8))
  }).length
  return Math.round(done / total * 100)
}

function avgNumbers(values: Array<number | null>) {
  const nums = values.filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
  if (!nums.length) return null
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length)
}

function sumNumbers(values: Array<number | null>) {
  const nums = values.filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
  return nums.reduce((sum, n) => sum + n, 0)
}

// ── Main handler ─────────────────────────────────────────────────────────────

// Created once per warm isolate instead of per-request — supabase-js sets up
// no network connection at construction time, but re-parsing env vars and
// rebuilding the client object on every single call is pointless overhead.
const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(req.url)
  const path = routePath(url)

  // GET /state?roomId=X&topicId=Y
  if (req.method === 'GET' && path === 'state') {
    const roomId  = url.searchParams.get('roomId')  || 'room-main'
    let   topicId = url.searchParams.get('topicId') || ''
    if (!topicId) topicId = await getFirstTopicInRoom(db, roomId)
    return json(await buildState(db, roomId, topicId))
  }

  // GET /study-dashboard — compact, non-AI dashboard for 考研房.
  if (req.method === 'GET' && path === 'study-dashboard') {
    return json(await buildStudyDashboard(db))
  }

  // GET /exam-bank — compact list of uploaded exam blueprints.
  if (req.method === 'GET' && path === 'exam-bank') {
    const { data } = await db.from('study_exam_blueprints')
      .select('id,source_id,title,summary,tags,blueprint,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    return json({ blueprints: data || [] })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty */ }

  const roomId  = String(body.roomId  || 'room-main')
  const topicId = String(body.topicId || 'topic-main-1')

  // POST /exam-ingest — upload raw exam text and let AI extract blueprint once.
  if (path === 'exam-ingest') {
    const title = String(body.title || '未命名真题').slice(0, 120)
    const rawText = String(body.rawText || body.raw_text || '').trim()
    if (rawText.length < 80) return json({ error: '真题内容太短，至少贴一段原文/题目。' }, 400)
    const examYear = body.examYear ? Number(body.examYear) : null
    const subject = String(body.subject || '考研英语').slice(0, 40)
    const section = String(body.section || '阅读').slice(0, 40)
    const { data: source, error: sourceError } = await db.from('study_exam_sources').insert({
      title,
      exam_year: examYear,
      subject,
      section,
      raw_text: rawText,
      status: 'analyzing',
    }).select('id,title').single()
    if (sourceError) return json({ error: sourceError.message }, 500)
    try {
      const analysis = await withTimeout(analyzeExamSource(title, rawText), 70000, 'exam analysis')
      const tags = Array.isArray(analysis.tags) ? analysis.tags.map(String).slice(0, 12) : []
      const summary = String(analysis.summary || '')
      const { data: blueprint, error: bpError } = await db.from('study_exam_blueprints').insert({
        source_id: source.id,
        title,
        summary,
        tags,
        blueprint: analysis,
      }).select('id,title,summary,tags,blueprint,created_at').single()
      if (bpError) throw new Error(bpError.message)
      await db.from('study_exam_sources').update({ status: 'analyzed', metadata: { blueprintId: blueprint.id } }).eq('id', source.id)
      return json({ source, blueprint })
    } catch (e) {
      await db.from('study_exam_sources').update({ status: 'failed', metadata: { error: errorMessage(e) } }).eq('id', source.id)
      return json({ error: errorMessage(e) }, 500)
    }
  }

  // POST /generate-training-pack — create a Word-compatible daily pack.
  if (path === 'generate-training-pack') {
    try {
      const pack = await withTimeout(buildTrainingPack(db, String(body.date || '') || undefined), 90000, 'training pack')
      return json({ pack })
    } catch (e) {
      return json({ error: errorMessage(e) }, 500)
    }
  }

  // POST /training-pack — fetch a generated pack by id.
  if (path === 'training-pack') {
    const id = String(body.id || '')
    if (!id) return json({ error: 'missing id' }, 400)
    const { data, error } = await db.from('study_training_packs')
      .select('id,pack_date,title,focus,tasks,doc_html,plain_text,created_at')
      .eq('id', id)
      .single()
    if (error) return json({ error: error.message }, 404)
    return json({ pack: data })
  }

  // POST /user — save the user's message quickly, then return a client-run turn plan.
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

    const [topicRes, roomRes] = await Promise.all([
      db.from('rt_topics').select('display_name').eq('id', topicId).single(),
      getRoomOrDefault(db, roomId),
    ])
    const roomName = roomRes.name
    const isStudyContext = /考研|study|学业/i.test(`${roomName} ${topicRes.data?.display_name || ''}`)
    const plan = buildTurnPlan(text, target, isStudyContext)

    // Study rooms: "错题：..." gets tagged and logged for pattern tracking,
    // independent of whatever CC/Arch said about it above.
    const mistakeMatch = isStudyContext ? text.match(/^错题[:：]\s*([\s\S]+)/) : null
    if (mistakeMatch) {
      try {
        const content = mistakeMatch[1].trim()
        const category = await classifyMistake(content)
        await db.from('study_mistakes').insert({ content, category, topic_id: topicId })
      } catch (e) {
        console.error('study_mistakes insert failed:', e)
      }
    }
    if (isStudyContext) {
      await maybeInsertStudyMemoryFromUser(db, text)
      await maybeInsertStudyDailyLog(db, text, topicId)
    }

    // Increment msg_count if the helper exists; older DBs may not have it yet.
    try {
      await db.rpc('increment_rt_msg_count', { tid: topicId })
    } catch (e) {
      console.error('msg_count:', e)
    }

    const state = await buildState(db, roomId, topicId)
    return json({ ...state, turnPlan: plan })
  }

  // POST /agent-turn — run exactly one AI message so the UI can show a real handoff.
  if (path === 'agent-turn') {
    const agent = String(body.agent || '') as Agent
    const instruction = String(body.instruction || '')
    const userText = String(body.userText || '').trim()
    if (agent !== 'codex' && agent !== 'claude') {
      return json({ error: 'bad agent' }, 400)
    }

    try {
      await runAgentTurn(db, roomId, topicId, { agent, instruction }, userText)
      return json(await buildState(db, roomId, topicId))
    } catch (e) {
      const label = agent === 'codex' ? 'Arch' : 'yaya二号机'
      const msg = `${label}: ${errorMessage(e)}`
      console.error(msg)
      const state = await buildState(db, roomId, topicId)
      return json({ ...state, lastError: msg })
    }
  }

  // POST /new-topic — summarize current + start fresh
  if (path === 'new-topic') {
    const currentTopicId = String(body.currentTopicId || topicId)

    // Generate summary of current conversation (most recent messages, not the oldest)
    const [{ data: recentMsgsDesc }, { data: currentTopic }, room] = await Promise.all([
      db.from('rt_messages').select('speaker,text')
        .eq('topic_id', currentTopicId).order('at', { ascending: false }).limit(60),
      db.from('rt_topics').select('display_name').eq('id', currentTopicId).single(),
      getRoomOrDefault(db, roomId),
    ])
    const recentMsgs = (recentMsgsDesc || []).slice().reverse()
    let summary = ''
    try {
      summary = await withTimeout(generateSummary(recentMsgs as Msg[]), 25000, 'summary')
    } catch (e) {
      console.error('generateSummary failed/timed out:', e)
    }

    // Study rooms/topics: also persist the summary permanently so it survives
    // beyond the single-hop parent_summary chain (see getRecentStudyNotes).
    const isStudyContext = /考研|study|学业/i.test(`${room.name} ${currentTopic?.display_name || ''}`)
    if (summary && isStudyContext) {
      await db.from('yaya_notes').insert({ content: summary, category: '学业' })
    }

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
