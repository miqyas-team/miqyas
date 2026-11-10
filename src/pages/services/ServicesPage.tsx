import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ClipboardList, MessageCircle, PackageCheck, Wallet } from 'lucide-react'
import { servicesApi } from '../../services/api'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { PriceLabel, ServiceIcon } from './shared'

export function ServicesPage() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => servicesApi.listServiceTypes(), [])

  const steps = [
    { icon: ClipboardList, key: 'request' },
    { icon: Wallet, key: 'quote' },
    { icon: MessageCircle, key: 'follow' },
    { icon: PackageCheck, key: 'deliver' },
  ] as const

  return (
    <>
      <section className="contour-bg border-b border-primary/10">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl font-bold text-primary md:text-4xl">{t('services.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted">{t('services.subtitle')}</p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, key }, i) => (
              <li key={key} className="flex items-center gap-3 rounded-2xl bg-white/80 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white"><Icon className="h-5 w-5" /></span>
                <span>
                  <span className="block text-xs text-muted">{i + 1}</span>
                  <span className="block text-sm font-semibold">{t(`services.steps.${key}`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(data ?? []).map((s) => (
              <article key={s.id} className="flex flex-col rounded-card border border-primary/10 bg-white p-6">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white"><ServiceIcon type={s} /></span>
                <h2 className="mt-5 text-lg font-bold">{pick(s.name, lang)}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{pick(s.description, lang)}</p>
                {s.isAcademic && <p className="mt-3 rounded-xl bg-accent-100/60 p-3 text-xs">{t('services.academicNote')}</p>}
                <div className="mt-5 flex items-center justify-between border-t border-primary/10 pt-4">
                  <PriceLabel type={s} />
                  <Link to={`/services/request?type=${s.slug}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">
                    {t('services.order')} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
