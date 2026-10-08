// Простий планувальник інтервальних повторень.
const Scheduler = (() => {
  const GOOD_INTERVALS = [10 / 1440, 1, 3, 7, 14, 30, 60, 120]

  const clampLevel = (level) =>
    Math.max(0, Math.min(Number(level) || 0, GOOD_INTERVALS.length - 1))

  function daysFor(rating, level) {
    const currentLevel = clampLevel(level)

    if (rating === 'again') {
      return GOOD_INTERVALS[0]
    }

    if (rating === 'hard') {
      return Math.max(1, GOOD_INTERVALS[currentLevel] * 0.5)
    }

    const nextLevel = clampLevel(currentLevel + (rating === 'easy' ? 2 : 1))

    return GOOD_INTERVALS[nextLevel] * (rating === 'easy' ? 1.5 : 1)
  }

  function result(word, rating, now = new Date()) {
    const currentLevel = clampLevel(word.review_level)

    const nextLevel =
      rating === 'again'
        ? 0
        : clampLevel(
            currentLevel + (rating === 'easy' ? 2 : rating === 'good' ? 1 : 0),
          )

    const due = new Date(
      now.getTime() + daysFor(rating, currentLevel) * 86400000,
    )

    return {
      review_level: nextLevel,
      due_at: due.toISOString(),
      last_reviewed_at: now.toISOString(),
      correct_streak: rating === 'again' ? 0 : (word.correct_streak || 0) + 1,
      lapses: (word.lapses || 0) + (rating === 'again' ? 1 : 0),
      needs_review: rating === 'again',
    }
  }

  function isDue(word, now = new Date()) {
    return !word.due_at || new Date(word.due_at) <= now
  }

  function label(rating, word) {
    const days = daysFor(rating, word.review_level)

    if (days < 1) return '10 хв'
    if (days === 1) return '1 день'

    return days.toLocaleString('uk-UA', { maximumFractionDigits: 2 }) + ' дн.'
  }

  return {
    result,
    isDue,
    label,
  }
})()
