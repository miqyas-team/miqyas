import { useTranslation } from 'react-i18next'
import { FileCog, GraduationCap, Layers, Map as MapIcon, MessagesSquare, Ruler } from 'lucide-react'
import type { RequestStatus, ServiceType } from '../../services/types'
import { STAGES } from '../../services/types'
import { pick, useLang } from '../../lib/lang'

export const serviceIcons = { GraduationCap, MessagesSquare, Map: MapIcon, Layers, Ruler, FileCog }

export function ServiceIcon({ type, className = 'h-6 w-6' }: { type: ServiceType; className?: string }) {
  const Icon = serviceIcons[type.icon] ?? MapIcon
  return <Icon className={className} />
}

export function PriceLabel({ type }: { type: ServiceType }) {
  const { t } = useTranslation()
  const lang = useLang()
  if (type.pricing === 'custom' || type.price === null) return <span className="text-sm font-semibold text-muted">{t('services.customPrice')}</span>
  return (
    <span className="font-bold text-ink">
      {lang === 'ar' ? `${type.price} ر.س` : `SAR ${type.price}`}
      {type.unit && <span className="ms-1 text-sm font-normal text-muted">{pick(type.unit, lang)}</span>}
    </span>
  )
}

export const statusStyle: Record<RequestStatus, string> = {
  new: 'bg-primary-50 text-primary',
  quoting: 'bg-accent-100 text-accent-700',
  awaiting_payment: 'bg-accent-100 text-accent-700',
  in_progress: 'bg-secondary-100 text-primary',
  review: 'bg-[#e8e3f7] text-[#4b3b8f]',
  completed: 'bg-secondary text-white',
  cancelled: 'bg-red-50 text-red-600',
}

export function StatusChip({ status }: { status: RequestStatus }) {
  const { t } = useTranslation()
  return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[status]}`}>{t(`requests.status.${status}`)}</span>
}

/** مراحل الطلب كمسار منقّط ينتهي بالدبوس — من هوية الشعار */
export function StageTracker({ status, fixedPrice }: { status: RequestStatus; fixedPrice: boolean }) {
  const { t } = useTranslation()
  const stages = fixedPrice ? STAGES.filter((s) => s !== 'quoting') : STAGES
  if (status === 'cancelled') {
    return <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{t('requests.cancelledNote')}</div>
  }
  const current = stages.indexOf(status)
  return (
    <ol className="flex items-start">
      {stages.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={s} className="flex min-w-0 flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`dotted-path h-2 flex-1 ${i === 0 ? 'invisible' : done || active ? 'text-secondary-700' : 'text-primary/15'}`} />
              {active ? (
                <svg viewBox="0 0 20 28" className="h-7 w-5 shrink-0" aria-hidden="true">
                  <path d="M10 27C4 19 0 14 0 9a10 10 0 0 1 20 0c0 5-4 10-10 18z" fill="#E0703A" />
                  <circle cx="10" cy="9" r="3.5" fill="#fff" />
                </svg>
              ) : (
                <span className={`h-3.5 w-3.5 shrink-0 rounded-full ${done ? 'bg-secondary' : 'border-2 border-primary/20 bg-white'}`} />
              )}
              <span className={`dotted-path h-2 flex-1 ${i === stages.length - 1 ? 'invisible' : done ? 'text-secondary-700' : 'text-primary/15'}`} />
            </div>
            <span className={`mt-2 px-0.5 text-[11px] leading-tight sm:text-xs ${active ? 'font-bold text-primary' : done ? 'text-ink/80' : 'text-muted'}`}>
              {t(`requests.status.${s}`)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function formatSize(bytes: number | null) {
  if (!bytes) return ''
  return bytes > 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
}
