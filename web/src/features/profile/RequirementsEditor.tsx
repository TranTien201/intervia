import { X } from 'lucide-react'
import { useImperativeHandle, type Ref } from 'react'
import { useSaveJdVersion } from '@/api/hooks'
import type { JdVersion, Requirement } from '@/api/types'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { notifySaved } from '@/lib/notify'
import { Empty, SaveBar, Section } from './editor-parts'
import { useVersionedDraft, type VersionedEditorHandle } from './use-versioned-draft'

const KIND_LABEL = { required: 'Bắt buộc', preferred: 'Nên có' } as const
const otherKind = (k: Requirement['kind']) => (k === 'required' ? 'preferred' : 'required')

/**
 * JD requirements editor, shared by the match page [3] and the JD detail page [9] (UI-4.4).
 * Each requirement toggles between Bắt buộc / Nên có or can be removed; saving creates a new
 * version of the JD, like the profile editor (UI-4.3).
 */
export function RequirementsEditor({
  jdId,
  version,
  readOnly = false,
  onSaved,
  ref,
}: {
  jdId: string
  version: JdVersion
  /** Old versions from the history are view-only. */
  readOnly?: boolean
  /** After a new version is saved, e.g. to switch the session to it (page 3). */
  onSaved?: (saved: JdVersion) => void
  ref?: Ref<VersionedEditorHandle>
}) {
  const save = useSaveJdVersion()
  const { base, draft, dirty, justSaved, edit, saved, discard } = useVersionedDraft(
    version,
    (v) => v.requirements,
  )

  const editRequirements = (update: (rs: Requirement[]) => Requirement[]) =>
    edit((d) => ({ ...d, requirements: update(d.requirements) }))

  const persist = async () => {
    const v = await save.mutateAsync({ id: jdId, base_version: base.version, requirements: draft })
    saved(v)
    notifySaved('Đã lưu', `Yêu cầu JD đã lưu thành bản ${v.version}.`)
    onSaved?.(v)
    return v.version
  }
  // A failed save shows its error in the SaveBar (save.isError).
  const onSave = () => void persist().catch(() => {})
  useImperativeHandle(ref, () => ({
    save: () => (dirty ? persist().catch(() => null) : Promise.resolve(base.version)),
  }))

  return (
    <div className="grid gap-6">
      <Section title="Yêu cầu">
        {draft.requirements.length === 0 ? (
          <Empty>Chưa có yêu cầu nào.</Empty>
        ) : (
          <ul className="grid gap-1">
            {draft.requirements.map((r) => (
              <RequirementRow
                key={r.id}
                requirement={r}
                readOnly={readOnly}
                onToggle={() =>
                  editRequirements((rs) =>
                    rs.map((x) => (x.id === r.id ? { ...x, kind: otherKind(x.kind) } : x)),
                  )
                }
                onRemove={() => editRequirements((rs) => rs.filter((x) => x.id !== r.id))}
              />
            ))}
          </ul>
        )}
      </Section>

      {draft.unmapped.length > 0 && (
        <Section title="Không map được">
          <p className="text-sm text-ink2">
            Những ý này trong JD không khớp với chủ đề nào trong danh mục, nên buổi phỏng vấn sẽ
            không hỏi tới.
          </p>
          <ul className="grid gap-1">
            {draft.unmapped.map((u) => (
              <li key={u.id} className="flex gap-1 text-ink">
                <span aria-hidden className="text-ink2">
                  •
                </span>
                {u.text}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!readOnly && (
        <SaveBar
          dirty={dirty}
          justSaved={justSaved}
          savedVersion={base.version}
          pending={save.isPending}
          error={save.isError && dirty ? errorMessage(save.error) : null}
          onSave={onSave}
          onDiscard={() => {
            discard()
            save.reset()
          }}
        />
      )}
    </div>
  )
}

function RequirementRow({
  requirement: r,
  readOnly,
  onToggle,
  onRemove,
}: {
  requirement: Requirement
  readOnly: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-start gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-ink">{r.name}</p>
        {r.source_quote && <p className="text-sm text-ink2">“{r.source_quote}”</p>}
      </div>
      {readOnly ? (
        <Badge variant={r.kind} />
      ) : (
        <>
          <button
            type="button"
            className="rounded-md focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            aria-label={`${r.name}: ${KIND_LABEL[r.kind]}, đổi sang ${KIND_LABEL[otherKind(r.kind)]}`}
            title={`Đổi sang ${KIND_LABEL[otherKind(r.kind)]}`}
            onClick={onToggle}
          >
            <Badge variant={r.kind} className="cursor-pointer hover:opacity-80" />
          </button>
          <Button size="icon-sm" variant="ghost" aria-label={`Xóa ${r.name}`} onClick={onRemove}>
            <X />
          </Button>
        </>
      )}
    </li>
  )
}
