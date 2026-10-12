import { Info } from 'lucide-react'
import { useId, useState } from 'react'
import type { BlueprintCompetency, BlueprintView } from '@/api/types'
import { Card } from '@/components/Card'
import { SectionLabel } from '@/components/SectionLabel'
import { WeightBar } from '@/components/WeightBar'

const range = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`)
const depth = ([from, to]: BlueprintCompetency['depth_band']) =>
  from === to ? from : `${from}–${to}`

/**
 * The blueprint as the candidate may see it: topic, weight, depth band, question count.
 * The API already leaves out seed questions and claims to verify (knowing them in advance
 * would spoil the interview). Read-only in MVP-1.
 */
export function PlanTable({ blueprint }: { blueprint: BlueprintView }) {
  const titleId = useId()
  return (
    <Card className="grid gap-4 p-5">
      <SectionLabel id={titleId}>
        Kế hoạch phỏng vấn · khoảng {blueprint.total_questions} câu
      </SectionLabel>
      <div className="overflow-x-auto">
        <table aria-labelledby={titleId} className="w-full text-left text-sm">
          <thead className="text-xs whitespace-nowrap text-ink2">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Chủ đề
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Trọng số
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Độ sâu
              </th>
              <th scope="col" className="py-2 font-medium">
                Số câu
              </th>
            </tr>
          </thead>
          <tbody>
            {blueprint.competencies.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <th scope="row" className="py-2.5 pr-4 font-medium text-ink">
                  {c.name}
                </th>
                <td className="py-2.5 pr-4">
                  <WeightBar
                    value={c.weight}
                    name={`Trọng số ${c.name}`}
                    // Narrower bar on phones so the four columns fit without scrolling.
                    className="[&_[role=meter]]:w-12 sm:[&_[role=meter]]:w-24"
                  />
                </td>
                <td className="py-2.5 pr-4 whitespace-nowrap text-ink tabular-nums">
                  {depth(c.depth_band)}
                </td>
                <td className="py-2.5 whitespace-nowrap text-ink tabular-nums">
                  {range(c.questions_min, c.questions_max)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DepthHelp />
    </Card>
  )
}

const DEPTHS = [
  ['L1', 'Nhớ khái niệm'],
  ['L2', 'Hiểu vì sao'],
  ['L3', 'Áp dụng vào bài toán cụ thể'],
  ['L4', 'Tìm và sửa lỗi'],
  ['L5', 'Cân nhắc đánh đổi giữa các cách làm'],
  ['L6', 'Thiết kế cả hệ thống'],
  ['L7', 'Dẫn dắt, chịu trách nhiệm kết quả'],
] as const

/** "ⓘ Độ sâu L1–L7 là gì?": a short explanation, folded by default. */
function DepthHelp() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit items-center gap-1.5 rounded-md text-sm text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <Info className="size-4" aria-hidden /> Độ sâu L1–L7 là gì?
      </button>
      {open && (
        <div id={panelId} className="grid gap-2 rounded-lg bg-subtle p-4 text-sm text-ink">
          <p>
            Độ sâu cho biết câu hỏi đi xa tới đâu, từ nhớ khái niệm tới tự thiết kế và chịu trách
            nhiệm. Cấp độ càng cao thì người phỏng vấn hỏi càng sâu. Trong lúc phỏng vấn, độ sâu có
            thể tăng hoặc giảm một bậc tùy câu trả lời.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {DEPTHS.map(([level, text]) => (
              <div key={level} className="contents">
                <dt className="font-medium tabular-nums">{level}</dt>
                <dd className="text-ink2">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
