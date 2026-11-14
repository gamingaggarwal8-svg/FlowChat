-- Preserve existing objects while enforcing privacy, even with legacy broad policies.
update storage.buckets set public=false,file_size_limit=4194304,allowed_mime_types=array['application/pdf'] where id='accounting';
create or replace function public.accounting_object_access(object_name text,write_access boolean) returns boolean language plpgsql stable security definer set search_path=public,extensions,pg_temp as $$
declare member_role text;begin
if auth.uid() is null then return false;end if;
select role into member_role from public.business_members where business_id::text=split_part(object_name,'/',1) and user_id=auth.uid();
return coalesce(case when write_access then member_role in ('owner','accountant') else member_role in ('owner','accountant','viewer') end,false);end $$;
-- Restrictive policies combine with AND, so an old USING(true) cannot bypass them.
create policy flowchat_accounting_read_guard on storage.objects as restrictive for select to public using(bucket_id<>'accounting' or public.accounting_object_access(name,false));
create policy flowchat_accounting_insert_guard on storage.objects as restrictive for insert to public with check(bucket_id<>'accounting' or public.accounting_object_access(name,true));
create policy flowchat_accounting_delete_guard on storage.objects as restrictive for delete to public using(bucket_id<>'accounting' or public.accounting_object_access(name,true));
create policy flowchat_accounting_update_guard on storage.objects as restrictive for update to public using(bucket_id<>'accounting') with check(bucket_id<>'accounting');
grant execute on function public.accounting_object_access(text,boolean) to public;
-- Safe path handling also avoids UUID-cast errors for unrelated/legacy storage keys.
alter policy accounting_storage_read on storage.objects using(bucket_id='accounting' and public.accounting_object_access(name,false));
alter policy accounting_storage_insert on storage.objects with check(bucket_id='accounting' and public.accounting_object_access(name,true));
alter policy accounting_storage_delete on storage.objects using(bucket_id='accounting' and public.accounting_object_access(name,true));
