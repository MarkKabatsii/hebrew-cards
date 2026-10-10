import type { SupabaseClient } from '@supabase/supabase-js'
export interface AuthAdapter {
  current(): Promise<string | null>
  subscribe(callback: (owner: string | null) => void): () => void
}
export function authAdapter(client: SupabaseClient): AuthAdapter {
  return {
    async current() {
      const { data, error } = await client.auth.getSession()
      if (error) throw error
      return data.session?.user.id ?? null
    },
    subscribe(callback) {
      const { data } = client.auth.onAuthStateChange((_event, session) => callback(session?.user.id ?? null))
      return () => data.subscription.unsubscribe()
    },
  }
}
declare global { interface Window { learningBridge: { client: SupabaseClient } } }
