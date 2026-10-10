import type { SupabaseClient } from '@supabase/supabase-js'
import type { Command } from '../domain/model'
import type { Repository } from './repository'
import { parseAck, parseDashboard, parseExamples } from './validation'
export type ErrorKind = 'missing_migration'|'permission'|'auth'|'network'|'conflict'|'invalid_data'|'unknown'
export class RepositoryError extends Error {
  constructor(public kind: ErrorKind, public code: string) { super(kind) }
}
export function classifyError(error: unknown): RepositoryError {
  if(error instanceof RepositoryError) return error
  const e=error && typeof error==='object' ? error as Record<string,unknown> : {}
  const code=typeof e.code==='string' && e.code ? e.code : e.message==='INVALID_DATA'?'INVALID_DATA':'NETWORK'
  const message=typeof e.message==='string' ? e.message : ''
  let kind: ErrorKind='unknown'
  if(message==='INVALID_DATA') kind='invalid_data'
  else if(['PGRST202','42P01','42883'].includes(code)) kind='missing_migration'
  else if(code==='42501') kind='permission'
  else if(['28000','PGRST301','PGRST302'].includes(code)) kind='auth'
  else if(code==='NETWORK' || code==='PGRST000' || /fetch|network|timeout/i.test(message)) kind='network'
  else if(code==='22023' || message==='INVALID_DATA') kind='invalid_data'
  return new RepositoryError(kind,code.replace(/[^A-Z0-9_]/g,'').slice(0,30))
}
export class SupabaseRepository implements Repository {
  constructor(private client: SupabaseClient) {}
  private async rpc(name: string, args: Record<string,unknown> = {}): Promise<unknown> {
    const abort=new AbortController()
    const timer=setTimeout(()=>abort.abort(),15000)
    try {
      const {data,error}=await this.client.rpc(name,args).abortSignal(abort.signal)
      if(error) throw classifyError(error)
      return data
    } catch(error) { throw classifyError(error) }
    finally { clearTimeout(timer) }
  }
  async load(owner: string) {
    return parseDashboard(await this.rpc('lp_dashboard'),owner)
  }
  async execute(owner: string, command: Command) {
    const session=await this.client.auth.getSession()
    if(session.error) throw classifyError(session.error)
    if(session.data.session?.user.id!==owner) throw new RepositoryError('auth','28000')
    return parseAck(await this.rpc('lp_command',{p_command:command}),owner)
  }
  async examples(_owner: string, ids: string[]) {
    if(!ids.length) return []
    return parseExamples(await this.rpc('lp_examples',{p_ids:ids}),ids)
  }
}
