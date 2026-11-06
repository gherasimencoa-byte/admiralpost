
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create schema if not exists admiral_integrations;
revoke all on schema admiral_integrations from public, anon, authenticated;
create table admiral_integrations.ops_outbox (
 quote_id uuid primary key references public.quote_requests(id) on delete cascade,
 created_at timestamptz not null default now(), attempts integer not null default 0,
 next_attempt timestamptz not null default now(), request_id bigint, sent_at timestamptz,
 delivered_at timestamptz, ops_order_id bigint, last_error text
);
alter table admiral_integrations.ops_outbox enable row level security;
revoke all on admiral_integrations.ops_outbox from public, anon, authenticated;
create function admiral_integrations.enqueue_ops() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.consent and new.source='website' then
 insert into admiral_integrations.ops_outbox(quote_id) values(new.id) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function admiral_integrations.enqueue_ops() from public, anon, authenticated;
create trigger quote_to_ops after insert on public.quote_requests for each row execute function admiral_integrations.enqueue_ops();
create function admiral_integrations.deliver_ops() returns void language plpgsql security definer set search_path='' as $$
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
   'city',d->>'city','address',coalesce(d->>'address',substring(q.message from 'Адрес забора: ([^\n]+)')),
   'destination_country',q.destination,'weight',q.weight_kg,
   'order_type','pickup',
   'comment',concat_ws(E'\n','Admiral Post №'||q.request_number::text,
    case when src='ai' then 'Источник: Ева' else 'Источник: сайт' end,
    'Содержимое: '||q.contents,q.message,'Email: '||nullif(q.email,''),
    'Желаемый день требует согласования с курьером.')
  );
  http_id=net.http_post(url:='https://rjkthnfgxysegyalezvy.supabase.co/functions/v1/ops-intake',
   body:=payload,headers:=jsonb_build_object('Content-Type','application/json','x-api-key',api_key),timeout_milliseconds:=15000);
  update admiral_integrations.ops_outbox set request_id=http_id,sent_at=now(),attempts=attempts+1,
   next_attempt=now()+make_interval(secs=>least(3600,60*(1<<least(attempts,6)))) where quote_id=r.quote_id;
 exception when others then
  update admiral_integrations.ops_outbox set last_error=sqlstate,next_attempt=now()+interval '5 minutes' where quote_id=r.quote_id;
 end;
 end loop;
end $$;
revoke all on function admiral_integrations.deliver_ops() from public, anon, authenticated;
select cron.schedule('admiral-to-ops','* * * * *','select admiral_integrations.deliver_ops()');
