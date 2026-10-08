// Приклади завантажуються один раз для списку, а не під час перевертання.
const WordExamples = {
  approved(rows) {
    if (!Array.isArray(rows)) return []
    const orders = new Set()
    return rows
      .filter(row => row && row.status === 'approved' &&
        [1, 2].includes(row.example_order) &&
        ['sentence_he', 'transcription_uk', 'translation_uk'].every(
          field => typeof row[field] === 'string' && row[field].trim(),
        ))
      .sort((a, b) => a.example_order - b.example_order)
      .filter(row => {
        if (orders.has(row.example_order)) return false
        orders.add(row.example_order)
        return true
      })
      .slice(0, 2)
  },

  render(host, rows) {
    host.textContent = ''
    const examples = this.approved(rows)
    host.hidden = !examples.length
    if (!examples.length) return
    host.appendChild(el('h3', 'examples-title', 'Приклади'))
    const sentence = row => {
      const item = el('div', 'example')
      for (const [field, className, lang, dir] of [
        ['sentence_he', 'example-he', 'he', 'rtl'],
        ['transcription_uk', 'example-transcription', 'uk', 'ltr'],
        ['translation_uk', 'example-translation', 'uk', 'ltr'],
      ]) {
        const text = el('p', className, row[field])
        text.lang = lang
        text.dir = dir
        item.appendChild(text)
      }
      return item
    }
    host.appendChild(sentence(examples[0]))
    if (examples.length === 2) {
      const more = el('details', 'example-more')
      more.append(el('summary', 'btn-text', 'Ще один приклад'), sentence(examples[1]))
      host.appendChild(more)
    }
  },
}
