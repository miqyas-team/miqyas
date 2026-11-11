import { lazy, Suspense, type ComponentType, type ReactElement } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { UpdatePassword } from './pages/auth/UpdatePassword'
import { RequireAuth } from './auth/RequireAuth'

/**
 * تحميل كسول: كل صفحة تُحمَّل عند زيارتها فقط، فتصغر الحزمة الأولى
 * ويفتح الموقع أسرع على الجوال. الرئيسية والدخول تبقى ضمن الحزمة الأولى.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function page<M extends Record<string, any>>(loader: () => Promise<M>, name: keyof M) {
  const C = lazy(() => loader().then((m) => ({ default: m[name] as ComponentType<any> })))
  return (props: Record<string, unknown> = {}) => (
    <Suspense fallback={<Spinner />}>
      <C {...props} />
    </Suspense>
  )
}

const P = {
  coursesList: page(() => import('./pages/courses/CoursesList'), 'CoursesList'),
  courseDetail: page(() => import('./pages/courses/CourseDetail'), 'CourseDetail'),
  learn: page(() => import('./pages/courses/Learn'), 'Learn'),
  myCourses: page(() => import('./pages/courses/MyCourses'), 'MyCourses'),
  myCertificates: page(() => import('./pages/courses/MyCourses'), 'MyCertificates'),
  certificate: page(() => import('./pages/courses/CertificateView'), 'CertificateView'),
  verify: page(() => import('./pages/courses/Verify'), 'Verify'),
  dashboard: page(() => import('./pages/account/Dashboard'), 'Dashboard'),
  profile: page(() => import('./pages/account/Profile'), 'Profile'),
  mapViewer: page(() => import('./pages/MapViewerPage'), 'MapViewerPage'),
  community: page(() => import('./pages/community/CommunityPages'), 'CommunityHome'),
  newThread: page(() => import('./pages/community/CommunityPages'), 'NewThread'),
  thread: page(() => import('./pages/community/CommunityPages'), 'ThreadPage'),
  jobs: page(() => import('./pages/jobs/JobsPages'), 'JobsPage'),
  job: page(() => import('./pages/jobs/JobsPages'), 'JobDetail'),
  adminJobs: page(() => import('./pages/jobs/JobsPages'), 'AdminJobs'),
  adminJobEditor: page(() => import('./pages/jobs/JobsPages'), 'AdminJobEditor'),
  software: page(() => import('./pages/software/SoftwarePage'), 'SoftwarePage'),
  adminSoftware: page(() => import('./pages/software/AdminSoftware'), 'AdminSoftware'),
  adminServices: page(() => import('./pages/admin/AdminServices'), 'AdminServices'),
  adminSupport: page(() => import('./pages/admin/AdminSupport'), 'AdminSupport'),
  services: page(() => import('./pages/services/ServicesPage'), 'ServicesPage'),
  requestForm: page(() => import('./pages/services/RequestForm'), 'RequestForm'),
  requestDetail: page(() => import('./pages/services/RequestDetail'), 'RequestDetailPage'),
  myRequests: page(() => import('./pages/services/RequestLists'), 'MyRequests'),
  staffRequests: page(() => import('./pages/services/RequestLists'), 'StaffRequests'),
  checkout: page(() => import('./pages/payments/PaymentPages'), 'Checkout'),
  myPayments: page(() => import('./pages/payments/PaymentPages'), 'MyPayments'),
  invoice: page(() => import('./pages/payments/PaymentPages'), 'InvoicePage'),
  adminPayments: page(() => import('./pages/payments/AdminPayments'), 'AdminPayments'),
  about: page(() => import('./pages/static/StaticPages'), 'AboutPage'),
  contact: page(() => import('./pages/static/StaticPages'), 'ContactPage'),
  terms: page(() => import('./pages/static/StaticPages'), 'TermsPage'),
  privacy: page(() => import('./pages/static/StaticPages'), 'PrivacyPage'),
  adminOverview: page(() => import('./pages/admin/AdminOverview'), 'AdminOverview'),
  adminUsers: page(() => import('./pages/admin/AdminUsers'), 'AdminUsers'),
  adminCourses: page(() => import('./pages/admin/AdminCourses'), 'AdminCourses'),
  courseEditor: page(() => import('./pages/admin/editor/CourseEditor'), 'CourseEditorPage'),
  requestCenter: page(() => import('./pages/admin/RequestCenter'), 'RequestCenter'),
}

const soon = (titleKey: string) => <Placeholder titleKey={titleKey} />
const auth = (el: ReactElement, roles?: ('instructor' | 'team' | 'admin')[]) => <RequireAuth roles={roles}>{el}</RequireAuth>
/** عنوان الصفحة في المتصفح ومحركات البحث (مفتاح ترجمة) */
const t = (title: string) => ({ title })

export const router = createBrowserRouter([
  // صفحات للطباعة بلا رأس وتذييل
  { path: '/certificates/:code', element: P.certificate(), handle: t('certificates.title') },
  { path: '/invoices/:id', element: auth(P.invoice()), handle: t('payments.invoice') },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },

      // الدورات
      { path: '/courses', element: P.coursesList(), handle: t('nav.courses') },
      { path: '/courses/:slug', element: P.courseDetail() },
      { path: '/verify', element: P.verify(), handle: t('verify.title') },
      { path: '/verify/:code', element: P.verify(), handle: t('verify.title') },

      // عامة
      { path: '/map-viewer', element: P.mapViewer(), handle: t('viewer.title') },
      { path: '/community', element: P.community(), handle: t('community.title') },
      { path: '/community/new', element: auth(P.newThread()), handle: t('community.ask') },
      { path: '/community/:id', element: P.thread() },
      { path: '/jobs', element: P.jobs(), handle: t('jobs.title') },
      { path: '/jobs/:id', element: P.job() },
      { path: '/software', element: P.software(), handle: t('software.title') },
      { path: '/services', element: P.services(), handle: t('services.title') },
      { path: '/services/request', element: auth(P.requestForm()), handle: t('hero.requestService') },
      { path: '/about', element: P.about(), handle: t('about.title') },
      { path: '/contact', element: P.contact(), handle: t('contact.title') },
      { path: '/terms', element: P.terms(), handle: t('footer.terms') },
      { path: '/privacy', element: P.privacy(), handle: t('footer.privacy') },

      // الحسابات
      { path: '/login', element: <Login />, handle: t('nav.login') },
      { path: '/register', element: <Register />, handle: t('nav.register') },
      { path: '/reset-password', element: <ResetPassword />, handle: t('auth.resetTitle') },
      { path: '/update-password', element: <UpdatePassword />, handle: t('auth.updateTitle') },

      // المستخدم (كل الأدوار المسجّلة)
      { path: '/app', element: auth(P.dashboard({ area: 'app' })), handle: t('areas.app') },
      { path: '/app/profile', element: auth(P.profile()), handle: t('profile.title') },
      { path: '/app/courses', element: auth(P.myCourses()), handle: t('myCourses.title') },
      { path: '/app/certificates', element: auth(P.myCertificates()), handle: t('certificates.title') },
      { path: '/app/learn/:slug/:lessonId?', element: auth(P.learn()), handle: t('myCourses.title') },
      { path: '/app/checkout/:kind/:id', element: auth(P.checkout()), handle: t('payments.checkoutTitle') },
      { path: '/app/payments', element: auth(P.myPayments()), handle: t('payments.mine') },
      { path: '/app/requests', element: auth(P.myRequests()), handle: t('requests.mine') },
      { path: '/app/requests/:id', element: auth(P.requestDetail({ as: 'client' })), handle: t('requests.mine') },
      { path: '/app/*', element: auth(soon('areas.app')) },

      // لوحات الأدوار (المدير يدخلها كلها)
      { path: '/instructor', element: auth(P.dashboard({ area: 'instructor' }), ['instructor']), handle: t('areas.instructor') },
      { path: '/instructor/courses', element: auth(P.adminCourses(), ['instructor']), handle: t('admin.courses.title') },
      { path: '/instructor/courses/:id', element: auth(P.courseEditor(), ['instructor']), handle: t('admin.courses.title') },
      { path: '/instructor/grading', element: auth(P.requestCenter(), ['instructor']), handle: t('admin.nav.grading') },
      { path: '/instructor/*', element: auth(soon('areas.instructor'), ['instructor']) },
      { path: '/team', element: auth(P.dashboard({ area: 'team' }), ['team']), handle: t('areas.team') },
      { path: '/team/requests', element: auth(P.staffRequests({ as: 'team' }), ['team']), handle: t('requests.assignedTitle') },
      { path: '/team/requests/:id', element: auth(P.requestDetail({ as: 'team' }), ['team']), handle: t('requests.assignedTitle') },
      { path: '/team/*', element: auth(soon('areas.team'), ['team']) },
      { path: '/admin', element: auth(P.adminOverview(), ['admin']), handle: t('adminHome.title') },
      { path: '/admin/users', element: auth(P.adminUsers(), ['admin']), handle: t('adminUsers.title') },
      { path: '/admin/payments', element: auth(P.adminPayments(), ['admin']), handle: t('payments.admin.title') },
      { path: '/admin/software', element: auth(P.adminSoftware(), ['admin']), handle: t('software.admin.title') },
      { path: '/admin/services', element: auth(P.adminServices(), ['admin']), handle: t('servicesAdmin.title') },
      { path: '/admin/support', element: auth(P.adminSupport(), ['admin']), handle: t('support.title') },
      { path: '/admin/jobs', element: auth(P.adminJobs(), ['admin']), handle: t('jobs.admin.title') },
      { path: '/admin/jobs/new', element: auth(P.adminJobEditor(), ['admin']), handle: t('jobs.admin.new') },
      { path: '/admin/jobs/:id', element: auth(P.adminJobEditor(), ['admin']), handle: t('jobs.admin.edit') },
      { path: '/admin/courses', element: auth(P.adminCourses(), ['admin']), handle: t('admin.courses.title') },
      { path: '/admin/courses/new', element: auth(P.courseEditor(), ['admin']), handle: t('admin.courses.new') },
      { path: '/admin/courses/:id', element: auth(P.courseEditor(), ['admin']), handle: t('admin.courses.title') },
      { path: '/admin/requests', element: auth(P.staffRequests({ as: 'admin' }), ['admin']), handle: t('requests.allTitle') },
      { path: '/admin/requests/:id', element: auth(P.requestDetail({ as: 'admin' }), ['admin']), handle: t('requests.allTitle') },
      { path: '/admin/inbox', element: auth(P.requestCenter(), ['admin']), handle: t('areas.inbox') },
      { path: '/admin/*', element: auth(soon('areas.admin'), ['admin']) },

      { path: '*', element: <Placeholder notFound />, handle: t('page.notFound') },
    ],
  },
])
