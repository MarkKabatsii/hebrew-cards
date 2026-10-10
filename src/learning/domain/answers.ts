import type { Direction, Material } from './model'
export const MAX_ANSWER_LENGTH = 2000
const spaces = (s: string) => s.trim().replace(/\s+/gu, ' ')
export function normalizeUk(text: string): string {
  return spaces(text.normalize('NFC').replace(/\u0301/gu, '').replace(/[’‘ʼ`]/gu, "'").toLocaleLowerCase('uk'))
}
export function normalizeHe(text: string): string {
  return spaces(text.normalize('NFC')
    .replace(/[\u0591-\u05BD\u05BF\u05C1-\u05C2\u05C4-\u05C5\u05C7]/gu, '')
    .replace(/\u05BE/gu, '-').replace(/[\u05F3’‘ʼ]/gu, "'").replace(/\u05F4/gu, '"'))
}
export function evaluateAnswer(text: string, direction: Direction, material: Material): 'correct' | 'incorrect' | 'empty' {
  const normalize = direction === 'he_to_uk' ? normalizeUk : normalizeHe
  if (!normalize(text)) return 'empty'
  if (text.length > MAX_ANSWER_LENGTH) return 'incorrect'
  const options = direction === 'he_to_uk' ? [material.ua, ...material.answers_uk] : [material.he, ...material.answers_he]
  return options.some(answer => normalize(answer) === normalize(text)) ? 'correct' : 'incorrect'
}
export function validMaterial(m: Pick<Material, 'he' | 'ua'>): boolean {
  return m.he.length <= 2000 && m.ua.length <= 2000 && /[\u05D0-\u05EA]/u.test(m.he) &&
    /^[א-ת\u0591-\u05C7\u05F3\u05F4 0-9'"‘’“”.,:;!?()\/+\-]+$/u.test(m.he) &&
    !/[\u0000-\u001F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u.test(m.he + m.ua) && m.ua.trim().length > 0
}
