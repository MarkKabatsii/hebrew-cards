// Масовий імпорт слів: вставте список або завантажте файл (.txt, .csv, .json).
const msg = $('msg')
let existing = []

const scope = UI.bindScope($('category'), $('section'), $('sectionWrap'))

function say(text, kind) {
  msg.textContent = text
  msg.className = 'msg' + (kind ? ' is-' + kind : '')
}

function showErrors(errors) {
  const ul = $('report')
  ul.textContent = ''
  errors.slice(0, 20).forEach((t) => ul.appendChild(el('li', null, t)))
  if (errors.length > 20)
    ul.appendChild(el('li', null, '…і ще ' + (errors.length - 20)))
}

// dryRun = true лише перевіряє, нічого не записуючи
async function run(dryRun) {
  const text = $('text').value
  if (!text.trim())
    return say('Вставте список слів або виберіть файл.', 'error')

  const { rows, errors } = parseWords(text, scope.value())
  const have = new Set(existing.map(wordKey))
  const fresh = []
  let dup = 0
  for (const r of rows) {
    const k = wordKey(r)
    if (have.has(k)) {
      dup++
      continue
    }
    have.add(k)
    fresh.push(r)
  }
  showErrors(errors)

  const summary =
    'Нових: ' +
    fresh.length +
    ', дублікатів: ' +
    dup +
    ', помилок: ' +
    errors.length +
    '.'
  if (dryRun)
    return say('Перевірка. ' + summary, errors.length ? 'error' : 'ok')
  if (!fresh.length) return say('Нічого додавати. ' + summary, 'error')

  $('doImport').disabled = true
  try {
    await Store.addMany(fresh)
    existing = await Store.all()
    say(
      'Готово. Додано: ' +
        fresh.length +
        ', дублікатів пропущено: ' +
        dup +
        ', помилок: ' +
        errors.length +
        '.',
      'ok',
    )
    if (!errors.length) $('text').value = ''
  } catch (e) {
    say('Не вдалося зберегти: ' + e.message, 'error')
  } finally {
    $('doImport').disabled = false
  }
}

$('check').addEventListener('click', () => run(true))
$('doImport').addEventListener('click', () => run(false))
$('file').addEventListener('change', async (e) => {
  const f = e.target.files[0]
  if (f) {
    $('text').value = await f.text()
    say('Файл «' + f.name + '» завантажено. Натисніть «Перевірити».')
  }
})

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    existing = await Store.all()
  } catch (e) {
    say(e.message, 'error')
  }
})()
