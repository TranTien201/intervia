// In-memory mock database. Persisted to sessionStorage in the browser so that
// reloading the page mid-interview restores the session (needed to test UI-6.5).
// Call `window.__mock.reset()` to go back to seed data.
import type {
  AccountData,
  AnalysisProgress,
  BlueprintView,
  CandidateProfile,
  Coverage,
  CvSummary,
  CvVersion,
  JdDetail,
  JdRequirements,
  JdVersion,
  Level,
  MatchResult,
  Mode,
  SessionEndSummary,
  SessionStep,
  SessionSummary,
  TranscriptItem,
  VersionOrigin,
} from '@/api/types'
import {
  CATALOG,
  competencyName,
  DONE_TRANSCRIPT,
  QUESTION_BANK,
  ROLES,
  SEED_CVS,
  SEED_JDS,
  SEED_SESSIONS,
} from './seed'
import { resetAuth } from './auth'

const STORAGE_KEY = 'intervia-mock-db'
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Simulated analysis duration (task UI-1.6: ~5s through each step). */
export const ANALYSIS_MS = 5_000
export const BLUEPRINT_MS = 3_000

interface AnalysisJob {
  started_at: number
  fail_code: string | null
  // profile/requirements produced when the job finishes
  result_version_origin: VersionOrigin
}

interface CvRow {
  id: string
  name: string
  file_name: string
  created_at: string
  updated_at: string
  versions: CvVersion[]
  job: AnalysisJob | null
  text: string
}

interface JdRow {
  id: string
  name: string
  company: string | null
  position: string | null
  text: string
  created_at: string
  updated_at: string
  versions: JdVersion[]
  job: AnalysisJob | null
}

interface BlueprintRow {
  started_at: number
  cv_version: number
  jd_version: number
  view: Omit<BlueprintView, 'status' | 'stale' | 'error'>
}

interface SessionRow {
  id: string
  role: { id: string; name: string }
  level: Level
  mode: Mode
  cv_id: string
  cv_version: number | null
  jd_id: string
  jd_version: number | null
  status: SessionSummary['status']
  blueprint: BlueprintRow | null
  items: TranscriptItem[]
  summary: SessionEndSummary | null
  created_at: string
  started_at: string | null
  ended_at: string | null
  /** Next question pointer for the scripted interview loop. */
  plan_cursor: number
  hint_count: number
  /**
   * Interviewer lines saved when they start streaming but not finished yet: item id → time
   * (ms) the stream would end. Like the real backend, the line is generated in full even if
   * the client goes away; the transcript shows it from that time on.
   */
  hidden_until?: Record<string, number>
}

export interface DbState {
  cvs: CvRow[]
  jds: JdRow[]
  sessions: SessionRow[]
  seq: number
}

// Initialised at the bottom of the file, after every helper it depends on.
let state: DbState

// ---------- persistence ----------
function load(): DbState | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as DbState) : null
  } catch {
    return null
  }
}

export function save() {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // storage unavailable: keep in memory only
  }
}

/** Rough size of a recorded answer: ~32 kbit/s Opus. */
const AUDIO_BYTES_PER_SECOND = 4_000

export function accountData(): AccountData {
  const answers = state.sessions.flatMap((s) => s.items).filter((i) => i.kind === 'answer')
  const recorded = answers.filter((a) => a.has_audio)
  return {
    cv_count: state.cvs.length,
    jd_count: state.jds.length,
    session_count: state.sessions.length,
    audio_count: recorded.length,
    audio_bytes: recorded.reduce(
      (sum, a) => sum + Math.round(((a.duration_ms ?? 0) / 1000) * AUDIO_BYTES_PER_SECOND),
      0,
    ),
  }
}

/** Account deleted: its CVs, JDs and sessions go (in the mock: everyone's, the data is shared). */
export function deleteAllData() {
  state = { cvs: [], jds: [], sessions: [], seq: state.seq }
  save()
}

export function reset(empty = false) {
  state = empty ? { cvs: [], jds: [], sessions: [], seq: 1 } : seed()
  save()
  resetAuth()
}

export const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${state.seq++}`
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const clone = <T>(v: T): T => structuredClone(v)

// ---------- seed ----------
function seed(): DbState {
  const cvs: CvRow[] = SEED_CVS.map((c) => ({
    id: c.id,
    name: c.name,
    file_name: c.file_name,
    created_at: iso(c.created_days_ago * DAY),
    updated_at: iso(c.versions.at(-1)!.days_ago * DAY),
    text: `Nội dung CV mẫu (${c.file_name}).`,
    job: null,
    versions: c.versions.map((v, i) => ({
      cv_id: c.id,
      version: i + 1,
      created_at: iso(v.days_ago * DAY),
      origin: v.origin,
      profile: clone(v.profile),
    })),
  }))
  const jds: JdRow[] = SEED_JDS.map((j) => ({
    id: j.id,
    name: j.name,
    company: j.company,
    position: j.position,
    text: j.text,
    created_at: iso(j.created_days_ago * DAY),
    updated_at: iso(j.created_days_ago * DAY),
    job: null,
    versions: [
      {
        jd_id: j.id,
        version: 1,
        created_at: iso(j.created_days_ago * DAY),
        origin: 'analysis',
        requirements: clone(j.requirements),
      },
    ],
  }))
  const tmp: DbState = { cvs, jds, sessions: [], seq: 1 }
  state = tmp
  tmp.sessions = SEED_SESSIONS.map((s) => {
    const created = Date.now() - s.created_hours_ago * HOUR
    const row: SessionRow = {
      id: s.id,
      role: ROLES.find((r) => r.id === s.role_id)!,
      level: s.level,
      mode: 'text',
      cv_id: s.cv_id,
      cv_version: s.cv_version,
      jd_id: s.jd_id,
      jd_version: s.jd_version,
      status: s.status,
      blueprint: null,
      items: [],
      summary: null,
      created_at: new Date(created).toISOString(),
      started_at: null,
      ended_at: null,
      plan_cursor: 0,
      hint_count: 0,
    }
    if (s.has_blueprint) row.blueprint = buildBlueprint(row, created - BLUEPRINT_MS)
    if (s.status === 'completed') {
      const start = created + 10 * 60_000
      row.started_at = new Date(start).toISOString()
      row.items = DONE_TRANSCRIPT.map(({ at_min, ...it }) => ({
        ...it,
        created_at: new Date(start + at_min * 60_000).toISOString(),
      })) as TranscriptItem[]
      row.ended_at = new Date(start + (s.duration_minutes ?? 20) * 60_000).toISOString()
      row.summary = summarize(row)
    }
    if (s.status === 'in_progress') {
      const start = created + 5 * 60_000
      row.started_at = new Date(start).toISOString()
      row.mode = 'voice_text'
      const plan = questionPlan(row)
      const q = (i: number): TranscriptItem => ({
        kind: 'question',
        id: `q${i + 1}`,
        index: i + 1,
        text: plan[i]!.text,
        competency: { id: plan[i]!.competency, name: competencyName(plan[i]!.competency) },
        depth: 'L4',
        unplanned: false,
        created_at: new Date(start + i * 4 * 60_000).toISOString(),
      })
      row.items = [
        q(0),
        {
          kind: 'answer',
          id: 'a1',
          question_id: 'q1',
          text_original:
            'Mình làm chatbot hỗ trợ khách hàng dùng RAG trên tài liệu nội bộ, khó nhất là đánh giá câu trả lời có đúng không.',
          text_edited: null,
          source: 'stt',
          has_audio: true,
          duration_ms: 61_000,
          created_at: new Date(start + 3 * 60_000).toISOString(),
        },
        q(1),
        {
          kind: 'answer',
          id: 'a2',
          question_id: 'q2',
          text_original: 'Bên mình dùng structured output, sai schema thì retry tối đa hai lần.',
          text_edited: null,
          source: 'text',
          has_audio: false,
          duration_ms: null,
          created_at: new Date(start + 7 * 60_000).toISOString(),
        },
        q(2),
      ]
      row.plan_cursor = 3
    }
    return row
  })
  return tmp
}

// ---------- CV ----------
export const cvRow = (id: string) => state.cvs.find((c) => c.id === id)
export const jdRow = (id: string) => state.jds.find((j) => j.id === id)
export const sessionRow = (id: string) => state.sessions.find((s) => s.id === id)

export function cvSummary(c: CvRow): CvSummary {
  tickCv(c)
  return {
    id: c.id,
    name: c.name,
    file_name: c.file_name,
    latest_version: c.versions.at(-1)?.version ?? null,
    analysis_status: analysisStatus(c.job, c.versions.length > 0),
    session_count: state.sessions.filter((s) => s.cv_id === c.id).length,
    created_at: c.created_at,
    updated_at: c.updated_at,
  }
}

export const listCvs = () =>
  [...state.cvs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(cvSummary)

export function createCv(name: string, fileName: string): CvRow {
  const now = new Date().toISOString()
  const row: CvRow = {
    id: nextId('cv'),
    name,
    file_name: fileName,
    created_at: now,
    updated_at: now,
    versions: [],
    text: `Nội dung CV (${fileName}).`,
    job: {
      started_at: Date.now(),
      fail_code: failCodeFor(fileName),
      result_version_origin: 'analysis',
    },
  }
  state.cvs.push(row)
  save()
  return row
}

function failCodeFor(fileName: string) {
  if (/scan/i.test(fileName)) return 'no_text_in_file'
  if (mockFlags().analysis_fail) return 'llm_error'
  return null
}

/** Finish a pending analysis job once its simulated time has passed. */
function tickCv(c: CvRow) {
  if (!c.job || c.job.fail_code || Date.now() - c.job.started_at < ANALYSIS_MS) return
  const base = c.versions.at(-1)?.profile ?? SEED_CVS[0]!.versions[0]!.profile
  c.versions.push({
    cv_id: c.id,
    version: c.versions.length + 1,
    created_at: new Date().toISOString(),
    origin: c.job.result_version_origin,
    profile: clone(base),
  })
  c.updated_at = new Date().toISOString()
  c.job = null
  save()
}

export function cvAnalysis(c: CvRow): AnalysisProgress {
  tickCv(c)
  return progress(c.job, c.versions.length > 0, [
    { key: 'upload', label: 'Đã tải CV' },
    { key: 'extract', label: 'Đang đọc CV' },
    { key: 'profile', label: 'Trích xuất hồ sơ' },
  ])
}

export function saveCvVersion(
  c: CvRow,
  profile: CandidateProfile,
  origin: VersionOrigin = 'user_edit',
): CvVersion {
  const v: CvVersion = {
    cv_id: c.id,
    version: (c.versions.at(-1)?.version ?? 0) + 1,
    created_at: new Date().toISOString(),
    origin,
    profile: clone(profile),
  }
  c.versions.push(v)
  c.updated_at = v.created_at
  save()
  return v
}

export function reanalyzeCv(c: CvRow) {
  c.job = {
    started_at: Date.now(),
    fail_code: mockFlags().analysis_fail ? 'llm_error' : null,
    result_version_origin: 'reanalysis',
  }
  save()
}

export function deleteCv(id: string) {
  state.sessions = state.sessions.filter((s) => s.cv_id !== id)
  state.cvs = state.cvs.filter((c) => c.id !== id)
  save()
}

// ---------- JD ----------
export function jdDetail(j: JdRow): JdDetail {
  tickJd(j)
  const latest = j.versions.at(-1)
  return {
    id: j.id,
    name: j.name,
    company: j.company,
    position: j.position,
    latest_version: latest?.version ?? null,
    analysis_status: analysisStatus(j.job, j.versions.length > 0),
    requirement_count: latest?.requirements.requirements.length ?? 0,
    session_count: state.sessions.filter((s) => s.jd_id === j.id).length,
    created_at: j.created_at,
    updated_at: j.updated_at,
    text: j.text,
  }
}

export const listJds = () =>
  [...state.jds]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map((j) => {
      const { text: _text, ...summary } = jdDetail(j)
      return summary
    })

/**
 * Mock text extraction for an uploaded JD: no real PDF/DOCX parsing, returns a sample JD so
 * analysis yields requirements. A file name containing "scan" has no text (null).
 */
export function jdTextFromFile(fileName: string): string | null {
  if (/scan/i.test(fileName)) return null
  return `(Chữ trích từ ${fileName}, giả lập)\n\n${SEED_JDS[0]!.text}`
}

export function createJd(name: string, text: string): JdRow {
  const now = new Date().toISOString()
  const row: JdRow = {
    id: nextId('jd'),
    name,
    company: null,
    position: null,
    text,
    created_at: now,
    updated_at: now,
    versions: [],
    job: {
      started_at: Date.now(),
      fail_code: mockFlags().analysis_fail ? 'llm_error' : null,
      result_version_origin: 'analysis',
    },
  }
  state.jds.push(row)
  save()
  return row
}

function tickJd(j: JdRow) {
  if (!j.job || j.job.fail_code || Date.now() - j.job.started_at < ANALYSIS_MS) return
  j.versions.push({
    jd_id: j.id,
    version: j.versions.length + 1,
    created_at: new Date().toISOString(),
    origin: j.job.result_version_origin,
    requirements: j.versions.at(-1)?.requirements ?? requirementsFromText(j.text),
  })
  j.updated_at = new Date().toISOString()
  j.job = null
  save()
}

/** Naive keyword mapping so a pasted JD yields plausible requirements. */
function requirementsFromText(text: string): JdRequirements {
  const lower = text.toLowerCase()
  const hits = CATALOG.filter((c) => c.keywords.some((k) => lower.includes(k)))
  const picked = hits.length > 0 ? hits : CATALOG.slice(0, 3)
  return {
    requirements: picked.slice(0, 6).map((c, i) => ({
      id: `rq${i + 1}`,
      catalog_id: c.id,
      name: c.name,
      kind: i < 3 ? 'required' : 'preferred',
      importance: i < 2 ? 3 : i < 4 ? 2 : 1,
      source_quote: c.keywords[0] ?? null,
    })),
    unmapped: [],
  }
}

export function jdAnalysis(j: JdRow): AnalysisProgress {
  tickJd(j)
  return progress(j.job, j.versions.length > 0, [
    { key: 'receive', label: 'Đã nhận JD' },
    { key: 'analyze', label: 'Phân tích JD' },
  ])
}

export function saveJdVersion(j: JdRow, requirements: JdRequirements): JdVersion {
  const v: JdVersion = {
    jd_id: j.id,
    version: (j.versions.at(-1)?.version ?? 0) + 1,
    created_at: new Date().toISOString(),
    origin: 'user_edit',
    requirements: clone(requirements),
  }
  j.versions.push(v)
  j.updated_at = v.created_at
  save()
  return v
}

export function reanalyzeJd(j: JdRow) {
  j.job = {
    started_at: Date.now(),
    fail_code: mockFlags().analysis_fail ? 'llm_error' : null,
    result_version_origin: 'reanalysis',
  }
  save()
}

export function deleteJd(id: string) {
  state.sessions = state.sessions.filter((s) => s.jd_id !== id)
  state.jds = state.jds.filter((j) => j.id !== id)
  save()
}

// ---------- analysis helpers ----------
function analysisStatus(job: AnalysisJob | null, hasVersion: boolean): AnalysisProgress['status'] {
  if (job?.fail_code && Date.now() - job.started_at >= ANALYSIS_MS / 2) return 'failed'
  if (job) return 'running'
  return hasVersion ? 'done' : 'pending'
}

function progress(
  job: AnalysisJob | null,
  hasVersion: boolean,
  steps: { key: string; label: string }[],
): AnalysisProgress {
  const status = analysisStatus(job, hasVersion)
  if (!job) {
    return { status, steps: steps.map((s) => ({ ...s, status: 'done' })), error: null }
  }
  const elapsed = Date.now() - job.started_at
  const failAt = ANALYSIS_MS / 2
  const stepMs = ANALYSIS_MS / steps.length
  const current = Math.min(
    steps.length - 1,
    Math.floor((status === 'failed' ? failAt : elapsed) / stepMs),
  )
  return {
    status,
    steps: steps.map((s, i) => ({
      ...s,
      status:
        i < current
          ? 'done'
          : i === current
            ? status === 'failed'
              ? 'failed'
              : 'running'
            : 'pending',
    })),
    error:
      status === 'failed'
        ? job.fail_code === 'no_text_in_file'
          ? { code: 'no_text_in_file', message: 'File này là ảnh scan, không có chữ để đọc.' }
          : { code: 'llm_error', message: 'Dịch vụ AI đang lỗi, chưa phân tích được.' }
        : null,
  }
}

// ---------- sessions ----------
function stepOf(s: SessionRow): SessionStep {
  if (s.status === 'completed') return 'review'
  if (s.status === 'in_progress') return 'interview'
  return s.blueprint ? 'plan' : 'match'
}

export function sessionSummary(s: SessionRow): SessionSummary {
  const cv = cvRow(s.cv_id)
  const jd = jdRow(s.jd_id)
  // Drafts follow the CV/JD once its first analysis finishes.
  if (s.status === 'draft') {
    if (s.cv_version === null && cv) s.cv_version = cvSummary(cv).latest_version
    if (s.jd_version === null && jd) s.jd_version = jdDetail(jd).latest_version
  }
  return {
    id: s.id,
    role: s.role,
    level: s.level,
    status: s.status,
    step: stepOf(s),
    mode: s.mode,
    cv: { id: s.cv_id, name: cv?.name ?? '(đã xóa)', version: s.cv_version },
    jd: { id: s.jd_id, name: jd?.name ?? '(đã xóa)', version: s.jd_version },
    progress: {
      asked: s.items.filter((i) => i.kind === 'question').length,
      planned: plannedTotal(s),
    },
    created_at: s.created_at,
    started_at: s.started_at,
    ended_at: s.ended_at,
  }
}

export const listSessions = (filter?: (s: SessionRow) => boolean) =>
  state.sessions
    .filter(filter ?? (() => true))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map(sessionSummary)

export function createSession(input: {
  cv_id: string
  jd_id: string
  role: { id: string; name: string }
  level: Level
}): SessionRow {
  const cv = cvRow(input.cv_id)!
  const jd = jdRow(input.jd_id)!
  const row: SessionRow = {
    id: nextId('s'),
    role: input.role,
    level: input.level,
    mode: 'text',
    cv_id: cv.id,
    cv_version: cv.versions.at(-1)?.version ?? null,
    jd_id: jd.id,
    jd_version: jd.versions.at(-1)?.version ?? null,
    status: 'draft',
    blueprint: null,
    items: [],
    summary: null,
    created_at: new Date().toISOString(),
    started_at: null,
    ended_at: null,
    plan_cursor: 0,
    hint_count: 0,
  }
  state.sessions.push(row)
  save()
  return row
}

export function deleteSession(id: string) {
  state.sessions = state.sessions.filter((s) => s.id !== id)
  save()
}

function profileOf(s: SessionRow) {
  return cvRow(s.cv_id)?.versions.find((v) => v.version === s.cv_version)?.profile
}
function requirementsOf(s: SessionRow) {
  return jdRow(s.jd_id)?.versions.find((v) => v.version === s.jd_version)?.requirements
}

export function match(s: SessionRow): MatchResult | null {
  const profile = profileOf(s)
  const reqs = requirementsOf(s)
  if (!profile || !reqs) return null
  const have = new Set(profile.skills.map((k) => k.catalog_id).filter(Boolean))
  const split = (kind: 'required' | 'preferred') => {
    const list = reqs.requirements.filter((r) => r.kind === kind)
    return {
      covered: list
        .filter((r) => have.has(r.catalog_id))
        .map((r) => ({ id: r.catalog_id, name: r.name })),
      missing: list
        .filter((r) => !have.has(r.catalog_id))
        .map((r) => ({ id: r.catalog_id, name: r.name })),
    }
  }
  return { required: split('required'), preferred: split('preferred') }
}

// ---------- blueprint ----------
const DEPTH: Record<Level, [string, string]> = {
  junior: ['L2', 'L3'],
  mid: ['L3', 'L4'],
  senior: ['L4', 'L5'],
}

function buildBlueprint(s: SessionRow, startedAt = Date.now()): BlueprintRow | null {
  const reqs = requirementsOf(s)
  if (!reqs) return null
  const chosen = [...reqs.requirements].sort((a, b) => b.importance - a.importance).slice(0, 5)
  const raw = chosen.map((r) => r.importance + (r.kind === 'required' ? 1 : 0))
  const sum = raw.reduce((a, b) => a + b, 0)
  const total = s.level === 'junior' ? 8 : s.level === 'mid' ? 12 : 14
  const competencies = chosen.map((r, i) => {
    const weight = Math.round((raw[i]! / sum) * 100) / 100
    const n = Math.max(1, Math.round(weight * total))
    return {
      id: r.catalog_id,
      name: r.name,
      weight,
      depth_band: DEPTH[s.level],
      questions_min: n,
      questions_max: n + (n >= 2 ? 1 : 0),
    }
  })
  return {
    started_at: startedAt,
    cv_version: s.cv_version ?? 0,
    jd_version: s.jd_version ?? 0,
    view: { total_questions: total, competencies },
  }
}

export function startBlueprint(s: SessionRow) {
  s.blueprint = buildBlueprint(s)
  save()
}

export function blueprintView(s: SessionRow): BlueprintView {
  const b = s.blueprint
  if (!b)
    return { status: 'pending', stale: false, total_questions: 0, competencies: [], error: null }
  const running = Date.now() - b.started_at < BLUEPRINT_MS
  if (running)
    return { status: 'running', stale: false, total_questions: 0, competencies: [], error: null }
  if (mockFlags().blueprint_fail && s.status === 'draft') {
    return {
      status: 'failed',
      stale: false,
      total_questions: 0,
      competencies: [],
      error: { code: 'llm_error', message: 'Dịch vụ AI đang lỗi, chưa tạo được kế hoạch.' },
    }
  }
  return {
    status: 'done',
    stale: b.cv_version !== s.cv_version || b.jd_version !== s.jd_version,
    error: null,
    ...b.view,
  }
}

function plannedTotal(s: SessionRow) {
  return s.blueprint?.view.total_questions ?? 0
}

// ---------- interview loop (scripted) ----------
function questionPlan(s: SessionRow): { competency: string; text: string }[] {
  const comps = s.blueprint?.view.competencies ?? []
  const out: { competency: string; text: string }[] = []
  for (let round = 0; round < 3; round++) {
    for (const c of comps) {
      const bank = QUESTION_BANK[c.id] ?? []
      const text = bank[round]
      if (text && round < c.questions_max) out.push({ competency: c.id, text })
    }
  }
  return out
}

/** Mock interview length: shorter than the blueprint so a full run takes ~5 answers. */
export const MOCK_MAX_QUESTIONS = 5

export function startSession(s: SessionRow, mode: Mode) {
  s.status = 'in_progress'
  s.mode = mode
  s.started_at = new Date().toISOString()
  save()
}

export function nextQuestion(s: SessionRow): TranscriptItem | null {
  const plan = questionPlan(s)
  const asked = s.items.filter((i) => i.kind === 'question').length
  if (s.plan_cursor >= plan.length || asked >= Math.min(MOCK_MAX_QUESTIONS, plannedTotal(s)))
    return null
  const p = plan[s.plan_cursor++]!
  return {
    kind: 'question',
    id: nextId('q'),
    index: asked + 1,
    text: p.text,
    competency: { id: p.competency, name: competencyName(p.competency) },
    depth: s.blueprint?.view.competencies.find((c) => c.id === p.competency)?.depth_band[0] ?? null,
    unplanned: false,
    created_at: new Date().toISOString(),
  }
}

export function currentQuestion(s: SessionRow) {
  return [...s.items].reverse().find((i) => i.kind === 'question') as
    Extract<TranscriptItem, { kind: 'question' }> | undefined
}

export function findItem(itemId: string) {
  for (const s of state.sessions) {
    const item = s.items.find((i) => i.id === itemId)
    if (item) return item
  }
  return undefined
}

/** Save an item; with `visibleAt`, the transcript leaves it out until then (still streaming). */
export function addItem(s: SessionRow, item: TranscriptItem, visibleAt?: number) {
  s.items.push(item)
  if (visibleAt !== undefined && visibleAt > Date.now())
    s.hidden_until = { ...s.hidden_until, [item.id]: visibleAt }
  save()
}

/** The line finished streaming (or broke): the transcript shows it now. */
export function revealItem(s: SessionRow, itemId: string) {
  if (!s.hidden_until?.[itemId]) return
  const { [itemId]: _, ...rest } = s.hidden_until
  s.hidden_until = rest
  save()
}

/** Items the transcript returns: everything but lines still streaming. */
export function visibleItems(s: SessionRow): TranscriptItem[] {
  const now = Date.now()
  return s.items.filter((i) => !(s.hidden_until?.[i.id] && s.hidden_until[i.id]! > now))
}

export function endSession(s: SessionRow): SessionEndSummary {
  if (s.status !== 'completed') {
    s.status = 'completed'
    s.ended_at = new Date().toISOString()
    s.summary = summarize(s)
    save()
  }
  return s.summary!
}

function summarize(s: SessionRow): SessionEndSummary {
  const cov = coverage(s)
  const start = s.started_at ? Date.parse(s.started_at) : Date.now()
  const end = s.ended_at ? Date.parse(s.ended_at) : Date.now()
  return {
    question_count: s.items.filter((i) => i.kind === 'question').length,
    duration_seconds: Math.round((end - start) / 1000),
    assessed: cov.filter((c) => c.question_count > 0).map((c) => c.competency),
    not_assessed: cov.filter((c) => c.question_count === 0).map((c) => c.competency),
  }
}

export function coverage(s: SessionRow): Coverage[] {
  const comps = s.blueprint?.view.competencies ?? []
  const answered = new Set(
    s.items
      .filter((i) => i.kind === 'answer')
      .map((i) => (i as { question_id: string }).question_id),
  )
  return comps.map((c) => ({
    competency: { id: c.id, name: c.name },
    question_count: s.items.filter(
      (i) => i.kind === 'question' && i.competency?.id === c.id && answered.has(i.id),
    ).length,
    planned: c.questions_min,
  }))
}

export function hintLevel(s: SessionRow) {
  s.hint_count += 1
  save()
  return Math.min(2, s.hint_count)
}

// ---------- failure switches (UI-1.6) ----------
export interface MockFlags {
  /** Every request fails as if the backend were down. */
  network: boolean
  /** New / re-run CV & JD analysis fails with llm_error. */
  analysis_fail: boolean
  /** Blueprint generation fails. */
  blueprint_fail: boolean
  /** The interviewer stream breaks halfway with an error event. */
  stream_fail: boolean
  /** Multiplier for simulated latency (0 in tests). */
  latency: number
  /** Login is on (UI-11): every request needs a logged-in mock account. */
  auth: boolean
}

const FLAGS_KEY = 'intervia-mock-flags'
const DEFAULT_FLAGS: MockFlags = {
  network: false,
  analysis_fail: false,
  blueprint_fail: false,
  stream_fail: false,
  latency: 1,
  auth: false,
}

export function mockFlags(): MockFlags {
  try {
    const raw = globalThis.localStorage?.getItem(FLAGS_KEY)
    return { ...DEFAULT_FLAGS, ...(raw ? (JSON.parse(raw) as Partial<MockFlags>) : {}) }
  } catch {
    return DEFAULT_FLAGS
  }
}

export function setMockFlags(patch: Partial<MockFlags>) {
  try {
    globalThis.localStorage?.setItem(FLAGS_KEY, JSON.stringify({ ...mockFlags(), ...patch }))
  } catch {
    // ignore
  }
}

state = load() ?? seed()
