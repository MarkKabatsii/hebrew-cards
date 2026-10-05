// Екран навчальних карток.
const state = UI.initialState()

let words = []
let queue = []
let i = 0
let flipped = false
let saving = false

const flip = $('flip')
const scene = $('scene')
const ratings = $('ratings')

function setFlipped(value) {
  flipped = value
  flip.classList.toggle('is-flipped', value)
  scene.setAttribute('aria-pressed', String(value))
  ratings.hidden = !value
}

function render() {
  const empty = queue.length === 0

  $('empty').hidden = !empty
  $('study').hidden = empty

  if (empty) {
    const hasWords = UI.inScope(words, state).length > 0

    $('empty').querySelector('h2').textContent = hasWords
      ? 'На сьогодні все повторено'
      : 'У цьому розділі ще немає слів'

    $('empty').querySelector('p').textContent = hasWords
      ? 'Наступні картки з’являться тут, коли настане час повторення.'
      : 'Додайте слова по одному або імпортуйте список.'

    return
  }

  const card = queue[i]

  $('word').textContent = card.he
  $('translit').textContent = '[ ' + card.tr + ' ]'
  $('meaning').textContent = card.ua
  $('position').textContent = 'Картка ' + (i + 1) + ' з ' + queue.length
  $('scope').textContent = state.section || state.category
  $('bar').style.width = ((i + 1) / queue.length) * 100 + '%'
  ;['again', 'hard', 'good', 'easy'].forEach((rating) => {
    $(rating + '-time').textContent = Scheduler.label(rating, card)
  })
}

function goNext() {
  setFlipped(false)
  setTimeout(render, 300)
}

function start() {
  queue = UI.inScope(words, state).filter((word) => Scheduler.isDue(word))

  i = 0
  setFlipped(false)
  render()
}

scene.addEventListener('click', () => {
  if (!saving) {
    setFlipped(!flipped)
  }
})

ratings.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-rating]')

  if (!button || saving) return

  saving = true

  ratings.querySelectorAll('button').forEach((item) => {
    item.disabled = true
  })

  const word = queue[i]
  const rating = button.dataset.rating

  try {
    await Store.rateWord(word, rating)

    queue.splice(i, 1)

    if (rating === 'again') {
      const repeatIndex = Math.min(i + 3, queue.length)
      queue.splice(repeatIndex, 0, word)
    }

    if (i >= queue.length) {
      i = 0
    }

    goNext()
  } catch (error) {
    alert('Не вдалося зберегти результат: ' + error.message)
  } finally {
    saving = false

    ratings.querySelectorAll('button').forEach((item) => {
      item.disabled = false
    })
  }
})
;(async () => {
  try {
    if (!(await Store.requireUser())) return

    words = await Store.all()
    UI.filters($('filters'), state, start)
    start()
  } catch (error) {
    $('study').hidden = true
    $('empty').hidden = false

    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'

    $('empty').querySelector('p').textContent = error.message
  }
})()
