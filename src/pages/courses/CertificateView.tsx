import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { coursesApi } from '../../courses/api'
import { LogoMark } from '../../components/Logo'
import { Spinner, useAsync } from '../../components/ui'
import { formatDate } from '../../components/home/CourseCard'
import { Placeholder } from '../Placeholder'

/**
 * الشهادة كصفحة قابلة للطباعة (A4 أفقي).
 * «تحميل PDF» = نافذة الطباعة ← حفظ كـ PDF؛ هذا يضمن عرض العربية بشكل صحيح.
 */
export function CertificateView() {
  const { code = '' } = useParams()
  const { t } = useTranslation()
  const cert = useAsync(() => coursesApi.verifyCertificate(code), [code])
  const [qr, setQr] = useState('')
  const verifyUrl = `${window.location.origin}/verify/${code.toUpperCase()}`

  useEffect(() => {
    QRCode.toString(verifyUrl, { type: 'svg', margin: 0, color: { dark: '#0F5E4E', light: '#00000000' } }).then(setQr)
  }, [verifyUrl])

  if (cert.loading) return <Spinner />
  if (!cert.data) return <Placeholder titleKey="verify.invalidTitle" notFound />
  const c = cert.data

  return (
    <div className="certificate-page min-h-screen bg-sand py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-6 flex max-w-[1000px] flex-wrap items-center justify-between gap-3 px-4 print:hidden">
        <Link to="/app/certificates" className="text-sm font-semibold text-primary">{t('certificates.back')}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-white">
          <Printer className="h-4 w-4" /> {t('certificates.download')}
        </button>
      </div>
      <p className="mx-auto mb-4 max-w-[1000px] px-4 text-xs text-muted print:hidden">{t('certificates.printHint')}</p>

      <div className="mx-auto max-w-[1000px] overflow-x-auto px-4 print:max-w-none print:px-0">
        <article dir="rtl" lang="ar" className="certificate relative mx-auto aspect-[297/210] w-[1000px] overflow-hidden bg-white shadow-2xl print:w-full print:shadow-none">
          {/* إطار */}
          <div className="absolute inset-5 rounded-[18px] border-[3px] border-primary" />
          <div className="absolute inset-8 rounded-[12px] border border-accent/60" />
          <div className="contour-bg absolute inset-0 opacity-50" />

          <div className="relative flex h-full flex-col items-center px-24 pb-14 pt-11 text-center">
            <div className="flex items-center gap-3">
              <LogoMark className="h-14 w-14" />
              <span className="text-4xl font-bold text-primary">مقياس</span>
            </div>
            <p className="mt-2 text-sm tracking-[0.3em] text-muted" dir="ltr">MIQYAS · GIS ACADEMY</p>

            <h1 className="mt-5 text-5xl font-bold text-ink">شهادة إتمام</h1>
            <p className="mt-1 text-lg tracking-widest text-accent" dir="ltr">CERTIFICATE OF COMPLETION</p>

            <p className="mt-5 text-lg text-muted">تشهد منصة مقياس بأن</p>
            <p className="mt-2 border-b-2 border-dashed border-accent/60 px-8 pb-2 text-4xl font-bold text-primary">{c.fullName}</p>
            <p className="mt-4 text-lg text-muted">قد أتمّ بنجاح متطلبات دورة</p>
            <p className="mt-2 text-3xl font-bold text-ink">{c.courseTitle.ar}</p>
            <p className="mt-1 text-lg text-muted" dir="ltr">{c.courseTitle.en}</p>
            {c.hours ? <p className="mt-2 text-base text-muted">عدد الساعات التدريبية: {c.hours}</p> : null}

            <div className="mt-auto flex w-full items-end justify-between pt-4">
              <div className="text-start text-sm">
                <p className="text-muted">تاريخ الإصدار</p>
                <p className="font-semibold">{formatDate(c.issuedAt, 'ar', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                <p className="mt-3 text-muted">رقم الشهادة</p>
                <p className="font-mono font-semibold tracking-wider" dir="ltr">{c.code}</p>
              </div>
              <div className="flex flex-col items-center">
                <div className="h-24 w-24" dangerouslySetInnerHTML={{ __html: qr }} />
                <p className="mt-2 text-[11px] text-muted" dir="ltr">{verifyUrl.replace(/^https?:\/\//, '')}</p>
              </div>
              <div className="text-end text-sm">
                <div className="mb-2 h-px w-40 bg-ink/40" />
                <p className="font-semibold">إدارة منصة مقياس</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  )
}
