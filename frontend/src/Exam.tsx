import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { sendAnswer, type Assessment, type ProfessorId, type SessionResponse, type Turn } from './api'
import { WavRecorder } from './recorder'
import { BLUFF_THRESHOLD, Button, Marker, PROFESSOR_IDS, PROFESSORS, ProfName, TopBar } from './professors'

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
  const [tab, setTab] = useState<'log' | 'transcript'>('log')
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [needsTap, setNeedsTap] = useState(false)
  const [level, setLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)

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

  useEffect(() => {
    if (phase !== 'recording') return
    setElapsed(0)
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [phase])

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
      setError('Microphone access is blocked. Allow it in the browser, or type your answer.')
      setTyping(true)
      setPhase('listening')
    }
  }, [turn.end_exam])

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== 'recording' || !recorder.current) return
    const { wav, seconds } = recorder.current.stop()
    setLevel(0)
    if (seconds < 0.7) {
      setHint('Hold the button or Space for the whole answer, then release.')
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

  const answered = history.length
  const lastScores = Object.fromEntries((history.at(-1)?.assessments ?? []).map((a) => [a.professor, a])) as Record<ProfessorId, Assessment | undefined>
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`

  return (
    <>
      <TopBar
        right={
          <div className="flex items-center gap-3 text-sm">
            <span className="tabular-nums">{turn.end_exam ? 'All questions answered' : `Question ${turn.question_number} of ${turn.total_questions}`}</span>
            <div className="flex" aria-hidden>
              {Array.from({ length: turn.total_questions }, (_, i) => (
                <span key={i} className={`-ml-px h-3 w-5 border border-ink first:ml-0 ${i < answered ? 'bg-ink' : ''}`} />
              ))}
            </div>
          </div>
        }
      />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        {/* ---------- Main column ---------- */}
        <div className="min-w-0">
          <p className="text-sm text-muted">{session.blueprint.course_title}</p>
          <p className="mt-0.5 font-semibold">Topic: {turn.topic_title}</p>

          <section aria-label="Examining panel" className="mt-5 grid grid-cols-3">
            {PROFESSOR_IDS.map((id, i) => {
              const p = PROFESSORS[id]
              const active = id === turn.speaker && phase !== 'conferring'
              const score = lastScores[id]
              return (
                <div key={id} className={`border px-3 py-3 sm:px-4 ${i > 0 ? '-ml-px' : ''} ${active ? `${p.bg} ${p.border} relative text-white` : 'border-ink'}`}>
                  <p className="condensed flex items-center gap-1.5 text-lg font-bold sm:text-xl">
                    {!active && <Marker id={id} />}
                    {p.name}
                  </p>
                  <p className={`mt-0.5 text-xs sm:text-sm ${active ? 'text-white/80' : 'text-muted'}`}>
                    {p.manner} · {session.panel.strictness[id]}
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {phase === 'conferring'
                      ? 'Assessing…'
                      : active
                        ? phase === 'speaking' ? 'Speaking' : 'Waiting for your answer'
                        : score
                          ? <span className="tabular-nums">Last score {score.score_0_to_10}/10</span>
                          : ' '}
                  </p>
                </div>
              )
            })}
          </section>

          <section aria-live="polite" className="mt-6 border border-ink p-5 sm:p-7">
            {phase === 'conferring' ? (
              <p className="text-lg text-muted">The panel is assessing your answer.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ProfName id={turn.speaker} className={PROFESSORS[turn.speaker].text} />
                  <Button variant="link" className="text-sm" onClick={play}>Replay question</Button>
                </div>
                <p className="mt-3 font-serif text-2xl leading-snug sm:text-[1.75rem]">{turn.question}</p>
                {needsTap && <Button variant="secondary" className="mt-4" onClick={play}>Play question audio</Button>}
              </>
            )}
          </section>

          <section className="mt-6" aria-label="Answer">
            {turn.end_exam ? (
              <Button className="w-full py-4 text-lg" onClick={onFinish}>View results</Button>
            ) : typing ? (
              <form onSubmit={(e) => { e.preventDefault(); if (typed.trim()) submit({ text: typed }) }}>
                <label htmlFor="typed" className="mb-1.5 block font-semibold">Your answer</label>
                <textarea
                  id="typed"
                  autoFocus
                  rows={4}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (typed.trim()) submit({ text: typed })
                    }
                  }}
                  placeholder="Write the answer as you would say it. Enter submits; Shift+Enter adds a line."
                  className="w-full border border-ink p-4 text-lg"
                  disabled={phase === 'conferring'}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <Button variant="link" onClick={() => setTyping(false)}>Answer by voice</Button>
                  <Button type="submit" disabled={!typed.trim() || phase === 'conferring'}>Submit answer</Button>
                </div>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={phase === 'recording' ? 'Recording. Release to submit your answer' : 'Hold to record your answer'}
                  disabled={phase === 'conferring'}
                  onPointerDown={(e) => { e.preventDefault(); startRecording() }}
                  onPointerUp={stopRecording}
                  onPointerLeave={stopRecording}
                  onContextMenu={(e) => e.preventDefault()}
                  className={`flex w-full touch-none select-none items-center justify-between gap-4 border px-5 py-4 text-left text-lg font-semibold disabled:opacity-30 ${
                    phase === 'recording' ? 'border-skeptic bg-skeptic text-white' : 'border-ink bg-ink text-white hover:bg-black'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <MicIcon />
                    {phase === 'recording' ? <span className="tabular-nums">Recording {clock}</span> : 'Hold to answer'}
                  </span>
                  {phase === 'recording' ? (
                    <span className="h-2 w-24 border border-white/60" aria-hidden><span className="block h-full bg-white" style={{ width: `${level * 100}%` }} /></span>
                  ) : (
                    <kbd className="border border-white/50 px-2 py-0.5 font-sans text-sm font-medium">Space</kbd>
                  )}
                </button>
                <p className="mt-2 text-sm text-muted" aria-live="polite">
                  {phase === 'recording' && 'Release to submit.'}
                  {phase === 'speaking' && 'The examiner is speaking.'}
                  {phase === 'listening' && 'Hold Space or the button while you answer; release to submit.'}
                  {phase === 'conferring' && 'Answer submitted.'}
                </p>
                {hint && <p className="mt-1 text-sm text-skeptic">{hint}</p>}
              </>
            )}

            {error && <p role="alert" className="mt-4 border border-skeptic px-4 py-3 text-skeptic">{error}</p>}

            {!turn.end_exam && (
              <div className="mt-4 flex flex-wrap gap-5">
                {!typing && <Button variant="link" onClick={() => setTyping(true)} disabled={phase === 'conferring'}>Type answer</Button>}
                <Button variant="link" onClick={() => submit({ skip: true })} disabled={phase === 'conferring'}>Skip question</Button>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Sidebar ---------- */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="flex max-h-[calc(100vh-3rem)] flex-col border border-ink">
            <div className="flex border-b border-ink" role="tablist">
              {(['log', 'transcript'] as const).map((t, i) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2.5 text-sm font-semibold ${i > 0 ? 'border-l border-ink' : ''} ${tab === t ? 'bg-ink text-white' : 'hover:bg-black/[0.04]'}`}
                >
                  {t === 'log' ? 'Panel log' : `Transcript (${answered})`}
                </button>
              ))}
            </div>
            <div className="overflow-y-auto p-4">
              {tab === 'log' ? <PanelLog history={history} phase={phase} pendingSpoken={pendingSpoken} panel={session.panel} /> : <Transcript history={history} current={turn} />}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}

function PanelLog({ history, phase, pendingSpoken, panel }: { history: Exchange[]; phase: Phase; pendingSpoken: boolean; panel: SessionResponse['panel'] }) {
  const threshold = BLUFF_THRESHOLD[panel.strictness.skeptic]
  return (
    <div className="space-y-6 text-sm">
      {phase === 'conferring' && (
        <div>
          <p className="border-b border-ink pb-1 font-semibold">In progress</p>
          <ul className="mt-1">
            {pendingSpoken && <li className="border-b border-rule py-1.5">Gradium speech-to-text: transcribing</li>}
            {PROFESSOR_IDS.map((id) => <li key={id} className="border-b border-rule py-1.5"><ProfName id={id} />: assessing</li>)}
            <li className="py-1.5">Chair agent: waiting for three assessments</li>
          </ul>
        </div>
      )}
      {[...history].reverse().map((ex, i) => {
        const n = history.length - i
        const maxBluff = Math.max(...ex.assessments.map((a) => a.bluff_signal))
        return (
          <div key={n}>
            <p className="border-b border-ink pb-1 font-semibold">Answer {n}</p>
            <table className="w-full text-left tabular-nums">
              <thead className="text-muted">
                <tr className="border-b border-rule">
                  <th className="py-1.5 pr-2 font-medium">Examiner</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Score</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Bluff</th>
                  <th className="py-1.5 text-right font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {ex.assessments.map((a) => (
                  <tr key={a.professor} className="border-b border-rule">
                    <td className="py-1.5 pr-2"><ProfName id={a.professor} className="font-medium" /></td>
                    <td className="py-1.5 pr-2 text-right">{a.score_0_to_10}/10</td>
                    <td className={`py-1.5 pr-2 text-right ${a.bluff_signal > threshold ? 'font-semibold text-skeptic' : ''}`}>{a.bluff_signal.toFixed(2)}</td>
                    <td className="py-1.5 text-right">{a.urgency.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="mt-2 space-y-1.5">
              {ex.assessments.filter((a) => a.gaps[0]).map((a) => (
                <div key={a.professor}>
                  <dt className="inline font-medium">{PROFESSORS[a.professor].name}, gap: </dt>
                  <dd className="inline text-muted">{a.gaps[0]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 border-t border-rule pt-2">
              <span className="font-medium">Chair: {PROFESSORS[ex.nextSpeaker].name} asks next.</span> <span className="text-muted">{ex.nextReasoning}</span>
            </p>
            {maxBluff > threshold && (
              <p className="mt-1 text-skeptic">Bluff {maxBluff.toFixed(2)} &gt; threshold {threshold.toFixed(2)}: Prof. Skeptic may ask next.</p>
            )}
            <p className="mt-1 text-xs text-muted tabular-nums">
              {ex.timings.stt_s ? `Speech-to-text ${ex.timings.stt_s}s · ` : ''}examiners {ex.timings.professors_s}s · chair {ex.timings.chair_s}s
            </p>
          </div>
        )
      })}
      {history.length === 0 && phase !== 'conferring' && <p className="text-muted">Each examiner's score and reasoning appears here after your first answer.</p>}
    </div>
  )
}

function Transcript({ history, current }: { history: Exchange[]; current: Turn }) {
  return (
    <div className="space-y-3 text-sm">
      {history.map((ex, i) => (
        <div key={i} className="space-y-2 border-b border-rule pb-3">
          <Line who={<ProfName id={ex.turn.speaker} />} text={ex.turn.question} />
          <Line who={<span className="font-semibold">You{ex.spoken ? ' (transcribed)' : ''}</span>} text={ex.answer} />
        </div>
      ))}
      <Line who={<ProfName id={current.speaker} />} text={current.question} />
    </div>
  )
}

function Line({ who, text }: { who: ReactNode; text: string }) {
  return (
    <p className="pl-4 -indent-4">
      {who}: {text}
    </p>
  )
}

function MicIcon() {
  return (
    <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
      <rect x="9" y="2" width="6" height="12" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" />
    </svg>
  )
}
