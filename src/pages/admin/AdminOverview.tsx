import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowLeft, BookOpen, BookOpenText, Flame, Briefcase, CheckCircle2, ChevronDown, ClipboardList, FileCheck2,
  GraduationCap, Plus, Receipt, Tags, TrendingDown, TrendingUp, UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react'
import { adminApi } from '../../admin/api'
import { libraryApi } from '../../library/api'
import { fmtMonth, fmtNumber, HBars, Legend, SERIES, StackedColumns } from '../../admin/charts'
import type { RequestStatus } from '../../services/types'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { useAuth } from '../../auth/AuthProvider'
import { pick, useLang } from '../../lib/lang'

/** زر اختصار كبير */
function Shortcut({ to, icon: Icon, title, hint, badge }: { to: string; icon: LucideIcon; title: string; hint: string; badge?: number }) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col gap-3 rounded-card border border-primary/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 sm:p-5"
    >
      {!!badge && (
        <span className="absolute end-3 top-3 grid h-6 min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{badge}</span>
      )}
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary transition group-hover:bg-primary group-hover:text-white">
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block font-bold leading-snug text-ink">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
      </span>
    </Link>
  )
}

/** بطاقة رقم بجملة مفهومة */
function Figure({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: ReactNode }) {
  return (
    <div className="rounded-card border border-primary/10 bg-white p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Icon className="h-4 w-4 text-secondary-700" /> {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-ink sm:text-3xl" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      <div className="mt-1 text-xs leading-relaxed text-muted">{note}</div>
    </div>
  )
}

export function AdminOverview() {
  const { t } = useTranslation()
  const lang = useLang()
  const { profile } = useAuth()
  const { data: s, loading, error, reload } = useAsync(() => adminApi.getStats(), [])
  const content = useAsync(() => libraryApi.pendingCounts(), [])

  if (loading && !s) return <Spinner />
  if (error || !s) return <ErrorState onRetry={reload} />

  const money = (n: number, compact = false) => (lang === 'ar' ? `${fmtNumber(n, lang, compact)} ر.س` : `SAR ${fmtNumber(n, lang, compact)}`)
  const num = (n: number) => fmtNumber(n, lang)
  const h = (k: string, o: Record<string, unknown> = {}) => String(t(`staff.home.${k}`, o))

  const openRequests = (['new', 'quoting', 'awaiting_payment', 'in_progress', 'review'] as RequestStatus[]).reduce((n, k) => n + (s.requests.byStatus[k] ?? 0), 0)
  const last = s.revenue[s.revenue.length - 1]
  const prev = s.revenue[s.revenue.length - 2]
  const lastTotal = last ? last.courses + last.services : 0
  const prevTotal = prev ? prev.courses + prev.services : 0
  const change = prevTotal > 0 ? Math.round(((lastTotal - prevTotal) / prevTotal) * 100) : null

  // المهام التي تنتظر ردّ المدير
  const tasks = [
    { n: s.requests.overdue, icon: AlertTriangle, urgent: true, text: h('task.overdue', { count: s.requests.overdue }), to: '/admin/inbox?tab=requests' },
    { n: s.requests.unassigned, icon: ClipboardList, urgent: false, text: h('task.unassigned', { count: s.requests.unassigned }), to: '/admin/inbox?tab=requests' },
    { n: s.enrollments.pending, icon: Receipt, urgent: false, text: h('task.payments', { count: s.enrollments.pending }), to: '/admin/inbox?tab=receipts' },
    { n: s.pendingGrading, icon: FileCheck2, urgent: false, text: h('task.grading', { count: s.pendingGrading }), to: '/admin/inbox?tab=assignments' },
    { n: content.data?.articles ?? 0, icon: BookOpenText, urgent: false, text: h('task.articles', { count: content.data?.articles ?? 0 }), to: '/admin/library' },
    { n: content.data?.questions ?? 0, icon: Flame, urgent: false, text: h('task.questions', { count: content.data?.questions ?? 0 }), to: '/admin/questions' },
  ].filter((x) => x.n > 0)

  const series = [
    { color: SERIES.courses, label: t('adminHome.revenue.courses') },
    { color: SERIES.services, label: t('adminHome.revenue.services') },
  ]

  return (
    <section className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:py-8">
      {/* الترحيب */}
      <div>
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">{h('hello', { name: profile?.full_name.split(' ')[0] ?? '' })}</h1>
        <p className="mt-1 text-sm text-muted">{tasks.length ? h('youHave', { count: tasks.length }) : h('allClear')}</p>
        {s.isSample && <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-relaxed text-sky-800">{h('sample')}</p>}
      </div>

      {/* اختصارات سريعة */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">{h('shortcuts')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          <Shortcut to="/admin/courses/new" icon={Plus} title={h('sc.course')} hint={h('sc.courseHint')} />
          <Shortcut to="/admin/inbox?tab=receipts" icon={Wallet} title={h('sc.payments')} hint={h('sc.paymentsHint')} badge={s.enrollments.pending} />
          <Shortcut to="/admin/inbox?tab=requests" icon={ClipboardList} title={h('sc.requests')} hint={h('sc.requestsHint')} badge={s.requests.unassigned} />
          <Shortcut to="/admin/jobs/new" icon={Briefcase} title={h('sc.job')} hint={h('sc.jobHint')} />
          <Shortcut to="/admin/services" icon={Tags} title={h('sc.prices')} hint={h('sc.pricesHint')} />
          <Shortcut to="/admin/users" icon={UserPlus} title={h('sc.team')} hint={h('sc.teamHint')} />
        </div>
      </div>

      {/* يحتاج ردّك */}
      {tasks.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">{h('needsYou')}</h2>
          <ul className="divide-y divide-primary/5 overflow-hidden rounded-card border border-primary/10 bg-white">
            {tasks.map(({ icon: Icon, urgent, text, to }) => (
              <li key={text}>
                <Link to={to} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-primary-50/50">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${urgent ? 'bg-red-50 text-red-600' : 'bg-accent-100 text-accent-700'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={`flex-1 text-sm font-medium ${urgent ? 'text-red-700' : 'text-ink'}`}>{text}</span>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    {h('open')} <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ملخص الشهر بكلام بسيط */}
      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">{h('thisMonth')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Figure
            icon={Wallet}
            label={h('fig.income')}
            value={money(lastTotal)}
            note={
              change === null ? h('fig.incomeFirst') : (
                <span className={`inline-flex items-center gap-1 font-semibold ${change >= 0 ? 'text-secondary-700' : 'text-red-600'}`}>
                  {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {h(change >= 0 ? 'fig.up' : 'fig.down', { pct: Math.abs(change) })}
                </span>
              )
            }
          />
          <Figure icon={Users} label={h('fig.newUsers')} value={num(s.users.new30)} note={h('fig.totalUsers', { n: num(s.users.total) })} />
          <Figure icon={GraduationCap} label={h('fig.learning')} value={num(s.enrollments.active)} note={h('fig.finished', { n: num(s.enrollments.completed) })} />
          <Figure icon={ClipboardList} label={h('fig.working')} value={num(openRequests)} note={h('fig.done', { n: num(s.requests.byStatus.completed ?? 0) })} />
        </div>
      </div>

      {/* التفاصيل — مطويّة افتراضياً */}
      <details className="group rounded-card border border-primary/10 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
          <span>{h('more')}</span>
          <ChevronDown className="h-5 w-5 text-muted transition group-open:rotate-180" />
        </summary>
        <div className="space-y-8 border-t border-primary/10 p-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{h('incomeChart')}</p>
              <Legend items={series} />
            </div>
            <StackedColumns
              ariaLabel={h('incomeChart')}
              series={series}
              formatValue={(n, c) => money(n, c)}
              data={s.revenue.map((r) => ({ key: r.month, label: fmtMonth(r.month, lang), values: [r.courses, r.services] }))}
            />
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 font-semibold text-ink"><BookOpen className="h-4 w-4 text-primary" /> {t('adminHome.courses.title')}</p>
            {s.topCourses.length ? (
              <HBars formatValue={num} rows={s.topCourses.map((c, i) => ({ key: String(i), label: pick(c.title, lang), value: c.enrollments }))} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="h-4 w-4" /> {t('adminHome.courses.empty')}</p>
            )}
          </div>
        </div>
      </details>
    </section>
  )
}
