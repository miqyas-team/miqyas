import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileCheck2, Ruler, ShieldCheck } from 'lucide-react'
import { GisViewer } from '../components/map/GisViewer'

/** أداة مجانية: معاينة ملفات GIS وقياس المسافات والمساحات — الملفات لا تغادر جهاز المستخدم */
export function MapViewerPage() {
  const { t } = useTranslation()
  const points = [
    { icon: FileCheck2, key: 'formats' },
    { icon: Ruler, key: 'measure' },
    { icon: ShieldCheck, key: 'private' },
  ] as const

  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">{t('viewer.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t('viewer.subtitle')}</p>
        </div>
        <Link to="/services/request" className="rounded-full border-2 border-primary px-5 py-2 text-sm font-semibold text-primary hover:bg-primary-50">
          {t('viewer.needHelp')}
        </Link>
      </div>

      <div className="mt-6">
        <GisViewer height="min(70vh, 640px)" />
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-3">
        {points.map(({ icon: Icon, key }) => (
          <li key={key} className="flex gap-3 rounded-2xl border border-primary/10 bg-white p-4">
            <Icon className="h-6 w-6 shrink-0 text-secondary" />
            <div>
              <p className="font-semibold">{t(`viewer.points.${key}.title`)}</p>
              <p className="mt-0.5 text-sm text-muted">{t(`viewer.points.${key}.text`)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
