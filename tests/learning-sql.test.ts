import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import type { Ack, Command, Dashboard, Session } from '../src/learning/domain/model'
import { transition } from '../src/learning/domain/transitions'
import { parseAck, parseDashboard } from '../src/learning/data/validation'
const owner='00000000-0000-0000-0000-000000000001'
const other='00000000-0000-0000-0000-000000000002'
async function fixture(existing = false) {
  const db=new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    insert into auth.users values ('${owner}'),('${other}');`)
  await db.exec(readFileSync('sql/schema.sql','utf8'))
  if(existing) await seed(db,5)
  await db.exec(readFileSync('sql/migrate_learning_path_v1.sql','utf8'))
  if(!existing) await seed(db,5)
  return db
}
async function seed(db: PGlite,n: number) {
  for(let i=0;i<n;i++) await db.query('insert into public.words(user_id,deck,he,tr,ua) values($1,$2,$3,$4,$5)',[owner,'Тест','שלום'+i,'шалом','привіт'+i])
  await db.query('insert into public.words(user_id,deck,he,tr,ua) values($1,$2,$3,$4,$5)',[other,'Тест','אחר','ахер','інше'])
}
async function asUser(db: PGlite,u: string,sql: string,params: unknown[]=[]): Promise<unknown> {
  return db.transaction(async tx=>{
    await tx.exec('set local role authenticated')
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[u])
    const result=await tx.query<{result:unknown}>(sql,params)
    return result.rows[0]?.result
  })
}
async function load(db: PGlite): Promise<Dashboard> { return parseDashboard(await asUser(db,owner,'select public.lp_dashboard() as result'),owner) }
async function run(db: PGlite,c: Command,u=owner): Promise<Ack> { return parseAck(await asUser(db,u,'select public.lp_command($1::jsonb) as result',[JSON.stringify(c)]),u) }
function start(kind: 'level'|'review'='level',mode: 'normal'|'intensive'='normal'): Command {
  return {operation_id:randomUUID(),session_id:null,expected_revision:0,exercise_id:null,action:'start',payload:{kind,mode}}
}
function action(s: Session,type: Command['action'],result: 'correct'|'incorrect'|'revealed'='correct'): Command {
  return {operation_id:randomUUID(),session_id:s.id,expected_revision:s.revision,exercise_id:s.exercise?.exercise_id??null,action:type,payload:type==='answer'?{result}:{}}
}
function active(a: Ack): Session { return a.dashboard.sessions.find(s=>s.status==='active')! }

test('SQL migration clean/existing; A01/A02 transition parity at real thresholds; SRS untouched',async()=>{
  for(const mode of ['normal','intensive'] as const) {
    const db=await fixture(mode==='intensive')
    const before=(await db.query('select * from public.words order by id')).rows
    let s=active(await run(db,start('level',mode)))
    const counts={introduction:0,he_to_uk:0,uk_to_he:0}
    while(s.status==='active') {
      const c=action(s,s.phase==='introduction'?'intro_next':s.exercise.state==='question'?'answer':'next')
      if(c.action!=='next') counts[s.phase]++
      const expected=transition(s,c)
      const ack=await run(db,c)
      s=ack.dashboard.sessions.find(x=>x.id===s.id)!
      assert.deepEqual(s,expected)
    }
    assert.deepEqual(counts,mode==='normal'?{introduction:25,he_to_uk:15,uk_to_he:15}:{introduction:50,he_to_uk:50,uk_to_he:50})
    assert.equal((await load(db)).metrics.completed,5)
    assert.deepEqual((await db.query('select * from public.words order by id')).rows,before)
    await db.close()
  }
})
test('SQL A04–A08 receipts before revision; replay returns latest; changed payload rejected; one active start',async()=>{
  const db=await fixture()
  const c=start(), first=await run(db,c), second=await run(db,start())
  assert.equal(active(first).id,active(second).id)
  const initial=active(first), next=action(initial,'intro_next')
  const applied=await run(db,next)
  assert.equal((await run(db,next)).outcome,'replay')
  assert.equal(active(await run(db,next)).revision,1)
  assert.equal((await run(db,action(initial,'intro_next'))).outcome,'conflict')
  await assert.rejects(run(db,{...next,payload:{result:'correct'}}),/LP_OPERATION_REUSED/)
  const subsequent=action(active(applied),'intro_next'); await run(db,subsequent)
  assert.equal(active(await run(db,next)).revision,2)
  assert.equal((await load(db)).sessions[0]!.revision,2)
  assert.equal((await db.query<{n:number}>('select count(*)::int as n from public.lp_sessions where status=\'active\'')).rows[0]!.n,1)
  await db.close()
})
test('SQL A09 snapshot stable/new words next; A10 deletion one/all; bigint text',async()=>{
  const db=await fixture()
  let s=active(await run(db,start()))
  const old=s.words[0]!.snapshot
  await db.query('update public.words set he=$1,ua=$2 where id=$3',['חדש','нове',old.word_id])
  assert.equal((await load(db)).sessions[0]!.words[0]!.snapshot.he,old.he)
  await db.query('insert into public.words(id,user_id,deck,he,tr,ua) overriding system value values($1,$2,$3,$4,$5,$6)',['9007199254740993',owner,'Тест','גדול','ґадоль','велике'])
  assert.equal((await load(db)).sessions[0]!.words.length,5)
  await db.query('delete from public.words where id=$1',[old.word_id])
  s=(await load(db)).sessions.find(x=>x.id===s.id)!
  assert.equal(s.words.length,4); assert.equal(s.status,'active')
  const revision=s.revision; assert.equal((await load(db)).sessions.find(x=>x.id===s.id)!.revision,revision)
  const lost=s.words[0]!.snapshot.word_id
  await db.query('update public.words set user_id=$1 where id=$2',[other,lost])
  s=(await load(db)).sessions.find(x=>x.id===s.id)!
  assert.equal(s.words.length,3)
  await db.query('update public.words set user_id=$1 where id=$2',[owner,lost])
  assert.equal((await load(db)).sessions.find(x=>x.id===s.id)!.words.length,3)
  await db.query('delete from public.words where id=any($1::bigint[])',[[lost,...s.words.map(w=>w.snapshot.word_id)]])
  assert.equal((await load(db)).sessions.find(x=>x.id===s.id)!.status,'cancelled_empty')
  s=active(await run(db,start()))
  assert.equal(s.words[0]!.snapshot.word_id,'9007199254740993')
  await db.close()
})
test('SQL A13 genuine PostgreSQL roles/RLS: other sessions/owner/word/anon/direct writes',async()=>{
  const db=await fixture()
  const s=active(await run(db,start()))
  await assert.rejects(run(db,action(s,'intro_next'),other),/LP_PERMISSION_DENIED/)
  const rows=await asUser(db,other,"select count(*)::int as result from public.lp_sessions")
  assert.equal(rows,0)
  await assert.rejects(asUser(db,other,"insert into public.lp_answer_variants(owner,word_id,direction,answer) values($1,$2,'he_to_uk','тест') returning answer as result",[other,s.words[0]!.snapshot.word_id]),/row-level security|LP_WORD_OWNER/)
  await assert.rejects(asUser(db,other,"insert into public.lp_answer_variants(owner,word_id,direction,answer) values($1,$2,'he_to_uk','тест') returning answer as result",[owner,s.words[0]!.snapshot.word_id]),/row-level security|LP_WORD_OWNER/)
  await assert.rejects(asUser(db,owner,"update public.lp_sessions set revision=999 returning revision as result"),/permission denied/)
  await assert.rejects(asUser(db,'','select public.lp_dashboard() as result'),/LP_AUTH_REQUIRED/)
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role anon');await tx.query('select public.lp_dashboard()')}),/permission denied/)
  await assert.rejects(db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query('select public.lp_dashboard_data($1)',[other])}),/permission denied/)
  await db.close()
})
test('SQL A15 real review max20; error flag; practice only after both directions; no new completion',async()=>{
  const db=await fixture()
  let s=active(await run(db,start()))
  while(s.status==='active') {
    s=(await run(db,action(s,s.phase==='introduction'?'intro_next':s.exercise.state==='question'?'answer':'next'))).dashboard.sessions.find(x=>x.id===s.id)!
  }
  assert.equal(active(await run(db,start('review'))),undefined)
  await db.query('update public.words set he=$1 where id=1',['חדש'])
  await db.exec("update public.lp_word_progress set last_practiced_at=now()-interval '25 hours'")
  s=active(await run(db,start('review')))
  assert.equal(s.words.find(w=>w.snapshot.word_id==='1')!.snapshot.he,'חדש')
  let attempts=0
  const before=(await db.query('select completed_at,last_practiced_at from public.lp_word_progress order by word_id')).rows
  while(s.status==='active') {
    const c=action(s,s.exercise.state==='question'?'answer':'next','incorrect')
    if(c.action==='answer') attempts++
    const expected=transition(s,c)
    s=(await run(db,c)).dashboard.sessions.find(x=>x.id===s.id)!
    assert.deepEqual(s,expected)
    if(s.phase==='he_to_uk') assert.deepEqual((await db.query('select completed_at,last_practiced_at from public.lp_word_progress order by word_id')).rows,before)
  }
  assert.equal(attempts,20); assert.equal((await load(db)).metrics.completed,5)
  assert.equal((await load(db)).metrics.review_due,0)
  assert.equal((await db.query<{n:number}>('select count(*)::int as n from public.lp_word_progress where any_error')).rows[0]!.n,5)
  await db.close()
})
test('SQL A03/A05 wrong/revealed do not clear correct counters; saved feedback reload; explicit aliases',async()=>{
  const db=await fixture()
  await asUser(db,owner,"insert into public.lp_answer_variants(word_id,direction,answer) values(1,'he_to_uk','вітаю') returning answer as result")
  let s=active(await run(db,start()))
  assert.deepEqual(s.words[0]!.snapshot.answers_uk,['вітаю'])
  while(s.phase==='introduction') s=active(await run(db,action(s,'intro_next')))
  await assert.rejects(run(db,{...action(s,'answer'),payload:{}}),/LP_INVALID_ACTION/)
  const correct=action(s,'answer');s=active(await run(db,correct))
  const saved=await load(db);assert.deepEqual(saved.sessions.find(x=>x.id===s.id),s)
  assert.equal(s.exercise?.state,'feedback')
  const target=s.queue[s.position],points=s.words.find(w=>w.snapshot.word_id===target)!.he_to_uk
  s=active(await run(db,action(s,'next')))
  while(s.queue[s.position]!==target){s=active(await run(db,action(s,'answer')));s=active(await run(db,action(s,'next')))}
  s=active(await run(db,action(s,'answer','incorrect')))
  assert.equal(s.words.find(w=>w.snapshot.word_id===target)!.he_to_uk,points)
  s=active(await run(db,action(s,'next')));s=active(await run(db,action(s,'answer','revealed')))
  assert.equal(s.exercise?.state,'feedback');await db.close()
})
test('SQL A16 approved examples exact bigint text/0/1/2/revoked/draft and existing RLS',async()=>{
  const db=await fixture()
  await db.exec(`create table public.word_examples(word_id bigint references public.words(id) on delete cascade,
    example_order int,sentence_he text,transcription_uk text,translation_uk text,status text);
    alter table public.word_examples enable row level security;
    create policy own_examples on public.word_examples for select to authenticated using(exists(select 1 from public.words w where w.id=word_id and w.user_id=auth.uid()));
    grant select on public.word_examples to authenticated;
    insert into public.word_examples values(1,1,'שלום','шалом','привіт','approved'),(1,2,'שלום','шалом','привіт','draft');`)
  const examples=async(u=owner)=>await asUser(db,u,"select public.lp_examples(array['1']) as result") as unknown[]
  assert.equal((await examples()).length,1)
  await db.exec("update public.word_examples set status='approved' where example_order=2")
  assert.equal((await examples()).length,2)
  assert.equal((await examples(other)).length,0)
  await db.exec("update public.word_examples set status='draft'")
  assert.equal((await examples()).length,0)
  await db.close()
})
test('SQL eligibility rejects mixed alphabets/empty translation and reports problematic count',async()=>{
  const db=await fixture()
  await db.query('update public.words set he=$1 where id=1',['שלוםabc'])
  await db.query('update public.words set ua=$1 where id=2',[' '])
  const dashboard=await load(db)
  assert.equal(dashboard.metrics.eligible,3);assert.equal(dashboard.metrics.problematic,2)
  assert.equal(active(await run(db,start())).words.length,3)
  await db.close()
})
