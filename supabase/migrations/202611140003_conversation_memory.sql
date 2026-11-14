-- Personal assistant conversations remain scoped to both business and user.
create table public.ai_threads(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses,
 user_id uuid not null default auth.uid() references auth.users,title text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,business_id)
);
create table public.ai_turns(
 id uuid primary key default gen_random_uuid(),thread_id uuid not null,business_id uuid not null,
 sequence integer not null,role text not null check(role in ('user','assistant')),content text not null,
 facts jsonb,intent text,created_at timestamptz not null default now(),unique(thread_id,sequence),
 foreign key(thread_id,business_id) references public.ai_threads(id,business_id) on delete cascade
);
create index ai_threads_recent on public.ai_threads(business_id,user_id,updated_at desc);
alter table public.ai_threads enable row level security;
alter table public.ai_turns enable row level security;
create policy own_thread_read on public.ai_threads for select to authenticated using(user_id=auth.uid() and public.business_role(business_id) is not null);
create policy own_thread_delete on public.ai_threads for delete to authenticated using(user_id=auth.uid() and public.business_role(business_id) is not null);
create policy own_turn_read on public.ai_turns for select to authenticated using(exists(select 1 from public.ai_threads t where t.id=thread_id and t.business_id=ai_turns.business_id and t.user_id=auth.uid() and public.business_role(t.business_id) is not null));
-- Only the atomic RPC may append messages. Existing turns cannot be edited directly.
create function public.store_ai_exchange(p_business uuid,p_thread uuid,p_question text,p_answer text,p_facts jsonb,p_intent text) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare t uuid;next_sequence integer;begin
if auth.uid() is null or coalesce(public.business_role(p_business),'') not in ('owner','accountant') then raise exception 'Writer role required';end if;
if length(coalesce(p_question,'')) not between 1 and 1000 or length(coalesce(p_answer,'')) not between 1 and 2500 or pg_column_size(p_facts)>524288 then raise exception 'Invalid conversation payload';end if;
if coalesce(p_intent,'') not in ('receivables','payables','inventory','overview','conversations') then raise exception 'Invalid intent';end if;
if p_thread is null then insert into public.ai_threads(business_id,user_id,title) values(p_business,auth.uid(),left(trim(p_question),90)) returning id into t;
else select id into t from public.ai_threads where id=p_thread and business_id=p_business and user_id=auth.uid() for update;if t is null then raise exception 'Conversation not found';end if;end if;
select coalesce(max(sequence),0)+1 into next_sequence from public.ai_turns where thread_id=t;
insert into public.ai_turns(thread_id,business_id,sequence,role,content,facts,intent) values(t,p_business,next_sequence,'user',p_question,null,null),(t,p_business,next_sequence+1,'assistant',p_answer,p_facts,p_intent);
update public.ai_threads set updated_at=now() where id=t;return t;end $$;
revoke all on function public.store_ai_exchange(uuid,uuid,text,text,jsonb,text) from public;
grant execute on function public.store_ai_exchange(uuid,uuid,text,text,jsonb,text) to authenticated;
-- Answers that use personal history must not leak through a shared business cache.
alter table public.ai_cache add column user_id uuid default auth.uid() references auth.users;
drop policy if exists business_write on public.ai_cache;
create policy own_ai_cache on public.ai_cache for all to authenticated using(user_id=auth.uid() and public.business_role(business_id) in ('owner','accountant')) with check(user_id=auth.uid() and public.business_role(business_id) in ('owner','accountant'));
-- Garbage collection touches only disposable caches and old quota counters.
create function public.cleanup_ai_cache() returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare caches integer;counters integer;begin
if auth.role()<>'service_role' then raise exception 'Server only';end if;
delete from public.ai_cache where created_at<now()-interval '24 hours';get diagnostics caches=row_count;
delete from public.ai_usage where minute<now()-interval '48 hours';get diagnostics counters=row_count;
return jsonb_build_object('expired_caches',caches,'old_quota_counters',counters);end $$;
revoke all on function public.cleanup_ai_cache() from public;grant execute on function public.cleanup_ai_cache() to service_role;
