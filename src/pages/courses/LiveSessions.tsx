import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock, CheckCircle2, PlayCircle, Radio, Video } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import type { LiveSession } from '../../courses/types'
import { useAsync } from '../../components/ui'
import { pick, useLang } from '../../lib/lang'

/** يظهر زر الدخول قبل الموعد بهذه الدقائق */
const OPEN_BEFORE_MIN = 15

type Phase = 'upcoming' | 'open' | 'live' | 'ended'

function phaseOf(s: LiveSession, now: number): Phase {
  const start = new Date(s.startsAt).getTime()
  const end = start + s.durationMin * 60_000
  if (now >= end) return 'ended'
  if (now >= start) return 'live'
  if (now >= start - OPEN_BEFORE_MIN * 60_000) return 'open'
  return 'upcoming'
}

/** جلسات Zoom للطالب المسجّل في الدفعة — الرابط لا يصل لغيره أصلاً (RLS) */
export function LiveSessions({ courseId }: { courseId: string }) {
  const { t } = useTranslation()
  const lang = useLang()
  const { data, loading } = useAsync(() => coursesApi.mySessions(courseId), [courseId])
  const [now, setNow] = useState(() => Date.now())

  // تحديث كل نصف دقيقة ليظهر زر الدخول في وقته
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  if (loading && !data) return null
  const sessions = data ?? []
  const nextIdx = sessions.findIndex((s) => phaseOf(s, now) !== 'ended')

  const when = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

  return (
    <section id="live-sessions" className="scroll-mt-24 rounded-card border-2 border-primary/15 bg-white p-5 md:p-6">
      <h2 className="flex items-center gap-2 text-xl font-bold text-primary">
        <Radio className="h-5 w-5" /> {t('live.title')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('live.subtitle', { n: OPEN_BEFORE_MIN })}</p>

      {sessions.length === 0 ? (
        <p className="mt-4 rounded-xl bg-sand px-4 py-3 text-sm text-muted">{t('live.empty')}</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {sessions.map((s, i) => {
            const ph = phaseOf(s, now)
            const isNext = i === nextIdx
            return (
              <li
                key={s.id}
                className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${
                  ph === 'live' || ph === 'open' ? 'border-secondary bg-secondary/5' : isNext ? 'border-primary/25 bg-primary-50/40' : 'border-primary/10'
                } ${ph === 'ended' ? 'opacity-80' : ''}`}
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ph === 'ended' ? 'bg-sand text-muted' : 'bg-primary text-white'}`}>
                  {ph === 'ended' ? <CheckCircle2 className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">
                    {pick(s.title, lang)}
                    {ph === 'live' && <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />{t('live.now')}</span>}
                    {isNext && ph === 'upcoming' && <span className="ms-2 rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">{t('live.next')}</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <CalendarClock className="h-3.5 w-3.5" /> {when(s.startsAt)} · {t('live.minutes', { count: s.durationMin })}
                  </p>
                </div>

                <div className="w-full sm:w-auto sm:shrink-0">
                  {(ph === 'open' || ph === 'live') && s.meetingUrl && (
                    <a href={s.meetingUrl} target="_blank" rel="noopener noreferrer" className="block rounded-full bg-secondary px-5 py-2.5 text-center text-sm font-bold text-white hover:brightness-95">
                      {t('live.join')}
                    </a>
                  )}
                  {(ph === 'open' || ph === 'live') && !s.meetingUrl && <span className="text-xs text-muted">{t('live.linkSoon')}</span>}
                  {ph === 'upcoming' && <span className="text-xs text-muted">{t('live.opensBefore', { n: OPEN_BEFORE_MIN })}</span>}
                  {ph === 'ended' && s.recordingYoutubeId && (
                    <a
                      href={`https://www.youtube.com/watch?v=${s.recordingYoutubeId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-full border border-primary/20 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary-50"
                    >
                      <PlayCircle className="h-4 w-4" /> {t('live.recording')}
                    </a>
                  )}
                  {ph === 'ended' && !s.recordingYoutubeId && <span className="text-xs text-muted">{t('live.ended')}</span>}
                  </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
