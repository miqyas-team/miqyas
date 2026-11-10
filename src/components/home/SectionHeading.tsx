import type { ReactNode } from 'react'

export function SectionHeading({
  eyebrow,
  title,
  text,
  action,
  light = false,
}: {
  eyebrow: string
  title: string
  text?: string
  action?: ReactNode
  light?: boolean
}) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className={`flex items-center gap-2 text-sm font-semibold ${light ? 'text-accent' : 'text-accent'}`}>
          <span className="dotted-path h-2 w-10" />
          {eyebrow}
        </div>
        <h2 className={`mt-3 text-3xl font-bold leading-tight md:text-4xl ${light ? 'text-white' : 'text-primary'}`}>{title}</h2>
        {text && <p className={`mt-3 leading-relaxed ${light ? 'text-white/70' : 'text-muted'}`}>{text}</p>}
      </div>
      {action}
    </div>
  )
}
