import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type JobKind = 'job' | 'coop'
export type WorkMode = 'onsite' | 'remote' | 'hybrid'

export interface JobPost {
  id: string
  kind: JobKind
  title: string
  organization: string
  city: string | null
  workMode: WorkMode
  description: string
  requirements: string | null
  majors: string[]
  applyUrl: string | null
  deadline: string | null
  isPublished: boolean
  createdAt: string
}

export type JobInput = Omit<JobPost, 'id' | 'createdAt'>

export interface JobsApi {
  /** العامة: المنشورة فقط؛ الإدارة: الكل */
  list(scope: 'public' | 'admin'): Promise<JobPost[]>
  get(id: string): Promise<JobPost | null>
  save(id: string | null, input: JobInput): Promise<string>
  remove(id: string): Promise<void>
}

/** انتهى موعد التقديم؟ (يُعامل يوم الموعد نفسه كمتاح) */
export const isExpired = (j: Pick<JobPost, 'deadline'>) => {
  if (!j.deadline) return false
  const end = new Date(j.deadline)
  end.setHours(23, 59, 59, 999)
  return end < new Date()
}

/** يقبل رابط https أو بريداً إلكترونياً ويحوّله إلى mailto */
export function normalizeApply(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`
  if (/^mailto:/i.test(s)) return s
  if (/^https?:\/\//i.test(s)) return s
  return `https://${s}`
}

/* ═════════════════ وضع المعاينة ═════════════════ */
const KEY = 'miqyas-demo-jobs'
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))

function seed(): JobPost[] {
  const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const now = new Date().toISOString()
  // بيانات نموذجية لوضع المعاينة فقط — جهات وهمية بوضوح
  return [
    {
      id: 'demo-job-1', kind: 'job', title: 'محلل نظم معلومات جغرافية (نموذج)', organization: 'جهة تجريبية', city: 'الرياض', workMode: 'onsite',
      description: 'إعلان نموذجي لوضع المعاينة: إعداد الخرائط وتحليل البيانات المكانية ودعم فرق التخطيط.',
      requirements: 'بكالوريوس نظم معلومات جغرافية أو جغرافيا · إجادة ArcGIS Pro أو QGIS', majors: ['نظم المعلومات الجغرافية', 'الجغرافيا'],
      applyUrl: 'mailto:jobs@example.com', deadline: in30, isPublished: true, createdAt: now,
    },
    {
      id: 'demo-coop-1', kind: 'coop', title: 'تدريب تعاوني — مساحة ورفع ميداني (نموذج)', organization: 'جهة تجريبية', city: 'جدة', workMode: 'hybrid',
      description: 'إعلان نموذجي لوضع المعاينة: تدريب تعاوني لمدة 6 أشهر في أعمال الرفع المساحي ومعالجة البيانات.',
      requirements: 'طالب في سنته الأخيرة · خطاب تدريب من الجامعة', majors: ['هندسة المساحة', 'نظم المعلومات الجغرافية'],
      applyUrl: 'https://example.com/apply', deadline: in30, isPublished: true, createdAt: now,
    },
  ]
}

const load = (): JobPost[] => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as JobPost[]) : seed()
  } catch {
    return seed()
  }
}
const store = (v: JobPost[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* تجاهل */
  }
}

const demoApi: JobsApi = {
  list: async (scope) => delay(load().filter((j) => scope === 'admin' || j.isPublished).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
  get: async (id) => delay(load().find((j) => j.id === id) ?? null),
  async save(id, input) {
    const all = load()
    if (id) {
      const i = all.findIndex((j) => j.id === id)
      if (i >= 0) all[i] = { ...all[i], ...input }
    } else {
      id = crypto.randomUUID()
      all.push({ ...input, id, createdAt: new Date().toISOString() })
    }
    store(all)
    return delay(id)
  },
  async remove(id) {
    store(load().filter((j) => j.id !== id))
    await delay(null)
  },
}

/* ═════════════════ Supabase ═════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
const fromRow = (r: Row): JobPost => ({
  id: r.id, kind: r.kind, title: r.title, organization: r.organization, city: r.city, workMode: r.work_mode,
  description: r.description, requirements: r.requirements, majors: r.majors ?? [], applyUrl: r.apply_url,
  deadline: r.deadline, isPublished: r.is_published, createdAt: r.created_at,
})
const toRow = (j: JobInput) => ({
  kind: j.kind, title: j.title.trim(), organization: j.organization.trim(), city: j.city?.trim() || null, work_mode: j.workMode,
  description: j.description.trim(), requirements: j.requirements?.trim() || null, majors: j.majors, apply_url: j.applyUrl,
  deadline: j.deadline || null, is_published: j.isPublished, updated_at: new Date().toISOString(),
})

const supabaseApi: JobsApi = {
  async list(scope) {
    let q = supabase.from('job_posts').select('*').order('created_at', { ascending: false })
    if (scope === 'public') q = q.eq('is_published', true)
    return (must(await q) as Row[]).map(fromRow)
  },
  async get(id) {
    const r = must(await supabase.from('job_posts').select('*').eq('id', id).maybeSingle()) as Row | null
    return r ? fromRow(r) : null
  },
  async save(id, input) {
    if (id) {
      must(await supabase.from('job_posts').update(toRow(input)).eq('id', id))
      return id
    }
    const { data: u } = await supabase.auth.getUser()
    const r = must(await supabase.from('job_posts').insert({ ...toRow(input), created_by: u.user?.id }).select('id').single()) as Row
    return r.id
  },
  async remove(id) {
    must(await supabase.from('job_posts').delete().eq('id', id))
  },
}

export const jobsApi: JobsApi = isSupabaseConfigured ? supabaseApi : demoApi
