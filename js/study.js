// Екран навчальних карток.
const state = UI.initialState()

let words = []
let queue = []
let i = 0
let flipped = false
let saving = false
let transitioning = false
let session = 0
let transitionTimer = null
let dueTimer = null

function scheduleNextReview(scopedWords) {
  clearTimeout(dueTimer)
  dueTimer = null
  const now = Date.now()
  const dates = scopedWords
    .map(word => new Date(word.due_at).getTime())
    .filter(date => Number.isFinite(date) && date > now)
  if (!dates.length) return null
  const next = Math.min(...dates)
  // Обмеження setTimeout: далекі повторення перевіряємо пізніше.
  dueTimer = setTimeout(() => {
    dueTimer = null
    if (!queue.length && !saving && !transitioning) start()
  }, Math.min(next - now, 2147483647))
  return new Date(next)
}

const flip = $('flip')
const scene = $('scene')
const ratings = $('ratings')
const status = $('study-status')

function say(text, error = false) {
  status.textContent = text
  status.classList.toggle('is-error', error)
}

function syncControls() {
  const busy = saving || transitioning
  scene.disabled = busy || !queue.length
  ratings.querySelectorAll('button').forEach((button) => {
    button.disabled = busy
  })
  UI.setFiltersDisabled($('filters'), busy)
}

function setFlipped(value) {
  flipped = value
  flip.classList.toggle('is-flipped', value)
  UI.setCardFlipped(value)
  scene.setAttribute('aria-pressed', String(value))
  ratings.hidden = !value
}

function render() {
  const empty = queue.length === 0

  $('empty').hidden = !empty
  $('study').hidden = empty

  if (empty) {
    const scopedWords = UI.inScope(words, state)
    const hasWords = scopedWords.length > 0
    const nextReview = scheduleNextReview(scopedWords)

    $('empty').querySelector('h2').textContent = hasWords
      ? 'На сьогодні все повторено'
      : 'У цьому розділі ще немає слів'

    $('empty').querySelector('p').textContent = hasWords
      ? nextReview
        ? 'Найближче повторення: ' + nextReview.toLocaleString('uk-UA', {
            day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }) + '. «1 день» — це 24 години від оцінювання. Картки з’являться автоматично.'
        : 'Наступні картки з’являться тут, коли настане час повторення.'
      : 'Додайте слова по одному або імпортуйте список.'

    return
  }

  const card = queue[i]

  $('word').textContent = card.he
  $('translit').textContent = '[ ' + card.tr + ' ]'
  $('meaning').textContent = card.ua
  WordExamples.render($('examples'), card.examples)
  $('position').textContent = 'Картка ' + (i + 1) + ' з ' + queue.length
  $('scope').textContent = state.section || state.category
  $('bar').style.width = ((i + 1) / queue.length) * 100 + '%'
  ;['again', 'hard', 'good', 'easy'].forEach((rating) => {
    $(rating + '-time').textContent = Scheduler.label(rating, card)
  })
}

function goNext() {
  const activeSession = session
  transitioning = true
  setFlipped(false)
  syncControls()
  transitionTimer = setTimeout(() => {
    if (activeSession !== session) return
    transitionTimer = null
    render()
    transitioning = false
    syncControls()
  }, 300)
}

function start() {
  session++
  clearTimeout(transitionTimer)
  clearTimeout(dueTimer)
  dueTimer = null
  transitionTimer = null
  transitioning = false
  say('')
  queue = UI.inScope(words, state).filter((word) => Scheduler.isDue(word))

  i = 0
  setFlipped(false)
  render()
  syncControls()
}

scene.addEventListener('click', () => {
  if (!saving && !transitioning && queue.length) {
    setFlipped(!flipped)
  }
})
$('card-back').addEventListener('keydown', (event) => {
  if (event.target !== $('card-back') || !['Enter', ' '].includes(event.key)) return
  event.preventDefault()
  if (!saving && !transitioning && queue.length) setFlipped(false)
})
flip.addEventListener('click', (event) => {
  // Кнопки та розгортання прикладу мають власну дію.
  if (event.target.closest('button, summary, a, input, select, textarea')) return
  if (!saving && !transitioning && queue.length) setFlipped(!flipped)
})

ratings.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-rating]')

  if (!button || saving || transitioning || !flipped || !queue.length) return

  saving = true
  syncControls()
  say('Зберігаємо результат…')

  const word = queue[i]
  const rating = button.dataset.rating
  const activeSession = session

  try {
    await Store.rateWord(word, rating)
    if (activeSession !== session) return

    queue.splice(i, 1)

    if (rating === 'again') {
      const repeatIndex = Math.min(i + 3, queue.length)
      queue.splice(repeatIndex, 0, word)
    }

    if (i >= queue.length) {
      i = 0
    }

    say('Результат збережено.')
    goNext()
  } catch (error) {
    if (activeSession === session) {
      say(
        'Не вдалося зберегти результат. ' + error.message +
          ' За помилки з’єднання натисніть оцінку ще раз.',
        true,
      )
    }
  } finally {
    saving = false
    syncControls()
  }
})
// Браузер може призупиняти таймери у фоновій вкладці.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !queue.length && !saving && !transitioning) start()
})
;(async () => {
  try {
    if (!(await Store.requireUser())) return

    const loaded = await Store.withExamples()
    words = loaded.words
    $('examples-status').textContent = loaded.examplesUnavailable
      ? 'Приклади тимчасово недоступні. Можна продовжувати навчання.' : ''
    UI.filters($('filters'), state, start)
    start()
  } catch (error) {
    $('study').hidden = true
    $('empty').hidden = false

    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'

    $('empty').querySelector('p').textContent = error.message
  }
})()
