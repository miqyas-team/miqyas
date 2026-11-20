/**
 * المكتبة العلمية: مواضيع تمر على موافقة المدير ثم تُنشر «موضوعاً لليوم» واحداً كل يوم.
 * Supabase عند ربطه، وإلا بيانات المعاينة المحلية (من content/bank).
 */
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'

export const CATEGORIES = ['maps', 'data', 'coordinates', 'remote_sensing', 'analysis', 'surveying', 'tools'] as const
export type Category = (typeof CATEGORIES)[number]
export type ContentStatus = 'pending' | 'published' | 'rejected'

export interface Article {
  id: string
  slug: string
  category: Category
  title: Localized
  summary: Localized
  body: Localized
  readMin: number
  status: ContentStatus
  /** YYYY-MM-DD */
  publishOn: string | null
}

export type ArticleInput = Omit<Article, 'status' | 'publishOn'> & { isNew?: boolean }

export interface LibraryApi {
  /** المنشور الظاهر حتى اليوم، الأحدث أولاً */
  list(): Promise<Article[]>
  get(slug: string): Promise<Article | null>
  /* للمدير */
  listAll(): Promise<Article[]>
  approve(id: string): Promise<string>
  reject(id: string): Promise<void>
  save(a: ArticleInput): Promise<void>
  remove(id: string): Promise<void>
  pendingCounts(): Promise<{ articles: number; questions: number }>
}

/** اليوم بتوقيت الجهاز YYYY-MM-DD */
export function todayStr(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export function addDays(day: string, n: number) {
  const [y, m, d] = day.split('-').map(Number)
  return todayStr(new Date(y, m - 1, d + n))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const L = (r: Row, k: string): Localized => ({ ar: r[`${k}_ar`] ?? '', en: r[`${k}_en`] || r[`${k}_ar`] || '' })
const must = <T,>(res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message)
  return res.data
}
const toArticle = (r: Row): Article => ({
  id: r.id, slug: r.slug, category: r.category, title: L(r, 'title'), summary: L(r, 'summary'), body: L(r, 'body'),
  readMin: r.read_min, status: r.status, publishOn: r.publish_on,
})

const supabaseLibrary: LibraryApi = {
  async list() {
    const rows = must(await supabase.from('articles').select('*').eq('status', 'published').lte('publish_on', todayStr()).order('publish_on', { ascending: false })) as Row[]
    return rows.map(toArticle)
  },
  async get(slug) {
    const r = must(await supabase.from('articles').select('*').eq('slug', slug).maybeSingle()) as Row | null
    return r ? toArticle(r) : null
  },
  async listAll() {
    const rows = must(await supabase.from('articles').select('*').order('created_at')) as Row[]
    return rows.map(toArticle)
  },
  async approve(id) {
    return must(await supabase.rpc('approve_article', { p_id: id })) as string
  },
  async reject(id) {
    must(await supabase.from('articles').update({ status: 'rejected', publish_on: null, updated_at: new Date().toISOString() }).eq('id', id))
  },
  async save(a) {
    const row = {
      slug: a.slug, category: a.category, title_ar: a.title.ar, title_en: a.title.en || null,
      summary_ar: a.summary.ar, summary_en: a.summary.en || null, body_ar: a.body.ar, body_en: a.body.en || null,
      read_min: a.readMin, updated_at: new Date().toISOString(),
    }
    if (a.isNew) must(await supabase.from('articles').insert(row))
    else must(await supabase.from('articles').update(row).eq('id', a.id))
  },
  async remove(id) {
    must(await supabase.from('articles').delete().eq('id', id))
  },
  async pendingCounts() {
    return must(await supabase.rpc('content_pending_counts')) as { articles: number; questions: number }
  },
}

/* ═════════════ وضع المعاينة ═════════════ */

const KEY = 'miqyas-demo-library'
/** حالة كل موضوع في المعاينة (المحتوى نفسه من البنك) */
interface DemoLib {
  state: Record<string, { status: ContentStatus; publishOn: string | null }>
  custom: ArticleInput[]
  edits: Record<string, ArticleInput>
  removed: string[]
}

export async function loadBank() {
  const m = await import('../data/contentBank.json')
  return m.default as {
    articles: { slug: string; category: Category; title: string; titleEn?: string; summary: string; body: string; readMin?: number }[]
    questions: { level: number; prompt: string; options: string[]; correct: number; explanation: string }[]
  }
}

function loadDemo(): DemoLib | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DemoLib) : null
  } catch {
    return null
  }
}
function saveDemo(s: DemoLib) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* تجاهل */
  }
}

async function demoAll(): Promise<{ s: DemoLib; items: Article[] }> {
  const bank = await loadBank()
  let s = loadDemo()
  if (!s) {
    // أول تشغيل: آخر 3 مواضيع منشورة (أمس وقبله واليوم) والباقي بانتظار الموافقة
    const t = todayStr()
    s = { state: {}, custom: [], edits: {}, removed: [] }
    bank.articles.forEach((a, i) => {
      s!.state[a.slug] = i < 3 ? { status: 'published', publishOn: addDays(t, i - 2) } : { status: 'pending', publishOn: null }
    })
    saveDemo(s)
  }
  const base: ArticleInput[] = bank.articles.map((a) => ({
    id: a.slug, slug: a.slug, category: a.category,
    title: { ar: a.title, en: a.titleEn || a.title }, summary: { ar: a.summary, en: a.summary }, body: { ar: a.body, en: a.body },
    readMin: a.readMin ?? 4,
  }))
  const items = [...base, ...s.custom]
    .filter((a) => !s!.removed.includes(a.id))
    .map((a) => s!.edits[a.id] ?? a)
    .map((a) => ({ ...a, status: s!.state[a.id]?.status ?? 'pending', publishOn: s!.state[a.id]?.publishOn ?? null }) as Article)
  return { s, items }
}

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))
const visible = (a: Article) => a.status === 'published' && !!a.publishOn && a.publishOn <= todayStr()

const demoLibrary: LibraryApi = {
  async list() {
    const { items } = await demoAll()
    return wait(items.filter(visible).sort((a, b) => b.publishOn!.localeCompare(a.publishOn!)))
  },
  async get(slug) {
    const { items } = await demoAll()
    return wait(items.find((a) => a.slug === slug) ?? null)
  },
  async listAll() {
    return wait((await demoAll()).items)
  },
  async approve(id) {
    const { s, items } = await demoAll()
    const cur = s.state[id]
    if (cur?.status === 'published' && cur.publishOn) return cur.publishOn
    const last = items.filter((a) => a.status === 'published' && a.id !== id).map((a) => a.publishOn!).sort().pop()
    const t = todayStr()
    const day = last && last >= t ? addDays(last, 1) : t
    s.state[id] = { status: 'published', publishOn: day }
    saveDemo(s)
    return wait(day)
  },
  async reject(id) {
    const { s } = await demoAll()
    s.state[id] = { status: 'rejected', publishOn: null }
    saveDemo(s)
  },
  async save(a) {
    const { s } = await demoAll()
    const { isNew, ...clean } = a
    if (isNew) {
      s.custom.push(clean)
      s.state[clean.id] = { status: 'pending', publishOn: null }
    } else s.edits[clean.id] = clean
    saveDemo(s)
  },
  async remove(id) {
    const { s } = await demoAll()
    s.removed.push(id)
    saveDemo(s)
  },
  async pendingCounts() {
    const { items } = await demoAll()
    const { demoQuestionsPending } = await import('../challenge/api')
    return { articles: items.filter((a) => a.status === 'pending').length, questions: await demoQuestionsPending() }
  },
}

export const libraryApi: LibraryApi = isSupabaseConfigured ? supabaseLibrary : demoLibrary
