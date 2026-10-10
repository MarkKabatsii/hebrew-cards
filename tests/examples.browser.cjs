// Локальний Chrome + підставний Supabase. Без мережевих запитів до production.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const root = process.env.TEST_SITE_ROOT ? path.resolve(process.env.TEST_SITE_ROOT) : path.resolve(__dirname, '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hebrew-examples-browser-'))
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

const stub = `
const SUPABASE_URL = 'https://local-test.invalid', SUPABASE_ANON_KEY = 'local-test'
window.requests = []
window.errors = []
window.addEventListener('error', event => errors.push(event.message))
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)))
const fixtures = [21,22,23,24].map((id,index) => ({id, deck:'Загальновживані слова', section:'Займенники',
  he:['אֲנִי','אַתָּה','אַתְּ','הוּא'][index], tr:'ані', ua:['я','ти (чол.)','ти (жін.)','він'][index],
  review_level:0, correct_streak:0, lapses:0, last_reviewed_at:null, due_at:'2020-01-01T00:00:00Z'}))
const count = Number(new URLSearchParams(location.search).get('count') || 0)
const fail = new URLSearchParams(location.search).has('fail')
const supabase = {createClient: () => ({
  auth: {getSession: async () => ({data:{session:{user:{id:'local'}}}})},
  from(table) {
    const request = {table}; const q = {
      select() {return this}, order() {return this}, in() {return this}, eq() {return this}, is() {return this},
      range() {
        requests.push(request)
        if(table==='words') return Promise.resolve({data:fixtures})
        if(fail) return Promise.resolve({error:{message:'PRIVATE SQL owner info'}})
        return Promise.resolve({data:Array.from({length:count},(_,i)=>({word_id:21,example_order:i+1,status:'approved',
          sentence_he:'אֲנִי לוֹמֵד עִבְרִית. '.repeat(6),transcription_uk:'Ані́ ломе́д іврі́т. '.repeat(6),
          translation_uk:'Я вивчаю іврит. '.repeat(10)}))})
      }, update(changes) {this.changes=changes; return this},
      single() {return Promise.resolve({data:{id:typeof current==='undefined' ? 21 : current.word.id,...this.changes}})}
    }; return q
  }
})}
`

function fixture(page) {
  const file = page === 'study' ? 'index.html' : 'pages/quiz.html'
  let html = fs.readFileSync(path.join(root, file), 'utf8')
  // Усі зовнішні скрипти, шрифти та справжня конфігурація вилучаються.
  html = html.replace(/<link[\s\S]*?>/g, tag => {
    const match = tag.match(/href="([^\"]+)"/)
    if (!match || /^https:/.test(match[1])) return ''
    return tag.replace(match[1], 'file://' + path.resolve(root, path.dirname(file), match[1]))
  })
  html = html.replace(/<script src="([^\"]+)"><\/script>/g, (tag, src) => {
    if (/^https:/.test(src)) return ''
    if (src.endsWith('/config.js')) return '<script>' + stub + '</script>'
    return '<script src="file://' + path.resolve(root, path.dirname(file), src) + '"></script>'
  })
  const output = path.join(dir, page + '.html')
  fs.writeFileSync(output, html)
  return 'file://' + output
}

async function main() {
  const profile = path.join(dir, 'profile')
  const browser = spawn(chromePath, [
    '--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, 'about:blank',
  ], { stdio: 'ignore' })
  let socket
  try {
    const portFile = path.join(profile, 'DevToolsActivePort')
    for (let attempt = 0; !fs.existsSync(portFile); attempt++) {
      if (attempt >= 100 || browser.exitCode !== null) throw Error('Chrome did not start: exit=' + browser.exitCode)
      await pause(50)
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0]
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
    let sequence = 0
    const waiting = new Map()
    socket.onmessage = event => {
      const msg = JSON.parse(event.data)
      if (waiting.has(msg.id)) {
        const {resolve,reject} = waiting.get(msg.id); waiting.delete(msg.id)
        msg.error ? reject(Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    }
    const command = (method, params = {}) => new Promise((resolve,reject) => {
      const id = ++sequence; waiting.set(id,{resolve,reject}); socket.send(JSON.stringify({id,method,params}))
    })
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', {expression, returnByValue:true, awaitPromise:true})
      if (result.exceptionDetails) throw Error(result.exceptionDetails.text + ': ' + JSON.stringify(result.exceptionDetails.exception))
      return result.result.value
    }
    const navigate = async (url, ready) => {
      await command('Page.navigate', {url})
      for(let i=0;i<100;i++) {
        if(await evaluate(`location.href===${JSON.stringify(url)} && document.readyState==='complete' && ${ready}`)) return
        await pause(30)
      }
      throw Error('Fixture did not become ready')
    }
    const study = fixture('study'), quiz = fixture('quiz')
    const reports = []
    for (const width of [320,390,768]) {
      await command('Emulation.setDeviceMetricsOverride', {width,height:1000,deviceScaleFactor:1,mobile:false})
      for (const count of [0,1,2]) {
        await navigate(study + '?count=' + count, `typeof queue!=='undefined' && queue.length===4`)
        assert(await evaluate(`$('card-back').inert && $('card-back').getAttribute('aria-hidden')==='true'`))
        const beforeAX = await command('Accessibility.getFullAXTree')
        assert(!beforeAX.nodes.some(node => !node.ignored && node.name?.value?.includes('Я вивчаю іврит')))
        await evaluate(`$('scene').focus(); $('scene').click()`)
        assert(await evaluate(`!$('card-back').inert && $('card-front').inert && document.activeElement.id==='card-back'`))
        assert.equal(await evaluate(`$('examples').hidden`), count === 0)
        if(count===2) {
          await evaluate(`$('examples').querySelector('summary').click()`)
          assert(await evaluate(`flipped && $('examples').querySelector('details').open`))
        }
        await pause(650)
        const dimensions = await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
          back:$('card-back').getBoundingClientRect().height, flip:$('flip').getBoundingClientRect().height,
          clipped:$('card-back').scrollHeight>$('card-back').clientHeight+1, errors, requests:requests.length})`)
        assert.equal(dimensions.width,width)
        assert.equal(dimensions.overflow,false)
        assert.equal(dimensions.clipped,false)
        assert(dimensions.back<=dimensions.flip+1)
        assert.deepEqual(dimensions.errors,[])
        assert.equal(dimensions.requests,2)
        if(count===2) {
          const screenshot = await command('Page.captureScreenshot', {format:'png',captureBeyondViewport:true})
          fs.writeFileSync(path.join(dir,'study-'+width+'.png'),Buffer.from(screenshot.data,'base64'))
        }
        await evaluate(`$('meaning').click()`)
        assert(await evaluate(`!flipped && $('card-back').inert && document.activeElement.id==='scene'`))
        await evaluate(`$('card-front').click()`)
        assert(await evaluate(`flipped && !$('card-back').inert`))
        await evaluate(`$('card-back').dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}))`)
        assert(await evaluate(`!flipped && $('card-back').inert`))
        reports.push({width,count,...dimensions})
      }
    }
    await navigate(study+'?fail=1', `typeof queue!=='undefined' && queue.length===4`)
    assert(await evaluate(`$('examples-status').textContent.includes('тимчасово недоступні') && !document.body.innerText.includes('PRIVATE')`))
    await evaluate(`$('scene').click()`)
    assert(await evaluate('flipped'))
    await navigate(study+'?count=2', `typeof queue!=='undefined' && queue.length===4`)
    await evaluate(`$('scene').click(); $('examples').querySelector('summary').click(); document.querySelector('[data-rating="good"]').click()`)
    for(let attempt=0;attempt<100;attempt++) {
      if(await evaluate(`queue[0].id===22 && !transitioning`)) break
      await pause(30)
    }
    const nextCard = await evaluate(`({id:queue[0].id,flipped,hidden:$('examples').hidden,details:!!$('examples').querySelector('details'),status:$('study-status').textContent,errors})`)
    assert(nextCard.id===22 && !nextCard.flipped && nextCard.hidden && !nextCard.details, JSON.stringify(nextCard))
    await navigate(quiz, `typeof current!=='undefined' && current!==null`)
    assert(await evaluate(`$('card-back').inert && $('card-back').getAttribute('aria-hidden')==='true'`))
    const quizAX = await command('Accessibility.getFullAXTree')
    const dom = await command('DOM.getDocument')
    const meaning = await command('DOM.querySelector', {nodeId:dom.root.nodeId,selector:'#meaning'})
    const meaningNode = await command('DOM.describeNode', {nodeId:meaning.nodeId})
    assert(!quizAX.nodes.some(node => !node.ignored && node.backendDOMNodeId === meaningNode.node.backendNodeId))
    await evaluate(`choose(current.options.findIndex(option=>option.id!==current.word.id))`)
    assert(await evaluate(`flipped && !$('card-back').inert`))
    assert.deepEqual(await evaluate('errors'),[])
    fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(reports,null,2))
    console.log('PASS: Chrome 320/390/768px × 0/1/2 examples, disclosure, focus/inert, AX tree, failure fallback and quiz. Artifacts: '+dir)
  } finally {
    socket?.close(); browser.kill()
  }
}
main().catch(error => { console.error(error); process.exitCode=1 })
