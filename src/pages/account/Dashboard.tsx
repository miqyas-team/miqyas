import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthProvider'
import { Alert } from '../../components/ui'

/** لوحة مؤقتة لكل دور — تمتلئ بالمحتوى في الأوامر القادمة */
export function Dashboard({ area }: { area: 'app' | 'instructor' | 'team' | 'admin' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const firstName = profile?.full_name.split(' ')[0] ?? ''

  return (
    <section className="mx-auto max-w-6xl px-4 py-10">
      <p className="text-sm font-medium text-accent">{t(`areas.${area}`)}</p>
      <h1 className="mt-1 text-3xl font-bold text-primary">{t('dash.welcome', { name: firstName })}</h1>

      {area === 'app' && profile && !profile.phone && (
        <div className="mt-6">
          <Alert tone="info">
            {t('dash.completeProfile')}{' '}
            <Link to="/app/profile" className="font-semibold text-primary underline">{t('profile.title')}</Link>
          </Alert>
        </div>
      )}

      <div className="mt-8 rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">
        <div className="dotted-path mx-auto mb-4 h-2 w-32 text-secondary" />
        {t('dash.soon')}
      </div>
    </section>
  )
}
