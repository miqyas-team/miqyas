import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, SearchX, ShieldCheck } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import { Button, Field, Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { pick, useLang } from '../../lib/lang'

/** صفحة التحقق العامة — يصلها من يمسح رمز QR أو يُدخل رقم الشهادة */
export function Verify() {
  const { code } = useParams()
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const [input, setInput] = useState(code ?? '')
  const result = useAsync(() => (code ? coursesApi.verifyCertificate(code) : Promise.resolve(null)), [code])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const v = input.trim().toUpperCase()
    if (v) navigate(`/verify/${encodeURIComponent(v)}`)
  }

  return (
    <section className="contour-bg">
      <div className="mx-auto max-w-xl px-4 py-14">
        <div className="text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-primary" />
          <h1 className="mt-3 text-3xl font-bold text-primary">{t('verify.title')}</h1>
          <p className="mt-2 text-muted">{t('verify.subtitle')}</p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 flex items-end gap-2">
          <Field className="flex-1" label={t('verify.codeLabel')} dir="ltr" value={input} onChange={(e) => setInput(e.target.value)} placeholder="A1B2C3D4E5F6" />
          <Button type="submit">{t('verify.check')}</Button>
        </form>

        {code && (
          <div className="mt-8">
            {result.loading ? (
              <Spinner />
            ) : result.data ? (
              <div className="rounded-card border-2 border-secondary bg-white p-6">
                <p className="flex items-center gap-2 font-bold text-secondary">
                  <BadgeCheck className="h-6 w-6" /> {t('verify.valid')}
                </p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-muted">{t('verify.name')}</dt><dd className="font-semibold">{result.data.fullName}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">{t('verify.course')}</dt><dd className="text-end font-semibold">{pick(result.data.courseTitle, lang)}</dd></div>
                  {result.data.hours ? (
                    <div className="flex justify-between gap-4"><dt className="text-muted">{t('verify.hours')}</dt><dd className="font-semibold">{t('home.courses.hours', { count: Number(result.data.hours) })}</dd></div>
                  ) : null}
                  <div className="flex justify-between gap-4"><dt className="text-muted">{t('verify.issued')}</dt><dd className="font-semibold">{formatDate(result.data.issuedAt, lang, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-muted">{t('verify.code')}</dt><dd className="font-mono font-semibold" dir="ltr">{code.toUpperCase()}</dd></div>
                </dl>
                <Link to={`/certificates/${code.toUpperCase()}`} className="mt-5 inline-block text-sm font-semibold text-primary underline">{t('verify.viewCertificate')}</Link>
              </div>
            ) : (
              <div className="rounded-card border-2 border-red-200 bg-white p-6 text-center">
                <SearchX className="mx-auto h-10 w-10 text-red-500" />
                <p className="mt-3 font-bold text-red-600">{t('verify.invalidTitle')}</p>
                <p className="mt-1 text-sm text-muted">{t('verify.invalidText')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
