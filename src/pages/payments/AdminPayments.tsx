import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText, Plus } from 'lucide-react'
import { paymentsApi, type Coupon, type CouponScope, type Payment, type SiteSettings } from '../../payments/api'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { useLang } from '../../lib/lang'
import { AdminNav } from '../admin/AdminNav'
import { Card, SelectField, TextField, Toggle } from '../admin/editor/fields'
import { money, PaymentStatusChip } from './PaymentPages'

/** مراجعة إيصال واحد — تُستخدم في مركز الطلبات وسجل المدفوعات */
export function ReceiptReview({ p, onDone }: { p: Payment; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'ok' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isImage = p.receiptUrl.startsWith('data:image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(p.receiptUrl)

  async function act(approve: boolean) {
    if (!approve && !reason.trim()) return setError(t('payments.admin.reasonRequired'))
    setBusy(approve ? 'ok' : 'no')
    setError(null)
    try {
      await paymentsApi.review(p.id, approve, reason)
      onDone()
    } catch {
      setError(t('errors.generic'))
      setBusy(null)
    }
  }

  return (
    <div className="rounded-card border border-accent/40 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold">{p.description}</p>
          <p className="text-xs text-muted">{p.userName || '—'} · {t(p.kind === 'course' ? 'payments.kindCourse' : 'payments.kindRequest')} · {formatDate(p.createdAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="text-end">
          <p className="text-xl font-bold">{money(p.total, lang)}</p>
          {p.couponCode && <p className="text-xs text-secondary">{p.couponCode} (−{money(p.discount, lang)})</p>}
        </div>
      </div>
      <div className="mt-3">
        {isImage ? (
          <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer"><img src={p.receiptUrl} alt={t('payments.admin.receipt')} className="max-h-56 rounded-xl border border-primary/10" /></a>
        ) : (
          <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/15 px-3 py-2 text-sm font-semibold text-primary">
            <ExternalLink className="h-4 w-4" /> {t('payments.admin.openReceipt')}
          </a>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">{t('payments.admin.checkBank', { amount: money(p.total, lang) })}</p>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('payments.admin.reasonPh')} className="mt-3 w-full rounded-xl border border-primary/15 px-3 py-2 text-sm" />
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="px-4 py-2 text-sm" loading={busy === 'ok'} disabled={busy !== null} onClick={() => act(true)}>{t('payments.admin.confirm')}</Button>
        <Button variant="outline" className="border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50" loading={busy === 'no'} disabled={busy !== null} onClick={() => act(false)}>{t('payments.admin.reject')}</Button>
      </div>
    </div>
  )
}

type Tab = 'log' | 'coupons' | 'settings'

export function AdminPayments() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'log'
  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-primary">{t('payments.admin.title')}</h1>
        <div role="tablist" className="mt-5 flex gap-1 border-b border-primary/10">
          {(['log', 'coupons', 'settings'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setParams({ tab: k }, { replace: true })} className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? 'border-primary text-primary' : 'border-transparent text-muted'}`}>
              {t(`payments.admin.tabs.${k}`)}
            </button>
          ))}
        </div>
        <div className="mt-6">
          {tab === 'log' && <PaymentLog />}
          {tab === 'coupons' && <Coupons />}
          {tab === 'settings' && <Settings />}
        </div>
      </section>
    </>
  )
}

function PaymentLog() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => paymentsApi.listPayments(), [])
  const confirmed = (data ?? []).filter((p) => p.status === 'confirmed')
  const total = confirmed.reduce((n, p) => n + p.total, 0)
  const vat = confirmed.reduce((n, p) => n + p.vatAmount, 0)
  if (loading && !data) return <Spinner />
  if (error) return <ErrorState onRetry={reload} />
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-primary/10 bg-white p-4"><p className="text-xs text-muted">{t('payments.admin.confirmedTotal')}</p><p className="text-2xl font-semibold">{money(total, lang)}</p></div>
        <div className="rounded-card border border-primary/10 bg-white p-4"><p className="text-xs text-muted">{t('payments.admin.vatTotal')}</p><p className="text-2xl font-semibold">{money(vat, lang)}</p></div>
        <div className="rounded-card border border-primary/10 bg-white p-4"><p className="text-xs text-muted">{t('payments.admin.pendingCount')}</p><p className="text-2xl font-semibold">{(data ?? []).filter((p) => p.status === 'pending_review').length}</p></div>
      </div>
      {!(data ?? []).length ? <Alert tone="info">{t('payments.empty')}</Alert> : (
        <div className="overflow-x-auto rounded-card border border-primary/10 bg-white">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-sand/70 text-xs text-muted">
              <tr>
                <th className="px-4 py-3 text-start font-semibold">{t('payments.admin.col.item')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('requests.detail.client')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('payments.total')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('payments.admin.col.date')}</th>
                <th className="px-4 py-3 text-start font-semibold">{t('admin.courses.col.status')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-primary/5">
                  <td className="px-4 py-3"><p className="font-semibold">{p.description}</p>{p.couponCode && <p className="text-xs text-secondary">{p.couponCode}</p>}</td>
                  <td className="px-4 py-3">{p.userName || '—'}</td>
                  <td className="px-4 py-3 font-semibold">{money(p.total, lang)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(p.createdAt, lang, { day: 'numeric', month: 'short' })}</td>
                  <td className="px-4 py-3"><PaymentStatusChip status={p.status} /></td>
                  <td className="px-4 py-3">
                    {p.invoiceNumber ? (
                      <Link to={`/invoices/${p.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary"><FileText className="h-3.5 w-3.5" /> <span dir="ltr">{p.invoiceNumber}</span></Link>
                    ) : p.status === 'pending_review' ? (
                      <Link to="/admin/inbox?tab=receipts" className="text-xs font-semibold text-accent underline">{t('payments.admin.review')}</Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Coupons() {
  const { t } = useTranslation()
  const { data, loading, reload } = useAsync(() => paymentsApi.listCoupons(), [])
  const [edit, setEdit] = useState<Coupon | 'new' | null>(null)
  if (loading && !data) return <Spinner />
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setEdit('new')} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {t('payments.admin.newCoupon')}</button>
      </div>
      {edit && <CouponForm initial={edit === 'new' ? null : edit} onDone={() => { setEdit(null); reload() }} />}
      <ul className="space-y-2">
        {(data ?? []).map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setEdit(c)} className="flex w-full flex-wrap items-center gap-3 rounded-card border border-primary/10 bg-white px-4 py-3 text-start hover:border-secondary">
              <span className="font-mono font-bold" dir="ltr">{c.code}</span>
              <span className="rounded-full bg-secondary-100 px-2.5 py-0.5 text-xs font-semibold text-primary">−{c.percentOff}%</span>
              <span className="text-xs text-muted">{t(`payments.admin.scope.${c.scope}`)}</span>
              <span className="flex-1 text-xs text-muted">{c.note}</span>
              <span className="text-xs">{t('payments.admin.uses', { used: c.usedCount, max: c.maxUses ?? '∞' })}</span>
              {!c.isActive && <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs text-muted">{t('payments.admin.inactive')}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CouponForm({ initial, onDone }: { initial: Coupon | null; onDone: () => void }) {
  const { t } = useTranslation()
  const [c, setC] = useState({
    code: initial?.code ?? '', percentOff: initial?.percentOff ?? 10, scope: initial?.scope ?? ('all' as CouponScope),
    maxUses: initial?.maxUses ?? null, expiresAt: initial?.expiresAt ?? null, isActive: initial?.isActive ?? true, note: initial?.note ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const code = c.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return setError(t('payments.admin.codeRule'))
    if (c.percentOff < 1 || c.percentOff > 100) return setError(t('payments.admin.pctRule'))
    setBusy(true)
    try {
      await paymentsApi.saveCoupon(initial?.id ?? null, { ...c, code })
      onDone()
    } catch (err) {
      setError(String(err).includes('duplicate') ? t('payments.admin.codeTaken') : t('errors.generic'))
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit}>
      <Card title={initial ? initial.code : t('payments.admin.newCoupon')}>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label={t('payments.admin.code')} dir="ltr" value={c.code} onChange={(v) => setC({ ...c, code: v.toUpperCase() })} placeholder="STUDENT20" />
          <TextField label={t('payments.admin.percent')} type="number" min={1} max={100} value={c.percentOff} onChange={(v) => setC({ ...c, percentOff: Number(v) || 0 })} />
          <SelectField<CouponScope> label={t('payments.admin.scopeLabel')} value={c.scope} onChange={(v) => setC({ ...c, scope: v })} options={(['all', 'courses', 'services'] as const).map((v) => ({ value: v, label: t(`payments.admin.scope.${v}`) }))} />
          <TextField label={t('payments.admin.maxUses')} type="number" min={1} value={c.maxUses ?? ''} onChange={(v) => setC({ ...c, maxUses: v ? Number(v) : null })} />
          <TextField label={t('payments.admin.expires')} type="date" value={c.expiresAt ?? ''} onChange={(v) => setC({ ...c, expiresAt: v || null })} />
          <TextField label={t('payments.admin.note')} value={c.note ?? ''} onChange={(v) => setC({ ...c, note: v })} />
        </div>
        <Toggle label={t('payments.admin.active')} checked={c.isActive} onChange={(v) => setC({ ...c, isActive: v })} />
        {error && <Alert>{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" loading={busy} className="py-2">{t('editor.save')}</Button>
          <Button type="button" variant="outline" className="py-2" onClick={onDone}>{t('common.close')}</Button>
        </div>
      </Card>
    </form>
  )
}

const SETTINGS_FIELDS: { key: keyof SiteSettings; ltr?: boolean }[] = [
  { key: 'seller_name' }, { key: 'vat_number', ltr: true }, { key: 'cr_number', ltr: true }, { key: 'seller_address' },
  { key: 'bank_name' }, { key: 'bank_account_name' }, { key: 'bank_iban', ltr: true },
  { key: 'contact_email', ltr: true }, { key: 'contact_whatsapp', ltr: true },
]

function Settings() {
  const { t } = useTranslation()
  const { data, loading, reload } = useAsync(() => paymentsApi.getSettings(), [])
  const [draft, setDraft] = useState<SiteSettings | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const s = draft ?? data
  const ibanOk = useMemo(() => !s?.bank_iban || /^SA\d{22}$/.test(s.bank_iban.replace(/\s+/g, '').toUpperCase()), [s?.bank_iban])
  const vatOk = !s?.vat_number || /^3\d{13}3$/.test(s.vat_number.trim())
  if (loading || !s) return <Spinner />

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ibanOk || !vatOk) return setMsg({ tone: 'error', text: t('payments.admin.fixFields') })
        setBusy(true)
        try {
          await paymentsApi.saveSettings(s)
          setMsg({ tone: 'success', text: t('editor.saved') })
          setDraft(null)
          reload()
        } catch {
          setMsg({ tone: 'error', text: t('errors.generic') })
        } finally {
          setBusy(false)
        }
      }}
    >
      <Card title={t('payments.admin.settingsTitle')}>
        <p className="text-sm text-muted">{t('payments.admin.settingsHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SETTINGS_FIELDS.map((f) => (
            <div key={f.key}>
              <TextField label={t(`payments.admin.fields.${f.key}`)} dir={f.ltr ? 'ltr' : undefined} value={s[f.key]} onChange={(v) => setDraft({ ...s, [f.key]: v })} />
              {f.key === 'bank_iban' && !ibanOk && <p className="mt-1 text-xs text-red-600">{t('payments.admin.ibanRule')}</p>}
              {f.key === 'vat_number' && !vatOk && <p className="mt-1 text-xs text-red-600">{t('payments.admin.vatRule')}</p>}
            </div>
          ))}
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} className="w-fit py-2">{t('editor.save')}</Button>
      </Card>
    </form>
  )
}
