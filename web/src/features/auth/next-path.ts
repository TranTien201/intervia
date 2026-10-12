/** Query parameter of /login and /signup: where to go once logged in. */
export const NEXT_PARAM = 'next'

/**
 * The page to return to after login. Only paths inside the app are accepted, so a crafted
 * link (`/login?next=https://evil.example`) cannot send the user to another site.
 */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/'
  // Browsers drop tabs and newlines from URLs, so `/\t/evil.example` would become `//evil.example`.
  // oxlint-disable-next-line no-control-regex -- matching them is the point
  if (/[\s\x00-\x1f\x7f]/.test(next)) return '/'
  // Not back to the login pages themselves.
  if (/^\/(login|signup)(?:[/?#]|$)/.test(next)) return '/'
  return next
}

/** "/login?next=/sessions/abc/review" for the page the user tried to open. */
export function loginPath(location: { pathname: string; search: string; hash: string }) {
  const here = location.pathname + location.search + location.hash
  return here === '/' ? '/login' : `/login?${NEXT_PARAM}=${encodeURIComponent(here)}`
}
