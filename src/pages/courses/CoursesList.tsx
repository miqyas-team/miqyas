import { useMemo, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import type { CourseSummary } from '../../courses/types'
import { CourseCard } from '../../components/home/CourseCard'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const
const FORMATS = ['recorded', 'live'] as const
const PRICES = ['free', 'paid'] as const

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80 hover:border-primary/40'
      }`}
    >
      {children}
    </button>
  )
}

export function CoursesList() {
  const { t } = useTranslation()
  const lang = useLang()
  const [params, setParams] = useSearchParams()
  const { data, loading, error, reload } = useAsync(() => coursesApi.listCourses(), [])

  const q = params.get('q') ?? ''
  const level = params.get('level')
  const format = params.get('format')
  const price = params.get('price')
  const sw = params.get('software')

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || next.get(key) === value) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const softwareOptions = useMemo(() => [...new Set((data ?? []).flatMap((c) => c.software))].sort(), [data])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter((c: CourseSummary) => {
      if (level && c.level !== level) return false
      if (format && c.format !== format) return false
      if (price === 'free' && c.price > 0) return false
      if (price === 'paid' && c.price === 0) return false
      if (sw && !c.software.includes(sw)) return false
      if (needle) {
        const hay = `${pick(c.title, lang)} ${pick(c.summary, lang)} ${c.software.join(' ')}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [data, q, level, format, price, sw, lang])

  const hasFilters = Boolean(q || level || format || price || sw)

  return (
    <>
      <section className="contour-bg border-b border-primary/10">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h1 className="text-3xl font-bold text-primary md:text-4xl">{t('courses.listTitle')}</h1>
          <p className="mt-2 max-w-2xl text-muted">{t('courses.listSubtitle')}</p>
          <label className="relative mt-6 block max-w-xl">
            <span className="sr-only">{t('courses.search')}</span>
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                const next = new URLSearchParams(params)
                if (e.target.value) next.set('q', e.target.value)
                else next.delete('q')
                setParams(next, { replace: true })
              }}
              placeholder={t('courses.search')}
              className="w-full rounded-full border border-primary/15 bg-white py-3 pe-4 ps-12 outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20"
            />
          </label>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm font-semibold text-muted">{t('courses.filters.level')}</span>
            {LEVELS.map((l) => (
              <Chip key={l} active={level === l} onClick={() => set('level', l)}>{t(`home.courses.level.${l}`)}</Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm font-semibold text-muted">{t('courses.filters.software')}</span>
            {softwareOptions.map((s) => (
              <Chip key={s} active={sw === s} onClick={() => set('software', s)}><span dir="ltr">{s}</span></Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-sm font-semibold text-muted">{t('courses.filters.type')}</span>
            {FORMATS.map((f) => (
              <Chip key={f} active={format === f} onClick={() => set('format', f)}>{t(`home.courses.format.${f}`)}</Chip>
            ))}
            <span className="mx-1 h-5 w-px bg-primary/15" />
            {PRICES.map((p) => (
              <Chip key={p} active={price === p} onClick={() => set('price', p)}>{t(`courses.filters.${p}`)}</Chip>
            ))}
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between text-sm text-muted">
          <span>{loading ? '' : t('courses.resultCount', { count: filtered.length })}</span>
          {hasFilters && (
            <button type="button" onClick={() => setParams({}, { replace: true })} className="inline-flex items-center gap-1 font-semibold text-primary">
              <X className="h-4 w-4" /> {t('courses.clearFilters')}
            </button>
          )}
        </div>

        {loading ? (
          <Spinner />
        ) : error ? (
          <ErrorState onRetry={reload} />
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-card border border-dashed border-primary/20 bg-white/60 p-12 text-center text-muted">
            {t('courses.empty')}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
