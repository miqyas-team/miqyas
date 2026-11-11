import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Award, BookOpen, ClipboardList, FileCheck2, Inbox, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { Alert } from '../../components/ui'
import { AdminNav } from '../admin/AdminNav'

function Tile({ to, icon, title, text }: { to: string; icon: ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="group rounded-card border border-primary/10 bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/5">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white transition group-hover:bg-secondary">{icon}</span>
      <h2 className="mt-4 text-lg font-bold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{text}</p>
    </Link>
  )
}

/** لوحة كل دور — تمتلئ بالمحتوى تباعاً */
export function Dashboard({ area }: { area: 'app' | 'instructor' | 'team' | 'admin' }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const firstName = profile?.full_name.split(' ')[0] ?? ''

  const tiles =
    area === 'app'
      ? [
          { to: '/app/courses', icon: <BookOpen className="h-6 w-6" />, title: t('myCourses.title'), text: t('dash.tiles.myCourses') },
          { to: '/app/certificates', icon: <Award className="h-6 w-6" />, title: t('certificates.title'), text: t('dash.tiles.certificates') },
          { to: '/app/requests', icon: <ClipboardList className="h-6 w-6" />, title: t('requests.mine'), text: t('dash.tiles.myRequests') },
        ]
      : area === 'admin'
        ? [
            { to: '/admin/courses', icon: <Pencil className="h-6 w-6" />, title: t('admin.courses.title'), text: t('dash.tiles.manageCourses') },
            { to: '/admin/requests', icon: <ClipboardList className="h-6 w-6" />, title: t('admin.nav.requests'), text: t('dash.tiles.allRequests') },
            { to: '/admin/inbox', icon: <Inbox className="h-6 w-6" />, title: t('areas.inbox'), text: t('dash.tiles.inbox') },
          ]
        : area === 'instructor'
          ? [
              { to: '/instructor/courses', icon: <Pencil className="h-6 w-6" />, title: t('admin.courses.title'), text: t('dash.tiles.instructorCourses') },
              { to: '/instructor/grading', icon: <FileCheck2 className="h-6 w-6" />, title: t('admin.nav.grading'), text: t('dash.tiles.grading') },
            ]
          : [{ to: '/team/requests', icon: <ClipboardList className="h-6 w-6" />, title: t('requests.assignedTitle'), text: t('dash.tiles.teamRequests') }]

  return (
    <>
      {(area === 'admin' || area === 'instructor') && <AdminNav />}
      <section className="mx-auto max-w-6xl px-4 py-10">
        <p className="text-sm font-medium text-accent">{t(`areas.${area}`)}</p>
        <h1 className="mt-1 text-3xl font-bold text-primary">{t('dash.welcome', { name: firstName })}</h1>

        {area === 'app' && profile && !profile.phone && (
          <div className="mt-6">
            <Alert tone="info">
              {t('dash.completeProfile')}{' '}
              <Link to="/app/profile" className="font-semibold text-primary underline">{t('profile.title')}</Link>
            </Alert>
          </div>
        )}

        {tiles.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map((x) => <Tile key={x.to} {...x} />)}
          </div>
        ) : (
          <div className="mt-8 rounded-card border border-dashed border-primary/20 bg-white/60 p-10 text-center text-muted">
            <div className="dotted-path mx-auto mb-4 h-2 w-32 text-secondary-700" />
            {t('dash.soon')}
          </div>
        )}
      </section>
    </>
  )
}
