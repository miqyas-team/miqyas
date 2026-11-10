import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey, signInWithEmail, signInWithGoogle } from '../../auth/api'
import { useAuth } from '../../auth/AuthProvider'
import { dashboardPath } from '../../lib/types'
import { isEmail } from '../../lib/validation'
import { Alert, AuthShell, Button, Divider, Field, GoogleIcon } from '../../components/ui'

/** يقبل فقط مسارات داخلية لتفادي إعادة التوجيه لمواقع خارجية */
export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { session, role, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // بعد نجاح الدخول: إلى الصفحة المطلوبة أو لوحة الدور
  useEffect(() => {
    if (!loading && session && role) navigate(next ?? dashboardPath[role], { replace: true })
  }, [loading, session, role, next, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEmail(email) || !password) return setError(t('errors.fillCredentials'))
    setSubmitting(true)
    const { error: err } = await signInWithEmail(email, password)
    setSubmitting(false)
    if (err) setError(t(authErrorKey(err.message)))
  }

  async function onGoogle() {
    setError(null)
    const { error: err } = await signInWithGoogle(next ?? '/app')
    if (err) setError(t(authErrorKey(err.message)))
  }

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      {error && <Alert>{error}</Alert>}
      <Button variant="outline" className="w-full" type="button" onClick={onGoogle}>
        <GoogleIcon /> {t('auth.continueGoogle')}
      </Button>
      <Divider label={t('auth.or')} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('form.email')} type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('form.password')} type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="text-end">
          <Link to="/reset-password" className="text-sm text-primary hover:underline">{t('auth.forgot')}</Link>
        </div>
        <Button type="submit" className="w-full" loading={submitting}>{t('nav.login')}</Button>
      </form>
      <p className="text-center text-sm text-muted">
        {t('auth.noAccount')}{' '}
        <Link to={`/register${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-primary hover:underline">
          {t('nav.register')}
        </Link>
      </p>
    </AuthShell>
  )
}
