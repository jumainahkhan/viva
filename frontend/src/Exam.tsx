import { useCallback, useEffect, useRef, useState } from 'react'
import { sendAnswer, type Assessment, type SessionResponse, type Turn } from './api'
import { WavRecorder } from './recorder'
import { Avatar, PROFESSOR_IDS, PROFESSORS, SpeakingBars, ThinkingDots } from './professors'

type Phase = 'speaking' | 'listening' | 'recording' | 'conferring'

interface Exchange {
  turn: Turn
  answer: string
}

export default function Exam({ session, onFinish }: { session: SessionResponse; onFinish: () => void }) {
  const [turn, setTurn] = useState<Turn>(session.turn)
  const [phase, setPhase] = useState<Phase>('speaking')
  const [history, setHistory] = useState<Exchange[]>([])
  const [notes, setNotes] = useState<{ assessments: Assessment[]; reasoning: string } | null>(null)
  const [showNotes, setShowNotes] = useState(true)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [needsTap, setNeedsTap] = useState(false)
  const [level, setLevel] = useState(0)

  const audio = useRef<HTMLAudioElement>(new Audio())
  const recorder = useRef<WavRecorder | null>(null)
  const phaseRef = useRef<Phase>(phase)
  phaseRef.current = phase

  // Play each new question in the speaker's voice.
  const play = useCallback(() => {
    const a = audio.current
    setNeedsTap(false)
    setPhase('speaking')
    a.src = turn.audio_url
    a.onended = () => setPhase('listening')
    a.onerror = () => setPhase('listening')
    a.play().catch(() => {
      setNeedsTap(true)
      setPhase('listening')
    })
  }, [turn])

  useEffect(() => {
    play()
  }, [play])

  useEffect(() => {
    const a = audio.current
    return () => {
      a.pause()
      recorder.current?.close()
    }
  }, [])

  const submit = useCallback(
    async (answer: { audio?: Blob; text?: string; skip?: boolean }) => {
      setPhase('conferring')
      setError('')
      setHint('')
      try {
        const res = await sendAnswer(session.session_id, answer)
        setHistory((h) => [...h, { turn, answer: res.transcript }])
        setNotes({ assessments: res.assessments, reasoning: res.turn.reasoning })
        setTyped('')
        setTyping(false)
        setTurn(res.turn)
      } catch (e) {
        setError((e as Error).message)
        setPhase('listening')
      }
    },
    [session.session_id, turn],
  )

  const startRecording = useCallback(async () => {
    if (phaseRef.current === 'conferring' || phaseRef.current === 'recording' || turn.end_exam) return
    audio.current.pause()
    setError('')
    setHint('')
    try {
      if (!recorder.current) {
        recorder.current = new WavRecorder()
        recorder.current.onLevel = setLevel
      }
      await recorder.current.start()
      setPhase('recording')
    } catch {
      setError('We could not access your microphone. Allow it in the browser, or type your answer instead.')
      setTyping(true)
      setPhase('listening')
    }
  }, [turn.end_exam])

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== 'recording' || !recorder.current) return
    const { wav, seconds } = recorder.current.stop()
    setLevel(0)
    if (seconds < 0.7) {
      setHint('Hold the button (or Space) the whole time you speak, then let go.')
      setPhase('listening')
      return
    }
    submit({ audio: wav })
  }, [submit])

  // Hold Space to talk (unless the student is typing).
  useEffect(() => {
    const isField = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest('textarea, input, button')
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isField(e)) return
      e.preventDefault()
      startRecording()
    }
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isField(e)) return
      e.preventDefault()
      stopRecording()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [startRecording, stopRecording])

  const speaker = PROFESSORS[turn.speaker]
  const answered = history.length
  const progress = Math.min(1, answered / turn.total_questions)
  const lastAnswer = history.at(-1)?.answer

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-10">
      {/* Header */}
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">{session.blueprint.course_title}</p>
          <span className="mt-1.5 inline-block rounded-full bg-white px-3 py-1 text-sm font-medium shadow-sm ring-1 ring-black/5">
            Topic: {turn.topic_title}
          </span>
        </div>
        <div className="sm:w-64">
          <p className="mb-1.5 text-sm font-medium sm:text-right">
            {turn.end_exam ? 'All questions answered' : `Question ${turn.question_number} of ${turn.total_questions}`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-black/5" role="progressbar" aria-valuemin={0} aria-valuemax={turn.total_questions} aria-valuenow={answered}>
            <div className="h-full rounded-full bg-practitioner transition-all duration-700" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </header>

      {/* Panel */}
      <section aria-label="Exam panel" className="grid grid-cols-3 gap-2 sm:gap-4">
        {PROFESSOR_IDS.map((id) => {
          const p = PROFESSORS[id]
          const active = id === turn.speaker && phase !== 'conferring'
          return (
            <div
              key={id}
              className={`flex flex-col items-center rounded-2xl bg-white p-3 text-center shadow-sm ring-1 transition-all duration-300 sm:p-5 ${
                active ? `ring-2 ${p.ring} scale-[1.03] shadow-md` : 'ring-black/5'
              } ${!active && phase !== 'conferring' ? 'opacity-60' : ''}`}
            >
              <Avatar id={id} size="lg" />
              <p className={`mt-2 text-sm font-semibold sm:text-base ${p.text}`}>{p.name}</p>
              <p className="hidden text-xs text-muted sm:block">{p.style}</p>
              <div className={`mt-2 h-5 text-xs font-medium ${p.text}`} aria-hidden>
                {phase === 'conferring' ? <ThinkingDots /> : active && phase === 'speaking' ? <SpeakingBars /> : null}
              </div>
            </div>
          )
        })}
      </section>

      {/* Caption */}
      <section aria-live="polite" className={`mt-6 rounded-3xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7 ${phase === 'conferring' ? 'border-black/10' : speaker.border}`}>
        {phase === 'conferring' ? (
          <div className="flex items-center gap-3 text-lg text-muted">
            <ThinkingDots /> The panel is conferring…
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className={`font-semibold ${speaker.text}`}>{speaker.name}</p>
              <button type="button" onClick={play} className="rounded-lg px-2.5 py-1 text-sm font-medium text-muted hover:bg-black/5">
                ↻ Replay
              </button>
            </div>
            <p className="font-display text-xl leading-snug sm:text-2xl">{turn.question}</p>
            {needsTap && (
              <button type="button" onClick={play} className={`mt-3 rounded-xl ${speaker.soft} ${speaker.text} px-4 py-2 font-medium`}>
                ▶ Tap to hear the question
              </button>
            )}
          </>
        )}
      </section>

      {lastAnswer && phase !== 'conferring' && (
        <div className="mt-3 flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink/90 px-4 py-2.5 text-sm text-white">
            <span className="mb-0.5 block text-xs text-white/60">Your last answer</span>
            {lastAnswer}
          </p>
        </div>
      )}

      {/* Controls */}
      <section className="mt-8 flex flex-col items-center" aria-label="Answer controls">
        {turn.end_exam ? (
          <button type="button" onClick={onFinish} className="rounded-2xl bg-ink px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-black">
            See my results →
          </button>
        ) : typing ? (
          <form
            className="w-full max-w-2xl"
            onSubmit={(e) => {
              e.preventDefault()
              if (typed.trim()) submit({ text: typed })
            }}
          >
            <label htmlFor="typed" className="sr-only">Your answer</label>
            <textarea
              id="typed"
              autoFocus
              rows={3}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (typed.trim()) submit({ text: typed })
                }
              }}
              placeholder="Type your answer as you would say it…"
              className="w-full rounded-2xl border border-black/15 bg-white p-4 text-lg shadow-sm"
              disabled={phase === 'conferring'}
            />
            <div className="mt-2 flex justify-between">
              <button type="button" onClick={() => setTyping(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-black/5">
                🎙 Use my voice instead
              </button>
              <button type="submit" disabled={!typed.trim() || phase === 'conferring'} className="rounded-xl bg-ink px-5 py-2 font-semibold text-white disabled:opacity-30">
                Send answer
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="relative">
              {phase === 'recording' && (
                <span aria-hidden className="mic-ripple absolute inset-0 rounded-full bg-skeptic" style={{ transform: `scale(${1 + level * 0.5})` }} />
              )}
              <button
                type="button"
                aria-label={phase === 'recording' ? 'Recording. Release to send your answer' : 'Hold to record your answer'}
                disabled={phase === 'conferring'}
                onPointerDown={(e) => { e.preventDefault(); startRecording() }}
                onPointerUp={stopRecording}
                onPointerLeave={stopRecording}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative grid h-24 w-24 touch-none select-none place-items-center rounded-full text-white shadow-lg transition ${
                  phase === 'recording' ? 'scale-110 bg-skeptic' : 'bg-ink hover:scale-105'
                } disabled:opacity-30`}
              >
                <MicIcon />
              </button>
            </div>
            <p className="mt-4 text-center font-medium" aria-live="polite">
              {phase === 'recording' && 'Listening… release when you are done'}
              {phase === 'speaking' && 'Listen to the question…'}
              {phase === 'listening' && 'Take a moment to think. Then hold Space (or the button) and answer.'}
              {phase === 'conferring' && 'Your answer is with the panel.'}
            </p>
            {hint && <p className="mt-1 text-sm text-skeptic">{hint}</p>}
          </>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-skeptic-soft px-4 py-3 text-skeptic">{error}</p>}

        {!turn.end_exam && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {!typing && (
              <button type="button" onClick={() => setTyping(true)} disabled={phase === 'conferring'} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40">
                ⌨ Type instead
              </button>
            )}
            <button type="button" onClick={() => submit({ skip: true })} disabled={phase === 'conferring'} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40">
              I'm not sure, next question
            </button>
          </div>
        )}
      </section>

      {/* Panel notes: the multi-agent reasoning behind each turn */}
      {notes && (
        <section className="mt-10">
          <button type="button" onClick={() => setShowNotes((s) => !s)} className="text-sm font-semibold text-muted hover:text-ink" aria-expanded={showNotes}>
            {showNotes ? '▾' : '▸'} Panel notes: how the professors judged your last answer
          </button>
          {showNotes && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {notes.assessments.map((a) => (
                <div key={a.professor} className="rounded-2xl bg-white p-4 text-sm shadow-sm ring-1 ring-black/5">
                  <div className="mb-2 flex items-center gap-2">
                    <Avatar id={a.professor} size="sm" />
                    <span className={`font-semibold ${PROFESSORS[a.professor].text}`}>{PROFESSORS[a.professor].name}</span>
                  </div>
                  <Meter label="Score" value={a.score_0_to_10 / 10} text={`${a.score_0_to_10}/10`} color="bg-practitioner" />
                  <Meter label="Bluff signal" value={a.bluff_signal} text={a.bluff_signal.toFixed(2)} color={a.bluff_signal > 0.6 ? 'bg-skeptic' : 'bg-black/30'} />
                  <p className="mt-2 text-muted"><span className="font-medium text-ink">Good: </span>{a.what_was_good}</p>
                  {a.gaps[0] && <p className="mt-1 text-muted"><span className="font-medium text-ink">Gap: </span>{a.gaps[0]}</p>}
                </div>
              ))}
              <p className="text-sm text-muted sm:col-span-3"><span className="font-semibold text-ink">Chair: </span>{notes.reasoning}</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Meter({ label, value, text, color }: { label: string; value: number; text: string; color: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-xs text-muted"><span>{label}</span><span>{text}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
    </div>
  )
}

function MicIcon() {
  return (
    <svg aria-hidden width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
    </svg>
  )
}
