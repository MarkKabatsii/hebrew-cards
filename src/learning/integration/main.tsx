import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { authAdapter } from './auth'
import { SupabaseRepository } from '../data/supabase'
import { Controller } from '../application/controller'
import { App, ErrorBoundary } from '../ui/App'
const host=document.getElementById('learning-root')!
const client=window.learningBridge.client
const auth=authAdapter(client)
const controller=new Controller(new SupabaseRepository(client))
const root=createRoot(host)
root.render(<StrictMode><ErrorBoundary><App auth={auth} controller={controller}/></ErrorBoundary></StrictMode>)
// bfcache restoration mounts a fresh root rather than retaining a disposed controller.
window.addEventListener('pagehide',()=>root.unmount(),{once:true})
window.addEventListener('pageshow',event=>{if(event.persisted) location.reload()})
