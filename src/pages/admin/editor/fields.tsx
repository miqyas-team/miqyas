import { useId, type ReactNode } from 'react'
import type { Localized } from '../../../lib/lang'

/** يحوّل ٠-٩ و۰-۹ إلى 0-9 */
const toLatinDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => String((d.charCodeAt(0) & 0xf) % 10))

const inputCls =
  'w-full rounded-xl border border-primary/15 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-secondary focus:ring-4 focus:ring-secondary/20'

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-primary/10 bg-white p-5 md:p-6">
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold text-primary">{title}</h2>}
          {actions}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  )
}

export function Label({ htmlFor, children, hint }: { htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
      {hint && <span className="ms-1.5 text-xs font-normal text-muted">{hint}</span>}
    </label>
  )
}

/** حقل ثنائي اللغة: عربي + English */
export function BiField({
  label,
  value,
  onChange,
  multiline = false,
  rows = 3,
  hint,
}: {
  label: string
  value: Localized
  onChange: (v: Localized) => void
  multiline?: boolean
  rows?: number
  hint?: string
}) {
  const id = useId()
  const field = (lang: 'ar' | 'en') => {
    const props = {
      id: `${id}-${lang}`,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      lang,
      value: value[lang],
      placeholder: lang === 'ar' ? 'عربي' : 'English',
      className: inputCls,
    }
    return multiline ? (
      <textarea {...props} rows={rows} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
    ) : (
      <input {...props} onChange={(e) => onChange({ ...value, [lang]: e.target.value })} />
    )
  }
  return (
    <div>
      <Label htmlFor={`${id}-ar`} hint={hint}>{label}</Label>
      <div className="grid gap-2 md:grid-cols-2">
        {field('ar')}
        {field('en')}
      </div>
    </div>
  )
}

export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  dir,
  hint,
  placeholder,
  min,
  max,
}: {
  label: string
  value: string | number
  onChange: (v: string) => void
  type?: string
  dir?: 'ltr' | 'rtl'
  hint?: string
  placeholder?: string
  min?: number
  max?: number
}) {
  const id = useId()
  return (
    <div>
      <Label htmlFor={id} hint={hint}>{label}</Label>
      {type === 'number' ? (
        // حقل نصي بلوحة أرقام: يعرض 0-9 دائماً ويحوّل الأرقام العربية-الهندية تلقائياً
        <input
          id={id}
          type="text"
          inputMode="decimal"
          dir="ltr"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(toLatinDigits(e.target.value).replace(/[^\d.]/g, ''))}
          className={inputCls}
          aria-valuemin={min}
          aria-valuemax={max}
        />
      ) : (
        <input id={id} type={type} dir={dir} min={min} max={max} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      )}
    </div>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  const id = useId()
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-primary/15 transition peer-checked:bg-secondary peer-focus-visible:ring-4 peer-focus-visible:ring-secondary/30" />
        <span className="absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition ltr:peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  )
}

export function IconButton({ label, onClick, children, danger = false, disabled = false }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`rounded-lg p-1.5 transition disabled:opacity-30 ${danger ? 'text-red-500 hover:bg-red-50' : 'text-muted hover:bg-primary-50 hover:text-primary'}`}
    >
      {children}
    </button>
  )
}
