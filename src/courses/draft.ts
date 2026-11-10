import type { Localized } from '../lib/lang'
import type { Format, Level, Tone } from './types'

/** نسخة الدورة القابلة للتعديل في محرّر الإدارة */
export interface QuestionDraft {
  id: string
  kind: 'mcq' | 'true_false'
  prompt: Localized
  options: Localized[]
  correct: number
}

export interface AttachmentDraft {
  id: string
  name: string
  sizeBytes: number | null
  filePath?: string
  /** ملف جديد لم يُرفع بعد */
  file?: File
}

export interface LessonDraft {
  id: string
  title: Localized
  durationMin: number | null
  isPreview: boolean
  youtubeId: string | null
  body: Localized
  hasQuiz: boolean
  questions: QuestionDraft[]
  hasAssignment: boolean
  assignment: Localized
  attachments: AttachmentDraft[]
}

export interface ModuleDraft {
  id: string
  title: Localized
  lessons: LessonDraft[]
}

export interface CohortDraft {
  id: string
  name: Localized
  startsOn: string
  endsOn: string | null
  seats: number
  status: 'open' | 'full' | 'running' | 'finished'
}

export interface CourseDraft {
  id: string
  isNew: boolean
  slug: string
  title: Localized
  summary: Localized
  description: Localized
  outcomes: { ar: string[]; en: string[] }
  level: Level
  format: Format
  software: string[]
  price: number
  hours: number
  tone: Tone
  passScore: number
  instructorId: string | null
  instructorName: Localized
  instructorBio: Localized
  isFeatured: boolean
  isPublished: boolean
  modules: ModuleDraft[]
  cohorts: CohortDraft[]
}

export interface AdminCourseRow {
  id: string
  slug: string
  title: Localized
  format: Format
  level: Level
  price: number
  lessonsCount: number
  isPublished: boolean
  isFeatured: boolean
}

export const newId = () => crypto.randomUUID()
export const emptyL = (): Localized => ({ ar: '', en: '' })

export const trueFalseOptions = (): Localized[] => [
  { ar: 'صح', en: 'True' },
  { ar: 'خطأ', en: 'False' },
]

export function newQuestion(kind: 'mcq' | 'true_false' = 'mcq'): QuestionDraft {
  return {
    id: newId(),
    kind,
    prompt: emptyL(),
    options: kind === 'true_false' ? trueFalseOptions() : [emptyL(), emptyL(), emptyL()],
    correct: 0,
  }
}

export function newLesson(): LessonDraft {
  return {
    id: newId(),
    title: emptyL(),
    durationMin: null,
    isPreview: false,
    youtubeId: null,
    body: emptyL(),
    hasQuiz: false,
    questions: [],
    hasAssignment: false,
    assignment: emptyL(),
    attachments: [],
  }
}

export function newModule(): ModuleDraft {
  return { id: newId(), title: emptyL(), lessons: [newLesson()] }
}

export function newCohort(): CohortDraft {
  return { id: newId(), name: emptyL(), startsOn: '', endsOn: null, seats: 25, status: 'open' }
}

export function newCourse(): CourseDraft {
  return {
    id: newId(),
    isNew: true,
    slug: '',
    title: emptyL(),
    summary: emptyL(),
    description: emptyL(),
    outcomes: { ar: [], en: [] },
    level: 'beginner',
    format: 'recorded',
    software: [],
    price: 0,
    hours: 0,
    tone: 'primary',
    passScore: 70,
    instructorId: null,
    instructorName: { ar: 'فريق مقياس', en: 'Miqyas Team' },
    instructorBio: emptyL(),
    isFeatured: false,
    isPublished: false,
    modules: [newModule()],
    cohorts: [],
  }
}

/** يقبل رابط YouTube بأي صيغة أو المعرّف نفسه */
export function parseYoutubeId(input: string): string | null {
  const v = input.trim()
  if (!v) return null
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v
  const m = v.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type DraftIssue = { key: string; params?: Record<string, string | number> }

/** أخطاء تمنع الحفظ، وأخرى تمنع النشر فقط */
export function validateDraft(d: CourseDraft): { blocking: DraftIssue[]; publish: DraftIssue[] } {
  const blocking: DraftIssue[] = []
  const publish: DraftIssue[] = []
  const both = (l: Localized) => l.ar.trim() && l.en.trim()

  if (!both(d.title)) blocking.push({ key: 'editor.issues.title' })
  if (!SLUG_RE.test(d.slug)) blocking.push({ key: 'editor.issues.slug' })
  if (d.price < 0 || Number.isNaN(d.price)) blocking.push({ key: 'editor.issues.price' })
  if (d.passScore < 0 || d.passScore > 100) blocking.push({ key: 'editor.issues.passScore' })

  d.modules.forEach((m, mi) => {
    if (!both(m.title)) blocking.push({ key: 'editor.issues.moduleTitle', params: { n: mi + 1 } })
    m.lessons.forEach((l, li) => {
      const where = { n: `${mi + 1}.${li + 1}` }
      if (!both(l.title)) blocking.push({ key: 'editor.issues.lessonTitle', params: where })
      if (l.hasQuiz) {
        if (!l.questions.length) blocking.push({ key: 'editor.issues.noQuestions', params: where })
        l.questions.forEach((q, qi) => {
          const at = { n: `${mi + 1}.${li + 1}`, q: qi + 1 }
          if (!both(q.prompt)) blocking.push({ key: 'editor.issues.questionPrompt', params: at })
          if (q.options.length < 2 || q.options.some((o) => !both(o))) blocking.push({ key: 'editor.issues.questionOptions', params: at })
          if (q.correct < 0 || q.correct >= q.options.length) blocking.push({ key: 'editor.issues.questionCorrect', params: at })
        })
      }
      if (l.hasAssignment && !both(l.assignment)) blocking.push({ key: 'editor.issues.assignment', params: where })
    })
  })

  d.cohorts.forEach((c, ci) => {
    if (!both(c.name) || !c.startsOn || c.seats < 1) blocking.push({ key: 'editor.issues.cohort', params: { n: ci + 1 } })
  })

  const lessons = d.modules.flatMap((m) => m.lessons)
  if (!lessons.length) publish.push({ key: 'editor.issues.noLessons' })
  if (!both(d.summary)) publish.push({ key: 'editor.issues.summary' })
  if (d.format === 'live' && !d.cohorts.some((c) => c.status === 'open')) publish.push({ key: 'editor.issues.noCohort' })

  return { blocking, publish }
}
