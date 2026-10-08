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
let saving = false
let transitioning = false
let answerSaved = false
let session = 0
let transitionTimer = null

const flip = $('flip')
const status = $('quiz-status')

function say(text, error = false) {
  status.textContent = text
  status.classList.toggle('is-error', error)
}

function syncControls() {
  const busy = saving || transitioning
  UI.setFiltersDisabled($('filters'), busy)
  Array.from($('options').children).forEach((button) => {
    button.disabled = busy || picked !== null
  })
  $('next').disabled = busy || !answerSaved
  $('retry-save').disabled = busy
}

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
  UI.setCardFlipped(value)
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
    ((i + (answerSaved ? 1 : 0)) / Math.max(order.length, 1)) * 100 + '%'
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
  $('retry-save').hidden = true
  say('')

  const options = $('options')
  options.textContent = ''

  current.options.forEach((option, index) => {
    const button = el('button', 'option', option.ua)
    button.addEventListener('click', () => choose(index))
    options.appendChild(button)
  })

  updateScore()
  syncControls()
}

function choose(index) {
  if (picked !== null || saving || transitioning || !current) return

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

  if (!right) setFlipped(true)
  return saveAnswer()
}

async function saveAnswer() {
  if (saving || transitioning || answerSaved || picked === null || !current) return

  const activeSession = session
  const question = current
  const right = question.options[picked].id === question.word.id
  saving = true
  $('retry-save').hidden = true
  say('Зберігаємо результат…')
  syncControls()

  try {
    await Store.rateWord(question.word, right ? 'good' : 'again')
    if (activeSession !== session || question !== current) return

    answerSaved = true
    if (right) ok++
    else review++

    say('Результат збережено.')
    $('next').hidden = false
    updateScore()
  } catch (error) {
    if (activeSession === session && question === current) {
      say('Не вдалося зберегти результат. ' + error.message, true)
      $('retry-save').hidden = false
    }
  } finally {
    saving = false
    syncControls()
  }
}

function advance() {
  i++
  picked = null
  answerSaved = false
  render()
}

function start() {
  session++
  clearTimeout(transitionTimer)
  transitionTimer = null
  transitioning = false
  current = null
  answerSaved = false
  $('next').hidden = true
  $('retry-save').hidden = true
  say('')
  pool = UI.inScope(words, state)
  order = shuffle(pool)

  i = 0
  ok = 0
  review = 0
  picked = null

  setFlipped(false)
  render()
  syncControls()
}

$('next').addEventListener('click', () => {
  if (saving || transitioning || !answerSaved) return
  $('next').hidden = true

  if (flipped) {
    setFlipped(false)
    const activeSession = session
    transitioning = true
    syncControls()
    transitionTimer = setTimeout(() => {
      if (activeSession !== session) return
      transitionTimer = null
      transitioning = false
      advance()
      syncControls()
    }, 300)
  } else {
    advance()
  }
})

$('retry-save').addEventListener('click', saveAnswer)
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
