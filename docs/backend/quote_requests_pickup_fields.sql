-- Вызов курьера с сайта: город, адрес и желаемый день забора, оценка цены по тарифу.
-- Применяется к проекту Supabase «Admiral Express». Только добавляет колонки и обновляет передачу в AlilPost Ops.
alter table public.quote_requests
  add column if not exists pickup_city text,
  add column if not exists pickup_address text,
  add column if not exists pickup_date date,
  add column if not exists estimated_price numeric;

-- Передача в AlilPost Ops: город, адрес и день берутся и из полей заявки (раньше только из диалога с Евой).
-- Отличия от действующей версии: строки 'city', 'address', 'planned_date' и текст комментария.
create or replace function admiral_integrations.deliver_ops()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r record; q public.quote_requests; d jsonb; src text; api_key text; payload jsonb; result jsonb; http_id bigint; response record;
begin
 if not pg_try_advisory_xact_lock(70911606) then return; end if;
 for r in select * from admiral_integrations.ops_outbox where delivered_at is null and next_attempt<=now() order by created_at limit 30 for update skip locked loop
 begin
  if r.request_id is not null then
   select * into response from net._http_response where id=r.request_id;
   if found then
    if response.status_code between 200 and 299 then
     result=response.content::jsonb;
     if result->>'ok'='true' and result->>'order_id' ~ '^[0-9]+$' then
      update admiral_integrations.ops_outbox set delivered_at=now(),ops_order_id=(result->>'order_id')::bigint,last_error=null where quote_id=r.quote_id;
      continue;
     end if;
    end if;
    update admiral_integrations.ops_outbox set last_error='HTTP '||coalesce(response.status_code::text,'timeout') where quote_id=r.quote_id;
   elsif r.sent_at>now()-interval '2 minutes' then continue;
   end if;
  end if;
  select * into q from public.quote_requests where id=r.quote_id;
  select draft into d from public.conversations where quote_request_id=q.id limit 1;
  src=case when d is not null then 'ai' else 'site' end;
  select decrypted_secret into api_key from vault.decrypted_secrets where name='ops_intake_'||src limit 1;
  if api_key is null then raise exception 'Integration credential missing'; end if;
  payload=jsonb_build_object(
   'external_ref','admiral:'||q.id::text,
   'client_name',q.customer_name,'client_phone',q.phone,
   'city',coalesce(d->>'city',q.pickup_city),
   'address',coalesce(d->>'address',q.pickup_address,substring(q.message from 'Адрес забора: ([^\n]+)')),
   'destination_country',q.destination,'weight',q.weight_kg,
   'planned_date',q.pickup_date,
   'order_type','pickup',
   'comment',concat_ws(E'\n','Admiral Post №'||q.request_number::text,
    case when src='ai' then 'Источник: Ева' else 'Источник: сайт' end,
    'Содержимое: '||nullif(q.contents,''),nullif(q.message,''),'Email: '||nullif(q.email,''),
    'Оценка по тарифу сайта: ₪'||q.estimated_price::text,
    case when q.pickup_date is not null then 'День выбран клиентом на сайте и требует подтверждения.' else 'Желаемый день требует согласования с курьером.' end)
  );
  http_id=net.http_post(url:='https://rjkthnfgxysegyalezvy.supabase.co/functions/v1/ops-intake',
   body:=payload,headers:=jsonb_build_object('Content-Type','application/json','x-api-key',api_key),timeout_milliseconds:=15000);
  update admiral_integrations.ops_outbox set request_id=http_id,sent_at=now(),attempts=attempts+1,
   next_attempt=now()+make_interval(secs=>least(3600,60*(1<<least(attempts,6)))) where quote_id=r.quote_id;
 exception when others then
  update admiral_integrations.ops_outbox set last_error=sqlstate,next_attempt=now()+interval '5 minutes' where quote_id=r.quote_id;
 end;
 end loop;
end $function$;
