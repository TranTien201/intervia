import { Check, Mic } from 'lucide-react'
import { Card } from '@/components/Card'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { type MicProblem, useMicTest } from './use-mic-test'

/** Relative bar heights: ▁▃▅▃▁ */
const BARS = [0.35, 0.65, 1, 0.65, 0.35]

/**
 * "Kiểm tra mic", only for the spoken modes: ask for the mic and show a live level.
 * If the mic can't be used, `onProblem` lets the page switch the mode to Text.
 */
export function MicCheck({ onProblem }: { onProblem: (problem: MicProblem) => void }) {
  const { test, start, stop } = useMicTest()

  const run = async () => {
    const problem = await start()
    if (problem) onProblem(problem)
  }

  return (
    <Card className="grid content-start gap-3 p-5">
      <SectionLabel>Kiểm tra mic</SectionLabel>
      {test.state === 'listening' ? (
        <>
          <div className="flex items-center gap-3">
            <div
              role="meter"
              aria-label="Mức âm thanh từ mic"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(test.level * 100)}
              className="flex h-8 items-end gap-1"
            >
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className={cn('w-1.5 rounded-full', test.heard ? 'bg-ok' : 'bg-accent')}
                  style={{ height: `${Math.max(12, test.level * h * 100)}%` }}
                />
              ))}
            </div>
            <p role="status" className="text-sm">
              {test.heard ? (
                <span className="flex items-center gap-1 font-medium text-ok">
                  <Check className="size-4" aria-hidden /> Nghe rõ
                </span>
              ) : (
                <span className="text-ink2">Đang nghe…</span>
              )}
            </p>
          </div>
          <p className="text-sm text-ink2">
            {test.heard ? 'Mic hoạt động tốt.' : 'Hãy nói thử một câu.'}
          </p>
          <Button variant="ghost" size="sm" className="w-fit" onClick={stop}>
            Dừng kiểm tra
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink2">
            Trình duyệt sẽ hỏi quyền dùng mic. Âm thanh lúc kiểm tra không được ghi lại.
          </p>
          <Button
            variant="secondary"
            className="w-fit"
            loading={test.state === 'requesting'}
            onClick={() => void run()}
          >
            <Mic /> {test.state === 'error' ? 'Thử lại' : 'Bắt đầu kiểm tra'}
          </Button>
        </>
      )}
    </Card>
  )
}
