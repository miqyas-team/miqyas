import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Table2, BarChart3 } from 'lucide-react'
import { adminApi } from '../../admin/api'
import { fmtMonth, fmtNumber, HBars, Legend, SERIES, StackedColumns, StatTile } from '../../admin/charts'
import { STAGES, type RequestStatus } from '../../services/types'
import { Alert, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'

export function AdminOverview() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data: s, loading, error, reload } = useAsync(() => adminApi.getStats(), [])
  const [asTable, setAsTable] = useState(false)

  const money = (n: number, compact = false) => (lang === 'ar' ? `${fmtNumber(n, lang, compact)} ر.س` : `SAR ${fmtNumber(n, lang, compact)}`)
  const num = (n: number) => fmtNumber(n, lang)

  if (loading && !s) return <><AdminNav /><Spinner /></>
  if (error || !s) return <><AdminNav /><ErrorState onRetry={reload} /></>

  const openRequests = (['new', 'quoting', 'awaiting_payment', 'in_progress', 'review'] as RequestStatus[]).reduce((n, k) => n + (s.requests.byStatus[k] ?? 0), 0)
  const last = s.revenue[s.revenue.length - 1]
  const prev = s.revenue[s.revenue.length - 2]
  const lastTotal = last ? last.courses + last.services : 0
  const prevTotal = prev ? prev.courses + prev.services : 0
  const change = prevTotal > 0 ? Math.round(((lastTotal - prevTotal) / prevTotal) * 100) : null
  const sixTotal = s.revenue.reduce((n, r) => n + r.courses + r.services, 0)

  const series = [
    { color: SERIES.courses, label: t('adminHome.revenue.courses') },
    { color: SERIES.services, label: t('adminHome.revenue.services') },
  ]

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('adminHome.title')}</h1>
          <p className="text-sm text-muted">{t('adminHome.subtitle')}</p>
        </div>
        {s.isSample && <Alert tone="info">{t('adminHome.sampleNote')}</Alert>}

        {/* تنبيهات تحتاج إجراء */}
        {(s.pendingGrading > 0 || s.requests.unassigned > 0 || s.requests.overdue > 0) && (
          <div className="flex flex-wrap gap-2">
            {s.pendingGrading > 0 && (
              <Link to="/admin/inbox?tab=assignments" className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-sm font-semibold text-accent-700 hover:brightness-95">
                {t('adminHome.alerts.grading', { count: s.pendingGrading })} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            )}
            {s.requests.unassigned > 0 && (
              <Link to="/admin/inbox?tab=requests" className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-4 py-2 text-sm font-semibold text-accent-700 hover:brightness-95">
                {t('adminHome.alerts.unassigned', { count: s.requests.unassigned })} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            )}
            {s.requests.overdue > 0 && (
              <Link to="/admin/inbox?tab=requests" className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:brightness-95">
                ⚠ {t('adminHome.alerts.overdue', { count: s.requests.overdue })} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            )}
          </div>
        )}

        {/* المؤشرات */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t('adminHome.tiles.revenueMonth')} value={money(lastTotal)} hint={change === null ? t('adminHome.tiles.estimated') : t('adminHome.tiles.vsPrev', { sign: change > 0 ? '+' : '', pct: change })} />
          <StatTile label={t('adminHome.tiles.users')} value={num(s.users.total)} hint={t('adminHome.tiles.new30', { n: num(s.users.new30) })} />
          <StatTile label={t('adminHome.tiles.enrollments')} value={num(s.enrollments.active + s.enrollments.completed)} hint={t('adminHome.tiles.enrollHint', { completed: num(s.enrollments.completed), pending: num(s.enrollments.pending) })} />
          <StatTile label={t('adminHome.tiles.openRequests')} value={num(openRequests)} hint={t('adminHome.tiles.certificates', { n: num(s.certificates) })} />
        </div>

        {/* الإيراد الشهري */}
        <section className="rounded-card border border-primary/10 bg-white p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-ink">{t('adminHome.revenue.title')}</h2>
              <p className="text-xs text-muted">{t('adminHome.revenue.subtitle', { total: money(sixTotal) })}</p>
            </div>
            <div className="flex items-center gap-3">
              <Legend items={series} />
              <button type="button" onClick={() => setAsTable((v) => !v)} className="inline-flex items-center gap-1 rounded-lg border border-primary/15 px-2 py-1 text-xs font-medium text-muted hover:text-primary" aria-pressed={asTable}>
                {asTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
                {t(asTable ? 'adminHome.asChart' : 'adminHome.asTable')}
              </button>
            </div>
          </div>
          <div className="mt-4">
            {asTable ? (
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 text-start font-semibold">{t('adminHome.revenue.month')}</th>
                    <th className="py-2 text-end font-semibold">{series[0].label}</th>
                    <th className="py-2 text-end font-semibold">{series[1].label}</th>
                    <th className="py-2 text-end font-semibold">{t('adminHome.revenue.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.revenue.map((r) => (
                    <tr key={r.month} className="border-t border-primary/5">
                      <td className="py-2">{fmtMonth(r.month, lang)} <span className="text-xs text-muted">{r.month.slice(0, 4)}</span></td>
                      <td className="py-2 text-end">{money(r.courses)}</td>
                      <td className="py-2 text-end">{money(r.services)}</td>
                      <td className="py-2 text-end font-semibold">{money(r.courses + r.services)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <StackedColumns
                ariaLabel={t('adminHome.revenue.title')}
                series={series}
                formatValue={(n, c) => money(n, c)}
                data={s.revenue.map((r) => ({ key: r.month, label: fmtMonth(r.month, lang), values: [r.courses, r.services] }))}
              />
            )}
          </div>
          <p className="mt-3 text-xs text-muted">{t('adminHome.revenue.note')}</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-card border border-primary/10 bg-white p-5 md:p-6">
            <h2 className="font-bold text-ink">{t('adminHome.requests.title')}</h2>
            <p className="mb-4 text-xs text-muted">{t('adminHome.requests.subtitle')}</p>
            <HBars
              formatValue={num}
              rows={[...STAGES, 'cancelled' as const].map((k) => ({ key: k, label: t(`requests.status.${k}`), value: s.requests.byStatus[k] ?? 0, href: '/admin/requests' }))}
            />
          </section>
          <section className="rounded-card border border-primary/10 bg-white p-5 md:p-6">
            <h2 className="font-bold text-ink">{t('adminHome.courses.title')}</h2>
            <p className="mb-4 text-xs text-muted">{t('adminHome.courses.subtitle')}</p>
            {s.topCourses.length ? (
              <HBars formatValue={num} rows={s.topCourses.map((c, i) => ({ key: String(i), label: pick(c.title, lang), value: c.enrollments }))} />
            ) : (
              <p className="text-sm text-muted">{t('adminHome.courses.empty')}</p>
            )}
            <div className="mt-5 border-t border-primary/10 pt-4">
              <p className="mb-2 text-xs font-semibold text-muted">{t('adminHome.roles')}</p>
              <ul className="flex flex-wrap gap-2 text-xs">
                {(['user', 'instructor', 'team', 'admin'] as const).map((r) => (
                  <li key={r} className="rounded-full bg-sand px-3 py-1">
                    {t(`roles.${r}`)} <span className="font-semibold">{num(s.users.byRole[r] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </section>
    </>
  )
}
