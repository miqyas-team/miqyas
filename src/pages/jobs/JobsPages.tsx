import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Briefcase, Building2, CalendarClock, ExternalLink, GraduationCap, MapPin, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { isExpired, jobsApi, normalizeApply, type JobInput, type JobKind, type JobPost, type WorkMode } from '../../jobs/api'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { useLang } from '../../lib/lang'
import { Placeholder } from '../Placeholder'
import { usePageMeta } from '../../lib/seo'
import { AdminNav } from '../admin/AdminNav'
import { Card, SelectField, TextField, Toggle } from '../admin/editor/fields'

function KindChip({ kind }: { kind: JobKind }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${kind === 'job' ? 'bg-primary-50 text-primary' : 'bg-accent-100 text-[#8a5f22]'}`}>
      {kind === 'job' ? <Briefcase className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
      {t(`jobs.kind.${kind}`)}
    </span>
  )
}

function Meta({ j }: { j: JobPost }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4" /> {j.organization}</span>
      {j.city && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {j.city}</span>}
      <span>{t(`jobs.mode.${j.workMode}`)}</span>
      {j.deadline && (
        <span className={`inline-flex items-center gap-1.5 ${isExpired(j) ? 'text-red-600' : ''}`}>
          <CalendarClock className="h-4 w-4" />
          {isExpired(j) ? t('jobs.closed') : t('jobs.until', { date: formatDate(j.deadline, lang, { day: 'numeric', month: 'short' }) })}
        </span>
      )}
    </div>
  )
}

/* ───────── القائمة العامة ───────── */
export function JobsPage() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => jobsApi.list('public'), [])
  const [kind, setKind] = useState<JobKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter(
      (j) =>
        (kind === 'all' || j.kind === kind) &&
        (showClosed || !isExpired(j)) &&
        (!needle || `${j.title} ${j.organization} ${j.city ?? ''} ${j.majors.join(' ')}`.toLowerCase().includes(needle)),
    )
  }, [data, kind, q, showClosed])

  return (
    <>
      <section className="contour-bg border-b border-primary/10">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="text-3xl font-bold text-primary">{t('jobs.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t('jobs.subtitle')}</p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1">
            <span className="sr-only">{t('jobs.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('jobs.search')} className="w-full rounded-full border border-primary/15 bg-white py-2.5 pe-4 ps-9 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20" />
          </label>
          {(['all', 'job', 'coop'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full px-3 py-2 text-sm font-medium ${kind === k ? 'bg-primary text-white' : 'border border-primary/15 bg-white'}`}>
              {k === 'all' ? t('requests.filters.all') : t(`jobs.kind.${k}`)}
            </button>
          ))}
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-primary" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> {t('jobs.showClosed')}
        </label>

        <div className="mt-5">
          {loading && !data ? (
            <Spinner />
          ) : error ? (
            <ErrorState onRetry={reload} />
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center text-muted">{t('jobs.empty')}</div>
          ) : (
            <ul className="space-y-3">
              {rows.map((j) => (
                <li key={j.id}>
                  <Link to={`/jobs/${j.id}`} className={`block rounded-card border border-primary/10 bg-white p-5 transition hover:border-secondary hover:shadow-lg ${isExpired(j) ? 'opacity-60' : ''}`}>
                    <KindChip kind={j.kind} />
                    <h2 className="mt-2 text-lg font-bold">{j.title}</h2>
                    <div className="mt-2"><Meta j={j} /></div>
                    {j.majors.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {j.majors.map((m) => <li key={m} className="rounded-full bg-sand px-2.5 py-0.5 text-xs">{m}</li>)}
                      </ul>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-6 text-xs text-muted">{t('jobs.disclaimer')}</p>
      </section>
    </>
  )
}

/* ───────── صفحة الفرصة ───────── */
export function JobDetail() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const { data: j, loading, error, reload } = useAsync(() => jobsApi.get(id), [id])
  usePageMeta(j ? `${j.title} — ${j.organization}` : null, j?.description)
  if (loading && !j) return <Spinner />
  if (error) return <ErrorState onRetry={reload} />
  if (!j || !j.isPublished) return <Placeholder notFound />
  const closed = isExpired(j)
  const isMail = j.applyUrl?.startsWith('mailto:')

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/jobs" className="text-sm text-muted hover:text-primary">{t('jobs.back')}</Link>
      <article className="mt-3 rounded-card border border-primary/10 bg-white p-6">
        <KindChip kind={j.kind} />
        <h1 className="mt-3 text-2xl font-bold text-ink">{j.title}</h1>
        <div className="mt-3"><Meta j={j} /></div>
        <h2 className="mt-6 font-bold">{t('jobs.description')}</h2>
        <p className="mt-2 whitespace-pre-line leading-relaxed text-ink/85" dir="auto">{j.description}</p>
        {j.requirements && (
          <>
            <h2 className="mt-6 font-bold">{t('jobs.requirements')}</h2>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink/85" dir="auto">{j.requirements}</p>
          </>
        )}
        {j.majors.length > 0 && (
          <>
            <h2 className="mt-6 font-bold">{t('jobs.majors')}</h2>
            <ul className="mt-2 flex flex-wrap gap-1.5">{j.majors.map((m) => <li key={m} className="rounded-full bg-sand px-3 py-1 text-sm">{m}</li>)}</ul>
          </>
        )}
        <div className="mt-8 border-t border-primary/10 pt-5">
          {closed ? (
            <Alert>{t('jobs.closedNote')}</Alert>
          ) : j.applyUrl ? (
            <a href={j.applyUrl} target={isMail ? undefined : '_blank'} rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-white hover:bg-primary-700">
              {t(isMail ? 'jobs.applyEmail' : 'jobs.apply')} <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <Alert tone="info">{t('jobs.noApply')}</Alert>
          )}
          <p className="mt-3 text-xs text-muted">{t('jobs.externalNote')}</p>
        </div>
      </article>
      <div className="mt-6 rounded-card bg-primary-50/60 p-5 text-sm">
        {t('jobs.boost')} <Link to="/courses" className="font-semibold text-primary underline">{t('hero.browseCourses')}</Link>
      </div>
    </section>
  )
}

/* ───────── إدارة الفرص ───────── */
const emptyJob = (): JobInput => ({ kind: 'job', title: '', organization: '', city: '', workMode: 'onsite', description: '', requirements: '', majors: [], applyUrl: null, deadline: null, isPublished: true })

export function AdminJobs() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => jobsApi.list('admin'), [])
  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('jobs.admin.title')}</h1>
            <p className="text-sm text-muted">{t('jobs.admin.subtitle')}</p>
          </div>
          <Link to="/admin/jobs/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
            <Plus className="h-4 w-4" /> {t('jobs.admin.new')}
          </Link>
        </div>
        <div className="mt-6">
          {loading && !data ? <Spinner /> : error ? <ErrorState onRetry={reload} /> : !data?.length ? (
            <Alert tone="info">{t('jobs.admin.empty')}</Alert>
          ) : (
            <ul className="space-y-2">
              {data.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 rounded-card border border-primary/10 bg-white px-4 py-3">
                  <KindChip kind={j.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{j.title}</p>
                    <p className="text-xs text-muted">{j.organization} · {formatDate(j.createdAt, lang, { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${!j.isPublished ? 'bg-sand text-muted' : isExpired(j) ? 'bg-red-50 text-red-600' : 'bg-secondary-100 text-primary'}`}>
                    {!j.isPublished ? t('admin.courses.draft') : isExpired(j) ? t('jobs.closed') : t('admin.courses.published')}
                  </span>
                  <Link to={`/admin/jobs/${j.id}`} className="rounded-lg p-2 text-muted hover:bg-primary-50 hover:text-primary" aria-label={t('admin.courses.edit')}><Pencil className="h-4 w-4" /></Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  )
}

export function AdminJobEditor() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const loaded = useAsync(() => (isNew ? Promise.resolve(null) : jobsApi.get(id!)), [id])
  if (loaded.loading) return <><AdminNav /><Spinner /></>
  if (!isNew && !loaded.data) return <Placeholder notFound />
  return <JobForm key={id ?? 'new'} id={isNew ? null : id!} initial={loaded.data ?? emptyJob()} />
}

function JobForm({ id, initial }: { id: string | null; initial: JobInput }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [j, setJ] = useState<JobInput>(initial)
  const [applyInput, setApplyInput] = useState((initial.applyUrl ?? '').replace(/^mailto:/, ''))
  const [majors, setMajors] = useState(initial.majors.join('، '))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof JobInput>(k: K, v: JobInput[K]) => setJ((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (j.title.trim().length < 3 || !j.organization.trim() || j.description.trim().length < 10) return setError(t('jobs.admin.required'))
    setBusy(true)
    setError(null)
    try {
      await jobsApi.save(id, { ...j, applyUrl: normalizeApply(applyInput), majors: majors.split(/[,،]/).map((m) => m.trim()).filter(Boolean) })
      navigate('/admin/jobs')
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  const ta = 'w-full rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20'
  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/admin/jobs" className="text-sm text-muted hover:text-primary">{t('jobs.admin.back')}</Link>
        <h1 className="mt-2 text-2xl font-bold text-primary">{t(id ? 'jobs.admin.edit' : 'jobs.admin.new')}</h1>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <Card>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField<JobKind> label={t('jobs.admin.kind')} value={j.kind} onChange={(v) => set('kind', v)} options={(['job', 'coop'] as const).map((v) => ({ value: v, label: t(`jobs.kind.${v}`) }))} />
              <SelectField<WorkMode> label={t('jobs.admin.mode')} value={j.workMode} onChange={(v) => set('workMode', v)} options={(['onsite', 'remote', 'hybrid'] as const).map((v) => ({ value: v, label: t(`jobs.mode.${v}`) }))} />
            </div>
            <TextField label={t('jobs.admin.jobTitle')} value={j.title} onChange={(v) => set('title', v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('jobs.admin.organization')} value={j.organization} onChange={(v) => set('organization', v)} />
              <TextField label={t('jobs.admin.city')} value={j.city ?? ''} onChange={(v) => set('city', v)} />
            </div>
            <div>
              <label htmlFor="job-desc" className="mb-1.5 block text-sm font-medium">{t('jobs.description')}</label>
              <textarea id="job-desc" rows={6} value={j.description} onChange={(e) => set('description', e.target.value)} className={ta} />
            </div>
            <div>
              <label htmlFor="job-req" className="mb-1.5 block text-sm font-medium">{t('jobs.requirements')}</label>
              <textarea id="job-req" rows={4} value={j.requirements ?? ''} onChange={(e) => set('requirements', e.target.value)} className={ta} />
            </div>
            <TextField label={t('jobs.majors')} hint={t('jobs.admin.majorsHint')} value={majors} onChange={setMajors} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('jobs.admin.apply')} hint={t('jobs.admin.applyHint')} dir="ltr" value={applyInput} onChange={setApplyInput} placeholder="https://… / hr@…" />
              <TextField label={t('jobs.admin.deadline')} type="date" value={j.deadline ?? ''} onChange={(v) => set('deadline', v || null)} />
            </div>
            <Toggle label={t('editor.fields.published')} checked={j.isPublished} onChange={(v) => set('isPublished', v)} />
          </Card>
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="submit" loading={busy}>{t('editor.save')}</Button>
            {id && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(t('jobs.admin.confirmDelete'))) return
                  await jobsApi.remove(id)
                  navigate('/admin/jobs')
                }}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline"
              >
                <Trash2 className="h-4 w-4" /> {t('editor.remove')}
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  )
}
