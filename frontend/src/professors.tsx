import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { ProfessorId, Strictness } from './api'

export const PROFESSORS: Record<ProfessorId, { name: string; asks: string; manner: string; text: string; bg: string; border: string }> = {
  theorist: {
    name: 'Prof. Theorist',
    asks: 'Definitions and derivations',
    manner: 'Rigorous',
    text: 'text-theorist',
    bg: 'bg-theorist',
    border: 'border-theorist',
  },
  practitioner: {
    name: 'Prof. Practitioner',
    asks: 'Worked examples and when to use a method',
    manner: 'Demanding',
    text: 'text-practitioner',
    bg: 'bg-practitioner',
    border: 'border-practitioner',
  },
  skeptic: {
    name: 'Prof. Skeptic',
    asks: 'Follow-ups on vague or bluffed answers',
    manner: 'Dry',
    text: 'text-skeptic',
    bg: 'bg-skeptic',
    border: 'border-skeptic',
  },
}

export const PROFESSOR_IDS: ProfessorId[] = ['theorist', 'practitioner', 'skeptic']
export const STRICTNESS: Strictness[] = ['gentle', 'balanced', 'tough']
export const BLUFF_THRESHOLD: Record<Strictness, number> = { gentle: 0.75, balanced: 0.6, tough: 0.45 }

// What each strictness level changes; shown under the strictness controls.
export const TUNING_COPY: Record<ProfessorId, Record<Strictness, string>> = {
  theorist: {
    gentle: 'Accepts the main idea and builds hints into follow-ups.',
    balanced: 'Expects correct definitions.',
    tough: 'Expects precise definitions and derivations; questions assumptions.',
  },
  practitioner: {
    gentle: 'Accepts a simple example.',
    balanced: 'Asks for a concrete example and when you would use it.',
    tough: 'Asks about trade-offs and edge cases.',
  },
  skeptic: {
    gentle: 'Follows up when the bluff signal exceeds 0.75.',
    balanced: 'Follows up when the bluff signal exceeds 0.60.',
    tough: 'Follows up when the bluff signal exceeds 0.45.',
  },
}

export function Marker({ id, className = '' }: { id: ProfessorId; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 ${PROFESSORS[id].bg} ${className}`} />
}

export function ProfName({ id, className = '' }: { id: ProfessorId; className?: string }) {
  return (
    // Plain inline (not inline-flex) so it sits correctly inside hanging-indent paragraphs.
    <span className={`whitespace-nowrap font-semibold ${className}`}>
      <Marker id={id} className="mr-1.5 align-[0.05em]" />
      {PROFESSORS[id].name}
    </span>
  )
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <a href="/" className="flex items-baseline gap-3">
          <span className="font-serif text-2xl font-bold">Viva</span>
          <span className="text-sm text-muted">Mock oral exam prep</span>
        </a>
        {right}
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="mx-auto max-w-7xl px-4 sm:px-6">
      <p className="border-t border-rule py-5 text-sm text-muted">Built with Google Gemini (reasoning) and Gradium (speech).</p>
    </footer>
  )
}

export function SectionHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="mb-3 border-t-2 border-ink pt-2">
      <h2 className="text-lg font-bold">{children}</h2>
      {note && <p className="text-sm text-muted">{note}</p>}
    </div>
  )
}

export function Segmented({ name, value, options, onChange, size = 'md' }: {
  name: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="flex" role="radiogroup">
      {options.map((o, i) => (
        <label
          key={o.value}
          className={`flex-1 cursor-pointer border border-ink text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${i > 0 ? '-ml-px' : ''} ${
            size === 'sm' ? 'px-2.5 py-1 text-sm' : 'px-3 py-2'
          } ${value === o.value ? 'bg-ink text-white' : 'bg-paper hover:bg-black/[0.04]'}`}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  )
}

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'link' }) {
  const styles = {
    primary: 'border border-ink bg-ink px-5 py-2.5 font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-30',
    secondary: 'border border-ink bg-paper px-4 py-2 font-medium hover:bg-black/[0.04] disabled:opacity-40',
    link: 'font-medium underline underline-offset-4 hover:text-muted disabled:opacity-40',
  }[variant]
  return (
    <button type="button" className={`${styles} ${className}`} {...props}>
      {children}
    </button>
  )
}
