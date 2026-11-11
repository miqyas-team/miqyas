import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Award, CheckCircle2, Circle, ClipboardCheck, FileUp, ListTree, X } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import { canClaimCertificate, progressPercent, type CourseDetail, type Progress } from '../../courses/types'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { Placeholder } from '../Placeholder'
import { Assignment, Attachments, Quiz, VideoPlayer } from './LessonTools'

export function Learn() {
  const { slug = '', lessonId } = useParams()
  const course = useAsync(() => coursesApi.getCourse(slug), [slug])
  const progress = useAsync(
    () => (course.data ? coursesApi.getProgress(course.data.id) : Promise.resolve(null)),
    [course.data?.id],
  )

  if (course.loading || (course.data && progress.loading && !progress.data)) return <Spinner />
  if (course.error || progress.error) return <ErrorState onRetry={() => { course.reload(); progress.reload() }} />
  if (!course.data || !progress.data) return <Placeholder notFound />

  const c = course.data
  const p = progress.data
  const lessons = c.modules.flatMap((m) => m.lessons)
  const enrolled = p.enrollment === 'active' || p.enrollment === 'completed'
  const current = lessons.find((l) => l.id === lessonId)

  // بدون درس محدد: أول درس غير مكتمل
  if (!current) {
    const target = (enrolled ? lessons.find((l) => !p.completedLessonIds.includes(l.id)) : lessons.find((l) => l.isPreview)) ?? lessons[0]
    if (!target || (!enrolled && !target.isPreview)) return <Navigate to={`/courses/${slug}`} replace />
    return <Navigate to={`/app/learn/${slug}/${target.id}`} replace />
  }
  if (!enrolled && !current.isPreview) return <Navigate to={`/courses/${slug}`} replace />

  return <LearnView course={c} progress={p} lessonId={current.id} enrolled={enrolled} onChange={progress.reload} />
}

function LearnView({
  course,
  progress,
  lessonId,
  enrolled,
  onChange,
}: {
  course: CourseDetail
  progress: Progress
  lessonId: string
  enrolled: boolean
  onChange: () => void
}) {
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const content = useAsync(() => coursesApi.getLesson(course.id, lessonId), [course.id, lessonId])

  const lessons = course.modules.flatMap((m) => m.lessons)
  const index = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[index]
  const prev = lessons[index - 1]
  const next = lessons[index + 1]
  const done = progress.completedLessonIds.includes(lessonId)
  const percent = progressPercent(progress)
  const claimable = canClaimCertificate(progress)

  async function toggleDone() {
    setBusy(true)
    try {
      await coursesApi.setLessonComplete(course.id, lessonId, !done)
      onChange()
      if (!done && next) navigate(`/app/learn/${course.slug}/${next.id}`)
    } finally {
      setBusy(false)
    }
  }

  async function claim() {
    setBusy(true)
    setClaimError(null)
    try {
      const code = await coursesApi.claimCertificate(course.id)
      navigate(`/certificates/${code}`)
    } catch {
      setClaimError(t('learn.claimError'))
    } finally {
      setBusy(false)
    }
  }

  const outline = (
    <nav aria-label={t('learn.outline')} className="space-y-5">
      {course.modules.map((m) => (
        <div key={m.id}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{pick(m.title, lang)}</p>
          <ul className="space-y-1">
            {m.lessons.map((l) => {
              const isDone = progress.completedLessonIds.includes(l.id)
              const locked = !enrolled && !l.isPreview
              const active = l.id === lessonId
              return (
                <li key={l.id}>
                  {locked ? (
                    <span className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted/70">
                      <Circle className="h-4 w-4 shrink-0" />
                      <span className="truncate">{pick(l.title, lang)}</span>
                    </span>
                  ) : (
                    <Link
                      to={`/app/learn/${course.slug}/${l.id}`}
                      onClick={() => setOutlineOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
                        active ? 'bg-primary text-white' : 'hover:bg-primary-50'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-secondary-700'}`} />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 opacity-50" />
                      )}
                      <span className="flex-1 truncate">{pick(l.title, lang)}</span>
                      {l.hasQuiz && (
                        <ClipboardCheck className={`h-3.5 w-3.5 shrink-0 ${progress.passedQuizLessonIds.includes(l.id) ? 'text-secondary-700' : 'opacity-50'}`} />
                      )}
                      {l.hasAssignment && (
                        <FileUp className={`h-3.5 w-3.5 shrink-0 ${progress.approvedAssignmentLessonIds.includes(l.id) ? 'text-secondary-700' : 'opacity-50'}`} />
                      )}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* شريط الدورة والتقدّم */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-primary/10 bg-white px-5 py-4">
        <div className="min-w-0">
          <Link to={`/courses/${course.slug}`} className="text-xs text-muted hover:text-primary">{t('learn.backToCourse')}</Link>
          <p className="truncate font-bold text-primary">{pick(course.title, lang)}</p>
        </div>
        {enrolled && (
          <div className="flex min-w-[12rem] flex-1 items-center gap-3 sm:max-w-xs">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('courses.progress')}>
              <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-sm font-bold text-primary">{percent}%</span>
          </div>
        )}
        <button type="button" onClick={() => setOutlineOpen(true)} className="inline-flex items-center gap-2 rounded-full border border-primary/15 px-3 py-1.5 text-sm font-medium lg:hidden">
          <ListTree className="h-4 w-4" /> {t('learn.outline')}
        </button>
      </div>

      {/* الشهادة */}
      {enrolled && (claimable || progress.certificateCode) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-card bg-gradient-to-br from-primary to-primary-700 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <Award className="h-10 w-10 text-accent" />
            <div>
              <p className="font-bold">{t('learn.completeTitle')}</p>
              <p className="text-sm text-white/75">{t('learn.completeText')}</p>
            </div>
          </div>
          {progress.certificateCode ? (
            <Link to={`/certificates/${progress.certificateCode}`} className="rounded-full bg-white px-5 py-2.5 font-semibold text-primary">
              {t('learn.viewCertificate')}
            </Link>
          ) : (
            <Button variant="outline" className="border-white/40 bg-white text-primary" loading={busy} onClick={claim}>
              {t('learn.claimCertificate')}
            </Button>
          )}
          {claimError && <div className="w-full"><Alert>{claimError}</Alert></div>}
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-card border border-primary/10 bg-white p-4">{outline}</div>
        </aside>

        {outlineOpen && (
          <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onClick={() => setOutlineOpen(false)}>
            <div className="absolute inset-y-0 start-0 w-80 max-w-[85%] overflow-y-auto bg-white p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <p className="font-bold">{t('learn.outline')}</p>
                <button type="button" onClick={() => setOutlineOpen(false)} aria-label={t('common.close')}><X className="h-5 w-5" /></button>
              </div>
              {outline}
            </div>
          </div>
        )}

        <main className="min-w-0 space-y-6">
          {/* عند إعادة التحميل لنفس الدرس نُبقي المحتوى ظاهراً كي لا تضيع نتيجة الاختبار */}
          {content.loading && content.data?.lesson.id !== lessonId ? (
            <Spinner />
          ) : !content.data ? (
            <ErrorState onRetry={content.reload} />
          ) : (
            <>
              <VideoPlayer youtubeId={content.data.youtubeId} title={pick(lesson.title, lang)} />
              <div>
                <p className="text-sm text-muted">{t('learn.lessonOf', { n: index + 1, total: lessons.length })}</p>
                <h1 className="mt-1 text-2xl font-bold">{pick(lesson.title, lang)}</h1>
                <p className="mt-4 leading-loose text-ink/85">{pick(content.data.body, lang)}</p>
              </div>
              <Attachments items={content.data.attachments} />
              {enrolled && lesson.hasQuiz && content.data.questions.length > 0 && (
                <Quiz key={lessonId} content={content.data} onDone={() => { onChange(); content.reload() }} />
              )}
              {enrolled && lesson.hasAssignment && (
                <Assignment key={lessonId} courseId={course.id} content={content.data} onDone={onChange} />
              )}
              {!enrolled && (
                <Alert tone="info">
                  {t('learn.previewNote')}{' '}
                  <Link to={`/courses/${course.slug}`} className="font-semibold text-primary underline">{t('learn.enrollNow')}</Link>
                </Alert>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/10 pt-6">
                {prev ? (
                  <Link to={`/app/learn/${course.slug}/${prev.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    <ArrowRight className="h-4 w-4 ltr:-scale-x-100" /> {t('learn.prev')}
                  </Link>
                ) : <span />}
                {enrolled && (
                  <Button variant={done ? 'outline' : 'primary'} loading={busy} onClick={toggleDone}>
                    {done ? t('learn.markUndone') : next ? t('learn.markDoneNext') : t('learn.markDone')}
                  </Button>
                )}
                {next && (enrolled || next.isPreview) ? (
                  <Link to={`/app/learn/${course.slug}/${next.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {t('learn.next')} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </Link>
                ) : <span />}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
