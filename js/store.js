// Робота з базою даних Supabase і сесією користувача.
if (SUPABASE_URL.startsWith('YOUR_')) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="margin:0;padding:12px;background:#c4271c;color:#fff;text-align:center">Вкажіть SUPABASE_URL і SUPABASE_ANON_KEY у js/config.js</p>',
  )
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const ROOT = document.body.dataset.root || ''
const PAGE_SIZE = 1000

const Store = {
  async user() {
    const { data } = await db.auth.getSession()
    return data.session ? data.session.user : null
  },

  async requireUser() {
    const user = await this.user()

    if (!user) {
      location.href = ROOT + 'pages/login.html'
    }

    return user
  },

  async all() {
    let result = []

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from('words')
        .select('*')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)

      if (error) throw error

      result = result.concat(data)

      if (data.length < PAGE_SIZE) {
        return result
      }
    }
  },

  async add(word) {
    const { data, error } = await db.from('words').insert(word).select('*').single()

    if (error) throw error
    if (!data) throw new Error('Сервер не підтвердив додавання картки. Оновіть список.')
    return data
  },

  async addMany(rows) {
    let addedCount = 0
    for (let index = 0; index < rows.length; index += 200) {
      const batch = rows.slice(index, index + 200)
      try {
        const { data, error } = await db.from('words').insert(batch).select('id')
        if (error) throw error
        if (!Array.isArray(data) || data.length !== batch.length) {
          throw new Error('Сервер не підтвердив весь блок. Перевірте список перед повтором.')
        }
        addedCount += data.length
      } catch (error) {
        const failure = new Error(error.message || 'Не вдалося записати блок карток.')
        failure.addedCount = addedCount
        throw failure
      }
    }
    return { addedCount }
  },

  async remove(id) {
    const { error } = await db.from('words').delete().eq('id', id)

    if (error) throw error
  },

  async markReview(id, flag) {
    const { error } = await db
      .from('words')
      .update({ needs_review: flag })
      .eq('id', id)

    if (error) throw error
  },

  async rateWord(word, rating) {
    const changes = Scheduler.result(word, rating)

    // Записуємо лише якщо прогрес не змінила інша вкладка/пристрій.
    let query = db
      .from('words')
      .update(changes)
      .eq('id', word.id)
      .eq('review_level', word.review_level ?? 0)
      .eq('correct_streak', word.correct_streak ?? 0)
      .eq('lapses', word.lapses ?? 0)

    query = word.last_reviewed_at == null
      ? query.is('last_reviewed_at', null)
      : query.eq('last_reviewed_at', word.last_reviewed_at)

    const { data, error } = await query
      .select(
        'id, review_level, due_at, last_reviewed_at, correct_streak, lapses, needs_review',
      )
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Картку вже змінено, видалено або вона недоступна. Оновіть сторінку.')
      }
      throw error
    }
    if (!data || data.id !== word.id) {
      throw new Error('Картку не знайдено або вона більше недоступна. Оновіть сторінку.')
    }

    Object.assign(word, data)
    return data
  },

  async signOut() {
    await db.auth.signOut()
    location.href = ROOT + 'pages/login.html'
  },
}
