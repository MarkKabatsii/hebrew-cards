import type { Command, Dashboard, Example, Kind, Mode, Result, Session } from '../domain/model'
import type { Repository } from '../data/repository'
import { classifyError } from '../data/supabase'
export interface View {
  owner: string | null; dashboard: Dashboard | null; loading: boolean
  pending: Command | null; busy: boolean; error: string | null; notice: string | null
  examples: Example[]; examplesUnavailable: boolean
}
export function errorMessage(error: unknown): string {
  const e=classifyError(error)
  const text={ missing_migration:'Навчальний маршрут ще не налаштовано в базі даних.',permission:'Недостатньо прав для цього сеансу.',
    auth:'Сесія входу завершилась. Увійдіть знову.',network:'Не вдалося зберегти. Перевірте з’єднання й повторіть запит.',
    conflict:'Прогрес оновлено в іншій вкладці.',invalid_data:'Збережені дані мають непідтримувану версію або некоректний стан. Їх не скинуто.',
    unknown:'Не вдалося виконати запит.' }
  return `${text[e.kind]} Код: ${e.code}`
}
export class Controller {
  private epoch=0
  private ownerInitialized=false
  private listeners=new Set<()=>void>()
  private exampleKey=''
  private state: View={owner:null,dashboard:null,loading:true,pending:null,busy:false,error:null,notice:null,examples:[],examplesUnavailable:false}
  constructor(private repository: Repository, private operationId: ()=>string = ()=>crypto.randomUUID()) {}
  snapshot=(): View=>this.state
  subscribe=(listener: ()=>void): (()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener)}}
  private update(patch: Partial<View>) {this.state={...this.state,...patch};this.listeners.forEach(fn=>fn())}
  setOwner(owner: string | null) {
    if(this.ownerInitialized && owner===this.state.owner) return
    this.ownerInitialized=true
    this.epoch++;this.exampleKey=''
    this.update({owner,dashboard:null,pending:null,busy:false,error:null,notice:null,examples:[],loading:!!owner})
    if(owner) void this.reload()
  }
  dispose() {
    this.epoch++;this.ownerInitialized=false;this.exampleKey='';this.listeners.clear()
    this.state={owner:null,dashboard:null,loading:true,pending:null,busy:false,error:null,notice:null,examples:[],examplesUnavailable:false}
  }
  async reload() {
    const owner=this.state.owner, epoch=this.epoch
    if(!owner || this.state.busy || this.state.pending) return
    this.update({loading:true,error:null})
    try {
      const dashboard=await this.repository.load(owner)
      if(epoch!==this.epoch) return
      this.update({dashboard,loading:false})
      this.exampleKey=''; await this.refreshExamples(dashboard,epoch,owner)
    } catch(error) {if(epoch===this.epoch) this.update({loading:false,error:errorMessage(error)})}
  }
  private async refreshExamples(dashboard: Dashboard, epoch: number, owner: string) {
    const sessions=dashboard.sessions.filter(s=>s.status==='active')
    const ids=[...new Set(sessions.flatMap(s=>s.words.map(w=>w.snapshot.word_id)))]
    const key=sessions.map(s=>s.id).join(',')+':'+ids.join(',')
    if(key===this.exampleKey) return
    this.exampleKey=key
    this.update({examples:[],examplesUnavailable:false})
    try {
      // At most two sessions × five words; never a request per exercise.
      const examples=(await Promise.all([ids.slice(0,5),ids.slice(5)].filter(p=>p.length).map(p=>this.repository.examples(owner,p)))).flat()
      if(epoch===this.epoch && key===this.exampleKey) this.update({examples})
    } catch {if(epoch===this.epoch && key===this.exampleKey) this.update({examplesUnavailable:true})}
  }
  start(kind: Kind,mode: Mode) {return this.send({operation_id:this.operationId(),session_id:null,exercise_id:null,expected_revision:0,action:'start',payload:{kind,mode}})}
  act(session: Session, action: 'intro_next'|'answer'|'next', result?: Result) {
    return this.send({operation_id:this.operationId(),session_id:session.id,exercise_id:session.exercise?.exercise_id??null,
      expected_revision:session.revision,action,payload:result?{result}:{}})
  }
  retry() {if(this.state.pending && !this.state.busy) return this.perform(this.state.pending)}
  private send(command: Command) {
    if(this.state.busy || this.state.pending || !this.state.owner || this.state.loading) return
    this.update({pending:command});return this.perform(command)
  }
  private async perform(command: Command) {
    const owner=this.state.owner!,epoch=this.epoch
    this.update({busy:true,error:null,notice:null})
    try {
      const ack=await this.repository.execute(owner,command)
      if(epoch!==this.epoch) return
      this.update({dashboard:ack.dashboard,pending:null,busy:false,notice:ack.outcome==='conflict'?'Прогрес оновлено в іншій вкладці.':'Збережено.'})
      await this.refreshExamples(ack.dashboard,epoch,owner)
    } catch(error) {if(epoch===this.epoch) this.update({busy:false,error:errorMessage(error)})}
  }
}
