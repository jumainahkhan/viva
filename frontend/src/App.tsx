import { useEffect, useState } from 'react'
import { getReport, type ReportResponse, type SessionResponse } from './api'
import Exam from './Exam'
import Report from './Report'
import Setup from './Setup'
import { Button, TopBar } from './professors'

type Screen =
  | { name: 'setup' }
  | { name: 'exam'; session: SessionResponse }
  | { name: 'deliberating'; session: SessionResponse; error?: string }
  | { name: 'report'; data: ReportResponse }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'setup' })

  // ?report=<session id> reopens a finished exam's record (while the server still holds the session).
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
      {screen.name === 'deliberating' && (
        <>
          <TopBar />
          <div className="mx-auto max-w-xl px-4 py-24" role="status" aria-live="polite">
            {screen.error ? (
              <>
                <p className="font-serif text-3xl">The panel could not finish grading</p>
                <p className="mt-2 text-muted">{screen.error}</p>
                <Button className="mt-6" onClick={() => finish(screen.session)}>Try again</Button>
              </>
            ) : (
              <>
                <p className="font-serif text-3xl">The panel is deliberating</p>
                <p className="mt-2 text-muted">Grading, reviewing each answer and writing your revision plan. About 10 seconds.</p>
              </>
            )}
          </div>
        </>
      )}
      {screen.name === 'report' && (
        <Report data={screen.data} onRestart={() => { window.history.replaceState(null, '', '/'); setScreen({ name: 'setup' }) }} />
      )}
    </main>
  )
}
