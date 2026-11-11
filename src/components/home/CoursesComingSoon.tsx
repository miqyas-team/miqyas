import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, GraduationCap } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'

const TRACKS = ['QGIS', 'ArcGIS Pro', 'Python', 'Remote Sensing'] as const

/** يظهر بدل قائمة الدورات ما دام الكتالوج فارغاً — بدل رسالة «لا توجد نتائج» */
export function CoursesComingSoon() {
  const { t } = useTranslation()
  const { session } = useAuth()

  return (
    <div className="relative overflow-hidden rounded-card border border-primary/10 bg-white">
      <div aria-hidden className="contour-bg absolute inset-0 opacity-60" />
      <div className="relative grid items-center gap-8 p-8 md:grid-cols-[auto_1fr] md:p-12">
        <span className="grid h-20 w-20 place-items-center rounded-3xl bg-primary text-white shadow-xl shadow-primary/20">
          <GraduationCap className="h-10 w-10" />
        </span>
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-3 py-1 text-xs font-semibold text-accent-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> {t('coursesSoon.badge')}
          </span>
          <h2 className="mt-3 text-2xl font-bold text-primary md:text-3xl">{t('coursesSoon.title')}</h2>
          <p className="mt-2 max-w-2xl leading-relaxed text-muted">{t('coursesSoon.text')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink/70">{t('coursesSoon.tracks')}</span>
            {TRACKS.map((tr) => (
              <span key={tr} dir="ltr" className="rounded-full border border-primary/15 bg-sand px-3 py-1 font-medium text-primary">{tr}</span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/services" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-semibold text-white hover:bg-primary-700">
              {t('coursesSoon.services')} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
            </Link>
            {!session && (
              <Link to="/register" className="rounded-full border-2 border-primary/20 px-5 py-2.5 font-semibold text-primary hover:border-primary">
                {t('coursesSoon.register')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
