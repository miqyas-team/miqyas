import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './i18n'
import './index.css'
import { router } from './router'
import { AuthProvider } from './auth/AuthProvider'
import { isSupabaseConfigured } from './lib/supabase'

/**
 * حماية الإنتاج: وضع المعاينة (بيانات نموذجية في المتصفح) للتطوير فقط.
 * إن نُشرت المنصة دون مفاتيح Supabase تظهر رسالة صيانة بدل بيانات وهمية.
 */
function NotConfigured() {
  return (
    <main dir="rtl" lang="ar" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'Readex Pro, system-ui, sans-serif', background: '#F6F3EC', color: '#162220', padding: 24, textAlign: 'center' }}>
      <div>
        <h1 style={{ color: '#0F5E4E', fontSize: 28, margin: 0 }}>مقياس</h1>
        <p style={{ marginTop: 12 }}>المنصة قيد التجهيز، نعود قريباً.</p>
        <p style={{ marginTop: 4, fontSize: 13, color: '#5b6b67' }} dir="ltr">Miqyas is being set up — back soon.</p>
      </div>
    </main>
  )
}

const root = createRoot(document.getElementById('root')!)

if (import.meta.env.PROD && !isSupabaseConfigured) {
  console.error('Miqyas: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing in this build.')
  root.render(<NotConfigured />)
} else {
  root.render(
    <StrictMode>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </StrictMode>,
  )
}
