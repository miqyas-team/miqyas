import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCog,
  FileSearch,
  GraduationCap,
  Headset,
  Languages,
  Layers,
  Map as MapIcon,
  MessagesSquare,
  PackageCheck,
  Quote,
  ReceiptText,
  Ruler,
  Send,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react'
import { HeroIllustration } from '../components/home/HeroIllustration'
import { SectionHeading } from '../components/home/SectionHeading'
import { CourseCard } from '../components/home/CourseCard'
import { CoursesComingSoon } from '../components/home/CoursesComingSoon'
import { reasons, services, software, testimonials, testimonialsAreSamples } from '../data/home'
import { pick, useLang } from '../lib/lang'
import { coursesApi } from '../courses/api'
import { Spinner, useAsync } from '../components/ui'

const serviceIcons = { GraduationCap, MessagesSquare, Map: MapIcon, Layers, Ruler, FileCog }
const reasonIcons = { arabic: Languages, practical: Wrench, certificate: Award, team: Users }
const trustPoints = [
  { key: 'verified', icon: ShieldCheck },
  { key: 'invoice', icon: ReceiptText },
  { key: 'support', icon: Headset },
] as const
const processSteps = [
  { key: 'request', icon: Send },
  { key: 'quote', icon: FileSearch },
  { key: 'work', icon: MessagesSquare },
  { key: 'deliver', icon: PackageCheck },
] as const
const faqKeys = ['pay', 'price', 'time', 'cert', 'grad', 'software'] as const
const audiences = [
  { key: 'students', icon: GraduationCap, to: '/courses' },
  { key: 'professionals', icon: BriefcaseBusiness, to: '/services/request?type=consulting' },
  { key: 'organizations', icon: Building2, to: '/services' },
] as const

const Arrow = () => <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />

export function Home() {
  const { t } = useTranslation()
  const lang = useLang()
  const showTestimonials = !testimonialsAreSamples || import.meta.env.DEV
  const courses = useAsync(() => coursesApi.listCourses(), [])
  const all = courses.data ?? []
  const featured = (all.some((c) => c.isFeatured) ? all.filter((c) => c.isFeatured) : all).slice(0, 3)

  return (
    <>
      {/* ───────── القسم العلوي ───────── */}
      <section className="hero-glow relative overflow-hidden">
        <div aria-hidden className="contour-bg pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 lg:grid-cols-2 lg:pb-20 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-accent-100 px-4 py-1.5 text-sm font-medium text-[#8a5f22]">
              <span className="h-2 w-2 rounded-full bg-accent" />
              {t('hero.badge')}
            </span>
            <h1 className="mt-6 text-4xl font-bold leading-[1.2] text-primary md:text-5xl xl:text-[3.4rem]">
              {t('home.hero.titleA')} <span className="relative whitespace-nowrap text-secondary">{t('home.hero.titleB')}</span>
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

            {/* نقاط الثقة */}
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-ink/80">
              {trustPoints.map(({ key, icon: Icon }) => (
                <li key={key} className="inline-flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-secondary shadow-sm ring-1 ring-primary/10">
                    <Icon className="h-4 w-4" />
                  </span>
                  {t(`home.trust.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <HeroIllustration />
        </div>
      </section>

      {/* ───────── لمن مقياس ───────── */}
      <section className="border-y border-primary/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionHeading eyebrow={t('home.audience.eyebrow')} title={t('home.audience.title')} text={t('home.audience.text')} />
          <div className="grid gap-5 md:grid-cols-3">
            {audiences.map(({ key, icon: Icon, to }) => (
              <div key={key} className="flex flex-col rounded-card border border-primary/10 bg-sand/50 p-7">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary-100 text-primary"><Icon className="h-6 w-6" /></span>
                <h3 className="mt-5 text-xl font-bold">{t(`home.audience.items.${key}.title`)}</h3>
                <ul className="mt-4 flex-1 space-y-2.5 text-sm text-ink/80">
                  {(t(`home.audience.items.${key}.points`, { returnObjects: true }) as string[]).map((p) => (
                    <li key={p} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" /> {p}</li>
                  ))}
                </ul>
                <Link to={to} className="mt-6 inline-flex items-center gap-1.5 font-semibold text-primary hover:gap-2.5 transition-all">
                  {t(`home.audience.items.${key}.cta`)} <Arrow />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── أبرز الدورات ───────── */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <SectionHeading
          eyebrow={t('home.courses.eyebrow')}
          title={t('home.courses.title')}
          text={t('home.courses.text')}
          action={
            <Link to="/courses" className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
              {t('home.courses.all')} <Arrow />
            </Link>
          }
        />
        {courses.loading ? (
          <Spinner />
        ) : featured.length === 0 ? (
          <CoursesComingSoon />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c) => (
              <CourseCard key={c.id} course={c} />
            ))}
          </div>
        )}
      </section>

      {/* ───────── الخدمات ───────── */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <SectionHeading
            eyebrow={t('home.services.eyebrow')}
            title={t('home.services.title')}
            text={t('home.services.text')}
            action={
              <Link
                to="/services/request"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 font-semibold text-white shadow-lg shadow-accent/25 hover:brightness-95"
              >
                {t('hero.requestService')} <Arrow />
              </Link>
            }
          />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => {
              const Icon = serviceIcons[s.icon]
              return (
                <Link
                  key={s.key}
                  to={`/services/request?type=${s.slug}`}
                  className="group flex flex-col rounded-card border border-primary/10 bg-sand/60 p-6 transition duration-300 hover:-translate-y-1 hover:border-secondary/50 hover:bg-white hover:shadow-xl hover:shadow-primary/10"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white transition group-hover:bg-secondary">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{t(`home.services.items.${s.key}.title`)}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t(`home.services.items.${s.key}.text`)}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary opacity-80 transition group-hover:gap-2.5 group-hover:opacity-100">
                    {t('hero.requestService')} <Arrow />
                  </span>
                </Link>
              )
            })}
          </div>

          {/* آلية العمل */}
          <div className="mt-20">
            <SectionHeading eyebrow={t('home.process.eyebrow')} title={t('home.process.title')} />
            <ol className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <span aria-hidden className="dotted-path absolute inset-x-[12%] top-7 hidden h-2 text-secondary/60 lg:block" />
              {processSteps.map(({ key, icon: Icon }, i) => (
                <li key={key} className="relative text-center">
                  <span className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-primary shadow-lg shadow-primary/10 ring-1 ring-primary/10">
                    <Icon className="h-6 w-6" />
                    <span className="absolute -top-2 -end-2 grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                  </span>
                  <h3 className="mt-4 font-bold">{t(`home.process.steps.${key}.title`)}</h3>
                  <p className="mx-auto mt-1.5 max-w-[16rem] text-sm leading-relaxed text-muted">{t(`home.process.steps.${key}.text`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ───────── البرامج والأدوات ───────── */}
      <section className="bg-cream/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-14 lg:flex-row lg:items-center">
          <div className="lg:w-1/3">
            <h2 className="flex items-center gap-2 text-2xl font-bold text-primary">
              <Download className="h-6 w-6 text-accent" /> {t('home.software.title')}
            </h2>
            <p className="mt-2 text-muted">{t('home.software.text')}</p>
            <Link to="/software" className="mt-4 inline-flex items-center gap-2 font-semibold text-primary hover:underline">
              {t('home.software.cta')} <Arrow />
            </Link>
          </div>
          <ul className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
            {software.map((s) => (
              <li key={s.name}>
                <Link to="/software" className="flex items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 shadow-sm transition hover:shadow-md">
                  <span className="min-w-0 font-semibold leading-tight" dir="ltr">{s.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      s.license === 'free' ? 'bg-secondary-100 text-primary' : 'bg-accent-100 text-[#8a5f22]'
                    }`}
                  >
                    {t(`home.software.license.${s.license}`)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ───────── لماذا مقياس ───────── */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="contour-bg absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-4 py-20">
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

      {/* ───────── آراء المتدربين ───────── */}
      {showTestimonials && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <SectionHeading
            eyebrow={t('home.testimonials.eyebrow')}
            title={t('home.testimonials.title')}
            action={
              testimonialsAreSamples && (
                <span className="w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600">
                  {t('home.testimonials.sampleBadge')}
                </span>
              )
            }
          />
          <div className="grid gap-5 md:grid-cols-3">
            {testimonials.map((item, i) => (
              <figure key={i} className="flex flex-col rounded-card border border-primary/10 bg-white p-6">
                <Quote className="h-8 w-8 text-accent rtl:-scale-x-100" />
                <blockquote className="mt-4 flex-1 leading-relaxed">{pick(item.quote, lang)}</blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-primary/10 pt-4">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-secondary-100 font-bold text-primary">
                    {pick(item.name, lang).charAt(0)}
                  </span>
                  <span>
                    <span className="block font-semibold">{pick(item.name, lang)}</span>
                    <span className="block text-sm text-muted">{pick(item.role, lang)}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ───────── الأسئلة الشائعة ───────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
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
                  <ChevronDown className="h-5 w-5 shrink-0 text-secondary transition group-open:rotate-180" />
                </summary>
                <p className="pb-5 leading-relaxed text-muted">{t(`home.faq.items.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── دعوة ختامية ───────── */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-primary-700 px-6 py-14 text-center text-white md:px-16">
          <div className="contour-bg absolute inset-0 opacity-30" />
          <div className="relative">
            <BadgeCheck className="mx-auto h-12 w-12 text-accent" />
            <h2 className="mt-4 text-3xl font-bold md:text-4xl">{t('home.cta.title')}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/75">{t('home.cta.text')}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to="/register" className="rounded-full bg-white px-6 py-3.5 font-semibold text-primary hover:bg-sand">
                {t('home.cta.primary')}
              </Link>
              <Link to="/courses" className="rounded-full border-2 border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10">
                {t('hero.browseCourses')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
