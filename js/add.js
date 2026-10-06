// Додавання одного слова.
const form = $('form'),
  msg = $('msg')
let words = []
let ready = false
let saving = false

function syncControls() {
  form.querySelectorAll('input, select, button').forEach((control) => {
    control.disabled = saving || !ready
  })
}

const scope = UI.bindScope(
  $('category'),
  $('section'),
  $('sectionWrap'),
  renderList,
)

function say(text, kind) {
  msg.textContent = text
  msg.className = 'msg' + (kind ? ' is-' + kind : '')
}

function renderList() {
  const sc = scope.value()
  const list = words
    .filter((w) => w.deck === sc.deck && (w.section || null) === sc.section)
    .reverse()

  const ul = $('added')
  ul.textContent = ''
  $('addedEmpty').hidden = list.length > 0
  $('listTitle').textContent =
    'Слова: ' + (sc.section || sc.deck) + ' (' + list.length + ')'

  list.forEach((w) => {
    const li = el('li', 'word-row')
    const he = el('span', 'word-he', w.he)
    he.lang = 'he'
    he.dir = 'rtl'
    const del = el('button', 'btn-text', 'Видалити')
    del.addEventListener('click', async () => {
      try {
        await Store.remove(w.id)
        words = words.filter((x) => x.id !== w.id)
        renderList()
      } catch (e) {
        say(e.message, 'error')
      }
    })
    li.append(he, el('span', 'word-text', w.tr + ' — ' + w.ua), del)
    ul.appendChild(li)
  })
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  if (saving || !ready) return
  const sc = scope.value()
  const { word, errors } = validateWord({
    deck: sc.deck,
    section: sc.section,
    he: $('he').value.trim(),
    tr: $('tr').value.trim(),
    ua: $('ua').value.trim(),
  }, sc)

  if (errors.length) return say(errors.join('. '), 'error')

  saving = true
  syncControls()
  try {
    words = await Store.all()
    if (words.some((w) => wordKey(w) === wordKey(word))) {
      renderList()
      return say('Таке слово вже є в цьому розділі.', 'error')
    }
    const added = await Store.add(word)
    words.push(added)
    say('Слово «' + word.ua + '» додано.', 'ok')
    ;['he', 'tr', 'ua'].forEach((id) => {
      $(id).value = ''
    })
    renderList()
  } catch (err) {
    say(err.code === '23505'
      ? 'Таке слово вже додано. Оновіть список.'
      : 'Не вдалося підтвердити додавання: ' + err.message, 'error')
  } finally {
    saving = false
    syncControls()
    $('he').focus()
  }
})

syncControls()
;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.all()
    ready = true
    renderList()
  } catch (e) {
    say('Не вдалося завантажити слова. Оновіть сторінку. ' + e.message, 'error')
  } finally {
    syncControls()
  }
})()
