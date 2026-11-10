import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey, sendPasswordReset } from '../../auth/api'
import { isEmail } from '../../lib/validation'
import { Alert, AuthShell, Button, Field } from '../../components/ui'

/** طلب رابط استعادة كلمة المرور */
export function ResetPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isEmail(email)) return setError(t('errors.email'))
    setSubmitting(true)
    const { error: err } = await sendPasswordReset(email)
    setSubmitting(false)
    // لا نكشف هل البريد مسجّل أم لا
    if (err && authErrorKey(err.message) !== 'errors.generic') return setError(t(authErrorKey(err.message)))
    setSent(true)
  }

  return (
    <AuthShell title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      {sent ? (
        <Alert tone="success">{t('auth.resetSent', { email: email.trim() })}</Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Field label={t('form.email')} type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" loading={submitting}>{t('auth.sendLink')}</Button>
        </form>
      )}
      <Link to="/login" className="block text-center text-sm font-semibold text-primary hover:underline">{t('auth.backToLogin')}</Link>
    </AuthShell>
  )
}
