import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  Award,
  BadgeCheck,
  Download,
  FileCog,
  GraduationCap,
  Languages,
  Layers,
  Map as MapIcon,
  MessagesSquare,
  Quote,
  Ruler,
  Users,
  Wrench,
} from 'lucide-react'
import { HeroIllustration } from '../components/home/HeroIllustration'
import { SectionHeading } from '../components/home/SectionHeading'
import { CourseCard } from '../components/home/CourseCard'
import { reasons, services, software, testimonials, testimonialsAreSamples } from '../data/home'
import { pick, useLang } from '../lib/lang'
import { coursesApi } from '../courses/api'
import { Spinner, useAsync } from '../components/ui'

const serviceIcons = { GraduationCap, MessagesSquare, Map: MapIcon, Layers, Ruler, FileCog }
const reasonIcons = { arabic: Languages, practical: Wrench, certificate: Award, team: Users }

const Arrow = () => <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />

export function Home() {
  const { t } = useTranslation()
  const lang = useLang()
  const showTestimonials = !testimonialsAreSamples || import.meta.env.DEV
  const courses = useAsync(() => coursesApi.listCourses(), [])
  const featured = (courses.data ?? []).filter((c) => c.isFeatured).slice(0, 3)

  return (
    <>
      {/* ───────── القسم العلوي ───────── */}
      <section className="contour-bg overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-16 pt-12 lg:grid-cols-2 lg:pb-20 lg:pt-20">
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

            {/* رحلة المتدرب — مسار منقّط ينتهي بدبوس */}
            <ol className="mt-12 flex max-w-md items-center gap-2 text-sm font-medium">
              {(['learn', 'apply', 'certify'] as const).map((step, i) => (
                <li key={step} className="flex flex-1 items-center gap-2">
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      i === 2 ? 'bg-accent text-white' : 'bg-white text-primary ring-2 ring-secondary/40'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="whitespace-nowrap">{t(`home.hero.steps.${step}`)}</span>
                  {i < 2 && <span className="dotted-path h-2 flex-1 text-secondary" />}
                </li>
              ))}
            </ol>
          </div>

          <HeroIllustration />
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
                  to="/services"
                  className="group rounded-card border border-primary/10 bg-sand/60 p-6 transition hover:border-secondary/50 hover:bg-white hover:shadow-xl hover:shadow-primary/5"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white transition group-hover:bg-secondary">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{t(`home.services.items.${s.key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{t(`home.services.items.${s.key}.text`)}</p>
                </Link>
              )
            })}
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
                  <span className="truncate font-semibold" dir="ltr">{s.name}</span>
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
