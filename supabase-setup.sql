-- =====================================================================
-- Gaden Hub: complete database setup (v2). Safe to re-run any time.
-- Supabase dashboard > SQL Editor > New query > paste ALL of this > Run.
-- This one file replaces supabase-setup.sql v1 and ADMIN-SIGNUPS.sql.
-- Keep it in sync with whatever you run, so the repo is the source of truth.
-- =====================================================================

-- ---------- tables ----------
create table if not exists docs(coll text not null,id text not null,data jsonb not null default '{}',ts bigint,primary key(coll,id));
create table if not exists staff(user_id uuid primary key);
create index if not exists docs_coll_ts on docs(coll,ts desc);
create index if not exists docs_by_ts on docs(coll,(data->>'by'),ts);   -- fast per-user rate limiting
alter table docs enable row level security; alter table staff enable row level security;

-- ---------- helpers ----------
create or replace function is_staff() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from staff where user_id=auth.uid())$$;
create or replace function uid() returns text language sql stable as $$select coalesce(auth.uid()::text,'')$$;

-- can this signed-in user write this row? upd=true means update.
-- NOTE: bans live in the 'bans' collection (v1 wrongly checked 'banned', so bans were never enforced).
create or replace function can_write(c text,i text,d jsonb,upd boolean) returns boolean language sql stable as $$
 select uid()<>'' and not exists(select 1 from docs b where b.coll='bans' and b.id=uid()) and case c
  when 'members' then i=uid()
  when 'data' then i like 'users/'||uid()||'/%'
  when 'pviews' then d->>'by'=uid() and i=(d->>'t')||'_'||uid()
  when 'reviews' then d->>'by'=uid() and d->>'sid'<>uid() and i=(d->>'sid')||'_'||uid()
     and exists(select 1 from docs m where m.coll='messages' and m.data->>'by'=uid() and m.data->>'toId'=d->>'sid')
  when 'settings' then false when 'pages' then false when 'bans' then false when 'banned' then false
  when 'adminlog' then false when 'vcounts' then false   -- staff only / server functions only
  when 'messages' then (not upd) and d->>'by'=uid()
  when 'posts' then d->>'by'=uid() or upd when 'threads' then d->>'by'=uid() or upd
  else d->>'by'=uid() end $$;

-- ---------- row level security ----------
drop policy if exists sel on docs; drop policy if exists ins on docs; drop policy if exists upd on docs; drop policy if exists del on docs;
create policy sel on docs for select using (is_staff() or case coll
  when 'messages' then data->>'by'=uid() or data->>'toId'=uid()
  when 'pviews' then data->>'t'=uid() or data->>'by'=uid()
  when 'reports' then false when 'adminlog' then false when 'banned' then false
  when 'data' then id like 'users/'||uid()||'/%'
  else true end);                                      -- 'bans' stays public: the site uses it to hide suspended members
create policy ins on docs for insert with check (is_staff() or can_write(coll,id,data,false));
create policy upd on docs for update using (is_staff() or can_write(coll,id,data,true)) with check (is_staff() or can_write(coll,id,data,true));
create policy del on docs for delete using (is_staff() or (coll<>'messages' and can_write(coll,id,data,false)));

-- ---------- guard trigger: size cap, rate limit, safe likes/replies, locked verified badge ----------
create or replace function guard() returns trigger language plpgsql security definer set search_path=public as $$
declare f text; oa jsonb; na jsonb; lim int; recent int;
begin
 if is_staff() then return new; end if;
 if octet_length(new.data::text) > 300000 then raise exception 'too large'; end if;
 -- at most N new rows per member per hour in each public collection
 if tg_op='INSERT' and new.coll in ('items','posts','threads','messages','reports','reviews','comments') then
   lim := case new.coll when 'messages' then 120 when 'comments' then 60 else 30 end;
   select count(*) into recent from docs where coll=new.coll and data->>'by'=uid()
     and ts > (extract(epoch from now())*1000)::bigint - 3600000;
   if recent >= lim then raise exception 'too many requests, please slow down'; end if;
 end if;
 -- people who do not own a post/topic may only: like it (+1) or add ONE reply of their own
 if tg_op='UPDATE' and new.coll in ('posts','threads') and coalesce(old.data->>'by','')<>uid() then
   if (new.data-'{l,c,r}'::text[])<>(old.data-'{l,c,r}'::text[]) then raise exception 'not allowed'; end if;
   if coalesce((new.data->>'l')::int,0) not between coalesce((old.data->>'l')::int,0) and coalesce((old.data->>'l')::int,0)+1 then raise exception 'not allowed'; end if;
   foreach f in array array['c','r'] loop
     oa:=coalesce(old.data->f,'[]'::jsonb); na:=coalesce(new.data->f,'[]'::jsonb);
     if na<>oa then
       if jsonb_typeof(na)<>'array' or jsonb_array_length(na)<>jsonb_array_length(oa)+1 then raise exception 'not allowed'; end if;
       if (na-(jsonb_array_length(na)-1))<>oa then raise exception 'not allowed'; end if;
       if (na->(jsonb_array_length(na)-1))->>'b'<>uid() then raise exception 'not allowed'; end if;
     end if;
   end loop;
 end if;
 -- nobody but staff may set verified
 if new.coll='members' then new.data=jsonb_set(new.data,'{verified}',coalesce(case when tg_op='UPDATE' then old.data->'verified' end,'false'::jsonb)); end if;
 return new; end $$;
drop trigger if exists docs_guard on docs; create trigger docs_guard before insert or update on docs for each row execute function guard();

drop policy if exists "staff self" on staff;
create policy "staff self" on staff for select using (user_id=auth.uid());

-- ---------- server functions the website calls ----------
-- Atomic edit (no more lost updates when two people act at once). Runs with the caller's own permissions.
create or replace function merge_doc(c text,i text,patch jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if patch is null or jsonb_typeof(patch)<>'object' then raise exception 'bad patch'; end if;
 update docs set data=data||patch where coll=c and id=i;
 get diagnostics n=row_count; return n>0;
end $$;

-- Atomic reply on a post or forum topic
create or replace function append_item(c text,i text,f text,entry jsonb) returns boolean language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if c not in ('posts','threads') or f not in ('c','r') or jsonb_typeof(entry)<>'object' then raise exception 'bad request'; end if;
 update docs set data=jsonb_set(data,array[f],coalesce(data->f,'[]'::jsonb)||jsonb_build_array(entry),true) where coll=c and id=i;
 get diagnostics n=row_count; return n>0;
end $$;

-- Atomic like
create or replace function add_like(c text,i text) returns boolean language plpgsql security invoker set search_path=public as $$
declare n int;
begin
 if c not in ('posts','threads') then raise exception 'bad request'; end if;
 update docs set data=jsonb_set(data,'{l}',to_jsonb(coalesce((data->>'l')::int,0)+1),true) where coll=c and id=i;
 get diagnostics n=row_count; return n>0;
end $$;

-- View counters: only +1, only for things that exist (visitors can no longer write counters directly)
create or replace function bump_view(k text) returns void language plpgsql security definer set search_path=public as $$
begin
 if k !~ '^[ibp]_[A-Za-z0-9._-]{1,80}$' then return; end if;
 if not exists(select 1 from docs where id=substr(k,3) and coll in ('items','members','posts','threads')) then return; end if;
 insert into docs(coll,id,data,ts) values('vcounts',k,jsonb_build_object('n',1),(extract(epoch from now())*1000)::bigint)
 on conflict(coll,id) do update set data=jsonb_build_object('n',coalesce((docs.data->>'n')::int,0)+1);
end $$;

-- Members delete their own account from the profile page
create or replace function delete_my_account() returns void language plpgsql security definer set search_path=public,auth as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'not signed in'; end if;
 if exists(select 1 from staff where user_id=u) then raise exception 'staff accounts must be removed by another administrator'; end if;
 delete from docs where coll in ('items','posts','threads','comments','reviews','reacts','pviews','messages','reports') and data->>'by'=u::text;
 delete from docs where coll='data' and id like 'users/'||u::text||'/%';
 delete from docs where coll in ('members','designs') and id=u::text;
 delete from auth.users where id=u;
end $$;

-- Admin "Sign-ups" screen (emails live in the private auth.users table)
create or replace function public.admin_member_accounts()
returns table (id uuid,email text,full_name text,provider text,created_at timestamptz,last_sign_in_at timestamptz,email_confirmed_at timestamptz,account_type text,province text,main_crop text)
language plpgsql security definer set search_path=public,auth as $$
begin
 if not exists (select 1 from public.staff s where s.user_id=auth.uid() and coalesce(to_jsonb(s)->>'role','admin')='admin') then raise exception 'not allowed'; end if;
 return query select u.id,u.email::text,coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),coalesce(u.raw_app_meta_data->>'provider','email'),u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.raw_user_meta_data->>'account_type',u.raw_user_meta_data->>'province',u.raw_user_meta_data->>'main_crop'
 from auth.users u order by u.created_at desc;
end $$;

-- who may call what
revoke all on function merge_doc(text,text,jsonb),append_item(text,text,text,jsonb),add_like(text,text),delete_my_account(),public.admin_member_accounts() from public,anon;
grant execute on function merge_doc(text,text,jsonb),append_item(text,text,text,jsonb),add_like(text,text),delete_my_account(),public.admin_member_accounts() to authenticated;
revoke all on function bump_view(text) from public;
grant execute on function bump_view(text) to anon,authenticated;

-- ---------- photos bucket: public read, members manage their own folder, 1 MB images only ----------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photos','photos',true,1048576,array['image/jpeg','image/png','image/webp'])
 on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists ph_r on storage.objects; drop policy if exists ph_w on storage.objects; drop policy if exists ph_d on storage.objects;
create policy ph_r on storage.objects for select using(bucket_id='photos');
create policy ph_w on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy ph_d on storage.objects for delete to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- ---------- one-time: make yourself admin ----------
-- insert into staff values ('<your auth user id>');

-- ---------- optional check: profile photos stored inside the database as text (bloats every page load) ----------
-- select id, length(data->>'photo') as chars from docs where coll='members' and data->>'photo' like 'data:%' order by 2 desc;
