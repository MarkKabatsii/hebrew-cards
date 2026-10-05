// Квіз: слово івритом і 4 варіанти перекладу.
const state = UI.initialState()

let words = []
let pool = []
let order = []
let current = null

let i = 0
let ok = 0
let review = 0
let picked = null
let flipped = false

const flip = $('flip')

const shuffle = (items) => {
  const result = items.slice()

  for (let index = result.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[randomIndex]] = [result[randomIndex], result[index]]
  }

  return result
}

function setFlipped(value) {
  flipped = value
  flip.classList.toggle('is-flipped', value)
}

function distractors(word) {
  const seen = new Set([word.ua])
  const result = []

  for (const candidate of shuffle(pool).concat(shuffle(words))) {
    if (result.length === 3) break

    if (!seen.has(candidate.ua)) {
      seen.add(candidate.ua)
      result.push(candidate)
    }
  }

  return result
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

    show('empty')
    return
  }

  if (i >= order.length) {
    $('score').textContent = ok + ' з ' + order.length
    show('result')
    return
  }

  show('quiz')

  const word = order[i]

  current = {
    word,
    options: shuffle([word].concat(distractors(word))),
  }

  $('word').textContent = word.he
  $('translit').textContent = '[ ' + word.tr + ' ]'
  $('meaning').textContent = word.ua
  $('position').textContent = 'Питання ' + (i + 1) + ' з ' + order.length
  $('next').hidden = true

  const options = $('options')
  options.textContent = ''

  current.options.forEach((option, index) => {
    const button = el('button', 'option', option.ua)
    button.addEventListener('click', () => choose(index))
    options.appendChild(button)
  })

  updateScore()
}

function choose(index) {
  if (picked !== null) return

  picked = index
  const right = current.options[index].id === current.word.id

  Array.from($('options').children).forEach((button, optionIndex) => {
    button.disabled = true

    if (optionIndex === index) {
      button.classList.add(right ? 'is-correct' : 'is-wrong')
    } else {
      button.classList.add('is-dim')
    }
  })

  if (right) {
    ok++
    Store.rateWord(current.word, 'good').catch(() => {})
  } else {
    review++
    setFlipped(true)
    Store.rateWord(current.word, 'again').catch(() => {})
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
  } catch (error) {
    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'
    $('empty').querySelector('p').textContent = error.message
    show('empty')
  }
})()
