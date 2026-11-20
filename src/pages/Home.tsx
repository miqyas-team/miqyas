import { useEffect } from 'react'
import { DailyLearning } from '../components/home/DailyLearning'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Award,
  ChevronDown,
  Download,
  GraduationCap,
  Headset,
  Languages,
  Map as MapIcon,
  MessagesSquare,
  ReceiptText,
  Users,
  Wrench,
} from 'lucide-react'
import { HeroIllustration } from '../components/home/HeroIllustration'
import { SectionHeading } from '../components/home/SectionHeading'
import { heroImage, reasons } from '../data/home'

const reasonIcons = { arabic: Languages, practical: Wrench, certificate: Award, team: Users }
const trustPoints = [
  { key: 'verified', icon: Award },
  { key: 'invoice', icon: ReceiptText },
  { key: 'support', icon: Headset },
] as const
const faqKeys = ['pay', 'price', 'time', 'cert', 'grad', 'software'] as const

/** ماذا تقدّم مقياس: كل بطاقة تنقل إلى صفحة التفاصيل */
const offers = [
  { key: 'courses', icon: GraduationCap, to: '/courses', tone: 'bg-lime text-ink', soon: true },
  { key: 'services', icon: MapIcon, to: '/services', tone: 'bg-secondary text-ink', soon: false },
  { key: 'software', icon: Download, to: '/software', tone: 'bg-peach text-ink', soon: false },
  { key: 'community', icon: MessagesSquare, to: '/community', tone: 'bg-primary text-white', soon: false },
] as const

const Arrow = () => <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />

export function Home() {
  const { t } = useTranslation()
  const { hash, key } = useLocation()

  // روابط القائمة الجانبية مثل /#faq: انتقل للقسم مباشرة
  useEffect(() => {
    if (!hash) return
    const id = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' }), 200)
    return () => clearTimeout(id)
  }, [hash, key])

  return (
    <>
      {/* ───────── الواجهة: الصورة التعريفية أولاً ───────── */}
      <section className="hero-glow relative overflow-hidden">
        <div aria-hidden className="contour-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-8 lg:grid-cols-2 lg:gap-14 lg:pb-16 lg:pt-14">
          {/* على الجوال تظهر الصورة قبل النص */}
          <div className="lg:order-2">
            {heroImage ? (
              <img
                src={heroImage}
                alt={t('brand')}
                className="mx-auto aspect-[6/5] w-full max-w-lg rounded-[2rem] object-cover shadow-2xl shadow-primary/20"
              />
            ) : (
              <HeroIllustration />
            )}
          </div>
          <div className="lg:order-1">
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-4 py-1.5 text-sm font-medium text-accent-700">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {t('hero.badge')}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.2] text-primary md:text-5xl xl:text-[3.4rem]">
              {t('home.hero.titleA')} <span className="relative whitespace-nowrap text-secondary-700">{t('home.hero.titleB')}</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{t('hero.subtitle')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/courses"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 font-semibold text-white shadow-lg shadow-primary/25 transition hover:bg-primary-700"
              >
                {t('hero.browseCourses')} <Arrow />
              </Link>
              <Link
                to="/services/request"
                className="rounded-full border-2 border-primary px-6 py-3 font-semibold text-primary transition hover:bg-primary-50"
              >
                {t('hero.requestService')}
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink/80">
              {trustPoints.map(({ key, icon: Icon }) => (
                <li key={key} className="inline-flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-secondary-700 shadow-sm ring-1 ring-primary/10">
                    <Icon className="h-4 w-4" />
                  </span>
                  {t(`home.trust.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ───────── نبذة عن مقياس ───────── */}
      <section id="about" className="scroll-mt-20 border-y border-primary/10 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center md:py-16">
          <p className="text-sm font-semibold text-secondary-700">{t('home.about.eyebrow')}</p>
          <h2 className="mt-2 text-3xl font-bold text-primary">{t('home.about.title')}</h2>
          <p className="mx-auto mt-4 max-w-3xl text-lg leading-relaxed text-ink/80">{t('home.about.text')}</p>
          <Link to="/about" className="mt-6 inline-flex items-center gap-2 font-semibold text-primary hover:underline">
            {t('home.about.more')} <Arrow />
          </Link>
        </div>
      </section>


      {/* ───────── ماذا تقدّم مقياس ───────── */}
      <section id="offer" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 md:py-16">
        <SectionHeading eyebrow={t('home.offer.eyebrow')} title={t('home.offer.title')} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {offers.map(({ key, icon: Icon, to, tone, soon }) => (
            <Link
              key={key}
              to={to}
              className="group flex flex-col rounded-card border border-primary/10 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-secondary/50 hover:shadow-xl hover:shadow-primary/10"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl transition group-hover:scale-105 ${tone}`}>
                  <Icon className="h-6 w-6" />
                </span>
                {soon && (
                  <span className="rounded-full bg-accent-100 px-2.5 py-1 text-xs font-semibold text-accent-700">{t('home.offer.soon')}</span>
                )}
              </div>
              <h3 className="mt-5 text-lg font-bold">{t(`home.offer.items.${key}.title`)}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t(`home.offer.items.${key}.text`)}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary opacity-80 transition group-hover:gap-2.5 group-hover:opacity-100">
                {t('home.offer.open')} <Arrow />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <DailyLearning />

      {/* ───────── لماذا مقياس ───────── */}
      <section id="why" className="relative scroll-mt-20 overflow-hidden bg-ink text-white">
        <div className="contour-bg absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <SectionHeading eyebrow={t('home.why.eyebrow')} title={t('home.why.title')} light />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.map((r) => {
              const Icon = reasonIcons[r]
              return (
                <div key={r} className="rounded-card border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <Icon className="h-8 w-8 text-secondary" />
                  <h3 className="mt-4 text-lg font-bold">{t(`home.why.items.${r}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{t(`home.why.items.${r}.text`)}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ───────── الأسئلة الشائعة ───────── */}
      <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <SectionHeading eyebrow={t('home.faq.eyebrow')} title={t('home.faq.title')} />
            <p className="-mt-6 text-muted">
              {t('home.faq.more')}{' '}
              <Link to="/contact" className="font-semibold text-primary underline-offset-4 hover:underline">{t('home.faq.contact')}</Link>
            </p>
          </div>
          <div className="space-y-3">
            {faqKeys.map((k) => (
              <details key={k} className="group rounded-card border border-primary/10 bg-white px-5 open:shadow-lg open:shadow-primary/5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  {t(`home.faq.items.${k}.q`)}
                  <ChevronDown className="h-5 w-5 shrink-0 text-secondary-700 transition group-open:rotate-180" />
                </summary>
                <p className="pb-5 leading-relaxed text-muted">{t(`home.faq.items.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
