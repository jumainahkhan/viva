import type { ReactNode } from 'react'
import type { ProfessorId, Strictness } from './api'

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

// What each tuning level makes the agent do; shown on the Setup screen.
export const TUNING_COPY: Record<ProfessorId, Record<Strictness, string>> = {
  theorist: {
    gentle: 'Accepts the main idea and builds hints into follow-ups.',
    balanced: 'Expects correct definitions, like a fair real examiner.',
    tough: 'Wants precise definitions and derivations, probes every assumption.',
  },
  practitioner: {
    gentle: 'Happy with a simple example; nudges you towards one.',
    balanced: 'Asks for a concrete example and when you would use it.',
    tough: 'Pushes on trade-offs and edge cases in real use.',
  },
  skeptic: {
    gentle: 'Only steps in on clearly bluffed answers (bluff signal > 0.75).',
    balanced: 'Steps in on vague or hedged answers (bluff signal > 0.6).',
    tough: 'Pounces on any vagueness (bluff signal > 0.45).',
  },
}

export const STRICTNESS: Strictness[] = ['gentle', 'balanced', 'tough']

export function AgentBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted ${className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-practitioner" /> AI agent
    </span>
  )
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div className="leading-tight">
            <p className="font-display text-xl font-bold">Viva</p>
            <p className="text-xs font-medium text-muted">Mock oral exam prep</p>
          </div>
        </div>
        {right ?? (
          <p className="hidden text-xs text-muted sm:block">
            Reasoning by <span className="font-semibold text-ink">Google Gemini</span> · Voices by <span className="font-semibold text-ink">Gradium</span>
          </p>
        )}
      </div>
    </header>
  )
}

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
