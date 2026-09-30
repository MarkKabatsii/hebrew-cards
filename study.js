// Екран навчання.
let words = [],
  deck = null,
  queue = [],
  i = 0
const card = $('card'),
  reveal = $('reveal'),
  ratings = $('ratings')

const deckNames = () => [...new Set(words.map((w) => w.deck))]

function renderChips() {
  const box = $('chips')
  box.textContent = ''
  deckNames().forEach((name) => {
    const b = document.createElement('button')
    b.className = 'chip'
    b.textContent = name
    b.setAttribute('aria-pressed', String(name === deck))
    b.addEventListener('click', () => {
      deck = name
      start()
    })
    box.appendChild(b)
  })
}

function start() {
  queue = words.filter((w) => w.deck === deck)
  i = 0
  renderChips()
  render()
}

function render() {
  const empty = queue.length === 0
  $('empty').hidden = !empty
  $('study').hidden = empty
  if (empty) return
  const c = queue[i]
  $('word').textContent = c.he
  $('translit').textContent = '[ ' + c.tr + ' ]'
  $('meaning').textContent = c.ua
  $('position').textContent = 'Картка ' + (i + 1) + ' з ' + queue.length
  $('deckName').textContent = deck
  $('bar').style.width = ((i + 1) / queue.length) * 100 + '%'
  card.classList.add('is-hidden')
  reveal.hidden = false
  ratings.hidden = true
}

reveal.addEventListener('click', () => {
  card.classList.remove('is-hidden')
  reveal.hidden = true
  ratings.hidden = false
})
ratings.querySelectorAll('.rating').forEach((btn) =>
  btn.addEventListener('click', () => {
    i = (i + 1) % queue.length
    render()
  }),
)
$('signout').addEventListener('click', () => Store.signOut())

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.seed()
    deck = deckNames()[0] || null
    start()
  } catch (e) {
    $('empty').hidden = false
    $('study').hidden = true
    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'
    $('empty').querySelector('p').textContent = e.message
  }
})()
