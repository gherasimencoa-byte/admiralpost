create schema if not exists admiral_access;
revoke all on schema admiral_access from public, anon, authenticated;
grant usage on schema admiral_access to authenticated;

create function admiral_access.can_manage_operations() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'is_admin'='true')
$$;

create function admiral_access.change_admin(account_email text, enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'is_owner'='true') then
    raise exception 'Доступ разрешён только владельцу' using errcode='42501';
  end if;
  if enabled is null then raise exception 'Укажите действие'; end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('is_admin',enabled)
    where lower(email)=lower(trim(account_email)) and email_confirmed_at is not null and deleted_at is null
    and coalesce(raw_app_meta_data->>'is_owner','false') <> 'true';
  if not found then raise exception 'Проверьте адрес: требуется подтверждённый аккаунт, доступный для изменения'; end if;
end
$$;

create function public.admiral_change_admin(account_email text, enabled boolean) returns void
language sql security invoker set search_path='' as $$
  select admiral_access.change_admin(account_email, enabled)
$$;
revoke all on function admiral_access.can_manage_operations(), admiral_access.change_admin(text,boolean), public.admiral_change_admin(text,boolean) from public, anon;
grant execute on function admiral_access.can_manage_operations(), admiral_access.change_admin(text,boolean), public.admiral_change_admin(text,boolean) to authenticated;

alter policy "admin manages quote requests" on public.quote_requests using ((select admiral_access.can_manage_operations())) with check ((select admiral_access.can_manage_operations()));
alter policy "admin manages shipments" on public.shipments using ((select admiral_access.can_manage_operations())) with check ((select admiral_access.can_manage_operations()));
alter policy admin_conversations on public.conversations using ((select admiral_access.can_manage_operations())) with check ((select admiral_access.can_manage_operations()));
alter policy admin_messages_read on public.conversation_messages using ((select admiral_access.can_manage_operations()));
alter policy admin_messages_insert on public.conversation_messages with check ((select admiral_access.can_manage_operations()) and author_id=auth.uid() and role in ('operator','note','customer'));
