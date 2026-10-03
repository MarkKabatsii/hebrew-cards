// Екран карток: торкніться картки, щоб перевернути; кнопки «Попередня» / «Наступна».
const state = UI.initialState()
let words = [],
  queue = [],
  i = 0,
  flipped = false

const flip = $('flip'),
  scene = $('scene'),
  prev = $('prev'),
  next = $('next')

function setFlipped(v) {
  flipped = v
  flip.classList.toggle('is-flipped', v)
  scene.setAttribute('aria-pressed', String(v))
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
  $('scope').textContent = state.section || state.category
  $('bar').style.width = ((i + 1) / queue.length) * 100 + '%'
  prev.disabled = i === 0
}

// Якщо картка перевернута, спершу повертаємо її, а слово міняємо посередині повороту
function go(j) {
  if (flipped) {
    setFlipped(false)
    setTimeout(() => {
      i = j
      render()
    }, 300)
  } else {
    i = j
    render()
  }
}

function start() {
  queue = UI.inScope(words, state)
  i = 0
  setFlipped(false)
  render()
}

scene.addEventListener('click', () => setFlipped(!flipped))
prev.addEventListener('click', () => {
  if (i > 0) go(i - 1)
})
next.addEventListener('click', () => go((i + 1) % queue.length))
document.addEventListener('keydown', (e) => {
  if (queue.length === 0) return
  if (e.key === 'ArrowRight') next.click()
  if (e.key === 'ArrowLeft') prev.click()
})

;(async () => {
  try {
    if (!(await Store.requireUser())) return
    words = await Store.all()
    UI.filters($('filters'), state, start)
    start()
  } catch (e) {
    $('study').hidden = true
    $('empty').hidden = false
    $('empty').querySelector('h2').textContent = 'Не вдалося завантажити слова'
    $('empty').querySelector('p').textContent = e.message
  }
})()
