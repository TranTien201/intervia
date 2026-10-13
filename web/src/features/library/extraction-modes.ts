import type { ExtractionMode, VersionInfo } from '@/api/types'

// Extraction modes of a CV / JD analysis (docs/design/extraction.md §8): every Vietnamese label
// lives here.

type Kind = 'cv' | 'jd'

/**
 * Every label of the modes, in display order. Times and costs from docs/spikes/llamaextract.md;
 * a JD is shorter, hence its own. `cvOnly`: a JD is always text, so no layout mode.
 */
export const EXTRACTION_MODES: {
  value: ExtractionMode
  label: string
  hint: Record<Kind, string>
  cost: Record<Kind, string>
  cvOnly?: boolean
}[] = [
  {
    value: 'standard',
    label: 'Tiêu chuẩn',
    hint: {
      cv: 'Nhanh, tiết kiệm. Phù hợp hầu hết CV.',
      jd: 'Nhanh, tiết kiệm. Phù hợp hầu hết JD.',
    },
    cost: { cv: '~30 giây', jd: '~25 giây' },
  },
  {
    value: 'layout',
    label: 'Đọc bố cục',
    hint: { cv: 'Cho CV scan, CV 2 cột hoặc nhiều bảng.', jd: '' },
    cost: { cv: '~1 phút · tốn hơn', jd: '' },
    cvOnly: true,
  },
  {
    value: 'precise',
    label: 'Chính xác cao',
    hint: {
      cv: 'Đọc kỹ nhất, chậm và tốn nhất. Dùng khi kết quả chưa tốt.',
      jd: 'Đọc kỹ nhất, chậm và tốn nhất. Dùng khi kết quả chưa tốt.',
    },
    cost: { cv: '~2 phút · tốn gấp 4', jd: '~1 phút · tốn gấp 3' },
  },
]

export const DEFAULT_EXTRACTION_MODE: ExtractionMode = 'standard'

export const extractionModeLabel = (mode: ExtractionMode) =>
  EXTRACTION_MODES.find((m) => m.value === mode)!.label

export const extractionModesFor = (kind: Kind) =>
  EXTRACTION_MODES.filter((m) => kind === 'cv' || !m.cvOnly)

/** "Kết quả thiếu hoặc sai? Thử …": the modes other than standard that this kind has. */
export const reanalyzeHint = (kind: Kind) =>
  `Kết quả thiếu hoặc sai? Thử ${extractionModesFor(kind)
    .filter((m) => m.value !== DEFAULT_EXTRACTION_MODE)
    .map((m) => m.label)
    .join(' hoặc ')}.`

/** Mode of the newest analysed version (user edits have none), else the default. */
export const lastAnalysisMode = (versions: VersionInfo[] | undefined): ExtractionMode =>
  versions?.find((v) => v.mode !== null)?.mode ?? DEFAULT_EXTRACTION_MODE
