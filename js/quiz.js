// Квіз: слово івритом і 4 варіанти перекладу.
// Правильно: варіант зеленіє, +1 до «Правильно». Неправильно: варіант червоніє,
// картка перевертається, слово позначається «до повторення».
const state = UI.initialState()
let words = [],
  pool = [],
  order = [],
  current = null
let i = 0,
  ok = 0,
  review = 0,
  picked = null,
  flipped = false

const flip = $('flip')

const shuffle = (a) => {
  const r = a.slice()
  for (let k = r.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1))
    ;[r[k], r[j]] = [r[j], r[k]]
  }
  return r
}

function setFlipped(v) {
  flipped = v
  flip.classList.toggle('is-flipped', v)
}

// Хибні варіанти: спершу з того ж розділу, потім з усієї бази; переклади не повторюються
function distractors(w) {
  const seen = new Set([w.ua])
  const out = []
  for (const x of shuffle(pool).concat(shuffle(words))) {
    if (out.length === 3) break
    if (!seen.has(x.ua)) {
      seen.add(x.ua)
      out.push(x)
    }
  }
  return out
}

function show(name) {
  ;['quiz', 'result', 'empty'].forEach((id) => {
    $(id).hidden = id !== name
  })
}

function updateScore() {
  $('ok').textContent = ok
  $('review').textContent = review
  $('bar').style.width =
    ((i + (picked !== null ? 1 : 0)) / Math.max(order.length, 1)) * 100 + '%'
}

function render() {
  if (words.length < 4 || pool.length === 0) {
    $('empty').querySelector('h2').textContent =
      words.length < 4
        ? 'Потрібно щонайменше 4 слова'
        : 'У цьому розділі ще немає слів'
    return show('empty')
  }
  if (i >= order.length) {
    $('score').textContent = ok + ' з ' + order.length
    return show('result')
  }
  show('quiz')

  const w = order[i]
  current = { word: w, options: shuffle([w].concat(distractors(w))) }
  $('word').textContent = w.he
  $('translit').textContent = '[ ' + w.tr + ' ]'
  $('meaning').textContent = w.ua
  $('position').textContent = 'Питання ' + (i + 1) + ' з ' + order.length
  $('next').hidden = true

  const box = $('options')
  box.textContent = ''
  current.options.forEach((o, k) => {
    const b = el('button', 'option', o.ua)
    b.addEventListener('click', () => choose(k))
    box.appendChild(b)
  })
  updateScore()
}

function choose(k) {
  if (picked !== null) return
  picked = k
  const right = current.options[k].id === current.word.id

  Array.from($('options').children).forEach((b, idx) => {
    b.disabled = true
    if (idx === k) b.classList.add(right ? 'is-correct' : 'is-wrong')
    else b.classList.add('is-dim')
  })

  if (right) {
    ok++
  } else {
    review++
    setFlipped(true)
    Store.markReview(current.word.id, true).catch(() => {})
  }
  $('next').hidden = false
  updateScore()
}

function advance() {
  i++
  picked = null
  render()
}

function start() {
  pool = UI.inScope(words, state)
  order = shuffle(pool)
  i = 0
  ok = 0
  review = 0
  picked = null
  setFlipped(false)
  render()
}

$('next').addEventListener('click', () => {
  $('next').hidden = true
  if (flipped) {
    setFlipped(false)
    setTimeout(advance, 300)
  } else {
    advance()
  }
})
$('again').addEventListener('click', start)

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.all()
    UI.filters($('filters'), state, start)
    start()
  } catch (e) {
    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'
    $('empty').querySelector('p').textContent = e.message
    show('empty')
  }
})()
