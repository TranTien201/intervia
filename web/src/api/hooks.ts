import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from './client'
import { qk } from './keys'
import { dropAllDrafts, dropDraft } from '@/lib/answer-draft'
import type {
  AccountData,
  AnalysisStatus,
  AnalysisProgress,
  AuthState,
  BlueprintView,
  CandidateProfile,
  Coverage,
  CreateSessionInput,
  Credentials,
  CvSummary,
  CvVersion,
  JdDetail,
  JdRequirements,
  JdSummary,
  JdVersion,
  MatchResult,
  Mode,
  PasswordChange,
  Role,
  SessionEndSummary,
  SessionSummary,
  Transcript,
  TranscriptItem,
  User,
  VersionInfo,
} from './types'

const POLL_MS = 1000

/** Lists keep polling while a CV/JD is still being analysed, so the row updates by itself. */
const isAnalyzing = (x: { analysis_status: AnalysisStatus }) =>
  x.analysis_status === 'pending' || x.analysis_status === 'running'

// ---------- Auth (UI-11) ----------
export const useMe = () =>
  useQuery({
    queryKey: qk.me,
    queryFn: () => request<AuthState>('/auth/me'),
    staleTime: Infinity,
  })

/** Login and signup both start a fresh login: drop whatever was cached before it. */
function useStartLogin(path: '/auth/login' | '/auth/signup') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Credentials) =>
      request<{ user: User }>(path, { method: 'POST', body: { ...body } }),
    onSuccess: ({ user }) => {
      qc.removeQueries()
      qc.setQueryData<AuthState>(qk.me, { auth_enabled: true, user })
    },
  })
}

export const useLogin = () => useStartLogin('/auth/login')
export const useSignup = () => useStartLogin('/auth/signup')

/**
 * Logout and account deletion both end the login here: drop the cache and the answer drafts
 * (the candidate's own words, PII) so the next person on this browser sees nothing.
 */
function useEndLogin<T>(mutationFn: (arg: T) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      dropAllDrafts()
      qc.removeQueries()
      qc.setQueryData<AuthState>(qk.me, { auth_enabled: true, user: null })
    },
  })
}

export const useLogout = () =>
  useEndLogin(() => request<void>('/auth/logout', { method: 'POST' }))

export const useDeleteAccount = () =>
  useEndLogin((email: string) => request<void>('/account', { method: 'DELETE', body: { email } }))

// ---------- Account (UI-11.2) ----------
export const useAccountData = () =>
  useQuery({ queryKey: qk.accountData, queryFn: () => request<AccountData>('/account/data') })

export const useChangePassword = () =>
  useMutation({
    mutationFn: (body: PasswordChange) =>
      request<void>('/account/password', { method: 'POST', body: { ...body } }),
  })

// ---------- Catalog ----------
export const useRoles = () =>
  useQuery({ queryKey: qk.roles, queryFn: () => request<Role[]>('/roles'), staleTime: Infinity })

// ---------- CV ----------
export const useCvs = () =>
  useQuery({
    queryKey: qk.cvs,
    queryFn: () => request<CvSummary[]>('/cvs'),
    refetchInterval: (q) => (q.state.data?.some(isAnalyzing) ? POLL_MS : false),
  })

export const useCv = (id: string) =>
  useQuery({ queryKey: qk.cv(id), queryFn: () => request<CvSummary>(`/cvs/${id}`) })

export const useCvAnalysis = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.cvAnalysis(id ?? ''),
    queryFn: () => request<AnalysisProgress>(`/cvs/${id}/analysis`),
    enabled: !!id && enabled,
    refetchInterval: (q) =>
      q.state.data && ['done', 'failed'].includes(q.state.data.status) ? false : POLL_MS,
  })

export const useCvVersions = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.cvVersions(id),
    queryFn: () => request<VersionInfo[]>(`/cvs/${id}/versions`),
    enabled,
  })

export const useCvVersion = (
  id: string | undefined,
  v: number | 'latest' = 'latest',
  enabled = true,
) =>
  useQuery({
    queryKey: qk.cvVersion(id ?? '', v),
    queryFn: () => request<CvVersion>(`/cvs/${id}/versions/${v}`),
    enabled: !!id && enabled,
  })

export const useCvSessions = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.cvSessions(id),
    queryFn: () => request<SessionSummary[]>(`/cvs/${id}/sessions`),
    enabled,
  })

export function useUploadCv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) => {
      const form = new FormData()
      form.append('file', file)
      form.append('name', name)
      return request<CvSummary>('/cvs', { method: 'POST', body: form })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cvs }),
  })
}

export function useRenameCv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      request<CvSummary>(`/cvs/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cvs })
      qc.invalidateQueries({ queryKey: qk.sessions })
    },
  })
}

export function useSaveCvVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      base_version,
      profile,
    }: {
      id: string
      base_version: number
      profile: CandidateProfile
    }) =>
      request<CvVersion>(`/cvs/${id}/versions`, {
        method: 'POST',
        body: { base_version, profile },
      }),
    onSuccess: (v, { id }) => {
      // Page 3 switches the session to it right away: no refetch, no flash.
      qc.setQueryData(qk.cvVersion(id, v.version), v)
      qc.invalidateQueries({ queryKey: qk.cv(id) })
      qc.invalidateQueries({ queryKey: qk.cvs })
    },
  })
}

export function useReanalyzeCv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request<AnalysisProgress>(`/cvs/${id}/reanalyze`, { method: 'POST' }),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: qk.cv(id) }),
  })
}

export function useDeleteCv() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request<void>(`/cvs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.cvs })
      qc.invalidateQueries({ queryKey: qk.jds })
      qc.invalidateQueries({ queryKey: qk.sessions })
    },
  })
}

// ---------- JD ----------
export const useJds = () =>
  useQuery({
    queryKey: qk.jds,
    queryFn: () => request<JdSummary[]>('/jds'),
    refetchInterval: (q) => (q.state.data?.some(isAnalyzing) ? POLL_MS : false),
  })

export const useJd = (id: string) =>
  useQuery({ queryKey: qk.jd(id), queryFn: () => request<JdDetail>(`/jds/${id}`) })

export const useJdAnalysis = (id: string | undefined, enabled = true) =>
  useQuery({
    queryKey: qk.jdAnalysis(id ?? ''),
    queryFn: () => request<AnalysisProgress>(`/jds/${id}/analysis`),
    enabled: !!id && enabled,
    refetchInterval: (q) =>
      q.state.data && ['done', 'failed'].includes(q.state.data.status) ? false : POLL_MS,
  })

export const useJdVersions = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.jdVersions(id),
    queryFn: () => request<VersionInfo[]>(`/jds/${id}/versions`),
    enabled,
  })

export const useJdVersion = (
  id: string | undefined,
  v: number | 'latest' = 'latest',
  enabled = true,
) =>
  useQuery({
    queryKey: qk.jdVersion(id ?? '', v),
    queryFn: () => request<JdVersion>(`/jds/${id}/versions/${v}`),
    enabled: !!id && enabled,
  })

export const useJdSessions = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.jdSessions(id),
    queryFn: () => request<SessionSummary[]>(`/jds/${id}/sessions`),
    enabled,
  })

export function useCreateJd() {
  const qc = useQueryClient()
  return useMutation({
    // Pasted text as JSON, or a file as multipart (the server extracts its text).
    mutationFn: (input: { name: string; text: string } | { name: string; file: File }) => {
      if ('text' in input) return request<JdSummary>('/jds', { method: 'POST', body: input })
      const form = new FormData()
      form.append('file', input.file)
      form.append('name', input.name)
      return request<JdSummary>('/jds', { method: 'POST', body: form })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jds }),
  })
}

export function useRenameJd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      request<JdSummary>(`/jds/${id}`, { method: 'PATCH', body: { name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.jds })
      qc.invalidateQueries({ queryKey: qk.sessions })
    },
  })
}

export function useSaveJdVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      base_version,
      requirements,
    }: {
      id: string
      base_version: number
      requirements: JdRequirements
    }) =>
      request<JdVersion>(`/jds/${id}/versions`, {
        method: 'POST',
        body: { base_version, requirements },
      }),
    onSuccess: (v, { id }) => {
      qc.setQueryData(qk.jdVersion(id, v.version), v)
      qc.invalidateQueries({ queryKey: qk.jd(id) })
      qc.invalidateQueries({ queryKey: qk.jds })
    },
  })
}

export function useReanalyzeJd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request<AnalysisProgress>(`/jds/${id}/reanalyze`, { method: 'POST' }),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: qk.jd(id) }),
  })
}

export function useDeleteJd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request<void>(`/jds/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.jds })
      qc.invalidateQueries({ queryKey: qk.cvs })
      qc.invalidateQueries({ queryKey: qk.sessions })
    },
  })
}

// ---------- Sessions ----------
export const useSessions = () =>
  useQuery({ queryKey: qk.sessions, queryFn: () => request<SessionSummary[]>('/sessions') })

export const useSession = (id: string) =>
  useQuery({ queryKey: qk.session(id), queryFn: () => request<SessionSummary>(`/sessions/${id}`) })

export function useCreateSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateSessionInput) =>
      request<SessionSummary>('/sessions', { method: 'POST', body: { ...body } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sessions }),
  })
}

export function useUpdateSessionVersions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; cv_version?: number; jd_version?: number }) =>
      request<SessionSummary>(`/sessions/${id}`, { method: 'PATCH', body }),
    onSuccess: (_d, { id }) => qc.invalidateQueries({ queryKey: qk.session(id) }),
  })
}

export function useDeleteSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, id) => {
      dropDraft(id)
      qc.invalidateQueries({ queryKey: qk.sessions })
      qc.invalidateQueries({ queryKey: qk.cvs })
      qc.invalidateQueries({ queryKey: qk.jds })
    },
  })
}

export const useMatch = (id: string, enabled = true) =>
  useQuery({
    queryKey: qk.match(id),
    queryFn: () => request<MatchResult>(`/sessions/${id}/match`),
    enabled,
  })

export const useBlueprint = (id: string) =>
  useQuery({
    queryKey: qk.blueprint(id),
    queryFn: () => request<BlueprintView>(`/sessions/${id}/blueprint`),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? POLL_MS : false),
  })

export function useCreateBlueprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request<BlueprintView>(`/sessions/${id}/blueprint`, { method: 'POST' }),
    onSuccess: (data, id) => qc.setQueryData(qk.blueprint(id), data),
  })
}

export const useTranscript = (id: string) =>
  useQuery({
    queryKey: qk.transcript(id),
    queryFn: () => request<Transcript>(`/sessions/${id}/transcript`),
  })

export function useStopSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      request<SessionEndSummary>(`/sessions/${id}/stop`, { method: 'POST' }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: qk.session(id) })
      qc.invalidateQueries({ queryKey: qk.sessions })
    },
  })
}

export function useChangeMode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: Mode }) =>
      request<SessionSummary>(`/sessions/${id}/mode`, { method: 'PATCH', body: { mode } }),
    onSuccess: (data, { id }) => qc.setQueryData(qk.session(id), data),
  })
}

export const useCoverage = (id: string) =>
  useQuery({
    queryKey: qk.coverage(id),
    queryFn: () => request<Coverage[]>(`/sessions/${id}/coverage`),
  })

export function useEditAnswer(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, text_edited }: { id: string; text_edited: string }) =>
      request<TranscriptItem>(`/answers/${id}`, { method: 'PATCH', body: { text_edited } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.transcript(sessionId) }),
  })
}
