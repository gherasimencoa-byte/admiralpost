begin;
set local role service_role;
do $$
declare h text:=repeat('b',64); c uuid; n bigint; n2 bigint; d jsonb:='{"customer_name":"TEST ROLLBACK","phone":"+972500000000","email":"","destination":"Украина","city":"Хайфа","address":"Тестовая 1","pickup_day":"Пятница","courier_note":"","contents":"Одежда","weight_kg":10,"consent":true}'::jsonb;
begin
 c=public.consultant_open(h);
 if public.consultant_open(h)<>c then raise exception 'Duplicate session'; end if;
 begin perform public.consultant_submit(h,d||'{"consent":false}'::jsonb); raise exception 'Accepted missing consent'; exception when others then if sqlerrm='Accepted missing consent' then raise; end if; end;
 n=public.consultant_submit(h,d);n2=public.consultant_submit(h,d);
 if n<>n2 then raise exception 'Duplicate application'; end if;
 if not exists(select 1 from public.conversations where id=c and quote_request_id is not null and phone='+972500000000') then raise exception 'Not linked'; end if;
 if not public.consultant_limit('test-rollback',1,60) or public.consultant_limit('test-rollback',1,60) then raise exception 'Limit broken'; end if;
end $$;
rollback;
