import { Component, useEffect, useRef, useState, useSyncExternalStore, type ErrorInfo, type ReactNode } from 'react'
import type { AuthAdapter } from '../integration/auth'
import { Controller } from '../application/controller'
import { currentWord, progress } from '../domain/transitions'
import { evaluateAnswer, MAX_ANSWER_LENGTH } from '../domain/answers'
import type { Example, Kind, Material, Mode, Session, SessionWord } from '../domain/model'
import './learning.css'

export class ErrorBoundary extends Component<{children: ReactNode},{failed:boolean}> {
  state={failed:false}
  static getDerivedStateFromError() {return {failed:true}}
  componentDidCatch(_error: Error,_info: ErrorInfo) { /* No personal answers in logs. */ }
  render() {return this.state.failed?<section className="lp"><h1>Навчальний маршрут</h1><p role="alert">Не вдалося відкрити розділ. Оновіть сторінку; збережений прогрес залишився в базі.</p></section>:this.props.children}
}
export function App({controller,auth}: {controller: Controller;auth: AuthAdapter}) {
  const view=useSyncExternalStore(controller.subscribe,controller.snapshot)
  const [selected,setSelected]=useState<Kind|null>(null)
  const [mode,setMode]=useState<Mode>('normal')
  useEffect(()=>{
    let alive=true, sequence=0
    const apply=(owner: string|null)=>{if(alive){sequence++;controller.setOwner(owner)}}
    const unsubscribe=auth.subscribe(apply)
    const before=sequence
    void auth.current().then(owner=>{if(alive && sequence===before) apply(owner)}).catch(()=>{if(alive) controller.setOwner(null)})
    const refresh=()=>{if(document.visibilityState==='visible') void controller.reload()}
    document.addEventListener('visibilitychange',refresh)
    return ()=>{alive=false;unsubscribe();document.removeEventListener('visibilitychange',refresh);controller.dispose()}
  },[auth,controller])
  useEffect(()=>{setSelected(null)},[view.owner])
  const dashboard=view.dashboard
  const session=selected && dashboard?.sessions.filter(s=>s.kind===selected).reverse().sort((a,b)=>
    (a.status==='active'?-1:b.status==='active'?1:0) || (b.level_number??0)-(a.level_number??0)).at(0)
  const busy=view.busy || !!view.pending || view.loading
  return <section className="lp" aria-labelledby="lp-title">
    <header><h1 id="lp-title">Навчальний маршрут</h1><p>До п’яти слів за рівень. Знайомство й письмове пригадування у двох напрямках.</p></header>
    {!view.owner && !view.loading && <p>Потрібно <a href="/pages/login.html">увійти до акаунта</a>.</p>}
    {view.loading && <p role="status">Завантажуємо маршрут…</p>}
    <div role="status" aria-live="polite" className="lp-status">{view.busy?'Зберігаємо…':view.notice??''}</div>
    {view.error && <div className="lp-error" role="alert"><p>{view.error}</p>
      <button disabled={view.busy} onClick={()=>view.pending?void controller.retry():void controller.reload()}>Повторити</button></div>}
    {dashboard && <>
      <p className="lp-total">Опрацьовано в маршруті: <strong>{dashboard.metrics.completed} із {dashboard.metrics.eligible}</strong>
        {' '}({dashboard.metrics.eligible?Math.round(dashboard.metrics.completed/dashboard.metrics.eligible*100):0}%)</p>
      {dashboard.metrics.problematic>0 && <p>Некоректних записів поза маршрутом: {dashboard.metrics.problematic}. Перевірте іврит і переклад у словнику.</p>}
      {view.examplesUnavailable && <p role="status">Приклади тимчасово недоступні. Навчання можна продовжити.</p>}
      {!session ? <div className="lp-panel">
        {dashboard.sessions.filter(s=>s.status==='active').map(s=><button key={s.id} disabled={busy} onClick={()=>setSelected(s.kind)}>
          Продовжити {s.kind==='review'?'коротке повторення':`рівень ${s.level_number}`}</button>)}
        {!dashboard.sessions.some(s=>s.kind==='level' && s.status==='active') && <>
          {dashboard.metrics.completed===dashboard.metrics.eligible && <p>Усі доступні слова опрацьовано. Додайте нові слова, щоб продовжити маршрут.</p>}
          <label>Режим наступного рівня<select value={mode} onChange={e=>setMode(e.target.value as Mode)} disabled={busy}>
            <option value="normal">Звичайний — 5 переглядів, 3 + 3 відповіді</option><option value="intensive">Інтенсивний — 10 переглядів, 10 + 10 відповідей</option>
          </select></label>
          {dashboard.metrics.review_due>0 && <p>Є слова для короткого повторення. Можна повторити зараз або відкласти й почати рівень.</p>}
          <button disabled={busy || dashboard.metrics.completed>=dashboard.metrics.eligible} onClick={()=>{setSelected('level');void controller.start('level',mode)}}>Почати наступний рівень</button>
        </>}
        {!dashboard.sessions.some(s=>s.kind==='review' && s.status==='active') && <>
          <button disabled={busy || !dashboard.metrics.review_due} onClick={()=>{setSelected('review');void controller.start('review','normal')}}>Коротке повторення</button>
          {!dashboard.metrics.review_due && <p>Наразі немає слів для повторення. Воно доступне через 24 години після практики.</p>}
        </>}
        <p>Пороги — початкові правила тренажера. Завершення означає «Опрацьовано в маршруті».</p>
      </div> : <>
        <button className="lp-link" disabled={busy} onClick={()=>setSelected(null)}>До маршруту</button>
        {session.status==='active' ? <ExerciseView key={session.exercise.exercise_id} session={session} busy={busy}
          examples={view.examples} act={(action,result)=>void controller.act(session,action,result)}/>
          : <div className="lp-panel" role="status">
            <h2>{session.status==='cancelled_empty'?'У цьому сеансі не залишилося доступних слів':session.kind==='review'?'Повторення завершено':'Опрацьовано в маршруті'}</h2>
            {session.status==='cancelled_empty' && <p>Рівень не зараховано. Можна почати наступний.</p>}
            {session.kind==='review' && session.words.some(w=>w.any_error) && <><p>Ще варто повторити:</p><ul>{session.words.filter(w=>w.any_error).map(w=><li key={w.snapshot.word_id} lang="uk">{w.snapshot.ua}</li>)}</ul></>}
          </div>}
      </>}
    </>}
  </section>
}
function Examples({rows}: {rows:Example[]}) {
  if(!rows.length) return null
  const sentence=(e:Example)=><div className="lp-example"><p lang="he" dir="rtl">{e.sentence_he}</p><p lang="uk" dir="ltr">{e.transcription_uk}</p><p lang="uk" dir="ltr">{e.translation_uk}</p></div>
  return <section className="lp-examples"><h3>Приклади</h3>{sentence(rows[0]!)}{rows[1] && <details><summary>Ще один приклад</summary>{sentence(rows[1])}</details>}</section>
}
function MaterialView({material,examples}: {material:Material;examples:Example[]}) {
  return <><p className="lp-he" lang="he" dir="rtl">{material.he}</p><p lang="uk" dir="ltr">{material.tr}</p>
    <p className="lp-meaning" lang="uk" dir="ltr">{material.ua}</p>
    {!!material.answers_uk.length && <p lang="uk">Також приймаємо: {material.answers_uk.join('; ')}</p>}
    {!!material.answers_he.length && <div><p lang="uk">Також приймаємо івритом:</p><p lang="he" dir="rtl">{material.answers_he.join('; ')}</p></div>}
    <Examples rows={examples}/></>
}
function counter(s:Session,w:SessionWord): string {
  if(s.kind==='review') return `Спроб у напрямку: ${s.phase==='he_to_uk'?w.attempts_he:w.attempts_uk} із максимум 2`
  return `Поточне слово: ${w[s.phase]} із ${s.thresholds[s.phase]}`
}
function ExerciseView({session:s,busy,examples,act}: {session:Session;busy:boolean;examples:Example[];act:(action:'intro_next'|'answer'|'next',result?:'correct'|'incorrect'|'revealed')=>void}) {
  const [flipped,setFlipped]=useState(false),[viewed,setViewed]=useState(false),[text,setText]=useState(''),[empty,setEmpty]=useState(false)
  const front=useRef<HTMLButtonElement>(null),back=useRef<HTMLDivElement>(null)
  const input=useRef<HTMLInputElement>(null),feedback=useRef<HTMLDivElement>(null),composing=useRef(false)
  const w=currentWord(s)!,m=w.snapshot
  const rows=examples.filter(e=>e.word_id===m.word_id)
  useEffect(()=>{
    if(s.phase==='introduction') (flipped?back.current:front.current)?.focus()
    else if(s.exercise?.state==='feedback') feedback.current?.focus()
    else input.current?.focus()
  },[s.exercise?.state,s.phase,flipped])
  if(s.status!=='active') return null
  const stage=s.phase==='introduction'?1:s.phase==='he_to_uk'?2:3
  const submit=()=>{
    if(busy || composing.current || s.exercise.state!=='question' || s.phase==='introduction') return
    const result=evaluateAnswer(text,s.phase,m)
    if(result==='empty') {setEmpty(true);return}
    act('answer',result)
  }
  return <div className="lp-panel">
    <h2>{s.kind==='review'?'Коротке повторення':`Рівень ${s.level_number}`} · {s.mode==='normal'?'Звичайний':'Інтенсивний'}</h2>
    <p>Етап {stage}/3 · {s.phase==='introduction'?'Знайомство':s.phase==='he_to_uk'?'Іврит → українська':'Українська → іврит'}</p>
    <p>{counter(s,w)}</p>
    {s.kind==='level' && <><progress value={progress(s)} max="1" aria-label="Прогрес рівня"/><p>{Math.round(progress(s)*100)}%{progress(s)===1?' · Натисни Далі для завершення':''}</p></>}
    {s.phase==='introduction' ? <>
      <p className="lp-note">Матеріал цього рівня зафіксовано на час навчання.</p>
      {!flipped ? <button ref={front} className="lp-card" disabled={busy} onClick={()=>{setFlipped(true);setViewed(true)}} aria-label="Відкрити переклад">
        <span className="lp-he" lang="he" dir="rtl">{m.he}</span><span>Торкніться, щоб побачити переклад</span></button>
        : <div ref={back} className="lp-card lp-back" tabIndex={0} role="group" aria-label="Зворот картки; Enter або пробіл повертає слово"
          onClick={e=>{if(!(e.target as HTMLElement).closest('summary,button,a')) setFlipped(false)}}
          onKeyDown={e=>{if(e.target===e.currentTarget && ['Enter',' '].includes(e.key)){e.preventDefault();setFlipped(false)}}}>
          <MaterialView material={m} examples={rows}/></div>}
      <button disabled={busy || !viewed} onClick={()=>act('intro_next')}>Далі</button>
    </> : s.exercise.state==='question' ? <>
      <p className={s.phase==='he_to_uk'?'lp-he':'lp-meaning'} lang={s.phase==='he_to_uk'?'he':'uk'} dir={s.phase==='he_to_uk'?'rtl':'ltr'}>{s.phase==='he_to_uk'?m.he:m.ua}</p>
      <form onSubmit={e=>{e.preventDefault();submit()}}>
        <label htmlFor="lp-answer">{s.phase==='he_to_uk'?'Відповідь українською':'Відповідь івритом'}</label>
        <input ref={input} id="lp-answer" value={text} maxLength={MAX_ANSWER_LENGTH} disabled={busy} autoComplete="off" autoCapitalize="off" spellCheck={false}
          lang={s.phase==='he_to_uk'?'uk':'he'} dir={s.phase==='he_to_uk'?'ltr':'rtl'} onChange={e=>{setText(e.target.value);setEmpty(false)}}
          onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}}
          onKeyDown={e=>{if(e.key==='Enter' && (e.nativeEvent.isComposing || composing.current || e.keyCode===229)) e.preventDefault()}}/>
        {empty && <p role="alert">Введіть відповідь або оберіть «Не знаю».</p>}
        <div className="lp-actions"><button type="submit" disabled={busy}>Перевірити</button><button type="button" disabled={busy} onClick={()=>act('answer','revealed')}>Не знаю</button></div>
      </form>
      <p className="lp-note">Перевірка за варіантами словника. Довільні синоніми автоматично не оцінюються.</p>
    </> : <>
      <div ref={feedback} tabIndex={-1} role="status" aria-live="polite"><h3>{s.exercise.result==='correct'?'Правильно':s.exercise.result==='revealed'?'Відповідь відкрито':'Відповідь не збігається з варіантами словника'}</h3>
        <MaterialView material={m} examples={rows}/></div>
      <button disabled={busy} onClick={()=>act('next')}>Далі</button>
    </>}
  </div>
}
