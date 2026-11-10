import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { dashboardPath } from '../lib/types'

export function Forbidden() {
  const { t } = useTranslation()
  const { role } = useAuth()
  return (
    <section className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="text-5xl">🔒</p>
      <h1 className="mt-4 text-2xl font-bold text-primary">{t('auth.forbiddenTitle')}</h1>
      <p className="mt-2 text-muted">{t('auth.forbiddenText')}</p>
      <Link to={role ? dashboardPath[role] : '/'} className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white">
        {t('auth.goToDashboard')}
      </Link>
    </section>
  )
}
