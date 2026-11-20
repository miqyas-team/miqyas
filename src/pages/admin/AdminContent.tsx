import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, Check, ChevronDown, Eye, Pencil, Plus, Trash2, X } from 'lucide-react'
import { CATEGORIES, libraryApi, type Article, type ArticleInput, type Category, type ContentStatus } from '../../library/api'
import { challengeApi, MAX_LEVEL, type AdminQuestion } from '../../challenge/api'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { ArticleBody, categoryTone, formatDay } from '../library/shared'

const STATUSES: ContentStatus[] = ['pending', 'published', 'rejected']
const inputCls = 'w-full rounded-xl border border-primary/15 bg-white px-3 py-2 text-sm outline-none focus:border-primary'

function StatusTabs({ value, onChange, counts }: { value: ContentStatus; onChange: (s: ContentStatus) => void; counts: Record<ContentStatus, number> }) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2 overflow-x-auto">
      {STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          aria-pressed={value === s}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${value === s ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80'}`}
        >
          {t(`content.status.${s}`)} <span className={`ms-1 text-xs ${value === s ? 'text-white/75' : 'text-muted'}`}>{counts[s]}</span>
        </button>
      ))}
    </div>
  )
}

/* ═══════════════ المكتبة العلمية ═══════════════ */

const emptyArticle = (): ArticleInput => ({
  id: `a-${Date.now().toString(36)}`, slug: '', category: 'maps',
  title: { ar: '', en: '' }, summary: { ar: '', en: '' }, body: { ar: '', en: '' }, readMin: 4, isNew: true,
})

function ArticleEditor({ initial, onCancel, onSaved }: { initial: ArticleInput; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [a, setA] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid = a.title.ar.trim() && a.summary.ar.trim() && a.body.ar.trim() && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      await libraryApi.save({ ...a, title: { ar: a.title.ar, en: a.title.en || a.title.ar }, summary: { ar: a.summary.ar, en: a.summary.en || a.summary.ar }, body: { ar: a.body.ar, en: a.body.en || a.body.ar } })
      onSaved()
    } catch (e) {
      setErr(String(e).includes('duplicate') ? t('content.slugTaken') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-card border-2 border-primary/20 bg-white p-5">
      <p className="font-bold text-primary">{initial.isNew ? t('content.newArticle') : t('content.editArticle')}</p>
      <label className="block text-sm font-semibold">{t('content.f.title')}<input className={`${inputCls} mt-1`} value={a.title.ar} onChange={(e) => setA({ ...a, title: { ...a.title, ar: e.target.value } })} /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm font-semibold sm:col-span-1">{t('content.f.slug')}
          <input dir="ltr" className={`${inputCls} mt-1`} value={a.slug} disabled={!initial.isNew} onChange={(e) => setA({ ...a, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })} placeholder="soil-maps" />
        </label>
        <label className="block text-sm font-semibold">{t('content.f.category')}
          <select className={`${inputCls} mt-1`} value={a.category} onChange={(e) => setA({ ...a, category: e.target.value as Category })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`library.cat.${c}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">{t('content.f.readMin')}
          <input type="number" min={1} max={60} className={`${inputCls} mt-1`} value={a.readMin} onChange={(e) => setA({ ...a, readMin: Math.max(1, Number(e.target.value) || 1) })} />
        </label>
      </div>
      <label className="block text-sm font-semibold">{t('content.f.summary')}<textarea rows={2} className={`${inputCls} mt-1`} value={a.summary.ar} onChange={(e) => setA({ ...a, summary: { ...a.summary, ar: e.target.value } })} /></label>
      <label className="block text-sm font-semibold">
        {t('content.f.body')} <span className="font-normal text-muted">— {t('content.f.bodyHint')}</span>
        <textarea rows={14} className={`${inputCls} mt-1 font-mono text-[13px] leading-relaxed`} value={a.body.ar} onChange={(e) => setA({ ...a, body: { ...a.body, ar: e.target.value } })} />
      </label>
      {err && <Alert>{err}</Alert>}
      <div className="flex gap-2">
        <Button loading={busy} disabled={!valid} onClick={save}>{t('content.save')}</Button>
        <Button variant="outline" onClick={onCancel}>{t('content.cancel')}</Button>
      </div>
    </div>
  )
}

function ArticleRow({ a, onChanged, onEdit }: { a: Article; onChanged: () => void; onEdit: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function act(fn: () => Promise<unknown>, after?: (v: unknown) => void) {
    setBusy(true)
    try {
      const v = await fn()
      after?.(v)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-card border border-primary/10 bg-white">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${categoryTone[a.category]}`}>{t(`library.cat.${a.category}`)}</span>
            {a.status === 'published' && a.publishOn && (
              <span className="inline-flex items-center gap-1 text-xs text-secondary-700"><CalendarCheck className="h-3.5 w-3.5" /> {t('content.scheduledFor', { day: formatDay(a.publishOn, lang) })}</span>
            )}
          </div>
          <p className="mt-1.5 font-bold text-ink">{pick(a.title, lang)}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{pick(a.summary, lang)}</p>
          {msg && <p className="mt-2 text-sm font-semibold text-secondary-700">{msg}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-primary/15 px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-sand">
            <Eye className="h-3.5 w-3.5" /> {t('content.preview')} <ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 rounded-full border border-primary/15 px-3 py-1.5 text-xs font-semibold text-ink/80 hover:bg-sand">
            <Pencil className="h-3.5 w-3.5" /> {t('content.edit')}
          </button>
          {a.status !== 'published' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(() => libraryApi.approve(a.id), (d) => setMsg(t('content.approvedFor', { day: formatDay(String(d), lang) })))}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-white hover:brightness-95 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> {t('content.approve')}
            </button>
          )}
          {a.status !== 'rejected' && (
            <button type="button" disabled={busy} onClick={() => act(() => libraryApi.reject(a.id))} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
              <X className="h-3.5 w-3.5" /> {t(a.status === 'published' ? 'content.unpublish' : 'content.reject')}
            </button>
          )}
          {a.status === 'rejected' && (
            <button type="button" disabled={busy} onClick={() => confirm(t('content.confirmDelete')) && act(() => libraryApi.remove(a.id))} className="rounded-full p-1.5 text-red-600 hover:bg-red-50" aria-label={t('content.delete')}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {open && <div className="border-t border-primary/10 bg-sand/40 p-5 text-sm"><ArticleBody text={pick(a.body, lang)} /></div>}
    </li>
  )
}

export function AdminLibrary() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => libraryApi.listAll(), [])
  const [tab, setTab] = useState<ContentStatus>('pending')
  const [editing, setEditing] = useState<ArticleInput | null>(null)

  const counts = useMemo(() => {
    const c = { pending: 0, published: 0, rejected: 0 }
    for (const a of data ?? []) c[a.status]++
    return c
  }, [data])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState onRetry={reload} />

  const list = data
    .filter((a) => a.status === tab)
    .sort((a, b) => (tab === 'published' ? (b.publishOn ?? '').localeCompare(a.publishOn ?? '') : 0))

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('content.libraryTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('content.libraryHint')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/library" className="rounded-full border border-primary/15 bg-white px-4 py-2 text-sm font-semibold text-primary">{t('content.viewLibrary')}</Link>
          <Button onClick={() => setEditing(emptyArticle())}><span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" /> {t('content.newArticle')}</span></Button>
        </div>
      </div>
      {editing && (
        <ArticleEditor
          key={editing.id}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setTab('pending')
            reload()
          }}
        />
      )}
      <StatusTabs value={tab} onChange={setTab} counts={counts} />
      {tab === 'pending' && counts.pending > 0 && <Alert tone="info">{t('content.pendingTip')}</Alert>}
      {list.length === 0 ? (
        <p className="rounded-card border border-dashed border-primary/20 bg-white/60 p-8 text-center text-sm text-muted">{t('content.emptyTab')}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => <ArticleRow key={a.id} a={a} onChanged={reload} onEdit={() => setEditing({ ...a })} />)}
        </ul>
      )}
    </section>
  )
}

/* ═══════════════ بنك أسئلة التحدي ═══════════════ */

const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و']

function QuestionEditor({ initial, onCancel, onSaved }: { initial: AdminQuestion & { isNew?: boolean }; onCancel: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState(initial)
  const [busy, setBusy] = useState(false)
  const options = q.options.map((o) => o.trim())
  const valid = q.prompt.trim() && q.explanation.trim() && options.length >= 2 && options.every(Boolean) && q.correct < options.length

  async function save() {
    setBusy(true)
    try {
      await challengeApi.saveQuestion({ ...q, options })
      onSaved()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-card border-2 border-primary/20 bg-white p-5">
      <p className="font-bold text-primary">{initial.isNew ? t('content.newQuestion') : t('content.editQuestion')}</p>
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <label className="block text-sm font-semibold">{t('content.f.level')}
          <select className={`${inputCls} mt-1`} value={q.level} onChange={(e) => setQ({ ...q, level: Number(e.target.value) })}>
            {Array.from({ length: MAX_LEVEL }, (_, i) => <option key={i} value={i + 1}>{i + 1} — {t(`challenge.levels.${i + 1}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">{t('content.f.prompt')}<input className={`${inputCls} mt-1`} value={q.prompt} onChange={(e) => setQ({ ...q, prompt: e.target.value })} /></label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-semibold">{t('content.f.options')}</legend>
        <div className="space-y-2">
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="correct" checked={q.correct === i} onChange={() => setQ({ ...q, correct: i })} aria-label={t('content.f.correct')} className="h-4 w-4 accent-[var(--color-primary)]" />
              <span className="w-5 text-sm text-muted">{LETTERS[i]}</span>
              <input className={inputCls} value={o} onChange={(e) => setQ({ ...q, options: q.options.map((x, k) => (k === i ? e.target.value : x)) })} />
              {q.options.length > 2 && (
                <button type="button" onClick={() => setQ({ ...q, options: q.options.filter((_, k) => k !== i), correct: q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct })} className="p-1 text-red-600" aria-label={t('content.delete')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
        {q.options.length < 6 && (
          <button type="button" onClick={() => setQ({ ...q, options: [...q.options, ''] })} className="mt-2 text-sm font-semibold text-primary">+ {t('content.addOption')}</button>
        )}
      </fieldset>
      <label className="block text-sm font-semibold">{t('content.f.explanation')}<textarea rows={2} className={`${inputCls} mt-1`} value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} /></label>
      <div className="flex gap-2">
        <Button loading={busy} disabled={!valid} onClick={save}>{t('content.save')}</Button>
        <Button variant="outline" onClick={onCancel}>{t('content.cancel')}</Button>
      </div>
    </div>
  )
}

export function AdminQuestions() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useAsync(() => challengeApi.listQuestions(), [])
  const [level, setLevel] = useState(1)
  const [tab, setTab] = useState<ContentStatus>('pending')
  const [editing, setEditing] = useState<(AdminQuestion & { isNew?: boolean }) | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState onRetry={reload} />

  const inLevel = data.filter((q) => q.level === level)
  const counts = { pending: 0, published: 0, rejected: 0 }
  for (const q of inLevel) counts[q.status]++
  const list = inLevel.filter((q) => q.status === tab)
  const pendingByLevel = (l: number) => data.filter((q) => q.level === l && q.status === 'pending').length

  async function setStatus(ids: string[], s: ContentStatus) {
    setBusy(true)
    try {
      await challengeApi.setStatus(ids, s)
      reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('content.questionsTitle')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{t('content.questionsHint')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/challenge" className="rounded-full border border-primary/15 bg-white px-4 py-2 text-sm font-semibold text-primary">{t('content.viewChallenge')}</Link>
          <Button onClick={() => setEditing({ id: `cq-${Date.now().toString(36)}`, level, prompt: '', options: ['', '', '', ''], correct: 0, explanation: '', status: 'pending', isNew: true })}>
            <span className="inline-flex items-center gap-1"><Plus className="h-4 w-4" /> {t('content.newQuestion')}</span>
          </Button>
        </div>
      </div>

      {editing && <QuestionEditor key={editing.id} initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}

      {/* المستويات */}
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => {
          const p = pendingByLevel(l)
          return (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              title={t(`challenge.levels.${l}`)}
              className={`relative rounded-xl py-2 text-sm font-bold ${level === l ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80'}`}
            >
              {l}
              {p > 0 && <span className="absolute -end-1 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] text-white">{p}</span>}
            </button>
          )
        })}
      </div>
      <p className="text-sm font-semibold text-ink">{t('content.levelLabel', { n: level, name: t(`challenge.levels.${level}`) })}</p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusTabs value={tab} onChange={setTab} counts={counts} />
        {tab === 'pending' && list.length > 0 && (
          <Button loading={busy} onClick={() => confirm(t('content.confirmApproveAll', { count: list.length })) && setStatus(list.map((q) => q.id), 'published')}>
            {t('content.approveAll', { count: list.length })}
          </Button>
        )}
      </div>
      {counts.published < 5 && <Alert tone="info">{t('content.needFive')}</Alert>}

      {list.length === 0 ? (
        <p className="rounded-card border border-dashed border-primary/20 bg-white/60 p-8 text-center text-sm text-muted">{t('content.emptyTab')}</p>
      ) : (
        <ol className="space-y-3">
          {list.map((q) => (
            <li key={q.id} className="rounded-card border border-primary/10 bg-white p-4">
              <p className="font-semibold text-ink">{q.prompt}</p>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i} className={`flex items-center gap-1.5 ${i === q.correct ? 'font-semibold text-secondary-700' : 'text-muted'}`}>
                    {i === q.correct ? <Check className="h-4 w-4 shrink-0" /> : <span className="w-4 shrink-0 text-center text-xs">{LETTERS[i]}</span>} {o}
                  </li>
                ))}
              </ul>
              <p className="mt-2 rounded-lg bg-sand px-3 py-1.5 text-xs text-ink/80">💡 {q.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {q.status !== 'published' && (
                  <button type="button" disabled={busy} onClick={() => setStatus([q.id], 'published')} className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" /> {t('content.approve')}
                  </button>
                )}
                {q.status !== 'rejected' && (
                  <button type="button" disabled={busy} onClick={() => setStatus([q.id], 'rejected')} className="inline-flex items-center gap-1 rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">
                    <X className="h-3.5 w-3.5" /> {t(q.status === 'published' ? 'content.unpublish' : 'content.reject')}
                  </button>
                )}
                <button type="button" onClick={() => setEditing({ ...q })} className="inline-flex items-center gap-1 rounded-full border border-primary/15 px-3 py-1.5 text-xs font-semibold text-ink/80">
                  <Pencil className="h-3.5 w-3.5" /> {t('content.edit')}
                </button>
                {q.status === 'rejected' && (
                  <button type="button" onClick={() => confirm(t('content.confirmDelete')) && challengeApi.removeQuestion(q.id).then(reload)} className="rounded-full p-1.5 text-red-600 hover:bg-red-50" aria-label={t('content.delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
