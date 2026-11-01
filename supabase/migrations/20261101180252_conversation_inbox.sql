-- Admin inbox. Public visitors have no direct access.
create table public.conversations (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 customer_name text not null default '' check(length(customer_name)<=120),
 phone text not null default '' check(length(phone)<=50), email text not null default '' check(length(email)<=254),
 channel text not null default 'manual' check(channel in ('manual','website_ai','website_operator')),
 status text not null default 'new' check(status in ('new','active','waiting','closed')),
 assigned_to uuid references auth.users(id) on delete set null,
 topic text not null default '' check(length(topic)<=150),
 summary text not null default '' check(length(summary)<=3000),
 draft jsonb not null default '{}'::jsonb check(jsonb_typeof(draft)='object'),
 quote_request_id uuid unique references public.quote_requests(id) on delete restrict
);
create table public.conversation_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.conversations(id) on delete cascade,
 created_at timestamptz not null default now(),
 role text not null check(role in ('customer','assistant','operator','note','system')),
 body text not null check(length(trim(body)) between 1 and 10000),
 author_id uuid references auth.users(id) on delete set null,
 external_id text,
 unique(conversation_id,external_id)
);
create index conversations_updated_idx on public.conversations(updated_at desc,id);
create index conversations_assigned_idx on public.conversations(assigned_to,status);
create index conversation_messages_order_idx on public.conversation_messages(conversation_id,created_at,id);
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
revoke all on public.conversations,public.conversation_messages from anon,authenticated;
grant select,insert,update on public.conversations to authenticated;
grant select,insert on public.conversation_messages to authenticated;
grant all on public.conversations,public.conversation_messages to service_role;
create policy admin_conversations on public.conversations for all to authenticated
 using ((auth.jwt()->'app_metadata'->>'is_admin')='true')
 with check ((auth.jwt()->'app_metadata'->>'is_admin')='true');
create policy admin_messages_read on public.conversation_messages for select to authenticated
 using ((auth.jwt()->'app_metadata'->>'is_admin')='true');
create policy admin_messages_insert on public.conversation_messages for insert to authenticated
 with check ((auth.jwt()->'app_metadata'->>'is_admin')='true' and author_id=auth.uid() and role in ('operator','note','customer'));
create trigger conversations_updated before update on public.conversations for each row execute function public.set_updated_at();
create function public.touch_conversation() returns trigger language plpgsql security invoker set search_path='' as $$
begin update public.conversations set updated_at=now() where id=new.conversation_id; return new; end $$;
create trigger conversation_activity after insert on public.conversation_messages for each row execute function public.touch_conversation();
create function public.convert_conversation(p_id uuid,p_draft jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare c public.conversations; q uuid; w numeric;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'is_admin','false')<>'true' then raise exception 'Admin required' using errcode='42501'; end if;
 select * into c from public.conversations where id=p_id for update;
 if not found then raise exception 'Conversation not found'; end if;
 if c.quote_request_id is not null then return c.quote_request_id; end if;
 if coalesce(p_draft->>'consent','false')<>'true' then raise exception 'Customer consent required'; end if;
 if coalesce(p_draft->>'confirmed','false')<>'true' then raise exception 'Application confirmation required'; end if;
 if length(trim(coalesce(p_draft->>'customer_name',''))) not between 1 and 120 or
 length(trim(coalesce(p_draft->>'phone',''))) not between 1 and 50 or
 length(coalesce(p_draft->>'email',''))>254 or coalesce(p_draft->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
 length(trim(coalesce(p_draft->>'destination',''))) not between 1 and 100 or
 length(coalesce(p_draft->>'contents',''))>500 or length(coalesce(p_draft->>'message',''))>2000 then raise exception 'Check required fields'; end if;
 w=(p_draft->>'weight_kg')::numeric;
 if w is null or w<=0 or w>1000 or w='NaN'::numeric then raise exception 'Invalid weight'; end if;
 insert into public.quote_requests(source,language,customer_name,phone,email,destination,weight_kg,contents,message,consent)
 values('admin','ru',trim(p_draft->>'customer_name'),trim(p_draft->>'phone'),trim(p_draft->>'email'),trim(p_draft->>'destination'),w,coalesce(p_draft->>'contents',''),coalesce(p_draft->>'message',''),true) returning id into q;
 update public.conversations set quote_request_id=q,draft=p_draft,customer_name=trim(p_draft->>'customer_name'),phone=trim(p_draft->>'phone'),email=trim(p_draft->>'email') where id=p_id;
 insert into public.conversation_messages(conversation_id,role,body,author_id) values(p_id,'note','Создана заявка '||q::text,auth.uid());
 return q;
end $$;
revoke all on function public.convert_conversation(uuid,jsonb) from public,anon;
grant execute on function public.convert_conversation(uuid,jsonb) to authenticated;
revoke all on function public.touch_conversation() from public,anon,authenticated;
