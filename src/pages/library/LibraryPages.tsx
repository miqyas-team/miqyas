import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BookOpenText, CalendarDays, Clock, Search, Trophy } from 'lucide-react'
import { CATEGORIES, libraryApi, todayStr, type Article, type Category } from '../../library/api'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { usePageMeta } from '../../lib/seo'
import { Placeholder } from '../Placeholder'
import { ArticleBody, categoryTone, formatDay, TodayTopic } from './shared'

/* ─────────── بطاقة موضوع ─────────── */
function ArticleCard({ a }: { a: Article }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <Link to={`/library/${a.slug}`} className="group flex flex-col rounded-card border border-primary/10 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/5">
      <span className={`self-start rounded-full px-2.5 py-1 text-xs font-semibold ${categoryTone[a.category]}`}>{t(`library.cat.${a.category}`)}</span>
      <h3 className="mt-3 font-bold leading-snug text-ink group-hover:text-primary">{pick(a.title, lang)}</h3>
      <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{pick(a.summary, lang)}</p>
      <p className="mt-4 flex items-center gap-3 text-xs text-muted">
        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {t('library.readMin', { count: a.readMin })}</span>
        {a.publishOn && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDay(a.publishOn, lang)}</span>}
      </p>
    </Link>
  )
}

/* ─────────── صفحة المكتبة ─────────── */
export function LibraryPage() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading, error, reload } = useAsync(() => libraryApi.list(), [])
  const [cat, setCat] = useState<Category | 'all'>('all')
  const [q, setQ] = useState('')
  usePageMeta(t('library.title'), t('library.subtitle'))

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (data ?? []).filter((a) => (cat === 'all' || a.category === cat) && (!s || `${pick(a.title, lang)} ${pick(a.summary, lang)}`.toLowerCase().includes(s)))
  }, [data, cat, q, lang])

  if (loading && !data) return <Spinner />
  if (error || !data) return <ErrorState onRetry={reload} />
  const [today, ...rest] = data

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent"><BookOpenText className="h-4 w-4" /> {t('library.kicker')}</p>
        <h1 className="mt-1 text-3xl font-bold text-primary md:text-4xl">{t('library.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t('library.subtitle')}</p>
      </div>

      {today && <TodayTopic a={today} />}

      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
          {(['all', ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              aria-pressed={cat === c}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${cat === c ? 'bg-primary text-white' : 'border border-primary/15 bg-white text-ink/80'}`}
            >
              {c === 'all' ? t('library.all') : t(`library.cat.${c}`)}
            </button>
          ))}
        </div>
        <label className="relative block md:w-80">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('library.search')} className="w-full rounded-full border border-primary/15 bg-white py-2 pe-4 ps-9 text-sm outline-none focus:border-primary" />
        </label>
      </div>

      {list.length === 0 ? (
        <p className="rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">{t('library.empty')}</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {(cat === 'all' && !q ? rest : list).map((a) => <ArticleCard key={a.id} a={a} />)}
        </div>
      )}
      <p className="text-center text-sm text-muted">{t('library.dailyNote')}</p>
    </section>
  )
}

/* ─────────── صفحة الموضوع ─────────── */
export function ArticlePage() {
  const { slug = '' } = useParams()
  const { t } = useTranslation()
  const lang = useLang()
  const { data: a, loading, error, reload } = useAsync(() => libraryApi.get(slug), [slug])
  const more = useAsync(() => libraryApi.list(), [])
  const visible = !!a && a.status === 'published' && !!a.publishOn && a.publishOn <= todayStr()
  usePageMeta(visible ? pick(a.title, lang) : t('library.title'), visible ? pick(a.summary, lang) : undefined)

  if (loading && !a) return <Spinner />
  if (error) return <ErrorState onRetry={reload} />
  if (!a || !visible) return <Placeholder notFound />
  const related = (more.data ?? []).filter((x) => x.id !== a.id && x.category === a.category).slice(0, 3)

  return (
    <article className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-muted">
        <Link to="/library" className="hover:text-primary">{t('library.title')}</Link>
        <span className="mx-2">/</span>
        <span>{t(`library.cat.${a.category}`)}</span>
      </nav>
      <span className={`mt-5 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${categoryTone[a.category]}`}>{t(`library.cat.${a.category}`)}</span>
      <h1 className="mt-3 text-3xl font-bold leading-tight text-primary md:text-4xl">{pick(a.title, lang)}</h1>
      <p className="mt-3 text-lg text-muted">{pick(a.summary, lang)}</p>
      <p className="mt-4 flex flex-wrap items-center gap-4 border-b border-primary/10 pb-6 text-sm text-muted">
        <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" /> {t('library.readMin', { count: a.readMin })}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {formatDay(a.publishOn!, lang)}</span>
      </p>

      <div className="mt-8 text-[17px]"><ArticleBody text={pick(a.body, lang)} /></div>

      {/* دعوة للتحدي والدورات */}
      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        <Link to="/challenge" className="flex items-center gap-3 rounded-card border border-accent/30 bg-accent-100/50 p-5 hover:brightness-95">
          <Trophy className="h-8 w-8 shrink-0 text-accent-700" />
          <span>
            <span className="block font-bold text-ink">{t('library.ctaChallenge')}</span>
            <span className="text-sm text-muted">{t('library.ctaChallengeHint')}</span>
          </span>
        </Link>
        <Link to="/courses" className="flex items-center gap-3 rounded-card border border-primary/15 bg-white p-5 hover:bg-primary-50/50">
          <BookOpenText className="h-8 w-8 shrink-0 text-primary" />
          <span>
            <span className="block font-bold text-ink">{t('library.ctaCourses')}</span>
            <span className="text-sm text-muted">{t('library.ctaCoursesHint')}</span>
          </span>
        </Link>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-ink">{t('library.related')}</h2>
          <div className="grid gap-4 sm:grid-cols-3">{related.map((x) => <ArticleCard key={x.id} a={x} />)}</div>
        </section>
      )}
    </article>
  )
}
