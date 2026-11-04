-- Public chat is accessed only through the Edge Function; tokens are stored hashed.
create table public.consultant_sessions (
 token_hash text primary key check(length(token_hash)=64),
 conversation_id uuid not null unique references public.conversations(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '7 days',
 busy_until timestamptz not null default now(),
 lock_id uuid
);
create table public.consultant_limits (key text primary key, count integer not null default 1, expires_at timestamptz not null);
alter table public.consultant_sessions enable row level security;
alter table public.consultant_limits enable row level security;
revoke all on public.consultant_sessions,public.consultant_limits from public,anon,authenticated;
grant all on public.consultant_sessions,public.consultant_limits to service_role;
create function public.consultant_limit(p_key text,p_max integer,p_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 delete from public.consultant_limits where expires_at<now();
 insert into public.consultant_limits as l(key,count,expires_at) values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set count=l.count+1 returning count into n;
 return n<=p_max;
end $$;
create function public.consultant_open(p_hash text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_hash,0));
 select conversation_id into c from public.consultant_sessions where token_hash=p_hash and expires_at>now();
 if c is not null then return c; end if;
 if exists(select 1 from public.consultant_sessions where token_hash=p_hash) then raise exception 'Session expired'; end if;
 insert into public.conversations(channel,topic) values('website_ai','Консультация на сайте') returning id into c;
 insert into public.consultant_sessions(token_hash,conversation_id) values(p_hash,c);
 return c;
end $$;
create function public.consultant_finish(p_hash text,p_lock uuid,p_user text,p_answer text,p_draft jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.consultant_sessions;
begin
 select * into s from public.consultant_sessions where token_hash=p_hash for update;
 if not found or s.lock_id is distinct from p_lock or s.expires_at<now() then raise exception 'Session changed'; end if;
 insert into public.conversation_messages(conversation_id,role,body,external_id,created_at) values
 (s.conversation_id,'customer',p_user,p_lock::text||':user',clock_timestamp()),
 (s.conversation_id,'assistant',p_answer,p_lock::text||':answer',clock_timestamp()+interval '1 millisecond');
 if p_draft is not null then update public.conversations set draft=p_draft where id=s.conversation_id and quote_request_id is null; end if;
 update public.consultant_sessions set busy_until=now(),lock_id=null where token_hash=p_hash;
end $$;
create function public.consultant_submit(p_hash text,p_draft jsonb) returns bigint
language plpgsql security invoker set search_path='' as $$
declare c public.conversations; s public.consultant_sessions; q uuid; n bigint; w numeric; f text; msg text;
begin
 select * into s from public.consultant_sessions where token_hash=p_hash and expires_at>now() for update;
 if not found then raise exception 'Invalid session'; end if;
 if s.busy_until>now() then raise exception 'Chat busy'; end if;
 select * into c from public.conversations where id=s.conversation_id for update;
 if c.quote_request_id is not null then select request_number into n from public.quote_requests where id=c.quote_request_id; return n; end if;
 if p_draft->>'consent' is distinct from 'true' then raise exception 'Consent required'; end if;
 foreach f in array array['customer_name','phone','destination','city','address','pickup_day','contents'] loop
 if length(trim(coalesce(p_draft->>f,'')))=0 or length(p_draft->>f)>500 then raise exception 'Required fields'; end if;
 end loop;
 if length(p_draft->>'customer_name')>120 or length(p_draft->>'phone')>50 or length(p_draft->>'destination')>100 or length(coalesce(p_draft->>'email',''))>254 then raise exception 'Invalid length'; end if;
 if coalesce(p_draft->>'email','')<>'' and p_draft->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email'; end if;
 w=(p_draft->>'weight_kg')::numeric;
 if w is null or w<=0 or w>1000 or w='NaN'::numeric then raise exception 'Invalid weight'; end if;
 msg='Забор: '||(p_draft->>'city')||', '||(p_draft->>'address')||E'\nЖелаемый день: '||(p_draft->>'pickup_day')||E'\nПожелания курьеру: '||coalesce(p_draft->>'courier_note','');
 if length(msg)>2000 then raise exception 'Message too long'; end if;
 insert into public.quote_requests(source,language,customer_name,phone,email,destination,weight_kg,contents,message,consent)
 values('website','ru',p_draft->>'customer_name',p_draft->>'phone',coalesce(p_draft->>'email',''),p_draft->>'destination',w,p_draft->>'contents',msg,true) returning id,request_number into q,n;
 update public.conversations set quote_request_id=q,draft=p_draft||'{"confirmed":true}'::jsonb,customer_name=p_draft->>'customer_name',phone=p_draft->>'phone',email=coalesce(p_draft->>'email',''),topic='Заявка из ИИ-чата',status='new' where id=c.id;
 insert into public.conversation_messages(conversation_id,role,body) values(c.id,'system','Клиент подтвердил данные и согласие. Создана заявка №'||n::text);
 return n;
end $$;
revoke all on function public.consultant_limit(text,integer,integer),public.consultant_open(text),public.consultant_finish(text,uuid,text,text,jsonb),public.consultant_submit(text,jsonb) from public,anon,authenticated;
grant execute on function public.consultant_limit(text,integer,integer),public.consultant_open(text),public.consultant_finish(text,uuid,text,text,jsonb),public.consultant_submit(text,jsonb) to service_role;
