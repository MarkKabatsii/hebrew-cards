// Explicit test/development repository. Never imported by the production entrypoint.
import { createSession, reconcile, transition } from '../domain/transitions'
import { validMaterial } from '../domain/answers'
import type { Ack, Command, Dashboard, Material, Session, Example } from '../domain/model'
import type { Repository } from './repository'
export interface TestWord extends Material { owner: string; created_at: string | null }
interface Practice { owner: string; id: string; at: number; any_error: boolean }
export class MemoryRepository implements Repository {
  sessions: Session[] = []
  receipts = new Map<string, { fingerprint: string; session_id: string | null }>()
  practiced: Practice[] = []
  exampleRows: Example[] = []
  now = Date.parse('2026-10-10T00:00:00Z')
  reviewInterval = 24 * 60 * 60 * 1000
  failAfterCommit = false
  constructor(public words: TestWord[]) {}
  async load(owner: string): Promise<Dashboard> {
    const available = new Set(this.words.filter(w => w.owner === owner).map(w => w.word_id))
    this.sessions = this.sessions.map(state => {
      if (state.owner !== owner || state.status !== 'active') return state
      const next = reconcile(state, available)
      if (JSON.stringify(next) !== JSON.stringify(state)) next.revision++
      return next
    })
    const own = this.words.filter(w => w.owner === owner)
    const completed = this.practiced.filter(w => w.owner === owner && available.has(w.id))
    return structuredClone({ sessions: this.sessions.filter(s => s.owner === owner), metrics: {
      eligible: own.filter(validMaterial).length, completed: completed.filter(p=>own.some(w=>w.word_id===p.id && validMaterial(w))).length, problematic: own.filter(w=>!validMaterial(w)).length,
      review_due: completed.filter(w => this.now - w.at >= this.reviewInterval && own.some(x=>x.word_id===w.id && validMaterial(x))).length,
    } })
  }
  async execute(owner: string, command: Command): Promise<Ack> {
    if (!owner) throw Error('AUTH_REQUIRED')
    const key = owner + ':' + command.operation_id
    const fingerprint = JSON.stringify(command)
    // Receipt before revision, latest dashboard on replay.
    const receipt = this.receipts.get(key)
    if (receipt) {
      if (receipt.fingerprint !== fingerprint) throw Error('OPERATION_REUSED')
      return { dashboard: await this.load(owner), outcome: 'replay' }
    }
    await this.load(owner)
    if (command.action === 'start') {
      const kind = command.payload.kind!, mode = command.payload.mode!
      if (!['level', 'review'].includes(kind) || !['normal', 'intensive'].includes(mode)) throw Error('INVALID_COMMAND')
      let session = this.sessions.find(s => s.owner === owner && s.kind === kind && s.status === 'active')
      if (!session) {
        let candidates = this.words.filter(w => w.owner === owner && validMaterial(w))
        const practiced = this.practiced.filter(w => w.owner === owner)
        if (kind === 'level') {
          candidates = candidates.filter(w => !practiced.some(p => p.id === w.word_id)).sort((a,b) =>
            (a.created_at === null ? 1 : b.created_at === null ? -1 : a.created_at.localeCompare(b.created_at)) || (BigInt(a.word_id) < BigInt(b.word_id) ? -1 : 1))
        } else {
          candidates = candidates.filter(w => practiced.some(p => p.id === w.word_id && this.now-p.at >= this.reviewInterval)).sort((a,b) => {
            const pa=practiced.find(p=>p.id===a.word_id)!, pb=practiced.find(p=>p.id===b.word_id)!
            return pa.at-pb.at || Number(pb.any_error)-Number(pa.any_error) || (BigInt(a.word_id)<BigInt(b.word_id)?-1:1)
          })
        }
        const number = kind === 'level' ? 1 + Math.max(0,...this.sessions.filter(s=>s.owner===owner).map(s=>s.level_number??0)) : null
        const fresh = createSession('session-'+(this.sessions.length+1), owner, candidates, mode, kind, 42, number)
        if (fresh) { this.sessions.push(fresh); session = fresh }
      }
      this.receipts.set(key, { fingerprint, session_id: session?.id ?? null })
    } else {
      const index = this.sessions.findIndex(s=>s.id===command.session_id && s.owner===owner)
      if (index<0) throw Error('PERMISSION_DENIED')
      const state = this.sessions[index]!
      if (state.revision !== command.expected_revision) return { dashboard: await this.load(owner), outcome: 'conflict' }
      const next = transition(state,command)
      this.sessions[index]=next
      if (next.kind==='review' && state.phase==='uk_to_he' && command.action==='next') {
        const word=state.words.find(w=>w.snapshot.word_id===state.queue[state.position])!
        if(word.uk_to_he>=1 || word.attempts_uk>=2) {
          const practice=this.practiced.find(w=>w.owner===owner && w.id===word.snapshot.word_id)
          if(practice) {practice.at=this.now;practice.any_error=word.any_error}
        }
      }
      if (next.status==='completed' && next.kind==='level') {
        for(const word of next.words) {
          const id=word.snapshot.word_id
          const existing=this.practiced.find(w=>w.owner===owner && w.id===id)
          if (existing) { existing.at=this.now; existing.any_error=word.any_error }
          else if (next.kind==='level') this.practiced.push({owner,id,at:this.now,any_error:word.any_error})
        }
      }
      this.receipts.set(key,{fingerprint,session_id:next.id})
    }
    const dashboard=await this.load(owner)
    if (this.failAfterCommit) { this.failAfterCommit=false; throw Error('NETWORK') }
    return {dashboard,outcome:'ok'}
  }
  async examples(owner: string, ids: string[]): Promise<Example[]> {
    return structuredClone(this.exampleRows.filter(row => ids.includes(row.word_id) && this.words.some(w => w.owner===owner && w.word_id===row.word_id)))
  }
}
