import { DEFAULTS, type Ack, type Dashboard, type Example, type Session } from '../domain/model'
import { currentWord } from '../domain/transitions'
export class DataError extends Error { constructor() { super('INVALID_DATA') } }
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new DataError()
  return value as Record<string,unknown>
}
function integer(value: unknown, max = 2147483647): value is number { return typeof value==='number' && Number.isSafeInteger(value) && value>=0 && value<=max }
function strings(value: unknown, limit: number, length = 2000): value is string[] {
  return Array.isArray(value) && value.length<=limit && value.every(v=>typeof v==='string' && v.length>0 && v.length<=length)
}
export function wordId(value: unknown): string {
  if(typeof value!=='string' || !/^-?(?:0|[1-9]\d{0,18})$/.test(value)) throw new DataError()
  const id=BigInt(value)
  if(id>9223372036854775807n || id< -9223372036854775808n || String(id)!==value) throw new DataError()
  return value
}
export function parseSession(value: unknown, owner: string): Session {
  const s=record(value)
  if(s.owner!==owner || typeof s.id!=='string' || !s.id || s.schema_version!==1 || s.rules_version!==1 ||
    !['level','review'].includes(String(s.kind)) || !['normal','intensive'].includes(String(s.mode)) ||
    !['active','completed','cancelled_empty'].includes(String(s.status)) ||
    !['introduction','he_to_uk','uk_to_he'].includes(String(s.phase)) ||
    !integer(s.revision) || !integer(s.seed) || !integer(s.cycle) || !integer(s.serial) || !integer(s.position) ||
    !Array.isArray(s.words) || s.words.length>5 || !Array.isArray(s.queue) || s.queue.length>5) throw new DataError()
  if(s.kind==='level' ? !integer(s.level_number) || s.level_number===0 : s.level_number!==null) throw new DataError()
  const thresholds=record(s.thresholds), defaults=DEFAULTS[s.mode as 'normal'|'intensive']
  for(const phase of ['introduction','he_to_uk','uk_to_he'] as const) if(thresholds[phase]!==defaults[phase]) throw new DataError()
  const ids=new Set<string>()
  for(const raw of s.words) {
    const w=record(raw), m=record(w.snapshot), id=wordId(m.word_id)
    if(ids.has(id) || m.normalization_version!==1 || !['he','ua','tr'].every(f=>typeof m[f]==='string' && (m[f] as string).length<=2000) ||
      !strings(m.answers_he,50,500) || !strings(m.answers_uk,50,500) || typeof w.any_error!=='boolean' ||
      !integer(w.attempts_he,2) || !integer(w.attempts_uk,2)) throw new DataError()
    ids.add(id)
    for(const p of ['introduction','he_to_uk','uk_to_he'] as const) if(!integer(w[p],defaults[p])) throw new DataError()
    if(s.kind==='review' && (Number(w.he_to_uk)>1 || Number(w.uk_to_he)>1 || w.introduction!==0)) throw new DataError()
  }
  s.queue.forEach(wordId)
  if(new Set(s.queue).size!==s.queue.length) throw new DataError()
  if(s.status==='cancelled_empty' && s.words.length) throw new DataError()
  if(s.status==='completed') {
    for(const raw of s.words) {
      const w=record(raw)
      if(s.kind==='level' ? ['introduction','he_to_uk','uk_to_he'].some(p=>w[p]!==thresholds[p])
        : !((Number(w.he_to_uk)>=1 || Number(w.attempts_he)>=2) && (Number(w.uk_to_he)>=1 || Number(w.attempts_uk)>=2))) throw new DataError()
    }
  }
  if(s.status==='active') {
    if(s.queue.some(id=>!ids.has(String(id)))) throw new DataError()
    const e=record(s.exercise)
    if(e.exercise_id!==`${s.id}:${s.serial}` || !['question','feedback'].includes(String(e.state)) ||
      (e.state==='feedback' && (s.phase==='introduction' || !['correct','incorrect','revealed'].includes(String(e.result)))) ||
      (e.state==='question' && e.result!==undefined) || !currentWord(s as unknown as Session)) throw new DataError()
  } else if(s.exercise!==null) throw new DataError()
  return structuredClone(s) as unknown as Session
}
export function parseDashboard(value: unknown, owner: string): Dashboard {
  const d=record(value), m=record(d.metrics)
  if(!Array.isArray(d.sessions) || !['eligible','completed','problematic','review_due'].every(k=>integer(m[k])) ||
    Number(m.completed)>Number(m.eligible) || Number(m.review_due)>Number(m.completed)) throw new DataError()
  const sessions=d.sessions.map(s=>parseSession(s,owner))
  for(const kind of ['level','review']) if(sessions.filter(s=>s.kind===kind && s.status==='active').length>1) throw new DataError()
  return {sessions,metrics:m as unknown as Dashboard['metrics']}
}
export function parseAck(value: unknown, owner: string): Ack {
  const a=record(value)
  if(!['ok','replay','conflict'].includes(String(a.outcome))) throw new DataError()
  return {dashboard:parseDashboard(a.dashboard,owner),outcome:a.outcome as Ack['outcome']}
}
export function parseExamples(value: unknown, ids: string[]): Example[] {
  if(!Array.isArray(value)) throw new DataError()
  const seen=new Set<string>()
  return value.flatMap(raw=>{
    const e=record(raw), id=wordId(e.word_id), key=id+':'+e.example_order
    if(!ids.includes(id) || e.status!=='approved' || ![1,2].includes(Number(e.example_order)) || typeof e.example_order!=='number' ||
      !['sentence_he','transcription_uk','translation_uk'].every(f=>typeof e[f]==='string' && (e[f] as string).trim()) || seen.has(key)) return []
    seen.add(key); return [e as unknown as Example]
  }).sort((a,b)=>a.example_order-b.example_order)
}
