create table public.consultant_notifications (
 quote_id uuid primary key references public.quote_requests(id) on delete cascade,
 created_at timestamptz not null default now(), sent_at timestamptz, provider_id text,
 attempts integer not null default 0, last_attempt timestamptz not null default '1970-01-01', last_error text
);
alter table public.consultant_notifications enable row level security;
revoke all on public.consultant_notifications from public,anon,authenticated;
grant all on public.consultant_notifications to service_role;
alter table public.quote_requests drop constraint quote_requests_language_check;
alter table public.quote_requests add constraint quote_requests_language_check check(language in ('ru','en','he'));
create or replace function public.consultant_submit(p_hash text,p_draft jsonb) returns bigint
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
 values('website',case when p_draft->>'language' in ('en','he') then p_draft->>'language' else 'ru' end,p_draft->>'customer_name',p_draft->>'phone',coalesce(p_draft->>'email',''),p_draft->>'destination',w,p_draft->>'contents',msg,true) returning id,request_number into q,n;
 update public.conversations set quote_request_id=q,draft=p_draft||'{"confirmed":true}'::jsonb,customer_name=p_draft->>'customer_name',phone=p_draft->>'phone',email=coalesce(p_draft->>'email',''),topic='Заявка из ИИ-чата',status='new' where id=c.id;
 insert into public.conversation_messages(conversation_id,role,body) values(c.id,'system','Клиент подтвердил данные и согласие. Создана заявка №'||n::text);
 insert into public.consultant_notifications(quote_id) values(q) on conflict do nothing;
 return n;
end $$;

-- Recover notification for already saved AI applications, without resubmitting them.
insert into public.consultant_notifications(quote_id)
select quote_request_id from public.conversations where channel='website_ai' and quote_request_id is not null
on conflict do nothing;
