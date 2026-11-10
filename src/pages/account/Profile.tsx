import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import { isSaudiPhone, normalizeSaudiPhone } from '../../lib/validation'
import { Alert, Button, Field } from '../../components/ui'

export function Profile() {
  const { t, i18n } = useTranslation()
  const { profile, refreshProfile } = useAuth()
  const [form, setForm] = useState({ full_name: '', phone: '', specialization: '', organization: '' })
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const [errors, setErrors] = useState<{ full_name?: string; phone?: string }>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    setForm({
      full_name: profile.full_name,
      phone: profile.phone ?? '',
      specialization: profile.specialization ?? '',
      organization: profile.organization ?? '',
    })
    setLang(profile.preferred_lang)
  }, [profile])

  if (!profile) return null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const phone = form.phone ? normalizeSaudiPhone(form.phone) : ''
    const v: typeof errors = {}
    if (form.full_name.trim().length < 3) v.full_name = t('errors.fullName')
    if (phone && !isSaudiPhone(phone)) v.phone = t('errors.phone')
    setErrors(v)
    if (Object.keys(v).length) return

    setStatus('saving')
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: phone || null,
        specialization: form.specialization.trim() || null,
        organization: form.organization.trim() || null,
        preferred_lang: lang,
      })
      .eq('id', profile!.id)
    if (error) {
      setStatus('error')
      setServerError(error.code === '23505' ? t('errors.phoneTaken') : t('errors.generic'))
      return
    }
    await refreshProfile()
    if (i18n.resolvedLanguage !== lang) void i18n.changeLanguage(lang)
    setStatus('saved')
  }

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => {
    setStatus('idle')
    setForm((f) => ({ ...f, [k]: e.target.value }))
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-primary">{t('profile.title')}</h1>
      <p className="mt-1 text-sm text-muted">
        {profile.email} · <span className="rounded-full bg-primary-50 px-2 py-0.5 text-primary">{t(`roles.${profile.role}`)}</span>
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4 rounded-card border border-primary/10 bg-white p-6">
        {status === 'saved' && <Alert tone="success">{t('profile.saved')}</Alert>}
        {serverError && <Alert>{serverError}</Alert>}
        <Field label={t('form.fullName')} value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
        <Field label={t('form.phone')} type="tel" dir="ltr" placeholder="05xxxxxxxx" value={form.phone} onChange={set('phone')} error={errors.phone} hint={t('form.phoneHint')} />
        <Field label={t('form.specialization')} optional list="specializations" value={form.specialization} onChange={set('specialization')} />
        <datalist id="specializations">
          {(t('form.specializationOptions', { returnObjects: true }) as string[]).map((o) => <option key={o} value={o} />)}
        </datalist>
        <Field label={t('form.organization')} optional value={form.organization} onChange={set('organization')} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('profile.language')}</legend>
          <div className="flex gap-2">
            {(['ar', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => { setLang(l); setStatus('idle') }}
                className={`rounded-full px-4 py-2 text-sm font-medium ${lang === l ? 'bg-primary text-white' : 'border border-primary/20 text-primary'}`}
              >
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </fieldset>
        <Button type="submit" loading={status === 'saving'}>{t('form.save')}</Button>
      </form>
    </section>
  )
}
