// Спільні елементи інтерфейсу: меню, вибір розділів, допоміжні функції.
const $ = (id) => document.getElementById(id)
const el = (tag, cls, text) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text != null) e.textContent = text
  return e
}

const UI = {
  nav() {
    const host = $('nav')
    if (!host) return
    const page = document.body.dataset.page
    const pages = [
      ['study', 'Картки', 'index.html'],
      ['quiz', 'Квіз', 'pages/quiz.html'],
      ['decks', 'Колоди', 'pages/decks.html'],
      ['add', 'Додати', 'pages/add.html'],
    ]

    const logo = el('a', 'logo')
    logo.href = ROOT + 'index.html'
    const mark = el('span', 'logo-mark', 'א')
    mark.lang = 'he'
    logo.append(mark, el('span', null, 'Іврит'))

    const links = el('div', 'nav-links')
    pages.forEach(([id, label, href]) => {
      const a = el('a', null, label)
      a.href = ROOT + href
      if (id === page) a.setAttribute('aria-current', 'page')
      links.appendChild(a)
    })

    const out = el('button', 'btn-text', 'Вийти')
    out.addEventListener('click', () => Store.signOut())

    host.className = 'nav'
    host.append(logo, links, out)
  },

  // Початковий вибір: перша категорія або ?c=Категорія&s=Розділ з адреси
  initialState() {
    const q = new URLSearchParams(location.search)
    const cat = findCategory(q.get('c')) || CATEGORIES[0]
    const s = q.get('s')
    return {
      category: cat.name,
      section: cat.sections.includes(s) ? s : cat.sections[0] || null,
    }
  },

  inScope(words, state) {
    return words.filter(
      (w) =>
        w.deck === state.category &&
        (!state.section || w.section === state.section),
    )
  },

  // Малює чипи категорій і (за потреби) перемикач розділів
  filters(box, state, onChange) {
    box.textContent = ''

    const chips = el('div', 'chips')
    chips.setAttribute('role', 'group')
    chips.setAttribute('aria-label', 'Категорії')
    CATEGORIES.forEach((c) => {
      const b = el('button', 'chip', c.name)
      b.setAttribute('aria-pressed', String(c.name === state.category))
      b.addEventListener('click', () => {
        state.category = c.name
        state.section = c.sections[0] || null
        UI.filters(box, state, onChange)
        onChange()
      })
      chips.appendChild(b)
    })
    box.appendChild(chips)

    const cat = findCategory(state.category)
    if (cat.sections.length) {
      const seg = el('div', 'segmented')
      seg.setAttribute('role', 'group')
      seg.setAttribute('aria-label', 'Розділи: ' + cat.name)
      cat.sections.forEach((s) => {
        const b = el('button', 'seg', s)
        b.setAttribute('aria-pressed', String(s === state.section))
        b.addEventListener('click', () => {
          state.section = s
          UI.filters(box, state, onChange)
          onChange()
        })
        seg.appendChild(b)
      })
      box.appendChild(seg)
    }
  },

  // Випадаючі списки «категорія» та «розділ» для форм
  bindScope(catSel, secSel, secWrap, onChange) {
    CATEGORIES.forEach((c) => catSel.append(new Option(c.name, c.name)))
    const sync = () => {
      const cat = findCategory(catSel.value)
      secSel.textContent = ''
      cat.sections.forEach((s) => secSel.append(new Option(s, s)))
      secWrap.hidden = !cat.sections.length
    }
    catSel.addEventListener('change', () => {
      sync()
      if (onChange) onChange()
    })
    secSel.addEventListener('change', () => {
      if (onChange) onChange()
    })
    sync()
    return {
      value: () => ({ deck: catSel.value, section: secSel.value || null }),
    }
  },
}

UI.nav()
