// Сторінка додавання слів.
const form = $('form'),
  msg = $('msg')
const HEBREW = /[\u0590-\u05FF]/
let words = []

function say(text, isError) {
  msg.textContent = text
  msg.className = 'msg' + (isError ? ' is-error' : '')
}

function renderAll() {
  const list = $('deckList')
  list.textContent = ''
  ;[...new Set(words.map((w) => w.deck))].forEach((d) => {
    const o = document.createElement('option')
    o.value = d
    list.appendChild(o)
  })

  const ul = $('added')
  ul.textContent = ''
  $('addedEmpty').hidden = words.length > 0
  words
    .slice()
    .reverse()
    .forEach((w) => {
      const li = document.createElement('li')
      li.className = 'word-row'
      const he = document.createElement('span')
      he.className = 'word-he'
      he.lang = 'he'
      he.dir = 'rtl'
      he.textContent = w.he
      const text = document.createElement('span')
      text.className = 'word-text'
      text.textContent = w.tr + ' — ' + w.ua + ' (' + w.deck + ')'
      const del = document.createElement('button')
      del.className = 'btn-text'
      del.textContent = 'Видалити'
      del.addEventListener('click', async () => {
        try {
          await Store.remove(w.id)
          words = words.filter((x) => x.id !== w.id)
          renderAll()
        } catch (e) {
          say(e.message, true)
        }
      })
      li.append(he, text, del)
      ul.appendChild(li)
    })
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const word = {
    deck: $('deck').value.trim(),
    he: $('he').value.trim(),
    tr: $('tr').value.trim(),
    ua: $('ua').value.trim(),
  }
  if (!word.deck || !word.he || !word.tr || !word.ua)
    return say('Заповніть усі поля.', true)
  if (!HEBREW.test(word.he))
    return say('У полі «Іврит» потрібні івритські літери.', true)
  try {
    await Store.add(word)
    words = await Store.all()
    say('Слово «' + word.ua + '» додано в колоду «' + word.deck + '».')
    ;['he', 'tr', 'ua'].forEach((id) => {
      $(id).value = ''
    })
    $('he').focus()
    renderAll()
  } catch (err) {
    say('Не вдалося зберегти: ' + err.message, true)
  }
})
$('signout').addEventListener('click', () => Store.signOut())

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.all()
    renderAll()
  } catch (e) {
    say(e.message, true)
  }
})()
