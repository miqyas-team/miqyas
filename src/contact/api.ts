import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type ContactTopic = 'general' | 'courses' | 'services' | 'partnership' | 'other'

export interface ContactInput {
  name: string
  email: string
  phone: string
  topic: ContactTopic
  message: string
}

export interface ContactMessage extends ContactInput {
  id: string
  createdAt: string
  handled: boolean
}

export interface ContactApi {
  send(input: ContactInput): Promise<void>
  list(): Promise<ContactMessage[]>
  markHandled(id: string): Promise<void>
}

const KEY = 'miqyas-demo-contact'
const read = (): ContactMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ContactMessage[]
  } catch {
    return []
  }
}
const write = (v: ContactMessage[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* تجاهل */
  }
}
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 200))

const demoApi: ContactApi = {
  async send(input) {
    write([{ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), handled: false }, ...read()])
    await delay(null)
  },
  list: async () => delay(read()),
  async markHandled(id) {
    write(read().map((m) => (m.id === id ? { ...m, handled: true } : m)))
    await delay(null)
  },
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>
const supabaseApi: ContactApi = {
  async send(i) {
    const { data } = await supabase.auth.getUser()
    const { error } = await supabase.from('contact_messages').insert({
      name: i.name.trim(), email: i.email.trim(), phone: i.phone.trim() || null, topic: i.topic, message: i.message.trim(), user_id: data.user?.id ?? null,
    })
    if (error) throw new Error(error.message)
  },
  async list() {
    const { data, error } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) throw new Error(error.message)
    return (data as Row[]).map((m) => ({ id: m.id, name: m.name, email: m.email, phone: m.phone ?? '', topic: m.topic, message: m.message, createdAt: m.created_at, handled: Boolean(m.handled_at) }))
  },
  async markHandled(id) {
    const { data } = await supabase.auth.getUser()
    const { error } = await supabase.from('contact_messages').update({ handled_at: new Date().toISOString(), handled_by: data.user?.id }).eq('id', id)
    if (error) throw new Error(error.message)
  },
}

export const contactApi: ContactApi = isSupabaseConfigured ? supabaseApi : demoApi
