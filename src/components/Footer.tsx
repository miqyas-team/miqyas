import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Mail, MessageSquareText } from 'lucide-react'
import { LogoMark } from './Logo'
import { SocialIcon } from './SocialIcons'
import { contact } from '../data/home'
import { paymentsApi } from '../payments/api'
import { useAsync } from './ui'

const socials = [
  { key: 'x', label: 'X', href: contact.x },
  { key: 'linkedin', label: 'LinkedIn', href: contact.linkedin },
  { key: 'instagram', label: 'Instagram', href: contact.instagram },
] as const

export function Footer() {
  const { t } = useTranslation()
  // بيانات التواصل من «المدفوعات ← البنك والمنشأة» في لوحة الإدارة
  const settings = useAsync(() => paymentsApi.getSettings(), [])
  const email = settings.data?.contact_email || contact.email
  const waNumber = (settings.data?.contact_whatsapp || contact.whatsapp).replace(/\D/g, '').replace(/^0(?=5)/, '966')
  const liveSocials = socials.filter((s) => s.href)

  const columns = [
    {
      title: t('footer.platform'),
      links: [
        { to: '/courses', label: t('nav.courses') },
        { to: '/community', label: t('nav.community') },
        { to: '/jobs', label: t('nav.jobs') },
        { to: '/software', label: t('nav.software') },
        { to: '/map-viewer', label: t('nav.mapViewer') },
        { to: '/services', label: t('nav.services') },
        { to: '/services/request', label: t('hero.requestService') },
      ],
    },
    {
      title: t('footer.company'),
      links: [
        { to: '/about', label: t('nav.about') },
        { to: '/contact', label: t('nav.contact') },
        { to: '/terms', label: t('footer.terms') },
        { to: '/privacy', label: t('footer.privacy') },
      ],
    },
  ]

  return (
    <footer className="mt-auto bg-ink text-white/75">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-3">
            <LogoMark className="h-11 w-11" />
            <span className="text-2xl font-bold text-white">{t('brand')}</span>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed">{t('footer.about')}</p>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-semibold text-white">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white">{l.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="text-sm font-semibold text-white">{t('footer.contact')}</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {email && (
              <li>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2 hover:text-white" dir="ltr">
                  <Mail className="h-4 w-4" /> {email}
                </a>
              </li>
            )}
            {waNumber && (
              <li>
                <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-white">
                  <SocialIcon name="whatsapp" /> {t('footer.whatsapp')}
                </a>
              </li>
            )}
            <li>
              <Link to="/contact" className="inline-flex items-center gap-2 hover:text-white">
                <MessageSquareText className="h-4 w-4" /> {t('footer.contactPage')}
              </Link>
            </li>
          </ul>
          {liveSocials.length > 0 && (
            <ul className="mt-5 flex gap-2">
              {liveSocials.map((s) => (
                <li key={s.key}>
                  <a
                    href={s.href}
                    aria-label={s.label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-secondary"
                  >
                    <SocialIcon name={s.key} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/50 sm:flex-row">
          <span>© {new Date().getFullYear()} {t('brand')} — {t('footer.rights')}</span>
          <span>{t('footer.tagline')}</span>
        </div>
      </div>
    </footer>
  )
}
