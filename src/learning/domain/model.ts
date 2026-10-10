export type Phase = 'introduction' | 'he_to_uk' | 'uk_to_he'
export type Direction = Exclude<Phase, 'introduction'>
export type Mode = 'normal' | 'intensive'
export type Kind = 'level' | 'review'
export type Result = 'correct' | 'incorrect' | 'revealed'
export interface Thresholds { introduction: number; he_to_uk: number; uk_to_he: number }
export const DEFAULTS: Readonly<Record<Mode, Readonly<Thresholds>>> = Object.freeze({
  normal: Object.freeze({ introduction: 5, he_to_uk: 3, uk_to_he: 3 }),
  intensive: Object.freeze({ introduction: 10, he_to_uk: 10, uk_to_he: 10 }),
})
export interface Material {
  word_id: string; he: string; ua: string; tr: string
  answers_he: string[]; answers_uk: string[]; normalization_version: 1
}
export interface SessionWord {
  snapshot: Material
  introduction: number; he_to_uk: number; uk_to_he: number
  attempts_he: number; attempts_uk: number; any_error: boolean
}
interface Base {
  id: string; owner: string; kind: Kind; level_number: number | null; mode: Mode
  schema_version: 1; rules_version: 1; thresholds: Thresholds
  revision: number; seed: number; cycle: number; serial: number
  phase: Phase; queue: string[]; position: number; words: SessionWord[]
}
export type Exercise = { state: 'question'; exercise_id: string }
  | { state: 'feedback'; exercise_id: string; result: Result }
export type Session = Base & (
  { status: 'active'; exercise: Exercise }
  | { status: 'completed' | 'cancelled_empty'; exercise: null }
)
export interface Command {
  operation_id: string; session_id: string | null; expected_revision: number
  exercise_id: string | null
  action: 'start' | 'intro_next' | 'answer' | 'next'
  payload: { kind?: Kind; mode?: Mode; result?: Result }
}
export interface Metrics { eligible: number; completed: number; problematic: number; review_due: number }
export interface Dashboard { sessions: Session[]; metrics: Metrics }
export interface Ack { dashboard: Dashboard; outcome: 'ok' | 'replay' | 'conflict' }
export interface Example { word_id: string; example_order: number; sentence_he: string; transcription_uk: string; translation_uk: string; status: 'approved' }
