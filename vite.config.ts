import { defineConfig } from 'vite'
import { cpSync } from 'node:fs'

// Preserve classic-script pages byte for byte; only the new section is bundled.
export default defineConfig({
  publicDir: false,
  build: { rollupOptions: { input: 'learning.html' } },
  plugins: [{ name: 'legacy-static-pages', closeBundle() {
    for (const file of ['index.html', 'pages', 'js', 'css', 'data/words.json', 'data/words-example.txt']) {
      cpSync(file, `dist/${file}`, { recursive: true })
    }
  } }],
})
