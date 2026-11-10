import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'
import { isSupabaseConfigured } from '../lib/supabase'

export function Spinner() {
  return (
    <div className="flex justify-center py-24" role="status" aria-live="polite">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-secondary/30 border-t-primary" />
    </div>
  )
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  optional?: boolean
}

export function Field({ label, error, hint, optional, className = '', ...props }: FieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional && <span className="ms-1 text-xs font-normal text-muted">({t('form.optional')})</span>}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`w-full rounded-xl border bg-white px-4 py-3 outline-none transition focus:ring-4 ${
          error ? 'border-red-400 focus:ring-red-100' : 'border-primary/15 focus:border-secondary focus:ring-secondary/20'
        }`}
        {...props}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-sm text-red-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, children, className = '', disabled, ...props }: ButtonProps) {
  const styles =
    variant === 'primary'
      ? 'bg-primary text-white hover:bg-primary-700 shadow-lg shadow-primary/15'
      : 'border-2 border-primary/20 text-primary hover:bg-primary-50'
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-700',
    success: 'border-secondary/40 bg-secondary-100 text-primary',
    info: 'border-accent/40 bg-accent-100 text-ink',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  )
}

export function NotConfiguredNotice() {
  const { t } = useTranslation()
  if (isSupabaseConfigured) return null
  return <Alert tone="info">{t('auth.notConfigured')}</Alert>
}

/** إطار صفحات الدخول والتسجيل */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="contour-bg">
      <div className="mx-auto max-w-md px-4 py-12 md:py-16">
        <div className="rounded-card border border-primary/10 bg-white p-6 shadow-xl shadow-primary/5 md:p-8">
          <div className="mb-6 text-center">
            <LogoMark className="mx-auto h-12 w-12" />
            <h1 className="mt-4 text-2xl font-bold text-primary">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <div className="space-y-4">
            <NotConfiguredNotice />
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

export function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <span className="h-px flex-1 bg-primary/10" />
      {label}
      <span className="h-px flex-1 bg-primary/10" />
    </div>
  )
}

export function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
