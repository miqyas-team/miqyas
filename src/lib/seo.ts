import { useEffect } from 'react'
import { useLocation, useMatches } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const BRAND = { ar: 'مقياس', en: 'Miqyas' }

/** الصفحة التي ضبطت عنوانها بنفسها (لا يطغى عليها عنوان المسار العام) */
let pageOwnedKey: string | null = null

function setMeta(name: string, content: string, attr: 'name' | 'property' = 'name') {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

/** يضبط عنوان الصفحة ووصفها (للمتصفح ومحركات البحث والمشاركة) */
export function setPageMeta(title: string | null, description: string | null, lang: 'ar' | 'en') {
  const full = title ? `${title} | ${BRAND[lang]}` : `${BRAND[lang]} | ${lang === 'ar' ? 'تعلّم نظم المعلومات الجغرافية واحترفها' : 'Learn and master GIS'}`
  document.title = full
  setMeta('og:title', full, 'property')
  if (description) {
    const d = description.replace(/\s+/g, ' ').trim().slice(0, 160)
    setMeta('description', d)
    setMeta('og:description', d, 'property')
  }
}

/** للصفحات ذات العنوان الثابت: يُقرأ من handle.title في المسار */
export function useRouteTitle() {
  const matches = useMatches()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const key = [...matches].reverse().map((m) => (m.handle as { title?: string } | undefined)?.title).find(Boolean)
  const lang = i18n.resolvedLanguage === 'en' ? 'en' : 'ar'
  useEffect(() => {
    if (pageOwnedKey === location.pathname + location.search) return
    if (key) setPageMeta(t(key), null, lang)
    else if (location.pathname === '/') setPageMeta(null, t('hero.subtitle'), lang)
  }, [key, t, lang, location.key, location.pathname, location.search])
}

/** للصفحات الديناميكية (دورة، سؤال، فرصة) أو الخاصة (لا صلاحية) */
export function usePageMeta(title: string | null | undefined, description?: string | null) {
  const location = useLocation()
  const { i18n } = useTranslation()
  const lang = i18n.resolvedLanguage === 'en' ? 'en' : 'ar'
  const key = location.pathname + location.search
  // يُعلَّم في الأثر (لا أثناء الرسم) كي لا تأخذ صفحةٌ تُغادَر عنوانَ الصفحة التالية
  useEffect(() => {
    if (!title) return
    pageOwnedKey = key
    setPageMeta(title, description ?? null, lang)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, lang])
}
