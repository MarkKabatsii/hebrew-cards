// Спільна валідація карток і розбір JSON / CSV / TSV / текстових списків.
const HEBREW_LETTERS = /[א-ת]/u
const HEBREW_TEXT = /^[א-ת\u0591-\u05BD\u05BE\u05C1\u05C2\u05C4\u05C5\u05C7\u05F3\u05F4\d\s'"‘’“”.,:;!?()\[\]/+\-]+$/u
const normalizeWordText = (text) => text.normalize('NFC').trim().replace(/\s+/gu, ' ')

function validateWord(input, scope = {}) {
  const errors = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { word: null, errors: ['потрібен об’єкт картки'] }
  }
  const word = {}
  for (const field of ['he', 'tr', 'ua']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      errors.push('«' + field + '» має бути непорожнім текстом')
    } else {
      word[field] = normalizeWordText(input[field])
      if (/\p{Cf}|\p{Cc}/u.test(word[field])) errors.push('«' + field + '» містить приховані службові символи')
    }
  }
  if (word.he && (!HEBREW_LETTERS.test(word.he) || !HEBREW_TEXT.test(word.he))) {
    errors.push('іврит має містити івритські літери без літер інших абеток')
  }
  for (const field of ['deck', 'section']) {
    const value = field === 'deck' ? input.deck ?? input.category : input.section
    if (value != null && typeof value !== 'string') errors.push('«' + field + '» має бути текстом')
    word[field] = typeof value === 'string' ? normalizeWordText(value) || null : null
  }
  word.deck ||= scope.deck || null
  // Вибраний розділ успадковується лише для тієї самої категорії.
  if (!word.section && word.deck === scope.deck) word.section = scope.section || null
  const cat = findCategory(word.deck)
  if (!cat) errors.push('невідома категорія «' + (word.deck || '') + '»')
  else if (cat.sections.length && !cat.sections.includes(word.section)) {
    errors.push('потрібен дійсний розділ для «' + cat.name + '»')
  } else if (!cat.sections.length && word.section) {
    errors.push('у категорії «' + cat.name + '» немає розділів')
  }
  return { word: errors.length ? null : word, errors }
}

function detectDelimiter(text) {
  // Перший роздільник поза quoted field. Решта знаків у перекладі — текст.
  let quoted = false
  let fieldStart = true
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') i++
      else if (char === '"') quoted = false
    } else if (char === '"' && fieldStart) quoted = true
    else if (['\t', ';', '|', ','].includes(char)) return char
    else if (!/\s/u.test(char)) fieldStart = false
  }
  return ';'
}

function parseDelimited(text, delimiter) {
  const records = []
  const errors = []
  let fields = [], value = '', quoted = false, closed = false
  let line = 1, recordLine = 1
  const finishField = () => { fields.push(value); value = ''; closed = false }
  const finishRecord = () => {
    finishField()
    if (fields.some(field => field.trim())) records.push({ n: recordLine, fields })
    fields = []; recordLine = line + 1
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else { value += char; if (char === '\n') line++ }
    } else if (char === delimiter) finishField()
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      finishRecord(); line++
    } else if (char === '"' && !value.trim() && !closed) { value = ''; quoted = true }
    else if (closed && !/\s/u.test(char)) {
      errors.push('Рядок ' + line + ': зайвий текст після закритих лапок')
      return { records: [], errors }
    } else value += char
  }
  if (quoted) return { records: [], errors: ['Рядок ' + recordLine + ': незакриті лапки'] }
  finishRecord()
  return { records, errors }
}

function parseWords(text, scope = {}, delimiter = 'auto') {
  const rows = [], errors = []
  if (typeof text !== 'string') return { rows, errors: ['Список має бути текстом.'] }
  const t = text.replace(/^\uFEFF/u, '').trim()
  if (!t) return { rows, errors: ['Список порожній.'] }
  let items
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      items = JSON.parse(t)
      if (!Array.isArray(items)) return { rows, errors: ['JSON має бути масивом карток.'] }
      items = items.map((input, index) => ({ input, n: index + 1 }))
    } catch {
      return { rows, errors: ['JSON має неправильний формат.'] }
    }
  } else {
    const separator = delimiter === 'auto' ? detectDelimiter(t) : delimiter
    if (![';', '|', '\t', ','].includes(separator)) return { rows, errors: ['Невідомий роздільник.'] }
    const parsed = parseDelimited(t, separator)
    if (parsed.errors.length) return { rows, errors: parsed.errors }
    const aliases = {
      he: 'he', 'іврит': 'he', tr: 'tr', 'транскрипція': 'tr', ua: 'ua', 'переклад': 'ua',
      deck: 'deck', category: 'deck', 'категорія': 'deck', section: 'section', 'розділ': 'section',
    }
    const first = parsed.records[0]
    if (!first) return { rows, errors: ['Список порожній.'] }
    const header = first.fields.map(field => aliases[field.trim().toLowerCase()])
    const hasHeader = header.filter(Boolean).length >= 2
    if (hasHeader) {
      const named = header.filter(Boolean)
      if (!['he', 'tr', 'ua'].every(field => named.includes(field)) || new Set(named).size !== named.length) {
        return { rows, errors: ['Заголовок має містити he, tr, ua без повторення колонок.'] }
      }
      items = parsed.records.slice(1).map(({ n, fields }) => {
        if (fields.length !== header.length) errors.push('Рядок ' + n + ': кількість колонок не відповідає заголовку')
        const input = {}
        header.forEach((field, index) => { if (field) input[field] = fields[index] })
        if (input.section === 'null') input.section = null
        return { input, n }
      })
    } else {
      items = parsed.records.map(({ n, fields }) => {
        if (fields.length < 3 || fields.length > 5) errors.push('Рядок ' + n + ': потрібно 3–5 колонок; перевірте роздільник і лапки')
        return { input: Object.fromEntries(['he', 'tr', 'ua', 'deck', 'section'].map((field, index) => [field, fields[index]])), n }
      })
    }
  }
  for (const { input, n } of items) {
    const validated = validateWord(input, scope)
    errors.push(...validated.errors.map(error => 'Рядок ' + n + ': ' + error))
    if (validated.word) rows.push(validated.word)
  }
  if (!items.length) errors.push('Список не містить карток.')
  return { rows, errors }
}

// Зберігаємо нікуд: однакові літери можуть мати різні читання та значення.
const wordKey = (word) => JSON.stringify([
  normalizeWordText(word.deck || ''),
  normalizeWordText(word.section || ''),
  normalizeWordText(word.he || ''),
])
