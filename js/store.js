// Робота з базою даних Supabase і сесією користувача.
// Вимагає: supabase-js (CDN), config.js, taxonomy.js.
if (SUPABASE_URL.startsWith('YOUR_')) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="margin:0;padding:12px;background:#c4271c;color:#fff;text-align:center">Вкажіть SUPABASE_URL і SUPABASE_ANON_KEY у js/config.js</p>',
  )
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const ROOT = document.body.dataset.root || ''
const PAGE_SIZE = 1000 // ліміт Supabase на один запит

const Store = {
  async user() {
    const { data } = await db.auth.getSession()
    return data.session ? data.session.user : null
  },
  async requireUser() {
    const u = await this.user()
    if (!u) location.href = ROOT + 'pages/login.html'
    return u
  },
  // Усі слова користувача (з посторінковим завантаженням, якщо їх понад 1000)
  async all() {
    let out = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from('words')
        .select('*')
        .order('id')
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      out = out.concat(data)
      if (data.length < PAGE_SIZE) return out
    }
  },
  async add(word) {
    const { error } = await db.from('words').insert(word)
    if (error) throw error
  },
  async addMany(rows) {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from('words').insert(rows.slice(i, i + 200))
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
  async signOut() {
    await db.auth.signOut()
    location.href = ROOT + 'pages/login.html'
  },
}
