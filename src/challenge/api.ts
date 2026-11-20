/**
 * التحدي اليومي: 5 أسئلة يومياً من مستوى الطالب (1 إلى 12).
 * 4 من 5 = يوم ناجح، و3 أيام ناجحة = المستوى التالي.
 * في الإنتاج يتم التصحيح داخل القاعدة (challenge_submit) فلا تصل الإجابات للمتصفح قبل الإرسال.
 */
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import type { Localized } from '../lib/lang'
import { addDays, loadBank, todayStr, type ContentStatus } from '../library/api'

export const MAX_LEVEL = 12
export const WINS_TO_LEVEL_UP = 3
export const PASS_SCORE = 4

export interface ChallengeQuestion {
  id: string
  level: number
  prompt: Localized
  options: { ar: string[]; en: string[] }
}
export interface ChallengeResult {
  score: number
  points: number
  won: boolean
  promoted: boolean
  results: { id: string; correct: number; chosen: number | null; explanation: Localized }[]
}
export interface ChallengeProgress {
  level: number
  levelWins: number
  streak: number
  bestStreak: number
  lastDay: string | null
  totalCorrect: number
  points: number
}
export interface LeaderRow {
  name: string
  points: number
  level: number
  isMe: boolean
}
export interface AdminQuestion {
  id: string
  level: number
  prompt: string
  options: string[]
  correct: number
  explanation: string
  status: ContentStatus
}

export interface ChallengeApi {
  today(): Promise<{ questions: ChallengeQuestion[]; played: boolean }>
  submit(answers: Record<string, number>): Promise<ChallengeResult>
  progress(): Promise<ChallengeProgress>
  leaderboard(): Promise<LeaderRow[]>
  /** آخر نتيجة لليوم (لعرضها بعد إعادة فتح الصفحة) */
  lastResult(): ChallengeResult | null
  /* للمدير */
  listQuestions(): Promise<AdminQuestion[]>
  setStatus(ids: string[], status: ContentStatus): Promise<void>
  saveQuestion(q: AdminQuestion & { isNew?: boolean }): Promise<void>
  removeQuestion(id: string): Promise<void>
}

export const emptyProgress: ChallengeProgress = { level: 1, levelWins: 0, streak: 0, bestStreak: 0, lastDay: null, totalCorrect: 0, points: 0 }

/** نفس معادلة القاعدة: challenge_points */
export const pointsFor = (score: number, level: number) => score * 10 * Math.max(1, Math.floor(level / 2)) + (score >= PASS_SCORE ? 20 : 0)

const RESULT_KEY = 'miqyas-challenge-last'
function rememberResult(r: ChallengeResult) {
  try {
    localStorage.setItem(RESULT_KEY, JSON.stringify({ day: todayStr(), r }))
  } catch {
    /* تجاهل */
  }
}
function recallResult(): ChallengeResult | null {
  try {
    const v = JSON.parse(localStorage.getItem(RESULT_KEY) ?? 'null')
    return v && v.day === todayStr() ? (v.r as ChallengeResult) : null
  } catch {
    return null
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const must = <T,>(res: { data: T; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

const supabaseChallenge: ChallengeApi = {
  async today() {
    const rows = must(await supabase.rpc('challenge_today')) as Row[]
    return {
      played: rows.some((r) => r.played),
      questions: rows.map((r) => ({
        id: r.id, level: r.level,
        prompt: { ar: r.prompt_ar, en: r.prompt_en || r.prompt_ar },
        options: { ar: r.options_ar, en: r.options_en ?? r.options_ar },
      })),
    }
  },
  async submit(answers) {
    const r = must(await supabase.rpc('challenge_submit', { p_answers: answers })) as Row
    const res: ChallengeResult = {
      score: r.score, points: r.points, won: r.won, promoted: r.promoted,
      results: (r.results as Row[]).map((x) => ({ id: x.id, correct: x.correct, chosen: x.chosen, explanation: { ar: x.explanation_ar, en: x.explanation_en || x.explanation_ar } })),
    }
    rememberResult(res)
    return res
  },
  async progress() {
    const { data: u } = await supabase.auth.getUser()
    const r = must(await supabase.from('challenge_progress').select('*').eq('user_id', u.user?.id ?? '').maybeSingle()) as Row | null
    if (!r) return emptyProgress
    return { level: r.level, levelWins: r.level_wins, streak: r.streak, bestStreak: r.best_streak, lastDay: r.last_day, totalCorrect: r.total_correct, points: r.points }
  },
  async leaderboard() {
    const rows = must(await supabase.rpc('challenge_leaderboard')) as Row[]
    return rows.map((r) => ({ name: r.name, points: Number(r.points), level: r.level ?? 1, isMe: r.is_me }))
  },
  lastResult: recallResult,
  async listQuestions() {
    const rows = must(await supabase.from('challenge_questions').select('*').order('level').order('created_at')) as Row[]
    return rows.map((r) => ({ id: r.id, level: r.level, prompt: r.prompt_ar, options: r.options_ar, correct: r.correct, explanation: r.explanation_ar, status: r.status }))
  },
  async setStatus(ids, status) {
    if (ids.length) must(await supabase.from('challenge_questions').update({ status }).in('id', ids))
  },
  async saveQuestion(q) {
    const row = { level: q.level, prompt_ar: q.prompt, options_ar: q.options, correct: q.correct, explanation_ar: q.explanation }
    if (q.isNew) must(await supabase.from('challenge_questions').insert({ ...row, status: 'pending' }))
    else must(await supabase.from('challenge_questions').update(row).eq('id', q.id))
  },
  async removeQuestion(id) {
    must(await supabase.from('challenge_questions').delete().eq('id', id))
  },
}

/* ═════════════ وضع المعاينة ═════════════ */

const DKEY = 'miqyas-demo-challenge'
interface DemoChallenge {
  status: Record<string, ContentStatus>
  custom: AdminQuestion[]
  edits: Record<string, AdminQuestion>
  removed: string[]
  progress: ChallengeProgress
  attempts: { day: string; points: number }[]
}

function loadD(): DemoChallenge | null {
  try {
    return JSON.parse(localStorage.getItem(DKEY) ?? 'null')
  } catch {
    return null
  }
}
function saveD(s: DemoChallenge) {
  try {
    localStorage.setItem(DKEY, JSON.stringify(s))
  } catch {
    /* تجاهل */
  }
}

async function demoState() {
  const bank = await loadBank()
  const counters: Record<number, number> = {}
  const base: AdminQuestion[] = bank.questions.map((q) => {
    counters[q.level] = (counters[q.level] ?? 0) + 1
    return { id: `q${q.level}-${counters[q.level]}`, level: q.level, prompt: q.prompt, options: q.options, correct: q.correct, explanation: q.explanation, status: 'pending' }
  })
  let s = loadD()
  if (!s) {
    // أول تشغيل: آخر 5 أسئلة من كل مستوى «بانتظار الموافقة» لتجربة لوحة الإدارة، والباقي معتمد
    s = { status: {}, custom: [], edits: {}, removed: [], progress: { ...emptyProgress }, attempts: [] }
    for (const q of base) s.status[q.id] = Number(q.id.split('-')[1]) > 25 ? 'pending' : 'published'
    saveD(s)
  }
  const all = [...base, ...s.custom]
    .filter((q) => !s!.removed.includes(q.id))
    .map((q) => ({ ...(s!.edits[q.id] ?? q), status: s!.status[q.id] ?? 'pending' }))
  return { s, all }
}

/** ترتيب ثابت طوال اليوم */
function hash(str: string) {
  let h = 2166136261
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}
function todaysFive(all: AdminQuestion[], level: number) {
  const day = todayStr()
  return all
    .filter((q) => q.status === 'published' && q.level === level)
    .sort((a, b) => hash(a.id + day) - hash(b.id + day))
    .slice(0, 5)
}

export async function demoQuestionsPending() {
  return (await demoState()).all.filter((q) => q.status === 'pending').length
}

const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 150))

const demoChallenge: ChallengeApi = {
  async today() {
    const { s, all } = await demoState()
    const qs = todaysFive(all, s.progress.level)
    return wait({
      played: s.progress.lastDay === todayStr(),
      questions: qs.map((q) => ({ id: q.id, level: q.level, prompt: { ar: q.prompt, en: q.prompt }, options: { ar: q.options, en: q.options } })),
    })
  },
  async submit(answers) {
    const { s, all } = await demoState()
    const t = todayStr()
    if (s.progress.lastDay === t) throw new Error('already played today')
    const p = s.progress
    const lvl = p.level
    const qs = todaysFive(all, lvl)
    let score = 0
    const results = qs.map((q) => {
      const chosen = answers[q.id] ?? null
      if (chosen === q.correct) score++
      return { id: q.id, correct: q.correct, chosen, explanation: { ar: q.explanation, en: q.explanation } }
    })
    const won = score >= PASS_SCORE
    const points = pointsFor(score, lvl)
    const streak = p.lastDay === addDays(t, -1) ? p.streak + 1 : 1
    const levelUp = won && p.levelWins + 1 >= WINS_TO_LEVEL_UP && lvl < MAX_LEVEL
    s.progress = {
      level: levelUp ? lvl + 1 : lvl,
      levelWins: levelUp ? 0 : won ? Math.min(p.levelWins + 1, WINS_TO_LEVEL_UP) : p.levelWins,
      streak,
      bestStreak: Math.max(p.bestStreak, streak),
      lastDay: t,
      totalCorrect: p.totalCorrect + score,
      points: p.points + points,
    }
    s.attempts.push({ day: t, points })
    saveD(s)
    const res = { score, points, won, promoted: levelUp, results }
    rememberResult(res)
    return wait(res)
  },
  async progress() {
    return wait((await demoState()).s.progress)
  },
  async leaderboard() {
    const { s } = await demoState()
    const weekStart = (() => {
      const d = new Date()
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      return todayStr(d)
    })()
    const mine = s.attempts.filter((a) => a.day >= weekStart).reduce((n, a) => n + a.points, 0)
    const sample: LeaderRow[] = [
      { name: 'ريم', points: 540, level: 6, isMe: false },
      { name: 'عبدالله', points: 410, level: 5, isMe: false },
      { name: 'نورة', points: 260, level: 3, isMe: false },
      { name: 'فهد', points: 150, level: 2, isMe: false },
    ]
    const rows = mine > 0 ? [...sample, { name: 'أنت', points: mine, level: s.progress.level, isMe: true }] : sample
    return wait(rows.sort((a, b) => b.points - a.points))
  },
  lastResult: recallResult,
  async listQuestions() {
    return wait((await demoState()).all)
  },
  async setStatus(ids, status) {
    const { s } = await demoState()
    for (const id of ids) s.status[id] = status
    saveD(s)
  },
  async saveQuestion(q) {
    const { s } = await demoState()
    const { isNew, ...clean } = q
    if (isNew) {
      s.custom.push(clean)
      s.status[clean.id] = 'pending'
    } else s.edits[clean.id] = clean
    saveD(s)
  },
  async removeQuestion(id) {
    const { s } = await demoState()
    s.removed.push(id)
    saveD(s)
  },
}

export const challengeApi: ChallengeApi = isSupabaseConfigured ? supabaseChallenge : demoChallenge
