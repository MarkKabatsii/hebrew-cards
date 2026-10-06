const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = name => fs.readFileSync(path.join(__dirname, '../js', name + '.js'), 'utf8')
const scope = { deck: 'Загальновживані слова', section: 'Займенники' }
const card = { he: 'אֲנִי', tr: 'ані', ua: 'я', ...scope }
function parser() {
  const context = vm.createContext({})
  vm.runInContext(source('taxonomy') + '\n' + source('parser'), context)
  return {
    parse: (text, sc = scope, delimiter = 'auto') => context.parseWords(text, sc, delimiter),
    validate: (word, sc = scope) => context.validateWord(word, sc),
    key: word => { context.word = word; return vm.runInContext('wordKey(word)', context) },
  }
}

test('rejects foreign and mixed alphabets, marks without letters and hidden controls', () => {
  const p = parser()
  for (const he of ['انا', 'אنי', 'אaני', 'אяני', '\u05B7', 'א\u200Fני']) {
    assert(p.validate({ ...card, he }).errors.length, he)
  }
  assert.equal(p.validate(card).errors.length, 0)
  assert.equal(p.validate({ ...card, he: 'נדל"ן' }).errors.length, 0)
})

test('normalizes spaces and NFC, keeps vowel distinctions in duplicate keys', () => {
  const p = parser()
  const result = p.validate({ ...card, he: '  אֲנִי  ', tr: '  ані\t ', ua: ' я\n сам ' })
  assert.equal(result.word.ua, 'я сам')
  assert.equal(p.key(result.word), p.key({ ...card, ua: 'я сам' }))
  assert.notEqual(p.key(card), p.key({ ...card, he: 'אני' }))
})

test('JSON rejects non-array, bad values, blank fields and unknown taxonomy', () => {
  const p = parser()
  for (const text of ['{}', '[null]', '[1]', '[[]]', '[', '[]']) assert(p.parse(text).errors.length, text)
  for (const item of [{ ...card, he: 12 }, { ...card, tr: ' ' }, { ...card, deck: '???' }, { ...card, section: '???' }]) {
    assert(p.parse(JSON.stringify([item])).errors.length)
  }
  assert.equal(p.parse(JSON.stringify([{ he: card.he, tr: card.tr, ua: card.ua }])).errors.length, 0)
})

test('scope section applies only to its own category; categories without sections reject a section', () => {
  const p = parser()
  assert.equal(p.validate({ ...card, deck: 'Електрика', section: null }).word.section, null)
  assert(p.validate({ ...card, deck: 'Електрика' }).errors.length)
  assert(p.validate({ ...card, deck: 'Майстерня', section: null }).errors.length)
})

test('auto delimiter recognizes TSV, pipes, semicolons and comma CSV', () => {
  const p = parser()
  for (const delimiter of ['\t', '|', ';', ',']) {
    const result = p.parse([card.he, card.tr, card.ua].join(delimiter))
    assert.equal(result.errors.length, 0, delimiter)
    assert.equal(result.rows[0].ua, 'я')
  }
  assert.equal(p.parse('אֲנִי\tані\tя; сам, один').rows[0].ua, 'я; сам, один')
})

test('quoted fields accept embedded separators, doubled quotes, CRLF and multiline text', () => {
  const p = parser()
  const result = p.parse('\uFEFFhe,tr,ua,deck,section\r\n"נדל""ן",надлан,"нерухомість, майно\r\n(об’єкти)",Юриспруденція,null')
  assert.equal(result.errors.length, 0)
  assert.equal(result.rows[0].he, 'נדל"ן')
  assert.equal(result.rows[0].ua, 'нерухомість, майно (об’єкти)')
  assert.equal(result.rows[0].section, null)
  assert.equal(p.parse('נדל"ן;надлан;нерухомість').errors.length, 0)
})

test('headers support reordered Ukrainian aliases and ignore exported IDs and owners', () => {
  const p = parser()
  const result = p.parse('id,Переклад,Іврит,Транскрипція,user_id\n12,я,אֲנִי,ані,private-owner')
  assert.equal(result.errors.length, 0)
  assert.equal(result.rows[0].ua, 'я')
  assert.equal('id' in result.rows[0], false)
  assert.equal('user_id' in result.rows[0], false)
})

test('malformed CSV reports unclosed quotes, extra columns and invalid headers', () => {
  const p = parser()
  for (const text of ['"אני;ані;я', '"אני"x;ані;я', 'אני;ані;я;Електрика;;extra', 'he,tr\nאני,ані', 'he,tr,ua,he\nאני,ані,я,אני', 'he,tr,ua\nאני,ані,я,extra']) {
    assert(p.parse(text).errors.length, text)
  }
  const result = p.parse('he;tr;ua\nאני;ані;я\nאaני;ані;я')
  assert.equal(result.rows.length, 1)
  assert(result.errors.some(error => error.startsWith('Рядок 3:')))
})

test('all 416 seed cards and text examples pass the common validator', () => {
  const p = parser()
  const result = p.parse(fs.readFileSync(path.join(__dirname, '../data/words.json'), 'utf8'))
  assert.equal(result.rows.length, 416)
  assert.deepEqual(Array.from(result.errors), [])
  assert.equal(p.parse(fs.readFileSync(path.join(__dirname, '../data/words-example.txt'), 'utf8')).errors.length, 0)
})

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
function page(name, store) {
  const elements = new Map()
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', events: {}, disabled: false, children: [],
      addEventListener(event, callback) { this.events[event] = callback },
      appendChild(child) { this.children.push(child) },
      append(...children) { this.children.push(...children) },
      focus() {},
      querySelectorAll() { return ['he', 'tr', 'ua', 'category', 'section', 'submit'].map(get) },
    })
    return elements.get(id)
  }
  get('delimiter').value = 'auto'
  const context = vm.createContext({
    $: get, el: (tag, cls, text) => ({ ...get(Symbol()), textContent: text }),
    Store: { requireUser: async () => ({}), ...store },
    UI: { bindScope: () => ({ value: () => scope }) },
  })
  const run = code => vm.runInContext(code, context)
  run(source('taxonomy')); run(source('parser')); run(source(name))
  return { get, run, context }
}

test('import blocks writes for ANY invalid row', async () => {
  let writes = 0
  const h = page('import', { all: async () => [], addMany: async () => { writes++ } })
  await tick()
  h.get('text').value = 'אני;ані;я\nאaני;ані;я'
  await h.run('run(false)')
  assert.equal(writes, 0)
  assert.match(h.get('msg').textContent, /Виправте помилки/)
})

test('initial failure disables import and can be retried', async () => {
  let failing = true
  const h = page('import', { all: async () => { if (failing) throw Error('offline'); return [] } })
  await tick()
  assert.equal(h.get('doImport').disabled, true)
  assert.equal(h.get('reloadWords').hidden, false)
  failing = false
  await h.run('loadWords()')
  assert.equal(h.get('doImport').disabled, false)
  assert.equal(h.get('reloadWords').hidden, true)
})

test('dry run refreshes duplicates and never writes', async () => {
  let reads = 0, writes = 0
  const h = page('import', { all: async () => ++reads === 1 ? [] : [card], addMany: async () => { writes++ } })
  await tick()
  h.get('text').value = JSON.stringify([card, card])
  await h.run('run(true)')
  assert.equal(writes, 0)
  assert.match(h.get('msg').textContent, /Нових: 0, дублікатів: 2/)
})

test('partial import keeps text, rereads saved cards and resumes without duplicates', async () => {
  const second = { ...card, he: 'אַתָּה', ua: 'ти' }
  let saved = [], attempts = 0
  const h = page('import', {
    all: async () => [...saved],
    addMany: async rows => {
      attempts++
      if (attempts === 1) {
        saved.push(rows[0])
        const error = Error('offline'); error.addedCount = 1; throw error
      }
      assert.equal(rows.length, 1); assert.equal(rows[0].he, second.he)
      saved.push(...rows); return { addedCount: rows.length }
    },
  })
  await tick()
  const input = JSON.stringify([card, second])
  h.get('text').value = input
  await h.run('run(false)')
  assert.equal(h.get('text').value, input)
  assert.match(h.get('msg').textContent, /Підтверджено додавання: 1/)
  await h.run('run(false)')
  assert.equal(saved.length, 2)
  assert.equal(h.get('text').value, '')
})

test('import locks inputs and rejects double click while request is pending', async () => {
  const pending = deferred(); let writes = 0
  const h = page('import', { all: async () => [], addMany: () => { writes++; return pending.promise } })
  await tick(); h.get('text').value = JSON.stringify([card])
  const first = h.run('run(false)'); await tick()
  for (const id of ['text', 'file', 'category', 'section', 'delimiter', 'doImport']) assert.equal(h.get(id).disabled, true)
  await h.run('run(false)'); assert.equal(writes, 1)
  pending.resolve({ addedCount: 1 }); await first
  assert.equal(h.get('doImport').disabled, false)
})

test('post-save read failure still reports confirmed success and clears text', async () => {
  let reads = 0
  const h = page('import', { all: async () => { if (++reads === 3) throw Error('offline'); return [] }, addMany: async () => ({ addedCount: 1 }) })
  await tick(); h.get('text').value = JSON.stringify([card])
  await h.run('run(false)')
  assert.match(h.get('msg').textContent, /^Додано: 1/)
  assert.equal(h.get('text').value, '')
})

test('single add checks common validation and fresh server duplicates', async () => {
  let writes = 0, reads = 0
  const h = page('add', { all: async () => ++reads === 1 ? [] : [card], add: async () => { writes++ } })
  await tick()
  for (const field of ['he', 'tr', 'ua']) h.get(field).value = card[field]
  h.get('he').value = 'אaני'
  await h.get('form').events.submit({ preventDefault() {} })
  assert.equal(reads, 1)
  h.get('he').value = card.he
  await h.get('form').events.submit({ preventDefault() {} })
  assert.equal(writes, 0)
  assert.match(h.get('msg').textContent, /вже є/)
})

function realStore(respond) {
  const batches = []
  const db = {
    from: () => ({ insert: row => ({ select: columns => {
      batches.push(row)
      return { then: (yes, no) => Promise.resolve(respond(row, batches.length, columns)).then(yes, no), single: () => respond(row, batches.length, columns) }
    } }) }),
  }
  const context = vm.createContext({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test', supabase: { createClient: () => db }, document: { body: { dataset: {} } } })
  vm.runInContext(source('store'), context)
  return { store: vm.runInContext('Store', context), batches }
}

test('file read locks editing and preserves previous text on read failure', async () => {
  const pending = deferred()
  const h = page('import', { all: async () => [] })
  await tick(); h.get('text').value = 'previous input'
  const reading = h.get('file').events.change({ target: { files: [{ name: 'words.csv', text: () => pending.promise }] } })
  assert.equal(h.get('text').disabled, true)
  assert.equal(h.get('doImport').disabled, true)
  pending.reject(Error('cannot read')); await reading
  assert.equal(h.get('text').value, 'previous input')
  assert.equal(h.get('text').disabled, false)
  assert.match(h.get('msg').textContent, /Не вдалося прочитати файл/)
})

test('single add locks form, prevents double submit and uses confirmed row without post-save read', async () => {
  const pending = deferred(); let writes = 0, reads = 0
  const h = page('add', {
    all: async () => { reads++; return [] },
    add: () => { writes++; return pending.promise },
  })
  await tick()
  for (const field of ['he', 'tr', 'ua']) h.get(field).value = card[field]
  const submit = () => h.get('form').events.submit({ preventDefault() {} })
  const saving = submit(); await tick()
  assert.equal(h.get('he').disabled, true)
  await submit(); assert.equal(writes, 1)
  pending.resolve({ ...card, id: 99 }); await saving
  assert.equal(reads, 2)
  assert.equal(h.run('words[0].id'), 99)
  assert.equal(h.get('he').value, '')
  assert.equal(h.get('he').disabled, false)
})

test('Store batches 401 records as 200+200+1 and confirms count', async () => {
  const h = realStore(rows => ({ data: rows.map((_, id) => ({ id })), error: null }))
  assert.equal((await h.store.addMany(Array(401).fill(card))).addedCount, 401)
  assert.deepEqual(h.batches.map(rows => rows.length), [200, 200, 1])
})

test('Store stops on a failed block and reports only earlier confirmed rows', async () => {
  const h = realStore((rows, n) => n === 2 ? { error: Error('offline') } : { data: rows.map((_, id) => ({ id })) })
  await assert.rejects(h.store.addMany(Array(401).fill(card)), error => error.addedCount === 200)
  assert.equal(h.batches.length, 2)
})

test('Store rejects missing or partial confirmation and returns inserted row for single add', async () => {
  for (const data of [null, []]) {
    const h = realStore(() => ({ data }))
    await assert.rejects(h.store.addMany([card]), error => error.addedCount === 0)
  }
  const h = realStore(() => ({ data: { ...card, id: 99 } }))
  assert.equal((await h.store.add(card)).id, 99)
})
