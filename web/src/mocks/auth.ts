// Mock accounts for login (UI-11). Only used when the `auth` mock flag is on; otherwise the mock
// behaves like the MVP-1 backend with its default user.
// Simplification: all mock data (CVs, JDs, sessions) is shared by every account.
import type { User } from '@/api/types'

const STORAGE_KEY = 'intervia-mock-auth'
/** Failed logins in a row before `too_many_attempts`. */
export const MAX_FAILED_LOGINS = 5

export const SEED_ACCOUNT = { email: 'nguyenvana@example.com', password: 'matkhau-mau-123' }
export const DEFAULT_USER: User = { id: 'u-default', email: 'local@intervia.dev' }

interface Account extends User {
  /** Plain text: mock only. */
  password: string
  failed: number
}

interface AuthDb {
  accounts: Account[]
  current: string | null
}

const seed = (): AuthDb => ({
  accounts: [{ id: 'u-seed', ...SEED_ACCOUNT, failed: 0 }],
  current: null,
})

function load(): AuthDb | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AuthDb) : null
  } catch {
    return null
  }
}

function save() {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(auth))
  } catch {
    // storage unavailable: keep in memory only
  }
}

let auth: AuthDb = load() ?? seed()

/** Every account back to the seed, nobody logged in. */
export function resetAuth() {
  auth = seed()
  save()
}

const publicUser = ({ id, email }: Account): User => ({ id, email })
const find = (email: string) => auth.accounts.find((a) => a.email === email.trim().toLowerCase())

export function currentUser(): User | null {
  const a = auth.accounts.find((x) => x.id === auth.current)
  return a ? publicUser(a) : null
}

export type LoginResult = User | 'invalid' | 'locked'

export function login(email: string, password: string): LoginResult {
  const a = find(email)
  if (a && a.failed >= MAX_FAILED_LOGINS) return 'locked'
  if (!a || a.password !== password) {
    if (a) a.failed++
    save()
    return 'invalid'
  }
  a.failed = 0
  auth.current = a.id
  save()
  return publicUser(a)
}

/** `null` if the email already has an account. */
export function signup(email: string, password: string): User | null {
  if (find(email)) return null
  const a: Account = {
    id: `u-${Date.now().toString(36)}`,
    email: email.trim().toLowerCase(),
    password,
    failed: 0,
  }
  auth.accounts.push(a)
  auth.current = a.id
  save()
  return publicUser(a)
}

export type PasswordResult = 'ok' | 'wrong_current'

/** Change the logged-in account's password. */
export function changePassword(current: string, next: string): PasswordResult {
  const a = auth.accounts.find((x) => x.id === auth.current)
  if (!a || a.password !== current) return 'wrong_current'
  a.password = next
  save()
  return 'ok'
}

/** Remove the logged-in account. `false` if `email` is not its email. */
export function deleteCurrentAccount(email: string): boolean {
  const user = currentUser()
  if (!user || user.email !== email.trim().toLowerCase()) return false
  auth.accounts = auth.accounts.filter((a) => a.id !== user.id)
  auth.current = null
  save()
  return true
}

export function logout() {
  auth.current = null
  save()
}
