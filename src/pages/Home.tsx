import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const pillars = [
  { key: 'courses', to: '/courses', color: 'bg-secondary-100 text-primary' },
  { key: 'services', to: '/services', color: 'bg-accent-100 text-accent' },
  { key: 'software', to: '/software', color: 'bg-primary-50 text-primary' },
] as const

export function Home() {
  const { t } = useTranslation()
  return (
    <>
      <section className="contour-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <span className="inline-block rounded-full bg-accent-100 px-4 py-1.5 text-sm font-medium text-accent">
            {t('hero.badge')}
          </span>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight text-primary md:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t('hero.subtitle')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/courses" className="rounded-full bg-primary px-6 py-3 font-semibold text-white shadow-lg shadow-primary/20 hover:bg-primary-700">
              {t('hero.browseCourses')}
            </Link>
            <Link to="/services/request" className="rounded-full border-2 border-primary px-6 py-3 font-semibold text-primary hover:bg-primary-50">
              {t('hero.requestService')}
            </Link>
          </div>
          {/* المسار المنقّط والدبوس — من الشعار */}
          <div className="mt-12 flex max-w-md items-center gap-2 text-secondary" aria-hidden="true">
            <div className="dotted-path h-2 flex-1" />
            <svg viewBox="0 0 20 28" className="h-7 w-5"><path d="M10 27C4 19 0 14 0 9a10 10 0 0 1 20 0c0 5-4 10-10 18z" fill="#C9954A" /><circle cx="10" cy="9" r="3.5" fill="#fff" /></svg>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-16 md:grid-cols-3">
        {pillars.map((p) => (
          <Link
            key={p.key}
            to={p.to}
            className="group rounded-card border border-primary/10 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
          >
            <span className={`inline-block rounded-xl px-3 py-1 text-sm font-semibold ${p.color}`}>
              {t(`pillars.${p.key}.title`)}
            </span>
            <p className="mt-4 leading-relaxed text-muted">{t(`pillars.${p.key}.text`)}</p>
          </Link>
        ))}
      </section>
    </>
  )
}
