import type { Localized } from '../lib/lang'

export type Level = 'beginner' | 'intermediate' | 'advanced'
export type Format = 'recorded' | 'live'
export type Tone = 'primary' | 'secondary' | 'accent' | 'ink'
export type EnrollmentStatus = 'pending_payment' | 'active' | 'completed' | 'cancelled'
export type SubmissionStatus = 'submitted' | 'approved' | 'needs_revision' | 'rejected'

export interface CourseSummary {
  id: string
  slug: string
  title: Localized
  summary: Localized
  software: string[]
  level: Level
  format: Format
  hours: number
  lessonsCount: number
  price: number
  instructorName: Localized
  tone: Tone
  isFeatured: boolean
  /** أقرب دفعة مفتوحة (للدورات المباشرة) */
  nextCohortStart?: string
}

export interface LessonOutline {
  id: string
  title: Localized
  durationMin: number | null
  isPreview: boolean
  hasQuiz: boolean
  hasAssignment: boolean
}

export interface ModuleOutline {
  id: string
  title: Localized
  lessons: LessonOutline[]
}

export interface Cohort {
  id: string
  name: Localized
  startsOn: string
  endsOn: string | null
  seats: number
  seatsLeft: number
  status: 'open' | 'full' | 'running' | 'finished'
}

export interface CourseDetail extends CourseSummary {
  description: Localized
  outcomes: { ar: string[]; en: string[] }
  instructorBio: Localized
  passScore: number
  modules: ModuleOutline[]
  cohorts: Cohort[]
}

export interface QuizQuestion {
  id: string
  kind: 'mcq' | 'true_false'
  prompt: Localized
  options: Localized[]
}

export interface Attachment {
  id: string
  name: string
  url: string
  sizeBytes: number | null
}

export interface Submission {
  id: string
  fileName: string
  status: SubmissionStatus
  grade: number | null
  feedback: string | null
  createdAt: string
}

export interface LessonContent {
  lesson: LessonOutline
  youtubeId: string | null
  body: Localized
  assignment: Localized | null
  attachments: Attachment[]
  questions: QuizQuestion[]
  bestScore: number | null
  quizPassed: boolean
  submission: Submission | null
}

export interface Progress {
  enrollment: EnrollmentStatus | null
  completedLessonIds: string[]
  passedQuizLessonIds: string[]
  approvedAssignmentLessonIds: string[]
  lessonsTotal: number
  quizzesTotal: number
  assignmentsTotal: number
  certificateCode: string | null
}

export interface QuizResult {
  score: number
  passed: boolean
  results: boolean[]
  passScore: number
}

export interface Certificate {
  code: string
  fullName: string
  courseTitle: Localized
  hours: number | null
  issuedAt: string
  courseSlug?: string
}

export interface MyCourse {
  course: CourseSummary
  status: EnrollmentStatus
  percent: number
}

export function progressPercent(p: Progress): number {
  const total = p.lessonsTotal + p.quizzesTotal + p.assignmentsTotal
  if (!total) return 0
  const done =
    p.completedLessonIds.length + p.passedQuizLessonIds.length + p.approvedAssignmentLessonIds.length
  return Math.min(100, Math.round((100 * done) / total))
}

export function canClaimCertificate(p: Progress): boolean {
  return (
    p.lessonsTotal > 0 &&
    p.completedLessonIds.length >= p.lessonsTotal &&
    p.passedQuizLessonIds.length >= p.quizzesTotal &&
    p.approvedAssignmentLessonIds.length >= p.assignmentsTotal
  )
}
