import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ChevronDown, ClipboardCheck, Eye, FilePlus2, FileUp, Paperclip, Plus, Trash2 } from 'lucide-react'
import {
  newId,
  newLesson,
  newModule,
  newQuestion,
  parseYoutubeId,
  trueFalseOptions,
  type CourseDraft,
  type LessonDraft,
  type QuestionDraft,
} from '../../../courses/draft'
import { pick, useLang } from '../../../lib/lang'
import { BiField, Card, IconButton, Label, TextField, Toggle } from './fields'

type Update = (fn: (d: CourseDraft) => void) => void

function move<T>(arr: T[], i: number, delta: number) {
  const j = i + delta
  if (j < 0 || j >= arr.length) return
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

export function ContentEditor({ draft, update }: { draft: CourseDraft; update: Update }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [openLesson, setOpenLesson] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      {draft.modules.map((m, mi) => (
        <Card
          key={m.id}
          title={`${t('editor.content.module')} ${mi + 1}`}
          actions={
            <div className="flex items-center gap-1">
              <IconButton label={t('editor.moveUp')} disabled={mi === 0} onClick={() => update((d) => move(d.modules, mi, -1))}><ArrowUp className="h-4 w-4" /></IconButton>
              <IconButton label={t('editor.moveDown')} disabled={mi === draft.modules.length - 1} onClick={() => update((d) => move(d.modules, mi, 1))}><ArrowDown className="h-4 w-4" /></IconButton>
              <IconButton
                label={t('editor.content.deleteModule')}
                danger
                onClick={() => {
                  if (confirm(t('editor.content.confirmDeleteModule'))) update((d) => void d.modules.splice(mi, 1))
                }}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          }
        >
          <BiField label={t('editor.content.moduleTitle')} value={m.title} onChange={(v) => update((d) => void (d.modules[mi].title = v))} />

          <ul className="space-y-2">
            {m.lessons.map((l, li) => {
              const open = openLesson === l.id
              return (
                <li key={l.id} className={`rounded-2xl border ${open ? 'border-secondary' : 'border-primary/10'}`}>
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <button type="button" onClick={() => setOpenLesson(open ? null : l.id)} className="flex min-w-0 flex-1 items-center gap-2 text-start" aria-expanded={open}>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
                      <span className="text-xs text-muted">{mi + 1}.{li + 1}</span>
                      <span className="truncate text-sm font-medium">{pick(l.title, lang) || t('editor.untitledLesson')}</span>
                      {l.isPreview && <Eye className="h-3.5 w-3.5 shrink-0 text-secondary-700" aria-label={t('courses.detail.preview')} />}
                      {l.hasQuiz && <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={t('courses.detail.hasQuiz')} />}
                      {l.hasAssignment && <FileUp className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={t('courses.detail.hasAssignment')} />}
                    </button>
                    <IconButton label={t('editor.moveUp')} disabled={li === 0} onClick={() => update((d) => move(d.modules[mi].lessons, li, -1))}><ArrowUp className="h-4 w-4" /></IconButton>
                    <IconButton label={t('editor.moveDown')} disabled={li === m.lessons.length - 1} onClick={() => update((d) => move(d.modules[mi].lessons, li, 1))}><ArrowDown className="h-4 w-4" /></IconButton>
                    <IconButton
                      label={t('editor.content.deleteLesson')}
                      danger
                      onClick={() => {
                        if (confirm(t('editor.content.confirmDeleteLesson'))) update((d) => void d.modules[mi].lessons.splice(li, 1))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  {open && (
                    <div className="border-t border-primary/10 p-4">
                      <LessonEditor lesson={l} onChange={(fn) => update((d) => fn(d.modules[mi].lessons[li]))} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={() => {
              const lesson = newLesson()
              update((d) => void d.modules[mi].lessons.push(lesson))
              setOpenLesson(lesson.id)
            }}
            className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <Plus className="h-4 w-4" /> {t('editor.content.addLesson')}
          </button>
        </Card>
      ))}

      <button
        type="button"
        onClick={() => update((d) => void d.modules.push(newModule()))}
        className="flex w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-primary/20 py-5 font-semibold text-primary hover:border-secondary hover:bg-white"
      >
        <FilePlus2 className="h-5 w-5" /> {t('editor.content.addModule')}
      </button>
    </div>
  )
}

function LessonEditor({ lesson: l, onChange }: { lesson: LessonDraft; onChange: (fn: (l: LessonDraft) => void) => void }) {
  const { t } = useTranslation()
  const [ytInput, setYtInput] = useState(l.youtubeId ?? '')
  const ytInvalid = ytInput.trim() !== '' && !parseYoutubeId(ytInput)

  return (
    <div className="space-y-4">
      <BiField label={t('editor.lesson.title')} value={l.title} onChange={(v) => onChange((x) => void (x.title = v))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <TextField
            label={t('editor.lesson.youtube')}
            hint={t('editor.lesson.youtubeHint')}
            dir="ltr"
            placeholder="https://youtu.be/…"
            value={ytInput}
            onChange={(v) => {
              setYtInput(v)
              onChange((x) => void (x.youtubeId = parseYoutubeId(v)))
            }}
          />
          {ytInvalid && <p className="mt-1 text-xs text-red-600">{t('editor.lesson.youtubeInvalid')}</p>}
          {l.youtubeId && !ytInvalid && (
            <p className="mt-1 text-xs text-secondary-700" dir="ltr">✓ {l.youtubeId}</p>
          )}
        </div>
        <TextField
          label={t('editor.lesson.duration')}
          type="number"
          min={0}
          value={l.durationMin ?? ''}
          onChange={(v) => onChange((x) => void (x.durationMin = v === '' ? null : Math.max(0, Number(v))))}
        />
      </div>
      <BiField label={t('editor.lesson.body')} multiline rows={4} value={l.body} onChange={(v) => onChange((x) => void (x.body = v))} />

      <AttachmentsEditor lesson={l} onChange={onChange} />

      <div className="grid gap-3 rounded-2xl bg-sand/60 p-4 sm:grid-cols-3">
        <Toggle label={t('editor.lesson.preview')} hint={t('editor.lesson.previewHint')} checked={l.isPreview} onChange={(v) => onChange((x) => void (x.isPreview = v))} />
        <Toggle
          label={t('editor.lesson.quiz')}
          checked={l.hasQuiz}
          onChange={(v) =>
            onChange((x) => {
              x.hasQuiz = v
              if (v && !x.questions.length) x.questions.push(newQuestion())
            })
          }
        />
        <Toggle label={t('editor.lesson.assignment')} checked={l.hasAssignment} onChange={(v) => onChange((x) => void (x.hasAssignment = v))} />
      </div>

      {l.hasAssignment && (
        <BiField label={t('editor.lesson.assignmentText')} multiline rows={3} value={l.assignment} onChange={(v) => onChange((x) => void (x.assignment = v))} />
      )}

      {l.hasQuiz && <QuestionsEditor questions={l.questions} onChange={(fn) => onChange((x) => fn(x.questions))} />}
    </div>
  )
}

function AttachmentsEditor({ lesson: l, onChange }: { lesson: LessonDraft; onChange: (fn: (l: LessonDraft) => void) => void }) {
  const { t } = useTranslation()
  return (
    <div>
      <Label>{t('learn.attachments')}</Label>
      <ul className="space-y-1.5">
        {l.attachments.map((a, ai) => (
          <li key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-primary/10 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="h-4 w-4 shrink-0 text-secondary-700" />
              <span className="truncate" dir="ltr">{a.name}</span>
              {a.file && <span className="shrink-0 rounded-full bg-accent-100 px-2 text-[11px] text-accent-700">{t('editor.lesson.pendingUpload')}</span>}
            </span>
            <IconButton label={t('editor.remove')} danger onClick={() => onChange((x) => void x.attachments.splice(ai, 1))}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </li>
        ))}
      </ul>
      <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <Plus className="h-4 w-4" /> {t('editor.lesson.addAttachment')}
        <input
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            onChange((x) => void x.attachments.push(...files.map((f) => ({ id: newId(), name: f.name, sizeBytes: f.size, file: f }))))
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

function QuestionsEditor({ questions, onChange }: { questions: QuestionDraft[]; onChange: (fn: (q: QuestionDraft[]) => void) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3 rounded-2xl border border-secondary/40 bg-secondary-100/30 p-4">
      <p className="flex items-center gap-2 font-semibold text-primary">
        <ClipboardCheck className="h-4 w-4" /> {t('editor.quiz.title')}
      </p>
      {questions.map((q, qi) => (
        <div key={q.id} className="space-y-3 rounded-xl bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">{t('editor.quiz.question', { n: qi + 1 })}</span>
            <div className="flex items-center gap-1">
              <select
                value={q.kind}
                onChange={(e) =>
                  onChange((qs) => {
                    const kind = e.target.value as QuestionDraft['kind']
                    qs[qi].kind = kind
                    qs[qi].options = kind === 'true_false' ? trueFalseOptions() : [{ ar: '', en: '' }, { ar: '', en: '' }, { ar: '', en: '' }]
                    qs[qi].correct = 0
                  })
                }
                className="rounded-lg border border-primary/15 px-2 py-1 text-xs"
                aria-label={t('editor.quiz.kind')}
              >
                <option value="mcq">{t('editor.quiz.mcq')}</option>
                <option value="true_false">{t('editor.quiz.trueFalse')}</option>
              </select>
              <IconButton label={t('editor.moveUp')} disabled={qi === 0} onClick={() => onChange((qs) => move(qs, qi, -1))}><ArrowUp className="h-4 w-4" /></IconButton>
              <IconButton label={t('editor.moveDown')} disabled={qi === questions.length - 1} onClick={() => onChange((qs) => move(qs, qi, 1))}><ArrowDown className="h-4 w-4" /></IconButton>
              <IconButton label={t('editor.remove')} danger onClick={() => onChange((qs) => void qs.splice(qi, 1))}><Trash2 className="h-4 w-4" /></IconButton>
            </div>
          </div>
          <BiField label={t('editor.quiz.prompt')} value={q.prompt} onChange={(v) => onChange((qs) => void (qs[qi].prompt = v))} />

          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-sm font-medium">
              {t('editor.quiz.options')} <span className="text-xs font-normal text-muted">{t('editor.quiz.correctHint')}</span>
            </legend>
            <div className="space-y-2">
              {q.options.map((o, oi) => (
                <div key={oi} className={`flex items-center gap-2 rounded-xl p-1.5 ${q.correct === oi ? 'bg-secondary-100/70' : ''}`}>
                  <input
                    type="radio"
                    name={`correct-${q.id}`}
                    className="h-4 w-4 shrink-0 accent-primary"
                    checked={q.correct === oi}
                    onChange={() => onChange((qs) => void (qs[qi].correct = oi))}
                    aria-label={t('editor.quiz.markCorrect')}
                  />
                  <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
                  <input
                    dir="rtl"
                    lang="ar"
                    value={o.ar}
                    disabled={q.kind === 'true_false'}
                    placeholder="عربي"
                    onChange={(e) => onChange((qs) => void (qs[qi].options[oi].ar = e.target.value))}
                    className="w-full min-w-0 rounded-lg border border-primary/15 bg-white px-3 py-2 text-sm disabled:bg-sand"
                  />
                  <input
                    dir="ltr"
                    lang="en"
                    value={o.en}
                    disabled={q.kind === 'true_false'}
                    placeholder="English"
                    onChange={(e) => onChange((qs) => void (qs[qi].options[oi].en = e.target.value))}
                    className="w-full min-w-0 rounded-lg border border-primary/15 bg-white px-3 py-2 text-sm disabled:bg-sand"
                  />
                  </div>
                  {q.kind === 'mcq' && (
                    <IconButton
                      label={t('editor.remove')}
                      danger
                      disabled={q.options.length <= 2}
                      onClick={() =>
                        onChange((qs) => {
                          qs[qi].options.splice(oi, 1)
                          if (qs[qi].correct >= qs[qi].options.length) qs[qi].correct = 0
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  )}
                </div>
              ))}
            </div>
            {q.kind === 'mcq' && q.options.length < 6 && (
              <button type="button" onClick={() => onChange((qs) => void qs[qi].options.push({ ar: '', en: '' }))} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                <Plus className="h-3.5 w-3.5" /> {t('editor.quiz.addOption')}
              </button>
            )}
          </fieldset>
        </div>
      ))}
      <button type="button" onClick={() => onChange((qs) => void qs.push(newQuestion()))} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <Plus className="h-4 w-4" /> {t('editor.quiz.add')}
      </button>
    </div>
  )
}
