import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Building2, CheckCircle2, Copy, FileText, Printer, Receipt, Upload } from 'lucide-react'
import { MAX_RECEIPT_MB, paymentsApi, zatcaQr, type Payment, type PaymentKind, type PaymentStatus } from '../../payments/api'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { useLang } from '../../lib/lang'
import { LogoMark } from '../../components/Logo'
import { Placeholder } from '../Placeholder'

export const money = (n: number, lang: 'ar' | 'en') =>
  lang === 'ar' ? `${n.toLocaleString('ar-SA-u-nu-latn', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س` : `SAR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const statusStyle: Record<PaymentStatus, string> = {
  pending_review: 'bg-accent-100 text-[#8a5f22]',
  confirmed: 'bg-secondary-100 text-primary',
  rejected: 'bg-red-50 text-red-600',
}

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation()
  return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[status]}`}>{t(`payments.status.${status}`)}</span>
}

/* ───────── الدفع بالتحويل البنكي ───────── */
export function Checkout() {
  const { kind = 'course', id = '' } = useParams()
  const k = (kind === 'request' ? 'request' : 'course') as PaymentKind
  const settings = useAsync(() => paymentsApi.getSettings(), [])
  const existing = useAsync(() => paymentsApi.myPayments(), [])
  const pending = (existing.data ?? []).find((p) => p.refId === id && p.status === 'pending_review')
  const lastRejected = (existing.data ?? []).find((p) => p.refId === id && p.status === 'rejected')

  if (settings.loading || existing.loading) return <Spinner />
  if (settings.error || !settings.data) return <ErrorState onRetry={settings.reload} />
  if (pending) return <Submitted payment={pending} />
  return <CheckoutForm kind={k} refId={id} bank={settings.data} rejected={lastRejected ?? null} onDone={existing.reload} />
}

function Submitted({ payment }: { payment: Payment }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <section className="mx-auto max-w-xl px-4 py-14 text-center">
      <CheckCircle2 className="mx-auto h-14 w-14 text-secondary" />
      <h1 className="mt-4 text-2xl font-bold text-primary">{t('payments.submittedTitle')}</h1>
      <p className="mt-2 text-muted">{t('payments.submittedText', { amount: money(payment.total, lang) })}</p>
      <Link to="/app/payments" className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white">{t('payments.mine')}</Link>
    </section>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className="truncate font-semibold" dir="auto">{value || '—'}</p>
      </div>
      {value && (
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(value.replace(/\s+/g, value.startsWith('SA') ? '' : ' '))
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary"
        >
          <Copy className="h-3.5 w-3.5" /> {copied ? t('payments.copied') : t('payments.copy')}
        </button>
      )}
    </div>
  )
}

function CheckoutForm({ kind, refId, bank, rejected, onDone }: { kind: PaymentKind; refId: string; bank: Awaited<ReturnType<typeof paymentsApi.getSettings>>; rejected: Payment | null; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [coupon, setCoupon] = useState('')
  const [applied, setApplied] = useState('')
  const quote = useAsync(() => paymentsApi.quote(kind, refId, applied), [kind, refId, applied])
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (quote.loading && !quote.data) return <Spinner />
  if (quote.error && !quote.data) return <Placeholder titleKey="payments.nothingTitle" notFound />
  const q = quote.data!

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError(t('payments.chooseReceipt'))
    if (file.size > MAX_RECEIPT_MB * 1_000_000) return setError(t('payments.tooLarge', { mb: MAX_RECEIPT_MB }))
    setBusy(true)
    setError(null)
    try {
      await paymentsApi.submit(kind, refId, q.percentOff ? applied : '', file)
      onDone()
    } catch (err) {
      setError(String(err).includes('already') ? t('payments.already') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-6 px-4 py-10 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-primary">{t('payments.checkoutTitle')}</h1>
          <p className="mt-1 text-muted">{t('payments.checkoutSubtitle')}</p>
        </div>
        {rejected && <Alert>{t('payments.previousRejected', { reason: rejected.rejectionReason ?? '' })}</Alert>}

        <section className="rounded-card border border-primary/10 bg-sand/60 p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Building2 className="h-5 w-5 text-secondary" /> {t('payments.step1')}</h2>
          <div className="space-y-2">
            <CopyField label={t('payments.bank')} value={bank.bank_name} />
            <CopyField label={t('payments.accountName')} value={bank.bank_account_name} />
            <CopyField label="IBAN" value={bank.bank_iban} />
          </div>
          {!bank.bank_iban && <p className="mt-3 text-sm text-red-600">{t('payments.noBank')}</p>}
          <p className="mt-3 text-xs text-muted">{t('payments.transferNote', { amount: money(q.total, lang) })}</p>
        </section>

        <form onSubmit={submit} className="rounded-card border border-primary/10 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-bold"><Upload className="h-5 w-5 text-secondary" /> {t('payments.step2')}</h2>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/20 bg-sand/50 px-4 py-8 text-center text-sm hover:border-secondary">
            <Receipt className="h-8 w-8 text-secondary" />
            <span className="font-semibold">{file ? file.name : t('payments.pickReceipt')}</span>
            <span className="text-xs text-muted">{t('payments.receiptHint', { mb: MAX_RECEIPT_MB })}</span>
            <input type="file" accept="image/*,.pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {error && <div className="mt-3"><Alert>{error}</Alert></div>}
          <Button type="submit" loading={busy} className="mt-4 w-full">{t('payments.submit')}</Button>
          <p className="mt-2 text-xs text-muted">{t('payments.reviewNote')}</p>
        </form>
      </div>

      <aside className="h-fit rounded-card border border-primary/10 bg-white p-5 lg:sticky lg:top-24">
        <p className="text-sm text-muted">{t(kind === 'course' ? 'payments.forCourse' : 'payments.forRequest')}</p>
        <p className="mt-1 font-bold">{q.description}</p>
        <dl className="mt-4 space-y-2 border-t border-primary/10 pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{t('payments.price')}</dt><dd>{money(q.listPrice, lang)}</dd></div>
          {q.discount > 0 && <div className="flex justify-between text-secondary"><dt>{t('payments.discount', { pct: q.percentOff })}</dt><dd>− {money(q.discount, lang)}</dd></div>}
          <div className="flex justify-between border-t border-primary/10 pt-2 text-lg font-bold"><dt>{t('payments.total')}</dt><dd>{money(q.total, lang)}</dd></div>
          <p className="text-xs text-muted">{t('payments.vatIncluded')}</p>
        </dl>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(coupon.trim().toUpperCase())
          }}
        >
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder={t('payments.couponPh')} dir="ltr" className="min-w-0 flex-1 rounded-xl border border-primary/15 px-3 py-2 text-sm uppercase" />
          <Button type="submit" variant="outline" className="px-4 py-2 text-sm" loading={quote.loading && Boolean(applied)}>{t('payments.apply')}</Button>
        </form>
        {applied && q.couponError && <p className="mt-2 text-xs text-red-600">{t(`payments.couponErrors.${q.couponError}`)}</p>}
        {applied && !q.couponError && q.percentOff > 0 && <p className="mt-2 text-xs text-secondary">{t('payments.couponApplied', { code: applied })}</p>}
      </aside>
    </section>
  )
}

/* ───────── سجل مدفوعاتي ───────── */
export function MyPayments() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => paymentsApi.myPayments(), [])
  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">{t('payments.mine')}</h1>
      <div className="mt-6">
        {loading && !data ? <Spinner /> : error ? <ErrorState onRetry={reload} /> : !data?.length ? (
          <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center text-muted">{t('payments.empty')}</div>
        ) : (
          <ul className="space-y-3">
            {data.map((p) => (
              <li key={p.id} className="rounded-card border border-primary/10 bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{p.description}</p>
                    <p className="text-xs text-muted">{formatDate(p.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })} · {t(p.kind === 'course' ? 'payments.kindCourse' : 'payments.kindRequest')}</p>
                  </div>
                  <span className="font-bold">{money(p.total, lang)}</span>
                  <PaymentStatusChip status={p.status} />
                </div>
                {p.status === 'rejected' && (
                  <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {t('payments.rejectedReason', { reason: p.rejectionReason ?? '' })}{' '}
                    <Link to={`/app/checkout/${p.kind}/${p.refId}`} className="font-semibold underline">{t('payments.retry')}</Link>
                  </div>
                )}
                {p.status === 'confirmed' && p.invoiceNumber && (
                  <Link to={`/invoices/${p.id}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                    <FileText className="h-4 w-4" /> {t('payments.invoice')} <span className="font-mono text-xs" dir="ltr">{p.invoiceNumber}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ───────── الفاتورة الضريبية المبسّطة (قابلة للطباعة) ───────── */
export function InvoicePage() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const pay = useAsync(() => paymentsApi.getPayment(id), [id])
  const settings = useAsync(() => paymentsApi.getSettings(), [])
  const [qr, setQr] = useState('')
  const p = pay.data
  const s = settings.data

  useEffect(() => {
    if (!p || !s || !p.reviewedAt) return
    const payload = zatcaQr(s.seller_name || 'Miqyas', s.vat_number || '', new Date(p.reviewedAt).toISOString(), p.total, p.vatAmount)
    QRCode.toString(payload, { type: 'svg', margin: 0 }).then(setQr)
  }, [p, s])

  if (pay.loading || settings.loading) return <Spinner />
  if (!p || p.status !== 'confirmed' || !s) return <Placeholder notFound />

  const subtotal = Math.round((p.total - p.vatAmount) * 100) / 100
  const lineNet = Math.round((p.listPrice / 1.15) * 100) / 100
  const discountNet = Math.round((lineNet - subtotal) * 100) / 100
  const ar = (n: number) => money(n, 'ar')

  return (
    <div className="min-h-screen bg-sand py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-[800px] items-center justify-between gap-3 px-4 print:hidden">
        <Link to="/app/payments" className="text-sm font-semibold text-primary">{t('payments.mine')}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white">
          <Printer className="h-4 w-4" /> {t('certificates.download')}
        </button>
      </div>
      <article dir="rtl" lang="ar" className="mx-auto max-w-[800px] bg-white p-10 shadow-xl print:max-w-none print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-primary pb-6">
          <div>
            <h1 className="text-2xl font-bold text-ink">فاتورة ضريبية مبسّطة</h1>
            <p className="text-sm text-muted" dir="ltr">Simplified Tax Invoice</p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex gap-2"><dt className="text-muted">رقم الفاتورة:</dt><dd className="font-mono font-semibold" dir="ltr">{p.invoiceNumber}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">التاريخ:</dt><dd>{formatDate(p.reviewedAt!, 'ar', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd></div>
              <div className="flex gap-2"><dt className="text-muted">العميل:</dt><dd>{p.userName || '—'}</dd></div>
            </dl>
          </div>
          <div className="text-start">
            <div className="flex items-center gap-2"><LogoMark className="h-10 w-10" /><span className="text-xl font-bold text-primary">{s.seller_name || 'مقياس'}</span></div>
            <dl className="mt-3 space-y-0.5 text-xs text-muted">
              {s.vat_number && <div>الرقم الضريبي: <span className="font-mono text-ink" dir="ltr">{s.vat_number}</span></div>}
              {s.cr_number && <div>السجل التجاري: <span className="font-mono text-ink" dir="ltr">{s.cr_number}</span></div>}
              {s.seller_address && <div>{s.seller_address}</div>}
            </dl>
          </div>
        </header>

        <table className="mt-6 w-full text-sm">
          <thead className="bg-sand text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">البيان</th>
              <th className="px-3 py-2 text-end font-semibold">السعر قبل الضريبة</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-primary/10">
              <td className="px-3 py-3">{p.description}</td>
              <td className="px-3 py-3 text-end">{ar(lineNet)}</td>
            </tr>
            {p.discount > 0 && (
              <tr className="border-b border-primary/10 text-secondary">
                <td className="px-3 py-3">خصم {p.couponCode ? `(${p.couponCode})` : ''}</td>
                <td className="px-3 py-3 text-end">− {ar(discountNet)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="h-32 w-32" dangerouslySetInnerHTML={{ __html: qr }} aria-label="ZATCA QR" />
          <dl className="w-80 max-w-full space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted">الإجمالي قبل الضريبة</dt><dd>{ar(subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">ضريبة القيمة المضافة (15%)</dt><dd>{ar(p.vatAmount)}</dd></div>
            <div className="flex justify-between border-t-2 border-primary pt-2 text-base font-bold"><dt>الإجمالي شامل الضريبة</dt><dd>{ar(p.total)}</dd></div>
          </dl>
        </div>
        <p className="mt-8 border-t border-primary/10 pt-4 text-center text-xs text-muted">طريقة الدفع: تحويل بنكي · شكراً لاختياركم مقياس</p>
      </article>
    </div>
  )
}
