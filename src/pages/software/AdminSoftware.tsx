import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Pencil, Plus, Trash2, Wrench } from 'lucide-react'
import { softwareApi, type Dataset, type OS, type Software, type SoftwareCategory, type SoftwareLicense } from '../../software/api'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { AdminNav } from '../admin/AdminNav'
import { BiField, Card, Label, SelectField, TextField, Toggle } from '../admin/editor/fields'
import { SLUG_RE, slugify } from '../../courses/draft'

const OS_LIST: OS[] = ['windows', 'mac', 'linux', 'web']
const FORMATS = ['GeoJSON', 'Shapefile', 'KML', 'GeoTIFF', 'CSV', 'GeoPackage', 'DWG'] as const

const emptySoftware = (): Omit<Software, 'id'> => ({
  slug: '', name: '', category: 'desktop', license: 'free', os: ['windows'],
  description: { ar: '', en: '' }, install: { ar: '', en: '' }, downloadUrl: 'https://', courseSlugs: [], position: 99, isPublished: true,
})

export function AdminSoftware() {
  const { t } = useTranslation()
  const lang = useLang()
  const sw = useAsync(() => softwareApi.listSoftware('admin'), [])
  const ds = useAsync(() => softwareApi.listDatasets('admin'), [])
  const [editSw, setEditSw] = useState<Software | 'new' | null>(null)
  const [editDs, setEditDs] = useState<Dataset | 'new' | null>(null)

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-primary">{t('software.admin.title')}</h1>
          <p className="text-sm text-muted">{t('software.admin.subtitle')}</p>
        </div>

        {/* البرامج */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold"><Wrench className="h-5 w-5 text-secondary" /> {t('software.admin.software')}</h2>
            <button type="button" onClick={() => setEditSw('new')} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {t('software.admin.addSoftware')}</button>
          </div>
          {editSw && <SoftwareForm initial={editSw === 'new' ? null : editSw} onDone={() => { setEditSw(null); sw.reload() }} />}
          {sw.loading && !sw.data ? <Spinner /> : sw.error ? <ErrorState onRetry={sw.reload} /> : (
            <ul className="mt-3 space-y-2">
              {(sw.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-3 rounded-card border border-primary/10 bg-white px-4 py-3">
                  <span className="w-6 text-center text-xs text-muted">{s.position}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold" dir="ltr">{s.name}</span>
                    <span className="block truncate text-xs text-muted">{t(`software.license.${s.license}`)} · {s.downloadUrl}</span>
                  </span>
                  {!s.isPublished && <span className="rounded-full bg-sand px-2.5 py-0.5 text-xs text-muted">{t('admin.courses.draft')}</span>}
                  <button type="button" onClick={() => setEditSw(s)} className="rounded-lg p-2 text-muted hover:bg-primary-50 hover:text-primary" aria-label={t('admin.courses.edit')}><Pencil className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* البيانات */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-bold"><Database className="h-5 w-5 text-accent" /> {t('software.datasets.title')}</h2>
            <button type="button" onClick={() => setEditDs('new')} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> {t('software.admin.addDataset')}</button>
          </div>
          {editDs && <DatasetForm initial={editDs === 'new' ? null : editDs} onDone={() => { setEditDs(null); ds.reload() }} />}
          {ds.loading && !ds.data ? <Spinner /> : (
            <ul className="mt-3 space-y-2">
              {(ds.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-card border border-primary/10 bg-white px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{pick(d.title, lang)}</span>
                    <span className="block text-xs text-muted" dir="ltr">{d.format}{d.region ? ` · ${d.region}` : ''}</span>
                  </span>
                  <button type="button" onClick={() => setEditDs(d)} className="rounded-lg p-2 text-muted hover:bg-primary-50 hover:text-primary" aria-label={t('admin.courses.edit')}><Pencil className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  )
}

function SoftwareForm({ initial, onDone }: { initial: Software | null; onDone: () => void }) {
  const { t } = useTranslation()
  const [s, setS] = useState<Omit<Software, 'id'>>(initial ?? emptySoftware())
  const [courses, setCourses] = useState((initial?.courseSlugs ?? []).join(', '))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof Software>(k: K, v: Software[K]) => setS((x) => ({ ...x, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!s.name.trim() || !SLUG_RE.test(s.slug) || !s.description.ar.trim() || !s.description.en.trim()) return setError(t('software.admin.required'))
    if (!/^https:\/\/.+/i.test(s.downloadUrl)) return setError(t('software.admin.httpsOnly'))
    setBusy(true)
    setError(null)
    try {
      await softwareApi.saveSoftware(initial?.id ?? null, { ...s, courseSlugs: courses.split(',').map((c) => c.trim()).filter(Boolean) })
      onDone()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4">
      <Card title={initial ? `${t('admin.courses.edit')}: ${initial.name}` : t('software.admin.addSoftware')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('software.admin.name')} dir="ltr" value={s.name} onChange={(v) => setS((x) => ({ ...x, name: v, slug: initial ? x.slug : slugify(v) }))} />
          <TextField label={t('editor.fields.slug')} dir="ltr" value={s.slug} onChange={(v) => set('slug', v)} />
          <SelectField<SoftwareCategory> label={t('software.admin.category')} value={s.category} onChange={(v) => set('category', v)} options={(['desktop', 'web', 'library', 'survey', 'remote_sensing'] as const).map((v) => ({ value: v, label: t(`software.category.${v}`) }))} />
          <SelectField<SoftwareLicense> label={t('software.admin.licenseLabel')} value={s.license} onChange={(v) => set('license', v)} options={(['free', 'trial', 'student', 'paid'] as const).map((v) => ({ value: v, label: t(`software.license.${v}`) }))} />
        </div>
        <fieldset>
          <Label>{t('software.admin.os')}</Label>
          <div className="flex flex-wrap gap-3 text-sm">
            {OS_LIST.map((o) => (
              <label key={o} className="inline-flex items-center gap-1.5">
                <input type="checkbox" className="accent-primary" checked={s.os.includes(o)} onChange={(e) => set('os', e.target.checked ? [...s.os, o] : s.os.filter((x) => x !== o))} />
                {t(`software.os.${o}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <BiField label={t('software.admin.description')} multiline rows={2} value={s.description} onChange={(v) => set('description', v)} />
        <BiField label={t('software.howToInstall')} hint={t('editor.fields.outcomesHint')} multiline rows={4} value={s.install} onChange={(v) => set('install', v)} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><TextField label={t('software.admin.url')} hint={t('software.admin.urlHint')} dir="ltr" value={s.downloadUrl} onChange={(v) => set('downloadUrl', v)} /></div>
          <TextField label={t('software.admin.position')} type="number" value={s.position} onChange={(v) => set('position', Number(v) || 0)} />
        </div>
        <TextField label={t('software.admin.courses')} hint={t('software.admin.coursesHint')} dir="ltr" value={courses} onChange={setCourses} />
        <Toggle label={t('editor.fields.published')} checked={s.isPublished} onChange={(v) => set('isPublished', v)} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="py-2">{t('editor.save')}</Button>
            <Button type="button" variant="outline" className="py-2" onClick={onDone}>{t('common.close')}</Button>
          </div>
          {initial && (
            <button type="button" onClick={async () => { if (confirm(t('software.admin.confirmDelete'))) { await softwareApi.removeSoftware(initial.id); onDone() } }} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
              <Trash2 className="h-4 w-4" /> {t('editor.remove')}
            </button>
          )}
        </div>
      </Card>
    </form>
  )
}

function DatasetForm({ initial, onDone }: { initial: Dataset | null; onDone: () => void }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState(initial?.title ?? { ar: '', en: '' })
  const [description, setDescription] = useState(initial?.description ?? { ar: '', en: '' })
  const [region, setRegion] = useState(initial?.region ?? '')
  const [format, setFormat] = useState(initial?.format ?? 'GeoJSON')
  const [license, setLicense] = useState(initial?.license ?? '')
  const [externalUrl, setExternalUrl] = useState(initial && !initial.url.startsWith('data:') && !initial.url.includes('/storage/') ? initial.url : '')
  const [file, setFile] = useState<File | null>(null)
  const [published, setPublished] = useState(initial?.isPublished ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.ar.trim() || !title.en.trim()) return setError(t('editor.issues.title'))
    if (!initial && !file && !externalUrl.trim()) return setError(t('software.admin.fileOrUrl'))
    if (externalUrl.trim() && !/^https:\/\//i.test(externalUrl.trim())) return setError(t('software.admin.httpsOnly'))
    setBusy(true)
    setError(null)
    try {
      await softwareApi.saveDataset(initial?.id ?? null, { title, description, region: region || null, format, license: license || null, isPublished: published, externalUrl: externalUrl.trim() || null }, file)
      onDone()
    } catch {
      setError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mb-4">
      <Card title={initial ? t('admin.courses.edit') : t('software.admin.addDataset')}>
        <BiField label={t('software.admin.datasetTitle')} value={title} onChange={setTitle} />
        <BiField label={t('software.admin.description')} multiline rows={2} value={description} onChange={setDescription} />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label={t('software.admin.region')} value={region} onChange={setRegion} />
          <SelectField label={t('software.admin.format')} value={format as (typeof FORMATS)[number]} onChange={setFormat} options={FORMATS.map((f) => ({ value: f, label: f }))} />
          <TextField label={t('software.admin.dataLicense')} dir="ltr" placeholder="CC BY 4.0" value={license} onChange={setLicense} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>{t('software.admin.file')}</Label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
          </div>
          <TextField label={t('software.admin.externalUrl')} dir="ltr" placeholder="https://…" value={externalUrl} onChange={setExternalUrl} />
        </div>
        <Toggle label={t('editor.fields.published')} checked={published} onChange={setPublished} />
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="submit" loading={busy} className="py-2">{t('editor.save')}</Button>
            <Button type="button" variant="outline" className="py-2" onClick={onDone}>{t('common.close')}</Button>
          </div>
          {initial && (
            <button type="button" onClick={async () => { if (confirm(t('software.admin.confirmDelete'))) { await softwareApi.removeDataset(initial.id); onDone() } }} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
              <Trash2 className="h-4 w-4" /> {t('editor.remove')}
            </button>
          )}
        </div>
      </Card>
    </form>
  )
}
