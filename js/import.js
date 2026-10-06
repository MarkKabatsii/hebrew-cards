// Імпорт блоками: перед кожною спробою перевіряємо актуальну базу.
const msg = $('msg')
let existing = []
let ready = false
let busy = false
const scope = UI.bindScope($('category'), $('section'), $('sectionWrap'))

function say(text, kind) {
  msg.textContent = text
  msg.className = 'msg' + (kind ? ' is-' + kind : '')
}

function syncControls() {
  for (const id of ['check', 'doImport', 'file', 'text', 'category', 'section', 'delimiter']) {
    $(id).disabled = busy || !ready
  }
  $('reloadWords').disabled = busy
}

function showErrors(errors) {
  const ul = $('report')
  ul.textContent = ''
  errors.slice(0, 20).forEach(text => ul.appendChild(el('li', null, text)))
  if (errors.length > 20) ul.appendChild(el('li', null, '…і ще ' + (errors.length - 20)))
}

async function loadWords() {
  if (busy) return
  busy = true
  syncControls()
  try {
    if (!(await Store.requireUser())) return
    existing = await Store.all()
    ready = true
    $('reloadWords').hidden = true
    say('Список завантажено. Можна перевіряти та імпортувати слова.')
  } catch (error) {
    ready = false
    $('reloadWords').hidden = false
    say('Не вдалося завантажити слова: ' + error.message, 'error')
  } finally {
    busy = false
    syncControls()
  }
}

async function run(dryRun) {
  if (busy || !ready) return
  const text = $('text').value
  if (!text.trim()) return say('Вставте список слів або виберіть файл.', 'error')
  const { rows, errors } = parseWords(text, scope.value(), $('delimiter').value)
  showErrors(errors)
  // Не записуємо частину списку, якщо в ньому є помилки валідації.
  if (errors.length) return say('Виправте помилки перед імпортом. Помилок: ' + errors.length + '.', 'error')

  busy = true
  syncControls()
  let addedCount = 0
  let writing = false
  let refreshing = false
  try {
    existing = await Store.all()
    const have = new Set(existing.map(wordKey))
    const fresh = []
    let duplicates = 0
    for (const row of rows) {
      const key = wordKey(row)
      if (have.has(key)) duplicates++
      else { have.add(key); fresh.push(row) }
    }
    const summary = 'Нових: ' + fresh.length + ', дублікатів: ' + duplicates + '.'
    if (dryRun) return say('Перевірка. ' + summary, 'ok')
    if (!fresh.length) return say('Нічого додавати. ' + summary, 'ok')

    writing = true
    say('Імпортуємо ' + fresh.length + ' карток…')
    const result = await Store.addMany(fresh)
    addedCount = result.addedCount
    writing = false
    // Підтверджений запис не перетворюємо на «невдачу» через збій читання.
    existing.push(...fresh)
    $('text').value = ''
    refreshing = true
    existing = await Store.all()
    refreshing = false
    say('Готово. Додано: ' + addedCount + ', дублікатів пропущено: ' + duplicates + '.', 'ok')
  } catch (error) {
    if (refreshing) {
      say('Додано: ' + addedCount + '. Не вдалося оновити список: ' + error.message + '. Перед наступним імпортом список буде завантажено повторно.', 'error')
    } else if (writing) {
      say('Імпорт зупинено. Підтверджено додавання: ' + (error.addedCount ?? 0) +
        '. ' + error.message + ' Список залишено: повторний імпорт перевірить базу й пропустить наявні картки.', 'error')
    } else {
      say('Не вдалося перевірити актуальний список. Нічого не надсилали на запис. ' + error.message, 'error')
    }
  } finally {
    busy = false
    syncControls()
  }
}

$('check').addEventListener('click', () => run(true))
$('doImport').addEventListener('click', () => run(false))
$('reloadWords').addEventListener('click', loadWords)
$('file').addEventListener('change', async event => {
  if (busy || !ready) return
  const file = event.target.files[0]
  if (!file) return
  busy = true
  syncControls()
  try {
    const text = await file.text()
    $('text').value = text
    showErrors([])
    say('Файл «' + file.name + '» завантажено. Натисніть «Перевірити».')
  } catch (error) {
    say('Не вдалося прочитати файл: ' + error.message, 'error')
  } finally {
    busy = false
    syncControls()
  }
})

syncControls()
loadWords()
