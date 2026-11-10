import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const isAr = (i18n.resolvedLanguage ?? 'ar') === 'ar'
  return (
    <button
      type="button"
      onClick={() => i18n.changeLanguage(isAr ? 'en' : 'ar')}
      className="rounded-full border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary-50"
      lang={isAr ? 'en' : 'ar'}
    >
      {isAr ? 'English' : 'العربية'}
    </button>
  )
}
