import { useTranslation } from 'react-i18next'

/** رسم الخريطة في القسم العلوي: لوحة خريطة بطبقات ومسار ودبابيس + بطاقات عائمة */
export function HeroIllustration() {
  const { t } = useTranslation()
  return (
    <div className="relative mx-auto w-full max-w-lg" aria-hidden="true">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-secondary/25 via-cream/60 to-accent/20 blur-2xl" />

      <svg viewBox="0 0 480 400" className="w-full drop-shadow-2xl">
        <defs>
          <clipPath id="mapClip">
            <rect x="0" y="0" width="480" height="400" rx="32" />
          </clipPath>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#0F5E4E" strokeOpacity=".07" />
          </pattern>
        </defs>
        <g clipPath="url(#mapClip)">
          <rect width="480" height="400" fill="#FFFDF8" />
          <rect width="480" height="400" fill="url(#grid)" />
          {/* ماء */}
          <path d="M0 300 C80 280 120 340 210 330 S360 280 480 310 V400 H0Z" fill="#3FB59A" fillOpacity=".22" />
          {/* خطوط كنتور */}
          <g fill="none" stroke="#0F5E4E" strokeOpacity=".22" strokeWidth="1.5">
            <ellipse cx="340" cy="120" rx="110" ry="70" />
            <ellipse cx="345" cy="118" rx="80" ry="50" />
            <ellipse cx="350" cy="116" rx="52" ry="32" />
            <ellipse cx="354" cy="114" rx="26" ry="15" />
          </g>
          {/* طرق */}
          <g fill="none" stroke="#EDE3C9" strokeWidth="10" strokeLinecap="round">
            <path d="M-10 180 C120 170 200 220 300 210 S440 170 500 180" />
            <path d="M150 -10 C160 100 140 200 170 410" />
          </g>
          {/* قطعة أرض (مضلّع) */}
          <polygon points="210,90 290,70 315,150 230,175" fill="#C9954A" fillOpacity=".25" stroke="#C9954A" strokeWidth="2.5" strokeDasharray="6 5" />
          {/* المسار المنقّط */}
          <path
            d="M60 340 C110 300 120 250 180 245 S280 260 300 200 S360 130 400 110"
            fill="none"
            stroke="#0F5E4E"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="0 12"
          />
          <circle cx="60" cy="340" r="8" fill="#0F5E4E" />
        </g>
        {/* الدبوس */}
        <g className="animate-bob">
          <path d="M400 112 C386 94 378 82 378 70 a22 22 0 0 1 44 0 c0 12 -8 24 -22 42z" fill="#C9954A" />
          <circle cx="400" cy="70" r="8" fill="#fff" />
        </g>
      </svg>

      {/* بطاقة تقدّم عائمة */}
      <div className="animate-float absolute -bottom-6 start-2 w-56 rounded-2xl border border-primary/10 bg-white p-4 shadow-xl sm:start-[-1.5rem]">
        <p className="text-xs text-muted">{t('home.hero.cardCourse')}</p>
        <p className="mt-0.5 font-semibold text-primary">QGIS</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary-100">
          <div className="h-full w-[68%] rounded-full bg-secondary" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-secondary">68%</p>
      </div>

      {/* شارة شهادة */}
      <div className="animate-float-delayed absolute -top-4 end-2 flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg sm:end-[-1rem]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs">✓</span>
        {t('home.hero.cardCert')}
      </div>
    </div>
  )
}
