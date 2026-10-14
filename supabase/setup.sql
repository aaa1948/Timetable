-- Run once in your Supabase project's SQL Editor. Safe to re-run.
-- Room codes are bearer capabilities. Direct table reads/writes are forbidden.
create table if not exists public.scene_rooms (
  code text primary key,
  room jsonb not null
);
alter table public.scene_rooms enable row level security;
revoke all on public.scene_rooms from public, anon, authenticated;

create or replace function public.scene_create_room(p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c text; r jsonb;
begin
  if p_name is null or length(trim(p_name)) not between 1 and 60 then
    raise exception '프로젝트 이름은 1~60자로 입력해 주세요.';
  end if;
  c := replace(gen_random_uuid()::text, '-', '');
  r := jsonb_build_object('name',trim(p_name),'members','[]'::jsonb,'blocks','[]'::jsonb,
    'locations','[]'::jsonb,'updatedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint);
  insert into public.scene_rooms(code,room) values(c,r);
  return jsonb_build_object('code',c,'room',r);
end $$;

create or replace function public.scene_get_room(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  select room into r from public.scene_rooms where code=p_code;
  if r is null then raise exception '팀 공간을 찾을 수 없습니다. 초대 링크를 확인해 주세요.'; end if;
  return r;
end $$;

create or replace function public.scene_save_room(p_code text, p_version bigint, p_room jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous jsonb; r jsonb; item jsonb; x jsonb; a integer; b integer; d integer;
begin
  -- Lock and version check prevent concurrent clients from overwriting changes.
  select room into previous from public.scene_rooms where code=p_code for update;
  if previous is null then raise exception '팀 공간을 찾을 수 없습니다.'; end if;
  if p_version is distinct from (previous->>'updatedAt')::bigint then raise exception 'SCENE_CONFLICT'; end if;
  if p_room is null or jsonb_typeof(p_room) <> 'object'
    or coalesce(jsonb_typeof(p_room->'members'),'') <> 'array'
    or coalesce(jsonb_typeof(p_room->'blocks'),'') <> 'array'
    or coalesce(jsonb_typeof(p_room->'locations'),'') <> 'array'
    or length(p_room::text) > 115000000 then raise exception '잘못된 팀 데이터입니다.'; end if;
  if jsonb_array_length(p_room->'members')>30 or jsonb_array_length(p_room->'blocks')>1500
    or jsonb_array_length(p_room->'locations')>40 then raise exception '등록 가능한 항목 수를 초과했습니다.'; end if;
  for item in select value from jsonb_array_elements(p_room->'members') loop
    if coalesce(length(trim(item->>'name')),0) not between 1 and 30
      or coalesce(item->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}
      or coalesce(jsonb_typeof(item->'confirmed'),'') <> 'boolean' then raise exception '잘못된 팀원 정보입니다.'; end if;
  end loop;
  if (select count(distinct value->>'name') from jsonb_array_elements(p_room->'members')) <> jsonb_array_length(p_room->'members')
    or (select count(distinct value->>'id') from jsonb_array_elements(p_room->'members')) <> jsonb_array_length(p_room->'members') then raise exception '중복된 팀원입니다.'; end if;
  for item in select value from jsonb_array_elements(p_room->'blocks') loop
    if coalesce(item->>'start','') !~ '^\d+$' or coalesce(item->>'end','') !~ '^\d+$' or coalesce(item->>'day','') !~ '^\d+$' then raise exception '잘못된 시간입니다.'; end if;
    a := (item->>'start')::integer; b := (item->>'end')::integer; d := (item->>'day')::integer;
    if a<0 or b>48 or a>=b or d<0 or d>6
      or coalesce(length(trim(item->>'reason')),0) not between 1 and 160
      or coalesce(length(item->>'id'),0) not between 1 and 64
      or not exists(select 1 from jsonb_array_elements(p_room->'members') m where m->>'id'=item->>'memberId') then raise exception '잘못된 일정입니다.'; end if;
    -- Existing half-hour records may be retained; newly added/changed blocks must be hourly.
    if (a%2<>0 or b%2<>0) and not (previous->'blocks' @> jsonb_build_array(item)) then raise exception '1시간 단위로 입력해 주세요.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_room->'locations') loop
    if coalesce(length(trim(item->>'author')),0) not between 1 and 30
      or coalesce(length(trim(item->>'name')),0) not between 1 and 120
      or coalesce(length(trim(item->>'address')),0) not between 1 and 200
      or coalesce(length(item->>'id'),0) not between 1 and 64
      or coalesce(length(item->>'note'),0)>400
      or coalesce(length(item->>'photo'),0)>2800000 then raise exception '잘못된 장소 정보입니다.'; end if;
    if coalesce(item->>'photo','') <> '' and (item->>'photo') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception '지원하지 않는 사진입니다.'; end if;
  end loop;
  r := jsonb_build_object('name',previous->'name','members',p_room->'members','blocks',p_room->'blocks','locations',p_room->'locations',
    'updatedAt',greatest((previous->>'updatedAt')::bigint+1,floor(extract(epoch from clock_timestamp())*1000)::bigint));
  update public.scene_rooms set room=r where code=p_code;
  return r;
end $$;

revoke all on function public.scene_create_room(text) from public;
revoke all on function public.scene_get_room(text) from public;
revoke all on function public.scene_save_room(text,bigint,jsonb) from public;
grant execute on function public.scene_create_room(text) to anon, authenticated;
grant execute on function public.scene_get_room(text) to anon, authenticated;
grant execute on function public.scene_save_room(text,bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

      or coalesce(jsonb_typeof(item->'confirmed'),'') <> 'boolean' then raise exception '잘못된 팀원 정보입니다.'; end if;
  end loop;
  if (select count(distinct value->>'name') from jsonb_array_elements(p_room->'members')) <> jsonb_array_length(p_room->'members')
    or (select count(distinct value->>'id') from jsonb_array_elements(p_room->'members')) <> jsonb_array_length(p_room->'members') then raise exception '중복된 팀원입니다.'; end if;
  for item in select value from jsonb_array_elements(p_room->'blocks') loop
    if coalesce(item->>'start','') !~ '^\d+$' or coalesce(item->>'end','') !~ '^\d+$' or coalesce(item->>'day','') !~ '^\d+$' then raise exception '잘못된 시간입니다.'; end if;
    a := (item->>'start')::integer; b := (item->>'end')::integer; d := (item->>'day')::integer;
    if a<0 or b>48 or a>=b or d<0 or d>6
      or coalesce(length(trim(item->>'reason')),0) not between 1 and 160
      or coalesce(item->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}
      or not exists(select 1 from jsonb_array_elements(p_room->'members') m where m->>'id'=item->>'memberId') then raise exception '잘못된 일정입니다.'; end if;
    -- Existing half-hour records may be retained; newly added/changed blocks must be hourly.
    if (a%2<>0 or b%2<>0) and not (previous->'blocks' @> jsonb_build_array(item)) then raise exception '1시간 단위로 입력해 주세요.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_room->'locations') loop
    if coalesce(length(trim(item->>'author')),0) not between 1 and 30
      or coalesce(length(trim(item->>'name')),0) not between 1 and 120
      or coalesce(length(trim(item->>'address')),0) not between 1 and 200
      or coalesce(length(item->>'id'),0) not between 1 and 64
      or coalesce(length(item->>'note'),0)>400
      or coalesce(length(item->>'photo'),0)>2800000 then raise exception '잘못된 장소 정보입니다.'; end if;
    if coalesce(item->>'photo','') <> '' and (item->>'photo') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception '지원하지 않는 사진입니다.'; end if;
  end loop;
  r := jsonb_build_object('name',previous->'name','members',p_room->'members','blocks',p_room->'blocks','locations',p_room->'locations',
    'updatedAt',greatest((previous->>'updatedAt')::bigint+1,floor(extract(epoch from clock_timestamp())*1000)::bigint));
  update public.scene_rooms set room=r where code=p_code;
  return r;
end $$;

revoke all on function public.scene_create_room(text) from public;
revoke all on function public.scene_get_room(text) from public;
revoke all on function public.scene_save_room(text,bigint,jsonb) from public;
grant execute on function public.scene_create_room(text) to anon, authenticated;
grant execute on function public.scene_get_room(text) to anon, authenticated;
grant execute on function public.scene_save_room(text,bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

      or not exists(select 1 from jsonb_array_elements(p_room->'members') m where m->>'id'=item->>'memberId') then raise exception '잘못된 일정입니다.'; end if;
    -- Existing half-hour records may be retained; newly added/changed blocks must be hourly.
    if (a%2<>0 or b%2<>0) and not (previous->'blocks' @> jsonb_build_array(item)) then raise exception '1시간 단위로 입력해 주세요.'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_room->'locations') loop
    if coalesce(length(trim(item->>'author')),0) not between 1 and 30
      or coalesce(length(trim(item->>'name')),0) not between 1 and 120
      or coalesce(length(trim(item->>'address')),0) not between 1 and 200
      or coalesce(item->>'id','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}
      or coalesce(length(item->>'note'),0)>400
      or coalesce(length(item->>'photo'),0)>2800000 then raise exception '잘못된 장소 정보입니다.'; end if;
    if coalesce(item->>'photo','') <> '' and (item->>'photo') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception '지원하지 않는 사진입니다.'; end if;
  end loop;
  r := jsonb_build_object('name',previous->'name','members',p_room->'members','blocks',p_room->'blocks','locations',p_room->'locations',
    'updatedAt',greatest((previous->>'updatedAt')::bigint+1,floor(extract(epoch from clock_timestamp())*1000)::bigint));
  update public.scene_rooms set room=r where code=p_code;
  return r;
end $$;

revoke all on function public.scene_create_room(text) from public;
revoke all on function public.scene_get_room(text) from public;
revoke all on function public.scene_save_room(text,bigint,jsonb) from public;
grant execute on function public.scene_create_room(text) to anon, authenticated;
grant execute on function public.scene_get_room(text) to anon, authenticated;
grant execute on function public.scene_save_room(text,bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';

      or coalesce(length(item->>'note'),0)>400
      or coalesce(length(item->>'photo'),0)>2800000 then raise exception '잘못된 장소 정보입니다.'; end if;
    if coalesce(item->>'photo','') <> '' and (item->>'photo') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception '지원하지 않는 사진입니다.'; end if;
  end loop;
  r := jsonb_build_object('name',previous->'name','members',p_room->'members','blocks',p_room->'blocks','locations',p_room->'locations',
    'updatedAt',greatest((previous->>'updatedAt')::bigint+1,floor(extract(epoch from clock_timestamp())*1000)::bigint));
  update public.scene_rooms set room=r where code=p_code;
  return r;
end $$;

revoke all on function public.scene_create_room(text) from public;
revoke all on function public.scene_get_room(text) from public;
revoke all on function public.scene_save_room(text,bigint,jsonb) from public;
grant execute on function public.scene_create_room(text) to anon, authenticated;
grant execute on function public.scene_get_room(text) to anon, authenticated;
grant execute on function public.scene_save_room(text,bigint,jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
