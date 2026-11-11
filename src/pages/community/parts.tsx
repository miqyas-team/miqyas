import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, Flag, ImagePlus, Map as MapIcon, Paperclip, X } from 'lucide-react'
import type { ForumAttachment, ForumPost } from '../../community/api'
import { communityApi, isImageName, MAX_FORUM_FILE_MB } from '../../community/api'
import { Alert, Button } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { GisViewer } from '../../components/map/GisViewer'
import { isPreviewable } from '../../components/map/gisFiles'
import { formatSize } from '../services/shared'
import { useLang } from '../../lib/lang'

export function relTime(iso: string, lang: 'ar' | 'en') {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en', { numeric: 'auto' })
  if (mins < 60) return rtf.format(-Math.max(mins, 0), 'minute')
  if (mins < 60 * 24) return rtf.format(-Math.round(mins / 60), 'hour')
  if (mins < 60 * 24 * 14) return rtf.format(-Math.round(mins / 1440), 'day')
  return formatDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function AuthorLine({ post }: { post: Pick<ForumPost, 'authorName' | 'authorRole' | 'createdAt'> }) {
  const { t } = useTranslation()
  const lang = useLang()
  const staff = post.authorRole === 'team' || post.authorRole === 'admin'
  const instructor = post.authorRole === 'instructor'
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${staff ? 'bg-primary text-white' : 'bg-secondary-100 text-primary'}`}>
        {(post.authorName || '؟').charAt(0)}
      </span>
      <span className="font-semibold text-ink">{post.authorName || t('community.member')}</span>
      {(staff || instructor) && (
        <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${staff ? 'bg-primary text-white' : 'bg-accent-100 text-[#8a5f22]'}`}>
          <BadgeCheck className="h-3 w-3" /> {t(staff ? 'community.badge.team' : 'community.badge.instructor')}
        </span>
      )}
      <span>· {relTime(post.createdAt, lang)}</span>
    </span>
  )
}

export function PostAttachments({ items }: { items: ForumAttachment[] }) {
  const { t } = useTranslation()
  const [showMap, setShowMap] = useState(false)
  const images = items.filter((a) => a.isImage && a.url !== '#')
  const files = items.filter((a) => !a.isImage || a.url === '#')
  const gis = useMemo(() => files.filter((f) => f.url !== '#' && isPreviewable(f.name)).map((f) => ({ key: f.id, name: f.name, source: f.url })), [files])
  if (!items.length) return null
  return (
    <div className="mt-4 space-y-3">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-primary/10">
              <img src={img.url} alt={img.name} loading="lazy" className="h-32 w-auto max-w-[16rem] object-cover" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noopener noreferrer" download={f.name} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/15 bg-white px-2.5 py-1.5 text-xs hover:border-secondary">
                <Paperclip className="h-3.5 w-3.5 text-secondary" /> <span dir="ltr">{f.name}</span>
                <span className="text-muted" dir="ltr">{formatSize(f.sizeBytes)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {gis.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowMap((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
            <MapIcon className="h-4 w-4" /> {t(showMap ? 'community.hideMap' : 'community.showMap')}
          </button>
          {showMap && <div className="mt-2"><GisViewer height={300} files={gis} allowUpload={false} /></div>}
        </div>
      )}
    </div>
  )
}

/** حقل كتابة مشترك للسؤال والرد، مع المرفقات */
export function Composer({
  withTitle = false,
  submitLabel,
  onSubmit,
  placeholder,
}: {
  withTitle?: boolean
  submitLabel: string
  placeholder: string
  onSubmit: (v: { title: string; body: string; files: File[] }) => Promise<void>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const minBody = withTitle ? 10 : 2

  function add(list: FileList | null) {
    const picked = [...(list ?? [])]
    const big = picked.find((f) => f.size > MAX_FORUM_FILE_MB * 1_000_000)
    if (big) setError(t('community.form.tooLarge', { name: big.name, mb: MAX_FORUM_FILE_MB }))
    setFiles((fs) => [...fs, ...picked.filter((f) => f.size <= MAX_FORUM_FILE_MB * 1_000_000)].slice(0, 5))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (withTitle && title.trim().length < 5) return setError(t('community.form.titleShort'))
    if (body.trim().length < minBody) return setError(t('community.form.bodyShort', { n: minBody }))
    setBusy(true)
    try {
      await onSubmit({ title, body, files })
      setTitle('')
      setBody('')
      setFiles([])
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full rounded-xl border border-primary/15 bg-white px-4 py-3 outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20'
  return (
    <form onSubmit={submit} className="space-y-3">
      {withTitle && (
        <div>
          <label htmlFor="cm-title" className="mb-1.5 block text-sm font-medium">{t('community.form.title')}</label>
          <input id="cm-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} placeholder={t('community.form.titlePh')} className={input} />
        </div>
      )}
      <div>
        {withTitle && <label htmlFor="cm-body" className="mb-1.5 block text-sm font-medium">{t('community.form.body')}</label>}
        <textarea id="cm-body" rows={withTitle ? 8 : 4} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} placeholder={placeholder} className={input} />
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-lg bg-sand px-2.5 py-1 text-xs">
              {isImageName(f.name) ? <ImagePlus className="h-3.5 w-3.5 text-secondary" /> : <Paperclip className="h-3.5 w-3.5 text-secondary" />}
              <span dir="ltr">{f.name}</span>
              <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={t('editor.remove')} className="text-red-500"><X className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {error && <Alert>{error}</Alert>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          <ImagePlus className="h-4 w-4" /> {t('community.form.attach')}
          <input type="file" multiple accept="image/*,.pdf,.geojson,.json,.kml,.kmz,.zip" className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </label>
        <Button type="submit" loading={busy} className="py-2.5">{submitLabel}</Button>
      </div>
      <p className="text-xs text-muted">{t('community.form.attachHint', { mb: MAX_FORUM_FILE_MB })}</p>
    </form>
  )
}

export function ReportButton({ threadId, replyId }: { threadId: string; replyId: string | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  if (done) return <span className="text-xs text-secondary">{t('community.report.thanks')}</span>
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-600">
        <Flag className="h-3.5 w-3.5" /> {t('community.report.button')}
      </button>
    )
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (reason.trim().length < 3) return
        setBusy(true)
        try {
          await communityApi.report(threadId, replyId, reason)
          setDone(true)
        } finally {
          setBusy(false)
        }
      }}
      className="flex w-full flex-wrap items-center gap-2"
    >
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={t('community.report.reason')} className="min-w-0 flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs" />
      <button type="submit" disabled={busy || reason.trim().length < 3} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{t('community.report.send')}</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">{t('common.close')}</button>
    </form>
  )
}
