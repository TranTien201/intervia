import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/client'
import { useLogin, useMe, useSignup } from '@/api/hooks'
import { LIMITS } from '@/api/types'
import { Card } from '@/components/Card'
import { Button } from '@/components/ui/button'
import { PasswordInput } from '@/components/PasswordInput'
import { Input } from '@/components/ui/input'
import { NEXT_PARAM, safeNextPath } from '@/features/auth/next-path'
import { Field } from '@/features/library/fields'
import { errorMessage } from '@/lib/errors'

type Kind = 'login' | 'signup'
type FieldName = 'email' | 'password' | 'confirm'
type Errors = Partial<Record<FieldName, string>>

const TEXT: Record<
  Kind,
  { title: string; submit: string; switchText: string; switchLink: string }
> = {
  login: {
    title: 'Đăng nhập',
    submit: 'Đăng nhập',
    switchText: 'Chưa có tài khoản?',
    switchLink: 'Đăng ký',
  },
  signup: {
    title: 'Tạo tài khoản',
    submit: 'Đăng ký',
    switchText: 'Đã có tài khoản?',
    switchLink: 'Đăng nhập',
  },
}

// [11] Login / signup (docs/design/ui-pages.md, page 11). BlankLayout, no sidebar.
export const LoginPage = () => <AuthPage kind="login" />
export const SignupPage = () => <AuthPage kind="signup" />

function AuthPage({ kind }: { kind: Kind }) {
  const me = useMe()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get(NEXT_PARAM))

  // Already logged in, or login is off (MVP-1 default user): nothing to do here.
  if (me.data && (!me.data.auth_enabled || me.data.user)) return <Navigate to={next} replace />

  return (
    <div className="grid w-full max-w-sm gap-6 py-8">
      <div className="grid gap-1 text-center">
        <p className="text-xl font-semibold text-accent">Intervia</p>
        <p className="text-sm text-ink2">Luyện phỏng vấn với AI, theo CV và JD của bạn</p>
      </div>
      <Card className="grid gap-5 p-6">
        <h1 className="text-lg font-semibold text-ink">{TEXT[kind].title}</h1>
        {/* key: a fresh form when switching between the two pages. */}
        <AuthForm key={kind} kind={kind} next={next} />
      </Card>
      <p className="text-center text-sm text-ink2">
        {TEXT[kind].switchText}{' '}
        <Link
          to={{
            pathname: kind === 'login' ? '/signup' : '/login',
            search: params.get(NEXT_PARAM) ? `?${NEXT_PARAM}=${encodeURIComponent(next)}` : '',
          }}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {TEXT[kind].switchLink}
        </Link>
      </p>
    </div>
  )
}

function AuthForm({ kind, next }: { kind: Kind; next: string }) {
  const navigate = useNavigate()
  const login = useLogin()
  const signup = useSignup()
  const mutation = kind === 'login' ? login : signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const validate = (): Errors => ({
    email: !email.trim()
      ? 'Nhập email.'
      : !/^\S+@\S+\.\S+$/.test(email.trim())
        ? 'Email chưa đúng dạng, vd: ten@example.com.'
        : undefined,
    // Login only checks it is there: the rules are the server's, and the error stays generic.
    password: !password
      ? 'Nhập mật khẩu.'
      : kind === 'signup' && password.length < LIMITS.passwordMinChars
        ? `Mật khẩu cần ít nhất ${LIMITS.passwordMinChars} ký tự.`
        : undefined,
    confirm:
      kind === 'signup' && confirm !== password ? 'Mật khẩu nhập lại không khớp.' : undefined,
  })

  const showErrors = (found: Errors) => {
    setErrors(found)
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mutation.isPending) return
    setFormError(null)
    const found = validate()
    if (Object.values(found).some(Boolean)) return showErrors(found)
    setErrors({})
    mutation.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => navigate(next, { replace: true }),
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'validation_error' && err.fields)
            return showErrors({ email: err.fields.email, password: err.fields.password })
          setFormError(errorMessage(err))
        },
      },
    )
  }

  const pending = mutation.isPending
  return (
    <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4">
      <Field label="Email" error={errors.email}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            type="email"
            autoComplete={kind === 'login' ? 'username' : 'email'}
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            readOnly={pending}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Field
        label="Mật khẩu"
        error={errors.password}
        hint={kind === 'signup' ? `Ít nhất ${LIMITS.passwordMinChars} ký tự` : undefined}
      >
        {({ id, describedBy }) => (
          <PasswordInput
            id={id}
            autoComplete={kind === 'login' ? 'current-password' : 'new-password'}
            value={password}
            readOnly={pending}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={describedBy}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      {kind === 'signup' && (
        <Field label="Nhập lại mật khẩu" error={errors.confirm}>
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              value={confirm}
              readOnly={pending}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={describedBy}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
        </Field>
      )}
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" loading={pending} className="w-full">
        {TEXT[kind].submit}
      </Button>
    </form>
  )
}
