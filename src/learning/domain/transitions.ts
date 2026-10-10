import { DEFAULTS, type Command, type Material, type Mode, type Session, type SessionWord, type Phase } from './model'

function done(word: SessionWord, phase: Phase, session: Session): boolean {
  if (session.kind === 'level') return word[phase] >= session.thresholds[phase]
  const attempts = phase === 'he_to_uk' ? word.attempts_he : word.attempts_uk
  return word[phase] >= 1 || attempts >= 2
}
// SQL uses this same bounded arithmetic hash. No random call during rendering/recovery.
export function cycleQueue(session: Session, phase: Phase, previous?: string): string[] {
  const candidates = session.words.filter(w => !done(w, phase, session)).map(w => w.snapshot.word_id)
  if (phase !== 'introduction') {
    const key = (id: string) => {
      const first = (Number(BigInt(id) % 2147483647n) + session.seed + session.cycle * 69621) % 2147483647
      return (((first * 48271) % 2147483647) * 48271) % 2147483647
    }
    candidates.sort((a, b) => key(a) - key(b) || (BigInt(a) < BigInt(b) ? -1 : 1))
    if (candidates.length > 1 && candidates[0] === previous) candidates.push(candidates.shift()!)
  }
  return candidates
}
export function createSession(id: string, owner: string, materials: Material[], mode: Mode, kind: 'level' | 'review', seed: number, level_number: number | null): Session | null {
  if (!materials.length) return null
  const state: Session = {
    id, owner, kind, level_number, mode, schema_version: 1, rules_version: 1,
    thresholds: { ...DEFAULTS[mode] }, revision: 0, seed, cycle: 0, serial: 0,
    phase: kind === 'level' ? 'introduction' : 'he_to_uk', queue: [], position: 0,
    status: 'active', exercise: { state: 'question', exercise_id: `${id}:0` },
    words: materials.slice(0, 5).map(snapshot => ({ snapshot: structuredClone(snapshot), introduction: 0,
      he_to_uk: 0, uk_to_he: 0, attempts_he: 0, attempts_uk: 0, any_error: false })),
  }
  state.queue = cycleQueue(state, state.phase)
  return state
}
export function currentWord(session: Session): SessionWord | undefined {
  return session.words.find(word => word.snapshot.word_id === session.queue[session.position])
}
function advance(session: Session, previous?: string): Session {
  let phase = session.phase
  while (true) {
    while (session.position < session.queue.length) {
      const word = currentWord(session)
      if (word && !done(word, phase, session)) {
        session.serial++
        return { ...session, phase, status: 'active', exercise: { state: 'question', exercise_id: `${session.id}:${session.serial}` } }
      }
      session.position++
    }
    if (session.words.some(word => !done(word, phase, session))) {
      session.cycle++
      session.queue = cycleQueue(session, phase, previous)
      session.position = 0
      continue
    }
    if (phase === 'uk_to_he') return { ...session, status: 'completed', exercise: null }
    phase = phase === 'introduction' ? 'he_to_uk' : 'uk_to_he'
    session.phase = phase; session.cycle++
    session.queue = cycleQueue(session, phase, previous); session.position = 0
  }
}
export function reconcile(state: Session, availableIds: Set<string>): Session {
  const session = structuredClone(state)
  session.words = session.words.filter(word => availableIds.has(word.snapshot.word_id))
  if (!session.words.length) return { ...session, status: 'cancelled_empty', exercise: null, queue: [], position: 0 }
  if (session.status === 'active' && !currentWord(session)) {
    session.position++
    return advance(session)
  }
  return session
}
export function transition(state: Session, command: Command): Session {
  if (state.status !== 'active' || state.exercise.exercise_id !== command.exercise_id) throw Error('INVALID_EXERCISE')
  const session = structuredClone(state)
  if (session.status !== 'active') throw Error('INVALID_STATE')
  const word = currentWord(session)!
  if (command.action === 'intro_next') {
    if (session.phase !== 'introduction' || session.exercise.state !== 'question') throw Error('INVALID_ACTION')
    word.introduction++
    session.position++
    return { ...advance(session, word.snapshot.word_id), revision: state.revision + 1 }
  }
  if (command.action === 'answer') {
    if (session.phase === 'introduction' || session.exercise.state !== 'question' || !command.payload.result) throw Error('INVALID_ACTION')
    const result = command.payload.result
    if (result === 'correct') word[session.phase] = Math.min(word[session.phase] + 1, session.kind === 'review' ? 1 : session.thresholds[session.phase])
    else word.any_error = true
    if (session.kind === 'review') {
      if (session.phase === 'he_to_uk') word.attempts_he++
      else word.attempts_uk++
    }
    session.exercise = { ...session.exercise, state: 'feedback', result }
    session.revision++
    return session
  }
  if (command.action === 'next' && session.exercise.state === 'feedback') {
    session.position++
    return { ...advance(session, word.snapshot.word_id), revision: state.revision + 1 }
  }
  throw Error('INVALID_ACTION')
}
export function progress(session: Session): number {
  const denominator = session.words.length * Object.values(session.thresholds).reduce((a, b) => a + b, 0)
  return denominator ? session.words.reduce((sum, w) => sum + w.introduction + w.he_to_uk + w.uk_to_he, 0) / denominator : 0
}
