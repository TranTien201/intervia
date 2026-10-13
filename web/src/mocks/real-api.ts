/** Parses `VITE_REAL_API` (comma-separated group names, e.g. `auth,cvs`) into a list. */
export const parseRealApi = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Whether a mock handler path belongs to a group the real backend serves: the group root
 * itself (`/api/cvs`) or anything under it (`/api/cvs/:id`), but not a group that merely
 * shares the prefix (`/api/cvsx`).
 */
export const isRealApiPath = (path: string, groups: string[]) =>
  groups.some((group) => path === `/api/${group}` || path.startsWith(`/api/${group}/`))
