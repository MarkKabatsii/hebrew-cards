// Екран «Колоди»: кількість слів у категоріях і слова «до повторення».
;(async () => {
  try {
    if (!(await Store.requireUser())) return
    const words = await Store.all()

    const stats = [
      [words.length, 'слів усього'],
      [words.filter((w) => w.needs_review).length, 'до повторення'],
    ]
    stats.forEach(([value, label]) => {
      const s = el('div', 'stat')
      s.append(
        el('div', 'stat-value', String(value)),
        el('div', 'stat-label', label),
      )
      $('stats').appendChild(s)
    })

    CATEGORIES.forEach((c) => {
      const mine = words.filter((w) => w.deck === c.name)
      const review = mine.filter((w) => w.needs_review).length

      const a = el('a', 'deck')
      a.href = ROOT + 'index.html?c=' + encodeURIComponent(c.name)

      const top = el('div', 'deck-top')
      const he = el('span', 'deck-he', c.he)
      he.lang = 'he'
      he.dir = 'rtl'
      top.append(he, el('span', 'deck-count', mine.length + ' слів'))

      a.append(top, el('div', 'deck-name', c.name))
      if (c.sections.length)
        a.appendChild(el('div', 'deck-sub', c.sections.join(', ')))
      if (review)
        a.appendChild(el('div', 'deck-review', 'До повторення: ' + review))
      $('decks').appendChild(a)
    })
  } catch (e) {
    $('stats').textContent = e.message
  }
})()
