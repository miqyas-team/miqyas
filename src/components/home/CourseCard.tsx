import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Clock, PlayCircle, Radio } from 'lucide-react'
import type { CourseSummary } from '../../courses/types'
import { formatPrice, pick, useLang } from '../../lib/lang'

export const toneClasses = {
  primary: 'from-primary to-primary-700',
  secondary: 'from-secondary to-primary',
  accent: 'from-accent to-[#a8762f]',
  ink: 'from-ink to-primary-700',
}

export const levelStyle = {
  beginner: 'bg-secondary-100 text-primary',
  intermediate: 'bg-accent-100 text-accent-700',
  advanced: 'bg-primary-50 text-primary',
}

export function formatDate(iso: string, lang: 'ar' | 'en', opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', opts).format(new Date(iso))
}

export function CourseCard({ course, progress }: { course: CourseSummary; progress?: number }) {
  const { t } = useTranslation()
  const lang = useLang()

  return (
    <Link
      to={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-primary/10 bg-white transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/10"
    >
      <div className={`relative h-40 overflow-hidden bg-gradient-to-br text-white ${toneClasses[course.tone]}`}>
        <div className="contour-bg absolute inset-0 opacity-60 mix-blend-overlay" />
        <span className="absolute bottom-4 start-5 text-3xl font-bold tracking-tight" dir="ltr">
          {course.software[0]}
        </span>
        <span className="absolute end-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink">
          {course.format === 'live' ? <Radio className="h-3.5 w-3.5 text-red-500" /> : <PlayCircle className="h-3.5 w-3.5 text-primary" />}
          {t(`home.courses.format.${course.format}`)}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${levelStyle[course.level]}`}>
          {t(`home.courses.level.${course.level}`)}
        </span>
        <h3 className="mt-3 text-lg font-bold leading-snug group-hover:text-primary">{pick(course.title, lang)}</h3>
        <p className="mt-1 text-sm text-muted">{pick(course.instructorName, lang)}</p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4" /> {t('home.courses.hours', { count: course.hours })}
          </span>
          <span>{t(course.format === 'live' ? 'home.courses.sessions' : 'home.courses.lessons', { count: course.lessonsCount })}</span>
        </div>
        {course.nextCohortStart && (
          <p className="mt-2 text-sm font-medium text-red-600">
            {t('home.courses.startsAt', { date: formatDate(course.nextCohortStart, lang) })}
          </p>
        )}

        {progress !== undefined ? (
          <div className="mt-auto pt-4">
            <div className="flex justify-between text-xs font-medium text-muted">
              <span>{t('courses.progress')}</span>
              <span className="text-primary">{progress}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary-100">
              <div className="h-full rounded-full bg-secondary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-auto flex items-center justify-between border-t border-primary/10 pt-4">
            <span className={`text-lg font-bold ${course.price === 0 ? 'text-secondary-700' : 'text-ink'}`}>
              {formatPrice(course.price, lang)}
            </span>
            <span className="text-sm font-semibold text-primary group-hover:underline">{t('home.courses.details')}</span>
          </div>
        )}
      </div>
    </Link>
  )
}
