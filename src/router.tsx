import { createBrowserRouter } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { Placeholder } from './pages/Placeholder'
import { Login } from './pages/auth/Login'
import { Register } from './pages/auth/Register'
import { ResetPassword } from './pages/auth/ResetPassword'
import { UpdatePassword } from './pages/auth/UpdatePassword'
import { Dashboard } from './pages/account/Dashboard'
import { Profile } from './pages/account/Profile'
import { CoursesList } from './pages/courses/CoursesList'
import { CourseDetail } from './pages/courses/CourseDetail'
import { Learn } from './pages/courses/Learn'
import { MyCertificates, MyCourses } from './pages/courses/MyCourses'
import { CertificateView } from './pages/courses/CertificateView'
import { Verify } from './pages/courses/Verify'
import { RequireAuth } from './auth/RequireAuth'
import { AdminCourses } from './pages/admin/AdminCourses'
import { CourseEditorPage } from './pages/admin/editor/CourseEditor'
import { ServicesPage } from './pages/services/ServicesPage'
import { MapViewerPage } from './pages/MapViewerPage'
import { AdminOverview } from './pages/admin/AdminOverview'
import { AdminUsers } from './pages/admin/AdminUsers'
import { RequestCenter } from './pages/admin/RequestCenter'
import { RequestForm } from './pages/services/RequestForm'
import { RequestDetailPage } from './pages/services/RequestDetail'
import { MyRequests, StaffRequests } from './pages/services/RequestLists'

const soon = (titleKey: string) => <Placeholder titleKey={titleKey} />

// هيكل المسارات حسب وثيقة المشروع (docs/SPEC.md)؛ الصفحات تُبنى تباعاً
export const router = createBrowserRouter([
  // الشهادة بلا رأس وتذييل لتُطبع نظيفة
  { path: '/certificates/:code', element: <CertificateView /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },

      // الدورات
      { path: '/courses', element: <CoursesList /> },
      { path: '/courses/:slug', element: <CourseDetail /> },
      { path: '/verify', element: <Verify /> },
      { path: '/verify/:code', element: <Verify /> },

      // عامة
      { path: '/map-viewer', element: <MapViewerPage /> },
      { path: '/software', element: soon('nav.software') },
      { path: '/services', element: <ServicesPage /> },
      { path: '/services/request', element: <RequireAuth><RequestForm /></RequireAuth> },
      { path: '/about', element: soon('nav.about') },
      { path: '/contact', element: soon('nav.contact') },
      { path: '/terms', element: soon('footer.terms') },
      { path: '/privacy', element: soon('footer.privacy') },

      // الحسابات
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/update-password', element: <UpdatePassword /> },

      // المستخدم (كل الأدوار المسجّلة)
      { path: '/app', element: <RequireAuth><Dashboard area="app" /></RequireAuth> },
      { path: '/app/profile', element: <RequireAuth><Profile /></RequireAuth> },
      { path: '/app/courses', element: <RequireAuth><MyCourses /></RequireAuth> },
      { path: '/app/certificates', element: <RequireAuth><MyCertificates /></RequireAuth> },
      { path: '/app/learn/:slug/:lessonId?', element: <RequireAuth><Learn /></RequireAuth> },
      { path: '/app/requests', element: <RequireAuth><MyRequests /></RequireAuth> },
      { path: '/app/requests/:id', element: <RequireAuth><RequestDetailPage as="client" /></RequireAuth> },
      { path: '/app/*', element: <RequireAuth>{soon('areas.app')}</RequireAuth> },

      // لوحات الأدوار (المدير يدخلها كلها)
      { path: '/instructor', element: <RequireAuth roles={['instructor']}><Dashboard area="instructor" /></RequireAuth> },
      { path: '/instructor/courses', element: <RequireAuth roles={['instructor']}><AdminCourses /></RequireAuth> },
      { path: '/instructor/courses/:id', element: <RequireAuth roles={['instructor']}><CourseEditorPage /></RequireAuth> },
      { path: '/instructor/grading', element: <RequireAuth roles={['instructor']}><RequestCenter /></RequireAuth> },
      { path: '/instructor/*', element: <RequireAuth roles={['instructor']}>{soon('areas.instructor')}</RequireAuth> },
      { path: '/team', element: <RequireAuth roles={['team']}><Dashboard area="team" /></RequireAuth> },
      { path: '/team/requests', element: <RequireAuth roles={['team']}><StaffRequests as="team" /></RequireAuth> },
      { path: '/team/requests/:id', element: <RequireAuth roles={['team']}><RequestDetailPage as="team" /></RequireAuth> },
      { path: '/team/*', element: <RequireAuth roles={['team']}>{soon('areas.team')}</RequireAuth> },
      { path: '/admin', element: <RequireAuth roles={['admin']}><AdminOverview /></RequireAuth> },
      { path: '/admin/users', element: <RequireAuth roles={['admin']}><AdminUsers /></RequireAuth> },
      { path: '/admin/courses', element: <RequireAuth roles={['admin']}><AdminCourses /></RequireAuth> },
      { path: '/admin/courses/new', element: <RequireAuth roles={['admin']}><CourseEditorPage /></RequireAuth> },
      { path: '/admin/courses/:id', element: <RequireAuth roles={['admin']}><CourseEditorPage /></RequireAuth> },
      { path: '/admin/requests', element: <RequireAuth roles={['admin']}><StaffRequests as="admin" /></RequireAuth> },
      { path: '/admin/requests/:id', element: <RequireAuth roles={['admin']}><RequestDetailPage as="admin" /></RequireAuth> },
      { path: '/admin/inbox', element: <RequireAuth roles={['admin']}><RequestCenter /></RequireAuth> },
      { path: '/admin/*', element: <RequireAuth roles={['admin']}>{soon('areas.admin')}</RequireAuth> },

      { path: '*', element: <Placeholder notFound /> },
    ],
  },
])
