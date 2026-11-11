import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Headset, Mail, MessageCircleMore, MessagesSquare } from 'lucide-react'
import { servicesApi } from '../../services/api'
import { contactApi } from '../../contact/api'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'
import { StatusChip } from '../services/shared'

type Filter = 'waiting' | 'open' | 'closed'
const SUPPORT_SLUG = 'software-install'

function ago(iso: string, lang: 'ar' | 'en') {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' })
  if (mins < 60) return rtf.format(-mins, 'minute')
  if (mins < 1440) return rtf.format(-Math.floor(mins / 60), 'hour')
  return rtf.format(-Math.floor(mins / 1440), 'day')
}

/** «الدعم الفني»: محادثات طلبات تحميل البرامج في مكان واحد، مع إبراز من ينتظر الرد */
export function AdminSupport() {
  const { t } = useTranslation()
  const lang = useLang()
  const [filter, setFilter] = useState<Filter>('waiting')

  const data = useAsync(async () => {
    const all = (await servicesApi.staffRequests('all')).filter((r) => r.serviceType.slug === SUPPORT_SLUG)
    const latest = await servicesApi.latestMessages(all.map((r) => r.id))
    return { all, latest }
  }, [])
  const msgs = useAsync(() => contactApi.list(), [])
  const unreadContact = (msgs.data ?? []).filter((m) => !m.handled).length

  const groups = useMemo(() => {
    const all = data.data?.all ?? []
    const latest = data.data?.latest ?? {}
    const isClosed = (s: string) => s === 'completed' || s === 'cancelled'
    const open = all.filter((r) => !isClosed(r.status))
    // ينتظر الرد: آخر رسالة من العميل، أو طلب جديد بلا أي رد بعد
    const waiting = open.filter((r) => (latest[r.id] ? latest[r.id].fromClient : true))
    const byActivity = (a: (typeof all)[number], b: (typeof all)[number]) =>
      (latest[b.id]?.createdAt ?? b.updatedAt).localeCompare(latest[a.id]?.createdAt ?? a.updatedAt)
    return {
      waiting: [...waiting].sort(byActivity),
      open: [...open].sort(byActivity),
      closed: all.filter((r) => isClosed(r.status)).sort(byActivity),
    }
  }, [data.data])

  const rows = groups[filter]
  const latest = data.data?.latest ?? {}

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white"><Headset className="h-6 w-6" /></span>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('support.title')}</h1>
            <p className="text-sm text-muted">{t('support.subtitle')}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat icon={MessageCircleMore} label={t('support.stats.waiting')} value={groups.waiting.length} warn={groups.waiting.length > 0} />
          <Stat icon={MessagesSquare} label={t('support.stats.open')} value={groups.open.length} />
          <Link to="/admin/inbox?tab=contact" className="block rounded-card transition hover:-translate-y-0.5">
            <Stat icon={Mail} label={t('support.stats.contact')} value={unreadContact} warn={unreadContact > 0} />
          </Link>
        </div>

        <div role="tablist" className="mt-6 flex gap-2 overflow-x-auto">
          {(['waiting', 'open', 'closed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                filter === f ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-muted hover:text-ink'
              }`}
            >
              {t(`support.filter.${f}`)}
              <span className={`rounded-full px-2 text-xs ${filter === f ? 'bg-white/20' : 'bg-primary-50 text-primary'}`}>{groups[f].length}</span>
            </button>
          ))}
        </div>

        <div className="mt-4">
          {data.loading && !data.data ? (
            <Spinner />
          ) : data.error ? (
            <ErrorState onRetry={data.reload} />
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t(`support.empty.${filter}`)}</div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => {
                const m = latest[r.id]
                const waiting = groups.waiting.includes(r)
                return (
                  <li key={r.id}>
                    <Link
                      to={`/admin/requests/${r.id}`}
                      className={`flex flex-col gap-3 rounded-card border bg-white p-4 transition hover:border-primary/30 hover:shadow-sm sm:flex-row sm:items-center ${waiting ? 'border-accent/50' : 'border-primary/10'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-muted" dir="ltr">#{r.number}</span>
                          <span className="font-semibold">{r.title}</span>
                          <StatusChip status={r.status} />
                          {waiting && <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">{t('support.waitingBadge')}</span>}
                        </span>
                        <span className="mt-1 block text-sm text-muted">
                          {r.clientName || t('support.client')} · {ago(m?.createdAt ?? r.updatedAt, lang)}
                        </span>
                        <span className="mt-1 block truncate text-sm text-ink/80">
                          {m ? `${m.fromClient ? t('support.them') : t('support.you')}: ${m.body}` : t('support.noMessages')}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white">
                        <MessagesSquare className="h-4 w-4" /> {t('support.openChat')}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

function Stat({ icon: Icon, label, value, warn }: { icon: typeof Mail; label: string; value: number; warn?: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-card border bg-white p-4 ${warn ? 'border-accent/50' : 'border-primary/10'}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${warn ? 'bg-accent-100 text-[#8a5f22]' : 'bg-primary-50 text-primary'}`}><Icon className="h-5 w-5" /></span>
      <span>
        <span className="block text-2xl font-semibold">{value}</span>
        <span className="block text-sm text-muted">{label}</span>
      </span>
    </div>
  )
}
