import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHe, normalizeUk, evaluateAnswer } from '../src/learning/domain/answers'
import { createSession, currentWord, transition, reconcile, progress } from '../src/learning/domain/transitions'
import {materials,command,complete} from './learning-fixtures'
test('A01/A02 real thresholds, feedback before completed, immutable thresholds',()=>{
  for(const mode of ['normal','intensive'] as const) {
    const initial=createSession('s','u',materials,mode,'level',42,1)!
    const {state,counts}=complete(initial)
    assert.deepEqual(counts,mode==='normal'?{introduction:25,he_to_uk:15,uk_to_he:15}:{introduction:50,he_to_uk:50,uk_to_he:50})
    assert.equal(state.status,'completed'); assert.equal(progress(state),1)
    assert.equal(initial.words[0]!.introduction,0)
  }
})
test('A03 incorrect, revealed, empty; counters accumulate; A04 exercise mismatch',()=>{
  let s=createSession('s','u',materials,'normal','review',42,null)!
  const c=command(s,'answer','incorrect'); s=transition(s,c)
  assert.equal(currentWord(s)!.he_to_uk,0)
  assert.throws(()=>transition(s,c))
  s=transition(s,command(s,'next')); s=transition(s,command(s,'answer','revealed'))
  assert.equal(currentWord(s)!.he_to_uk,0)
  assert.equal(evaluateAnswer('  ','he_to_uk',materials[0]!),'empty')
})
test('A09 snapshots/A10 removal of one or all/A11 0 and 1–4 words',()=>{
  assert.equal(createSession('s','u',[],'normal','level',1,1),null)
  for(let n=1;n<5;n++) assert.equal(complete(createSession('s','u',materials.slice(0,n),'normal','level',1,1)!).state.status,'completed')
  const s=createSession('s','u',materials,'normal','level',1,1)!
  const saved=s.words[0]!.snapshot.ua; materials[0]!.ua='змінено'
  assert.equal(s.words[0]!.snapshot.ua,saved); materials[0]!.ua=saved
  assert.equal(reconcile(s,new Set()).status,'cancelled_empty')
  const one=reconcile(s,new Set(['2','3','4','5']))
  assert.equal(one.words.length,4); assert.equal(currentWord(one)?.snapshot.word_id,'2')
  assert.equal(complete(one).counts.introduction,20)
})
test('A14 Unicode fixtures and exact aliases',()=>{
  assert.equal(normalizeUk('  ПРИВІ́Т  '),'привіт')
  assert.equal(normalizeUk('п’ять'),'п\'ять')
  for(const [a,b] of [['й','и'],['ї','і'],['і','и'],['г','ґ'],['е','є']]) assert.notEqual(normalizeUk(a!),normalizeUk(b!))
  assert.equal(normalizeUk('і\u0308'),'ї'); assert.equal(normalizeUk('и\u0306'),'й')
  assert.equal(normalizeHe('שָׁלוֹם'),'שלום'); assert.equal(normalizeHe('א־ב'),'א-ב')
  assert.equal(normalizeHe('ג׳'),'ג\''); assert.equal(normalizeHe('צה״ל'),'צה"ל')
  assert.notEqual(normalizeHe('ך'),normalizeHe('כ')); assert.notEqual(normalizeHe('א.'),normalizeHe('א'))
  assert.equal(evaluateAnswer('вітаю','he_to_uk',materials[0]!),'correct')
  assert.equal(evaluateAnswer('привіт друже','he_to_uk',materials[0]!),'incorrect')
})
test('A15 all incorrect review is bounded at twenty, any_error retained',()=>{
  const {state,counts}=complete(createSession('s','u',materials,'normal','review',42,null)!,'incorrect')
  assert.equal(counts.he_to_uk+counts.uk_to_he,20)
  assert.equal(state.status,'completed'); assert(state.words.every(w=>w.any_error && w.he_to_uk===0))
})
test('queue has each pending word once per cycle; no adjacent repetition with alternatives',()=>{
  let s=createSession('s','u',materials,'normal','review',42,null)!
  let previous=''
  while(s.status==='active') {
    if(s.exercise.state==='question') {
      const id=currentWord(s)!.snapshot.word_id
      assert.notEqual(id,previous); previous=id
      assert.equal(new Set(s.queue).size,s.queue.length)
      s=transition(s,command(s,'answer','incorrect'))
    } else s=transition(s,command(s,'next'))
  }
})
