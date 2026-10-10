import assert from 'node:assert/strict'
import {transition} from '../src/learning/domain/transitions'
import type {Command,Material,Session} from '../src/learning/domain/model'
export const materials: Material[] = Array.from({length:5},(_,i)=>({word_id:String(i+1),he:'שָׁלוֹם',ua:'привіт',tr:'шалом',answers_he:['שלום'],answers_uk:['вітаю'],normalization_version:1}))
let op=0
export function command(s: Session, action: Command['action'], result?: 'correct'|'incorrect'|'revealed'): Command {
  return {operation_id:'op-'+(++op),session_id:s.id,expected_revision:s.revision,exercise_id:s.exercise?.exercise_id??null,action,payload:result?{result}:{}}
}
export function complete(s: Session, result: 'correct'|'incorrect'='correct'): { state: Session; counts: Record<'introduction'|'he_to_uk'|'uk_to_he',number> } {
  const counts={introduction:0,he_to_uk:0,uk_to_he:0}
  for(let n=0;s.status==='active';n++) {
    assert(n<1000)
    if(s.phase==='introduction') { counts.introduction++; s=transition(s,command(s,'intro_next')) }
    else if(s.exercise.state==='question') { counts[s.phase]++; s=transition(s,command(s,'answer',result)); assert.equal(s.status,'active') }
    else s=transition(s,command(s,'next'))
  }
  return {state:s,counts}
}
