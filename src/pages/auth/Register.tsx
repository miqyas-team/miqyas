import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authErrorKey, signInWithGoogle, signUpWithEmail } from '../../auth/api'
import { useAuth } from '../../auth/AuthProvider'
import { dashboardPath } from '../../lib/types'
import { isEmail, isSaudiPhone, MIN_PASSWORD, normalizeSaudiPhone } from '../../lib/validation'
import { Alert, AuthShell, Button, Divider, Field, GoogleIcon } from '../../components/ui'
import { safeNext } from './Login'

type Errors = Partial<Record<'fullName' | 'email' | 'phone' | 'password' | 'confirm' | 'terms', string>>

export function Register() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { session, role, loading } = useAuth()

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    specialization: '',
    organization: '',
    terms: false,
  })
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && session && role) navigate(next ?? dashboardPath[role], { replace: true })
  }, [loading, session, role, next, navigate])

  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function validate(phone: string): Errors {
    const e: Errors = {}
    if (form.fullName.trim().length < 3) e.fullName = t('errors.fullName')
    if (!isEmail(form.email)) e.email = t('errors.email')
    if (!isSaudiPhone(phone)) e.phone = t('errors.phone')
    if (form.password.length < MIN_PASSWORD) e.password = t('errors.passwordLength', { n: MIN_PASSWORD })
    if (form.confirm !== form.password) e.confirm = t('errors.passwordMismatch')
    if (!form.terms) e.terms = t('errors.terms')
    return e
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const phone = normalizeSaudiPhone(form.phone)
    const v = validate(phone)
    setErrors(v)
    if (Object.keys(v).length) return
    setSubmitting(true)
    const { data, error } = await signUpWithEmail({
      fullName: form.fullName,
      email: form.email,
      phone,
      password: form.password,
      specialization: form.specialization,
      organization: form.organization,
      lang: i18n.resolvedLanguage === 'en' ? 'en' : 'ar',
    })
    setSubmitting(false)
    if (error) return setServerError(t(authErrorKey(error.message)))
    // إذا كان تأكيد البريد مفعّلاً لن تصل جلسة: نطلب من المستخدم فتح بريده
    if (!data.session) setSentTo(form.email.trim())
  }

  if (sentTo) {
    return (
      <AuthShell title={t('auth.checkEmailTitle')}>
        <Alert tone="success">{t('auth.checkEmailText', { email: sentTo })}</Alert>
        <Link to="/login" className="block text-center font-semibold text-primary hover:underline">{t('nav.login')}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')}>
      {serverError && <Alert>{serverError}</Alert>}
      <Button variant="outline" className="w-full" type="button" onClick={() => signInWithGoogle(next ?? '/app')}>
        <GoogleIcon /> {t('auth.continueGoogle')}
      </Button>
      <Divider label={t('auth.or')} />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field label={t('form.fullName')} autoComplete="name" value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
        <Field label={t('form.email')} type="email" autoComplete="email" dir="ltr" value={form.email} onChange={set('email')} error={errors.email} />
        <Field
          label={t('form.phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="05xxxxxxxx"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          hint={t('form.phoneHint')}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('form.password')} type="password" autoComplete="new-password" dir="ltr" value={form.password} onChange={set('password')} error={errors.password} />
          <Field label={t('form.confirmPassword')} type="password" autoComplete="new-password" dir="ltr" value={form.confirm} onChange={set('confirm')} error={errors.confirm} />
        </div>
        <Field label={t('form.specialization')} optional list="specializations" value={form.specialization} onChange={set('specialization')} />
        <datalist id="specializations">
          {(t('form.specializationOptions', { returnObjects: true }) as string[]).map((o) => <option key={o} value={o} />)}
        </datalist>
        <Field label={t('form.organization')} optional value={form.organization} onChange={set('organization')} />

        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={form.terms} onChange={set('terms')} />
            <span>
              {t('auth.agreePrefix')}{' '}
              <Link to="/terms" target="_blank" className="text-primary underline">{t('footer.terms')}</Link>{' '}
              {t('auth.and')}{' '}
              <Link to="/privacy" target="_blank" className="text-primary underline">{t('footer.privacy')}</Link>
            </span>
          </label>
          {errors.terms && <p className="mt-1 text-sm text-red-600">{errors.terms}</p>}
        </div>

        <Button type="submit" className="w-full" loading={submitting}>{t('auth.createAccount')}</Button>
      </form>
      <p className="text-center text-sm text-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">{t('nav.login')}</Link>
      </p>
    </AuthShell>
  )
}
