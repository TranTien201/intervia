import { Plus } from 'lucide-react'
import { useImperativeHandle, useState, type Ref } from 'react'
import { useSaveCvVersion } from '@/api/hooks'
import type { CandidateProfile, Claim, CvVersion, Skill } from '@/api/types'
import { TagInput } from '@/components/Tag'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { notifySaved } from '@/lib/notify'
import { ClaimCard, StatementForm } from './ClaimCard'
import { ExperienceList } from './ExperienceList'
import { Empty, SaveBar, Section } from './editor-parts'
import { useVersionedDraft, type VersionedEditorHandle } from './use-versioned-draft'

/**
 * Candidate profile editor, shared by the match page [3] and the CV detail page [8] (UI-4.3).
 * Edits stay local until "Lưu", which creates a new immutable version of the CV ("bản 3" → "bản 4").
 * A failed save keeps the edits so the user can retry.
 */
export function ProfileEditor({
  cvId,
  version,
  readOnly = false,
  onSaved,
  ref,
}: {
  cvId: string
  version: CvVersion
  /** Old versions from the history are view-only. */
  readOnly?: boolean
  /** After a new version is saved, e.g. to switch the session to it (page 3). */
  onSaved?: (saved: CvVersion) => void
  ref?: Ref<VersionedEditorHandle>
}) {
  const save = useSaveCvVersion()
  const {
    base,
    draft,
    dirty,
    justSaved,
    edit: update,
    saved,
    discard,
  } = useVersionedDraft(version, (v) => v.profile)

  const edit = (patch: Partial<CandidateProfile>) => update((d) => ({ ...d, ...patch }))
  const editClaim = (id: string, patch: Partial<Claim>) =>
    edit({ claims: draft.claims.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const persist = async () => {
    const v = await save.mutateAsync({ id: cvId, base_version: base.version, profile: draft })
    saved(v)
    notifySaved('Đã lưu', `Hồ sơ đã lưu thành bản ${v.version}.`)
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
      <Section title="Kỹ năng">
        {readOnly && draft.skills.length === 0 ? (
          <Empty>Chưa có kỹ năng nào.</Empty>
        ) : (
          <TagInput
            value={draft.skills.map((s) => s.name)}
            onChange={(names) => edit({ skills: skillsFromNames(draft.skills, names) })}
            addLabel="Thêm kỹ năng"
            disabled={readOnly}
          />
        )}
      </Section>

      <Section title="Kinh nghiệm">
        <ExperienceList
          value={draft.experiences}
          readOnly={readOnly}
          onChange={(experiences) => edit({ experiences })}
        />
      </Section>

      <Section title="Điều CV khẳng định">
        <ClaimList
          claims={draft.claims}
          cvId={cvId}
          readOnly={readOnly}
          onChange={(id, statement) => editClaim(id, { statement })}
          onRemove={(id) => edit({ claims: draft.claims.filter((c) => c.id !== id) })}
          onAdd={(statement) => edit({ claims: [...draft.claims, newClaim(statement)] })}
        />
      </Section>

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

function ClaimList({
  claims,
  cvId,
  readOnly,
  onChange,
  onRemove,
  onAdd,
}: {
  claims: Claim[]
  cvId: string
  readOnly: boolean
  onChange: (id: string, statement: string) => void
  onRemove: (id: string) => void
  onAdd: (statement: string) => void
}) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="grid gap-2">
      {claims.length === 0 && !adding && <Empty>Chưa có điều nào.</Empty>}
      <ul className="grid gap-2">
        {claims.map((c) => (
          <ClaimCard
            key={c.id}
            claim={c}
            cvId={cvId}
            readOnly={readOnly}
            onChange={(statement) => onChange(c.id, statement)}
            onRemove={() => onRemove(c.id)}
          />
        ))}
      </ul>
      {!readOnly &&
        (adding ? (
          <div className="rounded-xl border border-line bg-surface p-3">
            <StatementForm
              submitLabel="Thêm"
              onSubmit={(text) => {
                onAdd(text)
                setAdding(false)
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="justify-self-start"
            onClick={() => setAdding(true)}
          >
            <Plus /> Thêm điều CV khẳng định
          </Button>
        ))}
    </div>
  )
}

/** Keep the extracted data of skills that stay; names typed by the user become plain skills. */
function skillsFromNames(current: Skill[], names: string[]): Skill[] {
  return names.map(
    (name) =>
      current.find((s) => s.name === name) ?? {
        id: crypto.randomUUID(),
        name,
        catalog_id: null,
        years: null,
        source_quote: null,
      },
  )
}

const newClaim = (statement: string): Claim => ({
  id: crypto.randomUUID(),
  statement,
  metric: null,
  subject: null,
  verifiable: false,
  source_quote: null,
  quote_status: 'user_added',
})
