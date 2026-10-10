export type ProfessorId = 'theorist' | 'practitioner' | 'skeptic'
export type Language = 'en' | 'de'

export interface Topic {
  id: string
  title: string
  key_concepts: string[]
  slide_refs: number[]
}

export interface Turn {
  speaker: ProfessorId
  question: string
  topic_id: string
  topic_title: string
  reasoning: string
  audio_url: string
  question_number: number
  total_questions: number
  end_exam: boolean
}

export interface Assessment {
  professor: ProfessorId
  score_0_to_10: number
  what_was_good: string
  gaps: string[]
  bluff_signal: number
  proposed_followup: string
  urgency: number
  move_to_new_topic: boolean
}

export interface SessionResponse {
  session_id: string
  language: Language
  blueprint: { course_title: string; topics: Topic[] }
  turn: Turn
}

export interface AnswerResponse {
  transcript: string
  assessments: Assessment[]
  turn: Turn
  timings: Record<string, number>
}

export interface ReportResponse {
  report: {
    deliberation: { professor: ProfessorId; text: string }[]
    grade: number
    strengths: string[]
    per_topic: { topic_id: string; score: number; feedback: string }[]
    weakest_topics: string[]
  }
  plan: {
    sessions: { date: string; duration_min: number; topic_ids: string[]; goal: string }[]
    flashcards: { front: string; back: string; topic_id: string }[]
  }
  ics_url: string
  course_title: string
  topics: Record<string, string>
  exam_date: string | null
}

async function request<T>(url: string, body?: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body })
  } catch {
    throw new Error("We can't reach the Viva server. Is the backend running?")
  }
  if (!res.ok) {
    let detail = 'Something went wrong. Please try again.'
    try {
      detail = (await res.json()).detail ?? detail
    } catch { /* keep default */ }
    throw new Error(detail)
  }
  return res.json()
}

export function createSession(pdf: File, examDate: string, numQuestions: number, language: Language) {
  const fd = new FormData()
  fd.append('pdf', pdf)
  if (examDate) fd.append('exam_date', examDate)
  fd.append('num_questions', String(numQuestions))
  fd.append('language', language)
  return request<SessionResponse>('/api/session', fd)
}

export function sendAnswer(sessionId: string, answer: { audio?: Blob; text?: string; skip?: boolean }) {
  const fd = new FormData()
  if (answer.audio) fd.append('audio', answer.audio, 'answer.wav')
  if (answer.text) fd.append('text', answer.text)
  if (answer.skip) fd.append('skip', 'true')
  return request<AnswerResponse>(`/api/session/${sessionId}/answer`, fd)
}

export function getReport(sessionId: string) {
  return request<ReportResponse>(`/api/session/${sessionId}/report`)
}
