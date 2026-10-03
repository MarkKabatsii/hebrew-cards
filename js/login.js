// Вхід і реєстрація.
const form = $('form'),
  msg = $('msg')
const say = (t, err) => {
  msg.textContent = t
  msg.className = 'msg' + (err ? ' is-error' : '')
}
const creds = () => ({
  email: $('email').value.trim(),
  password: $('password').value,
})

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const { error } = await db.auth.signInWithPassword(creds())
  if (error) return say('Не вдалося увійти: ' + error.message, true)
  location.href = '../index.html'
})

$('signup').addEventListener('click', async () => {
  const c = creds()
  if (!c.email || c.password.length < 6)
    return say('Вкажіть email і пароль від 6 символів.', true)
  const { data, error } = await db.auth.signUp(c)
  if (error) return say('Не вдалося створити акаунт: ' + error.message, true)
  if (data.session) location.href = '../index.html'
  else say('Майже готово: підтвердіть email за листом, а потім увійдіть.')
})

Store.user().then((u) => {
  if (u) location.href = '../index.html'
})
