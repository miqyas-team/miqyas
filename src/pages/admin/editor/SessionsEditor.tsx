import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Trash2, Video } from 'lucide-react'
import { MEETING_URL_RE, newSession, parseYoutubeId, ZOOM_FREE_LIMIT, type SessionDraft } from '../../../courses/draft'
import { pick, useLang } from '../../../lib/lang'
import { BiField, IconButton, TextField } from './fields'

/** جلسات Zoom لدفعة واحدة */
export function SessionsEditor({ sessions, onChange }: { sessions: SessionDraft[]; onChange: (fn: (s: SessionDraft[]) => void) => void }) {
  const { t } = useTranslation()
  const lang = useLang()

  return (
    <div className="space-y-3 rounded-xl bg-sand/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Video className="h-4 w-4 text-primary" /> {t('editor.sessions.title')}
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-muted">{sessions.length}</span>
        </p>
        <button
          type="button"
          onClick={() => onChange((s) => void s.push(newSession(s[s.length - 1])))}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
        >
          <CalendarPlus className="h-4 w-4" /> {t('editor.sessions.add')}
        </button>
      </div>

      {sessions.length === 0 && <p className="text-xs text-muted">{t('editor.sessions.empty')}</p>}

      {sessions.map((x, i) => {
        const badUrl = x.meetingUrl.trim() !== '' && !MEETING_URL_RE.test(x.meetingUrl.trim())
        return (
          <div key={x.id} className="space-y-3 rounded-xl border border-primary/10 bg-white p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                {t('editor.sessions.n', { n: i + 1 })}
                {pick(x.title, lang) && <span className="font-normal text-muted"> · {pick(x.title, lang)}</span>}
              </span>
              <IconButton label={t('editor.remove')} danger onClick={() => onChange((s) => void s.splice(i, 1))}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
            <BiField label={t('editor.sessions.name')} value={x.title} onChange={(v) => onChange((s) => void (s[i].title = v))} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('editor.sessions.when')} type="datetime-local" dir="ltr" value={x.startsAt} onChange={(v) => onChange((s) => void (s[i].startsAt = v))} />
              <TextField
                label={t('editor.sessions.duration')}
                type="number"
                min={10}
                value={x.durationMin}
                onChange={(v) => onChange((s) => void (s[i].durationMin = Math.max(10, Number(v) || ZOOM_FREE_LIMIT)))}
              />
            </div>
            {x.durationMin > ZOOM_FREE_LIMIT && (
              <p className="rounded-lg bg-accent-100 px-3 py-2 text-xs text-accent-700">{t('editor.sessions.zoomLimit', { n: ZOOM_FREE_LIMIT })}</p>
            )}
            <div>
              <TextField
                label={t('editor.sessions.link')}
                hint={t('editor.sessions.linkHint')}
                dir="ltr"
                placeholder="https://us05web.zoom.us/j/…"
                value={x.meetingUrl}
                onChange={(v) => onChange((s) => void (s[i].meetingUrl = v))}
              />
              {badUrl && <p className="mt-1 text-xs text-red-600">{t('editor.sessions.linkInvalid')}</p>}
            </div>
            <RecordingField value={x.recordingYoutubeId} onChange={(id) => onChange((s) => void (s[i].recordingYoutubeId = id))} />
          </div>
        )
      })}
    </div>
  )
}

/** رابط تسجيل الجلسة على YouTube (اختياري) */
function RecordingField({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useTranslation()
  const [input, setInput] = useState(value ?? '')
  const invalid = input.trim() !== '' && !parseYoutubeId(input)
  return (
    <div>
      <TextField
        label={t('editor.sessions.recording')}
        hint={t('editor.sessions.recordingHint')}
        dir="ltr"
        placeholder="https://youtu.be/…"
        value={input}
        onChange={(v) => {
          setInput(v)
          onChange(parseYoutubeId(v))
        }}
      />
      {invalid && <p className="mt-1 text-xs text-red-600">{t('editor.lesson.youtubeInvalid')}</p>}
    </div>
  )
}
