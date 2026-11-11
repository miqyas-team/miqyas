import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, BookOpen } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import { CourseCard, formatDate } from '../../components/home/CourseCard'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'

function Empty({ icon, text, cta }: { icon: ReactNode; text: string; cta: string }) {
  return (
    <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center">
      <div className="mx-auto w-fit text-secondary-700">{icon}</div>
      <p className="mt-3 text-muted">{text}</p>
      <Link to="/courses" className="mt-5 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white">{cta}</Link>
    </div>
  )
}

export function MyCourses() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => coursesApi.myCourses(), [])

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">{t('myCourses.title')}</h1>
      <div className="mt-8">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : !data?.length ? (
          <Empty icon={<BookOpen className="h-10 w-10" />} text={t('myCourses.empty')} cta={t('hero.browseCourses')} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((m) => (
              <div key={m.course.id} className="relative">
                {m.status === 'pending_payment' && (
                  <span className="absolute start-3 top-3 z-10 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">{t('myCourses.pending')}</span>
                )}
                {m.status === 'completed' && (
                  <span className="absolute start-3 top-3 z-10 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-white">{t('myCourses.completed')}</span>
                )}
                <CourseCard course={m.course} progress={m.status === 'pending_payment' ? undefined : m.percent} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

export function MyCertificates() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => coursesApi.myCertificates(), [])

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">{t('certificates.title')}</h1>
      <div className="mt-8">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : !data?.length ? (
          <Empty icon={<Award className="h-10 w-10" />} text={t('certificates.empty')} cta={t('hero.browseCourses')} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {data.map((c) => (
              <li key={c.code} className="flex items-center gap-4 rounded-card border border-primary/10 bg-white p-5">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-100 text-accent">
                  <Award className="h-7 w-7" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{pick(c.courseTitle, lang)}</p>
                  <p className="text-sm text-muted">{formatDate(c.issuedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="font-mono text-xs text-muted" dir="ltr">{c.code}</p>
                </div>
                <Link to={`/certificates/${c.code}`} className="shrink-0 rounded-full border border-primary/20 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-50">
                  {t('certificates.open')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
