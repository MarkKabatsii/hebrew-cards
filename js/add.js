// Додавання одного слова.
const form = $('form'),
  msg = $('msg')
let words = []

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
  const sc = scope.value()
  const word = {
    deck: sc.deck,
    section: sc.section,
    he: $('he').value.trim(),
    tr: $('tr').value.trim(),
    ua: $('ua').value.trim(),
  }

  if (!word.he || !word.tr || !word.ua)
    return say('Заповніть усі поля.', 'error')
  if (!HEBREW.test(word.he))
    return say('У полі «Іврит» потрібні івритські літери.', 'error')
  if (words.some((w) => wordKey(w) === wordKey(word)))
    return say('Таке слово вже є в цьому розділі.', 'error')

  try {
    await Store.add(word)
    words = await Store.all()
    say('Слово «' + word.ua + '» додано.', 'ok')
    ;['he', 'tr', 'ua'].forEach((id) => {
      $(id).value = ''
    })
    $('he').focus()
    renderList()
  } catch (err) {
    say('Не вдалося зберегти: ' + err.message, 'error')
  }
})

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.all()
    renderList()
  } catch (e) {
    say(e.message, 'error')
  }
})()
