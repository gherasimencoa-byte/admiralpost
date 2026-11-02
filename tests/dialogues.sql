begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users where raw_app_meta_data->>'is_admin'='true' limit 1),'role','authenticated','app_metadata',jsonb_build_object('is_admin',true))::text,true);
set local role authenticated;
do $$
declare cid uuid; q1 uuid; q2 uuid; payload jsonb;
begin
 if auth.uid() is null then raise exception 'Admin fixture required'; end if;
 insert into public.conversations(customer_name) values('QA temporary') returning id into cid;
 payload=jsonb_build_object('customer_name','QA temporary','phone','0000000000','email','test@example.invalid','destination','Test','weight_kg',12,'consent',true,'confirmed',true);
 update public.conversations set draft=payload-'consent'-'confirmed',assigned_to=auth.uid() where id=cid;
 insert into public.conversation_messages(conversation_id,role,body,author_id,external_id) values(cid,'customer','QA test message',auth.uid(),'qa-idempotent');
 begin
 insert into public.conversation_messages(conversation_id,role,body,author_id,external_id) values(cid,'customer','QA test message',auth.uid(),'qa-idempotent');
 raise exception 'Duplicate message allowed' using errcode='ZX001';
 exception when unique_violation then null; end;
 update public.conversations set assigned_to=null,status='new' where id=cid;
 if not exists(select 1 from public.conversations where id=cid and assigned_to is null and status='new' and draft->>'weight_kg'='12') then raise exception 'Handoff lost draft'; end if;
 q1=public.convert_conversation(cid,payload);q2=public.convert_conversation(cid,payload);
 if q1<>q2 or (select count(*) from public.quote_requests where id=q1)<>1 then raise exception 'Deduplication failed'; end if;
 if (select count(*) from public.conversation_messages where conversation_id=cid)<>2 then raise exception 'History failed'; end if;
 insert into public.conversations default values returning id into cid;
 begin
 perform public.convert_conversation(cid,payload||'{"consent":false}'::jsonb);
 raise exception 'Expected consent rejection' using errcode='ZX001';
 exception when sqlstate 'P0001' then null; end;
 if (select quote_request_id from public.conversations where id=cid) is not null then raise exception 'Partial conversion'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","app_metadata":{"is_admin":false}}',true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.conversations)<>0 then raise exception 'Nonadmin read leak'; end if;
 begin
 insert into public.conversations default values;
 raise exception 'Nonadmin insert allowed' using errcode='ZX001';
 exception when insufficient_privilege then null; end;
 begin
 perform public.convert_conversation(gen_random_uuid(),'{}');
 raise exception 'Nonadmin conversion allowed' using errcode='ZX001';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.conversations; raise exception 'Anonymous read allowed' using errcode='ZX001'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: persisted draft, handoff, message idempotency, conversion, idempotency, consent, RLS, anonymous denial' as result;
rollback;
