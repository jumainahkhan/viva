import { useEffect, useRef, useState } from 'react'
import { createSession, type Language, type PanelConfig, type ProfessorId, type SessionResponse, type Strictness } from './api'
import { WavRecorder } from './recorder'
import { Button, Footer, PROFESSOR_IDS, PROFESSORS, ProfName, SectionHeading, Segmented, STRICTNESS, TopBar, TUNING_COPY } from './professors'

const LENGTHS = [
  { n: 4, label: '4 questions' },
  { n: 6, label: '6 questions' },
  { n: 8, label: '8 questions' },
]

const LOADING_STEPS = ['Reading slides', 'Finding examinable topics', 'Writing the exam blueprint', 'Preparing the first question']

const SESSION_STEPS = [
  { title: 'Blueprint agent', body: 'reads your slides and lists the examinable topics, key concepts, what a strong answer includes and common misconceptions.' },
  { title: 'Three examiners score each answer', body: 'Prof. Theorist, Prof. Practitioner and Prof. Skeptic each give a score out of 10, note gaps and estimate a bluff signal.' },
  { title: 'Chair agent', body: 'chooses who asks next and what. Prof. Skeptic follows up when the bluff signal is high; no examiner asks three questions in a row.' },
  { title: 'Deliberation', body: 'the panel discusses your answers and agrees a grade on the Swiss 1–6 scale, with a review of every answer.' },
  { title: 'Revision plan', body: 'study sessions up to your exam date, flashcards for weak topics and a calendar file.' },
]

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

function daysUntil(iso: string): number | null {
  if (!iso) return null
  const ms = new Date(iso + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()
  return Math.round(ms / 86_400_000)
}

export default function Setup({ onReady }: { onReady: (s: SessionResponse) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [examDate, setExamDate] = useState('')
  const [length, setLength] = useState(4)
  const [language, setLanguage] = useState<Language>('en')
  const [panel, setPanel] = useState<PanelConfig>({
    strictness: { theorist: 'balanced', practitioner: 'balanced', skeptic: 'balanced' },
    focus: '',
  })
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 3000)
    return () => clearInterval(id)
  }, [loading])

  const pick = (f: File | undefined) => {
    setError('')
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF of your lecture slides.')
      return
    }
    setFile(f)
  }

  const tune = (id: ProfessorId, s: Strictness) => setPanel((p) => ({ ...p, strictness: { ...p.strictness, [id]: s } }))

  const start = async () => {
    if (!file) return
    setLoading(true)
    setStep(0)
    setError('')
    try {
      onReady(await createSession(file, examDate, length, language, panel))
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  const days = daysUntil(examDate)
  const today = new Date().toISOString().slice(0, 10)

  if (loading) {
    return (
      <>
        <TopBar />
        <div className="mx-auto max-w-xl px-4 py-24" role="status" aria-live="polite">
          <p className="font-serif text-3xl">Preparing your exam</p>
          <p className="mt-2 text-muted">About 15 seconds.</p>
          <ol className="mt-8 border-t border-ink">
            {LOADING_STEPS.map((s, i) => (
              <li key={s} className={`flex justify-between border-b border-rule py-2 ${i > step ? 'text-muted' : ''}`}>
                <span>{s}</span>
                <span className="tabular-nums">{i < step ? 'Done' : i === step ? 'In progress' : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        right={
          <a href="#settings" className="text-sm font-medium underline underline-offset-4 lg:hidden">
            Go to settings
          </a>
        }
      />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-14">
        {/* ---------- Left: what this is ---------- */}
        <div>
          <h1 className="font-serif text-4xl leading-tight sm:text-5xl">Mock oral exams from your own lecture slides.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Upload one lecture's slides. Three AI examiners question you out loud, follow up on vague answers and grade you on the Swiss 1–6
            scale. You get a written record and a revision plan.
          </p>

          <div className="mt-12">
            <SectionHeading>The panel (three AI agents)</SectionHeading>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink">
                  <th className="py-2 pr-3 font-semibold">Examiner</th>
                  <th className="py-2 pr-3 font-semibold">Asks about</th>
                  <th className="py-2 pr-3 font-semibold">Manner</th>
                  <th className="py-2 font-semibold">Strictness</th>
                </tr>
              </thead>
              <tbody>
                {PROFESSOR_IDS.map((id) => (
                  <tr key={id} className="border-b border-rule align-top">
                    <td className="py-2.5 pr-3"><ProfName id={id} /></td>
                    <td className="py-2.5 pr-3">{PROFESSORS[id].asks}</td>
                    <td className="py-2.5 pr-3">{PROFESSORS[id].manner}</td>
                    <td className="py-2.5">{cap(panel.strictness[id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-12">
            <SectionHeading>How a session runs</SectionHeading>
            <ol className="space-y-3">
              {SESSION_STEPS.map((s, i) => (
                <li key={s.title} className="grid grid-cols-[1.75rem_1fr] text-sm">
                  <span className="tabular-nums text-muted">{i + 1}.</span>
                  <span><span className="font-semibold">{s.title}</span> {s.body}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* ---------- Right: settings ---------- */}
        <div id="settings" className="lg:sticky lg:top-6 lg:self-start">
          <div className="border border-ink p-5 sm:p-7">
            <h2 className="font-serif text-2xl">Exam settings</h2>

            <div className="mt-6">
              <p className="mb-1.5 font-semibold">Lecture slides (PDF)</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
                className={`flex flex-wrap items-center justify-between gap-3 border border-dashed px-4 py-4 ${dragging ? 'border-ink bg-black/[0.04]' : 'border-muted'}`}
              >
                <span className={file ? '' : 'text-muted'}>{file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : 'Drop a PDF here, or choose a file.'}</span>
                <Button variant="secondary" onClick={() => inputRef.current?.click()}>{file ? 'Change file' : 'Choose file'}</Button>
              </div>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="exam-date" className="mb-1.5 block font-semibold">Date of the real exam</label>
                <input id="exam-date" type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full border border-ink px-3 py-2" />
                <p className="mt-1 text-sm text-muted">
                  {days === null ? 'Optional. Used for the revision plan.' : days <= 0 ? 'Exam is today.' : `${days} day${days === 1 ? '' : 's'} from today.`}
                </p>
              </div>
              <fieldset>
                <legend className="mb-1.5 font-semibold">Language</legend>
                <Segmented name="lang" value={language} options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]} onChange={(v) => setLanguage(v as Language)} />
              </fieldset>
            </div>

            <fieldset className="mt-5">
              <legend className="mb-1.5 font-semibold">Length</legend>
              <Segmented name="length" value={String(length)} options={LENGTHS.map((o) => ({ value: String(o.n), label: o.label }))} onChange={(v) => setLength(Number(v))} />
            </fieldset>

            <fieldset className="mt-6">
              <legend className="font-semibold">Strictness</legend>
              <p className="text-sm text-muted">Each examiner is a separate AI agent.</p>
              <div className="mt-2 border-t border-ink">
                {PROFESSOR_IDS.map((id) => (
                  <div key={id} className="border-b border-rule py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <ProfName id={id} />
                      <div className="w-full sm:w-72">
                        <Segmented size="sm" name={`tune-${id}`} value={panel.strictness[id]} options={STRICTNESS.map((s) => ({ value: s, label: cap(s) }))} onChange={(v) => tune(id, v as Strictness)} />
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted">{TUNING_COPY[id][panel.strictness[id]]}</p>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="mt-5">
              <label htmlFor="focus" className="block font-semibold">Notes for the panel <span className="font-normal text-muted">(optional)</span></label>
              <textarea
                id="focus"
                rows={2}
                maxLength={400}
                value={panel.focus}
                onChange={(e) => setPanel((p) => ({ ...p, focus: e.target.value }))}
                placeholder="For example: focus on regularisation."
                className="mt-1.5 w-full border border-ink px-3 py-2"
              />
            </div>

            <MicCheck />

            {error && <p role="alert" className="mt-5 border border-skeptic px-4 py-3 text-skeptic">{error}</p>}

            <Button className="mt-6 w-full py-3.5 text-lg" disabled={!file} onClick={start}>
              {file ? 'Start exam' : 'Upload slides to start'}
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </>
  )
}

function MicCheck() {
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'denied'>('idle')
  const [level, setLevel] = useState(0)
  const [heard, setHeard] = useState(false)
  const rec = useRef<WavRecorder | null>(null)

  useEffect(() => () => rec.current?.close(), [])

  const test = async () => {
    try {
      rec.current = new WavRecorder()
      rec.current.onLevel = (l) => {
        setLevel(l)
        if (l > 0.15) setHeard(true)
      }
      await rec.current.init()
      setState('testing')
      setTimeout(() => {
        rec.current?.close()
        setState('ok')
        setLevel(0)
      }, 6000)
    } catch {
      setState('denied')
    }
  }

  return (
    <div className="mt-5">
      <p className="mb-1.5 font-semibold">Microphone <span className="font-normal text-muted">(optional; you can type answers)</span></p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={test} disabled={state === 'testing'}>{state === 'testing' ? 'Speak now' : 'Test microphone'}</Button>
        {state === 'testing' && (
          <div className="h-2 w-40 border border-ink" aria-label="Microphone level">
            <div className="h-full bg-ink" style={{ width: `${level * 100}%` }} />
          </div>
        )}
        <span aria-live="polite" className="text-sm">
          {state === 'testing' && heard && 'Input detected.'}
          {state === 'ok' && (heard ? 'Microphone works.' : <span className="text-skeptic">No input detected. Check the input device, or type your answers.</span>)}
          {state === 'denied' && <span className="text-skeptic">Microphone access is blocked. Allow it in the browser, or type your answers.</span>}
        </span>
      </div>
    </div>
  )
}
