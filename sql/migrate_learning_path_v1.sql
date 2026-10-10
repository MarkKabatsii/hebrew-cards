-- Additive migration. Run ONLY on a disposable/test database first.
-- Based on local sql/schema.sql: words.id bigint, words.user_id uuid.
begin;

create table public.lp_sessions (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('level','review')),
  level_number integer check (level_number > 0),
  mode text not null check (mode in ('normal','intensive')),
  status text not null default 'active' check (status in ('active','completed','cancelled_empty')),
  schema_version integer not null default 1 check (schema_version = 1),
  rules_version integer not null default 1 check (rules_version = 1),
  intro_threshold integer not null check (intro_threshold in (5,10)),
  he_threshold integer not null check (he_threshold in (3,10)),
  uk_threshold integer not null check (uk_threshold in (3,10)),
  revision integer not null default 0 check (revision >= 0),
  seed integer not null check (seed >= 0), cycle integer not null default 0 check (cycle >= 0),
  serial integer not null default 0 check (serial >= 0),
  phase text not null check (phase in ('introduction','he_to_uk','uk_to_he')),
  queue bigint[] not null default '{}', position integer not null default 0 check (position >= 0),
  exercise_state text not null default 'question' check (exercise_state in ('question','feedback')),
  feedback_result text check (feedback_result in ('correct','incorrect','revealed')),
  started_at timestamptz not null default now(), finished_at timestamptz,
  check ((kind = 'level') = (level_number is not null)),
  check ((exercise_state = 'feedback') = (feedback_result is not null)),
  check ((mode='normal' and intro_threshold=5 and he_threshold=3 and uk_threshold=3)
      or (mode='intensive' and intro_threshold=10 and he_threshold=10 and uk_threshold=10)),
  unique (owner, level_number), unique(id,owner)
);
create unique index lp_one_active_kind on public.lp_sessions(owner,kind) where status='active';

create table public.lp_session_words (
  session_id uuid not null references public.lp_sessions(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  ordinal integer not null check (ordinal between 0 and 4),
  he text not null, ua text not null, tr text not null,
  answers_he jsonb not null default '[]' check (jsonb_typeof(answers_he)='array'),
  answers_uk jsonb not null default '[]' check (jsonb_typeof(answers_uk)='array'),
  normalization_version integer not null default 1 check (normalization_version=1),
  introduction integer not null default 0 check (introduction between 0 and 10),
  he_to_uk integer not null default 0 check (he_to_uk between 0 and 10),
  uk_to_he integer not null default 0 check (uk_to_he between 0 and 10),
  attempts_he integer not null default 0 check (attempts_he between 0 and 2),
  attempts_uk integer not null default 0 check (attempts_uk between 0 and 2),
  any_error boolean not null default false,
  primary key(session_id,word_id), unique(session_id,ordinal),
  foreign key(session_id,owner) references public.lp_sessions(id,owner) on delete cascade
);
create table public.lp_word_progress (
  owner uuid not null references auth.users(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  completed_at timestamptz not null default now(),
  last_practiced_at timestamptz not null default now(), any_error boolean not null default false,
  primary key(owner,word_id)
);
create table public.lp_receipts (
  owner uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null, fingerprint text not null,
  session_id uuid references public.lp_sessions(id) on delete cascade,
  resulting_revision integer, created_at timestamptz not null default now(),
  primary key(owner,operation_id),
  foreign key(session_id,owner) references public.lp_sessions(id,owner) on delete cascade
);
create table public.lp_answer_variants (
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id bigint not null references public.words(id) on delete cascade,
  direction text not null check(direction in ('he_to_uk','uk_to_he')),
  answer text not null check(length(btrim(answer)) between 1 and 500),
  primary key(owner,word_id,direction,answer)
);

-- Membership checked independently of the single-column word FK.
create function public.lp_check_membership() returns trigger
language plpgsql set search_path = '' as $$
declare s public.lp_sessions;
begin
  if not exists(select 1 from public.words w where w.id=new.word_id and w.user_id=new.owner) then
    raise exception using message='LP_WORD_OWNER', errcode='42501';
  end if;
  if tg_table_name='lp_session_words' then
    if not exists(select 1 from public.lp_sessions parent where parent.id=new.session_id and parent.owner=new.owner) then
      raise exception using message='LP_SESSION_OWNER', errcode='42501';
    end if;
    select * into strict s from public.lp_sessions where id=new.session_id;
    if new.introduction>s.intro_threshold or new.he_to_uk>s.he_threshold or new.uk_to_he>s.uk_threshold
      or (s.kind='review' and (new.introduction<>0 or new.he_to_uk>1 or new.uk_to_he>1))
      or (s.kind='level' and (new.attempts_he<>0 or new.attempts_uk<>0))
      or jsonb_array_length(new.answers_he)>50 or jsonb_array_length(new.answers_uk)>50
      or exists(select 1 from jsonb_array_elements(new.answers_he || new.answers_uk) a
        where jsonb_typeof(a)<>'string' or length(a#>>'{}') not between 1 and 500) then
      raise exception using message='LP_INVALID_DATA',errcode='22023';
    end if;
  elsif tg_table_name='lp_answer_variants' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner::text,0));
    if (select count(*) from public.lp_answer_variants v where v.owner=new.owner and v.word_id=new.word_id and v.direction=new.direction
      and v.answer<>new.answer)>=50 then raise exception using message='LP_TOO_MANY_VARIANTS',errcode='22023'; end if;
  end if;
  return new;
end $$;
create trigger lp_membership before insert or update on public.lp_session_words
  for each row execute function public.lp_check_membership();
create trigger lp_membership before insert or update on public.lp_word_progress
  for each row execute function public.lp_check_membership();
create trigger lp_membership before insert or update on public.lp_answer_variants
  for each row execute function public.lp_check_membership();

alter table public.lp_sessions enable row level security;
alter table public.lp_session_words enable row level security;
alter table public.lp_word_progress enable row level security;
alter table public.lp_receipts enable row level security;
alter table public.lp_answer_variants enable row level security;
create policy lp_own on public.lp_sessions for select to authenticated using(owner=(select auth.uid()));
create policy lp_own on public.lp_session_words for select to authenticated using(
  owner=(select auth.uid()) and exists(select 1 from public.words w where w.id=word_id and w.user_id=auth.uid()));
create policy lp_own on public.lp_word_progress for select to authenticated using(
  owner=(select auth.uid()) and exists(select 1 from public.words w where w.id=word_id and w.user_id=auth.uid()));
create policy lp_own on public.lp_receipts for select to authenticated using(owner=(select auth.uid()));
create policy lp_own on public.lp_answer_variants for all to authenticated
  using(owner=(select auth.uid()) and exists(select 1 from public.words w where w.id=word_id and w.user_id=auth.uid()))
  with check(owner=(select auth.uid()) and exists(select 1 from public.words w where w.id=word_id and w.user_id=auth.uid()));
revoke all on public.lp_sessions,public.lp_session_words,public.lp_word_progress,public.lp_receipts,public.lp_answer_variants from public,anon,authenticated;
grant select on public.lp_sessions,public.lp_session_words,public.lp_word_progress,public.lp_receipts to authenticated;
grant select,insert,update,delete on public.lp_answer_variants to authenticated;

create function public.lp_word_done(w public.lp_session_words, s public.lp_sessions) returns boolean
language sql immutable set search_path = '' as $$
  select case s.phase
    when 'introduction' then w.introduction >= s.intro_threshold
    when 'he_to_uk' then case when s.kind='review' then w.he_to_uk>=1 or w.attempts_he>=2 else w.he_to_uk>=s.he_threshold end
    else case when s.kind='review' then w.uk_to_he>=1 or w.attempts_uk>=2 else w.uk_to_he>=s.uk_threshold end end
$$;
create function public.lp_queue(s public.lp_sessions, previous bigint default null) returns bigint[]
language plpgsql set search_path = '' as $$
declare q bigint[];
begin
  select coalesce(array_agg(w.word_id order by
    case when s.phase='introduction' then w.ordinal::bigint
      else (((((w.word_id % 2147483647 + s.seed + s.cycle::bigint*69621) % 2147483647)*48271) % 2147483647)*48271) % 2147483647 end,
    w.word_id), '{}') into q
  from public.lp_session_words w where w.session_id=s.id and not public.lp_word_done(w,s);
  if s.phase<>'introduction' and cardinality(q)>1 and q[1]=previous then q=q[2:cardinality(q)] || q[1]; end if;
  return q;
end $$;

create function public.lp_advance(p_id uuid, previous bigint default null) returns void
language plpgsql set search_path = '' as $$
declare s public.lp_sessions; w public.lp_session_words;
begin
  select * into strict s from public.lp_sessions where id=p_id;
  if not exists(select 1 from public.lp_session_words where session_id=s.id) then
    update public.lp_sessions set status='cancelled_empty',queue='{}',position=0,
      exercise_state='question',feedback_result=null,finished_at=now() where id=s.id;
    return;
  end if;
  loop
    while s.position < cardinality(s.queue) loop
      select * into w from public.lp_session_words where session_id=s.id and word_id=s.queue[s.position+1];
      if found and not public.lp_word_done(w,s) then
        update public.lp_sessions set phase=s.phase,cycle=s.cycle,queue=s.queue,position=s.position,
          serial=serial+1,exercise_state='question',feedback_result=null where id=s.id;
        return;
      end if;
      s.position=s.position+1;
    end loop;
    if exists(select 1 from public.lp_session_words x where x.session_id=s.id and not public.lp_word_done(x,s)) then
      s.cycle=s.cycle+1; s.queue=public.lp_queue(s,previous); s.position=0;
    elsif s.phase='uk_to_he' then
      update public.lp_sessions set status='completed',phase=s.phase,position=s.position,
        queue=s.queue,exercise_state='question',feedback_result=null,finished_at=now() where id=s.id;
      if s.kind='level' then
        insert into public.lp_word_progress(owner,word_id,completed_at,last_practiced_at,any_error)
          select s.owner,x.word_id,now(),now(),x.any_error from public.lp_session_words x where x.session_id=s.id
          on conflict(owner,word_id) do nothing;
      end if;
      return;
    else
      s.phase=case s.phase when 'introduction' then 'he_to_uk' else 'uk_to_he' end;
      s.cycle=s.cycle+1; s.queue=public.lp_queue(s,previous); s.position=0;
    end if;
  end loop;
end $$;

create function public.lp_reconcile(p_id uuid) returns void
language plpgsql set search_path = '' as $$
declare s public.lp_sessions; removed integer; new_position integer;
begin
  select * into strict s from public.lp_sessions where id=p_id;
  delete from public.lp_session_words x where x.session_id=s.id and not exists(
    select 1 from public.words w where w.id=x.word_id and w.user_id=s.owner);
  get diagnostics removed=row_count;
  -- ON DELETE CASCADE may already have removed rows; queue retains IDs as tombstones.
  if removed>0 or exists(select 1 from unnest(s.queue) q where not exists(
      select 1 from public.lp_session_words x where x.session_id=s.id and x.word_id=q)) then
    select count(*) into new_position from unnest(s.queue) with ordinality as z(q,n)
      where n<=s.position and exists(select 1 from public.lp_session_words x where x.session_id=s.id and x.word_id=q);
    update public.lp_sessions set queue=array(select q from unnest(s.queue) with ordinality as z(q,n)
        where exists(select 1 from public.lp_session_words x where x.session_id=s.id and x.word_id=q) order by n),
      position=new_position,revision=revision+1 where id=s.id;
    if not exists(select 1 from public.lp_session_words x where x.session_id=s.id and x.word_id=s.queue[s.position+1]) then
      perform public.lp_advance(s.id);
    end if;
  end if;
  -- Defensive cleanup of progress after ownership transfer.
  delete from public.lp_word_progress p where p.owner=s.owner and not exists(
    select 1 from public.words w where w.id=p.word_id and w.user_id=p.owner);
end $$;

-- Parameterized in one private helper: 24 hours is an initial product setting.
create function public.lp_review_interval() returns interval language sql immutable set search_path='' as $$ select interval '24 hours' $$;
create function public.lp_eligible(w public.words) returns boolean language sql immutable set search_path='' as $$
  select length(w.he) between 1 and 2000 and length(w.ua) between 1 and 2000
    and w.he ~ '[א-ת]' and length(btrim(w.ua))>0
    and w.he ~ U&'^[\05D0-\05EA\0591-\05C7\05F3\05F4 0-9''"‘’“”.,:;!?()/+-]+$'
    and (w.he || w.ua) !~ '[[:cntrl:]]'
    and (w.he || w.ua) !~ U&'[\200B-\200F\202A-\202E\2066-\2069]'
$$;

create function public.lp_dashboard_data(p_owner uuid) returns jsonb
language plpgsql set search_path='' as $$
declare sessions jsonb; metrics jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'owner',s.owner,'kind',s.kind,'level_number',s.level_number,'mode',s.mode,'status',s.status,
    'schema_version',s.schema_version,'rules_version',s.rules_version,
    'thresholds',jsonb_build_object('introduction',s.intro_threshold,'he_to_uk',s.he_threshold,'uk_to_he',s.uk_threshold),
    'revision',s.revision,'seed',s.seed,'cycle',s.cycle,'serial',s.serial,'phase',s.phase,
    'queue',(select coalesce(jsonb_agg(q::text order by n),'[]') from unnest(s.queue) with ordinality as z(q,n)),
    'position',s.position,
    'exercise',case when s.status<>'active' then null else jsonb_build_object('state',s.exercise_state,'exercise_id',s.id::text||':'||s.serial)
      || case when s.exercise_state='feedback' then jsonb_build_object('result',s.feedback_result) else '{}'::jsonb end end,
    'words',(select coalesce(jsonb_agg(jsonb_build_object(
      'snapshot',jsonb_build_object('word_id',x.word_id::text,'he',x.he,'ua',x.ua,'tr',x.tr,
        'answers_he',x.answers_he,'answers_uk',x.answers_uk,'normalization_version',x.normalization_version),
      'introduction',x.introduction,'he_to_uk',x.he_to_uk,'uk_to_he',x.uk_to_he,
      'attempts_he',x.attempts_he,'attempts_uk',x.attempts_uk,'any_error',x.any_error) order by x.ordinal),'[]')
      from public.lp_session_words x join public.words w on w.id=x.word_id and w.user_id=s.owner where x.session_id=s.id)
  ) order by s.started_at),'[]') into sessions from public.lp_sessions s where s.owner=p_owner and (
    s.status='active' or s.id in (select id from public.lp_sessions where owner=p_owner order by started_at desc,id desc limit 3));
  select jsonb_build_object('eligible',count(*) filter(where public.lp_eligible(w)),
    'problematic',count(*) filter(where not public.lp_eligible(w)),
    'completed',count(p.word_id) filter(where public.lp_eligible(w)),
    'review_due',count(p.word_id) filter(where public.lp_eligible(w) and now()-p.last_practiced_at>=public.lp_review_interval()))
  into metrics from public.words w left join public.lp_word_progress p on p.word_id=w.id and p.owner=p_owner where w.user_id=p_owner;
  return jsonb_build_object('sessions',sessions,'metrics',metrics);
end $$;

create function public.lp_dashboard() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid=auth.uid(); sid uuid;
begin
  if u is null then raise exception using message='LP_AUTH_REQUIRED',errcode='28000'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  for sid in select id from public.lp_sessions where owner=u and status='active' loop perform public.lp_reconcile(sid); end loop;
  return public.lp_dashboard_data(u);
end $$;

create function public.lp_command(p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  u uuid=auth.uid(); op uuid; fp text; receipt public.lp_receipts;
  s public.lp_sessions; w public.lp_session_words; sid uuid; action text; payload jsonb;
  result text; kind text; mode text; q bigint[]; n integer;
begin
  if u is null then raise exception using message='LP_AUTH_REQUIRED',errcode='28000'; end if;
  if jsonb_typeof(p_command)<>'object' or length(p_command::text)>1500
    or (select count(*) from jsonb_object_keys(p_command))<>6
    or not p_command ?& array['operation_id','session_id','expected_revision','exercise_id','action','payload']
    or jsonb_typeof(p_command->'payload')<>'object'
    or jsonb_typeof(p_command->'expected_revision')<>'number'
    or (p_command->>'expected_revision') !~ '^[0-9]{1,10}$'
    or jsonb_typeof(p_command->'operation_id')<>'string'
    or jsonb_typeof(p_command->'action')<>'string' then
    raise exception using message='LP_INVALID_COMMAND',errcode='22023';
  end if;
  op=(p_command->>'operation_id')::uuid; fp=md5(p_command::text);
  if op is null then raise exception using message='LP_INVALID_COMMAND',errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text,0));
  select * into receipt from public.lp_receipts where owner=u and operation_id=op;
  if found then
    if receipt.fingerprint<>fp then raise exception using message='LP_OPERATION_REUSED',errcode='22023'; end if;
    for sid in select id from public.lp_sessions where owner=u and status='active' loop perform public.lp_reconcile(sid); end loop;
    return jsonb_build_object('outcome','replay','dashboard',public.lp_dashboard_data(u));
  end if;
  action=p_command->>'action'; payload=p_command->'payload';
  if action='start' then
    kind=payload->>'kind'; mode=payload->>'mode';
    if kind is null or kind not in ('level','review') or mode is null or mode not in ('normal','intensive')
      or (select count(*) from jsonb_object_keys(payload))<>2
      or p_command->>'session_id' is not null or p_command->>'exercise_id' is not null
      or p_command->>'expected_revision'<>'0' then
      raise exception using message='LP_INVALID_COMMAND',errcode='22023';
    end if;
    select * into s from public.lp_sessions where owner=u and lp_sessions.kind=kind and status='active';
    if found then
      perform public.lp_reconcile(s.id);
      select * into s from public.lp_sessions where id=s.id;
    end if;
    if s.id is null or s.status<>'active' then
      if kind='level' then
        select array_agg(c.id order by c.created_at nulls last,c.id) into q from (
          select x.id,x.created_at from public.words x where x.user_id=u and public.lp_eligible(x)
          and not exists(select 1 from public.lp_word_progress p where p.owner=u and p.word_id=x.id)
          order by x.created_at nulls last,x.id limit 5) c;
      else
        select array_agg(c.id order by c.last_practiced_at,c.any_error desc,c.id) into q from (
          select x.id,p.last_practiced_at,p.any_error from public.words x join public.lp_word_progress p on p.word_id=x.id and p.owner=u
          where x.user_id=u and public.lp_eligible(x) and now()-p.last_practiced_at>=public.lp_review_interval()
          order by p.last_practiced_at,p.any_error desc,x.id limit 5) c;
      end if;
      if cardinality(q)>0 then
        select coalesce(max(level_number),0)+1 into n from public.lp_sessions where owner=u;
        insert into public.lp_sessions(owner,kind,level_number,mode,intro_threshold,he_threshold,uk_threshold,phase,seed)
        values(u,kind,case when kind='level' then n else null end,mode,
          case when mode='normal' then 5 else 10 end,case when mode='normal' then 3 else 10 end,
          case when mode='normal' then 3 else 10 end,case when kind='level' then 'introduction' else 'he_to_uk' end,
          floor(random()*2147483646)::integer) returning * into s;
        insert into public.lp_session_words(session_id,word_id,owner,ordinal,he,ua,tr,answers_he,answers_uk)
          select s.id,x.id,u,z.n::integer-1,x.he,x.ua,x.tr,
            coalesce((select jsonb_agg(v.answer order by v.answer) from public.lp_answer_variants v where v.word_id=x.id and v.owner=u and v.direction='uk_to_he'),'[]'),
            coalesce((select jsonb_agg(v.answer order by v.answer) from public.lp_answer_variants v where v.word_id=x.id and v.owner=u and v.direction='he_to_uk'),'[]')
          from unnest(q) with ordinality z(id,n) join public.words x on x.id=z.id and x.user_id=u;
        update public.lp_sessions set queue=public.lp_queue(s) where id=s.id;
      else s.id=null; end if;
    end if;
  else
    sid=(p_command->>'session_id')::uuid;
    select * into s from public.lp_sessions where id=sid and owner=u for update;
    if not found then raise exception using message='LP_PERMISSION_DENIED',errcode='42501'; end if;
    perform public.lp_reconcile(s.id);
    select * into s from public.lp_sessions where id=sid;
    if s.revision<>(p_command->>'expected_revision')::integer then
      return jsonb_build_object('outcome','conflict','dashboard',public.lp_dashboard_data(u));
    end if;
    if s.status<>'active' or p_command->>'exercise_id' is distinct from s.id::text||':'||s.serial then
      raise exception using message='LP_INVALID_EXERCISE',errcode='22023';
    end if;
    select * into strict w from public.lp_session_words where session_id=s.id and word_id=s.queue[s.position+1] and owner=u;
    if action='intro_next' and s.phase='introduction' and s.exercise_state='question' and payload='{}'::jsonb then
      update public.lp_session_words set introduction=introduction+1 where session_id=s.id and word_id=w.word_id;
      update public.lp_sessions set position=position+1 where id=s.id;
      perform public.lp_advance(s.id,w.word_id);
    elsif action='answer' and s.phase<>'introduction' and s.exercise_state='question'
      and (select count(*) from jsonb_object_keys(payload))=1 and payload->>'result' in ('correct','incorrect','revealed') then
      result=payload->>'result';
      update public.lp_session_words set
        he_to_uk=he_to_uk+case when s.phase='he_to_uk' and result='correct' then 1 else 0 end,
        uk_to_he=uk_to_he+case when s.phase='uk_to_he' and result='correct' then 1 else 0 end,
        attempts_he=attempts_he+case when s.kind='review' and s.phase='he_to_uk' then 1 else 0 end,
        attempts_uk=attempts_uk+case when s.kind='review' and s.phase='uk_to_he' then 1 else 0 end,
        any_error=any_error or result<>'correct' where session_id=s.id and word_id=w.word_id;
      update public.lp_sessions set exercise_state='feedback',feedback_result=result where id=s.id;
    elsif action='next' and s.exercise_state='feedback' and payload='{}'::jsonb then
      if s.kind='review' and s.phase='uk_to_he' and (w.uk_to_he>=1 or w.attempts_uk>=2) then
        update public.lp_word_progress set last_practiced_at=now(),any_error=w.any_error where owner=u and word_id=w.word_id;
      end if;
      update public.lp_sessions set position=position+1 where id=s.id;
      perform public.lp_advance(s.id,w.word_id);
    else raise exception using message='LP_INVALID_ACTION',errcode='22023'; end if;
    update public.lp_sessions set revision=revision+1 where id=s.id;
  end if;
  insert into public.lp_receipts(owner,operation_id,fingerprint,session_id,resulting_revision)
    select u,op,fp,s.id,case when s.id is null then null else (select revision from public.lp_sessions where id=s.id) end;
  return jsonb_build_object('outcome','ok','dashboard',public.lp_dashboard_data(u));
end $$;

-- Optional approved examples use the same client and the caller's existing RLS.
-- Dynamic SQL allows migration when word_examples has not been installed yet.
create function public.lp_examples(p_ids text[]) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception using message='LP_AUTH_REQUIRED',errcode='28000'; end if;
  if cardinality(p_ids)>5 then raise exception using message='LP_INVALID_COMMAND',errcode='22023'; end if;
  execute $query$
    select coalesce(jsonb_agg(jsonb_build_object('word_id',x.word_id::text,
      'example_order',x.example_order,'sentence_he',x.sentence_he,
      'transcription_uk',x.transcription_uk,'translation_uk',x.translation_uk,'status','approved')
      order by x.word_id,x.example_order),'[]') from (
      select e.*,row_number() over(partition by e.word_id order by e.example_order) as rn
      from public.word_examples e where e.status='approved' and e.example_order in (1,2)
      and e.word_id=any($1::bigint[]) and exists(select 1 from public.words w where w.id=e.word_id and w.user_id=auth.uid())
    ) x where x.rn<=2
  $query$ into result using p_ids;
  return result;
end $$;

-- Default PostgreSQL EXECUTE TO PUBLIC is explicitly removed for ALL new functions.
revoke all on function public.lp_check_membership(),public.lp_word_done(public.lp_session_words,public.lp_sessions),
  public.lp_queue(public.lp_sessions,bigint),public.lp_advance(uuid,bigint),public.lp_reconcile(uuid),
  public.lp_review_interval(),public.lp_eligible(public.words),public.lp_dashboard_data(uuid),
  public.lp_dashboard(),public.lp_command(jsonb),public.lp_examples(text[]) from public,anon,authenticated;
grant execute on function public.lp_dashboard(),public.lp_command(jsonb),public.lp_examples(text[]) to authenticated;
commit;
