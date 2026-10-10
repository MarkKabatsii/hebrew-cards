// Dev-only browser entry. Not included in Vite input or dist.
import {StrictMode} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import {App,ErrorBoundary} from '../src/learning/ui/App'
import {Controller} from '../src/learning/application/controller'
import {SupabaseRepository} from '../src/learning/data/supabase'
import {authAdapter} from '../src/learning/integration/auth'
let root:Root|null=null
const mount=()=>{
  const client=window.learningBridge.client
  root=createRoot(document.getElementById('learning-root')!)
  root.render(<StrictMode><ErrorBoundary><App controller={new Controller(new SupabaseRepository(client))} auth={authAdapter(client)}/></ErrorBoundary></StrictMode>)
}
Object.assign(window,{testMount:mount,testUnmount:()=>{root?.unmount();root=null}})
mount()
