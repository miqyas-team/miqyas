import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardCheck, FileUp, Paperclip, RotateCcw, XCircle } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import type { Attachment, LessonContent, QuizResult, Submission } from '../../courses/types'
import { Alert, Button } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'

export function VideoPlayer({ youtubeId, title }: { youtubeId: string | null; title: string }) {
  const { t } = useTranslation()
  if (!youtubeId) {
    return (
      <div className="contour-bg grid aspect-video place-items-center rounded-card bg-ink text-center text-white/80">
        <div>
          <p className="text-lg font-semibold text-white">{t('learn.videoSoon')}</p>
          <p className="mt-1 text-sm">{t('learn.videoSoonText')}</p>
        </div>
      </div>
    )
  }
  // youtube-nocookie: لا تُحفظ ملفات تعريف قبل التشغيل؛ rel=0 يقلّل الاقتراحات الخارجية
  return (
    <div className="aspect-video overflow-hidden rounded-card bg-ink">
      <iframe
        className="h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0&modestbranding=1`}
        title={title}
        allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`
}

export function Attachments({ items }: { items: Attachment[] }) {
  const { t } = useTranslation()
  if (!items.length) return null
  return (
    <section>
      <h3 className="mb-3 font-bold">{t('learn.attachments')}</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id}>
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-white px-4 py-3 text-sm hover:border-secondary">
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="h-4 w-4 shrink-0 text-secondary-700" />
                <span className="truncate" dir="ltr">{a.name}</span>
              </span>
              <span className="shrink-0 text-xs text-muted" dir="ltr">{formatSize(a.sizeBytes)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Quiz({ content, onDone }: { content: LessonContent; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const { questions } = content
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (answers.some((a) => a === null)) return setError(t('learn.quiz.answerAll'))
    setBusy(true)
    setError(null)
    try {
      setResult(await coursesApi.submitQuiz(content.lesson.id, answers))
      onDone()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  function retry() {
    setAnswers(questions.map(() => null))
    setResult(null)
  }

  return (
    <section className="rounded-card border border-primary/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardCheck className="h-5 w-5 text-secondary-700" /> {t('learn.quiz.title')}
        </h3>
        {content.bestScore !== null && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${content.quizPassed ? 'bg-secondary-100 text-primary' : 'bg-accent-100 text-accent-700'}`}>
            {t('learn.quiz.best', { score: content.bestScore })}
          </span>
        )}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-6">
        {questions.map((q, qi) => {
          const verdict = result?.results[qi]
          return (
            <fieldset key={q.id} disabled={Boolean(result)}>
              <legend className="mb-3 flex gap-2 font-semibold">
                <span className="text-muted">{qi + 1}.</span>
                {pick(q.prompt, lang)}
                {verdict === true && <CheckCircle2 className="h-5 w-5 shrink-0 text-secondary-700" />}
                {verdict === false && <XCircle className="h-5 w-5 shrink-0 text-red-500" />}
              </legend>
              <div className={`grid gap-2 ${q.kind === 'true_false' ? 'grid-cols-2' : ''}`}>
                {q.options.map((o, oi) => (
                  <label
                    key={oi}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                      answers[qi] === oi ? 'border-secondary bg-secondary-100/50' : 'border-primary/10 hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      className="accent-primary"
                      checked={answers[qi] === oi}
                      onChange={() => setAnswers((a) => a.map((v, i) => (i === qi ? oi : v)))}
                    />
                    {pick(o, lang)}
                  </label>
                ))}
              </div>
            </fieldset>
          )
        })}

        {error && <Alert>{error}</Alert>}
        {result ? (
          <div className="space-y-3">
            <Alert tone={result.passed ? 'success' : 'error'}>
              {t(result.passed ? 'learn.quiz.passed' : 'learn.quiz.failed', { score: result.score, pass: result.passScore })}
            </Alert>
            <Button type="button" variant="outline" onClick={retry}>
              <RotateCcw className="h-4 w-4" /> {t('learn.quiz.retry')}
            </Button>
          </div>
        ) : (
          <Button type="submit" loading={busy}>{t('learn.quiz.submit')}</Button>
        )}
      </form>
    </section>
  )
}

const MAX_MB = 25

export function Assignment({ courseId, content, onDone }: { courseId: string; content: LessonContent; onDone: () => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [submission, setSubmission] = useState<Submission | null>(content.submission)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSubmit = !submission || submission.status === 'needs_revision' || submission.status === 'rejected'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return setError(t('learn.assignment.chooseFile'))
    if (file.size > MAX_MB * 1_000_000) return setError(t('learn.assignment.tooLarge', { mb: MAX_MB }))
    setBusy(true)
    setError(null)
    try {
      setSubmission(await coursesApi.submitAssignment(courseId, content.lesson.id, file, note))
      setFile(null)
      setNote('')
      onDone()
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  const statusTone = { submitted: 'info', approved: 'success', needs_revision: 'info', rejected: 'error' } as const

  return (
    <section className="rounded-card border border-primary/10 bg-white p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <FileUp className="h-5 w-5 text-accent" /> {t('learn.assignment.title')}
      </h3>
      {content.assignment && <p className="mt-3 leading-relaxed">{pick(content.assignment, lang)}</p>}

      {submission && (
        <div className="mt-4">
          <Alert tone={statusTone[submission.status]}>
            <p className="font-semibold">{t(`learn.assignment.status.${submission.status}`)}</p>
            <p className="mt-1" dir="ltr">{submission.fileName}</p>
            {submission.grade !== null && <p className="mt-1">{t('learn.assignment.grade', { grade: submission.grade })}</p>}
            {submission.feedback && <p className="mt-1">{submission.feedback}</p>}
          </Alert>
        </div>
      )}

      {canSubmit && (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary/20 bg-sand/50 px-4 py-8 text-center text-sm hover:border-secondary">
            <FileUp className="h-8 w-8 text-secondary-700" />
            <span className="font-semibold">{file ? file.name : t('learn.assignment.pick')}</span>
            <span className="text-xs text-muted">{t('learn.assignment.hint', { mb: MAX_MB })}</span>
            <input type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={t('learn.assignment.note')}
            className="w-full rounded-xl border border-primary/15 bg-white px-4 py-3 text-sm outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20"
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={busy}>{t('learn.assignment.submit')}</Button>
        </form>
      )}
    </section>
  )
}
