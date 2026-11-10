import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'
import { loadDrafts, saveDrafts } from './demoCatalog'
import type { AdminCourseRow, CourseDraft, LessonDraft } from './draft'
import type { Tone } from './types'

export interface CourseAdminApi {
  /** للمدير كل الدورات، وللمدرّب دوراته فقط */
  listCourses(scope: 'all' | 'mine'): Promise<AdminCourseRow[]>
  getDraft(id: string): Promise<CourseDraft | null>
  saveDraft(draft: CourseDraft): Promise<void>
  setPublished(id: string, published: boolean): Promise<void>
  deleteCourse(id: string): Promise<void>
  listInstructors(): Promise<{ id: string; name: string }[]>
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 200))

const toRow = (d: CourseDraft): AdminCourseRow => ({
  id: d.id,
  slug: d.slug,
  title: d.title,
  format: d.format,
  level: d.level,
  price: d.price,
  lessonsCount: d.modules.reduce((n, m) => n + m.lessons.length, 0),
  isPublished: d.isPublished,
  isFeatured: d.isFeatured,
})

/* ───────── وضع المعاينة ───────── */
const demoAdmin: CourseAdminApi = {
  listCourses: async () => delay(loadDrafts().map(toRow)),
  getDraft: async (id) => delay(structuredClone(loadDrafts().find((d) => d.id === id) ?? null)),
  async saveDraft(draft) {
    const all = loadDrafts()
    if (all.some((d) => d.slug === draft.slug && d.id !== draft.id)) throw new Error('slug taken')
    const i = all.findIndex((d) => d.id === draft.id)
    if (i >= 0) all[i] = draft
    else all.push(draft)
    saveDrafts(all)
    await delay(null)
  },
  async setPublished(id, published) {
    saveDrafts(loadDrafts().map((d) => (d.id === id ? { ...d, isPublished: published } : d)))
    await delay(null)
  },
  async deleteCourse(id) {
    saveDrafts(loadDrafts().filter((d) => d.id !== id))
    await delay(null)
  },
  listInstructors: async () => delay([]),
}

/* ───────── Supabase ───────── */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const L = (r: Row | null | undefined, key: string): Localized => ({ ar: r?.[`${key}_ar`] ?? '', en: r?.[`${key}_en`] ?? '' })
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null))

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

async function syncChildren(table: string, keyCol: string, keyVals: string[], keepIds: string[]) {
  if (!keyVals.length) return
  const existing = must(await supabase.from(table).select('id').in(keyCol, keyVals)) as Row[]
  const remove = existing.map((r) => r.id as string).filter((id) => !keepIds.includes(id))
  if (remove.length) must(await supabase.from(table).delete().in('id', remove))
}

const supabaseAdmin: CourseAdminApi = {
  async listCourses(scope) {
    let q = supabase.from('courses').select('id, slug, title_ar, title_en, format, level, price, is_published, is_featured, instructor_id, lessons(count)').order('created_at')
    if (scope === 'mine') {
      const { data } = await supabase.auth.getUser()
      q = q.eq('instructor_id', data.user?.id ?? '')
    }
    const rows = must(await q) as Row[]
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: L(r, 'title'),
      format: r.format,
      level: r.level,
      price: Number(r.price),
      lessonsCount: r.lessons?.[0]?.count ?? 0,
      isPublished: r.is_published,
      isFeatured: r.is_featured,
    }))
  },

  async getDraft(id) {
    const r = must(
      await supabase
        .from('courses')
        .select(
          `*, cohorts(*),
           modules(*, lessons(*, lesson_content(*), lesson_attachments(*), quiz_questions(*, quiz_answer_keys(correct_index))))`,
        )
        .eq('id', id)
        .maybeSingle(),
    ) as Row | null
    if (!r) return null
    const byPos = (a: Row, b: Row) => a.position - b.position
    return {
      id: r.id,
      isNew: false,
      slug: r.slug,
      title: L(r, 'title'),
      summary: L(r, 'summary'),
      description: L(r, 'description'),
      outcomes: { ar: r.outcomes_ar ?? [], en: r.outcomes_en ?? [] },
      level: r.level,
      format: r.format,
      software: r.software ?? [],
      price: Number(r.price),
      hours: Number(r.hours ?? 0),
      tone: (r.tone ?? 'primary') as Tone,
      passScore: r.pass_score,
      instructorId: r.instructor_id,
      instructorName: L(r, 'instructor_name'),
      instructorBio: L(r, 'instructor_bio'),
      isFeatured: r.is_featured,
      isPublished: r.is_published,
      cohorts: ((r.cohorts ?? []) as Row[])
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .map((c) => ({ id: c.id, name: L(c, 'name'), startsOn: c.starts_on, endsOn: c.ends_on, seats: c.seats, status: c.status })),
      modules: ((r.modules ?? []) as Row[]).sort(byPos).map((m) => ({
        id: m.id,
        title: L(m, 'title'),
        lessons: ((m.lessons ?? []) as Row[]).sort(byPos).map((l): LessonDraft => {
          const c = one(l.lesson_content) as Row | null
          return {
            id: l.id,
            title: L(l, 'title'),
            durationMin: l.duration_min,
            isPreview: l.is_preview,
            youtubeId: c?.youtube_id ?? null,
            body: L(c, 'body'),
            hasQuiz: l.has_quiz,
            hasAssignment: l.has_assignment,
            assignment: L(c, 'assignment'),
            attachments: ((l.lesson_attachments ?? []) as Row[]).map((a) => ({ id: a.id, name: a.name, sizeBytes: a.size_bytes, filePath: a.file_path })),
            questions: ((l.quiz_questions ?? []) as Row[]).sort(byPos).map((q) => ({
              id: q.id,
              kind: q.kind,
              prompt: L(q, 'prompt'),
              options: q.options,
              correct: (one(q.quiz_answer_keys) as Row | null)?.correct_index ?? 0,
            })),
          }
        }),
      })),
    }
  },

  async saveDraft(d) {
    const course = {
      id: d.id,
      slug: d.slug,
      title_ar: d.title.ar, title_en: d.title.en,
      summary_ar: d.summary.ar || null, summary_en: d.summary.en || null,
      description_ar: d.description.ar || null, description_en: d.description.en || null,
      outcomes_ar: d.outcomes.ar, outcomes_en: d.outcomes.en,
      level: d.level, format: d.format, software: d.software,
      price: d.price, hours: d.hours, tone: d.tone, pass_score: d.passScore,
      instructor_id: d.instructorId,
      instructor_name_ar: d.instructorName.ar || null, instructor_name_en: d.instructorName.en || null,
      instructor_bio_ar: d.instructorBio.ar || null, instructor_bio_en: d.instructorBio.en || null,
      is_featured: d.isFeatured, is_published: d.isPublished,
      updated_at: new Date().toISOString(),
    }
    must(await supabase.from('courses').upsert(course))

    // الوحدات (حذف المحذوف يحذف دروسه تلقائياً)
    await syncChildren('modules', 'course_id', [d.id], d.modules.map((m) => m.id))
    if (d.modules.length) {
      must(await supabase.from('modules').upsert(d.modules.map((m, i) => ({ id: m.id, course_id: d.id, title_ar: m.title.ar, title_en: m.title.en, position: i }))))
    }

    const lessons = d.modules.flatMap((m) => m.lessons.map((l) => ({ m, l })))
    await syncChildren('lessons', 'course_id', [d.id], lessons.map(({ l }) => l.id))
    if (lessons.length) {
      must(await supabase.from('lessons').upsert(lessons.map(({ m, l }, i) => ({
        id: l.id, module_id: m.id, course_id: d.id,
        title_ar: l.title.ar, title_en: l.title.en,
        duration_min: l.durationMin, position: i, is_preview: l.isPreview,
        has_quiz: l.hasQuiz, has_assignment: l.hasAssignment,
      }))))
      must(await supabase.from('lesson_content').upsert(lessons.map(({ l }) => ({
        lesson_id: l.id, youtube_id: l.youtubeId,
        body_ar: l.body.ar || null, body_en: l.body.en || null,
        assignment_ar: l.hasAssignment ? l.assignment.ar : null, assignment_en: l.hasAssignment ? l.assignment.en : null,
      }))))
    }

    // الأسئلة ومفاتيحها
    const lessonIds = lessons.map(({ l }) => l.id)
    const questions = lessons.flatMap(({ l }) => (l.hasQuiz ? l.questions.map((q, i) => ({ l, q, i })) : []))
    await syncChildren('quiz_questions', 'lesson_id', lessonIds, questions.map(({ q }) => q.id))
    if (questions.length) {
      must(await supabase.from('quiz_questions').upsert(questions.map(({ l, q, i }) => ({
        id: q.id, lesson_id: l.id, kind: q.kind, prompt_ar: q.prompt.ar, prompt_en: q.prompt.en, options: q.options, position: i,
      }))))
      must(await supabase.from('quiz_answer_keys').upsert(questions.map(({ q }) => ({ question_id: q.id, correct_index: q.correct }))))
    }

    // المرفقات: رفع الجديد وحذف المُزال
    const atts = lessons.flatMap(({ l }) => l.attachments.map((a) => ({ l, a })))
    const existingAtts = lessonIds.length
      ? (must(await supabase.from('lesson_attachments').select('id, file_path').in('lesson_id', lessonIds)) as Row[])
      : []
    const removed = existingAtts.filter((r) => !atts.some(({ a }) => a.id === r.id))
    if (removed.length) {
      await supabase.storage.from('course-files').remove(removed.map((r) => r.file_path))
      must(await supabase.from('lesson_attachments').delete().in('id', removed.map((r) => r.id)))
    }
    for (const { l, a } of atts) {
      if (!a.file) continue
      const path = `${d.id}/${l.id}/${a.id}-${a.name.replace(/[^\w.\-]+/g, '_')}`
      must(await supabase.storage.from('course-files').upload(path, a.file, { upsert: true }))
      must(await supabase.from('lesson_attachments').upsert({ id: a.id, lesson_id: l.id, name: a.name, file_path: path, size_bytes: a.file.size }))
    }

    // الدفعات
    await syncChildren('cohorts', 'course_id', [d.id], d.cohorts.map((c) => c.id))
    if (d.cohorts.length) {
      must(await supabase.from('cohorts').upsert(d.cohorts.map((c) => ({
        id: c.id, course_id: d.id, name_ar: c.name.ar, name_en: c.name.en,
        starts_on: c.startsOn, ends_on: c.endsOn || null, seats: c.seats, status: c.status,
      }))))
    }
  },

  async setPublished(id, published) {
    must(await supabase.from('courses').update({ is_published: published }).eq('id', id))
  },

  async deleteCourse(id) {
    must(await supabase.from('courses').delete().eq('id', id))
  },

  async listInstructors() {
    const rows = must(await supabase.from('profiles').select('id, full_name, email').eq('role', 'instructor').order('full_name')) as Row[]
    return rows.map((r) => ({ id: r.id, name: r.full_name || r.email }))
  },
}

export const courseAdminApi: CourseAdminApi = isSupabaseConfigured ? supabaseAdmin : demoAdmin
