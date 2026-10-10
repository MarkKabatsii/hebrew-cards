import {test} from 'node:test'
import assert from 'node:assert/strict'
import {MemoryRepository} from '../src/learning/data/memory'
import {Controller} from '../src/learning/application/controller'
import {parseDashboard,parseExamples,wordId} from '../src/learning/data/validation'
import {materials,command} from './learning-fixtures'
import type {Command,Session} from '../src/learning/domain/model'
const fixture=()=>new MemoryRepository(materials.map(m=>({...m,owner:'u',created_at:'2026-01-01'})))
const start=():Command=>({operation_id:crypto.randomUUID(),session_id:null,expected_revision:0,exercise_id:null,action:'start',payload:{kind:'level',mode:'normal'}})
const session=(repo:MemoryRepository)=>repo.sessions[0]!
test('A05–A08 test repository restart/replay/lost ack/conflict/concurrent start',async()=>{
  const repo=fixture()
  const [a,b]=await Promise.all([repo.execute('u',start()),repo.execute('u',start())])
  assert.equal(a.dashboard.sessions[0]!.id,b.dashboard.sessions[0]!.id)
  const old=structuredClone(session(repo)),c=command(old,'intro_next')
  repo.failAfterCommit=true;await assert.rejects(repo.execute('u',c),/NETWORK/)
  assert.equal(session(repo).revision,1)
  assert.equal((await repo.execute('u',c)).outcome,'replay')
  assert.equal(session(repo).words.reduce((n,w)=>n+w.introduction,0),1)
  assert.equal((await repo.execute('u',command(old,'intro_next'))).outcome,'conflict')
  await assert.rejects(repo.execute('u',{...c,payload:{result:'incorrect'}}),/OPERATION_REUSED/)
  const current=session(repo);await repo.execute('u',command(current,'intro_next'))
  assert.equal((await repo.execute('u',c)).dashboard.sessions[0]!.revision,2)
  while(session(repo).phase==='introduction') await repo.execute('u',command(session(repo),'intro_next'))
  const question=(await repo.load('u')).sessions[0]!
  await repo.execute('u',command(question,'answer','correct'))
  const restored=(await repo.load('u')).sessions[0]!
  assert.equal(restored.exercise?.state,'feedback');assert.deepEqual(restored,session(repo))
})
test('A12 delayed response ignored on owner switch; one inflight command and same retry',async()=>{
  const repo=fixture(), controller=new Controller(repo)
  controller.setOwner('u');await controller.reload()
  let release!:()=>void
  const execute=repo.execute.bind(repo)
  repo.execute=async(o,c)=>{await new Promise<void>(resolve=>{release=resolve});return execute(o,c)}
  const pending=controller.start('level','normal')
  assert.equal(controller.snapshot().busy,true)
  assert.equal(controller.start('level','normal'),undefined)
  controller.setOwner('other');release();await pending
  assert.equal(controller.snapshot().owner,'other');assert(!controller.snapshot().dashboard?.sessions.length)
  controller.dispose()
})
test('controller unknown commit retries same command; unmount ignores completion',async()=>{
  const repo=fixture(),controller=new Controller(repo)
  controller.setOwner('u');await controller.reload();repo.failAfterCommit=true
  await controller.start('level','normal')
  const pending=controller.snapshot().pending!
  assert(pending); assert.equal(controller.snapshot().busy,false)
  await controller.retry();assert.equal(controller.snapshot().pending,null)
  assert(repo.receipts.has('u:'+pending.operation_id));assert.equal(repo.sessions.length,1)
  controller.dispose()
})
test('A16 examples validation 0/1/2, unapproved, foreign word, revocation',()=>{
  const e={word_id:'1',example_order:1,sentence_he:'שלום',transcription_uk:'шалом',translation_uk:'привіт',status:'approved'}
  assert.deepEqual(parseExamples([],['1']),[])
  assert.equal(parseExamples([e],['1']).length,1)
  assert.equal(parseExamples([e,{...e,example_order:2}],['1']).length,2)
  assert.equal(parseExamples([{...e,status:'draft'},{...e,word_id:'2'}],['1']).length,0)
})
test('runtime checks reject unknown version, unsafe numeric bigint, corrupted counters/ownership',async()=>{
  const repo=fixture();await repo.execute('u',start());const d=await repo.load('u')
  assert.equal(wordId('9007199254740993'),'9007199254740993')
  assert.equal(wordId('-9223372036854775808'),'-9223372036854775808')
  assert.equal(wordId('0'),'0')
  assert.throws(()=>wordId('9223372036854775808'))
  assert.throws(()=>wordId(9007199254740993))
  assert.throws(()=>parseDashboard({...d,sessions:[{...d.sessions[0],schema_version:2}]},'u'))
  assert.throws(()=>parseDashboard(d,'other'))
  const s=d.sessions[0] as Session;s.words[0]!.he_to_uk=20
  assert.throws(()=>parseDashboard(d,'u'))
})
test('A07 controller conflict uses authoritative state and explicit notice',async()=>{
  const repo=fixture(),controller=new Controller(repo)
  controller.setOwner('u');await controller.reload();await controller.start('level','normal')
  const old=controller.snapshot().dashboard!.sessions[0]!
  await repo.execute('u',command(old,'intro_next'))
  await controller.act(old,'intro_next')
  assert.equal(controller.snapshot().notice,'Прогрес оновлено в іншій вкладці.')
  assert.equal(controller.snapshot().dashboard!.sessions[0]!.revision,1)
  assert.equal(controller.snapshot().pending,null);controller.dispose()
})
test('expected errors remain distinct; unsupported state is not silently replaced',async()=>{
  const {classifyError}=await import('../src/learning/data/supabase')
  for(const [code,kind] of [['42P01','missing_migration'],['PGRST202','missing_migration'],['42501','permission'],['28000','auth'],['NETWORK','network'],['22023','invalid_data']]) {
    assert.equal(classifyError({code}).kind,kind)
  }
  assert.equal(classifyError(Error('INVALID_DATA')).kind,'invalid_data')
  const repo=fixture();await repo.execute('u',start());const d=await repo.load('u')
  assert.throws(()=>parseDashboard({...d,sessions:[{...d.sessions[0],status:'completed',exercise:null}]},'u'))
})
