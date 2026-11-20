import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, Minus, UserCog, Users } from 'lucide-react'

type Access = 'yes' | 'own' | 'no'
const ROLES = ['user', 'instructor', 'team', 'admin'] as const

/**
 * مصفوفة الصلاحيات — تطابق ما تفرضه قاعدة البيانات (RLS) وحماية المسارات.
 * عند تغيير أي صلاحية في supabase/migrations حدّث هذا الجدول.
 */
const MATRIX: { key: string; access: [Access, Access, Access, Access] }[] = [
  { key: 'browse', access: ['yes', 'yes', 'yes', 'yes'] },
  { key: 'learn', access: ['yes', 'yes', 'yes', 'yes'] },
  { key: 'community', access: ['yes', 'yes', 'yes', 'yes'] },
  { key: 'ownCourses', access: ['no', 'own', 'no', 'yes'] },
  { key: 'grading', access: ['no', 'own', 'no', 'yes'] },
  { key: 'assigned', access: ['no', 'no', 'own', 'yes'] },
  { key: 'softwareLinks', access: ['no', 'no', 'yes', 'yes'] },
  { key: 'distribute', access: ['no', 'no', 'no', 'yes'] },
  { key: 'payments', access: ['no', 'no', 'no', 'yes'] },
  { key: 'catalog', access: ['no', 'no', 'no', 'yes'] },
  { key: 'moderate', access: ['no', 'no', 'no', 'yes'] },
  { key: 'users', access: ['no', 'no', 'no', 'yes'] },
  { key: 'stats', access: ['no', 'no', 'no', 'yes'] },
]

function Cell({ a }: { a: Access }) {
  const { t } = useTranslation()
  if (a === 'yes') return <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-secondary/15 text-secondary-700" title={t('staff.roles.yes')}><Check className="h-4 w-4" /><span className="sr-only">{t('staff.roles.yes')}</span></span>
  if (a === 'own') return <span className="inline-block rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">{t('staff.roles.own')}</span>
  return <span className="inline-grid h-7 w-7 place-items-center text-muted/50" title={t('staff.roles.no')}><Minus className="h-4 w-4" /><span className="sr-only">{t('staff.roles.no')}</span></span>
}

export function AdminRoles() {
  const { t } = useTranslation()

  return (
    <section className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">{t('staff.roles.title')}</h1>
        <p className="text-sm text-muted">{t('staff.roles.subtitle')}</p>
      </div>

      {/* بطاقة لكل دور */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ROLES.map((r) => (
          <div key={r} className="rounded-card border border-primary/10 bg-white p-5">
            <p className="font-bold text-primary">{t(`roles.${r}`)}</p>
            <p className="mt-1 text-sm text-muted">{t(`staff.roles.desc.${r}`)}</p>
            <p className="mt-3 text-xs text-muted">
              {t('staff.roles.dashboard')}: <code className="rounded bg-sand px-1.5 py-0.5 text-ink" dir="ltr">{t(`staff.roles.path.${r}`)}</code>
            </p>
          </div>
        ))}
      </div>

      {/* الجدول */}
      <div className="relative overflow-x-auto rounded-card border border-primary/10 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-sand/60 text-xs text-muted">
            <tr>
              <th className="px-4 py-3 text-start font-semibold">{t('staff.roles.capability')}</th>
              {ROLES.map((r) => <th key={r} className="px-3 py-3 text-center font-semibold">{t(`roles.${r}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {MATRIX.map((row) => (
              <tr key={row.key} className="border-t border-primary/5">
                <td className="px-4 py-3 text-ink">{t(`staff.roles.cap.${row.key}`)}</td>
                {row.access.map((a, i) => <td key={i} className="px-3 py-3 text-center"><Cell a={a} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        <span className="me-1 inline-block rounded-full bg-accent-100 px-2 py-0.5 text-[11px] font-semibold text-accent-700">{t('staff.roles.own')}</span>
        {t('staff.roles.ownNote')}
      </p>

      {/* كيف أغيّر الدور */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-primary/10 bg-white p-5">
          <p className="flex items-center gap-2 font-bold text-ink"><UserCog className="h-5 w-5 text-primary" /> {t('staff.roles.howTitle')}</p>
          <ol className="mt-3 list-decimal space-y-1.5 ps-5 text-sm text-ink/85">
            <li>{t('staff.roles.how1')}</li>
            <li>{t('staff.roles.how2')}</li>
            <li>{t('staff.roles.how3')}</li>
          </ol>
          <Link to="/admin/users" className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white hover:brightness-110">
            <Users className="h-4 w-4" /> {t('admin.nav.users')}
          </Link>
        </div>
        <div className="rounded-card border border-accent/30 bg-accent-100/40 p-5">
          <p className="font-bold text-ink">{t('staff.roles.tipsTitle')}</p>
          <ul className="mt-3 list-disc space-y-1.5 ps-5 text-sm text-ink/85">
            <li>{t('staff.roles.tip1')}</li>
            <li>{t('staff.roles.tip2')}</li>
            <li>{t('staff.roles.tip3')}</li>
          </ul>
        </div>
      </div>
    </section>
  )
}
