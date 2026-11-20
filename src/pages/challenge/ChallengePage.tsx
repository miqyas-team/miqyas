import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, Check, CheckCircle2, ChevronLeft, Flame, Lock, Medal, Star, Trophy, X, XCircle } from 'lucide-react'
import {
  challengeApi, MAX_LEVEL, PASS_SCORE, WINS_TO_LEVEL_UP,
  type ChallengeProgress, type ChallengeQuestion, type ChallengeResult,
} from '../../challenge/api'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, Button, ErrorState, Spinner, useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'
import { usePageMeta } from '../../lib/seo'

/** أسئلة اليوم المحفوظة مع النتيجة: بعد الترقية تتغير أسئلة اليوم، فنعرض المراجعة بالأسئلة التي حُلّت فعلاً */
const QKEY = 'miqyas-challenge-last-q'
function saveSolved(qs: ChallengeQuestion[]) {
  try {
    localStorage.setItem(QKEY, JSON.stringify(qs))
  } catch {
    /* تجاهل */
  }
}
function loadSolved(): ChallengeQuestion[] | null {
  try {
    return JSON.parse(localStorage.getItem(QKEY) ?? 'null')
  } catch {
    return null
  }
}

const num = (n: number, lang: 'ar' | 'en') => new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en').format(n)

/* ─────────── سلّم المستويات ─────────── */
function LevelLadder({ current }: { current: number }) {
  const { t } = useTranslation()
  return (
    <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((lvl) => {
        const done = lvl < current
        const now = lvl === current
        return (
          <li
            key={lvl}
            className={`rounded-xl border p-3 text-center ${now ? 'border-primary bg-primary text-white shadow-lg shadow-primary/20' : done ? 'border-secondary/40 bg-secondary/10 text-secondary-700' : 'border-primary/10 bg-white text-muted'}`}
          >
            <span className="mx-auto mb-1 grid h-7 w-7 place-items-center rounded-full text-xs font-bold">
              {done ? <Check className="h-4 w-4" /> : lvl > current ? <Lock className="h-3.5 w-3.5" /> : lvl}
            </span>
            <span className="block text-[11px] font-semibold leading-tight">{t(`challenge.levels.${lvl}`)}</span>
          </li>
        )
      })}
    </ol>
  )
}

/* ─────────── بطاقة التقدّم ─────────── */
function ProgressCard({ p }: { p: ChallengeProgress }) {
  const { t } = useTranslation()
  const lang = useLang()
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-card bg-gradient-to-br from-primary to-primary-700 p-5 text-white sm:col-span-1">
        <p className="text-sm text-white/75">{t('challenge.yourLevel')}</p>
        <p className="mt-1 text-4xl font-bold">{num(p.level, lang)}<span className="text-lg text-white/60"> / {num(MAX_LEVEL, lang)}</span></p>
        <p className="mt-1 font-semibold">{t(`challenge.levels.${p.level}`)}</p>
        {p.level < MAX_LEVEL && (
          <div className="mt-3">
            <div className="flex gap-1.5" aria-label={t('challenge.winsToNext', { n: p.levelWins, total: WINS_TO_LEVEL_UP })}>
              {Array.from({ length: WINS_TO_LEVEL_UP }, (_, i) => (
                <span key={i} className={`h-2 flex-1 rounded-full ${i < p.levelWins ? 'bg-accent' : 'bg-white/25'}`} />
              ))}
            </div>
            <p className="mt-1.5 text-xs text-white/75">{t('challenge.winsToNext', { n: p.levelWins, total: WINS_TO_LEVEL_UP })}</p>
          </div>
        )}
      </div>
      <div className="rounded-card border border-primary/10 bg-white p-5">
        <p className="flex items-center gap-1.5 text-sm text-muted"><Flame className="h-4 w-4 text-orange-500" /> {t('challenge.streak')}</p>
        <p className="mt-1 text-3xl font-bold text-ink">{t('challenge.days', { count: p.streak })}</p>
        <p className="mt-1 text-xs text-muted">{t('challenge.bestStreak', { n: num(p.bestStreak, lang) })}</p>
      </div>
      <div className="rounded-card border border-primary/10 bg-white p-5">
        <p className="flex items-center gap-1.5 text-sm text-muted"><Star className="h-4 w-4 text-accent" /> {t('challenge.points')}</p>
        <p className="mt-1 text-3xl font-bold text-ink">{num(p.points, lang)}</p>
        <p className="mt-1 text-xs text-muted">{t('challenge.totalCorrect', { n: num(p.totalCorrect, lang) })}</p>
      </div>
    </div>
  )
}

/* ─────────── الأسئلة ─────────── */
function Quiz({ questions, onDone }: { questions: ChallengeQuestion[]; onDone: (r: ChallengeResult) => void }) {
  const { t } = useTranslation()
  const lang = useLang()
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const q = questions[i]
  const chosen = answers[q.id]
  const last = i === questions.length - 1

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      onDone(await challengeApi.submit(answers))
    } catch (e) {
      setError(String(e).includes('already') ? t('challenge.alreadyPlayed') : t('errors.generic'))
      setBusy(false)
    }
  }

  return (
    <div className="rounded-card border border-primary/10 bg-white p-5 md:p-7">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-primary">{t('challenge.questionN', { n: i + 1, total: questions.length })}</span>
        <span className="text-muted">{t(`challenge.levels.${q.level}`)}</span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {questions.map((x, k) => (
          <span key={x.id} className={`h-1.5 flex-1 rounded-full ${k === i ? 'bg-primary' : answers[x.id] !== undefined ? 'bg-secondary' : 'bg-primary/10'}`} />
        ))}
      </div>

      <h2 className="mt-6 text-xl font-bold leading-relaxed text-ink">{pick(q.prompt, lang)}</h2>
      <div className="mt-5 grid gap-2.5">
        {q.options[lang].map((opt, k) => (
          <button
            key={k}
            type="button"
            onClick={() => setAnswers((a) => ({ ...a, [q.id]: k }))}
            aria-pressed={chosen === k}
            className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-start font-medium transition ${
              chosen === k ? 'border-primary bg-primary-50 text-primary' : 'border-primary/10 hover:border-primary/30 hover:bg-sand'
            }`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold ${chosen === k ? 'border-primary bg-primary text-white' : 'border-primary/20 text-muted'}`}>
              {['أ', 'ب', 'ج', 'د', 'هـ', 'و'][k]}
            </span>
            {opt}
          </button>
        ))}
      </div>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" onClick={() => setI((n) => n - 1)} disabled={i === 0} className="text-sm font-semibold text-muted disabled:opacity-0">
          {t('challenge.back')}
        </button>
        {last ? (
          <Button loading={busy} disabled={Object.keys(answers).length < questions.length} onClick={submit}>{t('challenge.submit')}</Button>
        ) : (
          <Button disabled={chosen === undefined} onClick={() => setI((n) => n + 1)}>
            <span className="inline-flex items-center gap-1">{t('challenge.next')} <ChevronLeft className="h-4 w-4 ltr:rotate-180" /></span>
          </Button>
        )}
      </div>
      {last && Object.keys(answers).length < questions.length && <p className="mt-2 text-end text-xs text-muted">{t('challenge.answerAll')}</p>}
    </div>
  )
}

/* ─────────── النتيجة ─────────── */
function ResultView({ result, questions }: { result: ChallengeResult; questions: ChallengeQuestion[] }) {
  const { t } = useTranslation()
  const lang = useLang()
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]))
  return (
    <div className="space-y-4">
      <div className={`rounded-card p-6 text-center ${result.won ? 'bg-secondary/10' : 'bg-accent-100/60'}`}>
        {result.promoted ? <Trophy className="mx-auto h-12 w-12 text-accent" /> : result.won ? <Award className="mx-auto h-12 w-12 text-secondary-700" /> : <Medal className="mx-auto h-12 w-12 text-accent-700" />}
        <p className="mt-3 text-4xl font-bold text-ink">{num(result.score, lang)} / 5</p>
        <p className="mt-2 text-lg font-bold text-ink">{t(result.promoted ? 'challenge.promoted' : result.won ? 'challenge.won' : 'challenge.lost', { n: PASS_SCORE })}</p>
        <p className="mt-1 text-sm text-muted">{t('challenge.earned', { n: num(result.points, lang) })} · {t('challenge.comeBack')}</p>
      </div>

      <h3 className="pt-2 font-bold text-ink">{t('challenge.review')}</h3>
      {result.results.map((r, k) => {
        const q = byId[r.id]
        const right = r.chosen === r.correct
        return (
          <div key={r.id} className={`rounded-2xl border p-4 ${right ? 'border-secondary/40 bg-white' : 'border-red-200 bg-red-50/40'}`}>
            <p className="flex gap-2 font-semibold text-ink">
              {right ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-secondary-700" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
              <span>{k + 1}. {q ? pick(q.prompt, lang) : ''}</span>
            </p>
            {q && (
              <ul className="mt-3 space-y-1.5 ps-7 text-sm">
                {q.options[lang].map((o, i) => (
                  <li key={i} className={`flex items-center gap-2 ${i === r.correct ? 'font-semibold text-secondary-700' : i === r.chosen ? 'text-red-700 line-through' : 'text-muted'}`}>
                    {i === r.correct ? <Check className="h-4 w-4" /> : i === r.chosen ? <X className="h-4 w-4" /> : <span className="w-4" />}
                    {o}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 rounded-xl bg-sand px-3 py-2 text-sm leading-relaxed text-ink/85">💡 {pick(r.explanation, lang)}</p>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────── المتصدرون ─────────── */
function Leaderboard() {
  const { t } = useTranslation()
  const lang = useLang()
  const { data } = useAsync(() => challengeApi.leaderboard(), [])
  return (
    <div className="rounded-card border border-primary/10 bg-white p-5">
      <h3 className="flex items-center gap-2 font-bold text-ink"><Trophy className="h-5 w-5 text-accent" /> {t('challenge.leaderboard')}</h3>
      <p className="mb-3 text-xs text-muted">{t('challenge.leaderboardHint')}</p>
      {!data?.length ? (
        <p className="text-sm text-muted">{t('challenge.leaderboardEmpty')}</p>
      ) : (
        <ol className="space-y-1.5">
          {data.map((r, i) => (
            <li key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${r.isMe ? 'bg-primary-50 font-bold text-primary' : ''}`}>
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-accent text-white' : i < 3 ? 'bg-accent-100 text-accent-700' : 'bg-sand text-muted'}`}>{i + 1}</span>
              <span className="flex-1">{r.name}</span>
              <span className="text-xs text-muted">{t('challenge.levelShort', { n: r.level })}</span>
              <span className="font-semibold">{num(r.points, lang)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ─────────── الصفحة ─────────── */
export function ChallengePage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  usePageMeta(t('challenge.title'), t('challenge.subtitle'))

  return (
    <section className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-accent"><Flame className="h-4 w-4" /> {t('challenge.kicker')}</p>
        <h1 className="mt-1 text-3xl font-bold text-primary md:text-4xl">{t('challenge.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted">{t('challenge.subtitle')}</p>
      </div>
      {session ? <Play /> : <Intro />}
    </section>
  )
}

function Intro() {
  const { t } = useTranslation()
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {(['how1', 'how2', 'how3'] as const).map((k, i) => (
          <div key={k} className="rounded-card border border-primary/10 bg-white p-5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-sm font-bold text-white">{i + 1}</span>
            <p className="mt-3 font-bold text-ink">{t(`challenge.${k}Title`)}</p>
            <p className="mt-1 text-sm text-muted">{t(`challenge.${k}`, { n: PASS_SCORE, wins: WINS_TO_LEVEL_UP })}</p>
          </div>
        ))}
      </div>
      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">{t('challenge.ladder')}</h2>
        <LevelLadder current={1} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to="/register" className="rounded-full bg-primary px-6 py-3 font-semibold text-white hover:brightness-110">{t('challenge.startFree')}</Link>
        <Link to={`/login?next=${encodeURIComponent('/challenge')}`} className="rounded-full border border-primary/20 bg-white px-6 py-3 font-semibold text-primary">{t('nav.login')}</Link>
      </div>
    </>
  )
}

function Play() {
  const { t } = useTranslation()
  const progress = useAsync(() => challengeApi.progress(), [])
  const today = useAsync(() => challengeApi.today(), [])
  const [result, setResult] = useState<ChallengeResult | null>(() => challengeApi.lastResult())
  const [started, setStarted] = useState(false)

  if ((progress.loading && !progress.data) || (today.loading && !today.data)) return <Spinner />
  if (progress.error || today.error || !progress.data || !today.data) return <ErrorState onRetry={() => { progress.reload(); today.reload() }} />
  const { questions, played } = today.data

  function done(r: ChallengeResult) {
    saveSolved(questions)
    setResult(r)
    progress.reload()
  }

  let main
  if (result) main = <ResultView result={result} questions={loadSolved() ?? questions} />
  else if (played) main = <Alert tone="success">{t('challenge.playedToday')}</Alert>
  else if (questions.length < 5) main = <Alert tone="info">{t('challenge.noQuestions')}</Alert>
  else if (!started)
    main = (
      <div className="rounded-card border-2 border-dashed border-primary/20 bg-white p-8 text-center">
        <Flame className="mx-auto h-12 w-12 text-orange-500" />
        <p className="mt-3 text-xl font-bold text-ink">{t('challenge.readyTitle')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('challenge.readyHint', { n: PASS_SCORE })}</p>
        <Button className="mt-5" onClick={() => setStarted(true)}>{t('challenge.start')}</Button>
      </div>
    )
  else main = <Quiz questions={questions} onDone={done} />

  return (
    <>
      <ProgressCard p={progress.data} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0">{main}</div>
        <aside className="space-y-4">
          <Leaderboard key={progress.data.points} />
        </aside>
      </div>
      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">{t('challenge.ladder')}</h2>
        <LevelLadder current={progress.data.level} />
      </div>
    </>
  )
}
