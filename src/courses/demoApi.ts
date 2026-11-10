import type { CoursesApi } from './api'
import { draftToDetail, loadDrafts } from './demoCatalog'
import type { CourseDraft, LessonDraft } from './draft'
import type { Certificate, CourseDetail, EnrollmentStatus, Progress, Submission } from './types'
import { canClaimCertificate, progressPercent } from './types'

/** حالة المتدرب التجريبي محفوظة في المتصفح */
interface DemoState {
  enrollments: Record<string, { status: EnrollmentStatus; cohortId?: string }>
  completed: string[]
  quizBest: Record<string, number>
  submissions: Record<string, Submission>
  certificates: Record<string, Certificate>
  waitlist: string[]
}

const KEY = 'miqyas-demo-courses'
export const DEMO_NAME = 'متدرب تجريبي'

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DemoState
  } catch {
    /* تجاهل */
  }
  return { enrollments: {}, completed: [], quizBest: {}, submissions: {}, certificates: {}, waitlist: [] }
}

function save(s: DemoState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* تجاهل */
  }
}

const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))

const published = () => loadDrafts().filter((d) => d.isPublished)
const draftById = (id: string) => loadDrafts().find((d) => d.id === id)
const detailById = (id: string) => {
  const d = draftById(id)
  return d ? draftToDetail(d) : undefined
}
const lessonsOf = (c: CourseDetail) => c.modules.flatMap((m) => m.lessons)
const findLessonDraft = (lessonId: string): { course: CourseDraft; lesson: LessonDraft } | null => {
  for (const course of loadDrafts()) {
    for (const m of course.modules) {
      const lesson = m.lessons.find((l) => l.id === lessonId)
      if (lesson) return { course, lesson }
    }
  }
  return null
}

function progressFor(c: CourseDetail, s: DemoState): Progress {
  const lessons = lessonsOf(c)
  const ids = new Set(lessons.map((l) => l.id))
  return {
    enrollment: s.enrollments[c.id]?.status ?? null,
    completedLessonIds: s.completed.filter((id) => ids.has(id)),
    passedQuizLessonIds: lessons.filter((l) => l.hasQuiz && (s.quizBest[l.id] ?? -1) >= c.passScore).map((l) => l.id),
    approvedAssignmentLessonIds: lessons.filter((l) => l.hasAssignment && s.submissions[l.id]?.status === 'approved').map((l) => l.id),
    lessonsTotal: lessons.length,
    quizzesTotal: lessons.filter((l) => l.hasQuiz).length,
    assignmentsTotal: lessons.filter((l) => l.hasAssignment).length,
    certificateCode: s.certificates[c.id]?.code ?? null,
  }
}

const isActive = (s: DemoState, courseId: string) =>
  ['active', 'completed'].includes(s.enrollments[courseId]?.status ?? '')

export const demoApi: CoursesApi = {
  listCourses: () => delay(published().map(draftToDetail)),

  getCourse: (slug) => {
    const d = published().find((c) => c.slug === slug)
    return delay(d ? draftToDetail(d) : null)
  },

  async enroll(courseId, cohortId) {
    const c = detailById(courseId)
    if (!c) throw new Error('course not found')
    if (c.format === 'live') {
      const cohort = c.cohorts.find((x) => x.id === cohortId)
      if (!cohort || cohort.status !== 'open' || cohort.seatsLeft <= 0) throw new Error('cohort full')
    }
    const s = load()
    const status: EnrollmentStatus = c.price === 0 ? 'active' : 'pending_payment'
    s.enrollments[courseId] ??= { status, cohortId }
    s.waitlist = s.waitlist.filter((id) => id !== courseId)
    save(s)
    return delay(s.enrollments[courseId].status)
  },

  async joinWaitlist(courseId) {
    const s = load()
    if (!s.waitlist.includes(courseId)) s.waitlist.push(courseId)
    save(s)
    await delay(null)
  },

  async getProgress(courseId) {
    const c = detailById(courseId)
    if (!c) throw new Error('course not found')
    return delay(progressFor(c, load()))
  },

  async getLesson(courseId, lessonId) {
    const found = findLessonDraft(lessonId)
    if (!found || found.course.id !== courseId) return null
    const { course, lesson } = found
    const s = load()
    if (!lesson.isPreview && !isActive(s, courseId)) return null
    return delay({
      lesson: { id: lesson.id, title: lesson.title, durationMin: lesson.durationMin, isPreview: lesson.isPreview, hasQuiz: lesson.hasQuiz, hasAssignment: lesson.hasAssignment },
      youtubeId: lesson.youtubeId,
      body: lesson.body.ar || lesson.body.en ? lesson.body : { ar: 'محتوى هذا الدرس يُضاف لاحقاً.', en: 'Lesson content will be added later.' },
      assignment: lesson.hasAssignment ? lesson.assignment : null,
      attachments: lesson.attachments.map((a) => ({ id: a.id, name: a.name, url: '#', sizeBytes: a.sizeBytes })),
      questions: lesson.hasQuiz ? lesson.questions.map(({ correct: _c, ...q }) => q) : [],
      bestScore: s.quizBest[lessonId] ?? null,
      quizPassed: (s.quizBest[lessonId] ?? -1) >= course.passScore,
      submission: s.submissions[lessonId] ?? null,
    })
  },

  async setLessonComplete(courseId, lessonId, done) {
    const s = load()
    if (!isActive(s, courseId)) throw new Error('not enrolled')
    s.completed = s.completed.filter((id) => id !== lessonId)
    if (done) s.completed.push(lessonId)
    save(s)
    await delay(null)
  },

  async submitQuiz(lessonId, answers) {
    const found = findLessonDraft(lessonId)
    const questions = found?.lesson.questions ?? []
    if (!found || !questions.length) throw new Error('quiz not found')
    const results = questions.map((q, i) => answers[i] === q.correct)
    const score = Math.round((100 * results.filter(Boolean).length) / questions.length)
    const s = load()
    s.quizBest[lessonId] = Math.max(s.quizBest[lessonId] ?? 0, score)
    save(s)
    const pass = found.course.passScore
    return delay({ score, passed: score >= pass, results, passScore: pass })
  },

  async submitAssignment(_courseId, lessonId, file) {
    const s = load()
    // في وضع المعاينة يُقبل التمرين تلقائياً لتجربة مسار الشهادة كاملاً
    const sub: Submission = {
      id: `sub-${Date.now()}`,
      fileName: file.name,
      status: 'approved',
      grade: 90,
      feedback: 'قُبل تلقائياً في وضع المعاينة.',
      createdAt: new Date().toISOString(),
    }
    s.submissions[lessonId] = sub
    save(s)
    return delay(sub)
  },

  async claimCertificate(courseId) {
    const c = detailById(courseId)
    if (!c) throw new Error('course not found')
    const s = load()
    if (s.certificates[courseId]) return s.certificates[courseId].code
    if (!canClaimCertificate(progressFor(c, s))) throw new Error('requirements not met')
    const code = Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-6).toUpperCase()
    s.certificates[courseId] = {
      code,
      fullName: DEMO_NAME,
      courseTitle: c.title,
      hours: c.hours,
      issuedAt: new Date().toISOString(),
      courseSlug: c.slug,
    }
    s.enrollments[courseId] = { ...s.enrollments[courseId], status: 'completed' }
    save(s)
    return delay(code)
  },

  async myCourses() {
    const s = load()
    return delay(
      Object.entries(s.enrollments)
        .map(([id, e]) => {
          const c = detailById(id)
          return c ? { course: c, status: e.status, percent: progressPercent(progressFor(c, s)) } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    )
  },

  myCertificates: async () => delay(Object.values(load().certificates)),

  async verifyCertificate(code) {
    const target = code.trim().toUpperCase()
    return delay(Object.values(load().certificates).find((c) => c.code === target) ?? null)
  },
}
