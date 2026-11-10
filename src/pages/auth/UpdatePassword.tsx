import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey, updatePassword } from '../../auth/api'
import { useAuth } from '../../auth/AuthProvider'
import { MIN_PASSWORD } from '../../lib/validation'
import { Alert, AuthShell, Button, Field, Spinner } from '../../components/ui'

/** تعيين كلمة مرور جديدة بعد فتح رابط الاستعادة من البريد */
export function UpdatePassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <Spinner />

  if (!session) {
    return (
      <AuthShell title={t('auth.updateTitle')}>
        <Alert>{t('auth.linkExpired')}</Alert>
        <Link to="/reset-password" className="block text-center font-semibold text-primary hover:underline">{t('auth.sendLink')}</Link>
      </AuthShell>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(t('errors.passwordLength', { n: MIN_PASSWORD }))
    if (password !== confirm) return setError(t('errors.passwordMismatch'))
    setSubmitting(true)
    const { error: err } = await updatePassword(password)
    setSubmitting(false)
    if (err) return setError(t(authErrorKey(err.message)))
    navigate('/app', { replace: true })
  }

  return (
    <AuthShell title={t('auth.updateTitle')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label={t('form.newPassword')} type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label={t('form.confirmPassword')} type="password" autoComplete="new-password" dir="ltr" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" className="w-full" loading={submitting}>{t('form.save')}</Button>
      </form>
    </AuthShell>
  )
}
