import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, CheckCircle2, ChevronDown, Clock, ClipboardCheck, FileUp, Lock, PlayCircle, Radio, Users } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import type { CourseDetail as Course, EnrollmentStatus } from '../../courses/types'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate, levelStyle, toneClasses } from '../../components/home/CourseCard'
import { formatPrice, pick, useLang } from '../../lib/lang'
import { Placeholder } from '../Placeholder'
import { usePageMeta } from '../../lib/seo'
import { useVatOn } from '../../payments/useVat'

export function CourseDetail() {
  const { slug = '' } = useParams()
  const { session } = useAuth()
  const course = useAsync(() => coursesApi.getCourse(slug), [slug])
  const progress = useAsync(
    () => (session && course.data ? coursesApi.getProgress(course.data.id) : Promise.resolve(null)),
    [session, course.data?.id],
  )

  if (course.loading) return <Spinner />
  if (course.error) return <ErrorState onRetry={course.reload} />
  if (!course.data) return <Placeholder notFound />

  return <CourseView course={course.data} enrollment={progress.data?.enrollment ?? null} onEnrolled={progress.reload} />
}

function CourseView({ course, enrollment, onEnrolled }: { course: Course; enrollment: EnrollmentStatus | null; onEnrolled: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const lessons = course.modules.flatMap((m) => m.lessons)
  const totalMin = lessons.reduce((n, l) => n + (l.durationMin ?? 0), 0)
  const enrolled = enrollment === 'active' || enrollment === 'completed'
  usePageMeta(pick(course.title, lang), pick(course.summary, lang))

  return (
    <>
      {/* رأس الدورة */}
      <section className={`relative overflow-hidden bg-gradient-to-br text-white ${toneClasses[course.tone]}`}>
        <div className="contour-bg absolute inset-0 opacity-40 mix-blend-overlay" />
        <div className="relative mx-auto max-w-6xl px-4 py-12 lg:py-16">
          <nav className="text-sm text-white/70">
            <Link to="/courses" className="hover:text-white">{t('nav.courses')}</Link>
            <span className="mx-2">/</span>
            <span>{pick(course.title, lang)}</span>
          </nav>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${levelStyle[course.level]}`}>{t(`home.courses.level.${course.level}`)}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
              {course.format === 'live' ? <Radio className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
              {t(`home.courses.format.${course.format}`)}
            </span>
            {course.software.map((s) => (
              <span key={s} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold" dir="ltr">{s}</span>
            ))}
          </div>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-tight md:text-5xl">{pick(course.title, lang)}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">{pick(course.summary, lang)}</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/85">
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {t('home.courses.hours', { count: course.hours })}</span>
            <span className="inline-flex items-center gap-1.5"><PlayCircle className="h-4 w-4" /> {t('home.courses.lessons', { count: lessons.length })}</span>
            <span className="inline-flex items-center gap-1.5"><Award className="h-4 w-4" /> {t('courses.detail.certificateIncluded')}</span>
            <span>{t('courses.detail.by')} {pick(course.instructorName, lang)}</span>
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-12">
          {/* ماذا ستتعلم */}
          {course.outcomes[lang].length > 0 && (
            <section className="rounded-card border border-primary/10 bg-white p-6">
              <h2 className="text-xl font-bold text-primary">{t('courses.detail.outcomes')}</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.outcomes[lang].map((o) => (
                  <li key={o} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-secondary" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-xl font-bold text-primary">{t('courses.detail.about')}</h2>
            <p className="mt-3 leading-loose text-ink/85">{pick(course.description, lang)}</p>
          </section>

          {/* محتوى الدورة */}
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-xl font-bold text-primary">{t('courses.detail.curriculum')}</h2>
              <span className="text-sm text-muted">
                {t('courses.detail.modulesCount', { count: course.modules.length })} · {t('home.courses.lessons', { count: lessons.length })} ·{' '}
                {t('courses.detail.minutes', { count: totalMin })}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {course.modules.map((m, i) => (
                <details key={m.id} open={i === 0} className="group overflow-hidden rounded-2xl border border-primary/10 bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold">
                    <span className="flex items-center gap-3">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-50 text-sm text-primary">{i + 1}</span>
                      {pick(m.title, lang)}
                    </span>
                    <ChevronDown className="h-5 w-5 text-muted transition group-open:rotate-180" />
                  </summary>
                  <ul className="border-t border-primary/10">
                    {m.lessons.map((l) => {
                      const open = enrolled || l.isPreview
                      const row = (
                        <>
                          <span className="flex min-w-0 items-center gap-3">
                            {open ? <PlayCircle className="h-4 w-4 shrink-0 text-secondary" /> : <Lock className="h-4 w-4 shrink-0 text-muted" />}
                            <span className="truncate">{pick(l.title, lang)}</span>
                            {l.isPreview && !enrolled && (
                              <span className="shrink-0 rounded-full bg-secondary-100 px-2 py-0.5 text-[11px] font-semibold text-primary">{t('courses.detail.preview')}</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-muted">
                            {l.hasQuiz && <ClipboardCheck className="h-4 w-4" aria-label={t('courses.detail.hasQuiz')} />}
                            {l.hasAssignment && <FileUp className="h-4 w-4" aria-label={t('courses.detail.hasAssignment')} />}
                            {l.durationMin && <span className="text-xs">{t('courses.detail.minutes', { count: l.durationMin })}</span>}
                          </span>
                        </>
                      )
                      return (
                        <li key={l.id} className="border-b border-primary/5 last:border-0">
                          {open ? (
                            <Link to={`/app/learn/${course.slug}/${l.id}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-primary-50/50">
                              {row}
                            </Link>
                          ) : (
                            <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">{row}</div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </details>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-accent-100/60 p-4 text-sm">
              <Award className="h-5 w-5 shrink-0 text-accent" />
              {t('courses.detail.certificateRule', { score: course.passScore })}
            </p>
          </section>

          <section className="flex gap-4 rounded-card border border-primary/10 bg-white p-6">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary text-xl font-bold text-white">
              {pick(course.instructorName, lang).charAt(0)}
            </span>
            <div>
              <p className="text-sm text-muted">{t('courses.detail.instructor')}</p>
              <h3 className="text-lg font-bold">{pick(course.instructorName, lang)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{pick(course.instructorBio, lang)}</p>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <EnrollCard course={course} enrollment={enrollment} onEnrolled={onEnrolled} />
        </aside>
      </div>
    </>
  )
}

function EnrollCard({ course, enrollment, onEnrolled }: { course: Course; enrollment: EnrollmentStatus | null; onEnrolled: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const { session } = useAuth()
  const openCohorts = course.cohorts.filter((c) => c.status === 'open' && c.seatsLeft > 0)
  const [cohortId, setCohortId] = useState(openCohorts[0]?.id)
  const [busy, setBusy] = useState(false)
  const vatOn = useVatOn()
  const [error, setError] = useState<string | null>(null)
  const [waitlisted, setWaitlisted] = useState(false)
  const isLive = course.format === 'live'

  async function enroll() {
    setBusy(true)
    setError(null)
    try {
      const status = await coursesApi.enroll(course.id, isLive ? cohortId : undefined)
      onEnrolled()
      if (status === 'active') navigate(`/app/learn/${course.slug}`)
    } catch (e) {
      setError(String(e).includes('full') ? t('courses.enroll.full') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function waitlist() {
    setBusy(true)
    try {
      await coursesApi.joinWaitlist(course.id)
      setWaitlisted(true)
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  let action
  if (!session) {
    action = (
      <Link to={`/login?next=${encodeURIComponent(`/courses/${course.slug}`)}`} className="block rounded-full bg-primary py-3 text-center font-semibold text-white hover:bg-primary-700">
        {t('courses.enroll.loginToEnroll')}
      </Link>
    )
  } else if (enrollment === 'active' || enrollment === 'completed') {
    action = (
      <Link to={`/app/learn/${course.slug}`} className="block rounded-full bg-secondary py-3 text-center font-semibold text-white hover:brightness-95">
        {t(enrollment === 'completed' ? 'courses.enroll.review' : 'courses.enroll.continue')}
      </Link>
    )
  } else if (enrollment === 'pending_payment') {
    action = (
      <div className="space-y-2">
        <Alert tone="info">{t('courses.enroll.pendingPayment')}</Alert>
        <Link to={`/app/checkout/course/${course.id}`} className="block rounded-full bg-accent py-3 text-center font-semibold text-white hover:brightness-95">
          {t('payments.payNow')}
        </Link>
      </div>
    )
  } else if (isLive && openCohorts.length === 0) {
    action = waitlisted ? (
      <Alert tone="success">{t('courses.enroll.waitlisted')}</Alert>
    ) : (
      <Button variant="outline" className="w-full" loading={busy} onClick={waitlist}>{t('courses.enroll.joinWaitlist')}</Button>
    )
  } else {
    action = (
      <Button className="w-full" loading={busy} onClick={enroll}>
        {course.price === 0 ? t('courses.enroll.free') : t('courses.enroll.paid')}
      </Button>
    )
  }

  return (
    <div className="rounded-card border border-primary/10 bg-white p-6 shadow-xl shadow-primary/5">
      <p className={`text-3xl font-bold ${course.price === 0 ? 'text-secondary' : 'text-ink'}`}>{formatPrice(course.price, lang)}</p>
      {course.price > 0 && vatOn && <p className="mt-1 text-xs text-muted">{t('courses.enroll.vatNote')}</p>}

      {isLive && course.cohorts.length > 0 && (
        <fieldset className="mt-5 space-y-2">
          <legend className="mb-2 text-sm font-semibold">{t('courses.enroll.chooseCohort')}</legend>
          {course.cohorts.map((c) => {
            const available = c.status === 'open' && c.seatsLeft > 0
            return (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-sm ${
                  cohortId === c.id ? 'border-secondary bg-secondary-100/50' : 'border-primary/10'
                } ${available ? '' : 'cursor-not-allowed opacity-50'}`}
              >
                <span className="flex items-center gap-2">
                  <input type="radio" name="cohort" className="accent-primary" disabled={!available} checked={cohortId === c.id} onChange={() => setCohortId(c.id)} />
                  <span>
                    <span className="block font-semibold">{pick(c.name, lang)}</span>
                    <span className="block text-xs text-muted">{formatDate(c.startsOn, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  </span>
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${c.seatsLeft <= 5 ? 'text-red-600' : 'text-muted'}`}>
                  <Users className="h-3.5 w-3.5" />
                  {available ? t('courses.enroll.seatsLeft', { count: c.seatsLeft }) : t('courses.enroll.cohortFull')}
                </span>
              </label>
            )
          })}
        </fieldset>
      )}

      <div className="mt-5 space-y-3">
        {error && <Alert>{error}</Alert>}
        {action}
      </div>

      <ul className="mt-6 space-y-2 border-t border-primary/10 pt-5 text-sm text-muted">
        <li className="flex items-center gap-2"><Clock className="h-4 w-4" /> {t('home.courses.hours', { count: course.hours })}</li>
        <li className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4" /> {t('courses.detail.quizzesIncluded')}</li>
        <li className="flex items-center gap-2"><Award className="h-4 w-4" /> {t('courses.detail.certificateIncluded')}</li>
      </ul>
    </div>
  )
}
