import { isSupabaseConfigured } from '../lib/supabase'
import type {
  Certificate,
  CourseDetail,
  CourseSummary,
  EnrollmentStatus,
  LessonContent,
  MyCourse,
  Progress,
  QuizResult,
  Submission,
} from './types'
import { demoApi } from './demoApi'
import { supabaseApi } from './supabaseApi'

export interface CoursesApi {
  listCourses(): Promise<CourseSummary[]>
  getCourse(slug: string): Promise<CourseDetail | null>
  enroll(courseId: string, cohortId?: string): Promise<EnrollmentStatus>
  joinWaitlist(courseId: string): Promise<void>
  getProgress(courseId: string): Promise<Progress>
  getLesson(courseId: string, lessonId: string): Promise<LessonContent | null>
  setLessonComplete(courseId: string, lessonId: string, done: boolean): Promise<void>
  submitQuiz(lessonId: string, answers: (number | null)[]): Promise<QuizResult>
  submitAssignment(courseId: string, lessonId: string, file: File, note: string): Promise<Submission>
  claimCertificate(courseId: string): Promise<string>
  myCourses(): Promise<MyCourse[]>
  myCertificates(): Promise<Certificate[]>
  verifyCertificate(code: string): Promise<Certificate | null>
}

/** Supabase عند ربطه، وإلا بيانات المعاينة المحلية */
export const coursesApi: CoursesApi = isSupabaseConfigured ? supabaseApi : demoApi
export const isDemoData = !isSupabaseConfigured
