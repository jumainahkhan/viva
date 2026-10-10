import { useState } from 'react'
import type { ReportResponse } from './api'
import { Avatar, PROFESSOR_IDS, PROFESSORS, TopBar } from './professors'

function verdict(grade: number): { label: string; color: string; bg: string } {
  if (grade >= 5.5) return { label: 'Excellent', color: 'text-practitioner', bg: 'bg-practitioner-soft' }
  if (grade >= 5) return { label: 'Good', color: 'text-practitioner', bg: 'bg-practitioner-soft' }
  if (grade >= 4) return { label: 'Pass', color: 'text-theorist', bg: 'bg-theorist-soft' }
  return { label: 'Not yet a pass', color: 'text-skeptic', bg: 'bg-skeptic-soft' }
}

function prettyDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function downloadTranscript(data: ReportResponse) {
  const lines = [`Viva mock oral exam: ${data.course_title}`, `Grade: ${data.report.grade} / 6`, '', data.report.summary, '']
  data.transcript.forEach((t, i) => {
    const review = data.report.answer_reviews.find((r) => r.question_number === i + 1)
    lines.push(`Q${i + 1} (${PROFESSORS[t.speaker].name}, ${data.topics[t.topic_id] ?? t.topic_id}): ${t.question}`)
    lines.push(`Your answer: ${t.answer}`)
    lines.push(`Scores: ${t.assessments.map((a) => `${PROFESSORS[a.professor].name} ${a.score_0_to_10}/10`).join(', ')}`)
    if (review) {
      lines.push(`Verdict: ${review.verdict}. To improve: ${review.what_to_improve}`)
      lines.push(`Stronger answer: ${review.stronger_answer}`)
    }
    lines.push('')
  })
  lines.push('What to improve:', ...data.report.improvements.map((s) => `- ${s}`))
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'viva-transcript.txt'
  a.click()
  URL.revokeObjectURL(url)
}

export default function Report({ data, onRestart }: { data: ReportResponse; onRestart: () => void }) {
  const { report, plan, topics } = data
  const v = verdict(report.grade)

  return (
    <>
      <TopBar
        right={
          <div className="flex gap-2">
            <button type="button" onClick={() => downloadTranscript(data)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold hover:bg-black/[0.03]">
              ⬇ Transcript
            </button>
            <button type="button" onClick={onRestart} className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white hover:bg-black">
              New mock exam
            </button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* Grade + analysis */}
        <section className="grid gap-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10">
          <div className={`rounded-2xl ${v.bg} p-6 text-center`}>
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">Panel grade</p>
            <p className={`mt-1 font-display text-7xl font-bold ${v.color}`}>{report.grade.toFixed(2).replace(/\.?0+$/, '')}</p>
            <p className={`text-lg font-semibold ${v.color}`}>{v.label}</p>
            <SwissScale grade={report.grade} />
          </div>
          <div>
            <p className="text-sm font-medium text-muted">{data.course_title}</p>
            <h1 className="mt-1 font-display text-3xl font-bold">Your mock exam analysis</h1>
            <p className="mt-3 text-lg leading-relaxed">{report.summary}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-practitioner-soft p-5">
                <h2 className="font-semibold text-practitioner">What went well</h2>
                <ul className="mt-2 space-y-1.5">
                  {report.strengths.map((s) => <li key={s} className="flex gap-2"><span aria-hidden className="text-practitioner">✓</span><span>{s}</span></li>)}
                </ul>
              </div>
              <div className="rounded-2xl bg-skeptic-soft p-5">
                <h2 className="font-semibold text-skeptic">What to improve</h2>
                <ol className="mt-2 space-y-1.5">
                  {report.improvements.map((s, i) => <li key={s} className="flex gap-2"><span className="font-semibold text-skeptic">{i + 1}.</span><span>{s}</span></li>)}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Main column */}
          <div className="min-w-0 space-y-8">
            <section>
              <h2 className="font-display text-2xl font-semibold">Answer by answer</h2>
              <p className="mt-1 text-muted">The full transcript, how each professor agent scored you, and what a stronger answer sounds like.</p>
              <div className="mt-4 space-y-4">
                {data.transcript.map((t, i) => (
                  <AnswerCard key={i} n={i + 1} turn={t} topic={topics[t.topic_id] ?? t.topic_id} review={report.answer_reviews.find((r) => r.question_number === i + 1)} />
                ))}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <h2 className="font-display text-2xl font-semibold">Topic by topic</h2>
              <div className="mt-4 grid gap-5 md:grid-cols-2">
                {report.per_topic.map((t) => (
                  <div key={t.topic_id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold">{topics[t.topic_id] ?? t.topic_id}</p>
                      <p className={`font-semibold ${t.score >= 4 ? 'text-practitioner' : 'text-skeptic'}`}>{t.score}</p>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5">
                      <div className={`h-full rounded-full ${t.score >= 4 ? 'bg-practitioner' : 'bg-skeptic'}`} style={{ width: `${((t.score - 1) / 5) * 100}%` }} />
                    </div>
                    <p className="mt-1.5 text-sm text-muted">{t.feedback}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <h2 className="font-display text-2xl font-semibold">The panel's deliberation</h2>
              <p className="mt-1 text-muted">The three professor agents debated your performance before agreeing on the grade.</p>
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
          </div>

          {/* Sidebar: plan */}
          <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="font-display text-2xl font-semibold">Revision plan</h2>
              <p className="mt-1 text-sm text-muted">
                {plan.sessions.length} sessions{data.exam_date ? ` until ${prettyDate(data.exam_date)}` : ' over the next two weeks'}, weakest topics first.
              </p>
              <a href={data.ics_url} download className="mt-4 block rounded-2xl bg-ink px-5 py-3 text-center font-semibold text-white hover:bg-black">
                📅 Add all sessions to my calendar
              </a>
              <ol className="mt-5">
                {plan.sessions.map((s, i) => (
                  <li key={i} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-theorist-soft text-xs font-semibold text-theorist">{i + 1}</span>
                      {i < plan.sessions.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-black/10" />}
                    </div>
                    <div className="text-sm">
                      <p className="font-semibold">{prettyDate(s.date)} · {s.duration_min} min</p>
                      <p className="text-muted">{s.topic_ids.map((t) => topics[t] ?? t).join(', ')}</p>
                      <p className="mt-0.5">{s.goal}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
            <section className="rounded-3xl bg-white p-6 text-sm shadow-sm ring-1 ring-black/5">
              <h2 className="font-semibold">Your panel's settings</h2>
              <ul className="mt-2 space-y-1">
                {PROFESSOR_IDS.map((id) => (
                  <li key={id} className="flex justify-between"><span className={PROFESSORS[id].text}>{PROFESSORS[id].name}</span><span className="capitalize text-muted">{data.panel.strictness[id]}</span></li>
                ))}
              </ul>
              {data.panel.focus && <p className="mt-2 text-muted">Focus: “{data.panel.focus}”</p>}
              <p className="mt-3 text-muted">Try again with a tougher panel once you've worked through your plan.</p>
            </section>
          </aside>
        </div>

        {plan.flashcards.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-semibold">Flashcards for your weak spots</h2>
            <p className="mt-1 text-muted">Click a card (or press Enter) to flip it.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {plan.flashcards.map((c, i) => <Flashcard key={i} front={c.front} back={c.back} topic={topics[c.topic_id] ?? c.topic_id} />)}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

function AnswerCard({ n, turn, topic, review }: {
  n: number
  turn: ReportResponse['transcript'][number]
  topic: string
  review?: ReportResponse['report']['answer_reviews'][number]
}) {
  const [open, setOpen] = useState(false)
  const p = PROFESSORS[turn.speaker]
  const avg = turn.assessments.reduce((s, a) => s + a.score_0_to_10, 0) / Math.max(1, turn.assessments.length)
  return (
    <article className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-muted">Question {n} · {topic}</p>
        {review && (
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${avg >= 7.5 ? 'bg-practitioner-soft text-practitioner' : avg >= 5 ? 'bg-theorist-soft text-theorist' : 'bg-skeptic-soft text-skeptic'}`}>
            {review.verdict}
          </span>
        )}
      </div>
      <div className="mt-3 flex gap-3">
        <Avatar id={turn.speaker} size="sm" />
        <p><span className={`font-semibold ${p.text}`}>{p.name}: </span>{turn.question}</p>
      </div>
      <div className="mt-3 rounded-2xl bg-paper p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your answer</p>
        <p className="mt-1">{turn.answer}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {turn.assessments.map((a) => (
          <span key={a.professor} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PROFESSORS[a.professor].soft} ${PROFESSORS[a.professor].text}`}>
            {PROFESSORS[a.professor].name} {a.score_0_to_10}/10{a.bluff_signal > 0.6 ? ' · bluff flagged' : ''}
          </span>
        ))}
      </div>
      {review && (
        <>
          <p className="mt-3"><span className="font-semibold">To improve: </span>{review.what_to_improve}</p>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 text-sm font-semibold text-theorist hover:underline">
            {open ? 'Hide' : 'Show'} a stronger answer
          </button>
          {open && <p className="mt-2 rounded-2xl border-l-4 border-theorist bg-theorist-soft p-4">{review.stronger_answer}</p>}
        </>
      )}
    </article>
  )
}

function SwissScale({ grade }: { grade: number }) {
  const pos = ((grade - 1) / 5) * 100
  return (
    <div className="mt-6" aria-label={`Swiss grading scale from 1 to 6. 4 is a pass. Your grade is ${grade}.`}>
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-skeptic/30 via-skeptic/20 to-practitioner/40">
        <span aria-hidden className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-ink shadow" style={{ left: `${pos}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((n) => <span key={n} className={n === 4 ? 'font-semibold text-ink' : ''}>{n}</span>)}
      </div>
      <p className="mt-2 text-xs text-muted">Swiss scale: 6 is best, 4 is a pass.</p>
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
      className="flip-card h-52 w-full text-left"
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
