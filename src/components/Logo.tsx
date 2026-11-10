import { useTranslation } from 'react-i18next'

/** رمز الخريطة المطوية: ثلاث طيّات، مسار منقّط، دبوس ذهبي */
export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 95" className={className} aria-hidden="true">
      <polygon points="5,15 35,5 35,80 5,90" fill="#0F5E4E" />
      <polygon points="35,5 65,15 65,90 35,80" fill="#3FB59A" />
      <polygon points="65,15 95,5 95,80 65,90" fill="#0F5E4E" />
      <path
        d="M14 74 Q38 72 52 58 T80 44"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="0 9"
      />
      <path d="M82 46 C76 38 72 33 72 27 a10 10 0 0 1 20 0 c0 6 -4 11 -10 19z" fill="#C9954A" />
      <circle cx="82" cy="27" r="3.6" fill="#FFFFFF" />
    </svg>
  )
}

export function Logo({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark />
      <span className="text-2xl font-bold text-primary">{t('brand')}</span>
    </span>
  )
}
