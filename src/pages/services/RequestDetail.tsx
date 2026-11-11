import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, Download, FileUp, History, Lock, MapPin, Paperclip, Send, UserRound } from 'lucide-react'
import { servicesApi } from '../../services/api'
import { allowedTransitions, type RequestDetail as Detail, type RequestFile, type RequestStatus } from '../../services/types'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { GisViewer, type ViewerFile } from '../../components/map/GisViewer'
import { isPreviewable } from '../../components/map/gisFiles'
import { formatDate } from '../../components/home/CourseCard'
import { pick, useLang } from '../../lib/lang'
import { Placeholder } from '../Placeholder'
import { AdminNav } from '../admin/AdminNav'
import { formatSize, StageTracker, StatusChip } from './shared'

export type Perspective = 'client' | 'team' | 'admin'

const listPath: Record<Perspective, string> = { client: '/app/requests', team: '/team/requests', admin: '/admin/requests' }

export function RequestDetailPage({ as }: { as: Perspective }) {
  const { id = '' } = useParams()
  const req = useAsync(() => servicesApi.getRequest(id), [id])
  if (req.loading && !req.data) return <Spinner />
  if (req.error) return <ErrorState onRetry={req.reload} />
  if (!req.data) return <Placeholder notFound />
  return (
    <>
      {as === 'admin' && <AdminNav />}
      <RequestView r={req.data} as={as} reload={req.reload} />
    </>
  )
}

function RequestView({ r, as, reload }: { r: Detail; as: Perspective; reload: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const location = useLocation()
  const created = (location.state as { created?: boolean } | null)?.created
  const staff = as !== 'client'

  // بعد إنشاء الطلب نعرض رسالة التأكيد أعلى الصفحة
  useEffect(() => {
    if (created) window.scrollTo({ top: 0 })
  }, [created])
  const inputs = r.files.filter((f) => f.kind === 'input')
  const deliverables = r.files.filter((f) => f.kind === 'deliverable')
  // ملفات GIS المتاحة لهذا الطرف تُعرض على الخريطة (العميل يرى التسليمات من المراجعة فما بعد)
  const showDeliverables = staff || r.status === 'review' || r.status === 'completed'
  const mapFiles: ViewerFile[] = useMemo(
    () =>
      [...inputs, ...(showDeliverables ? deliverables : [])]
        .filter((f) => f.url !== '#' && isPreviewable(f.name))
        .map((f) => ({ key: f.id, name: f.name, source: f.url })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r.files.map((f) => f.id).join('|'), showDeliverables],
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link to={listPath[as]} className="text-sm text-muted hover:text-primary">{t('requests.back')}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            <span className="font-mono" dir="ltr">#{r.number}</span> · {pick(r.serviceType.name, lang)} · {formatDate(r.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-primary md:text-3xl">{r.title}</h1>
        </div>
        <StatusChip status={r.status} />
      </div>

      {created && <div className="mt-4"><Alert tone="success">{t('requests.created', { n: r.number })}</Alert></div>}

      <div className="mt-6 rounded-card border border-primary/10 bg-white px-3 py-5 sm:px-6">
        <StageTracker status={r.status} fixedPrice={r.serviceType.pricing === 'fixed'} />
      </div>

      {as === 'client' && <ClientBanner r={r} reload={reload} />}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-card border border-primary/10 bg-white p-6">
            <h2 className="text-lg font-bold">{t('requests.detail.description')}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-ink/85">{r.description}</p>
            {r.dueDate && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-sand px-3 py-1.5 text-sm">
                <Calendar className="h-4 w-4 text-accent" /> {t('requests.detail.due')}: {formatDate(r.dueDate, lang, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
            {(r.location || mapFiles.length > 0) && (
              <div className="mt-5 space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="h-4 w-4 text-accent" /> {t('requests.detail.onMap')}</h3>
                <GisViewer height={340} marker={r.location} files={mapFiles} allowUpload={false} />
                {mapFiles.length > 0 && <p className="text-xs text-muted">{t('requests.detail.filesOnMap', { count: mapFiles.length })}</p>}
              </div>
            )}
            {r.location && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-muted" dir="ltr">
                  {r.location.lat.toFixed(5)}, {r.location.lng.toFixed(5)} ·{' '}
                  <a className="text-primary underline" href={`https://www.google.com/maps?q=${r.location.lat},${r.location.lng}`} target="_blank" rel="noopener noreferrer">Google Maps</a>
                </p>
                {r.locationNote && <p className="text-sm text-muted">{r.locationNote}</p>}
              </div>
            )}
          </section>

          <FilesSection title={t('requests.detail.inputs')} files={inputs} empty={t('requests.detail.noInputs')} />

          {(r.serviceType.requiresDeliverable || deliverables.length > 0 || staff) && (
            <DeliverablesSection r={r} as={as} files={deliverables} reload={reload} />
          )}

          <Conversation r={r} as={as} reload={reload} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {staff && <StaffPanel r={r} as={as} reload={reload} />}
          <section className="rounded-card border border-primary/10 bg-white p-5 text-sm">
            <dl className="space-y-3">
              <div className="flex justify-between gap-3"><dt className="text-muted">{t('requests.detail.price')}</dt><dd className="font-bold">{r.price !== null ? (lang === 'ar' ? `${r.price} ر.س` : `SAR ${r.price}`) : t('requests.detail.notPriced')}</dd></div>
              {staff && <div className="flex justify-between gap-3"><dt className="text-muted">{t('requests.detail.client')}</dt><dd className="font-semibold">{r.clientName || '—'}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-muted">{t('requests.detail.assignee')}</dt><dd className="font-semibold">{r.assignedName ?? (as === 'client' ? t('requests.detail.teamSoon') : t('requests.detail.unassigned'))}</dd></div>
            </dl>
          </section>
          <Timeline r={r} />
        </aside>
      </div>
    </div>
  )
}

/* ───────── لافتة العميل حسب المرحلة ───────── */
function ClientBanner({ r, reload }: { r: Detail; reload: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [busy, setBusy] = useState<RequestStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function go(to: RequestStatus) {
    if (to === 'cancelled' && !confirm(t('requests.client.confirmCancel'))) return
    setBusy(to)
    setError(null)
    try {
      await servicesApi.transition(r.id, to)
      reload()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  const canCancel = allowedTransitions(r.status, 'client').includes('cancelled')
  const price = r.price !== null ? (lang === 'ar' ? `${r.price} ر.س` : `SAR ${r.price}`) : ''

  return (
    <div className="mt-4 space-y-3">
      {(r.status === 'new' || r.status === 'quoting') && <Alert tone="info">{t('requests.client.reviewing')}</Alert>}
      {r.status === 'awaiting_payment' && (
        <div className="rounded-card border-2 border-accent/50 bg-accent-100/40 p-5">
          <p className="text-sm text-muted">{t('requests.client.amountDue')}</p>
          <p className="text-3xl font-bold text-ink">{price}</p>
          <p className="mt-2 text-sm">{t('requests.client.paymentHow')}</p>
          <Link to={`/app/checkout/request/${r.id}`} className="mt-4 inline-block rounded-full bg-accent px-6 py-2.5 font-semibold text-white hover:brightness-95">
            {t('payments.payNow')}
          </Link>
        </div>
      )}
      {r.status === 'in_progress' && <Alert tone="success">{t('requests.client.inProgress')}</Alert>}
      {r.status === 'review' && (
        <div className="rounded-card border-2 border-secondary bg-secondary-100/40 p-5">
          <p className="font-semibold">{t('requests.client.reviewTitle')}</p>
          <p className="mt-1 text-sm text-muted">{t('requests.client.reviewText')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy === 'completed'} onClick={() => go('completed')}>{t('requests.client.accept')}</Button>
            <Button variant="outline" loading={busy === 'in_progress'} onClick={() => go('in_progress')}>{t('requests.client.revise')}</Button>
          </div>
        </div>
      )}
      {r.status === 'completed' && <Alert tone="success">{t('requests.client.completed')}</Alert>}
      {error && <Alert>{error}</Alert>}
      {canCancel && (
        <button type="button" onClick={() => go('cancelled')} disabled={busy !== null} className="text-sm font-semibold text-red-600 hover:underline">
          {t('requests.client.cancel')}
        </button>
      )}
    </div>
  )
}

/* ───────── الملفات ───────── */
function FileList({ files }: { files: RequestFile[] }) {
  const lang = useLang()
  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.id}>
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 px-4 py-3 text-sm hover:border-secondary">
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-secondary" />
              <span className="truncate" dir="ltr">{f.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3 text-xs text-muted">
              <span dir="ltr">{formatSize(f.sizeBytes)}</span>
              <span className="hidden sm:inline">{formatDate(f.createdAt, lang, { day: 'numeric', month: 'short' })}</span>
              <Download className="h-4 w-4 text-primary" />
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

function FilesSection({ title, files, empty }: { title: string; files: RequestFile[]; empty: string }) {
  return (
    <section className="rounded-card border border-primary/10 bg-white p-6">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {files.length ? <FileList files={files} /> : <p className="text-sm text-muted">{empty}</p>}
    </section>
  )
}

function DeliverablesSection({ r, as, files, reload }: { r: Detail; as: Perspective; files: RequestFile[]; reload: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canUpload = as !== 'client' && (r.status === 'in_progress' || r.status === 'review')
  // العميل يرى التسليمات من مرحلة المراجعة فما بعد
  const visible = as !== 'client' || r.status === 'review' || r.status === 'completed'

  async function upload(list: FileList | null) {
    const picked = [...(list ?? [])]
    if (!picked.length) return
    setBusy(true)
    setError(null)
    try {
      await servicesApi.uploadFiles(r.id, 'deliverable', picked)
      reload()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-card border-2 border-secondary/30 bg-white p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-primary">
        <FileUp className="h-5 w-5 text-secondary" /> {t('requests.detail.deliverables')}
      </h2>
      {visible && files.length ? <FileList files={files} /> : <p className="text-sm text-muted">{t(as === 'client' ? 'requests.detail.deliverablesLater' : 'requests.detail.noDeliverables')}</p>}
      {canUpload && (
        <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-white hover:brightness-95">
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <FileUp className="h-4 w-4" />}
          {t('requests.staff.uploadDeliverables')}
          <input type="file" multiple className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
        </label>
      )}
      {error && <div className="mt-3"><Alert>{error}</Alert></div>}
    </section>
  )
}

/* ───────── المحادثة ───────── */
function Conversation({ r, as, reload }: { r: Detail; as: Perspective; reload: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const closed = r.status === 'completed' || r.status === 'cancelled'
  const staff = as !== 'client'
  const messages = r.messages.filter((m) => staff || !m.isInternal)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setBusy(true)
    setError(null)
    try {
      await servicesApi.sendMessage(r.id, body, staff && internal)
      setBody('')
      reload()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-card border border-primary/10 bg-white p-6">
      <h2 className="mb-4 text-lg font-bold">{t('requests.chat.title')}</h2>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-2xl bg-sand/50 p-4">
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('requests.chat.empty')}</p>}
        {messages.map((m) => {
          const mine = staff ? m.senderIsStaff : !m.senderIsStaff
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.isInternal ? 'border border-dashed border-accent bg-accent-100/60' : mine ? 'bg-primary text-white' : 'bg-white shadow-sm'
                }`}
              >
                <p className={`mb-0.5 flex items-center gap-1 text-[11px] ${mine && !m.isInternal ? 'text-white/70' : 'text-muted'}`}>
                  {m.isInternal && <Lock className="h-3 w-3" />}
                  {m.senderIsStaff ? m.senderName || t('requests.chat.team') : m.senderName || t('requests.chat.client')}
                  {' · '}
                  {formatDate(m.createdAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="whitespace-pre-line">{m.body}</p>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="mt-3 text-sm text-muted">{t('requests.chat.closed')}</p>
      ) : (
        <form onSubmit={send} className="mt-3 space-y-2">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void send(e)
              }}
              rows={2}
              maxLength={4000}
              placeholder={t(internal ? 'requests.chat.internalPh' : 'requests.chat.placeholder')}
              className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm outline-none focus:ring-4 ${internal ? 'border-accent bg-accent-100/30 focus:ring-accent/20' : 'border-primary/15 focus:border-secondary focus:ring-secondary/20'}`}
            />
            <Button type="submit" loading={busy} disabled={!body.trim()} className="px-4" aria-label={t('requests.chat.send')}>
              <Send className="h-4 w-4 rtl:-scale-x-100" />
            </Button>
          </div>
          {staff && (
            <label className="inline-flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" className="accent-primary" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <Lock className="h-3 w-3" /> {t('requests.chat.internal')}
            </label>
          )}
          {error && <Alert>{error}</Alert>}
        </form>
      )}
    </section>
  )
}

/* ───────── لوحة الفريق والمدير ───────── */
function StaffPanel({ r, as, reload }: { r: Detail; as: Perspective; reload: () => void }) {
  const { t } = useTranslation()
  const isAdmin = as === 'admin'
  const team = useAsync(() => (isAdmin ? servicesApi.listTeam() : Promise.resolve([])), [isAdmin])
  const [price, setPrice] = useState(r.price?.toString() ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const next = allowedTransitions(r.status, isAdmin ? 'admin' : 'team')

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
      reload()
    } catch (e) {
      const msg = String(e)
      setError(msg.includes('deliverable') ? t('requests.staff.needDeliverable') : msg.includes('price') ? t('requests.staff.needPrice') : t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  const priceNum = Number(price)
  const priceValid = price.trim() !== '' && Number.isFinite(priceNum) && priceNum >= 0

  return (
    <section className="space-y-4 rounded-card border-2 border-primary/20 bg-white p-5">
      <h2 className="font-bold text-primary">{t('requests.staff.title')}</h2>

      {isAdmin && (r.status === 'new' || r.status === 'quoting' || r.status === 'awaiting_payment') && (
        <div>
          <label htmlFor="rq-price" className="mb-1.5 block text-sm font-medium">{t('requests.staff.price')}</label>
          <div className="flex gap-2">
            <input id="rq-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-primary/15 px-3 py-2 text-sm" />
            <Button className="px-4 py-2 text-sm" disabled={!priceValid} loading={busy === 'quote'} onClick={() => run('quote', () => servicesApi.transition(r.id, 'awaiting_payment', priceNum))}>
              {t('requests.staff.sendQuote')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted">{t('requests.staff.priceHint')}</p>
        </div>
      )}

      {isAdmin && (
        <div>
          <label htmlFor="rq-assign" className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><UserRound className="h-4 w-4" /> {t('requests.staff.assign')}</label>
          <select
            id="rq-assign"
            value={r.assignedTo ?? ''}
            disabled={busy === 'assign'}
            onChange={(e) => run('assign', () => servicesApi.assign(r.id, e.target.value || null))}
            className="w-full rounded-xl border border-primary/15 bg-white px-3 py-2 text-sm"
          >
            <option value="">{t('requests.detail.unassigned')}</option>
            {(team.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}

      {next.filter((s) => !(isAdmin && s === 'awaiting_payment')).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('requests.staff.moveTo')}</p>
          <div className="flex flex-wrap gap-2">
            {next
              .filter((s) => !(isAdmin && s === 'awaiting_payment'))
              .map((s) => (
                <Button
                  key={s}
                  variant={s === 'cancelled' ? 'outline' : 'primary'}
                  className={`px-4 py-2 text-xs ${s === 'cancelled' ? 'border-red-200 text-red-600 hover:bg-red-50' : ''}`}
                  loading={busy === s}
                  onClick={() => {
                    if (s === 'cancelled' && !confirm(t('requests.staff.confirmCancel'))) return
                    void run(s, () => servicesApi.transition(r.id, s))
                  }}
                >
                  {t(`requests.actions.${r.status}_${s}`, { defaultValue: t(`requests.status.${s}`) })}
                </Button>
              ))}
          </div>
          {r.status === 'awaiting_payment' && isAdmin && (
            <p className="text-xs text-muted">
              {t('requests.staff.paymentManual')} <Link to="/admin/inbox?tab=receipts" className="font-semibold text-primary underline">{t('center.tabs.receipts')}</Link>
            </p>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </section>
  )
}

/* ───────── سجل الطلب ───────── */
function Timeline({ r }: { r: Detail }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <section className="rounded-card border border-primary/10 bg-white p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><History className="h-4 w-4 text-muted" /> {t('requests.timeline.title')}</h2>
      <ol className="space-y-3 border-s-2 border-dashed border-primary/15 ps-4 text-xs">
        {[...r.events].reverse().map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -start-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-secondary" />
            <p className="font-medium text-ink">
              {e.type === 'status'
                ? t('requests.timeline.status', { to: t(`requests.status.${e.to}`) })
                : e.type === 'price'
                  ? t('requests.timeline.price', { price: e.to })
                  : e.to
                    ? t('requests.timeline.assigned')
                    : t('requests.timeline.unassigned')}
            </p>
            <p className="text-muted">
              {formatDate(e.createdAt, lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {e.actorName ? ` · ${e.actorName}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
