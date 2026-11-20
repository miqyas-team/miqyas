/** أجزاء مشتركة للمكتبة العلمية (تُستخدم في الرئيسية ولوحة الإدارة دون تحميل صفحات المكتبة كاملة) */
import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { todayStr, type Article, type Category } from '../../library/api'
import { pick, useLang } from '../../lib/lang'

/** لون مميز لكل تصنيف */
export const categoryTone: Record<Category, string> = {
  maps: 'bg-primary-50 text-primary',
  data: 'bg-sky-50 text-sky-800',
  coordinates: 'bg-violet-50 text-violet-800',
  remote_sensing: 'bg-amber-50 text-amber-800',
  analysis: 'bg-rose-50 text-rose-800',
  surveying: 'bg-lime-50 text-lime-800',
  tools: 'bg-slate-100 text-slate-700',
}

export function formatDay(day: string, lang: 'ar' | 'en') {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long' }).format(new Date(y, m - 1, d))
}

/* ─────────── عرض النص البسيط (## عنوان، - نقطة، 1. رقم، **غامق**) ─────────── */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i} className="font-bold text-ink">{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  )
}

export function ArticleBody({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(
      <Tag key={blocks.length} className={`space-y-2 ps-6 ${list.ordered ? 'list-decimal' : 'list-disc'} marker:text-secondary-700`}>
        {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>,
    )
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const bullet = line.match(/^-\s+(.*)$/)
    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered
      if (list && list.ordered !== ordered) flush()
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1])
      continue
    }
    flush()
    if (!line) continue
    if (line.startsWith('## ')) blocks.push(<h2 key={blocks.length} className="pt-3 text-xl font-bold text-primary">{line.slice(3)}</h2>)
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="space-y-4 leading-loose text-ink/90">{blocks}</div>
}

/** بطاقة «موضوع اليوم» — للصفحة الرئيسية وأعلى المكتبة */
export function TodayTopic({ a, compact = false }: { a: Article; compact?: boolean }) {
  const { t } = useTranslation()
  const lang = useLang()
  const isToday = a.publishOn === todayStr()
  return (
    <Link to={`/library/${a.slug}`} className="group relative block overflow-hidden rounded-card bg-gradient-to-br from-primary to-primary-700 p-6 text-white md:p-8">
      <div className="contour-bg absolute inset-0 opacity-30 mix-blend-overlay" />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" /> {t(isToday ? 'library.todayTopic' : 'library.latestTopic')} · {t(`library.cat.${a.category}`)}
        </p>
        <h2 className={`mt-4 font-bold leading-tight ${compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl'}`}>{pick(a.title, lang)}</h2>
        <p className="mt-3 max-w-2xl text-white/80">{pick(a.summary, lang)}</p>
        <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-primary transition group-hover:gap-3">
          {t('library.read')} <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
        </span>
      </div>
    </Link>
  )
}

