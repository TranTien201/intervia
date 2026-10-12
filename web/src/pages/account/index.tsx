import { LogOut } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/client'
import { useAccountData, useChangePassword, useDeleteAccount, useLogout, useMe } from '@/api/hooks'
import { LIMITS, type AccountData, type User } from '@/api/types'
import { Card } from '@/components/Card'
import { InlineConfirm } from '@/components/InlineConfirm'
import { Page, PageTitle } from '@/components/Page'
import { PageSkeleton, QueryView } from '@/components/PageStates'
import { SectionLabel } from '@/components/SectionLabel'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/PasswordInput'
import { Input } from '@/components/ui/input'
import { Field } from '@/features/library/fields'
import { errorMessage } from '@/lib/errors'
import { bytesLabel } from '@/lib/format'
import { notifyError, notifySaved } from '@/lib/notify'
import { NotFoundPage } from '@/pages/not-found'

// [10] Account (docs/design/ui-pages.md, page 10). Only exists when login is on.
export function AccountPage() {
  const me = useMe()
  // RequireAuth has already loaded `me`.
  if (!me.data) return null
  if (!me.data.auth_enabled || !me.data.user) return <NotFoundPage />
  const user = me.data.user
  return (
    <Page className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle>Tài khoản</PageTitle>
        <LogoutButton />
      </div>
      <Card className="grid gap-4 p-6">
        <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-center">
          <span className="text-sm text-ink2">Email</span>
          <span className="break-all text-ink">{user.email}</span>
        </div>
        <PasswordRow />
      </Card>
      <DataSection user={user} />
    </Page>
  )
}

function LogoutButton() {
  const navigate = useNavigate()
  const logout = useLogout()
  return (
    <Button
      variant="secondary"
      loading={logout.isPending}
      onClick={() =>
        logout.mutate(undefined, {
          onSuccess: () => navigate('/login', { replace: true }),
          onError: (err) => notifyError(errorMessage(err)),
        })
      }
    >
      <LogOut /> Đăng xuất
    </Button>
  )
}

function PasswordRow() {
  const [editing, setEditing] = useState(false)
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:items-start">
      <span className="text-sm text-ink2 sm:pt-2">Mật khẩu</span>
      {editing ? (
        <PasswordForm onDone={() => setEditing(false)} />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-ink" aria-label="Đã đặt mật khẩu">
            ••••••••
          </span>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Đổi mật khẩu
          </Button>
        </div>
      )}
    </div>
  )
}

type PasswordField = 'current' | 'next' | 'confirm'

function PasswordForm({ onDone }: { onDone: () => void }) {
  const change = useChangePassword()
  const [values, setValues] = useState<Record<PasswordField, string>>({
    current: '',
    next: '',
    confirm: '',
  })
  const [errors, setErrors] = useState<Partial<Record<PasswordField, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const showErrors = (found: Partial<Record<PasswordField, string>>) => {
    setErrors(found)
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (change.isPending) return
    setFormError(null)
    const { current, next, confirm } = values
    const found = {
      current: current ? undefined : 'Nhập mật khẩu hiện tại.',
      next:
        next.length < LIMITS.passwordMinChars
          ? `Mật khẩu cần ít nhất ${LIMITS.passwordMinChars} ký tự.`
          : next === current
            ? 'Mật khẩu mới cần khác mật khẩu hiện tại.'
            : undefined,
      confirm: confirm === next ? undefined : 'Mật khẩu nhập lại không khớp.',
    }
    if (Object.values(found).some(Boolean)) return showErrors(found)
    setErrors({})
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          notifySaved('Đã đổi mật khẩu', 'Các thiết bị khác cần đăng nhập lại.')
          onDone()
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'validation_error' && err.fields)
            return showErrors({
              current: err.fields.current_password,
              next: err.fields.new_password,
            })
          setFormError(errorMessage(err))
        },
      },
    )
  }

  const input =
    (name: PasswordField, autoComplete: string) =>
    ({ id, describedBy }: { id: string; describedBy?: string }) => (
      <PasswordInput
        id={id}
        autoFocus={name === 'current'}
        autoComplete={autoComplete}
        value={values[name]}
        readOnly={change.isPending}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      />
    )

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid max-w-sm gap-4">
      <Field label="Mật khẩu hiện tại" error={errors.current}>
        {input('current', 'current-password')}
      </Field>
      <Field
        label="Mật khẩu mới"
        error={errors.next}
        hint={`Ít nhất ${LIMITS.passwordMinChars} ký tự`}
      >
        {input('next', 'new-password')}
      </Field>
      <Field label="Nhập lại mật khẩu mới" error={errors.confirm}>
        {input('confirm', 'new-password')}
      </Field>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={change.isPending}>
          Lưu mật khẩu mới
        </Button>
        <Button type="button" variant="secondary" disabled={change.isPending} onClick={onDone}>
          Hủy
        </Button>
      </div>
    </form>
  )
}

/** "2 CV · 3 JD · 6 phiên · 48 file ghi âm (120 MB)" */
const dataSummary = (d: AccountData) =>
  `${d.cv_count} CV · ${d.jd_count} JD · ${d.session_count} phiên · ` +
  `${d.audio_count} file ghi âm (${bytesLabel(d.audio_bytes)})`

function DataSection({ user }: { user: User }) {
  const data = useAccountData()
  const [confirming, setConfirming] = useState(false)
  return (
    <Card className="grid gap-4 p-6">
      <div className="grid gap-2">
        <SectionLabel>Dữ liệu của bạn</SectionLabel>
        <QueryView query={data} loading={<PageSkeleton rows={1} />}>
          {(d) => <p className="text-ink">{dataSummary(d)}</p>}
        </QueryView>
        <p className="text-sm text-ink2">
          Đây là mọi thứ Intervia đang lưu về bạn: file CV, JD, câu hỏi và câu trả lời của các
          phiên, file ghi âm giọng nói của bạn.
        </p>
      </div>
      {confirming ? (
        <DeleteAccountConfirm user={user} data={data.data} onCancel={() => setConfirming(false)} />
      ) : (
        <div>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Xóa tài khoản và toàn bộ dữ liệu
          </Button>
        </div>
      )}
    </Card>
  )
}

function DeleteAccountConfirm({
  user,
  data,
  onCancel,
}: {
  user: User
  data: AccountData | undefined
  onCancel: () => void
}) {
  const navigate = useNavigate()
  const remove = useDeleteAccount()
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | undefined>()
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase()

  const confirm = () =>
    remove.mutate(typed.trim(), {
      onSuccess: () => {
        navigate('/login', { replace: true })
        notifySaved('Đã xóa tài khoản và toàn bộ dữ liệu')
      },
      onError: (err) =>
        setError(
          err instanceof ApiError && err.fields?.email ? err.fields.email : errorMessage(err),
        ),
    })

  return (
    <InlineConfirm
      title="Xóa tài khoản và toàn bộ dữ liệu?"
      description={
        <>
          Tài khoản cùng mọi CV, JD, phiên phỏng vấn và file ghi âm của bạn sẽ bị xóa vĩnh viễn.
          Không hoàn tác được.
        </>
      }
      affected={
        data && {
          summary: 'Sẽ bị xóa:',
          items: [
            `${data.cv_count} CV và ${data.jd_count} JD`,
            `${data.session_count} phiên phỏng vấn (câu hỏi, câu trả lời)`,
            `${data.audio_count} file ghi âm (${bytesLabel(data.audio_bytes)})`,
          ],
        }
      }
      confirmLabel="Xóa vĩnh viễn"
      pending={remove.isPending}
      confirmDisabled={!matches}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <Field label={`Gõ lại email (${user.email}) để xác nhận`} error={error}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            readOnly={remove.isPending}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => {
              setTyped(e.target.value)
              setError(undefined)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches && !remove.isPending) confirm()
            }}
          />
        )}
      </Field>
    </InlineConfirm>
  )
}
