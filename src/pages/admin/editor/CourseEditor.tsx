import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Eye, Plus, Save, Trash2 } from 'lucide-react'
import { courseAdminApi } from '../../../courses/adminApi'
import { newCohort, newCourse, slugify, SLUG_RE, validateDraft, type CourseDraft } from '../../../courses/draft'
import type { Level, Format, Tone } from '../../../courses/types'
import { useAuth } from '../../../auth/AuthProvider'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../../components/ui'
import { pick, useLang } from '../../../lib/lang'
import { Placeholder } from '../../Placeholder'
import { AdminNav } from '../AdminNav'
import { BiField, Card, IconButton, Label, SelectField, TextField, Toggle } from './fields'
import { ContentEditor } from './ContentEditor'

type Tab = 'basics' | 'content' | 'cohorts'

export function CourseEditorPage() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const loaded = useAsync(() => (isNew ? Promise.resolve(newCourse()) : courseAdminApi.getDraft(id!)), [id])

  if (loaded.loading) return <><AdminNav /><Spinner /></>
  if (loaded.error) return <><AdminNav /><ErrorState onRetry={loaded.reload} /></>
  if (!loaded.data) return <Placeholder notFound />
  return <CourseEditor key={loaded.data.id} initial={loaded.data} />
}

function CourseEditor({ initial }: { initial: CourseDraft }) {
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const base = isAdmin ? '/admin' : '/instructor'

  const [draft, setDraft] = useState<CourseDraft>(initial)
  const [dirty, setDirty] = useState(initial.isNew)
  const [tab, setTab] = useState<Tab>('basics')
  const [saving, setSaving] = useState(false)
  const location = useLocation()
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    (location.state as { saved?: boolean } | null)?.saved ? { tone: 'success', text: t('editor.saved') } : null,
  )
  const [slugTouched, setSlugTouched] = useState(!initial.isNew)
  const instructors = useAsync(() => (isAdmin ? courseAdminApi.listInstructors() : Promise.resolve([])), [isAdmin])

  const update = (fn: (d: CourseDraft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      fn(next)
      return next
    })
    setDirty(true)
    setMessage(null)
  }

  // تحذير عند مغادرة الصفحة بتعديلات غير محفوظة
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const issues = useMemo(() => validateDraft(draft), [draft])
  const publishBlocked = issues.publish.length > 0

  async function save() {
    if (issues.blocking.length) {
      setMessage({ tone: 'error', text: t('editor.fixIssues') })
      return
    }
    if (draft.isPublished && publishBlocked) {
      setMessage({ tone: 'error', text: t('editor.cannotPublish') })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const clean = (xs: string[]) => xs.map((s) => s.trim()).filter(Boolean)
      await courseAdminApi.saveDraft({ ...draft, isNew: false, outcomes: { ar: clean(draft.outcomes.ar), en: clean(draft.outcomes.en) } })
      setDirty(false)
      setMessage({ tone: 'success', text: t('editor.saved') })
      if (draft.isNew) navigate(`${base}/courses/${draft.id}`, { replace: true, state: { saved: true } })
      else setDraft((d) => ({ ...d, modules: d.modules.map((m) => ({ ...m, lessons: m.lessons.map((l) => ({ ...l, attachments: l.attachments.map(({ file: _f, ...a }) => a) })) })) }))
    } catch (e) {
      setMessage({ tone: 'error', text: String(e).includes('slug') || String(e).includes('duplicate') ? t('editor.issues.slugTaken') : t('errors.generic') })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!confirm(t('editor.confirmDelete'))) return
    await courseAdminApi.deleteCourse(draft.id)
    setDirty(false)
    navigate(`${base}/courses`)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'basics', label: t('editor.tabs.basics') },
    { key: 'content', label: t('editor.tabs.content') },
    ...(draft.format === 'live' ? [{ key: 'cohorts' as const, label: t('editor.tabs.cohorts') }] : []),
  ]

  return (
    <>
      <AdminNav />
      {/* شريط الحفظ */}
      <div className="sticky top-16 z-30 border-b border-primary/10 bg-sand/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link to={`${base}/courses`} className="text-xs text-muted hover:text-primary">{t('editor.back')}</Link>
            <p className="truncate font-bold text-primary">
              {pick(draft.title, lang) || t('editor.untitled')}
              {dirty && <span className="ms-2 text-xs font-normal text-accent">● {t('editor.unsaved')}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!draft.isNew && draft.isPublished && (
              <Link to={`/courses/${draft.slug}`} target="_blank" className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 px-4 py-2 text-sm font-semibold text-primary hover:bg-white">
                <Eye className="h-4 w-4" /> {t('admin.courses.view')}
              </Link>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty} className="py-2">
              <Save className="h-4 w-4" /> {t('editor.save')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-5">
          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          <div role="tablist" className="flex gap-1 rounded-full bg-white p-1 shadow-sm">
            {tabs.map((x) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={tab === x.key}
                type="button"
                onClick={() => setTab(x.key)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${tab === x.key ? 'bg-primary text-white' : 'text-muted hover:text-ink'}`}
              >
                {x.label}
              </button>
            ))}
          </div>

          {tab === 'basics' && (
            <>
              <Card title={t('editor.sections.identity')}>
                <BiField
                  label={t('editor.fields.title')}
                  value={draft.title}
                  onChange={(v) =>
                    update((d) => {
                      d.title = v
                      if (!slugTouched) d.slug = slugify(v.en)
                    })
                  }
                />
                <div>
                  <TextField
                    label={t('editor.fields.slug')}
                    hint={t('editor.fields.slugHint')}
                    dir="ltr"
                    value={draft.slug}
                    onChange={(v) => {
                      setSlugTouched(true)
                      update((d) => void (d.slug = v.toLowerCase().replace(/\s+/g, '-')))
                    }}
                  />
                  {draft.slug && !SLUG_RE.test(draft.slug) && <p className="mt-1 text-xs text-red-600">{t('editor.issues.slug')}</p>}
                  <p className="mt-1 text-xs text-muted" dir="ltr">/courses/{draft.slug || '…'}</p>
                </div>
                <BiField label={t('editor.fields.summary')} hint={t('editor.fields.summaryHint')} value={draft.summary} onChange={(v) => update((d) => void (d.summary = v))} />
                <BiField label={t('editor.fields.description')} multiline rows={5} value={draft.description} onChange={(v) => update((d) => void (d.description = v))} />
                <BiField
                  label={t('editor.fields.outcomes')}
                  hint={t('editor.fields.outcomesHint')}
                  multiline
                  rows={4}
                  value={{ ar: draft.outcomes.ar.join('\n'), en: draft.outcomes.en.join('\n') }}
                  onChange={(v) =>
                    update((d) => {
                      d.outcomes = { ar: v.ar.split('\n'), en: v.en.split('\n') }
                    })
                  }
                />
              </Card>

              <Card title={t('editor.sections.settings')}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField<Level>
                    label={t('courses.filters.level')}
                    value={draft.level}
                    onChange={(v) => update((d) => void (d.level = v))}
                    options={(['beginner', 'intermediate', 'advanced'] as const).map((v) => ({ value: v, label: t(`home.courses.level.${v}`) }))}
                  />
                  <SelectField<Format>
                    label={t('courses.filters.type')}
                    value={draft.format}
                    onChange={(v) => update((d) => void (d.format = v))}
                    options={(['recorded', 'live'] as const).map((v) => ({ value: v, label: t(`home.courses.format.${v}`) }))}
                  />
                  <TextField
                    label={t('editor.fields.software')}
                    hint={t('editor.fields.softwareHint')}
                    dir="ltr"
                    value={draft.software.join(', ')}
                    onChange={(v) => update((d) => void (d.software = v.split(',').map((s) => s.trim()).filter(Boolean)))}
                  />
                  <SelectField<Tone>
                    label={t('editor.fields.tone')}
                    value={draft.tone}
                    onChange={(v) => update((d) => void (d.tone = v))}
                    options={(['primary', 'secondary', 'accent', 'ink'] as const).map((v) => ({ value: v, label: t(`editor.tones.${v}`) }))}
                  />
                  <TextField label={t('editor.fields.price')} hint={t('editor.fields.priceHint')} type="number" min={0} value={draft.price} onChange={(v) => update((d) => void (d.price = Math.max(0, Number(v) || 0)))} />
                  <TextField label={t('editor.fields.hours')} type="number" min={0} value={draft.hours} onChange={(v) => update((d) => void (d.hours = Math.max(0, Number(v) || 0)))} />
                  <TextField label={t('editor.fields.passScore')} type="number" min={0} max={100} value={draft.passScore} onChange={(v) => update((d) => void (d.passScore = Math.min(100, Math.max(0, Number(v) || 0))))} />
                </div>
              </Card>

              <Card title={t('editor.sections.instructor')}>
                {isAdmin && (
                  <div>
                    <Label hint={t('editor.fields.instructorAccountHint')}>{t('editor.fields.instructorAccount')}</Label>
                    <select
                      value={draft.instructorId ?? ''}
                      onChange={(e) => update((d) => void (d.instructorId = e.target.value || null))}
                      className="w-full rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm"
                    >
                      <option value="">{t('editor.fields.noInstructor')}</option>
                      {(instructors.data ?? []).map((i) => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <BiField label={t('editor.fields.instructorName')} value={draft.instructorName} onChange={(v) => update((d) => void (d.instructorName = v))} />
                <BiField label={t('editor.fields.instructorBio')} multiline rows={3} value={draft.instructorBio} onChange={(v) => update((d) => void (d.instructorBio = v))} />
              </Card>
            </>
          )}

          {tab === 'content' && <ContentEditor draft={draft} update={update} />}

          {tab === 'cohorts' && (
            <Card
              title={t('editor.tabs.cohorts')}
              actions={
                <button type="button" onClick={() => update((d) => void d.cohorts.push(newCohort()))} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  <Plus className="h-4 w-4" /> {t('editor.cohorts.add')}
                </button>
              }
            >
              {draft.cohorts.length === 0 && <Alert tone="info">{t('editor.cohorts.empty')}</Alert>}
              {draft.cohorts.map((c, ci) => (
                <div key={c.id} className="space-y-3 rounded-2xl border border-primary/10 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{pick(c.name, lang) || t('editor.cohorts.cohort', { n: ci + 1 })}</span>
                    <IconButton label={t('editor.remove')} danger onClick={() => update((d) => void d.cohorts.splice(ci, 1))}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                  <BiField label={t('editor.cohorts.name')} value={c.name} onChange={(v) => update((d) => void (d.cohorts[ci].name = v))} />
                  <div className="grid gap-3 sm:grid-cols-4">
                    <TextField label={t('editor.cohorts.start')} type="date" value={c.startsOn} onChange={(v) => update((d) => void (d.cohorts[ci].startsOn = v))} />
                    <TextField label={t('editor.cohorts.end')} type="date" value={c.endsOn ?? ''} onChange={(v) => update((d) => void (d.cohorts[ci].endsOn = v || null))} />
                    <TextField label={t('editor.cohorts.seats')} type="number" min={1} value={c.seats} onChange={(v) => update((d) => void (d.cohorts[ci].seats = Math.max(1, Number(v) || 1)))} />
                    <SelectField
                      label={t('editor.cohorts.status')}
                      value={c.status}
                      onChange={(v) => update((d) => void (d.cohorts[ci].status = v))}
                      options={(['open', 'full', 'running', 'finished'] as const).map((v) => ({ value: v, label: t(`editor.cohorts.statuses.${v}`) }))}
                    />
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted">{t('editor.cohorts.sessionsNote')}</p>
            </Card>
          )}
        </div>

        {/* الشريط الجانبي: النشر والتحقق */}
        <aside className="space-y-4 lg:sticky lg:top-36 lg:self-start">
          <Card title={t('editor.sections.publishing')}>
            {isAdmin ? (
              <>
                <Toggle
                  label={t('editor.fields.published')}
                  hint={publishBlocked ? t('editor.publishBlockedHint') : t('editor.fields.publishedHint')}
                  checked={draft.isPublished}
                  onChange={(v) => update((d) => void (d.isPublished = v))}
                />
                <Toggle label={t('editor.fields.featured')} hint={t('editor.fields.featuredHint')} checked={draft.isFeatured} onChange={(v) => update((d) => void (d.isFeatured = v))} />
              </>
            ) : (
              <p className="text-sm text-muted">{t(draft.isPublished ? 'editor.instructorPublished' : 'editor.instructorDraft')}</p>
            )}
          </Card>

          {(issues.blocking.length > 0 || issues.publish.length > 0) && (
            <Card title={t('editor.checklist')}>
              <ul className="space-y-2 text-sm">
                {issues.blocking.map((i, n) => (
                  <li key={`b${n}`} className="flex gap-2 text-red-600">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t(i.key, i.params ?? {})}
                  </li>
                ))}
                {issues.publish.map((i, n) => (
                  <li key={`p${n}`} className="flex gap-2 text-[#8a5f22]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t(i.key, i.params ?? {})}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isAdmin && !draft.isNew && (
            <button type="button" onClick={remove} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 hover:underline">
              <Trash2 className="h-4 w-4" /> {t('editor.delete')}
            </button>
          )}
        </aside>
      </div>
    </>
  )
}
