import { supabase } from '../lib/supabase'
import type { CoursesApi } from './api'
import type {
  Certificate,
  Cohort,
  CourseDetail,
  CourseSummary,
  LessonOutline,
  MyCourse,
  Progress,
  Submission,
  Tone,
} from './types'
import { progressPercent } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>

const L = (r: Row, key: string) => ({ ar: (r[`${key}_ar`] ?? '') as string, en: (r[`${key}_en`] ?? '') as string })

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const COURSE_COLUMNS =
  'id, slug, title_ar, title_en, summary_ar, summary_en, software, level, format, hours, price, tone, is_featured, instructor_name_ar, instructor_name_en, lessons(count), cohorts(starts_on, status)'

function toSummary(r: Row): CourseSummary {
  const open = ((r.cohorts ?? []) as Row[])
    .filter((c) => c.status === 'open')
    .map((c) => c.starts_on as string)
    .sort()
  return {
    id: r.id,
    slug: r.slug,
    title: L(r, 'title'),
    summary: L(r, 'summary'),
    software: r.software ?? [],
    level: r.level,
    format: r.format,
    hours: Number(r.hours ?? 0),
    lessonsCount: r.lessons?.[0]?.count ?? 0,
    price: Number(r.price),
    instructorName: L(r, 'instructor_name'),
    tone: (r.tone ?? 'primary') as Tone,
    isFeatured: r.is_featured,
    nextCohortStart: open[0],
  }
}

const toLesson = (l: Row): LessonOutline => ({
  id: l.id,
  title: L(l, 'title'),
  durationMin: l.duration_min,
  isPreview: l.is_preview,
  hasQuiz: l.has_quiz,
  hasAssignment: l.has_assignment,
})

const toSubmission = (s: Row): Submission => ({
  id: s.id,
  fileName: s.file_name,
  status: s.status,
  grade: s.grade,
  feedback: s.feedback,
  createdAt: s.created_at,
})

const toCertificate = (c: Row): Certificate => ({
  code: c.code,
  fullName: c.full_name,
  courseTitle: L(c, 'course_title'),
  hours: c.hours,
  issuedAt: c.issued_at,
  courseSlug: c.courses?.slug,
})

async function uid() {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('not authenticated')
  return data.user.id
}

export const supabaseApi: CoursesApi = {
  async listCourses() {
    const rows = must(await supabase.from('courses').select(COURSE_COLUMNS).eq('is_published', true).order('created_at'))
    return (rows as Row[]).map(toSummary)
  },

  async getCourse(slug) {
    const r = must(
      await supabase
        .from('courses')
        .select(
          `${COURSE_COLUMNS}, description_ar, description_en, outcomes_ar, outcomes_en, instructor_bio_ar, instructor_bio_en, pass_score,
           modules(id, title_ar, title_en, position, lessons(id, title_ar, title_en, duration_min, position, is_preview, has_quiz, has_assignment)),
           cohort_rows:cohorts(id, name_ar, name_en, starts_on, ends_on, seats, status)`,
        )
        .eq('slug', slug)
        .maybeSingle(),
    ) as Row | null
    if (!r) return null

    const avail = must(await supabase.rpc('cohort_availability', { p_course: r.id })) as Row[]
    const left = new Map(avail.map((a) => [a.cohort_id, a.seats_left as number]))
    const cohorts: Cohort[] = ((r.cohort_rows ?? []) as Row[])
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
      .map((c) => ({
        id: c.id,
        name: L(c, 'name'),
        startsOn: c.starts_on,
        endsOn: c.ends_on,
        seats: c.seats,
        seatsLeft: left.get(c.id) ?? 0,
        status: c.status,
      }))

    const detail: CourseDetail = {
      ...toSummary(r),
      description: L(r, 'description'),
      outcomes: { ar: r.outcomes_ar ?? [], en: r.outcomes_en ?? [] },
      instructorBio: L(r, 'instructor_bio'),
      passScore: r.pass_score,
      cohorts,
      modules: ((r.modules ?? []) as Row[])
        .sort((a, b) => a.position - b.position)
        .map((m) => ({
          id: m.id,
          title: L(m, 'title'),
          lessons: ((m.lessons ?? []) as Row[]).sort((a, b) => a.position - b.position).map(toLesson),
        })),
    }
    detail.lessonsCount = detail.modules.reduce((n, m) => n + m.lessons.length, 0)
    return detail
  },

  async enroll(courseId, cohortId) {
    return must(await supabase.rpc('enroll', { p_course: courseId, p_cohort: cohortId ?? null })) as any
  },

  async joinWaitlist(courseId) {
    must(await supabase.from('waitlist').upsert({ user_id: await uid(), course_id: courseId }))
  },

  async getProgress(courseId): Promise<Progress> {
    const user = await uid()
    const [enr, req, done, quizzes, subs, cert, lessons] = await Promise.all([
      supabase.from('enrollments').select('status').eq('course_id', courseId).eq('user_id', user).maybeSingle(),
      supabase.rpc('course_requirements', { p_course: courseId }),
      supabase.from('lesson_progress').select('lesson_id').eq('course_id', courseId).eq('user_id', user),
      supabase.from('quiz_attempts').select('lesson_id').eq('user_id', user).eq('passed', true),
      supabase.from('assignment_submissions').select('lesson_id').eq('course_id', courseId).eq('user_id', user).eq('status', 'approved'),
      supabase.from('certificates').select('code').eq('course_id', courseId).eq('user_id', user).maybeSingle(),
      supabase.from('lessons').select('id').eq('course_id', courseId),
    ])
    const courseLessons = new Set(((lessons.data ?? []) as Row[]).map((l) => l.id))
    const r = (req.data ?? {}) as Row
    return {
      enrollment: (enr.data as Row | null)?.status ?? null,
      completedLessonIds: ((done.data ?? []) as Row[]).map((d) => d.lesson_id),
      passedQuizLessonIds: [...new Set(((quizzes.data ?? []) as Row[]).map((q) => q.lesson_id as string))].filter((id) => courseLessons.has(id)),
      approvedAssignmentLessonIds: [...new Set(((subs.data ?? []) as Row[]).map((s) => s.lesson_id as string))],
      lessonsTotal: r.lessons_total ?? courseLessons.size,
      quizzesTotal: r.quizzes_total ?? 0,
      assignmentsTotal: r.assignments_total ?? 0,
      certificateCode: (cert.data as Row | null)?.code ?? null,
    }
  },

  async getLesson(courseId, lessonId) {
    const user = await uid()
    const [lesson, content, atts, qs, attempts, sub] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).eq('course_id', courseId).maybeSingle(),
      supabase.from('lesson_content').select('*').eq('lesson_id', lessonId).maybeSingle(),
      supabase.from('lesson_attachments').select('*').eq('lesson_id', lessonId),
      supabase.from('quiz_questions').select('*').eq('lesson_id', lessonId).order('position'),
      supabase.from('quiz_attempts').select('score, passed').eq('lesson_id', lessonId).eq('user_id', user),
      supabase.from('assignment_submissions').select('*').eq('lesson_id', lessonId).eq('user_id', user).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    const l = lesson.data as Row | null
    const c = content.data as Row | null
    if (!l || !c) return null // غير مشترك أو الدرس غير موجود

    const attachments = await Promise.all(
      ((atts.data ?? []) as Row[]).map(async (a) => {
        const { data } = await supabase.storage.from('course-files').createSignedUrl(a.file_path, 3600)
        return { id: a.id, name: a.name, url: data?.signedUrl ?? '#', sizeBytes: a.size_bytes }
      }),
    )
    const tries = (attempts.data ?? []) as Row[]
    return {
      lesson: toLesson(l),
      youtubeId: c.youtube_id,
      body: L(c, 'body'),
      assignment: l.has_assignment ? L(c, 'assignment') : null,
      attachments,
      questions: ((qs.data ?? []) as Row[]).map((q) => ({ id: q.id, kind: q.kind, prompt: L(q, 'prompt'), options: q.options })),
      bestScore: tries.length ? Math.max(...tries.map((t) => t.score)) : null,
      quizPassed: tries.some((t) => t.passed),
      submission: sub.data ? toSubmission(sub.data as Row) : null,
    }
  },

  async setLessonComplete(courseId, lessonId, done) {
    const user = await uid()
    if (done) must(await supabase.from('lesson_progress').upsert({ user_id: user, lesson_id: lessonId, course_id: courseId }))
    else must(await supabase.from('lesson_progress').delete().eq('user_id', user).eq('lesson_id', lessonId))
  },

  async submitQuiz(lessonId, answers) {
    const r = must(await supabase.rpc('submit_quiz', { p_lesson: lessonId, p_answers: answers })) as Row
    return { score: r.score, passed: r.passed, results: r.results, passScore: r.pass_score }
  },

  async submitAssignment(courseId, lessonId, file, note) {
    const user = await uid()
    const safeName = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `${user}/${lessonId}/${Date.now()}-${safeName}`
    must(await supabase.storage.from('submissions').upload(path, file))
    const row = must(
      await supabase
        .from('assignment_submissions')
        .insert({ user_id: user, lesson_id: lessonId, course_id: courseId, file_path: path, file_name: file.name, note: note || null })
        .select()
        .single(),
    )
    return toSubmission(row as Row)
  },

  async claimCertificate(courseId) {
    return must(await supabase.rpc('claim_certificate', { p_course: courseId })) as string
  },

  async myCourses() {
    const user = await uid()
    const rows = must(
      await supabase.from('enrollments').select(`status, course:courses(${COURSE_COLUMNS})`).eq('user_id', user).neq('status', 'cancelled'),
    ) as Row[]
    return Promise.all(
      rows.map(async (r): Promise<MyCourse> => {
        const course = toSummary(r.course)
        const progress = r.status === 'pending_payment' ? null : await supabaseApi.getProgress(course.id)
        return { course, status: r.status, percent: progress ? progressPercent(progress) : 0 }
      }),
    )
  },

  async myCertificates() {
    const user = await uid()
    const rows = must(await supabase.from('certificates').select('*, courses(slug)').eq('user_id', user).order('issued_at', { ascending: false }))
    return (rows as Row[]).map(toCertificate)
  },

  async verifyCertificate(code) {
    const rows = must(await supabase.rpc('verify_certificate', { p_code: code })) as Row[]
    return rows[0] ? toCertificate({ ...rows[0], code: code.trim().toUpperCase() }) : null
  },
}
