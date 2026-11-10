import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, Pencil, Plus, Star } from 'lucide-react'
import { courseAdminApi } from '../../courses/adminApi'
import { useAuth } from '../../auth/AuthProvider'
import { Alert, ErrorState, Spinner, useAsync } from '../../components/ui'
import { formatPrice, pick, useLang } from '../../lib/lang'
import { AdminNav } from './AdminNav'

export function AdminCourses() {
  const { t } = useTranslation()
  const lang = useLang()
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const base = isAdmin ? '/admin' : '/instructor'
  const { data, loading, error, reload } = useAsync(() => courseAdminApi.listCourses(isAdmin ? 'all' : 'mine'), [isAdmin])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function togglePublish(id: string, value: boolean) {
    setBusyId(id)
    try {
      await courseAdminApi.setPublished(id, value)
      reload()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <AdminNav />
      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('admin.courses.title')}</h1>
            <p className="text-sm text-muted">{t(isAdmin ? 'admin.courses.subtitleAdmin' : 'admin.courses.subtitleInstructor')}</p>
          </div>
          {isAdmin && (
            <Link to="/admin/courses/new" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white hover:bg-primary-700">
              <Plus className="h-4 w-4" /> {t('admin.courses.new')}
            </Link>
          )}
        </div>

        <div className="mt-6">
          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorState onRetry={reload} />
          ) : !data?.length ? (
            <Alert tone="info">{t(isAdmin ? 'admin.courses.emptyAdmin' : 'admin.courses.emptyInstructor')}</Alert>
          ) : (
            <div className="overflow-hidden rounded-card border border-primary/10 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-sand/70 text-start text-xs text-muted">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">{t('admin.courses.col.course')}</th>
                    <th className="hidden px-4 py-3 text-start font-semibold md:table-cell">{t('admin.courses.col.type')}</th>
                    <th className="hidden px-4 py-3 text-start font-semibold sm:table-cell">{t('admin.courses.col.lessons')}</th>
                    <th className="hidden px-4 py-3 text-start font-semibold sm:table-cell">{t('admin.courses.col.price')}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t('admin.courses.col.status')}</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="border-t border-primary/5">
                      <td className="px-4 py-3">
                        <p className="flex items-center gap-1.5 font-semibold">
                          {c.isFeatured && <Star className="h-3.5 w-3.5 fill-accent text-accent" aria-label={t('editor.fields.featured')} />}
                          {pick(c.title, lang) || t('editor.untitled')}
                        </p>
                        <p className="text-xs text-muted" dir="ltr">/{c.slug}</p>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {t(`home.courses.format.${c.format}`)} · {t(`home.courses.level.${c.level}`)}
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">{c.lessonsCount}</td>
                      <td className="hidden px-4 py-3 sm:table-cell">{formatPrice(c.price, lang)}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => togglePublish(c.id, !c.isPublished)}
                            className={`rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                              c.isPublished ? 'bg-secondary-100 text-primary hover:bg-secondary-100/60' : 'bg-sand text-muted hover:bg-cream'
                            }`}
                            title={t(c.isPublished ? 'admin.courses.unpublish' : 'admin.courses.publish')}
                          >
                            {t(c.isPublished ? 'admin.courses.published' : 'admin.courses.draft')}
                          </button>
                        ) : (
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${c.isPublished ? 'bg-secondary-100 text-primary' : 'bg-sand text-muted'}`}>
                            {t(c.isPublished ? 'admin.courses.published' : 'admin.courses.draft')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {c.isPublished && (
                            <Link to={`/courses/${c.slug}`} className="rounded-lg p-2 text-muted hover:bg-primary-50 hover:text-primary" aria-label={t('admin.courses.view')}>
                              <Eye className="h-4 w-4" />
                            </Link>
                          )}
                          <Link to={`${base}/courses/${c.id}`} className="rounded-lg p-2 text-muted hover:bg-primary-50 hover:text-primary" aria-label={t('admin.courses.edit')}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
