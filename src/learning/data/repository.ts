import type { Ack, Command, Dashboard, Example } from '../domain/model'
export interface Repository {
  load(owner: string): Promise<Dashboard>
  execute(owner: string, command: Command): Promise<Ack>
  examples(owner: string, ids: string[]): Promise<Example[]>
}
