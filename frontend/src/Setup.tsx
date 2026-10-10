import { useEffect, useRef, useState } from 'react'
import { createSession, type Language, type PanelConfig, type ProfessorId, type SessionResponse, type Strictness } from './api'
import { WavRecorder } from './recorder'
import { AgentBadge, Avatar, PROFESSOR_IDS, PROFESSORS, STRICTNESS, TopBar, TUNING_COPY } from './professors'

const LENGTHS = [
  { n: 4, label: 'Quick', hint: '~5 min' },
  { n: 6, label: 'Standard', hint: '~8 min' },
  { n: 8, label: 'Full', hint: '~12 min' },
]

const LOADING_STEPS = [
  'Blueprint agent is reading your slides…',
  'Finding the examinable topics…',
  'Writing what a strong answer must include…',
  'The professor agents are taking their seats…',
]

const AGENT_STEPS = [
  { title: 'Blueprint agent', body: 'Reads your PDF and maps every examinable topic, the key concepts, what a strong answer includes and the classic misconceptions.' },
  { title: '3 professor agents, in parallel', body: 'After every answer, Theorist, Practitioner and Skeptic each score it, spot the gaps and estimate how much you were bluffing.' },
  { title: 'Chair agent', body: 'Reads all three verdicts and decides who asks next and what. The Skeptic takes the floor when you bluff; nobody speaks three times in a row.' },
  { title: 'Deliberation agent', body: 'The panel debates your performance and agrees on a grade on the Swiss 1–6 scale, with an answer-by-answer analysis.' },
  { title: 'Coach agent', body: 'Turns the weak spots into a revision plan up to your exam date, flashcards and a calendar file.' },
]

const FOCUS_EXAMPLES = ['Focus on regularisation, I’m weak there', 'Ask me for derivations', 'Treat me like it’s the real exam']

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
        <div className="mx-auto flex min-h-[75vh] max-w-lg flex-col items-center justify-center px-4 text-center" role="status" aria-live="polite">
          <div className="mb-8 flex -space-x-3">
            {PROFESSOR_IDS.map((id) => <Avatar key={id} id={id} size="lg" />)}
          </div>
          <p className="font-display text-2xl font-semibold">{LOADING_STEPS[step]}</p>
          <p className="mt-3 text-muted">About 15 seconds. Take a breath. This is practice, so mistakes here are how you get better.</p>
          <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-theorist transition-all duration-1000" style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }} />
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12 lg:pt-14">
        {/* ---------- Left: pitch + agents ---------- */}
        <div>
          <p className="inline-block rounded-full bg-theorist-soft px-3 py-1 text-sm font-semibold text-theorist">Mock oral exam prep</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Sit your oral exam before the real one.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            Upload your lecture slides and answer out loud to a panel of three AI professor agents. They question you, push back when you
            bluff, grade you on the Swiss scale and tell you exactly what to improve before exam day.
          </p>
          <a href="#setup" className="mt-6 inline-block rounded-2xl bg-ink px-5 py-3 font-semibold text-white lg:hidden">Set up my mock exam ↓</a>

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">Your examining panel</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {PROFESSOR_IDS.map((id) => (
              <div key={id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                <div className="flex items-center gap-3">
                  <Avatar id={id} />
                  <div>
                    <p className={`font-semibold ${PROFESSORS[id].text}`}>{PROFESSORS[id].name}</p>
                    <AgentBadge />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted">{PROFESSORS[id].tagline}. {PROFESSORS[id].style}.</p>
              </div>
            ))}
          </div>

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">How the agents work</h2>
          <ol className="mt-3 space-y-0">
            {AGENT_STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{i + 1}</span>
                  {i < AGENT_STEPS.length - 1 && <span aria-hidden className="w-px flex-1 bg-black/10" />}
                </div>
                <div className="pb-5">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="text-sm text-muted">
            Every agent reasons with <span className="font-semibold text-ink">Google Gemini</span>; you hear each professor in their own{' '}
            <span className="font-semibold text-ink">Gradium</span> voice, and Gradium transcribes your spoken answers.
          </p>
        </div>

        {/* ---------- Right: setup form ---------- */}
        <div id="setup" className="scroll-mt-20 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="font-display text-2xl font-semibold">Set up your mock exam</h2>

            <div>
              <h3 className="mb-2 font-semibold">Lecture slides</h3>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
                className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${
                  dragging ? 'border-theorist bg-theorist-soft' : file ? 'border-practitioner bg-practitioner-soft' : 'border-black/15 hover:border-theorist hover:bg-theorist-soft/50'
                }`}
              >
                {file ? (
                  <>
                    <span className="font-semibold text-practitioner">✓ {file.name}</span>
                    <span className="mt-1 text-sm text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · click to change</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Drop your PDF here, or click to browse</span>
                    <span className="mt-1 text-sm text-muted">The panel only asks about what's in your slides</span>
                  </>
                )}
              </button>
              <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="exam-date" className="mb-2 block font-semibold">Real exam date</label>
                <input id="exam-date" type="date" min={today} value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full rounded-xl border border-black/15 px-3 py-2.5" />
                <p className="mt-1.5 text-sm text-muted">
                  {days === null ? 'Optional, used to plan your revision.' : days <= 0 ? "That's today. Good luck!" : `${days} day${days === 1 ? '' : 's'} to go.`}
                </p>
              </div>
              <fieldset>
                <legend className="mb-2 font-semibold">Exam language</legend>
                <Segmented
                  name="lang"
                  value={language}
                  options={[{ value: 'en', label: 'English' }, { value: 'de', label: 'Deutsch' }]}
                  onChange={(v) => setLanguage(v as Language)}
                />
              </fieldset>
            </div>

            <fieldset>
              <legend className="mb-2 font-semibold">Length</legend>
              <div className="grid grid-cols-3 gap-2">
                {LENGTHS.map((o) => (
                  <label key={o.n} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-theorist ${length === o.n ? 'border-theorist bg-theorist-soft' : 'border-black/15 hover:bg-black/[0.02]'}`}>
                    <input type="radio" name="length" value={o.n} checked={length === o.n} onChange={() => setLength(o.n)} className="sr-only" />
                    <span className={`block font-semibold ${length === o.n ? 'text-theorist' : ''}`}>{o.label}</span>
                    <span className="block text-xs text-muted">{o.n} questions · {o.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Agent tuning */}
            <div className="rounded-2xl bg-paper p-4 ring-1 ring-black/5 sm:p-5">
              <h3 className="font-semibold">Tune your panel</h3>
              <p className="text-sm text-muted">Each professor is a separate AI agent. Set how hard each one pushes you.</p>
              <div className="mt-4 space-y-4">
                {PROFESSOR_IDS.map((id) => (
                  <div key={id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Avatar id={id} size="sm" />
                        <span className={`font-semibold ${PROFESSORS[id].text}`}>{PROFESSORS[id].name}</span>
                      </span>
                      <Segmented
                        small
                        name={`tune-${id}`}
                        value={panel.strictness[id]}
                        options={STRICTNESS.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))}
                        onChange={(v) => tune(id, v as Strictness)}
                      />
                    </div>
                    <p className="mt-1 text-sm text-muted">{TUNING_COPY[id][panel.strictness[id]]}</p>
                  </div>
                ))}
              </div>
              <label htmlFor="focus" className="mt-5 block font-semibold">Tell the panel <span className="font-normal text-muted">(optional)</span></label>
              <textarea
                id="focus"
                rows={2}
                maxLength={400}
                value={panel.focus}
                onChange={(e) => setPanel((p) => ({ ...p, focus: e.target.value }))}
                placeholder="e.g. Focus on regularisation, I'm weak there"
                className="mt-1.5 w-full rounded-xl border border-black/15 bg-white px-3 py-2"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {FOCUS_EXAMPLES.map((ex) => (
                  <button key={ex} type="button" onClick={() => setPanel((p) => ({ ...p, focus: ex }))} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-black/10 hover:text-ink">
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            <MicCheck />

            {error && <p role="alert" className="rounded-xl bg-skeptic-soft px-4 py-3 text-skeptic">{error}</p>}

            <button
              type="button"
              disabled={!file}
              onClick={start}
              className="w-full rounded-2xl bg-ink px-6 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-30"
            >
              {file ? 'Start my mock exam' : 'Add your slides to begin'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function Segmented({ name, value, options, onChange, small = false }: {
  name: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  small?: boolean
}) {
  return (
    <div className="inline-flex w-full rounded-xl bg-black/5 p-1 sm:w-auto" role="radiogroup">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex-1 cursor-pointer rounded-lg text-center font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-theorist ${small ? 'px-2.5 py-1 text-sm' : 'px-3 py-2'} ${
            value === o.value ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'
          }`}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
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
    <div>
      <h3 className="mb-2 font-semibold">Mic check <span className="font-normal text-muted">(optional, you can also type)</span></h3>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={test} disabled={state === 'testing'} className="rounded-xl border border-black/15 px-4 py-2.5 font-medium hover:bg-black/[0.03] disabled:opacity-60">
          {state === 'testing' ? 'Say something…' : 'Test my microphone'}
        </button>
        {state === 'testing' && (
          <div className="h-3 w-40 overflow-hidden rounded-full bg-black/5" aria-label="Microphone level">
            <div className="h-full rounded-full bg-practitioner transition-[width] duration-75" style={{ width: `${level * 100}%` }} />
          </div>
        )}
        <span aria-live="polite" className="text-sm">
          {state === 'testing' && heard && <span className="text-practitioner">✓ We can hear you</span>}
          {state === 'ok' && (heard ? <span className="text-practitioner">✓ Your mic works</span> : <span className="text-skeptic">We didn't hear much. Check your input device, or type your answers.</span>)}
          {state === 'denied' && <span className="text-skeptic">Microphone blocked. Allow it in your browser, or type your answers instead.</span>}
        </span>
      </div>
    </div>
  )
}
