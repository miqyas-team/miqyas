import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, Compass, Eye, GraduationCap, Headset, Layers, Mail, MessageCircle, Scale, ShieldCheck, Target, Users } from 'lucide-react'
import { contactApi, type ContactTopic } from '../../contact/api'
import { paymentsApi } from '../../payments/api'
import { Alert, Button, Field, useAsync } from '../../components/ui'
import { useLang } from '../../lib/lang'
import { isEmail } from '../../lib/validation'

/* ───────── إطار الصفحات النصية ───────── */
function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold text-primary">{title}</h1>
      {updated && <p className="mt-1 text-sm text-muted">{updated}</p>}
      <div className="prose-miqyas mt-8 space-y-6 leading-loose text-ink/90">{children}</div>
    </section>
  )
}
const H = ({ children }: { children: ReactNode }) => <h2 className="text-xl font-bold text-ink">{children}</h2>
const UL = ({ items }: { items: string[] }) => <ul className="list-disc space-y-1 ps-6">{items.map((i) => <li key={i}>{i}</li>)}</ul>

function useSeller() {
  const { data } = useAsync(() => paymentsApi.getSettings(), [])
  const lang = useLang()
  return {
    name: data?.seller_name || (lang === 'ar' ? 'منصة مقياس' : 'Miqyas'),
    email: data?.contact_email || '',
    whatsapp: data?.contact_whatsapp || '',
    address: data?.seller_address || '',
    cr: data?.cr_number || '',
    vat: data?.vat_number || '',
    /** الاسم النظامي كما أُدخل فقط (بلا قيمة افتراضية) لقسم «بيانات المنشأة» */
    legalName: data?.seller_name || '',
  }
}

/* ───────── من نحن ───────── */
const PILLARS = [
  { key: 'training', icon: GraduationCap, to: '/courses' },
  { key: 'services', icon: Layers, to: '/services' },
  { key: 'support', icon: Headset, to: '/software' },
  { key: 'community', icon: Users, to: '/community' },
] as const
const VALUES = [
  { key: 'quality', icon: BadgeCheck },
  { key: 'integrity', icon: Scale },
  { key: 'transparency', icon: Eye },
  { key: 'privacy', icon: ShieldCheck },
] as const

export function AboutPage() {
  const { t } = useTranslation()
  const s = useSeller()
  const legal = [
    { label: t('about.company.name'), value: s.legalName },
    { label: t('about.company.cr'), value: s.cr },
    { label: t('about.company.vat'), value: s.vat },
    { label: t('about.company.address'), value: s.address },
  ].filter((x) => x.value)

  return (
    <>
      {/* المقدمة */}
      <section className="hero-glow relative overflow-hidden border-b border-primary/10">
        <div aria-hidden className="contour-bg absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-20">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-accent">
            <span className="dotted-path h-2 w-10" /> {t('about.eyebrow')}
          </span>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-primary md:text-5xl">{t('about.headline')}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">{t('about.lead')}</p>
        </div>
      </section>

      {/* الرسالة والرؤية */}
      <section className="mx-auto grid max-w-6xl gap-5 px-4 py-14 md:grid-cols-2">
        {(['mission', 'vision'] as const).map((k) => (
          <div key={k} className="rounded-card border border-primary/10 bg-white p-7">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-50 text-primary">{k === 'mission' ? <Target className="h-5 w-5" /> : <Compass className="h-5 w-5" />}</span>
            <h2 className="mt-4 text-xl font-bold">{t(`about.${k}.title`)}</h2>
            <p className="mt-2 leading-relaxed text-muted">{t(`about.${k}.text`)}</p>
          </div>
        ))}
      </section>

      {/* ما نقدّمه */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold text-primary">{t('about.offer.title')}</h2>
          <p className="mt-2 max-w-2xl text-muted">{t('about.offer.text')}</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map(({ key, icon: Icon, to }) => (
              <Link key={key} to={to} className="group flex flex-col rounded-card border border-primary/10 bg-sand/60 p-6 transition hover:-translate-y-1 hover:bg-white hover:shadow-xl hover:shadow-primary/10">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white transition group-hover:bg-secondary"><Icon className="h-6 w-6" /></span>
                <h3 className="mt-4 text-lg font-bold">{t(`about.offer.items.${key}.title`)}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t(`about.offer.items.${key}.text`)}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                  {t('about.offer.more')} <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* القيم */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div aria-hidden className="contour-bg absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-bold">{t('about.values.title')}</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ key, icon: Icon }) => (
              <div key={key} className="rounded-card border border-white/10 bg-white/5 p-6">
                <Icon className="h-8 w-8 text-secondary" />
                <h3 className="mt-4 text-lg font-bold">{t(`about.values.items.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{t(`about.values.items.${key}.text`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* بيانات المنشأة */}
      {legal.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <div className="rounded-card border border-primary/10 bg-white p-7">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Building2 className="h-5 w-5 text-secondary" /> {t('about.company.title')}</h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {legal.map((x) => (
                <div key={x.label}>
                  <dt className="text-sm text-muted">{x.label}</dt>
                  <dd className="mt-1 font-semibold" dir="auto">{x.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      {/* دعوة */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col items-start justify-between gap-5 rounded-card bg-gradient-to-br from-primary to-primary-700 px-7 py-9 text-white md:flex-row md:items-center">
          <div>
            <p className="text-2xl font-bold">{t('about.cta')}</p>
            <p className="mt-1 text-white/75">{t('about.ctaText')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/services/request" className="rounded-full bg-white px-5 py-2.5 font-semibold text-primary hover:bg-sand">{t('hero.requestService')}</Link>
            <Link to="/contact" className="rounded-full border-2 border-white/40 px-5 py-2 font-semibold hover:bg-white/10">{t('nav.contact')}</Link>
          </div>
        </div>
      </section>
    </>
  )
}

/* ───────── تواصل معنا ───────── */
const TOPICS: ContactTopic[] = ['general', 'courses', 'services', 'partnership', 'other']

export function ContactPage() {
  const { t } = useTranslation()
  const seller = useSeller()
  const [f, setF] = useState({ name: '', email: '', phone: '', topic: 'general' as ContactTopic, message: '', website: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (f.website) return setSent(true) // حقل خفي لاصطياد البرامج الآلية
    const v: Record<string, string> = {}
    if (f.name.trim().length < 2) v.name = t('errors.fullName')
    if (!isEmail(f.email)) v.email = t('errors.email')
    if (f.message.trim().length < 10) v.message = t('contact.messageShort')
    setErrors(v)
    if (Object.keys(v).length) return
    setBusy(true)
    setServerError(null)
    try {
      await contactApi.send(f)
      setSent(true)
    } catch {
      setServerError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-8 px-4 py-12 lg:grid-cols-[1fr_18rem]">
      <div>
        <h1 className="text-3xl font-bold text-primary">{t('contact.title')}</h1>
        <p className="mt-2 text-muted">{t('contact.subtitle')}</p>
        {sent ? (
          <div className="mt-8 rounded-card border border-secondary bg-secondary-100/40 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-secondary" />
            <p className="mt-3 text-lg font-bold">{t('contact.sentTitle')}</p>
            <p className="mt-1 text-muted">{t('contact.sentText')}</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-8 space-y-4 rounded-card border border-primary/10 bg-white p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('form.fullName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} autoComplete="name" />
              <Field label={t('form.email')} type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={errors.email} autoComplete="email" />
              <Field label={t('form.phone')} optional type="tel" dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} autoComplete="tel" />
              <div>
                <label htmlFor="ct-topic" className="mb-1.5 block text-sm font-medium">{t('contact.topic')}</label>
                <select id="ct-topic" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value as ContactTopic })} className="w-full rounded-xl border border-primary/15 bg-white px-4 py-3">
                  {TOPICS.map((x) => <option key={x} value={x}>{t(`contact.topics.${x}`)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ct-msg" className="mb-1.5 block text-sm font-medium">{t('contact.message')}</label>
              <textarea id="ct-msg" rows={6} maxLength={4000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} aria-invalid={Boolean(errors.message)} className="w-full rounded-xl border border-primary/15 bg-white px-4 py-3 outline-none focus:border-secondary focus:ring-4 focus:ring-secondary/20" />
              {errors.message && <p className="mt-1 text-sm text-red-600">{errors.message}</p>}
            </div>
            {/* حقل خفي للبرامج الآلية — لا يراه البشر */}
            <input type="text" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="hidden" aria-hidden="true" />
            {serverError && <Alert>{serverError}</Alert>}
            <Button type="submit" loading={busy}>{t('contact.send')}</Button>
            <p className="text-xs text-muted">{t('contact.privacy')} <Link to="/privacy" className="underline">{t('footer.privacy')}</Link></p>
          </form>
        )}
      </div>
      <aside className="space-y-3">
        {seller.email && (
          <a href={`mailto:${seller.email}`} className="flex items-center gap-3 rounded-card border border-primary/10 bg-white p-4 hover:border-secondary">
            <Mail className="h-5 w-5 text-secondary" /><span dir="ltr" className="text-sm">{seller.email}</span>
          </a>
        )}
        {seller.whatsapp && (
          <a href={`https://wa.me/${seller.whatsapp.replace(/\D/g, '').replace(/^0/, '966')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-card border border-primary/10 bg-white p-4 hover:border-secondary">
            <MessageCircle className="h-5 w-5 text-secondary" /><span dir="ltr" className="text-sm">{seller.whatsapp}</span>
          </a>
        )}
        <div className="rounded-card bg-sand p-4 text-sm text-muted">
          {t('contact.faq')} <Link to="/community" className="font-semibold text-primary underline">{t('nav.community')}</Link>
        </div>
      </aside>
    </section>
  )
}

/* ───────── سياسة الخصوصية ───────── */
export function PrivacyPage() {
  const lang = useLang()
  const s = useSeller()
  const contact = s.email || (lang === 'ar' ? 'صفحة «تواصل معنا»' : 'the Contact page')
  if (lang === 'en') {
    return (
      <Prose title="Privacy Policy" updated="Last updated: November 2026">
        <p>This policy explains how {s.name} (“we”) collects, uses and protects your personal data when you use the platform, in line with the Saudi Personal Data Protection Law (PDPL).</p>
        <H>Data we collect</H>
        <UL items={['Account data: name, email, mobile number, specialization and organization (optional).', 'Learning data: enrollments, lesson progress, quiz results, submitted exercises and certificates.', 'Service data: request descriptions, locations you choose on the map, uploaded files and chat messages.', 'Payment data: transfer receipts and invoice details. We do not store card numbers.', 'Community posts and attachments you publish.', 'Technical data needed to run the service, such as session tokens and language preference stored in your browser.']} />
        <H>Why we use it</H>
        <UL items={['To create and secure your account and deliver courses, certificates and services you request.', 'To process payments and issue invoices.', 'To contact you about your requests and enrollments.', 'To keep the community safe and handle reports.']} />
        <H>Sharing</H>
        <p>We do not sell your data. We share it only with service providers that run the platform (hosting and database, email delivery, map tiles and embedded video providers), with the assigned team member for your request, and with authorities when legally required. Some providers may process data outside the Kingdom under appropriate safeguards.</p>
        <H>Retention</H>
        <p>We keep data while your account is active and as long as needed for the purposes above or legal obligations (such as invoices), then delete or anonymize it.</p>
        <H>Your rights</H>
        <UL items={['Access and obtain a copy of your data.', 'Correct inaccurate data from your profile or by contacting us.', 'Request deletion, subject to legal retention requirements.', 'Withdraw consent where processing relies on it.']} />
        <p>To exercise these rights, contact us at {contact}.</p>
        <H>Security</H>
        <p>We use access controls so that each role sees only what it needs, private storage for files and receipts, and encrypted connections.</p>
        <H>Changes</H>
        <p>We may update this policy and will post the new version here with its date.</p>
      </Prose>
    )
  }
  return (
    <Prose title="سياسة الخصوصية" updated="آخر تحديث: نوفمبر 2026">
      <p>توضّح هذه السياسة كيف تجمع {s.name} («نحن») بياناتك الشخصية وتستخدمها وتحميها عند استخدامك المنصة، وفقاً لنظام حماية البيانات الشخصية في المملكة العربية السعودية.</p>
      <H>البيانات التي نجمعها</H>
      <UL items={['بيانات الحساب: الاسم، البريد الإلكتروني، رقم الجوال، التخصص، وجهة العمل أو الجامعة (اختياري).', 'بيانات التعلّم: الاشتراكات، والتقدّم في الدروس، ونتائج الاختبارات، والتمارين المرفوعة، والشهادات.', 'بيانات الخدمات: وصف الطلب، والموقع الذي تحدده على الخريطة، والملفات المرفوعة، ورسائل المحادثة.', 'بيانات الدفع: إيصالات التحويل وبيانات الفاتورة. لا نحفظ أرقام البطاقات.', 'ما تنشره في المجتمع من مشاركات ومرفقات.', 'بيانات تقنية لازمة لتشغيل الخدمة، مثل رمز الجلسة وتفضيل اللغة المحفوظين في متصفحك.']} />
      <H>أغراض الاستخدام</H>
      <UL items={['إنشاء حسابك وتأمينه، وتقديم الدورات والشهادات والخدمات التي تطلبها.', 'معالجة المدفوعات وإصدار الفواتير.', 'التواصل معك بخصوص طلباتك واشتراكاتك.', 'الحفاظ على سلامة المجتمع ومعالجة البلاغات.']} />
      <H>مشاركة البيانات</H>
      <p>لا نبيع بياناتك. نشاركها فقط مع مزوّدي الخدمات الذين تعمل بهم المنصة (الاستضافة وقاعدة البيانات، وإرسال البريد، وخرائط الأساس، ومشغّل الفيديو المضمّن)، ومع عضو الفريق المسند إليه طلبك، ومع الجهات الرسمية عند وجود إلزام نظامي. قد يعالج بعض المزوّدين البيانات خارج المملكة وفق ضمانات مناسبة.</p>
      <H>مدة الاحتفاظ</H>
      <p>نحتفظ بالبيانات ما دام حسابك نشطاً وبالقدر اللازم للأغراض أعلاه أو للالتزامات النظامية (كالفواتير)، ثم نحذفها أو نجعلها مجهّلة الهوية.</p>
      <H>حقوقك</H>
      <UL items={['الاطلاع على بياناتك والحصول على نسخة منها.', 'تصحيح البيانات غير الدقيقة من ملفك الشخصي أو بالتواصل معنا.', 'طلب حذف بياناتك، مع مراعاة متطلبات الاحتفاظ النظامية.', 'الرجوع عن موافقتك متى كانت المعالجة قائمة عليها.']} />
      <p>لممارسة هذه الحقوق تواصل معنا عبر {contact}.</p>
      <H>أمن البيانات</H>
      <p>نطبّق صلاحيات دقيقة بحيث لا يرى كل دور إلا ما يحتاجه، ونحفظ الملفات والإيصالات في تخزين خاص، ونستخدم اتصالات مشفّرة.</p>
      <H>التعديلات</H>
      <p>قد نحدّث هذه السياسة، وننشر النسخة الجديدة هنا مع تاريخها.</p>
    </Prose>
  )
}

/* ───────── الشروط والأحكام ───────── */
export function TermsPage() {
  const lang = useLang()
  const s = useSeller()
  if (lang === 'en') {
    return (
      <Prose title="Terms & Conditions" updated="Last updated: November 2026">
        <p>By creating an account or using the platform, you agree to these terms with {s.name}{s.cr ? ` (CR ${s.cr})` : ''}.</p>
        <H>Accounts</H>
        <UL items={['Provide accurate information and keep your password confidential.', 'You are responsible for activity on your account.']} />
        <H>Courses and certificates</H>
        <UL items={['Paid courses open once payment is confirmed. Access is personal and may not be shared.', 'A completion certificate is issued after completing all course requirements.', 'Course content is owned by the platform and may not be copied or redistributed.']} />
        <H>Services</H>
        <UL items={['Services are delivered by the Miqyas team after payment is confirmed, within the agreed scope.', 'Academic services are limited to guidance, coaching and review; we do not complete academic work on a student’s behalf.', 'Software setup support uses official sources only; licenses remain the user’s responsibility.']} />
        <H>Payments and refunds</H>
        <UL items={['Prices are in Saudi riyals. An invoice is issued for every confirmed payment.', 'Refund requests are reviewed case by case before course access starts or service work begins; contact us to request one.']} />
        <H>Community</H>
        <UL items={['Be respectful; no offensive content, spam, personal data of others, or unlicensed files.', 'We may hide or remove content and restrict accounts that break these rules.']} />
        <H>Liability</H>
        <p>We work to keep the platform available and accurate but do not guarantee uninterrupted service. Job posts are published as received; verify them with the employer.</p>
        <H>Governing law</H>
        <p>These terms are governed by the laws of the Kingdom of Saudi Arabia.</p>
      </Prose>
    )
  }
  return (
    <Prose title="الشروط والأحكام" updated="آخر تحديث: نوفمبر 2026">
      <p>بإنشائك حساباً أو استخدامك المنصة فإنك توافق على هذه الشروط مع {s.name}{s.cr ? ` (سجل تجاري ${s.cr})` : ''}.</p>
      <H>الحسابات</H>
      <UL items={['تقديم بيانات صحيحة، والمحافظة على سرية كلمة المرور.', 'أنت مسؤول عن أي نشاط يتم عبر حسابك.']} />
      <H>الدورات والشهادات</H>
      <UL items={['تُفتح الدورات المدفوعة بعد تأكيد الدفع، والوصول شخصي ولا يجوز مشاركته.', 'تصدر شهادة الإتمام بعد استيفاء جميع متطلبات الدورة.', 'محتوى الدورات مملوك للمنصة، ولا يجوز نسخه أو إعادة نشره.']} />
      <H>الخدمات</H>
      <UL items={['ينفّذ فريق مقياس الخدمات بعد تأكيد الدفع وضمن النطاق المتفق عليه.', 'الخدمات الأكاديمية تقتصر على المساعدة والتوجيه والمراجعة، ولا ننفّذ الأعمال الأكاديمية نيابة عن الطالب.', 'دعم تثبيت البرامج يتم من المصادر الرسمية فقط، والتراخيص مسؤولية المستخدم.']} />
      <H>المدفوعات والاسترداد</H>
      <UL items={['الأسعار بالريال السعودي، وتصدر فاتورة لكل دفعة مؤكدة.', 'تُدرس طلبات الاسترداد لكل حالة قبل بدء الوصول للدورة أو بدء تنفيذ الخدمة؛ تواصل معنا لتقديم الطلب.']} />
      <H>المجتمع</H>
      <UL items={['الاحترام واجب؛ يُمنع المحتوى المسيء والإعلانات المزعجة ونشر بيانات الآخرين والملفات غير المرخّصة.', 'يحق لنا إخفاء المحتوى أو حذفه وتقييد الحسابات المخالفة.']} />
      <H>المسؤولية</H>
      <p>نسعى لإتاحة المنصة ودقة محتواها دون ضمان عدم انقطاع الخدمة. فرص التوظيف تُنشر كما وردت من الجهات، ويُرجى التحقق منها لدى الجهة.</p>
      <H>النظام المطبّق</H>
      <p>تخضع هذه الشروط لأنظمة المملكة العربية السعودية.</p>
    </Prose>
  )
}
