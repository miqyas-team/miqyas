import { useTranslation } from 'react-i18next'

/** نص ثنائي اللغة للمحتوى الديناميكي (يقابل حقول _ar و_en في قاعدة البيانات) */
export type Localized = { ar: string; en: string }

export function useLang(): 'ar' | 'en' {
  const { i18n } = useTranslation()
  return i18n.resolvedLanguage === 'en' ? 'en' : 'ar'
}

export function pick(text: Localized, lang: 'ar' | 'en') {
  return text[lang]
}

/** تنسيق السعر بالريال */
export function formatPrice(amount: number, lang: 'ar' | 'en') {
  if (amount === 0) return lang === 'ar' ? 'مجانية' : 'Free'
  return lang === 'ar' ? `${amount} ر.س` : `SAR ${amount}`
}
