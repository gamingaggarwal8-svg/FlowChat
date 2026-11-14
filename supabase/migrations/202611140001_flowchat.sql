-- Run once in a new Supabase project. All business data is isolated by membership.
revoke create on schema public from public,authenticated;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.businesses(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table public.business_members(business_id uuid references public.businesses on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in ('owner','accountant','viewer')),primary key(business_id,user_id));
create or replace function public.business_role(b uuid) returns text language sql stable security definer set search_path=public,extensions,pg_temp as $$ select role from business_members where business_id=b and user_id=auth.uid() $$;
revoke all on function public.business_role(uuid) from public; grant execute on function public.business_role(uuid) to authenticated;
create function public.create_business(p_name text) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare b uuid; begin if auth.uid() is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Sign in and enter a business name';end if;
if (select count(*) from business_members where user_id=auth.uid())>=10 then raise exception 'Workspace limit reached';end if;
insert into businesses(name) values(trim(p_name)) returning id into b;insert into business_members values(b,auth.uid(),'owner');return b;end $$;
create function public.add_business_member(p_business uuid,p_email text,p_role text) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare u uuid;begin if coalesce(business_role(p_business),'')<>'owner' or p_role not in ('accountant','viewer') then raise exception 'Owner role required';end if;
select id into u from auth.users where lower(email)=lower(trim(p_email));if u is null then raise exception 'Ask this teammate to sign up first';end if;
if exists(select 1 from business_members where business_id=p_business and user_id=u and role='owner') then raise exception 'Owner role is protected';end if;
insert into business_members values(p_business,u,p_role) on conflict(business_id,user_id) do update set role=excluded.role;end $$;
create table public.chat_imports(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,customer text not null,content_hash text not null,chat_text text not null,extraction jsonb,created_at timestamptz not null default now(),unique(business_id,content_hash));
create table public.accounting_documents(id uuid primary key,business_id uuid not null references businesses,name text not null,kind text not null check(kind in ('Sales invoice','Purchase bill','Payment receipt','GST document')),storage_path text not null,details jsonb,reviewed boolean not null default false,created_at timestamptz not null default now());
create table public.record_versions(business_id uuid not null references businesses,kind text not null check(kind in ('inventory','payment_received','payment_sent','sales_invoice','purchase_invoice')),record_id text not null,revision int not null,payload jsonb not null,content_hash text not null,created_at timestamptz not null default now(),created_by uuid,primary key(business_id,kind,record_id,revision));
create table public.sync_runs(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,source text not null,inserted int not null,unchanged int not null,created_at timestamptz not null default now(),created_by uuid);
create table public.ai_cache(business_id uuid not null references businesses,cache_key text not null,payload jsonb not null,created_at timestamptz not null default now(),primary key(business_id,cache_key));
create table public.ai_usage(business_id uuid not null references businesses,minute timestamptz not null,count int not null default 0,primary key(business_id,minute));
create table public.excel_connections(business_id uuid primary key references businesses,drive_id text not null,item_id text not null,credentials text not null,etag text,last_synced_at timestamptz,updated_at timestamptz not null default now());
create table public.subscriptions(id uuid primary key default gen_random_uuid(),business_id uuid not null references businesses,provider_id text unique,plan text not null check(plan in ('starter','pro')),status text not null default 'created',current_end timestamptz,created_at timestamptz not null default now());
create unique index one_live_subscription on public.subscriptions(business_id) where status in ('created','authenticated','active','pending','halted','paused');
create table public.billing_events(id text primary key,business_id uuid not null references businesses,subscription_id text,amount_paise bigint not null default 0,status text not null,created_at timestamptz not null default now());
create table public.webhook_events(id text primary key,created_at timestamptz not null default now());
create table public.whatsapp_messages(id text primary key,business_id uuid not null references businesses,payload jsonb not null,created_at timestamptz not null default now());
create table public.whatsapp_numbers(phone_number_id text primary key,business_id uuid not null references businesses);
-- RLS is enabled even on server-only tables. No browser access to secrets or webhook mutations.
do $$ declare t text;begin foreach t in array array['businesses','business_members','chat_imports','accounting_documents','record_versions','sync_runs','ai_cache','ai_usage','excel_connections','subscriptions','billing_events','webhook_events','whatsapp_messages','whatsapp_numbers'] loop execute format('alter table public.%I enable row level security',t);end loop;end $$;
create policy businesses_read on businesses for select to authenticated using(business_role(id) is not null);
create policy members_read on business_members for select to authenticated using(business_role(business_id) is not null);
do $$ declare t text;begin foreach t in array array['chat_imports','accounting_documents','record_versions','sync_runs','subscriptions','billing_events','whatsapp_messages'] loop execute format('create policy business_read on public.%I for select to authenticated using(public.business_role(business_id) is not null)',t);end loop;
foreach t in array array['chat_imports','accounting_documents','ai_cache'] loop execute format('create policy business_write on public.%I for all to authenticated using(public.business_role(business_id) in (''owner'',''accountant'')) with check(public.business_role(business_id) in (''owner'',''accountant''))',t);end loop;end $$;
create policy excel_owner on excel_connections for all to authenticated using(business_role(business_id)='owner') with check(business_role(business_id)='owner');
-- Financial records are append-only. Neither UPDATE nor DELETE has an authenticated policy.
create function public.sync_records(p_business uuid,p_source text,p_rows jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare r jsonb;prev record;h text;n int:=0;u int:=0;begin
if auth.role()<>'service_role' and coalesce(business_role(p_business),'') not in ('owner','accountant') then raise exception 'Writer role required';end if;
if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 5000 then raise exception 'Invalid batch';end if;
perform 1 from businesses where id=p_business for update;if not found then raise exception 'Unknown business';end if;
if exists(select 1 from jsonb_array_elements(p_rows) x group by x->>'kind',x->>'id' having count(*)>1) then raise exception 'Duplicate IDs in batch';end if;
for r in select * from jsonb_array_elements(p_rows) loop
if coalesce(r->>'kind','') not in ('inventory','payment_received','payment_sent','sales_invoice','purchase_invoice') or length(coalesce(r->>'id','')) not between 1 and 120 or coalesce(r->>'status','') not in ('active','void') then raise exception 'Invalid record';end if;
if jsonb_typeof(r->'amount')<>'number' or jsonb_typeof(r->'qty')<>'number' then raise exception 'Invalid numeric types';end if;
if r->>'kind' in ('sales_invoice','purchase_invoice') and (r->>'due_date') is null then raise exception 'Invoice due date required';end if;
if (r->>'amount')::numeric>1000000000000 or (r->>'qty')::numeric>1000000000000 then raise exception 'Values exceed limit';end if;
if coalesce(r->>'date','')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date format';end if;
if r->>'kind' in ('sales_invoice','purchase_invoice') then perform (r->>'due_date')::date;if (r->>'due_date')!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid due date';end if;end if;
if (r->>'date') is null or (r->>'date')::date is null or (r->>'amount') is null or (r->>'amount')::numeric<0 or (r->>'qty') is null or (r->>'qty')::numeric<0 then raise exception 'Invalid values';end if;
if r->>'kind'='inventory' and r->>'id'<>r->>'sku' then raise exception 'Inventory ID must equal SKU';end if;
h:=encode(digest(r::text,'sha256'),'hex');
select revision,content_hash into prev from record_versions where business_id=p_business and kind=r->>'kind' and record_id=r->>'id' order by revision desc limit 1;
if found and prev.content_hash=h then u:=u+1;else insert into record_versions values(p_business,r->>'kind',r->>'id',coalesce(prev.revision,0)+1,r,h,now(),auth.uid());n:=n+1;end if;
end loop;
insert into sync_runs(business_id,source,inserted,unchanged,created_by) values(p_business,left(p_source,200),n,u,auth.uid());return jsonb_build_object('inserted',n,'unchanged',u);end $$;
create function public.consume_ai_quota(p_business uuid) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare c int;begin if coalesce(business_role(p_business),'') not in ('owner','accountant') then return false;end if;
perform 1 from businesses where id=p_business for update;
if (select coalesce(sum(count),0) from ai_usage where business_id=p_business and minute>now()-interval '24 hours')>=100 then return false;end if;
insert into ai_usage values(p_business,date_trunc('minute',now()),1) on conflict(business_id,minute) do update set count=ai_usage.count+1 returning count into c;return c<=10;end $$;
create function public.record_billing_event(p_id text,p_business uuid,p_subscription text,p_amount bigint,p_status text,p_state text,p_end timestamptz) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin if auth.role()<>'service_role' then raise exception 'Server only';end if;
insert into webhook_events(id) values(p_id) on conflict do nothing;if not found then return;end if;
insert into billing_events(id,business_id,subscription_id,amount_paise,status) values(p_id,p_business,p_subscription,p_amount,p_status);
if p_state is not null then update subscriptions set status=p_state,current_end=p_end where business_id=p_business and provider_id=p_subscription and status not in ('cancelled','completed','expired');end if;end $$;
revoke all on function public.create_business(text),public.add_business_member(uuid,text,text),public.sync_records(uuid,text,jsonb),public.consume_ai_quota(uuid),public.record_billing_event(text,uuid,text,bigint,text,text,timestamptz) from public;
grant execute on function public.create_business(text),public.add_business_member(uuid,text,text),public.sync_records(uuid,text,jsonb),public.consume_ai_quota(uuid) to authenticated;
grant execute on function public.sync_records(uuid,text,jsonb),public.record_billing_event(text,uuid,text,bigint,text,text,timestamptz) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('accounting','accounting',false,10485760,array['application/pdf']) on conflict(id) do nothing;
create policy accounting_storage_read on storage.objects for select to authenticated using(bucket_id='accounting' and public.business_role((storage.foldername(name))[1]::uuid) is not null);
create policy accounting_storage_insert on storage.objects for insert to authenticated with check(bucket_id='accounting' and public.business_role((storage.foldername(name))[1]::uuid) in ('owner','accountant'));
create policy accounting_storage_delete on storage.objects for delete to authenticated using(bucket_id='accounting' and public.business_role((storage.foldername(name))[1]::uuid) in ('owner','accountant'));
alter table public.excel_connections add column lease_until timestamptz,add column lease_token uuid;

create view public.current_record_versions with (security_invoker=true) as select distinct on (business_id,kind,record_id) * from public.record_versions order by business_id,kind,record_id,revision desc;
grant select on public.current_record_versions to authenticated,service_role;
alter table public.excel_connections add column last_error text,add column last_attempt_at timestamptz;
