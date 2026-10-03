// Розбір списку слів для імпорту (без доступу до сторінки, тому легко тестується).
// Формати: рядки «іврит;транскрипція;переклад[;категорія[;розділ]]» (роздільник ; | або Tab)
// або JSON-масив об'єктів {he, tr, ua, deck?, section?}.
const HEBREW = /[\u0590-\u05FF]/

function parseWords(text, scope) {
  const errors = []
  const rows = []
  const t = text.trim()
  let items = []

  if (t.startsWith('[')) {
    try {
      items = JSON.parse(t).map((o, k) => ({
        n: k + 1,
        he: o.he,
        tr: o.tr,
        ua: o.ua,
        deck: o.deck || o.category,
        section: o.section,
      }))
    } catch {
      return { rows, errors: ['JSON має неправильний формат.'] }
    }
  } else {
    t.split(/\r?\n/).forEach((line, k) => {
      if (!line.trim()) return
      const p = line.split(/\t|;|\|/).map((s) => s.trim())
      items.push({
        n: k + 1,
        he: p[0],
        tr: p[1],
        ua: p[2],
        deck: p[3],
        section: p[4],
      })
    })
  }

  for (const it of items) {
    const bad = (m) => errors.push('Рядок ' + it.n + ': ' + m)
    let deck = it.deck
    let section = it.section || null
    if (!deck) {
      deck = scope.deck
      section = section || scope.section
    }
    const cat = findCategory(deck)

    if (!it.he || !it.tr || !it.ua) {
      bad('потрібні іврит, транскрипція і переклад')
      continue
    }
    if (!HEBREW.test(it.he)) {
      bad('у першій колонці немає івритських літер')
      continue
    }
    if (!cat) {
      bad('невідома категорія «' + deck + '»')
      continue
    }
    if (cat.sections.length) {
      if (!section) {
        bad('для категорії «' + deck + '» потрібен розділ')
        continue
      }
      if (!cat.sections.includes(section)) {
        bad('розділ «' + section + '» не підходить до «' + deck + '»')
        continue
      }
    } else if (section) {
      bad('у категорії «' + deck + '» немає розділів')
      continue
    }
    rows.push({ deck, section, he: it.he, tr: it.tr, ua: it.ua })
  }
  return { rows, errors }
}

const wordKey = (w) => [w.deck, w.section || '', w.he].join('|')
