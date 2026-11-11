import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { AppRole } from '../lib/types'

export interface ForumAttachment {
  id: string
  name: string
  url: string
  sizeBytes: number | null
  isImage: boolean
}

export interface ForumPost {
  id: string
  body: string
  authorId: string
  authorName: string
  authorRole: AppRole
  isHidden: boolean
  createdAt: string
  attachments: ForumAttachment[]
}

export interface ForumThread extends ForumPost {
  title: string
  replyCount: number
  isLocked: boolean
  lastActivityAt: string
}

export interface ForumReport {
  id: string
  threadId: string
  threadTitle: string
  replyId: string | null
  excerpt: string
  reason: string
  createdAt: string
}

export interface CommunityApi {
  listThreads(): Promise<ForumThread[]>
  getThread(id: string): Promise<{ thread: ForumThread; replies: ForumPost[] } | null>
  createThread(title: string, body: string, files: File[]): Promise<string>
  reply(threadId: string, body: string, files: File[]): Promise<void>
  deletePost(kind: 'thread' | 'reply', id: string): Promise<void>
  report(threadId: string, replyId: string | null, reason: string): Promise<void>
  setHidden(kind: 'thread' | 'reply', id: string, hidden: boolean): Promise<void>
  setLocked(threadId: string, locked: boolean): Promise<void>
  listReports(): Promise<ForumReport[]>
  resolveReport(id: string): Promise<void>
}

export const MAX_FORUM_FILE_MB = 10
export const isImageName = (n: string) => /\.(png|jpe?g|gif|webp)$/i.test(n)

/* ═════════════════ وضع المعاينة ═════════════════ */
const KEY = 'miqyas-demo-forum'
const DEMO_USER = 'demo-user'
const DEMO_NAME = 'متدرب تجريبي'

type DemoAttachment = Omit<ForumAttachment, 'url'> & { dataUrl?: string }
interface DemoReply extends Omit<ForumPost, 'attachments'> { attachments: DemoAttachment[] }
interface DemoThread extends Omit<ForumThread, 'attachments' | 'replyCount'> { attachments: DemoAttachment[]; replies: DemoReply[] }
interface DemoState { threads: DemoThread[]; reports: (Omit<ForumReport, 'threadTitle' | 'excerpt'>)[] }

function seed(): DemoState {
  const at = new Date(Date.now() - 3 * 86_400_000).toISOString()
  return {
    reports: [],
    threads: [
      {
        id: 'welcome',
        title: 'أهلاً بك في مجتمع مقياس — اقرأ قبل أن تسأل',
        body:
          'هذا المكان لأسئلة نظم المعلومات الجغرافية والمساحة ومشاركة الخبرات.\n\n' +
          'لتحصل على إجابة أسرع:\n' +
          '• اكتب عنواناً يصف المشكلة بدقة (مثال: «QGIS: الطبقة تظهر في المكان الخطأ بعد الاستيراد»).\n' +
          '• اذكر البرنامج وإصداره ونظام الإحداثيات.\n' +
          '• أرفق لقطة شاشة لرسالة الخطأ أو ملفاً صغيراً يوضّح المشكلة.\n\n' +
          'احترم الجميع، ولا تنشر بيانات شخصية أو ملفات غير مرخّصة. يمكنك الإبلاغ عن أي مشاركة مخالفة.',
        authorId: 'miqyas-team',
        authorName: 'فريق مقياس',
        authorRole: 'team',
        isHidden: false,
        isLocked: true,
        createdAt: at,
        lastActivityAt: at,
        attachments: [],
        replies: [],
      },
    ],
  }
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DemoState) : seed()
  } catch {
    return seed()
  }
}
function save(s: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* تجاهل — قد يمتلئ التخزين بالصور */
  }
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))

function readDataUrl(f: File): Promise<string | undefined> {
  if (f.size > 1_500_000) return Promise.resolve(undefined)
  return new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : undefined)
    r.onerror = () => resolve(undefined)
    r.readAsDataURL(f)
  })
}
const demoFiles = (files: File[]) =>
  Promise.all(files.map(async (f) => ({ id: crypto.randomUUID(), name: f.name, sizeBytes: f.size, isImage: isImageName(f.name), dataUrl: await readDataUrl(f) })))
const outFiles = (a: DemoAttachment[]): ForumAttachment[] => a.map(({ dataUrl, ...x }) => ({ ...x, url: dataUrl ?? '#' }))
const demoRole = (): AppRole => {
  try {
    return (localStorage.getItem('miqyas-demo-role') as AppRole) || 'user'
  } catch {
    return 'user'
  }
}
const isAdminDemo = () => demoRole() === 'admin'

function toThread(t: DemoThread): ForumThread {
  const { replies, attachments, ...rest } = t
  return { ...rest, replyCount: replies.filter((r) => !r.isHidden).length, attachments: outFiles(attachments) }
}

const demoApi: CommunityApi = {
  async listThreads() {
    const s = load()
    return delay(
      s.threads
        .filter((t) => !t.isHidden || isAdminDemo() || t.authorId === DEMO_USER)
        .map(toThread)
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt)),
    )
  },
  async getThread(id) {
    const t = load().threads.find((x) => x.id === id)
    if (!t || (t.isHidden && !isAdminDemo() && t.authorId !== DEMO_USER)) return delay(null)
    return delay({
      thread: toThread(t),
      replies: t.replies.filter((r) => !r.isHidden || isAdminDemo() || r.authorId === DEMO_USER).map((r) => ({ ...r, attachments: outFiles(r.attachments) })),
    })
  },
  async createThread(title, body, files) {
    const s = load()
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    s.threads.push({ id, title: title.trim(), body: body.trim(), authorId: DEMO_USER, authorName: DEMO_NAME, authorRole: demoRole(), isHidden: false, isLocked: false, createdAt: now, lastActivityAt: now, attachments: await demoFiles(files), replies: [] })
    save(s)
    return delay(id)
  },
  async reply(threadId, body, files) {
    const s = load()
    const t = s.threads.find((x) => x.id === threadId)
    if (!t || t.isLocked) throw new Error('locked')
    const now = new Date().toISOString()
    t.replies.push({ id: crypto.randomUUID(), body: body.trim(), authorId: DEMO_USER, authorName: DEMO_NAME, authorRole: demoRole(), isHidden: false, createdAt: now, attachments: await demoFiles(files) })
    t.lastActivityAt = now
    save(s)
    await delay(null)
  },
  async deletePost(kind, id) {
    const s = load()
    if (kind === 'thread') s.threads = s.threads.filter((t) => t.id !== id)
    else for (const t of s.threads) t.replies = t.replies.filter((r) => r.id !== id)
    s.reports = s.reports.filter((r) => r.threadId !== id && r.replyId !== id)
    save(s)
    await delay(null)
  },
  async report(threadId, replyId, reason) {
    const s = load()
    s.reports.push({ id: crypto.randomUUID(), threadId, replyId, reason: reason.trim(), createdAt: new Date().toISOString() })
    save(s)
    await delay(null)
  },
  async setHidden(kind, id, hidden) {
    const s = load()
    for (const t of s.threads) {
      if (kind === 'thread' && t.id === id) t.isHidden = hidden
      if (kind === 'reply') for (const r of t.replies) if (r.id === id) r.isHidden = hidden
    }
    save(s)
    await delay(null)
  },
  async setLocked(threadId, locked) {
    const s = load()
    const t = s.threads.find((x) => x.id === threadId)
    if (t) t.isLocked = locked
    save(s)
    await delay(null)
  },
  async listReports() {
    const s = load()
    return delay(
      s.reports.map((r) => {
        const t = s.threads.find((x) => x.id === r.threadId)
        const reply = r.replyId ? t?.replies.find((x) => x.id === r.replyId) : null
        return { ...r, threadTitle: t?.title ?? '—', excerpt: (reply?.body ?? t?.body ?? '').slice(0, 160) }
      }),
    )
  },
  async resolveReport(id) {
    const s = load()
    s.reports = s.reports.filter((r) => r.id !== id)
    save(s)
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

const toAttachment = (a: Row): ForumAttachment => ({
  id: a.id,
  name: a.name,
  url: supabase.storage.from('forum-files').getPublicUrl(a.file_path).data.publicUrl,
  sizeBytes: a.size_bytes,
  isImage: a.is_image,
})

const toPost = (p: Row, atts: Row[]): ForumPost => ({
  id: p.id,
  body: p.body,
  authorId: p.author_id,
  authorName: p.author_name,
  authorRole: p.author_role,
  isHidden: p.is_hidden,
  createdAt: p.created_at,
  attachments: atts.map(toAttachment),
})

async function uid() {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('not authenticated')
  return data.user.id
}

async function uploadAll(threadId: string, replyId: string | null, files: File[]) {
  const user = await uid()
  for (const f of files) {
    const path = `${user}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_')}`
    must(await supabase.storage.from('forum-files').upload(path, f))
    must(await supabase.from('forum_attachments').insert({ thread_id: threadId, reply_id: replyId, uploader_id: user, name: f.name, file_path: path, size_bytes: f.size, is_image: isImageName(f.name) }))
  }
}

const supabaseApi: CommunityApi = {
  async listThreads() {
    const rows = must(await supabase.from('forum_threads').select('*').order('last_activity_at', { ascending: false }).limit(200)) as Row[]
    return rows.map((t) => ({ ...toPost(t, []), title: t.title, replyCount: t.reply_count, isLocked: t.is_locked, lastActivityAt: t.last_activity_at }))
  },
  async getThread(id) {
    const t = must(await supabase.from('forum_threads').select('*').eq('id', id).maybeSingle()) as Row | null
    if (!t) return null
    const [replies, atts] = await Promise.all([
      supabase.from('forum_replies').select('*').eq('thread_id', id).order('created_at'),
      supabase.from('forum_attachments').select('*').eq('thread_id', id),
    ])
    const all = (atts.data ?? []) as Row[]
    return {
      thread: { ...toPost(t, all.filter((a) => !a.reply_id)), title: t.title, replyCount: t.reply_count, isLocked: t.is_locked, lastActivityAt: t.last_activity_at },
      replies: ((replies.data ?? []) as Row[]).map((r) => toPost(r, all.filter((a) => a.reply_id === r.id))),
    }
  },
  async createThread(title, body, files) {
    const row = must(await supabase.from('forum_threads').insert({ author_id: await uid(), title: title.trim(), body: body.trim() }).select('id').single()) as Row
    if (files.length) await uploadAll(row.id, null, files)
    return row.id
  },
  async reply(threadId, body, files) {
    const row = must(await supabase.from('forum_replies').insert({ thread_id: threadId, author_id: await uid(), body: body.trim() }).select('id').single()) as Row
    if (files.length) await uploadAll(threadId, row.id, files)
  },
  async deletePost(kind, id) {
    must(await supabase.from(kind === 'thread' ? 'forum_threads' : 'forum_replies').delete().eq('id', id))
  },
  async report(threadId, replyId, reason) {
    const res = await supabase.from('forum_reports').insert({ thread_id: threadId, reply_id: replyId, reporter_id: await uid(), reason: reason.trim() })
    // بلاغ مكرر من نفس الشخص: نعتبره ناجحاً
    if (res.error && !res.error.message.includes('duplicate')) throw new Error(res.error.message)
  },
  async setHidden(kind, id, hidden) {
    must(await supabase.from(kind === 'thread' ? 'forum_threads' : 'forum_replies').update({ is_hidden: hidden }).eq('id', id))
  },
  async setLocked(threadId, locked) {
    must(await supabase.from('forum_threads').update({ is_locked: locked }).eq('id', threadId))
  },
  async listReports() {
    const rows = must(
      await supabase.from('forum_reports').select('*, thread:forum_threads(title, body), reply:forum_replies(body)').is('resolved_at', null).order('created_at', { ascending: false }),
    ) as Row[]
    return rows.map((r) => ({
      id: r.id,
      threadId: r.thread_id,
      threadTitle: r.thread?.title ?? '—',
      replyId: r.reply_id,
      excerpt: (r.reply?.body ?? r.thread?.body ?? '').slice(0, 160),
      reason: r.reason,
      createdAt: r.created_at,
    }))
  },
  async resolveReport(id) {
    must(await supabase.from('forum_reports').update({ resolved_at: new Date().toISOString(), resolved_by: await uid() }).eq('id', id))
  },
}

export const communityApi: CommunityApi = isSupabaseConfigured ? supabaseApi : demoApi
