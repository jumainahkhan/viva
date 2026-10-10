import { useState } from 'react'
import type { ReportResponse } from './api'
import { Avatar, PROFESSORS } from './professors'

function verdict(grade: number): { label: string; note: string; color: string } {
  if (grade >= 5.5) return { label: 'Excellent', note: 'You would walk out of the real exam smiling.', color: 'text-practitioner' }
  if (grade >= 5) return { label: 'Good', note: 'Solid work. Polish the gaps below and you are there.', color: 'text-practitioner' }
  if (grade >= 4) return { label: 'Pass', note: 'You passed. A few focused sessions will lift this further.', color: 'text-theorist' }
  return { label: 'Not yet a pass', note: "That's exactly why you practise. Your plan below targets the gaps.", color: 'text-skeptic' }
}

function prettyDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function Report({ data, onRestart }: { data: ReportResponse; onRestart: () => void }) {
  const { report, plan, topics } = data
  const v = verdict(report.grade)

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:pt-12">
      <p className="text-center text-sm font-medium text-muted">{data.course_title}</p>

      {/* Grade */}
      <section className="mt-4 rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ring-black/5 sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">The panel's grade</p>
        <p className={`mt-2 font-display text-7xl font-bold ${v.color}`}>{report.grade.toFixed(2).replace(/\.?0+$/, '')}</p>
        <p className={`mt-1 text-xl font-semibold ${v.color}`}>{v.label}</p>
        <p className="mt-2 text-muted">{v.note}</p>
        <SwissScale grade={report.grade} />
      </section>

      {/* Strengths */}
      <section className="mt-6 rounded-3xl bg-practitioner-soft p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">What went well</h2>
        <ul className="mt-3 space-y-2">
          {report.strengths.map((s) => (
            <li key={s} className="flex gap-2"><span aria-hidden className="text-practitioner">✓</span><span>{s}</span></li>
          ))}
        </ul>
      </section>

      {/* Per topic */}
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Topic by topic</h2>
        <div className="mt-4 space-y-5">
          {report.per_topic.map((t) => (
            <div key={t.topic_id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">{topics[t.topic_id] ?? t.topic_id}</p>
                <p className={`font-semibold ${t.score >= 4 ? 'text-practitioner' : 'text-skeptic'}`}>{t.score}</p>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
                <div className={`h-full rounded-full ${t.score >= 4 ? 'bg-practitioner' : 'bg-skeptic'}`} style={{ width: `${((t.score - 1) / 5) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-muted">{t.feedback}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Deliberation */}
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="font-display text-2xl font-semibold">Behind closed doors</h2>
        <p className="mt-1 text-muted">How the panel agreed on your grade.</p>
        <div className="mt-4 space-y-3">
          {report.deliberation.map((line, i) => (
            <div key={i} className="flex gap-3">
              <Avatar id={line.professor} size="sm" />
              <div className={`rounded-2xl rounded-tl-sm px-4 py-2.5 ${PROFESSORS[line.professor].soft}`}>
                <p className={`text-xs font-semibold ${PROFESSORS[line.professor].text}`}>{PROFESSORS[line.professor].name}</p>
                <p>{line.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Revision plan */}
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold">Your revision plan</h2>
            <p className="mt-1 text-muted">
              {plan.sessions.length} sessions{data.exam_date ? ` until your exam on ${prettyDate(data.exam_date)}` : ' over the next two weeks'}. Weakest topics first.
            </p>
          </div>
          <a href={data.ics_url} download className="shrink-0 rounded-2xl bg-ink px-5 py-3 text-center font-semibold text-white hover:bg-black">
            📅 Add to my calendar
          </a>
        </div>
        <ol className="mt-5 space-y-0">
          {plan.sessions.map((s, i) => (
            <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-theorist-soft text-sm font-semibold text-theorist">{i + 1}</span>
                {i < plan.sessions.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-black/10" />}
              </div>
              <div className="pt-1">
                <p className="font-semibold">{prettyDate(s.date)} · {s.duration_min} min</p>
                <p className="text-sm text-muted">{s.topic_ids.map((t) => topics[t] ?? t).join(', ')}</p>
                <p className="mt-1">{s.goal}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Flashcards */}
      {plan.flashcards.length > 0 && (
        <section className="mt-6">
          <h2 className="font-display text-2xl font-semibold">Flashcards for your weak spots</h2>
          <p className="mt-1 text-muted">Click a card (or press Enter) to flip it.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {plan.flashcards.map((c, i) => <Flashcard key={i} front={c.front} back={c.back} topic={topics[c.topic_id] ?? c.topic_id} />)}
          </div>
        </section>
      )}

      <div className="mt-10 text-center">
        <button type="button" onClick={onRestart} className="rounded-2xl border border-black/15 bg-white px-6 py-3 font-semibold hover:bg-black/[0.03]">
          Practise again
        </button>
      </div>
    </div>
  )
}

function SwissScale({ grade }: { grade: number }) {
  const pos = ((grade - 1) / 5) * 100
  return (
    <div className="mx-auto mt-8 max-w-md" aria-label={`Swiss grading scale from 1 to 6. 4 is a pass. Your grade is ${grade}.`}>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-skeptic/30 via-skeptic/20 to-practitioner/40">
        <span aria-hidden className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-ink shadow" style={{ left: `${pos}%` }} />
        <span aria-hidden className="absolute -top-1 h-5 w-0.5 bg-ink/40" style={{ left: '60%' }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={n === 4 ? 'font-semibold text-ink' : ''}>{n}{n === 4 ? ' pass' : ''}</span>)}
      </div>
      <p className="mt-2 text-xs text-muted">Swiss scale: 6 is the best grade, 4 is a pass.</p>
    </div>
  )
}

function Flashcard({ front, back, topic }: { front: string; back: string; topic: string }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setFlipped((f) => !f)}
      aria-label={flipped ? `Answer: ${back}` : `Question: ${front}. Press to reveal the answer.`}
      className="flip-card h-48 w-full text-left"
      data-flipped={flipped}
    >
      <div className="flip-inner relative h-full w-full">
        <div className="flip-face absolute inset-0 flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <span className="text-xs font-semibold uppercase tracking-wide text-theorist">{topic}</span>
          <p className="mt-2 flex-1 font-display text-lg leading-snug">{front}</p>
          <span className="text-xs text-muted">Tap to reveal</span>
        </div>
        <div className="flip-face flip-back absolute inset-0 flex flex-col overflow-auto rounded-2xl bg-theorist p-5 text-white shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">Answer</span>
          <p className="mt-2">{back}</p>
        </div>
      </div>
    </button>
  )
}
