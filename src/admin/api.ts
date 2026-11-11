import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'
import type { AppRole } from '../lib/types'
import type { RequestStatus } from '../services/types'
import type { SubmissionStatus } from '../courses/types'
import { loadDrafts } from '../courses/demoCatalog'

export interface AdminStats {
  /** true في وضع المعاينة: أرقام نموذجية للعرض */
  isSample: boolean
  users: { total: number; new30: number; byRole: Partial<Record<AppRole, number>> }
  enrollments: { total: number; active: number; completed: number; pending: number; new30: number }
  certificates: number
  requests: { byStatus: Partial<Record<RequestStatus, number>>; unassigned: number; overdue: number }
  pendingGrading: number
  revenue: { month: string; courses: number; services: number }[]
  topCourses: { title: Localized; enrollments: number }[]
}

export interface UserRow {
  id: string
  name: string
  email: string | null
  phone: string | null
  organization: string | null
  role: AppRole
  createdAt: string
}

export interface SubmissionRow {
  id: string
  studentName: string
  courseTitle: Localized
  lessonTitle: Localized
  fileName: string
  fileUrl: string
  note: string | null
  status: SubmissionStatus
  grade: number | null
  feedback: string | null
  createdAt: string
}

export interface AdminApi {
  getStats(): Promise<AdminStats>
  listUsers(): Promise<UserRow[]>
  setRole(userId: string, role: AppRole): Promise<void>
  listSubmissions(): Promise<SubmissionRow[]>
  gradeSubmission(id: string, status: Exclude<SubmissionStatus, 'submitted'>, grade: number | null, feedback: string): Promise<void>
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 200))

/* ═════════════════ وضع المعاينة ═════════════════ */

function lastMonths(n: number) {
  const out: string[] = []
  const d = new Date()
  d.setDate(1)
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

const sampleStats = (): AdminStats => {
  const months = lastMonths(6)
  const courses = [1200, 2450, 1980, 3400, 4150, 3720]
  const services = [900, 1500, 2600, 2100, 3300, 4050]
  return {
    isSample: true,
    users: { total: 342, new30: 58, byRole: { user: 331, instructor: 4, team: 5, admin: 2 } },
    enrollments: { total: 415, active: 268, completed: 121, pending: 26, new30: 74 },
    certificates: 118,
    requests: { byStatus: { new: 6, quoting: 4, awaiting_payment: 5, in_progress: 9, review: 3, completed: 41, cancelled: 4 }, unassigned: 5, overdue: 2 },
    pendingGrading: 0,
    revenue: months.map((month, i) => ({ month, courses: courses[i], services: services[i] })),
    topCourses: [
      { title: { ar: 'QGIS من الصفر', en: 'QGIS from Zero' }, enrollments: 184 },
      { title: { ar: 'التحليل المكاني باستخدام ArcGIS Pro', en: 'Spatial Analysis with ArcGIS Pro' }, enrollments: 97 },
      { title: { ar: 'Python لنظم المعلومات الجغرافية', en: 'Python for GIS' }, enrollments: 63 },
      { title: { ar: 'أساسيات الاستشعار عن بعد', en: 'Remote Sensing Basics' }, enrollments: 41 },
    ],
  }
}

const USERS_KEY = 'miqyas-demo-users'
const defaultUsers = (): UserRow[] => {
  const now = Date.now()
  const day = 86_400_000
  return [
    { id: 'demo-user', name: 'متدرب تجريبي', email: 'demo@miqyas.local', phone: '0500000000', organization: null, role: 'user', createdAt: new Date(now - 2 * day).toISOString() },
    { id: 'demo-u2', name: 'مستخدم تجريبي ٢', email: 'user2@miqyas.local', phone: null, organization: 'جامعة تجريبية', role: 'user', createdAt: new Date(now - 9 * day).toISOString() },
    { id: 'demo-u3', name: 'مدرّب تجريبي', email: 'instructor@miqyas.local', phone: null, organization: null, role: 'instructor', createdAt: new Date(now - 40 * day).toISOString() },
    { id: 'demo-team', name: 'عضو فريق تجريبي', email: 'team@miqyas.local', phone: null, organization: 'مقياس', role: 'team', createdAt: new Date(now - 60 * day).toISOString() },
    { id: 'demo-admin', name: 'مدير تجريبي', email: 'admin@miqyas.local', phone: null, organization: 'مقياس', role: 'admin', createdAt: new Date(now - 90 * day).toISOString() },
  ]
}
const loadUsers = (): UserRow[] => {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? (JSON.parse(raw) as UserRow[]) : defaultUsers()
  } catch {
    return defaultUsers()
  }
}

const COURSES_KEY = 'miqyas-demo-courses'
interface DemoCourseState {
  submissions?: Record<string, { id: string; fileName: string; status: SubmissionStatus; grade: number | null; feedback: string | null; createdAt: string; note?: string | null; dataUrl?: string }>
}
const loadCourseState = (): DemoCourseState => {
  try {
    return JSON.parse(localStorage.getItem(COURSES_KEY) ?? '{}') as DemoCourseState
  } catch {
    return {}
  }
}

function lessonInfo(lessonId: string) {
  for (const c of loadDrafts()) {
    for (const m of c.modules) {
      const l = m.lessons.find((x) => x.id === lessonId)
      if (l) return { courseTitle: c.title, lessonTitle: l.title }
    }
  }
  return null
}

const demoApi: AdminApi = {
  async getStats() {
    const s = sampleStats()
    // التمارين بانتظار التصحيح حقيقية من بيانات المعاينة
    s.pendingGrading = Object.values(loadCourseState().submissions ?? {}).filter((x) => x.status === 'submitted').length
    return delay(s)
  },
  listUsers: async () => delay(loadUsers()),
  async setRole(userId, role) {
    const users = loadUsers().map((u) => (u.id === userId ? { ...u, role } : u))
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
    await delay(null)
  },
  async listSubmissions() {
    const subs = loadCourseState().submissions ?? {}
    return delay(
      Object.entries(subs)
        .map(([lessonId, s]) => {
          const info = lessonInfo(lessonId)
          return info
            ? { id: s.id, studentName: 'متدرب تجريبي', courseTitle: info.courseTitle, lessonTitle: info.lessonTitle, fileName: s.fileName, fileUrl: s.dataUrl ?? '#', note: s.note ?? null, status: s.status, grade: s.grade, feedback: s.feedback, createdAt: s.createdAt }
            : null
        })
        .filter((x): x is SubmissionRow => x !== null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  },
  async gradeSubmission(id, status, grade, feedback) {
    const state = loadCourseState()
    for (const s of Object.values(state.submissions ?? {})) {
      if (s.id === id) Object.assign(s, { status, grade, feedback: feedback.trim() || null })
    }
    localStorage.setItem(COURSES_KEY, JSON.stringify(state))
    await delay(null)
  },
}

/* ═════════════════ Supabase ═════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const L = (r: Row | null | undefined, key: string): Localized => ({ ar: r?.[`${key}_ar`] ?? '', en: r?.[`${key}_en`] ?? '' })

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const supabaseApi: AdminApi = {
  async getStats() {
    const r = must(await supabase.rpc('admin_stats', { p_months: 6 })) as Row
    // بعد ربط الدفع: الإيراد من المدفوعات المؤكدة (admin_revenue)، وإن لم تتوفر الدالة نبقي التقدير
    const rev = await supabase.rpc('admin_revenue', { p_months: 6 })
    if (!rev.error && rev.data) r.revenue = rev.data
    return {
      isSample: false,
      users: { total: r.users.total, new30: r.users.new30, byRole: r.users.by_role },
      enrollments: r.enrollments,
      certificates: r.certificates,
      requests: { byStatus: r.requests.by_status, unassigned: r.requests.unassigned, overdue: r.requests.overdue },
      pendingGrading: r.pending_grading,
      revenue: (r.revenue ?? []).map((x: Row) => ({ month: x.month, courses: Number(x.courses), services: Number(x.services) })),
      topCourses: (r.top_courses ?? []).map((x: Row) => ({ title: L(x, 'title'), enrollments: Number(x.enrollments) })),
    }
  },

  async listUsers() {
    const rows = must(await supabase.from('profiles').select('id, full_name, email, phone, organization, role, created_at').order('created_at', { ascending: false }).limit(1000)) as Row[]
    return rows.map((u) => ({ id: u.id, name: u.full_name, email: u.email, phone: u.phone, organization: u.organization, role: u.role, createdAt: u.created_at }))
  },

  async setRole(userId, role) {
    must(await supabase.from('profiles').update({ role }).eq('id', userId))
  },

  async listSubmissions() {
    const rows = must(
      await supabase
        .from('assignment_submissions')
        .select('*, student:profiles!assignment_submissions_user_id_fkey(full_name), lesson:lessons(title_ar, title_en), course:courses(title_ar, title_en)')
        .order('created_at', { ascending: false })
        .limit(500),
    ) as Row[]
    return Promise.all(
      rows.map(async (s) => {
        const { data } = await supabase.storage.from('submissions').createSignedUrl(s.file_path, 3600, { download: s.file_name })
        return {
          id: s.id,
          studentName: s.student?.full_name ?? '',
          courseTitle: L(s.course, 'title'),
          lessonTitle: L(s.lesson, 'title'),
          fileName: s.file_name,
          fileUrl: data?.signedUrl ?? '#',
          note: s.note,
          status: s.status,
          grade: s.grade,
          feedback: s.feedback,
          createdAt: s.created_at,
        }
      }),
    )
  },

  async gradeSubmission(id, status, grade, feedback) {
    must(await supabase.rpc('grade_submission', { p_submission: id, p_status: status, p_grade: grade, p_feedback: feedback }))
  },
}

export const adminApi: AdminApi = isSupabaseConfigured ? supabaseApi : demoApi
