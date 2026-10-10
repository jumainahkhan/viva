import { useState } from 'react'
import type { ReportResponse } from './api'
import { Button, Footer, PROFESSOR_IDS, PROFESSORS, ProfName, SectionHeading, TopBar } from './professors'

const fmtGrade = (g: number) => g.toFixed(2).replace(/\.?0+$/, '')

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
      lines.push(`Verdict: ${review.verdict}. To revise: ${review.what_to_improve}`)
      lines.push(`Model answer: ${review.stronger_answer}`)
    }
    lines.push('')
  })
  lines.push('To revise:', ...data.report.improvements.map((s) => `- ${s}`))
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'viva-transcript.txt'
  a.click()
  URL.revokeObjectURL(url)
}

export default function Report({ data, onRestart }: { data: ReportResponse; onRestart: () => void }) {
  const { report, plan, topics } = data
  const pass = report.grade >= 4
  const today = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <TopBar
        right={
          <div className="flex flex-wrap gap-2 text-sm">
            <Button variant="secondary" onClick={() => downloadTranscript(data)}>Download transcript (.txt)</Button>
            <Button onClick={onRestart} className="py-2">New exam</Button>
          </div>
        }
      />
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-8 sm:px-6">
        <h1 className="font-serif text-4xl">Examination record</h1>

        {/* Record block */}
        <div className="mt-6 grid border border-ink md:grid-cols-[minmax(0,1fr)_320px]">
          <dl className="grid grid-cols-[8rem_1fr] text-sm">
            <dt className="border-b border-rule px-4 py-2.5 font-semibold">Course</dt>
            <dd className="border-b border-rule px-4 py-2.5">{data.course_title}</dd>
            <dt className="border-b border-rule px-4 py-2.5 font-semibold">Date</dt>
            <dd className="border-b border-rule px-4 py-2.5">{today}</dd>
            <dt className="border-b border-rule px-4 py-2.5 font-semibold">Panel</dt>
            <dd className="border-b border-rule px-4 py-2.5">
              {PROFESSOR_IDS.map((id) => `${PROFESSORS[id].name} (${data.panel.strictness[id]})`).join(', ')}
            </dd>
            <dt className="border-b border-rule px-4 py-2.5 font-semibold md:border-b-0">Questions</dt>
            <dd className="border-b border-rule px-4 py-2.5 md:border-b-0">{data.transcript.length}</dd>
            {data.panel.focus && (
              <>
                <dt className="border-t border-rule px-4 py-2.5 font-semibold">Notes</dt>
                <dd className="border-t border-rule px-4 py-2.5">{data.panel.focus}</dd>
              </>
            )}
          </dl>
          <div className="border-t border-ink p-5 md:border-l md:border-t-0">
            <p className="text-sm font-semibold">Grade</p>
            <p className={`font-serif text-7xl leading-none tabular-nums ${pass ? '' : 'text-skeptic'}`}>{fmtGrade(report.grade)}</p>
            <p className={`mt-1 font-semibold ${pass ? '' : 'text-skeptic'}`}>{pass ? 'Sufficient' : 'Insufficient'}</p>
            <SwissScale grade={report.grade} />
          </div>
        </div>

        <p className="mt-6 max-w-4xl font-serif text-xl leading-relaxed">{report.summary}</p>

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <SectionHeading>Strengths</SectionHeading>
            <ul className="space-y-2">
              {report.strengths.map((s) => <li key={s} className="border-b border-rule pb-2">{s}</li>)}
            </ul>
          </div>
          <div>
            <SectionHeading>To revise</SectionHeading>
            <ol className="space-y-2">
              {report.improvements.map((s, i) => (
                <li key={s} className="grid grid-cols-[1.5rem_1fr] border-b border-rule pb-2"><span className="tabular-nums text-muted">{i + 1}.</span><span>{s}</span></li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 space-y-12">
            <section>
              <SectionHeading>Answers</SectionHeading>
              <div>
                {data.transcript.map((t, i) => (
                  <AnswerRecord key={i} n={i + 1} turn={t} topic={topics[t.topic_id] ?? t.topic_id} review={report.answer_reviews.find((r) => r.question_number === i + 1)} />
                ))}
              </div>
            </section>

            <section>
              <SectionHeading>Topics</SectionHeading>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink">
                    <th className="py-2 pr-3 font-semibold">Topic</th>
                    <th className="py-2 pr-3 text-right font-semibold">Grade</th>
                    <th className="py-2 font-semibold">Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {report.per_topic.map((t) => (
                    <tr key={t.topic_id} className="border-b border-rule align-top">
                      <td className="py-2.5 pr-3 font-medium">{topics[t.topic_id] ?? t.topic_id}</td>
                      <td className={`py-2.5 pr-3 text-right tabular-nums font-semibold ${t.score < 4 ? 'text-skeptic' : ''}`}>{fmtGrade(t.score)}</td>
                      <td className="py-2.5">{t.feedback}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <SectionHeading note="Minutes of the panel's discussion before grading.">Deliberation</SectionHeading>
              <div className="space-y-2.5">
                {report.deliberation.map((line, i) => (
                  <p key={i} className="pl-6 -indent-6">
                    <ProfName id={line.professor} />: {line.text}
                  </p>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-10 lg:sticky lg:top-6 lg:self-start">
            <section>
              <SectionHeading note={`${plan.sessions.length} sessions${data.exam_date ? ` until ${prettyDate(data.exam_date)}` : ' over the next two weeks'}. Weakest topics first.`}>
                Revision plan
              </SectionHeading>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink">
                    <th className="py-1.5 pr-2 font-semibold">Date</th>
                    <th className="py-1.5 pr-2 text-right font-semibold">Min</th>
                    <th className="py-1.5 font-semibold">Topics and goal</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.sessions.map((s, i) => (
                    <tr key={i} className="border-b border-rule align-top">
                      <td className="whitespace-nowrap py-2 pr-2">{prettyDate(s.date)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{s.duration_min}</td>
                      <td className="py-2">
                        <span className="font-medium">{s.topic_ids.map((t) => topics[t] ?? t).join(', ')}</span>
                        <span className="block text-muted">{s.goal}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <a href={data.ics_url} download className="mt-4 block border border-ink bg-ink px-5 py-2.5 text-center font-semibold text-white hover:bg-black">
                Download calendar (.ics)
              </a>
            </section>
          </aside>
        </div>

        {plan.flashcards.length > 0 && (
          <section className="mt-12">
            <SectionHeading>Flashcards</SectionHeading>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {plan.flashcards.map((c, i) => <Flashcard key={i} front={c.front} back={c.back} topic={topics[c.topic_id] ?? c.topic_id} />)}
            </div>
          </section>
        )}
      </div>
      <Footer />
    </>
  )
}

function AnswerRecord({ n, turn, topic, review }: {
  n: number
  turn: ReportResponse['transcript'][number]
  topic: string
  review?: ReportResponse['report']['answer_reviews'][number]
}) {
  const [open, setOpen] = useState(false)
  const avg = turn.assessments.reduce((s, a) => s + a.score_0_to_10, 0) / Math.max(1, turn.assessments.length)
  return (
    <article className="border-b border-rule py-5 first:pt-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">Question {n} <span className="font-normal text-muted">· {topic}</span></p>
        {review && <p className={`text-sm font-semibold ${avg < 5 ? 'text-skeptic' : ''}`}>{review.verdict}</p>}
      </div>
      <p className="mt-2 pl-6 -indent-6 font-serif text-lg"><ProfName id={turn.speaker} className="font-sans text-base" />: {turn.question}</p>
      <p className="mt-2 pl-6 -indent-6"><span className="font-semibold">You:</span> {turn.answer}</p>
      <p className="mt-2 text-sm text-muted tabular-nums">
        {turn.assessments.map((a) => `${PROFESSORS[a.professor].name} ${a.score_0_to_10}/10${a.bluff_signal > 0.6 ? ' (bluff flagged)' : ''}`).join(' · ')}
      </p>
      {review && (
        <>
          <p className="mt-2"><span className="font-semibold">To revise:</span> {review.what_to_improve}</p>
          <Button variant="link" className="mt-2 text-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide model answer' : 'Show model answer'}
          </Button>
          {open && (
            <div className="mt-2 border border-rule p-4">
              <p className="text-sm font-semibold">Model answer</p>
              <p className="mt-1 font-serif text-lg leading-relaxed">{review.stronger_answer}</p>
            </div>
          )}
        </>
      )}
    </article>
  )
}

function SwissScale({ grade }: { grade: number }) {
  const filled = Math.round(grade)
  return (
    <div className="mt-4" aria-label={`Swiss grading scale from 1 to 6, where 4 is a pass. Grade ${grade}.`}>
      <div className="flex" aria-hidden>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span
            key={n}
            className={`-ml-px flex h-8 flex-1 items-center justify-center border border-ink text-sm tabular-nums first:ml-0 ${
              n === filled ? (grade < 4 ? 'border-skeptic bg-skeptic text-white' : 'bg-ink text-white') : ''
            } ${n === 4 ? 'border-l-2' : ''}`}
          >
            {n}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">Swiss scale: 6 is the highest grade; 4 is the minimum pass.</p>
    </div>
  )
}

function Flashcard({ front, back, topic }: { front: string; back: string; topic: string }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="-ml-px -mt-px flex min-h-48 flex-col border border-ink p-4">
      <p className="text-xs text-muted">{topic}</p>
      <p className="mt-1.5 flex-1 font-serif text-lg leading-snug">{front}</p>
      {shown && <p className="mt-3 border-t border-rule pt-3 text-sm">{back}</p>}
      <Button variant="link" className="mt-3 self-start text-sm" aria-expanded={shown} onClick={() => setShown((s) => !s)}>
        {shown ? 'Hide answer' : 'Show answer'}
      </Button>
    </div>
  )
}
