import { supabase } from '../lib/supabase'

export interface SignUpInput {
  fullName: string
  email: string
  phone: string
  password: string
  specialization?: string
  organization?: string
  lang: 'ar' | 'en'
}

export async function signUpWithEmail(input: SignUpInput) {
  return supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/app`,
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone,
        specialization: input.specialization?.trim() || null,
        organization: input.organization?.trim() || null,
        preferred_lang: input.lang,
      },
    },
  })
}

export function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim(), password })
}

export function signInWithGoogle(next = '/app') {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${next}` },
  })
}

export function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/update-password`,
  })
}

export function updatePassword(password: string) {
  return supabase.auth.updateUser({ password })
}

/** يحوّل رسائل Supabase إلى مفاتيح ترجمة */
export function authErrorKey(message: string | undefined): string {
  const m = (message ?? '').toLowerCase()
  if (m.includes('invalid login credentials')) return 'errors.invalidCredentials'
  if (m.includes('already registered') || m.includes('already been registered')) return 'errors.emailTaken'
  if (m.includes('email not confirmed')) return 'errors.emailNotConfirmed'
  if (m.includes('database error saving new user')) return 'errors.phoneTaken'
  if (m.includes('rate limit') || m.includes('too many')) return 'errors.rateLimit'
  if (m.includes('password')) return 'errors.weakPassword'
  if (m.includes('fetch') || m.includes('network')) return 'errors.network'
  return 'errors.generic'
}
