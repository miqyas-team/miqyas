import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeOff, Pencil } from 'lucide-react'
import { servicesApi } from '../../services/api'
import type { ServiceType, ServiceTypePatch } from '../../services/types'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'
import { BiField, Card, SelectField, TextField, Toggle } from './editor/fields'
import { PriceLabel, ServiceIcon } from '../services/shared'

/** «الخدمات والأسعار»: يعدّل المدير الأسعار والأوصاف ويخفي الخدمات أو يظهرها */
export function AdminServices() {
  const { t } = useTranslation()
  const lang = useLang()
  const types = useAsync(() => servicesApi.adminServiceTypes(), [])
  const [editing, setEditing] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-primary">{t('servicesAdmin.title')}</h1>
        <p className="text-sm text-muted">{t('servicesAdmin.subtitle')}</p>
        {saved && <div className="mt-4"><Alert tone="success">{t('servicesAdmin.saved')}</Alert></div>}

        {types.loading && !types.data ? <Spinner /> : types.error ? <ErrorState onRetry={types.reload} /> : (
          <ul className="mt-5 space-y-3">
            {(types.data ?? []).map((s) =>
              editing === s.id ? (
                <li key={s.id}>
                  <ServiceForm
                    initial={s}
                    onCancel={() => setEditing(null)}
                    onDone={() => {
                      setEditing(null)
                      setSaved(true)
                      types.reload()
                    }}
                  />
                </li>
              ) : (
                <li key={s.id} className={`flex items-center gap-3 rounded-card border bg-white px-4 py-3 ${s.isActive ? 'border-primary/10' : 'border-dashed border-primary/20 opacity-70'}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><ServiceIcon type={s} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{pick(s.name, lang)}</span>
                    <span className="block text-sm text-muted"><PriceLabel type={s} /></span>
                  </span>
                  {!s.isActive && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-0.5 text-xs text-muted"><EyeOff className="h-3.5 w-3.5" /> {t('servicesAdmin.hidden')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setSaved(false); setEditing(s.id) }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-50"
                  >
                    <Pencil className="h-4 w-4" /> {t('servicesAdmin.edit')}
                  </button>
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </>
  )
}

function ServiceForm({ initial, onDone, onCancel }: { initial: ServiceType; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [s, setS] = useState<ServiceTypePatch>({
    name: initial.name,
    description: initial.description,
    pricing: initial.pricing,
    price: initial.price,
    unit: initial.unit ?? { ar: '', en: '' },
    isActive: initial.isActive,
    position: initial.position,
  })
  const [priceText, setPriceText] = useState(initial.price === null ? '' : String(initial.price))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof ServiceTypePatch>(k: K, v: ServiceTypePatch[K]) => setS((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!s.name.ar.trim() || !s.name.en.trim()) return setError(t('servicesAdmin.nameRequired'))
    const price = priceText.trim() === '' ? null : Number(priceText)
    if (price !== null && (!Number.isFinite(price) || price < 0)) return setError(t('servicesAdmin.priceInvalid'))
    if (s.pricing === 'fixed' && price === null) return setError(t('servicesAdmin.priceRequired'))
    setBusy(true)
    setError(null)
    try {
      await servicesApi.saveServiceType(initial.id, { ...s, price: s.pricing === 'fixed' ? price : null })
      onDone()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Card title={`${t('servicesAdmin.edit')}: ${initial.name.ar}`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField<'fixed' | 'custom'>
            label={t('servicesAdmin.pricing')}
            value={s.pricing}
            onChange={(v) => set('pricing', v)}
            options={[
              { value: 'fixed', label: t('servicesAdmin.fixed') },
              { value: 'custom', label: t('servicesAdmin.custom') },
            ]}
          />
          {s.pricing === 'fixed' && (
            <TextField label={t('servicesAdmin.price')} type="number" min={0} dir="ltr" value={priceText} onChange={setPriceText} hint={t('servicesAdmin.priceHint')} />
          )}
          <TextField label={t('servicesAdmin.position')} type="number" dir="ltr" value={s.position} onChange={(v) => set('position', Number(v) || 0)} hint={t('servicesAdmin.positionHint')} />
        </div>
        {s.pricing === 'fixed' && (
          <BiField label={t('servicesAdmin.unit')} hint={t('servicesAdmin.unitHint')} value={s.unit ?? { ar: '', en: '' }} onChange={(v) => set('unit', v)} />
        )}
        <BiField label={t('servicesAdmin.name')} value={s.name} onChange={(v) => set('name', v)} />
        <BiField label={t('servicesAdmin.description')} multiline rows={3} value={s.description} onChange={(v) => set('description', v)} />
        <Toggle label={t('servicesAdmin.active')} hint={t('servicesAdmin.activeHint')} checked={s.isActive} onChange={(v) => set('isActive', v)} />
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary">{t('servicesAdmin.note')}</p>
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="py-2">{t('editor.save')}</Button>
          <Button type="button" variant="outline" onClick={onCancel} className="py-2">{t('common.cancel')}</Button>
        </div>
      </Card>
    </form>
  )
}
