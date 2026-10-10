import type { ProfessorId } from './api'

export const PROFESSORS: Record<
  ProfessorId,
  { name: string; initial: string; tagline: string; style: string; text: string; bg: string; soft: string; ring: string; border: string }
> = {
  theorist: {
    name: 'Prof. Theorist',
    initial: 'T',
    tagline: 'Definitions, derivations, why it holds',
    style: 'Rigorous and calm',
    text: 'text-theorist',
    bg: 'bg-theorist',
    soft: 'bg-theorist-soft',
    ring: 'ring-theorist',
    border: 'border-theorist',
  },
  practitioner: {
    name: 'Prof. Practitioner',
    initial: 'P',
    tagline: 'Concrete examples, when to use it',
    style: 'Warm but demanding',
    text: 'text-practitioner',
    bg: 'bg-practitioner',
    soft: 'bg-practitioner-soft',
    ring: 'ring-practitioner',
    border: 'border-practitioner',
  },
  skeptic: {
    name: 'Prof. Skeptic',
    initial: 'S',
    tagline: 'Spots vague or bluffed answers',
    style: 'Dry, sharp, fair',
    text: 'text-skeptic',
    bg: 'bg-skeptic',
    soft: 'bg-skeptic-soft',
    ring: 'ring-skeptic',
    border: 'border-skeptic',
  },
}

export const PROFESSOR_IDS: ProfessorId[] = ['theorist', 'practitioner', 'skeptic']

export function Avatar({ id, size = 'md' }: { id: ProfessorId; size?: 'sm' | 'md' | 'lg' }) {
  const p = PROFESSORS[id]
  const dims = { sm: 'h-8 w-8 text-sm', md: 'h-12 w-12 text-lg', lg: 'h-16 w-16 text-2xl' }[size]
  return (
    <div
      aria-hidden
      className={`${dims} ${p.bg} grid shrink-0 place-items-center rounded-full font-display font-bold text-white shadow-sm`}
    >
      {p.initial}
    </div>
  )
}

export function SpeakingBars({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`inline-flex h-4 items-end gap-0.5 ${className}`}>
      {[0, 0.15, 0.3, 0.45].map((d) => (
        <span key={d} className="speaking-bar h-full w-1 rounded-full bg-current" style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}

export function ThinkingDots() {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 0.2, 0.4].map((d) => (
        <span key={d} className="thinking-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${d}s` }} />
      ))}
    </span>
  )
}
