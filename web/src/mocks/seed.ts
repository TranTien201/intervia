// Vietnamese sample data for the mock API (task UI-1.6).
// 2 CVs (one with a claim whose source quote was not found), 3 JDs,
// 4 sessions covering all statuses, 1 full transcript with repeat/hint/skip events.
import type {
  CandidateProfile,
  JdRequirements,
  Level,
  Role,
  TranscriptItem,
  VersionOrigin,
} from '@/api/types'

export interface Competency {
  id: string
  name: string
  keywords: string[]
}

export const ROLES: Role[] = [
  { id: 'backend_engineer', name: 'Backend Engineer' },
  { id: 'ai_engineer', name: 'AI Engineer' },
  { id: 'frontend_engineer', name: 'Frontend Engineer' },
  { id: 'data_engineer', name: 'Data Engineer' },
]

export const CATALOG: Competency[] = [
  { id: 'API_DESIGN', name: 'Thiết kế API', keywords: ['api', 'rest', 'fastapi', 'grpc'] },
  { id: 'DATABASE', name: 'Database', keywords: ['postgresql', 'sql', 'database', 'mysql'] },
  { id: 'ERROR_HANDLING', name: 'Xử lý lỗi', keywords: ['retry', 'lỗi', 'timeout'] },
  { id: 'QUEUES', name: 'Hàng đợi', keywords: ['rabbitmq', 'kafka', 'queue', 'hàng đợi'] },
  { id: 'CACHING', name: 'Caching', keywords: ['redis', 'cache'] },
  { id: 'DEVOPS', name: 'Docker, CI/CD', keywords: ['docker', 'ci/cd', 'kubernetes'] },
  { id: 'COMMUNICATION', name: 'Giao tiếp', keywords: [] },
  { id: 'LLM_SYSTEMS', name: 'Hệ thống LLM', keywords: ['llm', 'rag', 'prompt'] },
  { id: 'ML_EVAL', name: 'Đánh giá mô hình', keywords: ['evaluation', 'đánh giá', 'metrics'] },
  { id: 'PYTHON', name: 'Python', keywords: ['python'] },
]

export const competencyName = (id: string) => CATALOG.find((c) => c.id === id)?.name ?? id

// ---------- CVs ----------
export interface SeedCv {
  id: string
  name: string
  file_name: string
  created_days_ago: number
  versions: { days_ago: number; origin: VersionOrigin; profile: CandidateProfile }[]
}

const backendProfile = (extraSkill?: string): CandidateProfile => ({
  skills: [
    { id: 'sk1', name: 'Python', catalog_id: 'PYTHON', years: 4, source_quote: '4 năm Python' },
    { id: 'sk2', name: 'FastAPI', catalog_id: 'API_DESIGN', years: 2, source_quote: 'FastAPI' },
    { id: 'sk3', name: 'PostgreSQL', catalog_id: 'DATABASE', years: 3, source_quote: 'PostgreSQL' },
    { id: 'sk4', name: 'Docker', catalog_id: 'DEVOPS', years: null, source_quote: 'Docker' },
    ...(extraSkill
      ? [
          {
            id: 'sk5',
            name: extraSkill,
            catalog_id: 'CACHING',
            years: null,
            source_quote: extraSkill,
          },
        ]
      : []),
  ],
  experiences: [
    {
      id: 'ex1',
      organization: 'Công ty ABC',
      role: 'Backend Engineer',
      period: '2022–nay',
      technologies: ['Python', 'FastAPI', 'PostgreSQL'],
      source_quote: 'Backend Engineer tại Công ty ABC (2022 – nay)',
    },
    {
      id: 'ex2',
      organization: 'Dự án Ví điện tử XPay',
      role: 'Developer',
      period: '2020–2022',
      technologies: ['Django', 'MySQL'],
      source_quote: 'Developer, dự án Ví điện tử XPay (2020 – 2022)',
    },
  ],
  claims: [
    {
      id: 'cl1',
      statement: 'Giảm 40% độ trễ API',
      metric: '40%',
      subject: 'độ trễ p95 của API',
      verifiable: true,
      source_quote: '…giảm 40% độ trễ p95 của API thanh toán…',
      quote_status: 'found',
    },
    {
      id: 'cl2',
      statement: 'Xử lý 2 triệu giao dịch mỗi ngày',
      metric: '2 triệu/ngày',
      subject: 'lưu lượng giao dịch',
      verifiable: true,
      source_quote: 'hệ thống xử lý hơn 2 triệu giao dịch/ngày',
      quote_status: 'not_found',
    },
    {
      id: 'cl3',
      statement: 'Dẫn dắt nhóm 3 người',
      metric: null,
      subject: 'dẫn dắt nhóm',
      verifiable: false,
      source_quote: 'dẫn dắt nhóm 3 kỹ sư',
      quote_status: 'found',
    },
  ],
})

const aiProfile: CandidateProfile = {
  skills: [
    { id: 'sk1', name: 'Python', catalog_id: 'PYTHON', years: 5, source_quote: 'Python (5 năm)' },
    { id: 'sk2', name: 'LLM', catalog_id: 'LLM_SYSTEMS', years: 2, source_quote: 'ứng dụng LLM' },
    { id: 'sk3', name: 'RAG', catalog_id: 'LLM_SYSTEMS', years: null, source_quote: 'RAG' },
    { id: 'sk4', name: 'PyTorch', catalog_id: null, years: 3, source_quote: 'PyTorch' },
  ],
  experiences: [
    {
      id: 'ex1',
      organization: 'Startup Trợ lý AI',
      role: 'AI Engineer',
      period: '2023–nay',
      technologies: ['Python', 'LLM', 'PostgreSQL'],
      source_quote: 'AI Engineer tại Startup Trợ lý AI (2023 – nay)',
    },
  ],
  claims: [
    {
      id: 'cl1',
      statement: 'Giảm 30% chi phí gọi LLM',
      metric: '30%',
      subject: 'chi phí LLM',
      verifiable: true,
      source_quote: 'giảm 30% chi phí gọi LLM nhờ cache câu trả lời',
      quote_status: 'found',
    },
  ],
}

export const SEED_CVS: SeedCv[] = [
  {
    id: 'cv-backend',
    name: 'CV Backend 2026',
    file_name: 'nguyen-van-a.pdf',
    created_days_ago: 9,
    versions: [
      { days_ago: 9, origin: 'analysis', profile: backendProfile() },
      { days_ago: 6, origin: 'user_edit', profile: backendProfile() },
      { days_ago: 4, origin: 'user_edit', profile: backendProfile('Redis') },
    ],
  },
  {
    id: 'cv-ai',
    name: 'CV AI Engineer',
    file_name: 'cv-ai.docx',
    created_days_ago: 7,
    versions: [{ days_ago: 7, origin: 'analysis', profile: aiProfile }],
  },
]

// ---------- JDs ----------
export interface SeedJd {
  id: string
  name: string
  company: string | null
  position: string | null
  text: string
  created_days_ago: number
  requirements: JdRequirements
}

const req = (
  n: number,
  catalog_id: string,
  kind: 'required' | 'preferred',
  importance: 1 | 2 | 3,
  quote: string,
) => ({
  id: `rq${n}`,
  catalog_id,
  name: competencyName(catalog_id),
  kind,
  importance,
  source_quote: quote,
})

export const SEED_JDS: SeedJd[] = [
  {
    id: 'jd-abc',
    name: 'ABC · Backend',
    company: 'Công ty ABC',
    position: 'Backend Engineer',
    created_days_ago: 9,
    text: `Công ty ABC tuyển Backend Engineer (Mid)

Mô tả công việc:
- Thiết kế và phát triển REST API cho hệ thống thanh toán.
- Làm việc với PostgreSQL, tối ưu truy vấn.
- Xây dựng hệ thống hàng đợi (RabbitMQ/Kafka) xử lý giao dịch bất đồng bộ.

Yêu cầu:
- 3+ năm kinh nghiệm backend.
- Thành thạo thiết kế API, PostgreSQL.
- Có kinh nghiệm với message queue.
- Biết Docker, CI/CD là lợi thế.`,
    requirements: {
      requirements: [
        req(1, 'API_DESIGN', 'required', 3, 'Thành thạo thiết kế API'),
        req(2, 'DATABASE', 'required', 3, 'PostgreSQL, tối ưu truy vấn'),
        req(3, 'QUEUES', 'required', 2, 'Có kinh nghiệm với message queue'),
        req(4, 'ERROR_HANDLING', 'required', 2, 'hệ thống thanh toán'),
        req(5, 'DEVOPS', 'preferred', 1, 'Biết Docker, CI/CD là lợi thế'),
      ],
      unmapped: [{ id: 'um1', text: '3+ năm kinh nghiệm backend' }],
    },
  },
  {
    id: 'jd-xyz',
    name: 'XYZ · AI Engineer',
    company: 'XYZ AI',
    position: 'AI Engineer',
    created_days_ago: 7,
    text: `XYZ AI tuyển AI Engineer (Senior)

- Xây dựng ứng dụng LLM (RAG, agent) chạy production.
- Thiết kế pipeline đánh giá chất lượng mô hình.
- Làm việc với Python, PostgreSQL.
- Kỹ năng giao tiếp tốt, trình bày với khách hàng.`,
    requirements: {
      requirements: [
        req(1, 'LLM_SYSTEMS', 'required', 3, 'Xây dựng ứng dụng LLM (RAG, agent)'),
        req(2, 'ML_EVAL', 'required', 3, 'pipeline đánh giá chất lượng mô hình'),
        req(3, 'PYTHON', 'required', 2, 'Python'),
        req(4, 'DATABASE', 'preferred', 1, 'PostgreSQL'),
        req(5, 'COMMUNICATION', 'preferred', 1, 'Kỹ năng giao tiếp tốt'),
      ],
      unmapped: [],
    },
  },
  {
    id: 'jd-fintech',
    name: 'Fintech · Backend Senior',
    company: null,
    position: 'Senior Backend Engineer',
    created_days_ago: 2,
    text: `Startup Fintech cần Senior Backend Engineer

- Thiết kế hệ thống chịu tải cao, cache (Redis).
- Đảm bảo idempotency, retry an toàn cho giao dịch.
- Mentor các bạn junior.`,
    requirements: {
      requirements: [
        req(1, 'CACHING', 'required', 3, 'cache (Redis)'),
        req(2, 'ERROR_HANDLING', 'required', 3, 'idempotency, retry an toàn'),
        req(3, 'API_DESIGN', 'preferred', 2, 'Thiết kế hệ thống chịu tải cao'),
      ],
      unmapped: [{ id: 'um1', text: 'Mentor các bạn junior' }],
    },
  },
]

// ---------- Sessions ----------
export interface SeedSession {
  id: string
  role_id: string
  level: Level
  cv_id: string
  cv_version: number
  jd_id: string
  jd_version: number
  status: 'draft' | 'in_progress' | 'completed'
  has_blueprint: boolean
  created_hours_ago: number
  duration_minutes?: number
}

export const SEED_SESSIONS: SeedSession[] = [
  {
    id: 's-done',
    role_id: 'backend_engineer',
    level: 'mid',
    cv_id: 'cv-backend',
    cv_version: 3,
    jd_id: 'jd-abc',
    jd_version: 1,
    status: 'completed',
    has_blueprint: true,
    created_hours_ago: 3,
    duration_minutes: 24,
  },
  {
    id: 's-active',
    role_id: 'ai_engineer',
    level: 'senior',
    cv_id: 'cv-ai',
    cv_version: 1,
    jd_id: 'jd-xyz',
    jd_version: 1,
    status: 'in_progress',
    has_blueprint: true,
    created_hours_ago: 26,
  },
  {
    id: 's-plan',
    role_id: 'backend_engineer',
    level: 'senior',
    cv_id: 'cv-backend',
    cv_version: 3,
    jd_id: 'jd-fintech',
    jd_version: 1,
    status: 'draft',
    has_blueprint: true,
    created_hours_ago: 50,
  },
  {
    id: 's-match',
    role_id: 'backend_engineer',
    level: 'junior',
    cv_id: 'cv-backend',
    cv_version: 2,
    jd_id: 'jd-abc',
    jd_version: 1,
    status: 'draft',
    has_blueprint: false,
    created_hours_ago: 24 * 12,
  },
]

// Scripted interviewer lines per competency, used by the mock interview loop.
export const QUESTION_BANK: Record<string, string[]> = {
  API_DESIGN: [
    'Bạn kể về một API bạn đã thiết kế gần đây nhé. Bạn chọn cách đặt endpoint và phiên bản API thế nào?',
    'Nếu một client cũ vẫn gọi phiên bản API cũ, bạn sẽ thay đổi API mà không làm hỏng client đó ra sao?',
    'Bạn phân trang cho một danh sách rất lớn theo cách nào, và vì sao?',
  ],
  DATABASE: [
    'Bạn đã từng gặp một truy vấn PostgreSQL chạy chậm chưa? Bạn tìm ra nguyên nhân thế nào?',
    'Khi nào bạn chọn thêm index, và khi nào index lại gây hại?',
    'Hai giao dịch cùng cập nhật một số dư tài khoản, bạn tránh sai lệch dữ liệu bằng cách nào?',
  ],
  ERROR_HANDLING: [
    'Khi gọi API thanh toán bị timeout, bạn xử lý retry thế nào để không trừ tiền khách hai lần?',
    'Bạn phân biệt lỗi nào nên retry, lỗi nào không nên retry ra sao?',
  ],
  QUEUES: [
    'Bạn kể về hệ thống hàng đợi đã làm nhé. Vì sao cần hàng đợi ở chỗ đó?',
    'Nếu consumer xử lý một message bị lỗi giữa chừng, chuyện gì xảy ra với message đó?',
  ],
  CACHING: [
    'Bạn đã dùng Redis để cache dữ liệu gì, và làm sao để cache không bị cũ?',
    'Khi rất nhiều request cùng hỏi một khóa vừa hết hạn, bạn xử lý thế nào?',
  ],
  DEVOPS: ['Quy trình từ lúc bạn merge code tới lúc chạy trên production diễn ra thế nào?'],
  COMMUNICATION: [
    'Bạn kể về một lần phải giải thích một vấn đề kỹ thuật cho người không làm kỹ thuật nhé.',
  ],
  LLM_SYSTEMS: [
    'Bạn kể về một ứng dụng LLM bạn đã đưa lên production. Phần khó nhất là gì?',
    'Khi mô hình trả lời sai định dạng, hệ thống của bạn xử lý thế nào?',
    'Bạn giảm 30% chi phí gọi LLM bằng cách nào, và đo con số đó ra sao?',
  ],
  ML_EVAL: [
    'Bạn đánh giá chất lượng câu trả lời của một ứng dụng LLM như thế nào?',
    'Làm sao bạn biết một thay đổi prompt làm hệ thống tốt lên chứ không chỉ khác đi?',
  ],
  PYTHON: [
    'Bạn xử lý tác vụ chạy lâu trong một ứng dụng Python web thế nào để không chặn request?',
  ],
}

export const CLARIFY_PREFIX = 'Mình nói rõ hơn nhé: '
export const HINT_LINES = [
  'Gợi ý nhỏ: bạn thử nghĩ xem nếu cùng một yêu cầu được gửi hai lần thì server có cách nào nhận ra không.',
  'Gợi ý thêm: hãy nghĩ tới một khóa duy nhất đi kèm mỗi yêu cầu.',
]

type SeedItem = TranscriptItem extends infer T
  ? T extends TranscriptItem
    ? Omit<T, 'created_at'> & { at_min: number }
    : never
  : never

/** Full transcript of the completed sample session (s-done). Times are minutes from start. */
export const DONE_TRANSCRIPT: SeedItem[] = [
  {
    kind: 'question',
    id: 'q1',
    index: 1,
    text: QUESTION_BANK.API_DESIGN![0]!,
    competency: { id: 'API_DESIGN', name: 'Thiết kế API' },
    depth: 'L3',
    unplanned: false,
    at_min: 0,
  },
  {
    kind: 'answer',
    id: 'a1',
    question_id: 'q1',
    text_original:
      'Bên mình làm API thanh toán bằng FastAPI, endpoint theo tài nguyên, ví dụ POST /payments. Phiên bản thì để trên đường dẫn, /v1, /v2.',
    text_edited: null,
    source: 'text',
    has_audio: false,
    duration_ms: null,
    at_min: 2,
  },
  {
    kind: 'question',
    id: 'q2',
    index: 2,
    text: QUESTION_BANK.API_DESIGN![1]!,
    competency: { id: 'API_DESIGN', name: 'Thiết kế API' },
    depth: 'L4',
    unplanned: false,
    at_min: 3,
  },
  {
    kind: 'event',
    id: 'e1',
    question_id: 'q2',
    type: 'REPEAT',
    hint_level: null,
    text: null,
    at_min: 3.5,
  },
  {
    kind: 'answer',
    id: 'a2',
    question_id: 'q2',
    text_original:
      'Mình giữ v1 chạy song song một thời gian, thêm trường mới thì để tùy chọn, ừm, không đổi ý nghĩa trường cũ.',
    text_edited:
      'Mình giữ v1 chạy song song một thời gian, thêm trường mới thì để tùy chọn, không đổi ý nghĩa trường cũ.',
    source: 'stt',
    has_audio: true,
    duration_ms: 84_000,
    at_min: 5,
  },
  {
    kind: 'question',
    id: 'q3',
    index: 3,
    text: QUESTION_BANK.DATABASE![0]!,
    competency: { id: 'DATABASE', name: 'Database' },
    depth: 'L3',
    unplanned: false,
    at_min: 6,
  },
  {
    kind: 'answer',
    id: 'a3',
    question_id: 'q3',
    text_original:
      'Có, mình dùng EXPLAIN ANALYZE thì thấy nó quét cả bảng, sau đó thêm index cho cột created_at.\n\n```sql\nCREATE INDEX idx_payments_created ON payments (created_at);\n```',
    text_edited: null,
    source: 'text',
    has_audio: false,
    duration_ms: null,
    at_min: 9,
  },
  {
    kind: 'question',
    id: 'q4',
    index: 4,
    text: QUESTION_BANK.ERROR_HANDLING![0]!,
    competency: { id: 'ERROR_HANDLING', name: 'Xử lý lỗi' },
    depth: 'L3',
    unplanned: false,
    at_min: 10,
  },
  {
    kind: 'event',
    id: 'e2',
    question_id: 'q4',
    type: 'HINT',
    hint_level: 1,
    text: HINT_LINES[0]!,
    at_min: 11,
  },
  {
    kind: 'answer',
    id: 'a4',
    question_id: 'q4',
    text_original:
      'Mình sẽ gửi kèm idempotency key, server lưu key đó lại, nếu gặp lại key thì trả kết quả cũ chứ không trừ tiền lần nữa.',
    text_edited: null,
    source: 'stt',
    has_audio: true,
    duration_ms: 52_000,
    at_min: 13,
  },
  {
    kind: 'question',
    id: 'q5',
    index: 5,
    text: QUESTION_BANK.QUEUES![0]!,
    competency: { id: 'QUEUES', name: 'Hàng đợi' },
    depth: 'L2',
    unplanned: false,
    at_min: 14,
  },
  {
    kind: 'event',
    id: 'e3',
    question_id: 'q5',
    type: 'SKIP',
    hint_level: null,
    text: null,
    at_min: 15,
  },
  {
    kind: 'question',
    id: 'q6',
    index: 6,
    text: QUESTION_BANK.DATABASE![2]!,
    competency: { id: 'DATABASE', name: 'Database' },
    depth: 'L4',
    unplanned: false,
    at_min: 16,
  },
  {
    kind: 'answer',
    id: 'a6',
    question_id: 'q6',
    text_original:
      'Mình dùng SELECT … FOR UPDATE để khóa dòng, hoặc cập nhật có điều kiện kiểu UPDATE … WHERE balance >= amount.',
    text_edited: null,
    source: 'text',
    has_audio: false,
    duration_ms: null,
    at_min: 20,
  },
  {
    kind: 'question',
    id: 'q7',
    index: 7,
    text: 'Bạn vừa nhắc tới Redis trong CV. Bạn dùng nó để làm gì trong dự án thanh toán?',
    competency: { id: 'CACHING', name: 'Caching' },
    depth: 'L2',
    unplanned: true,
    at_min: 21,
  },
  {
    kind: 'answer',
    id: 'a7',
    question_id: 'q7',
    text_original: 'Chủ yếu để cache thông tin cấu hình merchant, TTL 5 phút.',
    text_edited: null,
    source: 'text',
    has_audio: false,
    duration_ms: null,
    at_min: 23,
  },
]
