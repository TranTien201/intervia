import {
  delay,
  http,
  HttpResponse,
  type DefaultBodyType,
  type HttpResponseResolver,
  type PathParams,
} from 'msw'
import type {
  CandidateProfile,
  Credentials,
  EventItem,
  JdRequirements,
  Level,
  Mode,
  QuickEventType,
  StreamEvent,
  TranscriptItem,
} from '@/api/types'
import { LIMITS } from '@/api/types'
import * as auth from './auth'
import * as db from './db'
import { CLARIFY_PREFIX, HINT_LINES, ROLES } from './seed'

const API = '/api'
const IS_TEST = import.meta.env.MODE === 'test'

// ---------- helpers ----------
const wait = (ms: number) => (IS_TEST ? Promise.resolve() : delay(ms * db.mockFlags().latency))

const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, ...(fields ? { fields } : {}) } }, { status })

const notFound = () => fail(404, 'not_found', 'Không tìm thấy.')

type Resolver<P extends PathParams> = HttpResponseResolver<P, DefaultBodyType, undefined>

/** Wrap a resolver with latency, the "network down" switch and the login check. */
function withMock<P extends PathParams>(resolver: Resolver<P>): Resolver<P> {
  return async (info) => {
    if (db.mockFlags().network) return HttpResponse.error()
    await wait(150 + Math.random() * 250)
    const open = new URL(info.request.url).pathname.startsWith(`${API}/auth/`)
    if (db.mockFlags().auth && !open && !auth.currentUser())
      return fail(401, 'unauthenticated', 'Chưa đăng nhập.')
    return resolver(info)
  }
}

const get = <P extends PathParams = PathParams>(path: string, r: Resolver<P>) =>
  http.get<P>(API + path, withMock(r))
const post = <P extends PathParams = PathParams>(path: string, r: Resolver<P>) =>
  http.post<P>(API + path, withMock(r))
const patch = <P extends PathParams = PathParams>(path: string, r: Resolver<P>) =>
  http.patch<P>(API + path, withMock(r))
const del = <P extends PathParams = PathParams>(path: string, r: Resolver<P>) =>
  http.delete<P>(API + path, withMock(r))

// ---------- SSE ----------
type Emit = (e: StreamEvent) => void

/** Build a text/event-stream response; `run` emits events with simulated timing. */
function sse(run: (emit: Emit, sleep: (ms: number) => Promise<void>) => Promise<void>) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) =>
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`))
      try {
        await run(emit, wait)
      } finally {
        controller.close()
      }
    },
  })
  return new HttpResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  })
}

/** Stream an interviewer line token by token, then `message_done` with the saved item. */
async function speak(
  emit: Emit,
  sleep: (ms: number) => Promise<void>,
  session: NonNullable<ReturnType<typeof db.sessionRow>>,
  item: TranscriptItem,
  text: string,
) {
  emit({
    event: 'message_start',
    data: {
      item_id: item.id,
      kind: item.kind === 'event' ? 'event' : 'question',
      ...(item.kind === 'event' ? { event_type: item.type } : {}),
    },
  })
  const tokens = text.match(/\S+\s*/g) ?? [text]
  // Saved now and generated in full even if the client goes away (reload, network down);
  // the transcript shows it once the stream would have ended.
  db.addItem(session, item, Date.now() + (500 + tokens.length * 80) * db.mockFlags().latency)
  await sleep(500) // time to first token
  const breakAt = db.mockFlags().stream_fail ? Math.floor(tokens.length / 2) : -1
  for (const [i, tok] of tokens.entries()) {
    if (i === breakAt) {
      // The item is still saved in full: the client must recover it from the transcript.
      db.revealItem(session, item.id)
      emit({
        event: 'error',
        data: { code: 'llm_error', message: 'Kết nối tới dịch vụ AI bị gián đoạn.' },
      })
      return false
    }
    emit({ event: 'token', data: { text: tok } })
    await sleep(35 + Math.random() * 45)
  }
  db.revealItem(session, item.id)
  emit({ event: 'message_done', data: { item } })
  return true
}

async function askNext(
  emit: Emit,
  sleep: (ms: number) => Promise<void>,
  s: NonNullable<ReturnType<typeof db.sessionRow>>,
) {
  const q = db.nextQuestion(s)
  if (!q) {
    const summary = db.endSession(s)
    emit({ event: 'session_ended', data: summary })
    return
  }
  const ok = await speak(emit, sleep, s, q, (q as { text: string }).text)
  if (ok) emit({ event: 'progress', data: db.sessionSummary(s).progress })
}

function eventItem(
  type: EventItem['type'],
  questionId: string | null,
  text: string | null,
  hint_level: number | null = null,
): EventItem {
  return {
    kind: 'event',
    id: db.nextId('e'),
    question_id: questionId,
    type,
    hint_level,
    text,
    created_at: new Date().toISOString(),
  }
}

// ---------- handlers ----------
export const handlers = [
  // ----- Auth (UI-11) -----
  get('/auth/me', () =>
    HttpResponse.json(
      db.mockFlags().auth
        ? { auth_enabled: true, user: auth.currentUser() }
        : { auth_enabled: false, user: auth.DEFAULT_USER },
    ),
  ),
  post('/auth/login', async ({ request }) => {
    const { email = '', password = '' } = (await request.json()) as Partial<Credentials>
    const result = auth.login(email, password)
    if (result === 'locked') return fail(429, 'too_many_attempts', 'Đăng nhập sai quá nhiều lần.')
    if (result === 'invalid')
      return fail(401, 'invalid_credentials', 'Email hoặc mật khẩu không đúng.')
    return HttpResponse.json({ user: result })
  }),
  post('/auth/signup', async ({ request }) => {
    const { email = '', password = '' } = (await request.json()) as Partial<Credentials>
    const fields: Record<string, string> = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) fields.email = 'Email không hợp lệ.'
    if (password.length < LIMITS.passwordMinChars)
      fields.password = `Mật khẩu cần ít nhất ${LIMITS.passwordMinChars} ký tự.`
    if (Object.keys(fields).length)
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', fields)
    const user = auth.signup(email, password)
    if (!user) return fail(409, 'email_taken', 'Email đã có tài khoản.')
    return HttpResponse.json({ user }, { status: 201 })
  }),
  post('/auth/logout', () => {
    auth.logout()
    return new HttpResponse(null, { status: 204 })
  }),

  // ----- Account (UI-11.2) -----
  get('/account/data', () => HttpResponse.json(db.accountData())),
  post('/account/password', async ({ request }) => {
    const { current_password = '', new_password = '' } = (await request.json()) as Partial<
      Record<'current_password' | 'new_password', string>
    >
    if (new_password.length < LIMITS.passwordMinChars)
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', {
        new_password: `Mật khẩu cần ít nhất ${LIMITS.passwordMinChars} ký tự.`,
      })
    // With login off there is no account to change: the default user has no password.
    if (auth.changePassword(current_password, new_password) === 'wrong_current')
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', {
        current_password: 'Mật khẩu hiện tại không đúng.',
      })
    return new HttpResponse(null, { status: 204 })
  }),
  del('/account', async ({ request }) => {
    const { email = '' } = (await request.json()) as { email?: string }
    if (!auth.deleteCurrentAccount(email))
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', {
        email: 'Email không khớp với tài khoản.',
      })
    db.deleteAllData()
    return new HttpResponse(null, { status: 204 })
  }),

  // Catalog
  get('/roles', () => HttpResponse.json(ROLES)),

  // ----- CV -----
  get('/cvs', () => HttpResponse.json(db.listCvs())),
  post('/cvs', async ({ request }) => {
    const form = await request.formData()
    const file = form.get('file')
    const name = String(form.get('name') ?? '').trim()
    // Duck-typed: jsdom and Node each have their own File class in tests.
    if (file === null || typeof file === 'string')
      return fail(422, 'validation_error', 'Thiếu file CV.', { file: 'Chọn một file CV.' })
    if (!/\.(pdf|docx)$/i.test(file.name))
      return fail(415, 'unsupported_file', 'Chỉ nhận file PDF hoặc DOCX.')
    if (file.size > LIMITS.cvMaxBytes) return fail(413, 'file_too_large', 'File lớn hơn 5 MB.')
    if (!name) return fail(422, 'validation_error', 'Thiếu tên CV.', { name: 'Đặt tên cho CV.' })
    const row = db.createCv(name.slice(0, LIMITS.nameMaxChars), file.name)
    return HttpResponse.json(db.cvSummary(row), { status: 201 })
  }),
  get<{ id: string }>('/cvs/:id', ({ params }) => {
    const c = db.cvRow(params.id)
    return c ? HttpResponse.json(db.cvSummary(c)) : notFound()
  }),
  patch<{ id: string }>('/cvs/:id', async ({ params, request }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    const { name } = (await request.json()) as { name?: string }
    if (!name?.trim())
      return fail(422, 'validation_error', 'Tên không được rỗng.', { name: 'Tên không được rỗng.' })
    c.name = name.trim().slice(0, LIMITS.nameMaxChars)
    db.save()
    return HttpResponse.json(db.cvSummary(c))
  }),
  del<{ id: string }>('/cvs/:id', ({ params }) => {
    if (!db.cvRow(params.id)) return notFound()
    db.deleteCv(params.id)
    return new HttpResponse(null, { status: 204 })
  }),
  get<{ id: string }>('/cvs/:id/analysis', ({ params }) => {
    const c = db.cvRow(params.id)
    return c ? HttpResponse.json(db.cvAnalysis(c)) : notFound()
  }),
  get<{ id: string }>('/cvs/:id/versions', ({ params }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    db.cvSummary(c)
    return HttpResponse.json(
      c.versions
        .map(({ version, created_at, origin }) => ({ version, created_at, origin }))
        .reverse(),
    )
  }),
  get<{ id: string; v: string }>('/cvs/:id/versions/:v', ({ params }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    db.cvSummary(c)
    const v =
      params.v === 'latest'
        ? c.versions.at(-1)
        : c.versions.find((x) => x.version === Number(params.v))
    return v ? HttpResponse.json(v) : notFound()
  }),
  post<{ id: string }>('/cvs/:id/versions', async ({ params, request }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    const body = (await request.json()) as { base_version: number; profile: CandidateProfile }
    if (body.base_version !== c.versions.at(-1)?.version) {
      return fail(409, 'version_conflict', 'CV đã có bản mới hơn. Tải lại để xem bản mới nhất.')
    }
    return HttpResponse.json(db.saveCvVersion(c, body.profile), { status: 201 })
  }),
  post<{ id: string }>('/cvs/:id/reanalyze', ({ params }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    db.reanalyzeCv(c)
    return HttpResponse.json(db.cvAnalysis(c), { status: 202 })
  }),
  get<{ id: string }>('/cvs/:id/file', ({ params }) => {
    const c = db.cvRow(params.id)
    if (!c) return notFound()
    return new HttpResponse(c.text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }),
  get<{ id: string }>('/cvs/:id/sessions', ({ params }) =>
    db.cvRow(params.id)
      ? HttpResponse.json(db.listSessions((s) => s.cv_id === params.id))
      : notFound(),
  ),

  // ----- JD -----
  get('/jds', () => HttpResponse.json(db.listJds())),
  post('/jds', async ({ request }) => {
    // Pasted text as JSON, or a PDF/DOCX file as multipart (text extracted right away).
    let name: string | undefined
    let text: string | undefined
    let textField: 'text' | 'file' = 'text'
    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      name = String(form.get('name') ?? '')
      textField = 'file'
      // Duck-typed: jsdom and Node each have their own File class in tests.
      if (file === null || typeof file === 'string')
        return fail(422, 'validation_error', 'Thiếu file JD.', { file: 'Chọn một file JD.' })
      if (!/\.(pdf|docx)$/i.test(file.name))
        return fail(415, 'unsupported_file', 'Chỉ nhận file PDF hoặc DOCX.')
      if (file.size > LIMITS.cvMaxBytes) return fail(413, 'file_too_large', 'File lớn hơn 5 MB.')
      const extracted = db.jdTextFromFile(file.name)
      if (extracted === null)
        return fail(422, 'no_text_in_file', 'File này là ảnh scan, không có chữ để đọc.')
      text = extracted
    } else {
      ;({ name, text } = (await request.json()) as { name?: string; text?: string })
    }
    const fields: Record<string, string> = {}
    if (!text?.trim()) fields[textField] = 'Dán nội dung JD.'
    else if (text.length > LIMITS.jdMaxChars)
      fields[textField] = `JD dài quá ${LIMITS.jdMaxChars.toLocaleString('vi-VN')} ký tự.`
    if (!name?.trim()) fields.name = 'Đặt tên cho JD.'
    if (Object.keys(fields).length)
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', fields)
    const row = db.createJd(name!.trim().slice(0, LIMITS.nameMaxChars), text!)
    const { text: _t, ...summary } = db.jdDetail(row)
    return HttpResponse.json(summary, { status: 201 })
  }),
  get<{ id: string }>('/jds/:id', ({ params }) => {
    const j = db.jdRow(params.id)
    return j ? HttpResponse.json(db.jdDetail(j)) : notFound()
  }),
  patch<{ id: string }>('/jds/:id', async ({ params, request }) => {
    const j = db.jdRow(params.id)
    if (!j) return notFound()
    const { name } = (await request.json()) as { name?: string }
    if (!name?.trim())
      return fail(422, 'validation_error', 'Tên không được rỗng.', { name: 'Tên không được rỗng.' })
    j.name = name.trim().slice(0, LIMITS.nameMaxChars)
    db.save()
    const { text: _t, ...summary } = db.jdDetail(j)
    return HttpResponse.json(summary)
  }),
  del<{ id: string }>('/jds/:id', ({ params }) => {
    if (!db.jdRow(params.id)) return notFound()
    db.deleteJd(params.id)
    return new HttpResponse(null, { status: 204 })
  }),
  get<{ id: string }>('/jds/:id/analysis', ({ params }) => {
    const j = db.jdRow(params.id)
    return j ? HttpResponse.json(db.jdAnalysis(j)) : notFound()
  }),
  get<{ id: string }>('/jds/:id/versions', ({ params }) => {
    const j = db.jdRow(params.id)
    if (!j) return notFound()
    db.jdDetail(j)
    return HttpResponse.json(
      j.versions
        .map(({ version, created_at, origin }) => ({ version, created_at, origin }))
        .reverse(),
    )
  }),
  get<{ id: string; v: string }>('/jds/:id/versions/:v', ({ params }) => {
    const j = db.jdRow(params.id)
    if (!j) return notFound()
    db.jdDetail(j)
    const v =
      params.v === 'latest'
        ? j.versions.at(-1)
        : j.versions.find((x) => x.version === Number(params.v))
    return v ? HttpResponse.json(v) : notFound()
  }),
  post<{ id: string }>('/jds/:id/versions', async ({ params, request }) => {
    const j = db.jdRow(params.id)
    if (!j) return notFound()
    const body = (await request.json()) as { base_version: number; requirements: JdRequirements }
    if (body.base_version !== j.versions.at(-1)?.version) {
      return fail(409, 'version_conflict', 'JD đã có bản mới hơn. Tải lại để xem bản mới nhất.')
    }
    return HttpResponse.json(db.saveJdVersion(j, body.requirements), { status: 201 })
  }),
  post<{ id: string }>('/jds/:id/reanalyze', ({ params }) => {
    const j = db.jdRow(params.id)
    if (!j) return notFound()
    db.reanalyzeJd(j)
    return HttpResponse.json(db.jdAnalysis(j), { status: 202 })
  }),
  get<{ id: string }>('/jds/:id/sessions', ({ params }) =>
    db.jdRow(params.id)
      ? HttpResponse.json(db.listSessions((s) => s.jd_id === params.id))
      : notFound(),
  ),

  // ----- Sessions -----
  get('/sessions', () => HttpResponse.json(db.listSessions())),
  post('/sessions', async ({ request }) => {
    const body = (await request.json()) as {
      cv_id?: string
      jd_id?: string
      role_id?: string | null
      role_custom?: string | null
      level?: Level
    }
    const fields: Record<string, string> = {}
    if (!body.cv_id || !db.cvRow(body.cv_id)) fields.cv_id = 'Chọn một CV.'
    if (!body.jd_id || !db.jdRow(body.jd_id)) fields.jd_id = 'Chọn một JD.'
    const role = body.role_id
      ? ROLES.find((r) => r.id === body.role_id)
      : body.role_custom?.trim()
        ? { id: 'custom', name: body.role_custom.trim() }
        : undefined
    if (!role) fields.role = 'Chọn vị trí.'
    if (!body.level || !['junior', 'mid', 'senior'].includes(body.level))
      fields.level = 'Chọn cấp độ.'
    if (Object.keys(fields).length)
      return fail(422, 'validation_error', 'Dữ liệu chưa hợp lệ.', fields)
    const row = db.createSession({
      cv_id: body.cv_id!,
      jd_id: body.jd_id!,
      role: role!,
      level: body.level!,
    })
    return HttpResponse.json(db.sessionSummary(row), { status: 201 })
  }),
  get<{ id: string }>('/sessions/:id', ({ params }) => {
    const s = db.sessionRow(params.id)
    return s ? HttpResponse.json(db.sessionSummary(s)) : notFound()
  }),
  patch<{ id: string }>('/sessions/:id', async ({ params, request }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status !== 'draft')
      return fail(409, 'session_locked', 'Phiên đã bắt đầu, không đổi được đầu vào.')
    const body = (await request.json()) as { cv_version?: number; jd_version?: number }
    if (body.cv_version !== undefined) s.cv_version = body.cv_version
    if (body.jd_version !== undefined) s.jd_version = body.jd_version
    db.save()
    return HttpResponse.json(db.sessionSummary(s))
  }),
  del<{ id: string }>('/sessions/:id', ({ params }) => {
    if (!db.sessionRow(params.id)) return notFound()
    db.deleteSession(params.id)
    return new HttpResponse(null, { status: 204 })
  }),
  get<{ id: string }>('/sessions/:id/match', ({ params }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    db.sessionSummary(s)
    const m = db.match(s)
    return m
      ? HttpResponse.json(m)
      : fail(404, 'analysis_not_ready', 'CV hoặc JD chưa phân tích xong.')
  }),

  // ----- Blueprint -----
  post<{ id: string }>('/sessions/:id/blueprint', ({ params }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status !== 'draft')
      return fail(409, 'session_locked', 'Phiên đã bắt đầu, không tạo lại kế hoạch được.')
    db.startBlueprint(s)
    return HttpResponse.json(db.blueprintView(s), { status: 202 })
  }),
  get<{ id: string }>('/sessions/:id/blueprint', ({ params }) => {
    const s = db.sessionRow(params.id)
    return s ? HttpResponse.json(db.blueprintView(s)) : notFound()
  }),

  // ----- Interview -----
  post<{ id: string }>('/sessions/:id/start', async ({ params, request }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status !== 'draft')
      return fail(409, 'session_not_active', 'Phiên đã bắt đầu hoặc đã kết thúc.')
    if (db.blueprintView(s).status !== 'done')
      return fail(409, 'blueprint_not_ready', 'Chưa có kế hoạch phỏng vấn.')
    const { mode } = (await request.json()) as { mode: Mode }
    db.startSession(s, mode)
    return sse(async (emit, sleep) => askNext(emit, sleep, s))
  }),
  get<{ id: string }>('/sessions/:id/transcript', ({ params }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    return HttpResponse.json({
      session: db.sessionSummary(s),
      items: db.visibleItems(s),
      summary: s.summary,
    })
  }),
  post<{ id: string }>('/sessions/:id/turns', async ({ params, request }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status !== 'in_progress')
      return fail(409, 'session_not_active', 'Phiên không còn đang diễn ra.')
    const { text } = (await request.json()) as { text?: string }
    if (!text?.trim())
      return fail(422, 'validation_error', 'Câu trả lời rỗng.', { text: 'Câu trả lời rỗng.' })
    if (text.length > LIMITS.answerMaxChars)
      return fail(422, 'validation_error', 'Câu trả lời quá dài.', { text: 'Câu trả lời quá dài.' })
    const q = db.currentQuestion(s)
    return sse(async (emit, sleep) => {
      const answer: TranscriptItem = {
        kind: 'answer',
        id: db.nextId('a'),
        question_id: q?.id ?? '',
        text_original: text,
        text_edited: null,
        source: 'text',
        has_audio: false,
        duration_ms: null,
        created_at: new Date().toISOString(),
      }
      db.addItem(s, answer)
      emit({ event: 'user_item', data: { item: answer } })
      await askNext(emit, sleep, s)
    })
  }),
  post<{ id: string }>('/sessions/:id/events', async ({ params, request }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status !== 'in_progress')
      return fail(409, 'session_not_active', 'Phiên không còn đang diễn ra.')
    const { type } = (await request.json()) as { type: QuickEventType }
    const q = db.currentQuestion(s)
    return sse(async (emit, sleep) => {
      if (type === 'SKIP') {
        const ev = eventItem('SKIP', q?.id ?? null, null)
        db.addItem(s, ev)
        emit({ event: 'user_item', data: { item: ev } })
        await askNext(emit, sleep, s)
        return
      }
      if (type === 'REPEAT') {
        const ev = eventItem('REPEAT', q?.id ?? null, q?.text ?? null)
        await speak(emit, sleep, s, ev, q?.text ?? '')
        return
      }
      if (type === 'CLARIFY') {
        const text = CLARIFY_PREFIX + (q?.text ?? '')
        await speak(emit, sleep, s, eventItem('CLARIFY', q?.id ?? null, text), text)
        return
      }
      const level = db.hintLevel(s)
      const text = HINT_LINES[level - 1] ?? HINT_LINES[0]!
      await speak(emit, sleep, s, eventItem('HINT', q?.id ?? null, text, level), text)
    })
  }),
  post<{ id: string }>('/sessions/:id/stop', ({ params }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    if (s.status === 'draft') return fail(409, 'session_not_active', 'Phiên chưa bắt đầu.')
    if (s.status === 'in_progress')
      db.addItem(s, eventItem('STOP', db.currentQuestion(s)?.id ?? null, null))
    return HttpResponse.json(db.endSession(s))
  }),
  patch<{ id: string }>('/sessions/:id/mode', async ({ params, request }) => {
    const s = db.sessionRow(params.id)
    if (!s) return notFound()
    const { mode } = (await request.json()) as { mode: Mode }
    if (s.mode !== mode) {
      s.mode = mode
      db.addItem(s, eventItem('MODE_CHANGE', db.currentQuestion(s)?.id ?? null, mode))
    }
    return HttpResponse.json(db.sessionSummary(s))
  }),

  // ----- Review -----
  get<{ id: string }>('/sessions/:id/coverage', ({ params }) => {
    const s = db.sessionRow(params.id)
    return s ? HttpResponse.json(db.coverage(s)) : notFound()
  }),
  patch<{ id: string }>('/answers/:id', async ({ params, request }) => {
    const { text_edited } = (await request.json()) as { text_edited: string }
    const item = db.findItem(params.id)
    if (!item || item.kind !== 'answer') return notFound()
    item.text_edited = text_edited.trim() === item.text_original.trim() ? null : text_edited
    db.save()
    return HttpResponse.json(item)
  }),
  get<{ id: string }>('/answers/:id/audio', () => {
    // A short silent WAV so the audio player has something to load.
    return new HttpResponse(silentWav(2), { headers: { 'Content-Type': 'audio/wav' } })
  }),
]

function silentWav(seconds: number) {
  const rate = 8000
  const n = rate * seconds
  const buf = new ArrayBuffer(44 + n)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + n, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate, true)
  v.setUint16(32, 1, true)
  v.setUint16(34, 8, true)
  str(36, 'data')
  v.setUint32(40, n, true)
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128)
  return buf
}
