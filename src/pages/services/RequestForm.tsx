import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileUp, MapPin, Paperclip, X } from 'lucide-react'
import { servicesApi } from '../../services/api'
import { ACCEPTED_FILES, MAX_FILE_MB, type ServiceType } from '../../services/types'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { GisViewer, type LatLng, type ViewerFile } from '../../components/map/GisViewer'
import { isPreviewable } from '../../components/map/gisFiles'
import { softwareApi } from '../../software/api'
import { pick, useLang } from '../../lib/lang'
import { formatSize, PriceLabel, ServiceIcon } from './shared'

const inputCls =
  'w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-4 border-primary/15 focus:border-secondary focus:ring-secondary/20'

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function RequestForm() {
  const types = useAsync(() => servicesApi.listServiceTypes(), [])
  if (types.loading) return <Spinner />
  if (types.error || !types.data) return <ErrorState onRetry={types.reload} />
  return <Form types={types.data} />
}

type Errors = Partial<Record<'type' | 'title' | 'description' | 'location' | 'pledge' | 'files', string>>

function Form({ types }: { types: ServiceType[] }) {
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [typeId, setTypeId] = useState<string | null>(types.find((x) => x.slug === params.get('type'))?.id ?? null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState<LatLng | null>(null)
  const [locationNote, setLocationNote] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [pledge, setPledge] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const type = useMemo(() => types.find((x) => x.id === typeId) ?? null, [types, typeId])

  // قادم من صفحة البرامج: نعبّئ العنوان والوصف باسم البرنامج
  const softwareSlug = params.get('software')
  useEffect(() => {
    if (!softwareSlug) return
    softwareApi.listSoftware('public').then((list) => {
      const sw = list.find((x) => x.slug === softwareSlug)
      if (!sw) return
      setTitle((v) => v || t('requests.form.softwareTitle', { name: sw.name }))
      setDescription((v) => v || t('requests.form.softwareBody', { name: sw.name }))
    })
  }, [softwareSlug, t])
  // ملفات GIS المرفقة تُعرض على خريطة الموقع قبل الإرسال
  const gisFiles = useMemo<ViewerFile[]>(
    () => files.filter((f) => isPreviewable(f.name)).map((f) => ({ key: `${f.name}-${f.size}-${f.lastModified}`, name: f.name, source: f })),
    [files],
  )

  function addFiles(list: FileList | null) {
    const picked = [...(list ?? [])]
    const tooBig = picked.filter((f) => f.size > MAX_FILE_MB * 1_000_000)
    setErrors((e) => ({ ...e, files: tooBig.length ? t('requests.form.tooLarge', { name: tooBig[0].name, mb: MAX_FILE_MB }) : undefined }))
    setFiles((fs) => [...fs, ...picked.filter((f) => f.size <= MAX_FILE_MB * 1_000_000)])
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setServerError(null)
    const v: Errors = {}
    if (!type) v.type = t('requests.form.errors.type')
    if (title.trim().length < 3) v.title = t('requests.form.errors.title')
    if (description.trim().length < 20) v.description = t('requests.form.errors.description')
    if (type?.requiresLocation && !location) v.location = t('requests.form.errors.location')
    if (type?.isAcademic && !pledge) v.pledge = t('requests.form.errors.pledge')
    setErrors(v)
    if (Object.keys(v).length) {
      document.querySelector('[aria-invalid="true"], [data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setBusy(true)
    try {
      const id = await servicesApi.createRequest({
        serviceTypeId: type!.id,
        title,
        description,
        location,
        locationNote,
        dueDate: dueDate || null,
        academicPledge: pledge,
        files,
      })
      navigate(`/app/requests/${id}`, { state: { created: true } })
    } catch {
      setServerError(t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">{t('hero.requestService')}</h1>
      <p className="mt-2 text-muted">{t('requests.form.subtitle')}</p>

      <form onSubmit={onSubmit} noValidate className="mt-8 space-y-8">
        {/* 1. نوع الخدمة */}
        <fieldset data-error={errors.type ? '' : undefined}>
          <legend className="mb-3 text-lg font-bold">1. {t('requests.form.type')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {types.map((s) => {
              const active = s.id === typeId
              return (
                <label
                  key={s.id}
                  className={`flex cursor-pointer gap-3 rounded-2xl border-2 bg-white p-4 transition ${active ? 'border-secondary shadow-md' : 'border-transparent hover:border-primary/20'}`}
                >
                  <input type="radio" name="type" className="sr-only" checked={active} onChange={() => setTypeId(s.id)} />
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-secondary text-white' : 'bg-primary-50 text-primary'}`}>
                    <ServiceIcon type={s} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{pick(s.name, lang)}</span>
                      {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary" />}
                    </span>
                    <span className="mt-1 block text-sm"><PriceLabel type={s} /></span>
                  </span>
                </label>
              )
            })}
          </div>
          {errors.type && <p className="mt-2 text-sm text-red-600">{errors.type}</p>}
          {type && (
            <p className="mt-3 rounded-xl bg-primary-50/60 p-3 text-sm text-ink/80">
              {type.pricing === 'fixed' ? t('requests.form.fixedNote') : t('requests.form.customNote')}
            </p>
          )}
        </fieldset>

        {/* 2. التفاصيل */}
        <fieldset className="space-y-4">
          <legend className="mb-3 text-lg font-bold">2. {t('requests.form.details')}</legend>
          <div>
            <label htmlFor="rq-title" className="mb-1.5 block text-sm font-medium">{t('requests.form.title')}</label>
            <input id="rq-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} aria-invalid={Boolean(errors.title)} placeholder={t('requests.form.titlePh')} className={inputCls} />
            {errors.title && <p className="mt-1 text-sm text-red-600">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="rq-desc" className="mb-1.5 block text-sm font-medium">{t('requests.form.description')}</label>
            <textarea id="rq-desc" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} aria-invalid={Boolean(errors.description)} placeholder={t('requests.form.descriptionPh')} className={inputCls} />
            <div className="mt-1 flex justify-between text-xs">
              <span className="text-red-600">{errors.description}</span>
              <span className={description.trim().length < 20 ? 'text-muted' : 'text-secondary'}>{description.trim().length}/20+</span>
            </div>
          </div>
          <div className="max-w-xs">
            <label htmlFor="rq-due" className="mb-1.5 block text-sm font-medium">
              {t('requests.form.dueDate')} <span className="text-xs font-normal text-muted">({t('form.optional')})</span>
            </label>
            <input id="rq-due" type="date" min={tomorrow()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
          </div>
        </fieldset>

        {/* 3. الموقع */}
        {(!type || type.requiresLocation || location || gisFiles.length > 0) && (
          <fieldset className="space-y-3" data-error={errors.location ? '' : undefined}>
            <legend className="mb-1 text-lg font-bold">
              3. {t('requests.form.location')}{' '}
              {!type?.requiresLocation && <span className="text-sm font-normal text-muted">({t('form.optional')})</span>}
            </legend>
            <p className="text-sm text-muted">{t('requests.form.locationHint')}</p>
            <GisViewer height={380} pick={{ value: location, onChange: setLocation }} files={gisFiles} allowUpload={false} />
            {gisFiles.length > 0 && <p className="text-xs text-secondary">{t('requests.form.filesOnMap', { count: gisFiles.length })}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {location ? (
                <span className="inline-flex items-center gap-1.5 text-secondary" dir="ltr">
                  <MapPin className="h-4 w-4" /> {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </span>
              ) : (
                <span className="text-muted">{t('requests.form.noLocation')}</span>
              )}
              {location && (
                <button type="button" onClick={() => setLocation(null)} className="text-sm font-semibold text-red-600">{t('requests.form.clearLocation')}</button>
              )}
            </div>
            {errors.location && <p className="text-sm text-red-600">{errors.location}</p>}
            <input value={locationNote} onChange={(e) => setLocationNote(e.target.value)} placeholder={t('requests.form.locationNotePh')} className={inputCls} />
          </fieldset>
        )}

        {/* 4. الملفات */}
        <fieldset className="space-y-3">
          <legend className="mb-1 text-lg font-bold">
            4. {t('requests.form.files')} <span className="text-sm font-normal text-muted">({t('form.optional')})</span>
          </legend>
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/20 bg-white px-4 py-8 text-center text-sm hover:border-secondary"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              addFiles(e.dataTransfer.files)
            }}
          >
            <FileUp className="h-8 w-8 text-secondary" />
            <span className="font-semibold">{t('requests.form.dropFiles')}</span>
            <span className="text-xs text-muted" dir="ltr">Shapefile (zip) · KML · GeoJSON · DWG · PDF · {t('requests.form.images')} — {MAX_FILE_MB}MB</span>
            <input type="file" multiple accept={ACCEPTED_FILES} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </label>
          {errors.files && <p className="text-sm text-red-600">{errors.files}</p>}
          {files.length > 0 && (
            <ul className="space-y-1.5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 bg-white px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <Paperclip className="h-4 w-4 shrink-0 text-secondary" />
                    <span className="truncate" dir="ltr">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted" dir="ltr">{formatSize(f.size)}</span>
                  </span>
                  <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={t('editor.remove')} className="rounded-lg p-1 text-red-500 hover:bg-red-50">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">{t('requests.form.shapefileHint')}</p>
        </fieldset>

        {type?.isAcademic && (
          <div data-error={errors.pledge ? '' : undefined}>
            <label className="flex items-start gap-3 rounded-2xl border border-accent/40 bg-accent-100/50 p-4 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={pledge} onChange={(e) => setPledge(e.target.checked)} />
              <span>{t('requests.form.pledge')}</span>
            </label>
            {errors.pledge && <p className="mt-1 text-sm text-red-600">{errors.pledge}</p>}
          </div>
        )}

        {serverError && <Alert>{serverError}</Alert>}
        <Button type="submit" loading={busy} className="w-full sm:w-auto">{t('requests.form.submit')}</Button>
      </form>
    </section>
  )
}
