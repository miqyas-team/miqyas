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
import { RequireAuth } from './auth/RequireAuth'

const soon = (titleKey: string) => <Placeholder titleKey={titleKey} />

// هيكل المسارات حسب وثيقة المشروع (docs/SPEC.md)؛ الصفحات تُبنى تباعاً
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Home /> },
      // عامة
      { path: '/courses', element: soon('nav.courses') },
      { path: '/courses/:slug', element: soon('nav.courses') },
      { path: '/software', element: soon('nav.software') },
      { path: '/services', element: soon('nav.services') },
      { path: '/services/request', element: soon('hero.requestService') },
      { path: '/verify/:code', element: soon('brand') },
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
      { path: '/app/*', element: <RequireAuth>{soon('areas.app')}</RequireAuth> },

      // لوحات الأدوار (المدير يدخلها كلها)
      { path: '/instructor', element: <RequireAuth roles={['instructor']}><Dashboard area="instructor" /></RequireAuth> },
      { path: '/instructor/*', element: <RequireAuth roles={['instructor']}>{soon('areas.instructor')}</RequireAuth> },
      { path: '/team', element: <RequireAuth roles={['team']}><Dashboard area="team" /></RequireAuth> },
      { path: '/team/*', element: <RequireAuth roles={['team']}>{soon('areas.team')}</RequireAuth> },
      { path: '/admin', element: <RequireAuth roles={['admin']}><Dashboard area="admin" /></RequireAuth> },
      { path: '/admin/inbox', element: <RequireAuth roles={['admin', 'team']}>{soon('areas.inbox')}</RequireAuth> },
      { path: '/admin/*', element: <RequireAuth roles={['admin']}>{soon('areas.admin')}</RequireAuth> },

      { path: '*', element: <Placeholder notFound /> },
    ],
  },
])
