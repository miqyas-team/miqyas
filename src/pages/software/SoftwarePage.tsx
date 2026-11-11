import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Database, Download, ExternalLink, Globe, Headset, Map as MapIcon, Monitor, Puzzle, Search, ShieldCheck } from 'lucide-react'
import { softwareApi, type Dataset, type Software, type SoftwareLicense } from '../../software/api'
import { coursesApi } from '../../courses/api'
import { servicesApi } from '../../services/api'
import { ErrorState, Spinner, useAsync } from '../../components/ui'
import { GisViewer } from '../../components/map/GisViewer'
import { isPreviewable } from '../../components/map/gisFiles'
import { formatSize } from '../services/shared'
import { pick, useLang } from '../../lib/lang'

const licenseStyle: Record<SoftwareLicense, string> = {
  free: 'bg-secondary-100 text-primary',
  trial: 'bg-accent-100 text-accent-700',
  student: 'bg-[#e8e3f7] text-[#4b3b8f]',
  paid: 'bg-sand text-ink',
}

/** إضافات QGIS مفيدة — روابط لمستودع الإضافات الرسمي */
const PLUGINS = [
  { name: 'QuickMapServices', key: 'qms' },
  { name: 'QuickOSM', key: 'quickosm' },
  { name: 'Semi-Automatic Classification', key: 'scp' },
  { name: 'qgis2web', key: 'qgis2web' },
  { name: 'MMQGIS', key: 'mmqgis' },
] as const

/** مصادر بيانات مفتوحة */
const SOURCES = [
  { name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/', key: 'osm' },
  { name: 'Geofabrik — GCC', url: 'https://download.geofabrik.de/asia/gcc-states.html', key: 'geofabrik' },
  { name: 'USGS EarthExplorer', url: 'https://earthexplorer.usgs.gov/', key: 'usgs' },
  { name: 'Copernicus Browser', url: 'https://browser.dataspace.copernicus.eu/', key: 'copernicus' },
  { name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', key: 'naturalearth' },
  { name: 'البيانات المفتوحة — السعودية', url: 'https://open.data.gov.sa/', key: 'ksa' },
] as const

export function SoftwarePage() {
  const { t } = useTranslation()
  const sw = useAsync(() => softwareApi.listSoftware('public'), [])
  const ds = useAsync(() => softwareApi.listDatasets('public'), [])
  const courses = useAsync(() => coursesApi.listCourses(), [])
  const types = useAsync(() => servicesApi.listServiceTypes(), [])
  const install = (types.data ?? []).find((s) => s.slug === 'software-install')
  const [q, setQ] = useState('')
  const [license, setLicense] = useState<SoftwareLicense | 'all'>('all')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (sw.data ?? []).filter((s) => (license === 'all' || s.license === license) && (!needle || `${s.name} ${s.description.ar} ${s.description.en}`.toLowerCase().includes(needle)))
  }, [sw.data, q, license])

  const courseBySlug = useMemo(() => new Map((courses.data ?? []).map((c) => [c.slug, c])), [courses.data])

  return (
    <>
      <section className="contour-bg border-b border-primary/10">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-bold text-primary">{t('software.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted">{t('software.subtitle')}</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-xs font-medium text-ink/80">
            <ShieldCheck className="h-4 w-4 text-secondary-700" /> {t('software.officialOnly')}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-60 flex-1 sm:max-w-sm">
            <span className="sr-only">{t('software.search')}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('software.search')} className="w-full rounded-full border border-primary/15 bg-white py-2.5 pe-4 ps-9 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20" />
          </label>
          {(['all', 'free', 'trial', 'student', 'paid'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={license === l} onClick={() => setLicense(l)} className={`rounded-full px-3 py-2 text-sm font-medium ${license === l ? 'bg-primary text-white' : 'border border-primary/15 bg-white'}`}>
              {l === 'all' ? t('requests.filters.all') : t(`software.license.${l}`)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {sw.loading && !sw.data ? <Spinner /> : sw.error ? <ErrorState onRetry={sw.reload} /> : (
            <div className="grid gap-5 md:grid-cols-2">
              {rows.map((s) => <SoftwareCard key={s.id} s={s} price={install?.price ?? null} courseTitle={(slug) => courseBySlug.get(slug)} />)}
            </div>
          )}
        </div>
      </section>

      {/* بيانات للتدريب */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="flex items-center gap-2 text-2xl font-bold text-primary"><Database className="h-6 w-6 text-accent" /> {t('software.datasets.title')}</h2>
          <p className="mt-1 text-muted">{t('software.datasets.subtitle')}</p>
          <div className="mt-6">
            {ds.loading && !ds.data ? <Spinner /> : !(ds.data ?? []).length ? (
              <p className="text-sm text-muted">{t('software.datasets.empty')}</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">{(ds.data ?? []).map((d) => <DatasetCard key={d.id} d={d} />)}</div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-2">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-primary"><Puzzle className="h-5 w-5 text-accent" /> {t('software.plugins.title')}</h2>
          <ul className="mt-4 space-y-2">
            {PLUGINS.map((p) => (
              <li key={p.key} className="rounded-2xl border border-primary/10 bg-white px-4 py-3">
                <p className="font-semibold" dir="ltr">{p.name}</p>
                <p className="text-sm text-muted">{t(`software.plugins.items.${p.key}`)}</p>
              </li>
            ))}
          </ul>
          <a href="https://plugins.qgis.org/plugins/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            plugins.qgis.org <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-primary"><Globe className="h-5 w-5 text-accent" /> {t('software.sources.title')}</h2>
          <ul className="mt-4 space-y-2">
            {SOURCES.map((s) => (
              <li key={s.key}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-start justify-between gap-3 rounded-2xl border border-primary/10 bg-white px-4 py-3 hover:border-secondary">
                  <span>
                    <span className="block font-semibold">{s.name}</span>
                    <span className="block text-sm text-muted">{t(`software.sources.items.${s.key}`)}</span>
                  </span>
                  <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-muted" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}

function SoftwareCard({ s, price, courseTitle }: { s: Software; price: number | null; courseTitle: (slug: string) => { slug: string; title: { ar: string; en: string } } | undefined }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const installSteps = pick(s.install, lang).split('\n').map((x) => x.trim()).filter(Boolean)
  const related = s.courseSlugs.map(courseTitle).filter((c): c is NonNullable<typeof c> => Boolean(c))

  return (
    <article className="flex flex-col rounded-card border border-primary/10 bg-white p-6">
      <div className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-white" dir="ltr">{s.name.slice(0, 2)}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold" dir="ltr">{s.name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${licenseStyle[s.license]}`}>{t(`software.license.${s.license}`)}</span>
            <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs">{t(`software.category.${s.category}`)}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              {s.os.includes('web') ? <Globe className="h-3.5 w-3.5" /> : <Monitor className="h-3.5 w-3.5" />}
              {s.os.map((o) => t(`software.os.${o}`)).join(' · ')}
            </span>
          </div>
        </div>
      </div>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-ink/85">{pick(s.description, lang)}</p>

      {installSteps.length > 0 && (
        <div className="mt-4">
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} /> {t('software.howToInstall')}
          </button>
          {open && (
            <ol className="mt-3 space-y-2 border-s-2 border-dashed border-secondary/50 ps-4 text-sm">
              {installSteps.map((st, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[1.6rem] top-0 grid h-5 w-5 place-items-center rounded-full bg-secondary text-[10px] font-bold text-white">{i + 1}</span>
                  <span dir="auto">{st}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4 rounded-xl bg-primary-50/60 px-3 py-2 text-sm">
          <span className="text-muted">{t('software.learnIt')} </span>
          {related.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && '، '}
              <Link to={`/courses/${c.slug}`} className="font-semibold text-primary hover:underline">{pick(c.title, lang)}</Link>
            </span>
          ))}
        </div>
      )}

      {/* التحميل عبر الدعم الفني: طلب خدمة بسعر ثابت ومحادثة مع الفريق */}
      <Link
        to={`/services/request?type=software-install&software=${encodeURIComponent(s.slug)}`}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
      >
        <Download className="h-4 w-4" /> {t('software.requestDownload')}
      </Link>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <Headset className="h-3.5 w-3.5" />
        {price !== null ? t('software.supportPrice', { price: lang === 'ar' ? `${price} ر.س` : `SAR ${price}` }) : t('software.supportNote')}
      </p>
    </article>
  )
}

function DatasetCard({ d }: { d: Dataset }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [map, setMap] = useState(false)
  const fileName = `${d.title.en.replace(/[^\w]+/g, '-').toLowerCase() || 'dataset'}.${d.format.toLowerCase() === 'geojson' ? 'geojson' : d.format.toLowerCase() === 'shapefile' ? 'zip' : 'dat'}`
  const previewable = d.url !== '#' && (d.url.startsWith('data:application/geo') || isPreviewable(d.url.split('?')[0]) || ['geojson', 'kml', 'shapefile'].includes(d.format.toLowerCase()))

  return (
    <article className="rounded-card border border-primary/10 bg-sand/40 p-5">
      <h3 className="font-bold">{pick(d.title, lang)}</h3>
      {pick(d.description, lang) && <p className="mt-1 text-sm text-muted">{pick(d.description, lang)}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-white px-2.5 py-0.5 font-semibold" dir="ltr">{d.format}</span>
        {d.region && <span className="rounded-full bg-white px-2.5 py-0.5">{d.region}</span>}
        {d.license && <span className="rounded-full bg-white px-2.5 py-0.5" dir="ltr">{d.license}</span>}
        {d.sizeBytes ? <span className="rounded-full bg-white px-2.5 py-0.5" dir="ltr">{formatSize(d.sizeBytes)}</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={d.url} download={d.url.startsWith('data:') ? fileName : undefined} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700">
          <Download className="h-3.5 w-3.5" /> {t('software.datasets.download')}
        </a>
        {previewable && (
          <button type="button" onClick={() => setMap((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-white px-4 py-2 text-xs font-semibold text-primary">
            <MapIcon className="h-3.5 w-3.5" /> {t(map ? 'community.hideMap' : 'software.datasets.preview')}
          </button>
        )}
      </div>
      {map && (
        <div className="mt-3">
          <GisViewer height={300} allowUpload={false} files={[{ key: d.id, name: `${pick(d.title, lang)}.${{ shapefile: 'zip', kml: 'kml' }[d.format.toLowerCase()] ?? 'geojson'}`, source: d.url }]} />
        </div>
      )}
    </article>
  )
}
