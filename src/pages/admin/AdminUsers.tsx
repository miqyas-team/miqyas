import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { adminApi } from '../../admin/api'
import { useAuth } from '../../auth/AuthProvider'
import type { AppRole } from '../../lib/types'
import { Alert, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'

const ROLES: AppRole[] = ['user', 'instructor', 'team', 'admin']

export function AdminUsers() {
  const { t } = useTranslation()
  const lang = useLang()
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync(() => adminApi.listUsers(), [])
  const [q, setQ] = useState('')
  const [role, setRole] = useState<AppRole | 'all'>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter(
      (u) =>
        (role === 'all' || u.role === role) &&
        (!needle || [u.name, u.email, u.phone, u.organization].some((v) => v?.toLowerCase().includes(needle))),
    )
  }, [data, q, role])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const u of data ?? []) c[u.role] = (c[u.role] ?? 0) + 1
    return c
  }, [data])

  async function change(id: string, name: string, next: AppRole) {
    if ((next === 'admin' || next === 'team') && !confirm(t('adminUsers.confirmElevate', { name, role: t(`roles.${next}`) }))) return
    setBusy(id)
    setMsg(null)
    try {
      await adminApi.setRole(id, next)
      setMsg({ tone: 'success', text: t('adminUsers.changed', { name, role: t(`roles.${next}`) }) })
      reload()
    } catch {
      setMsg({ tone: 'error', text: t('errors.generic') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-primary">{t('adminUsers.title')}</h1>
        <p className="text-sm text-muted">{t('adminUsers.subtitle')}</p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1 sm:max-w-sm">
            <span className="sr-only">{t('adminUsers.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('adminUsers.search')}
              className="w-full rounded-full border border-primary/15 bg-white py-2 pe-4 ps-9 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20"
            />
          </label>
          {(['all', ...ROLES] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole(r)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${role === r ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80'}`}
            >
              {r === 'all' ? t('requests.filters.all') : t(`roles.${r}`)}
              <span className={`ms-1.5 text-xs ${role === r ? 'text-white/70' : 'text-muted'}`}>{counts[r] ?? 0}</span>
            </button>
          ))}
        </div>

        {msg && <div className="mt-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}

        <div className="mt-5">
          {loading && !data ? (
            <Spinner />
          ) : error ? (
            <ErrorState onRetry={reload} />
          ) : (
            <div className="overflow-x-auto rounded-card border border-primary/10 bg-white">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="bg-sand/70 text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{t('adminUsers.col.name')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('adminUsers.col.contact')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('form.organization')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('adminUsers.col.joined')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('adminUsers.col.role')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => {
                    const self = u.id === user?.id
                    return (
                      <tr key={u.id} className="border-t border-primary/5">
                        <td className="px-4 py-3 font-semibold">
                          {u.name || '—'} {self && <span className="ms-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-normal text-primary">{t('adminUsers.you')}</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">
                          <span className="block" dir="ltr">{u.email}</span>
                          {u.phone && <span className="block" dir="ltr">{u.phone}</span>}
                        </td>
                        <td className="px-4 py-3">{u.organization ?? '—'}</td>
                        <td className="px-4 py-3 text-muted">{formatDate(u.createdAt, lang, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            disabled={self || busy === u.id}
                            title={self ? t('adminUsers.selfHint') : undefined}
                            onChange={(e) => change(u.id, u.name, e.target.value as AppRole)}
                            aria-label={t('adminUsers.col.role')}
                            className="rounded-lg border border-primary/15 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">{t('adminUsers.empty')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
