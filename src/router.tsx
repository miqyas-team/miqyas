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
      { path: '/software', element: soon('nav.software') },
      { path: '/services', element: soon('nav.services') },
      { path: '/services/request', element: soon('hero.requestService') },
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
      { path: '/app/*', element: <RequireAuth>{soon('areas.app')}</RequireAuth> },

      // لوحات الأدوار (المدير يدخلها كلها)
      { path: '/instructor', element: <RequireAuth roles={['instructor']}><Dashboard area="instructor" /></RequireAuth> },
      { path: '/instructor/courses', element: <RequireAuth roles={['instructor']}><AdminCourses /></RequireAuth> },
      { path: '/instructor/courses/:id', element: <RequireAuth roles={['instructor']}><CourseEditorPage /></RequireAuth> },
      { path: '/instructor/*', element: <RequireAuth roles={['instructor']}>{soon('areas.instructor')}</RequireAuth> },
      { path: '/team', element: <RequireAuth roles={['team']}><Dashboard area="team" /></RequireAuth> },
      { path: '/team/*', element: <RequireAuth roles={['team']}>{soon('areas.team')}</RequireAuth> },
      { path: '/admin', element: <RequireAuth roles={['admin']}><Dashboard area="admin" /></RequireAuth> },
      { path: '/admin/courses', element: <RequireAuth roles={['admin']}><AdminCourses /></RequireAuth> },
      { path: '/admin/courses/new', element: <RequireAuth roles={['admin']}><CourseEditorPage /></RequireAuth> },
      { path: '/admin/courses/:id', element: <RequireAuth roles={['admin']}><CourseEditorPage /></RequireAuth> },
      { path: '/admin/inbox', element: <RequireAuth roles={['admin', 'team']}>{soon('areas.inbox')}</RequireAuth> },
      { path: '/admin/*', element: <RequireAuth roles={['admin']}>{soon('areas.admin')}</RequireAuth> },

      { path: '*', element: <Placeholder notFound /> },
    ],
  },
])
