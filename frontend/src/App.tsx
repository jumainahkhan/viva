import { useEffect, useState } from 'react'
import { getReport, type ReportResponse, type SessionResponse } from './api'
import Exam from './Exam'
import Report from './Report'
import Setup from './Setup'
import { Avatar, PROFESSOR_IDS, ThinkingDots, TopBar } from './professors'

type Screen =
  | { name: 'setup' }
  | { name: 'exam'; session: SessionResponse }
  | { name: 'deliberating'; session: SessionResponse; error?: string }
  | { name: 'report'; data: ReportResponse }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'setup' })

  // ?report=<session id> reopens a finished exam's report (while the server still holds the session).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('report')
    if (id) getReport(id).then((data) => setScreen({ name: 'report', data })).catch(() => {})
  }, [])

  const finish = async (session: SessionResponse) => {
    setScreen({ name: 'deliberating', session })
    try {
      setScreen({ name: 'report', data: await getReport(session.session_id) })
      window.history.replaceState(null, '', `?report=${session.session_id}`)
    } catch (e) {
      setScreen({ name: 'deliberating', session, error: (e as Error).message })
    }
  }

  return (
    <main className="min-h-screen">
      {screen.name === 'setup' && <Setup onReady={(session) => setScreen({ name: 'exam', session })} />}
      {screen.name === 'exam' && <Exam session={screen.session} onFinish={() => finish(screen.session)} />}
      {screen.name === 'deliberating' && <TopBar />}
      {screen.name === 'deliberating' && (
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 text-center" role="status" aria-live="polite">
          <div className="mb-8 flex -space-x-3">
            {PROFESSOR_IDS.map((id) => <Avatar key={id} id={id} size="lg" />)}
          </div>
          {screen.error ? (
            <>
              <p className="font-display text-2xl font-semibold">The panel needs another moment</p>
              <p className="mt-3 text-muted">{screen.error}</p>
              <button type="button" onClick={() => finish(screen.session)} className="mt-6 rounded-2xl bg-ink px-6 py-3 font-semibold text-white">
                Try again
              </button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-3 font-display text-2xl font-semibold">The panel is deliberating <ThinkingDots /></p>
              <p className="mt-3 text-muted">The professor agents are debating your grade, reviewing every answer and building your revision plan.</p>
            </>
          )}
        </div>
      )}
      {screen.name === 'report' && <Report data={screen.data} onRestart={() => { window.history.replaceState(null, '', '/'); setScreen({ name: 'setup' }) }} />}
    </main>
  )
}
