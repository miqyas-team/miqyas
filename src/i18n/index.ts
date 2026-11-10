import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import ar from './locales/ar.json'
import en from './locales/en.json'

export const languages = {
  ar: { label: 'العربية', dir: 'rtl' },
  en: { label: 'English', dir: 'ltr' },
} as const

export type Lang = keyof typeof languages

function applyDirection(lng: string) {
  const lang: Lang = lng.startsWith('en') ? 'en' : 'ar'
  document.documentElement.lang = lang
  document.documentElement.dir = languages[lang].dir
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { ar: { translation: ar }, en: { translation: en } },
    fallbackLng: 'ar',
    supportedLngs: ['ar', 'en'],
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      // العربية افتراضية؛ لا نعتمد على لغة المتصفح
      order: ['localStorage'],
      lookupLocalStorage: 'miqyas-lang',
      caches: ['localStorage'],
    },
  })

applyDirection(i18n.resolvedLanguage ?? 'ar')
i18n.on('languageChanged', applyDirection)

export default i18n
