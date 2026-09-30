// Сховище на Supabase (Postgres). words.js використовується лише як стартовий набір.
const $ = (id) => document.getElementById(id)

if (SUPABASE_URL.startsWith('YOUR_')) {
  document.body.insertAdjacentHTML(
    'afterbegin',
    '<p style="margin:0;padding:12px;background:#c4271c;color:#fff;text-align:center">Вкажіть SUPABASE_URL і SUPABASE_ANON_KEY у config.js</p>',
  )
}
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const Store = {
  async user() {
    const { data } = await db.auth.getSession()
    return data.session ? data.session.user : null
  },
  async requireUser() {
    const u = await this.user()
    if (!u) location.href = 'login.html'
    return u
  },
  async all() {
    const { data, error } = await db
      .from('words')
      .select('*')
      .order('created_at')
    if (error) throw error
    return data
  },
  async add(w) {
    const { error } = await db.from('words').insert(w)
    if (error) throw error
  },
  async remove(id) {
    const { error } = await db.from('words').delete().eq('id', id)
    if (error) throw error
  },
  // Якщо база порожня, додає стартові слова з words.js
  async seed() {
    const rows = await this.all()
    if (rows.length || typeof WORDS === 'undefined') return rows
    const { error } = await db.from('words').insert(WORDS)
    if (error) throw error
    return this.all()
  },
  async signOut() {
    await db.auth.signOut()
    location.href = 'login.html'
  },
}
