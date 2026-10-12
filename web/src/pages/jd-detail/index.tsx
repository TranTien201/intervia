import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useState } from 'react'
import { useParams } from 'react-router'
import { useJd, useJdVersion } from '@/api/hooks'
import { Page } from '@/components/Page'
import { PageSkeleton, QueryView } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { ItemDetail } from '@/features/library/ItemDetail'
import { RequirementsEditor } from '@/features/profile/RequirementsEditor'
import { cn } from '@/lib/utils'

// [9] JD detail: the original text, the extracted requirements (editable, versioned),
// the sessions that used the JD. Same layout as the CV detail page [8].
export function JdDetailPage() {
  const { id = '' } = useParams()
  const jd = useJd(id)
  return (
    <Page>
      <QueryView
        query={jd}
        loading={<PageSkeleton variant="detail" />}
        notFoundMessage="Không tìm thấy JD này. Có thể nó đã bị xóa."
      >
        {(data) => (
          <ItemDetail
            kind="jd"
            item={data}
            info={[data.position, data.company].filter((x): x is string => !!x)}
            before={<JdText text={data.text} />}
            editorLabel="Yêu cầu của JD"
            renderEditor={(v) => <RequirementsVersion jdId={data.id} version={v} />}
          />
        )}
      </QueryView>
    </Page>
  )
}

/** The JD as pasted, collapsed to a few lines by default. */
function JdText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <section className="grid gap-2">
      <SectionLabel>Văn bản JD gốc</SectionLabel>
      <p
        id={id}
        className={cn('text-sm whitespace-pre-line text-ink', !open && 'line-clamp-4 text-ink2')}
      >
        {text}
      </p>
      <Button
        size="xs"
        variant="ghost"
        className="justify-self-start"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <>
            <ChevronUp /> Thu gọn
          </>
        ) : (
          <>
            <ChevronDown /> Xem toàn bộ
          </>
        )}
      </Button>
    </section>
  )
}

function RequirementsVersion({ jdId, version }: { jdId: string; version: number | 'latest' }) {
  const query = useJdVersion(jdId, version)
  return (
    <QueryView
      query={query}
      loading={<PageSkeleton rows={3} />}
      notFoundMessage={`Không có bản ${version} của JD này.`}
    >
      {(v) => <RequirementsEditor jdId={jdId} version={v} readOnly={version !== 'latest'} />}
    </QueryView>
  )
}
