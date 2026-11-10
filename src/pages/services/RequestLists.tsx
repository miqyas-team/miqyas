import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ClipboardList, Plus } from 'lucide-react'
import { servicesApi } from '../../services/api'
import type { RequestStatus, RequestSummary } from '../../services/types'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { pick, useLang } from '../../lib/lang'
import { AdminNav } from '../admin/AdminNav'
import { ServiceIcon, StatusChip } from './shared'

/** طلبات العميل */
export function MyRequests() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => servicesApi.myRequests(), [])

  return (
    <section className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-primary">{t('requests.mine')}</h1>
        <Link to="/services/request" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> {t('hero.requestService')}
        </Link>
      </div>
      <div className="mt-8">
        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : !data?.length ? (
          <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-secondary" />
            <p className="mt-3 text-muted">{t('requests.emptyMine')}</p>
            <Link to="/services" className="mt-5 inline-block rounded-full bg-primary px-5 py-2.5 font-semibold text-white">{t('services.browse')}</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id}>
                <Link to={`/app/requests/${r.id}`} className="flex items-center gap-4 rounded-card border border-primary/10 bg-white p-5 transition hover:border-secondary hover:shadow-lg">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary"><ServiceIcon type={r.serviceType} className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{r.title}</span>
                    <span className="block text-sm text-muted">
                      <span className="font-mono" dir="ltr">#{r.number}</span> · {pick(r.serviceType.name, lang)} · {formatDate(r.createdAt, lang, { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <StatusChip status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

const FILTERS: (RequestStatus | 'open' | 'all')[] = ['open', 'new', 'quoting', 'awaiting_payment', 'in_progress', 'review', 'completed', 'cancelled', 'all']
const isOpen = (s: RequestStatus) => s !== 'completed' && s !== 'cancelled'

/** طلبات الفريق (المسندة) أو المدير (الكل) */
export function StaffRequests({ as }: { as: 'team' | 'admin' }) {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => servicesApi.staffRequests(as === 'admin' ? 'all' : 'assigned'), [as])
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('open')
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0, open: 0 }
    for (const r of data ?? []) {
      c[r.status] = (c[r.status] ?? 0) + 1
      if (isOpen(r.status)) c.open++
    }
    return c
  }, [data])

  const rows = (data ?? []).filter(
    (r: RequestSummary) =>
      (filter === 'all' || (filter === 'open' ? isOpen(r.status) : r.status === filter)) && (!unassignedOnly || !r.assignedTo),
  )
  const base = as === 'admin' ? '/admin/requests' : '/team/requests'

  return (
    <>
      {as === 'admin' && <AdminNav />}
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-primary">{t(as === 'admin' ? 'requests.allTitle' : 'requests.assignedTitle')}</h1>

        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${filter === f ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80 hover:border-primary/40'}`}
            >
              {f === 'open' ? t('requests.filters.open') : f === 'all' ? t('requests.filters.all') : t(`requests.status.${f}`)}
              <span className={`ms-1.5 text-xs ${filter === f ? 'text-white/70' : 'text-muted'}`}>{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        {as === 'admin' && (
          <label className="mt-3 inline-flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
            {t('requests.filters.unassigned')}
          </label>
        )}

        <div className="mt-5">
          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorState onRetry={reload} />
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('requests.emptyStaff')}</div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-primary/10 bg-white">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="bg-sand/70 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">#</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('requests.col.request')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('requests.detail.client')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('requests.detail.assignee')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('requests.detail.due')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('admin.courses.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const overdue = r.dueDate && isOpen(r.status) && new Date(r.dueDate) < new Date()
                    return (
                      <tr key={r.id} className="border-t border-primary/5 hover:bg-primary-50/40">
                        <td className="px-4 py-3 font-mono text-xs text-muted" dir="ltr">{r.number}</td>
                        <td className="px-4 py-3">
                          <Link to={`${base}/${r.id}`} className="font-semibold hover:text-primary hover:underline">{r.title}</Link>
                          <p className="text-xs text-muted">{pick(r.serviceType.name, lang)}</p>
                        </td>
                        <td className="px-4 py-3">{r.clientName || '—'}</td>
                        <td className="px-4 py-3">{r.assignedName ?? <span className="text-accent">{t('requests.detail.unassigned')}</span>}</td>
                        <td className={`px-4 py-3 ${overdue ? 'font-semibold text-red-600' : ''}`}>
                          {r.dueDate ? formatDate(r.dueDate, lang, { day: 'numeric', month: 'short' }) : '—'}
                        </td>
                        <td className="px-4 py-3"><StatusChip status={r.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
