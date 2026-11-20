import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Flame } from 'lucide-react'
import { libraryApi } from '../../library/api'
import { MAX_LEVEL } from '../../challenge/api'
import { useAsync } from '../ui'
import { TodayTopic } from '../../pages/library/shared'
import { SectionHeading } from './SectionHeading'

/** «تعلّم كل يوم»: موضوع اليوم من المكتبة + دعوة للتحدي اليومي */
export function DailyLearning() {
  const { t } = useTranslation()
  const { data } = useAsync(() => libraryApi.list(), [])
  const today = data?.[0]

  return (
    <section id="daily" className="scroll-mt-20 border-y border-primary/10 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-14 md:py-16">
        <SectionHeading
          eyebrow={t('daily.kicker')}
          title={t('daily.title')}
          text={t('daily.subtitle')}
          action={
            <Link to="/library" className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-primary/20 px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary-50 md:self-auto">
              {t('daily.allTopics')}
            </Link>
          }
        />

        <div className="grid items-stretch gap-5 lg:grid-cols-[1.5fr_1fr]">
          {today ? (
            <div className="[&>a]:h-full">
              <TodayTopic a={today} compact />
            </div>
          ) : (
            <div className="min-h-56 animate-pulse rounded-card bg-primary-50" aria-hidden />
          )}
          <Link to="/challenge" className="group flex flex-col rounded-card border border-accent/30 bg-sand p-6 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-xl hover:shadow-accent/10 md:p-8">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-orange-50 text-orange-500"><Flame className="h-6 w-6" /></span>
            <h3 className="mt-4 text-xl font-bold text-ink">{t('daily.challengeTitle')}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t('daily.challengeText', { levels: MAX_LEVEL })}</p>
            <span className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white transition group-hover:gap-3">
              {t('daily.challengeCta')} <ArrowLeft className="h-4 w-4 ltr:rotate-180" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
