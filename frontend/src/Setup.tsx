import { useEffect, useRef, useState } from 'react'
import { createSession, type Language, type SessionResponse } from './api'
import { WavRecorder } from './recorder'
import { Avatar, PROFESSOR_IDS, PROFESSORS } from './professors'

const LENGTHS = [
  { n: 4, label: 'Quick', hint: 'about 5 min' },
  { n: 6, label: 'Standard', hint: 'about 8 min' },
  { n: 8, label: 'Full', hint: 'about 12 min' },
]

const LOADING_STEPS = [
  'Reading your slides…',
  'Finding the key topics…',
  'Writing the exam blueprint…',
  'The professors are taking their seats…',
]

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
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loading) return
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 3500)
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

  const start = async () => {
    if (!file) return
    setLoading(true)
    setStep(0)
    setError('')
    try {
      onReady(await createSession(file, examDate, length, language))
    } catch (e) {
      setError((e as Error).message)
      setLoading(false)
    }
  }

  const days = daysUntil(examDate)
  const today = new Date().toISOString().slice(0, 10)

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center" role="status" aria-live="polite">
        <div className="mb-8 flex -space-x-3">
          {PROFESSOR_IDS.map((id) => <Avatar key={id} id={id} size="lg" />)}
        </div>
        <p className="font-display text-2xl font-semibold">{LOADING_STEPS[step]}</p>
        <p className="mt-3 text-muted">This takes about 15 seconds. Take a breath. You've got this.</p>
        <div className="mt-6 h-1.5 w-56 overflow-hidden rounded-full bg-black/5">
          <div className="h-full rounded-full bg-theorist transition-all duration-1000" style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }} />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:pt-16">
      <header className="mb-10 text-center">
        <h1 className="font-display text-5xl font-bold tracking-tight sm:text-6xl">Viva</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Rehearse your oral exam out loud with a panel of three professors, built from <em>your own</em> lecture slides.
        </p>
      </header>

      <section aria-label="Meet the panel" className="mb-10 grid gap-3 sm:grid-cols-3">
        {PROFESSOR_IDS.map((id) => (
          <div key={id} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <Avatar id={id} />
            <div>
              <p className={`font-semibold ${PROFESSORS[id].text}`}>{PROFESSORS[id].name}</p>
              <p className="text-sm text-muted">{PROFESSORS[id].tagline}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="space-y-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        {/* 1. Slides */}
        <div>
          <h2 className="mb-2 font-semibold"><span className="text-muted">1.</span> Your lecture slides</h2>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
            className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
              dragging ? 'border-theorist bg-theorist-soft' : file ? 'border-practitioner bg-practitioner-soft' : 'border-black/15 hover:border-theorist hover:bg-theorist-soft/50'
            }`}
          >
            {file ? (
              <>
                <span className="font-semibold text-practitioner">✓ {file.name}</span>
                <span className="mt-1 text-sm text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB · click to choose a different file</span>
              </>
            ) : (
              <>
                <span className="font-semibold">Drop your PDF here, or click to browse</span>
                <span className="mt-1 text-sm text-muted">The professors only ask about what's in your slides</span>
              </>
            )}
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {/* 2. Date */}
          <div>
            <label htmlFor="exam-date" className="mb-2 block font-semibold"><span className="text-muted">2.</span> When is your real exam?</label>
            <input
              id="exam-date"
              type="date"
              min={today}
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded-xl border border-black/15 px-3 py-2.5"
            />
            <p className="mt-1.5 text-sm text-muted">
              {days === null ? 'Optional: we use it to plan your revision.' : days <= 0 ? "That's today. Good luck!" : `${days} day${days === 1 ? '' : 's'} to go, plenty of time to prepare.`}
            </p>
          </div>

          {/* 3. Language */}
          <fieldset>
            <legend className="mb-2 font-semibold"><span className="text-muted">3.</span> Exam language</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['en', 'de'] as Language[]).map((l) => (
                <label key={l} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center font-medium transition ${language === l ? 'border-theorist bg-theorist-soft text-theorist' : 'border-black/15 hover:bg-black/[0.02]'}`}>
                  <input type="radio" name="lang" value={l} checked={language === l} onChange={() => setLanguage(l)} className="sr-only" />
                  {l === 'en' ? 'English' : 'Deutsch'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {/* 4. Length */}
        <fieldset>
          <legend className="mb-2 font-semibold"><span className="text-muted">4.</span> How long?</legend>
          <div className="grid grid-cols-3 gap-2">
            {LENGTHS.map((o) => (
              <label key={o.n} className={`cursor-pointer rounded-xl border px-3 py-3 text-center transition ${length === o.n ? 'border-theorist bg-theorist-soft' : 'border-black/15 hover:bg-black/[0.02]'}`}>
                <input type="radio" name="length" value={o.n} checked={length === o.n} onChange={() => setLength(o.n)} className="sr-only" />
                <span className={`block font-semibold ${length === o.n ? 'text-theorist' : ''}`}>{o.label}</span>
                <span className="block text-sm text-muted">{o.n} questions · {o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* 5. Mic */}
        <MicCheck />

        {error && <p role="alert" className="rounded-xl bg-skeptic-soft px-4 py-3 text-skeptic">{error}</p>}

        <button
          type="button"
          disabled={!file}
          onClick={start}
          className="w-full rounded-2xl bg-ink px-6 py-4 text-lg font-semibold text-white shadow-sm transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-30"
        >
          {file ? 'Start my exam' : 'Add your slides to begin'}
        </button>
        <p className="text-center text-sm text-muted">It's practice. Mistakes here are how you get better.</p>
      </div>
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
      <h2 className="mb-2 font-semibold"><span className="text-muted">5.</span> Mic check <span className="font-normal text-muted">(optional, you can also type)</span></h2>
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
