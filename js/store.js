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
    const { error } = await db.from('words').insert(word)

    if (error) throw error
  },

  async addMany(rows) {
    for (let index = 0; index < rows.length; index += 200) {
      const { error } = await db
        .from('words')
        .insert(rows.slice(index, index + 200))

      if (error) throw error
    }
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

    const { error } = await db.from('words').update(changes).eq('id', word.id)

    if (error) throw error

    Object.assign(word, changes)
    return changes
  },

  async signOut() {
    await db.auth.signOut()
    location.href = ROOT + 'pages/login.html'
  },
}
