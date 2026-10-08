const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

class Element {
  constructor(tag = 'div') {
    this.tag = tag
    this.children = []
    this.events = {}
    this.attributes = {}
    this.style = {}
    this.disabled = false
    this.hidden = false
    const classes = new Set()
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      contains: name => classes.has(name),
      toggle: (name, active) => active ? classes.add(name) : classes.delete(name),
    }
    this.selectors = {}
  }
  set textContent(value) { this.text = value; this.children = [] }
  get textContent() { return this.text }
  append(...items) { this.children.push(...items) }
  appendChild(item) { this.append(item) }
  setAttribute(name, value) { this.attributes[name] = value }
  addEventListener(name, handler) { this.events[name] = handler }
  querySelector(selector) { return this.selectors[selector] ||= new Element() }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [
      ...(child.tag === selector ? [child] : []),
      ...child.querySelectorAll(selector),
    ])
  }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function harness(page, rateWord = async () => {}) {
  const elements = new Map()
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)
  }
  const timers = new Map()
  let timerId = 0
  const context = vm.createContext({
    document: {
      body: { dataset: {} },
      events: {},
      addEventListener(name, handler) { this.events[name] = handler },
      getElementById: id => id === 'nav' ? null : get(id),
      createElement: tag => new Element(tag),
    },
    location: { search: '' },
    URLSearchParams,
    ROOT: '',
    Store: { requireUser: () => new Promise(() => {}), rateWord },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  const run = source => vm.runInContext(source, context)
  const load = name => run(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'))
  load('taxonomy'); load('scheduler'); load('ui'); load(page)
  const rows = [
    { id: 1, deck: 'Майстерня', section: 'Інструменти механіка', he: 'מברג', tr: 'мавреґ', ua: 'викрутка' },
    { id: 2, deck: 'Майстерня', section: 'Інструменти механіка', he: 'פטיש', tr: 'патіш', ua: 'молоток' },
    { id: 3, deck: 'Електрика', section: null, he: 'חשמל', tr: 'хашмаль', ua: 'електрика' },
    { id: 4, deck: 'Електрика', section: null, he: 'מנוע', tr: 'маноа', ua: 'двигун' },
  ]
  context.fixtures = rows
  run(`words = fixtures; state.category = 'Майстерня'; state.section = 'Інструменти механіка'; UI.filters($('filters'), state, start); start()`)
  const flush = () => {
    const callbacks = [...timers.values()]; timers.clear()
    callbacks.forEach(callback => callback())
  }
  const rate = (rating = 'good') => get('ratings').events.click({
    target: { closest: () => ({ dataset: { rating } }) },
  })
  const choose = right => run(`choose(current.options.findIndex(option => (option.id === current.word.id) === ${right}))`)
  const switchSection = () => run(`state.category = 'Електрика'; state.section = null; UI.filters($('filters'), state, start); start()`)
  return { run, get, rows, flush, rate, choose, switchSection, timers }
}

function freezeTime(h) {
  h.run(`
    const NativeDate = Date
    let fakeNow = NativeDate.parse('2026-10-08T10:00:00Z')
    Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fakeNow])) }
      static now() { return fakeNow }
    }
  `)
}

test('empty study shows next review and automatically restores cards when due', () => {
  const h = harness('study')
  freezeTime(h)
  h.run(`words.forEach(word => word.due_at = new Date(Date.now() + 86400000).toISOString()); start()`)
  assert.equal(h.get('empty').hidden, false)
  assert.match(h.get('empty').querySelector('p').textContent, /Найближче повторення:/)
  assert.equal(h.timers.size, 1)
  h.run('fakeNow += 86400000')
  h.flush()
  assert.equal(h.get('empty').hidden, true)
  assert.equal(h.get('word').textContent, 'מברג')
})

test('switching section cancels review timer and cannot interrupt an active queue', () => {
  const h = harness('study')
  freezeTime(h)
  h.run(`words.filter(word => word.deck === 'Майстерня').forEach(word => word.due_at = new Date(Date.now() + 86400000).toISOString()); start()`)
  assert.equal(h.timers.size, 1)
  h.switchSection()
  assert.equal(h.timers.size, 0)
  h.run('fakeNow += 86400000')
  h.flush()
  assert.equal(h.get('word').textContent, 'חשמל')
})

test('returning to an empty background tab checks time without disturbing active study', () => {
  const h = harness('study')
  freezeTime(h)
  h.run(`words.forEach(word => word.due_at = new Date(Date.now() + 86400000).toISOString()); start(); fakeNow += 86400000; document.events.visibilitychange()`)
  assert.equal(h.get('empty').hidden, true)
  h.get('scene').events.click()
  h.run('document.events.visibilitychange()')
  assert.equal(h.run('flipped'), true)
})

test('one day means 24 hours; fractional intervals are labelled without rounding to a day', () => {
  const h = harness('study')
  freezeTime(h)
  assert.equal(h.run(`new Date(Scheduler.result({review_level: 0}, 'hard').due_at).getTime() - Date.now()`), 86400000)
  assert.equal(h.run(`Scheduler.label('hard', {review_level: 2})`), '1,5 дн.')
  assert.equal(h.run(`Scheduler.label('easy', {review_level: 0})`), '4,5 дн.')
})

test('study locks ratings, scene and category buttons through save AND transition', async () => {
  const pending = deferred(); const calls = []
  const h = harness('study', word => { calls.push(word.id); return pending.promise })
  h.get('scene').events.click()
  const save = h.rate()
  assert.equal(h.get('scene').disabled, true)
  assert(h.get('filters').querySelectorAll('button').every(button => button.disabled))
  await h.rate()
  pending.resolve(); await save
  assert.equal(h.get('scene').disabled, true)
  assert.equal(h.get('word').textContent, 'מברג')
  h.get('scene').events.click(); await h.rate()
  assert.deepEqual(calls, [1])
  h.flush()
  assert.equal(h.get('word').textContent, 'פטיש')
  assert.equal(h.get('scene').disabled, false)
  assert(h.get('filters').querySelectorAll('button').every(button => !button.disabled))
})

test('study ignores old save completion after a forced new session', async () => {
  const pending = deferred(); const h = harness('study', () => pending.promise)
  h.get('scene').events.click(); const save = h.rate()
  h.switchSection(); pending.resolve(); await save
  assert.deepEqual(Array.from(h.run('queue'), word => word.id), [3, 4])
  assert.equal(h.get('word').textContent, 'חשמל')
  assert.equal(h.timers.size, 0)
})

test('study save failure keeps the same card available for retry', async () => {
  let attempts = 0
  const h = harness('study', async () => { if (++attempts === 1) throw new Error('Offline') })
  h.get('scene').events.click(); await h.rate()
  assert.equal(h.run('queue.length'), 2)
  assert.equal(h.run('flipped'), true)
  assert(h.get('study-status').textContent.includes('Offline'))
  assert.equal(h.get('scene').disabled, false)
  await h.rate(); h.flush()
  assert.equal(h.run('queue.length'), 1)
  assert.equal(attempts, 2)
})

test('study cancels old transition when starting a new section', async () => {
  const h = harness('study'); h.get('scene').events.click(); await h.rate()
  assert.equal(h.timers.size, 1)
  h.switchSection(); assert.equal(h.timers.size, 0); h.flush()
  assert.equal(h.get('word').textContent, 'חשמל')
  assert.equal(h.get('scene').disabled, false)
})

test('quiz does not count or advance until the save succeeds; duplicate answer is ignored', async () => {
  const pending = deferred(); let attempts = 0
  const h = harness('quiz', () => { attempts++; return pending.promise })
  const save = h.choose(true)
  h.choose(true); h.get('next').events.click()
  assert.equal(attempts, 1)
  assert.equal(h.run('ok'), 0)
  assert.equal(h.run('i'), 0)
  assert.equal(h.get('next').disabled, true)
  assert(h.get('filters').querySelectorAll('button').every(button => button.disabled))
  pending.resolve(); await save
  assert.equal(h.run('ok'), 1)
  assert.equal(h.get('next').hidden, false)
  assert.equal(h.get('next').disabled, false)
})

test('quiz failure is visible; retry preserves chosen answer and counts exactly once', async () => {
  let attempts = 0; const ratings = []
  const h = harness('quiz', async (_word, rating) => {
    ratings.push(rating)
    if (++attempts === 1) throw new Error('Offline')
  })
  await h.choose(false)
  const picked = h.run('picked')
  assert.equal(h.run('review'), 0)
  assert.equal(h.get('next').hidden, true)
  assert.equal(h.get('retry-save').hidden, false)
  assert(h.get('quiz-status').textContent.includes('Offline'))
  assert(h.get('options').children.every(button => button.disabled))
  await h.get('retry-save').events.click()
  await h.get('retry-save').events.click()
  assert.equal(h.run('picked'), picked)
  assert.equal(h.run('review'), 1)
  assert.equal(h.get('retry-save').hidden, true)
  assert.equal(h.get('next').hidden, false)
  assert.deepEqual(ratings, ['again', 'again'])
})

test('quiz retry stays locked during a pending retry request', async () => {
  const pending = deferred(); let attempts = 0
  const h = harness('quiz', () => ++attempts === 1 ? Promise.reject(new Error('Offline')) : pending.promise)
  await h.choose(true)
  const retry = h.get('retry-save').events.click()
  await h.get('retry-save').events.click()
  assert.equal(attempts, 2)
  assert.equal(h.get('retry-save').disabled, true)
  pending.resolve(); await retry
  assert.equal(h.run('ok'), 1)
})

test('quiz old save cannot update a new session score or buttons', async () => {
  const pending = deferred(); const h = harness('quiz', () => pending.promise)
  const save = h.choose(true)
  h.switchSection(); pending.resolve(); await save
  assert.equal(h.run('ok'), 0)
  assert.equal(h.run('picked'), null)
  assert.equal(h.get('next').hidden, true)
  assert.equal(h.run('i'), 0)
})

test('quiz ignores old errors after changing sessions', async () => {
  const pending = deferred(); const h = harness('quiz', () => pending.promise)
  const save = h.choose(false)
  h.switchSection(); pending.reject(new Error('Old error')); await save
  assert.equal(h.get('quiz-status').textContent, '')
  assert.equal(h.get('retry-save').hidden, true)
  assert.equal(h.run('review'), 0)
})

test('quiz cancels delayed advance when a new section starts', async () => {
  const h = harness('quiz'); await h.choose(false)
  h.get('next').events.click(); h.get('next').events.click()
  assert.equal(h.timers.size, 1)
  h.switchSection(); assert.equal(h.timers.size, 0); h.flush()
  assert.equal(h.run('i'), 0)
  assert.equal(h.run('current.word.deck'), 'Електрика')
})

test('quiz advances once after wrong answer and reaches the result after completing the section', async () => {
  const h = harness('quiz'); await h.choose(false)
  h.get('next').events.click(); h.flush()
  assert.equal(h.run('i'), 1)
  assert.equal(h.run('picked'), null)
  assert.equal(h.run('answerSaved'), false)
  await h.choose(true); h.get('next').events.click()
  assert.equal(h.get('result').hidden, false)
  assert.equal(h.get('score').textContent, '1 з 2')
})

function storeHarness(response) {
  const calls = {}
  const context = vm.createContext({
    SUPABASE_URL: 'https://example.com', SUPABASE_ANON_KEY: 'public',
    document: { body: { dataset: {} } },
    supabase: { createClient: () => ({ from: table => {
      calls.table = table
      return { update: changes => {
        calls.changes = changes
        return { eq: (column, id) => {
          calls.filters = [['eq', column, id]]
          calls.id = id
          const query = {
            eq: (field, value) => { calls.filters.push(['eq', field, value]); return query },
            is: (field, value) => { calls.filters.push(['is', field, value]); return query },
            select: columns => { calls.columns = columns; return query },
            single: async () => typeof response === 'function' ? response(calls) : response,
          }
          return query
        } }
      } }
    } }) },
  })
  const run = source => vm.runInContext(source, context)
  for (const name of ['scheduler', 'store']) run(fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8'))
  run('var word = {id: 1, review_level: 0, correct_streak: 0, lapses: 0}')
  return { run, calls }
}

test('Store uses the server-confirmed progress values', async () => {
  const confirmed = { id: 1, review_level: 2, correct_streak: 3, lapses: 0, due_at: '2026-10-09T00:00:00Z', needs_review: false }
  const h = storeHarness({ data: confirmed, error: null })
  await h.run("Store.rateWord(word, 'good')")
  assert.equal(h.run('word.review_level'), 2)
  assert.equal(h.run('word.due_at'), confirmed.due_at)
  assert.equal(h.calls.id, 1)
  assert(h.calls.columns.includes('due_at'))
})

for (const response of [
  { data: null, error: null },
  { data: null, error: new Error('Row not found') },
  { data: { id: 2, review_level: 7 }, error: null },
]) {
  test('Store keeps local progress unchanged on missing, unavailable or mismatched row: ' + JSON.stringify(response), async () => {
    const h = storeHarness(response)
    await assert.rejects(h.run("Store.rateWord(word, 'good')"))
    assert.equal(h.run('word.review_level'), 0)
    assert.equal(h.run('word.correct_streak'), 0)
  })
}


test('Store refuses a stale concurrent rating instead of overwriting newer progress', async () => {
  let server = { id: 1, review_level: 0, correct_streak: 0, lapses: 0, last_reviewed_at: null }
  const h = storeHarness(calls => {
    if (!calls.filters.every(([, field, value]) => server[field] === value)) {
      return { data: null, error: { code: 'PGRST116' } }
    }
    server = { ...server, ...calls.changes }
    return { data: { ...server }, error: null }
  })
  h.run('var otherTabWord = {...word}')
  await h.run("Store.rateWord(word, 'good')")
  const firstResult = { ...server }
  await assert.rejects(h.run("Store.rateWord(otherTabWord, 'again')"), /Оновіть сторінку/)
  assert.deepEqual(server, firstResult)
  assert.equal(h.run('otherTabWord.review_level'), 0)
})

test('Store guards subsequent ratings with the server timestamp as well as counters', async () => {
  const timestamp = '2026-10-06T20:00:00.000Z'
  const h = storeHarness({ data: { id: 1, review_level: 1 }, error: null })
  h.run(`word.last_reviewed_at = '${timestamp}'`)
  await h.run("Store.rateWord(word, 'good')")
  assert(h.calls.filters.some(([op, field, value]) => op === 'eq' && field === 'last_reviewed_at' && value === timestamp))
})
