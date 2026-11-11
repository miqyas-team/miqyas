import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ClipboardList, Download, FileCheck2, Flag, Mail, Receipt, Timer, UserX } from 'lucide-react'
import { communityApi, type ForumReport } from '../../community/api'
import { paymentsApi, type Payment } from '../../payments/api'
import { ReceiptReview } from '../payments/AdminPayments'
import { contactApi, type ContactMessage } from '../../contact/api'
import { adminApi, type SubmissionRow } from '../../admin/api'
import { servicesApi } from '../../services/api'
import type { RequestSummary } from '../../services/types'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'
import { StatusChip } from '../services/shared'

type Tab = 'assignments' | 'requests' | 'reports' | 'receipts' | 'contact'

function ageLabel(iso: string, lang: 'ar' | 'en') {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' })
  return hours < 24 ? rtf.format(-Math.max(hours, 0), 'hour') : rtf.format(-Math.floor(hours / 24), 'day')
}
const isLate = (iso: string) => Date.now() - new Date(iso).getTime() > 48 * 3_600_000

export function RequestCenter() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [params, setParams] = useSearchParams()
  const tab = (isAdmin ? (params.get('tab') as Tab) : 'assignments') || 'assignments'

  const subs = useAsync(() => adminApi.listSubmissions(), [])
  const reqs = useAsync(() => (isAdmin ? servicesApi.staffRequests('all') : Promise.resolve([] as RequestSummary[])), [isAdmin])
  const reports = useAsync(() => (isAdmin ? communityApi.listReports() : Promise.resolve([] as ForumReport[])), [isAdmin])
  const pays = useAsync(() => (isAdmin ? paymentsApi.listPayments() : Promise.resolve([] as Payment[])), [isAdmin])
  const pendingPays = (pays.data ?? []).filter((p) => p.status === 'pending_review')
  const msgs = useAsync(() => (isAdmin ? contactApi.list() : Promise.resolve([] as ContactMessage[])), [isAdmin])
  const openMsgs = (msgs.data ?? []).filter((m) => !m.handled)

  const pendingSubs = (subs.data ?? []).filter((s) => s.status === 'submitted')
  const actionable = (reqs.data ?? []).filter((r) => r.status !== 'completed' && r.status !== 'cancelled')
  const unassigned = actionable.filter((r) => !r.assignedTo)
  const overdue = actionable.filter((r) => r.dueDate && new Date(r.dueDate) < new Date())
  const needsAction = actionable.filter((r) => r.status === 'new' || r.status === 'quoting' || !r.assignedTo)

  const tabs: { key: Tab; label: string; count?: number; icon: typeof ClipboardList }[] = [
    { key: 'assignments', label: t('center.tabs.assignments'), count: pendingSubs.length, icon: FileCheck2 },
    ...(isAdmin
      ? [
          { key: 'requests' as const, label: t('center.tabs.requests'), count: needsAction.length, icon: ClipboardList },
          { key: 'reports' as const, label: t('center.tabs.reports'), count: reports.data?.length ?? 0, icon: Flag },
          { key: 'receipts' as const, label: t('center.tabs.receipts'), count: pendingPays.length, icon: Receipt },
          { key: 'contact' as const, label: t('center.tabs.contact'), count: openMsgs.length, icon: Mail },
        ]
      : []),
  ]

  return (
    <>
      {isAdmin || role === 'instructor' ? <AdminNav /> : null}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-primary">{isAdmin ? t('areas.inbox') : t('center.instructorTitle')}</h1>
        <p className="text-sm text-muted">{t(isAdmin ? 'center.subtitle' : 'center.instructorSubtitle')}</p>

        {/* ملخص */}
        <div className={`mt-5 grid gap-3 ${isAdmin ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
          <Summary icon={FileCheck2} label={t('center.summary.grading')} value={pendingSubs.length} warn={pendingSubs.some((s) => isLate(s.createdAt))} />
          {isAdmin && <Summary icon={ClipboardList} label={t('center.summary.open')} value={actionable.length} />}
          {isAdmin && <Summary icon={UserX} label={t('center.summary.unassigned')} value={unassigned.length} warn={unassigned.length > 0} />}
          {isAdmin && <Summary icon={Timer} label={t('center.summary.overdue')} value={overdue.length} warn={overdue.length > 0} />}
        </div>

        {/* التبويبات */}
        {tabs.length > 1 && (
          <div role="tablist" className="mt-6 flex gap-1 overflow-x-auto border-b border-primary/10">
            {tabs.map(({ key, label, count, icon: Icon }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                type="button"
                onClick={() => setParams({ tab: key }, { replace: true })}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
              >
                <Icon className="h-4 w-4" /> {label}
                {count !== undefined && count > 0 && <span className="rounded-full bg-accent px-2 text-xs text-white">{count}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          {tab === 'assignments' &&
            (subs.loading && !subs.data ? <Spinner /> : subs.error ? <ErrorState onRetry={subs.reload} /> : <Assignments rows={subs.data ?? []} onGraded={subs.reload} />)}
          {tab === 'requests' &&
            (reqs.loading && !reqs.data ? <Spinner /> : reqs.error ? <ErrorState onRetry={reqs.reload} /> : <RequestsTab rows={needsAction} overdue={overdue} onChange={reqs.reload} />)}
          {tab === 'reports' &&
            (reports.loading && !reports.data ? <Spinner /> : reports.error ? <ErrorState onRetry={reports.reload} /> : <ReportsTab rows={reports.data ?? []} onChange={reports.reload} />)}
          {tab === 'receipts' &&
            (pays.loading && !pays.data ? <Spinner /> : pays.error ? <ErrorState onRetry={pays.reload} /> : pendingPays.length === 0 ? (
              <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('center.receiptsEmpty')}</div>
            ) : (
              <div className="space-y-3">{pendingPays.map((p) => <ReceiptReview key={p.id} p={p} onDone={pays.reload} />)}</div>
            ))}
          {tab === 'contact' &&
            (msgs.loading && !msgs.data ? <Spinner /> : msgs.error ? <ErrorState onRetry={msgs.reload} /> : <ContactTab rows={msgs.data ?? []} onChange={msgs.reload} />)}
        </div>
      </section>
    </>
  )
}

function Summary({ icon: Icon, label, value, warn }: { icon: typeof ClipboardList; label: string; value: number; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-card border bg-white p-4 ${warn ? 'border-accent/50' : 'border-primary/10'}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${warn ? 'bg-accent-100 text-accent-700' : 'bg-primary-50 text-primary'}`}><Icon className="h-5 w-5" /></span>
      <span>
        <span className="block text-2xl font-semibold">{value}</span>
        <span className="block text-xs text-muted">{label}</span>
      </span>
    </div>
  )
}

/* ───────── تصحيح التمارين ───────── */
function Assignments({ rows, onGraded }: { rows: SubmissionRow[]; onGraded: () => void }) {
  const { t } = useTranslation()
  const [show, setShow] = useState<'pending' | 'all'>('pending')
  const [open, setOpen] = useState<string | null>(null)
  const list = show === 'pending' ? rows.filter((r) => r.status === 'submitted') : rows

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['pending', 'all'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${show === k ? 'bg-primary text-white' : 'border border-primary/15 bg-white'}`}>
            {t(`center.assign.${k}`)}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t(show === 'pending' ? 'center.assign.emptyPending' : 'center.assign.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <SubmissionItem key={s.id} s={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} onGraded={() => { setOpen(null); onGraded() }} />
          ))}
        </ul>
      )}
    </div>
  )
}

const SNIPPETS = ['excellent', 'legend', 'crs', 'scale', 'source'] as const

function SubmissionItem({ s, open, onToggle, onGraded }: { s: SubmissionRow; open: boolean; onToggle: () => void; onGraded: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [grade, setGrade] = useState(s.grade?.toString() ?? '')
  const [feedback, setFeedback] = useState(s.feedback ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const late = s.status === 'submitted' && isLate(s.createdAt)

  async function decide(status: 'approved' | 'needs_revision' | 'rejected') {
    const g = grade.trim() === '' ? null : Number(grade)
    if (g !== null && (!Number.isFinite(g) || g < 0 || g > 100)) return setError(t('center.assign.gradeRange'))
    if (status !== 'approved' && !feedback.trim()) return setError(t('center.assign.feedbackRequired'))
    setBusy(status)
    setError(null)
    try {
      await adminApi.gradeSubmission(s.id, status, g, feedback)
      onGraded()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  const statusChip = {
    submitted: 'bg-accent-100 text-accent-700',
    approved: 'bg-secondary-100 text-primary',
    needs_revision: 'bg-[#e8e3f7] text-[#4b3b8f]',
    rejected: 'bg-red-50 text-red-600',
  }[s.status]

  return (
    <li className={`rounded-card border bg-white ${open ? 'border-secondary' : late ? 'border-red-200' : 'border-primary/10'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-start">
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{s.studentName || '—'} · {pick(s.lessonTitle, lang)}</span>
          <span className="block truncate text-xs text-muted">{pick(s.courseTitle, lang)}</span>
        </span>
        <span className={`hidden shrink-0 text-xs sm:inline ${late ? 'font-semibold text-red-600' : 'text-muted'}`}>{ageLabel(s.createdAt, lang)}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip}`}>{t(`center.assign.status.${s.status}`)}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-primary/10 p-4">
          <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" download={s.fileName} className="inline-flex items-center gap-2 rounded-xl border border-primary/15 px-3 py-2 text-sm hover:border-secondary">
            <Download className="h-4 w-4 text-primary" /> <span dir="ltr">{s.fileName}</span>
          </a>
          {s.note && <p className="rounded-xl bg-sand px-3 py-2 text-sm"><span className="font-semibold">{t('center.assign.studentNote')}: </span>{s.note}</p>}

          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <div>
              <label htmlFor={`g-${s.id}`} className="mb-1 block text-sm font-medium">{t('center.assign.grade')}</label>
              <input id={`g-${s.id}`} type="number" min={0} max={100} value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor={`f-${s.id}`} className="mb-1 block text-sm font-medium">{t('center.assign.feedback')}</label>
              <textarea id={`f-${s.id}`} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-full rounded-xl border border-primary/15 px-3 py-2 text-sm" />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {SNIPPETS.map((k) => (
                  <button key={k} type="button" onClick={() => setFeedback((f) => (f ? `${f.trim()} ` : '') + t(`center.snippets.${k}`))} className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] text-primary hover:bg-secondary-100">
                    + {t(`center.snippets.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button className="px-4 py-2 text-sm" loading={busy === 'approved'} onClick={() => decide('approved')}>{t('center.assign.approve')}</Button>
            <Button variant="outline" className="px-4 py-2 text-sm" loading={busy === 'needs_revision'} onClick={() => decide('needs_revision')}>{t('center.assign.revise')}</Button>
            <Button variant="outline" className="border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50" loading={busy === 'rejected'} onClick={() => decide('rejected')}>{t('center.assign.reject')}</Button>
          </div>
        </div>
      )}
    </li>
  )
}

/* ───────── طلبات الخدمات التي تحتاج إجراء ───────── */
function RequestsTab({ rows, overdue, onChange }: { rows: RequestSummary[]; overdue: RequestSummary[]; onChange: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const team = useAsync(() => servicesApi.listTeam(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const overdueIds = useMemo(() => new Set(overdue.map((r) => r.id)), [overdue])
  const list = [...rows, ...overdue.filter((o) => !rows.some((r) => r.id === o.id))]

  async function assign(id: string, member: string) {
    setBusy(id)
    try {
      await servicesApi.assign(id, member || null)
      onChange()
    } finally {
      setBusy(null)
    }
  }

  if (!list.length) return <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('center.req.empty')}</div>

  return (
    <ul className="space-y-2">
      {list.map((r) => (
        <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-card border bg-white px-4 py-3 ${overdueIds.has(r.id) ? 'border-red-200' : 'border-primary/10'}`}>
          <div className="min-w-0 flex-1">
            <Link to={`/admin/requests/${r.id}`} className="block truncate font-semibold hover:text-primary hover:underline">
              <span className="font-mono text-xs text-muted" dir="ltr">#{r.number}</span> {r.title}
            </Link>
            <p className="text-xs text-muted">
              {pick(r.serviceType.name, lang)} · {r.clientName || '—'} · {ageLabel(r.createdAt, lang)}
              {overdueIds.has(r.id) && <span className="ms-1 font-semibold text-red-600">· {t('center.req.overdue')}</span>}
            </p>
          </div>
          <StatusChip status={r.status} />
          <select
            value={r.assignedTo ?? ''}
            disabled={busy === r.id}
            onChange={(e) => assign(r.id, e.target.value)}
            aria-label={t('requests.staff.assign')}
            className={`rounded-lg border px-2 py-1.5 text-sm ${r.assignedTo ? 'border-primary/15' : 'border-accent bg-accent-100/40'}`}
          >
            <option value="">{t('requests.detail.unassigned')}</option>
            {(team.data ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </li>
      ))}
      <li className="pt-1 text-xs text-muted">{t('center.req.hint')} <Link to="/admin/requests" className="font-semibold text-primary underline">{t('admin.nav.requests')}</Link></li>
    </ul>
  )
}

/* ───────── بلاغات المنتدى ───────── */
function ReportsTab({ rows, onChange }: { rows: ForumReport[]; onChange: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [busy, setBusy] = useState<string | null>(null)

  async function act(r: ForumReport, hide: boolean) {
    setBusy(r.id)
    try {
      if (hide) await communityApi.setHidden(r.replyId ? 'reply' : 'thread', r.replyId ?? r.threadId, true)
      await communityApi.resolveReport(r.id)
      onChange()
    } finally {
      setBusy(null)
    }
  }

  if (!rows.length) return <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('center.reports.empty')}</div>
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="rounded-card border border-red-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={`/community/${r.threadId}`} className="font-semibold hover:text-primary hover:underline">{r.threadTitle}</Link>
              <p className="text-xs text-muted">{t(r.replyId ? 'center.reports.onReply' : 'center.reports.onThread')} · {ageLabel(r.createdAt, lang)}</p>
            </div>
            <div className="flex gap-2">
              <Button className="px-3 py-1.5 text-xs" loading={busy === r.id} onClick={() => act(r, true)}>{t('center.reports.hide')}</Button>
              <Button variant="outline" className="px-3 py-1.5 text-xs" disabled={busy === r.id} onClick={() => act(r, false)}>{t('center.reports.dismiss')}</Button>
            </div>
          </div>
          <blockquote className="mt-3 rounded-xl bg-sand px-3 py-2 text-sm text-ink/80" dir="auto">{r.excerpt}</blockquote>
          <p className="mt-2 text-sm"><span className="font-semibold text-red-600">{t('center.reports.reason')}: </span>{r.reason}</p>
        </li>
      ))}
    </ul>
  )
}
/* ───────── رسائل التواصل ───────── */
function ContactTab({ rows, onChange }: { rows: ContactMessage[]; onChange: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [showAll, setShowAll] = useState(false)
  const list = showAll ? rows : rows.filter((m) => !m.handled)
  return (
    <div className="space-y-3">
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-primary" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('center.contact.showHandled')}
      </label>
      {list.length === 0 ? (
        <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('center.contact.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className={`rounded-card border bg-white p-4 ${m.handled ? 'border-primary/10 opacity-60' : 'border-primary/20'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{m.name} <span className="ms-1 rounded-full bg-sand px-2 py-0.5 text-[11px] font-normal">{t(`contact.topics.${m.topic}`)}</span></p>
                  <p className="text-xs text-muted">
                    <a href={`mailto:${m.email}`} className="underline" dir="ltr">{m.email}</a>
                    {m.phone && <span dir="ltr"> · {m.phone}</span>} · {ageLabel(m.createdAt, lang)}
                  </p>
                </div>
                {!m.handled && (
                  <Button variant="outline" className="px-3 py-1.5 text-xs" onClick={async () => { await contactApi.markHandled(m.id); onChange() }}>
                    {t('center.contact.markHandled')}
                  </Button>
                )}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm" dir="auto">{m.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}