import { useCallback, useEffect, useRef, useState } from 'react'
import { sendAnswer, type Assessment, type ProfessorId, type SessionResponse, type Turn } from './api'
import { WavRecorder } from './recorder'
import { AgentBadge, Avatar, PROFESSOR_IDS, PROFESSORS, SpeakingBars, ThinkingDots, TopBar } from './professors'

type Phase = 'speaking' | 'listening' | 'recording' | 'conferring'

interface Exchange {
  turn: Turn
  answer: string
  assessments: Assessment[]
  nextReasoning: string
  nextSpeaker: ProfessorId
  timings: Record<string, number>
  spoken: boolean
}

export default function Exam({ session, onFinish }: { session: SessionResponse; onFinish: () => void }) {
  const [turn, setTurn] = useState<Turn>(session.turn)
  const [phase, setPhase] = useState<Phase>('speaking')
  const [history, setHistory] = useState<Exchange[]>([])
  const [pendingSpoken, setPendingSpoken] = useState(false)
  const [tab, setTab] = useState<'transcript' | 'agents'>('agents')
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
      setPendingSpoken(!!answer.audio)
      setError('')
      setHint('')
      try {
        const res = await sendAnswer(session.session_id, answer)
        setHistory((h) => [
          ...h,
          {
            turn,
            answer: res.transcript,
            assessments: res.assessments,
            nextReasoning: res.turn.reasoning,
            nextSpeaker: res.turn.speaker,
            timings: res.timings,
            spoken: !!answer.audio,
          },
        ])
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
  const last = history.at(-1)
  const lastScores = Object.fromEntries((last?.assessments ?? []).map((a) => [a.professor, a])) as Record<ProfessorId, Assessment | undefined>

  return (
    <>
      <TopBar
        right={
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-muted sm:inline">
              {turn.end_exam ? 'All questions answered' : `Question ${turn.question_number} of ${turn.total_questions}`}
            </span>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-black/5 sm:w-40" role="progressbar" aria-label="Exam progress" aria-valuemin={0} aria-valuemax={turn.total_questions} aria-valuenow={answered}>
              <div className="h-full rounded-full bg-practitioner transition-all duration-700" style={{ width: `${Math.min(1, answered / turn.total_questions) * 100}%` }} />
            </div>
          </div>
        }
      />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        {/* ---------- Main column ---------- */}
        <div className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-muted">{session.blueprint.course_title}</p>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-medium shadow-sm ring-1 ring-black/5">Topic: {turn.topic_title}</span>
          </div>

          <section aria-label="Exam panel" className="grid grid-cols-3 gap-2 sm:gap-4">
            {PROFESSOR_IDS.map((id) => {
              const p = PROFESSORS[id]
              const active = id === turn.speaker && phase !== 'conferring'
              const score = lastScores[id]
              return (
                <div
                  key={id}
                  className={`flex flex-col items-center rounded-2xl bg-white p-3 text-center shadow-sm ring-1 transition-all duration-300 sm:p-5 ${
                    active ? `ring-2 ${p.ring} shadow-md` : 'ring-black/5'
                  } ${!active && phase !== 'conferring' ? 'opacity-70' : ''}`}
                >
                  <Avatar id={id} size="lg" />
                  <p className={`mt-2 text-sm font-semibold sm:text-base ${p.text}`}>{p.name}</p>
                  <AgentBadge className="mt-1 hidden sm:inline-flex" />
                  <p className="mt-1 hidden text-xs text-muted md:block">Tuned: {session.panel.strictness[id]}</p>
                  <div className={`mt-2 flex h-5 items-center gap-1.5 text-xs font-medium ${p.text}`}>
                    {phase === 'conferring' ? (
                      <><ThinkingDots /> <span className="hidden sm:inline">assessing</span></>
                    ) : active && phase === 'speaking' ? (
                      <><SpeakingBars /> <span className="hidden sm:inline">speaking</span></>
                    ) : active ? (
                      <span className="hidden sm:inline">waiting for you</span>
                    ) : score ? (
                      <span className="text-muted">scored {score.score_0_to_10}/10</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </section>

          <section aria-live="polite" className={`mt-6 rounded-3xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-7 ${phase === 'conferring' ? 'border-black/10' : speaker.border}`}>
            {phase === 'conferring' ? (
              <div className="flex items-center gap-3 text-lg text-muted">
                <ThinkingDots /> The panel is conferring. Three agents are assessing your answer in parallel…
              </div>
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className={`font-semibold ${speaker.text}`}>{speaker.name} asks</p>
                  <button type="button" onClick={play} className="rounded-lg px-2.5 py-1 text-sm font-medium text-muted hover:bg-black/5">↻ Replay</button>
                </div>
                <p className="font-display text-xl leading-snug sm:text-2xl">{turn.question}</p>
                {needsTap && (
                  <button type="button" onClick={play} className={`mt-3 rounded-xl ${speaker.soft} ${speaker.text} px-4 py-2 font-medium`}>▶ Tap to hear the question</button>
                )}
              </>
            )}
          </section>

          <section className="mt-8 flex flex-col items-center" aria-label="Answer controls">
            {turn.end_exam ? (
              <button type="button" onClick={onFinish} className="rounded-2xl bg-ink px-8 py-4 text-lg font-semibold text-white shadow-sm hover:bg-black">
                See my grade and analysis →
              </button>
            ) : typing ? (
              <form className="w-full max-w-2xl" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) submit({ text: typed }) }}>
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
                  <button type="button" onClick={() => setTyping(false)} className="rounded-xl px-3 py-2 text-sm font-medium text-muted hover:bg-black/5">🎙 Use my voice instead</button>
                  <button type="submit" disabled={!typed.trim() || phase === 'conferring'} className="rounded-xl bg-ink px-5 py-2 font-semibold text-white disabled:opacity-30">Send answer</button>
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
                  <button type="button" onClick={() => setTyping(true)} disabled={phase === 'conferring'} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40">⌨ Type instead</button>
                )}
                <button type="button" onClick={() => submit({ skip: true })} disabled={phase === 'conferring'} className="rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40">I'm not sure, next question</button>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Sidebar: transcript + agent activity ---------- */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="flex max-h-[calc(100vh-8rem)] flex-col rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="flex gap-1 border-b border-black/5 p-2" role="tablist">
              {(['agents', 'transcript'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${tab === t ? 'bg-ink text-white' : 'text-muted hover:bg-black/5'}`}
                >
                  {t === 'agents' ? 'Agent activity' : `Transcript (${answered})`}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto p-4">
              {tab === 'agents' ? (
                <AgentFeed history={history} phase={phase} pendingSpoken={pendingSpoken} panel={session.panel} />
              ) : (
                <Transcript history={history} current={turn} />
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

function AgentFeed({ history, phase, pendingSpoken, panel }: { history: Exchange[]; phase: Phase; pendingSpoken: boolean; panel: SessionResponse['panel'] }) {
  return (
    <div className="space-y-5 text-sm">
      {phase === 'conferring' && (
        <div className="rounded-2xl bg-paper p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Working now</p>
          <ul className="space-y-1.5">
            {pendingSpoken && <FeedLine pending label="Gradium STT" text="transcribing your answer" />}
            {PROFESSOR_IDS.map((id) => <FeedLine key={id} pending prof={id} label={`${PROFESSORS[id].name} agent`} text="assessing in parallel" />)}
            <FeedLine pending label="Chair agent" text="waiting for the three verdicts" />
          </ul>
        </div>
      )}
      {[...history].reverse().map((ex, i) => {
        const n = history.length - i
        const maxBluff = Math.max(...ex.assessments.map((a) => a.bluff_signal))
        return (
          <div key={n}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">After answer {n}</p>
            <ul className="space-y-2">
              {ex.spoken && <FeedLine label="Gradium STT" text={`transcribed your answer${ex.timings.stt_s ? ` in ${ex.timings.stt_s}s` : ''}`} />}
              {ex.assessments.map((a) => (
                <li key={a.professor} className="rounded-xl bg-paper p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Avatar id={a.professor} size="sm" />
                      <span className={`font-semibold ${PROFESSORS[a.professor].text}`}>{PROFESSORS[a.professor].name}</span>
                    </span>
                    <span className="font-semibold">{a.score_0_to_10}/10</span>
                  </div>
                  <Meter label="Bluff signal" value={a.bluff_signal} color={a.bluff_signal > 0.6 ? 'bg-skeptic' : 'bg-black/25'} />
                  <Meter label="Wants the floor" value={a.urgency} color="bg-theorist/60" />
                  {a.gaps[0] && <p className="mt-1.5 text-muted"><span className="font-medium text-ink">Gap: </span>{a.gaps[0]}</p>}
                  <p className="mt-1 text-xs text-muted">Would ask: “{a.proposed_followup}”</p>
                </li>
              ))}
              <li className="rounded-xl border border-dashed border-black/15 p-2.5">
                <p className="font-semibold">Chair agent → {PROFESSORS[ex.nextSpeaker].name}</p>
                <p className="mt-0.5 text-muted">{ex.nextReasoning}</p>
                {maxBluff > { gentle: 0.75, balanced: 0.6, tough: 0.45 }[panel.strictness.skeptic] && (
                  <p className="mt-1 text-xs font-semibold text-skeptic">Rule: bluff signal {maxBluff.toFixed(2)} → the Skeptic may take the floor</p>
                )}
                <p className="mt-1 text-xs text-muted">
                  Panel {ex.timings.professors_s}s · chair {ex.timings.chair_s}s · voice by Gradium TTS
                </p>
              </li>
            </ul>
          </div>
        )
      })}
      {history.length === 0 && phase !== 'conferring' && (
        <p className="text-muted">
          Answer the first question and you'll see each AI agent's verdict here: scores, bluff signal, the gaps they spotted, and why the chair
          picked the next professor.
        </p>
      )}
    </div>
  )
}

function Transcript({ history, current }: { history: Exchange[]; current: Turn }) {
  return (
    <div className="space-y-3 text-sm">
      {history.map((ex, i) => (
        <div key={i} className="space-y-2">
          <Bubble prof={ex.turn.speaker} text={ex.turn.question} />
          <p className="ml-8 rounded-2xl rounded-tr-sm bg-ink/90 px-3 py-2 text-white">
            <span className="mb-0.5 block text-xs text-white/60">You{ex.spoken ? ' (transcribed)' : ''}</span>
            {ex.answer}
          </p>
        </div>
      ))}
      <Bubble prof={current.speaker} text={current.question} />
    </div>
  )
}

function Bubble({ prof, text }: { prof: ProfessorId; text: string }) {
  const p = PROFESSORS[prof]
  return (
    <div className="flex gap-2">
      <Avatar id={prof} size="sm" />
      <p className={`rounded-2xl rounded-tl-sm px-3 py-2 ${p.soft}`}>
        <span className={`mb-0.5 block text-xs font-semibold ${p.text}`}>{p.name}</span>
        {text}
      </p>
    </div>
  )
}

function FeedLine({ label, text, pending = false, prof }: { label: string; text: string; pending?: boolean; prof?: ProfessorId }) {
  return (
    <li className="flex items-center gap-2">
      {prof ? <Avatar id={prof} size="sm" /> : <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-black/5 text-xs">{pending ? '…' : '✓'}</span>}
      <span><span className="font-semibold">{label}</span> <span className="text-muted">{text}</span></span>
      {pending && <span className="ml-auto text-muted"><ThinkingDots /></span>}
    </li>
  )
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-xs text-muted"><span>{label}</span><span>{value.toFixed(2)}</span></div>
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
