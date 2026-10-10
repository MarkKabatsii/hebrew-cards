// Local HTTP + mocked auth/Supabase transport, real production React bundle.
// No production requests. SQL/RLS are tested separately in learning-sql.test.ts.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const http=require('node:http'),assert=require('node:assert/strict')
const {spawn}=require('node:child_process')
const {buildSync}=require('esbuild')
const {MemoryRepository}=require('../src/learning/data/memory.ts')
const {currentWord}=require('../src/learning/domain/transitions.ts')
const root=path.resolve(__dirname,'..')
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hebrew-learning-browser-'))
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const words=Array.from({length:5},(_,i)=>({owner:'local',word_id:String(i+1),created_at:'2026-01-01',
  he:['שָׁלוֹם','אֲנִי','אַתָּה','אַתְּ','הוּא'][i],ua:['привіт','я','ти чоловіче','ти жіноче','він'][i],tr:'транскрипція для перевірки',
  answers_he:[],answers_uk:[],normalization_version:1}))
let repo=new MemoryRepository(words)
let calls=[],exampleFailure=false,testAuthOwner='local'
const stub=`
window.testErrors=[];window.authStats={subscribe:0,unsubscribe:0,live:0};window.authOwner='local';window.authCallbacks=new Set();
window.addEventListener('error',e=>testErrors.push(e.message));window.addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));
window.SUPABASE_URL='https://local-test.invalid';window.SUPABASE_ANON_KEY='local-test';
window.supabase={createClient:()=>({auth:{
 getSession:async()=>({data:{session:authOwner?{user:{id:authOwner}}:null},error:null}),
 onAuthStateChange(callback){authCallbacks.add(callback);authStats.subscribe++;authStats.live++;return {data:{subscription:{unsubscribe(){authCallbacks.delete(callback);authStats.unsubscribe++;authStats.live--}}}}},
 signInWithPassword:async()=>{window.testAccount('local');return {data:{session:{user:{id:'local'}}},error:null}},
 signOut:async()=>{window.testAccount(null);return {error:null}}
},rpc(name,args){let signal;const query={abortSignal(s){signal=s;return query},then(resolve,reject){return fetch('/__rpc',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:authOwner,name,args})}).then(r=>r.json()).catch(()=>({data:null,error:{code:'NETWORK'}})).then(resolve,reject)}};return query},
from(table){const q={select(){return q},order(){return q},eq(){return q},in(){return q},is(){return q},
 range(from,to){return fetch('/__legacy?table='+table+'&from='+from+'&to='+to).then(r=>r.json())},
 update(changes){q.changes=changes;return q},single(){return Promise.resolve({data:{id:typeof current==='undefined'?'1':current.word.id,...q.changes},error:null})}};return q}
})};
window.testAccount=owner=>{authOwner=owner;authCallbacks.forEach(cb=>cb('SIGNED_IN',owner?{user:{id:owner}}:null))};
`
function mime(file){return file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'}
async function main(){
  buildSync({entryPoints:['tests/learning-strict-fixture.tsx'],outfile:path.join(dir,'strict.js'),bundle:true,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'}})
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://local')
    if(url.pathname==='/__legacy'){
      const table=url.searchParams.get('table');const rows=table==='words'?words.map(w=>({id:w.word_id,deck:'Загальновживані слова',section:'Займенники',he:w.he,ua:w.ua,tr:w.tr,review_level:0,correct_streak:0,lapses:0,last_reviewed_at:null,due_at:'2020-01-01T00:00:00Z'})):repo.exampleRows
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:rows.slice(Number(url.searchParams.get('from')),Number(url.searchParams.get('to'))+1),error:null}));return
    }
    if(url.pathname==='/__rpc'){
      try{
        let body='';for await(const chunk of req)body+=chunk
        const {owner,name,args}=JSON.parse(body);calls.push({owner,name,args})
        let data
        if(name==='lp_dashboard')data=await repo.load(owner)
        else if(name==='lp_command')data=await repo.execute(owner,args.p_command)
        else if(name==='lp_examples'){if(exampleFailure)throw Error('EXAMPLES');data=await repo.examples(owner,args.p_ids)}
        else throw Error('RPC')
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data,error:null}))
      }catch(error){
        if(error.message==='NETWORK'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{code:'NETWORK'}}));return}
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:null,error:{code:'22023',message:error.message}}))
      }return
    }
    if(url.pathname==='/__strict.html'){
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="uk"><body><div id="learning-root"></div><script>'+stub+'</script><script>window.learningBridge={client:supabase.createClient()}</script><script src="/__strict.js"></script></body></html>');return
    }
    if(url.pathname==='/__strict.js' || url.pathname==='/__strict.css'){
      const file=path.join(dir,url.pathname.endsWith('css')?'strict.css':'strict.js');res.setHeader('Content-Type',mime(file));res.end(fs.readFileSync(file));return
    }
    const file=path.resolve(root,'dist','.'+url.pathname)
    if(!file.startsWith(path.join(root,'dist')+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()){res.statusCode=404;res.end();return}
    let content=fs.readFileSync(file)
    if(file.endsWith('.html')){
      content=content.toString().replace(/<script src="https:[^"]+"><\/script>/g,'').replace(/<script src="(?:\/|\.\.\/)?js\/config.js"><\/script>/,'<script>'+stub.replace("window.authOwner='local'",'window.authOwner='+JSON.stringify(testAuthOwner))+'</script>').replace(/<link[^>]+href="https:[^>]+>/g,'')
    }
    res.setHeader('Content-Type',mime(file));res.end(content)
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const base='http://127.0.0.1:'+server.address().port
  const browser=spawn(process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
    '--headless','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+path.join(dir,'profile'),'about:blank'],{stdio:'ignore'})
  let socket
  try{
    const portFile=path.join(dir,'profile','DevToolsActivePort')
    for(let i=0;!fs.existsSync(portFile);i++){if(i>=100 || browser.exitCode!==null)throw Error('Chrome did not start');await pause(50)}
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0]
    const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()
    socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl)
    await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j})
    let serial=0;const waiting=new Map()
    socket.onmessage=e=>{const m=JSON.parse(e.data);const p=waiting.get(m.id);if(p){waiting.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}}
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;waiting.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}))})
    const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
    const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await pause(20)}throw Error('Timeout: '+expression+' '+JSON.stringify(await evaluate('({url:location.href,text:document.body.innerText,html:document.documentElement.outerHTML.slice(0,1500),errors:window.testErrors})')))}
    const navigate=async(pathname)=>{const navigation=await command('Page.navigate',{url:base+pathname});if(navigation.errorText)throw Error(JSON.stringify(navigation));await wait("document.readyState==='complete' && !!document.querySelector('.lp-total')")}
    const button=async(text)=>{await evaluate(`Array.from(document.querySelectorAll('.lp button')).find(b=>b.textContent===${JSON.stringify(text)}).click()`)}
    const ready=()=>wait("!document.querySelector('.lp-status')?.textContent.includes('Зберігаємо') && !document.querySelector('.lp-error')")
    const input=async(text)=>{await evaluate(`(()=>{const i=document.querySelector('#lp-answer');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(text)});i.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
    const dimensions=[]
    // Full real-threshold normal journey.
    await navigate('/learning.html');await button('Почати наступний рівень');await ready()
    await evaluate('window.scrollTo(0,0)')
    const normalShot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(dir,'learning-normal.png'),Buffer.from(normalShot.data,'base64'))
    for(let i=0;i<25;i++){
      await wait(`!!document.querySelector('[aria-label="Відкрити переклад"]')`)
      await evaluate(`document.querySelector('[aria-label="Відкрити переклад"]').click()`)
      await button('Далі');await ready()
    }
    await wait("!!document.querySelector('#lp-answer')")
    // Empty submit is not an attempt; IME Enter is not a submit.
    const beforeEmpty=calls.filter(c=>c.name==='lp_command').length
    await button('Перевірити')
    assert(await evaluate("document.querySelector('.lp-panel').textContent.includes('Введіть відповідь')"))
    assert.equal(calls.filter(c=>c.name==='lp_command').length,beforeEmpty)
    await input('непорожня відповідь під час IME')
    await evaluate("document.querySelector('#lp-answer').dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));document.querySelector('.lp form').requestSubmit()")
    assert.equal(calls.filter(c=>c.name==='lp_command').length,beforeEmpty)
    await evaluate("document.querySelector('#lp-answer').dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))")
    // Question reload drops unsaved text; server remains on same exercise.
    await input('незбережений текст');const questionId=repo.sessions[0].exercise.exercise_id
    await navigate('/learning.html');await button('Продовжити рівень 1')
    await wait("!!document.querySelector('#lp-answer')")
    assert.equal(await evaluate("document.querySelector('#lp-answer').value"),'')
    assert.equal(repo.sessions[0].exercise.exercise_id,questionId)
    for(let i=0;i<30;i++){
      const s=repo.sessions[0],m=currentWord(s).snapshot
      await wait("!!document.querySelector('#lp-answer')")
      const hidden=s.phase==='he_to_uk'?m.ua:m.he
      assert(!await evaluate(`Array.from(document.querySelectorAll('.lp-panel p')).some(p=>p.textContent===${JSON.stringify(hidden)})`))
      assert(!await evaluate("document.querySelector('.lp-panel').textContent.includes('транскрипція для перевірки')"))
      await input(s.phase==='he_to_uk'?m.ua:m.he)
      const count=calls.filter(c=>c.name==='lp_command').length
      if(i===0){
        await evaluate("document.querySelector('#lp-answer').focus()")
        for(const type of ['keyDown','keyUp','keyDown','keyUp']) await command('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,text:type==='keyDown'?'\r':undefined})
      }else await evaluate("document.querySelector('.lp form').requestSubmit();document.querySelector('.lp form').requestSubmit()")
      await ready();await wait("!document.querySelector('#lp-answer')")
      assert.equal(calls.filter(c=>c.name==='lp_command').length,count+1)
      if(i===0){
        const revision=repo.sessions[0].revision
        await navigate('/learning.html');await button('Продовжити рівень 1')
        assert(await evaluate("document.querySelector('.lp-panel').textContent.includes('Правильно')"))
        assert.equal(repo.sessions[0].revision,revision)
      }
      if(i===29){assert.equal(repo.sessions[0].status,'active');assert(await evaluate("document.querySelector('.lp-panel').textContent.includes('Натисни Далі для завершення')"))}
      await button('Далі');await ready()
    }
    assert.equal(repo.sessions[0].status,'completed')
    assert.equal(repo.practiced.length,5)
    assert.equal(calls.filter(c=>c.name==='lp_command' && c.args.p_command.action==='intro_next').length,25)
    assert.equal(calls.filter(c=>c.name==='lp_command' && c.args.p_command.action==='answer').length,30)
    const normalCalls={...Object.fromEntries(['lp_dashboard','lp_command','lp_examples'].map(name=>[name,calls.filter(c=>c.name===name).length]))}
    // Viewports, long material, 0/1/2 approved examples; revoke then reload.
    for(const width of [320,390,768,1280]) for(const count of [0,1,2]){
      repo=new MemoryRepository(words.map((w,i)=>({...w,he:i===0?'שָׁלוֹם '.repeat(80):w.he,ua:i===0?'дуже довге значення '.repeat(80):w.ua})))
      repo.exampleRows=Array.from({length:count},(_,i)=>({word_id:'1',example_order:i+1,status:'approved',sentence_he:'אֲנִי לוֹמֵד עִבְרִית. '.repeat(8),transcription_uk:'Ані ломе́д іврі́т. '.repeat(8),translation_uk:'Я вивчаю іврит. '.repeat(8)}))
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
      await navigate('/learning.html');await button('Почати наступний рівень');await ready()
      await evaluate(`document.querySelector('[aria-label="Відкрити переклад"]').click()`)
      await wait(`document.querySelectorAll('.lp-example').length===${count}`)
      if(count===2){await evaluate("document.querySelector('.lp summary').click()");assert(await evaluate("!!document.querySelector('.lp details[open]') && !!document.querySelector('.lp-back')"))}
      const overflow=await evaluate('document.documentElement.scrollWidth>innerWidth')
      assert.equal(overflow,false);dimensions.push({width,count,overflow})
      if(count===2 && [320,1280].includes(width)){
        const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
        fs.writeFileSync(path.join(dir,'learning-'+width+'.png'),Buffer.from(shot.data,'base64'))
      }
      if(count===2){
        repo.exampleRows=[];await navigate('/learning.html');await button('Продовжити рівень 1')
        await evaluate(`document.querySelector('[aria-label="Відкрити переклад"]').click()`)
        assert.equal(await evaluate("document.querySelectorAll('.lp-example').length"),0)
      }
    }
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
    assert(await evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"))
    // Network failure after commit: retry same operation, no duplicate level.
    repo=new MemoryRepository(words);repo.failAfterCommit=true
    await navigate('/learning.html');await button('Почати наступний рівень')
    await wait("!!document.querySelector('.lp-error')")
    assert.equal(repo.sessions.length,1);await button('Повторити');await ready()
    assert.equal(repo.sessions.length,1)
    // Examples missing is a soft failure.
    exampleFailure=true;await navigate('/learning.html');await wait("document.querySelector('.lp').textContent.includes('Приклади тимчасово недоступні')");exampleFailure=false
    // Account switch clears visible old data and session controls.
    await button('Продовжити рівень 1');await evaluate("testAccount('another')")
    await wait("!!document.querySelector('.lp-total') && document.querySelector('.lp-total').textContent.includes('0 із 0')")
    assert(!await evaluate("document.querySelector('.lp').textContent.includes('Продовжити рівень 1')"))
    // Bounded review user journey, no new completed-word count.
    repo=new MemoryRepository(words);repo.practiced=words.map(w=>({owner:'local',id:w.word_id,at:repo.now-25*3600000,any_error:false}))
    await navigate('/learning.html');await button('Коротке повторення');await ready()
    for(let i=0;i<20;i++){await wait("!!document.querySelector('#lp-answer')");await button('Не знаю');await ready();await wait("!document.querySelector('#lp-answer')");await button('Далі');await ready()}
    assert.equal(repo.sessions[0].status,'completed');assert.equal(repo.practiced.length,5)
    assert(await evaluate("document.querySelector('.lp-panel').textContent.includes('Ще варто повторити')"))
    // Production legacy pages smoke with the same isolated transport.
    for(const [page,selector] of [['/index.html','#word'],['/pages/quiz.html','#options'],['/pages/import.html','#source'],['/pages/decks.html','#nav']]){
      await command('Page.navigate',{url:base+page});await wait("document.readyState==='complete' && !!document.querySelector('#nav a[href$=\"learning.html\"]')")
      assert.deepEqual(await evaluate('testErrors'),[])
      if(page==='/index.html'){await wait("!!document.querySelector('#word').textContent");await evaluate("document.querySelector('#scene').click();document.querySelector('#meaning').click()");assert(await evaluate("!flipped"))}
      if(page==='/pages/quiz.html')await wait("document.querySelector('#options').children.length>0")
      // Existing Node tests exercise import writes/validation; this checks production page loading.
      if(page==='/pages/import.html')assert(await evaluate("!!document.querySelector('textarea')"))
      void selector
    }
    // Login/logout smoke against isolated auth adapter, no real credentials.
    testAuthOwner=null;await command('Page.navigate',{url:base+'/pages/login.html'})
    await wait("!!document.querySelector('#email') && !!window.testErrors")
    await evaluate("document.querySelector('#email').value='fixture@example.invalid';document.querySelector('#password').value='fixture-password'")
    testAuthOwner='local';await evaluate("document.querySelector('#form').requestSubmit()")
    await wait("location.pathname==='/index.html' && !!document.querySelector('#word')?.textContent")
    testAuthOwner=null;await evaluate("document.querySelector('#nav button').click()")
    await wait("location.pathname==='/pages/login.html' && !!document.querySelector('#email')")
    assert.deepEqual(await evaluate('testErrors'),[]);testAuthOwner='local'
    // Development StrictMode mounts/unmounts: one live listener, no business writes.
    repo=new MemoryRepository(words);const priorWrites=calls.filter(c=>c.name==='lp_command').length
    await navigate('/__strict.html')
    const stats=await evaluate('authStats')
    assert.equal(stats.live,1);assert.equal(stats.subscribe,2);assert.equal(stats.unsubscribe,1)
    assert.equal(calls.filter(c=>c.name==='lp_command').length,priorWrites)
    await evaluate('testUnmount()');assert.equal(await evaluate('authStats.live'),0)
    await evaluate('testMount()');await wait("!!document.querySelector('.lp-total')")
    assert.equal(await evaluate('authStats.live'),1)
    assert.equal(calls.filter(c=>c.name==='lp_command').length,priorWrites)
    assert.deepEqual(await evaluate('testErrors'),[])
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify({normalCalls,dimensions,strictMode:stats},null,2))
    console.log('PASS: full normal journey25+15+15, last feedback, double submit, reload, examples/revocation, 320/390/768/1280, retry, auth switch, StrictMode. Artifacts: '+dir)
    console.log('Full normal journey calls (includes two reloads): '+JSON.stringify(normalCalls))
  }finally{
    socket?.close();browser.kill();await new Promise(r=>server.close(r))
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
