-- v1 sync. All write paths that affect quotas/accounting are SECURITY DEFINER RPCs.
create extension if not exists pgcrypto with schema extensions;

create table public.service_controls (
  singleton boolean primary key default true check (singleton),
  enrollment_open boolean not null default true,
  require_google boolean not null default true,
  sync_open boolean not null default true,
  max_users integer not null default 100 check (max_users between 1 and 100),
  max_hands integer not null default 500 check (max_hands between 1 and 500),
  max_bytes integer not null default 2097152 check (max_bytes between 1024 and 2097152)
);
insert into public.service_controls (singleton) values (true);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_version integer not null default 1,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  producer_device uuid not null,
  difficulty text not null check (difficulty in ('easy', 'standard')),
  bot_version text not null check (bot_version in ('easy-v1', 'standard-v1')),
  acknowledged_sequence integer not null default -1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique (id, user_id)
);
create index sessions_user_recent on public.sessions (user_id, created_at desc);
create table public.hands (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.sessions(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  completed_at timestamptz not null,
  byte_count integer not null check (byte_count between 1 and 16384),
  record jsonb not null,
  unique (session_id, sequence)
);
create index hands_user_recent on public.hands (user_id, completed_at desc, id desc);
create table public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  hand_id uuid not null references public.hands(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, hand_id)
);
create table public.stat_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  difficulty text not null,
  bot_version text not null,
  game_config text not null default 'hu-50-100-10000',
  hands integer not null default 0,
  net_chips bigint not null default 0,
  vpip integer not null default 0,
  pfr integer not null default 0,
  showdowns integer not null default 0,
  showdown_wins integer not null default 0,
  primary key (user_id, difficulty, bot_version, game_config)
);

create or replace function public.enroll_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.service_controls%rowtype;
begin
  select * into c from public.service_controls where singleton = true for update;
  if c.require_google and coalesce(new.raw_app_meta_data->>'provider', '') <> 'google' then
    raise exception 'Google sign-in is required';
  end if;
  if not c.enrollment_open or (select count(*) from auth.users) > c.max_users then
    raise exception 'Cloud enrollment is closed';
  end if;
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.enroll_user();

create or replace function public.start_sync_session(p_session_id uuid, p_difficulty text, p_bot_version text, p_device_id uuid, p_started_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.sessions%rowtype; c public.service_controls%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles where user_id = uid for update;
  select * into c from public.service_controls where singleton = true;
  if not c.sync_open then raise exception 'Cloud sync is paused'; end if;
  if (p_difficulty = 'easy' and p_bot_version <> 'easy-v1') or (p_difficulty = 'standard' and p_bot_version <> 'standard-v1') then raise exception 'Policy mismatch'; end if;
  select * into s from public.sessions where id = p_session_id;
  if found then
    if s.user_id <> uid or s.producer_device <> p_device_id then raise exception 'Session belongs to another device'; end if;
    if s.expires_at <= now() then raise exception 'Upload session expired'; end if;
    if s.created_at <> p_started_at then raise exception 'Session start mismatch'; end if;
    return;
  end if;
  if p_started_at <= now() - interval '30 days' or p_started_at > now() + interval '5 minutes' then raise exception 'Upload session expired or invalid'; end if;
  if (select count(*) from public.sessions where user_id = uid and expires_at > now()) >= 10 then raise exception 'Active session quota reached'; end if;
  insert into public.sessions (id, user_id, producer_device, difficulty, bot_version, created_at, expires_at) values (p_session_id, uid, p_device_id, p_difficulty, p_bot_version, p_started_at, p_started_at + interval '30 days');
  delete from public.sessions where id in (select id from public.sessions where user_id = uid order by created_at desc offset 100);
end;
$$;

create or replace function public.sync_session_batch(p_session_id uuid, p_hands jsonb, p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); s public.sessions%rowtype; c public.service_controls%rowtype;
  item jsonb; n integer; hand_id uuid; seq integer; existing jsonb; bytes integer;
  did_vpip boolean; did_pfr boolean; did_showdown boolean; did_win boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform 1 from public.profiles where user_id = uid for update;
  select * into c from public.service_controls where singleton = true;
  if not c.sync_open then raise exception 'Cloud sync is paused'; end if;
  select * into s from public.sessions where id = p_session_id for update;
  if not found or s.user_id <> uid or s.producer_device <> p_device_id then raise exception 'Session unavailable'; end if;
  if s.expires_at <= now() then raise exception 'Upload session expired'; end if;
  if jsonb_typeof(p_hands) <> 'array' then raise exception 'Batch must be an array'; end if;
  n := jsonb_array_length(p_hands);
  if n < 1 or n > 10 then raise exception 'Batch size must be 1 to 10'; end if;
  for item in select value from jsonb_array_elements(p_hands) loop
    bytes := octet_length(convert_to(item::text, 'UTF8'));
    if bytes > 16384 then raise exception 'Hand exceeds 16 KiB'; end if;
    if item->>'schemaVersion' is distinct from '1'
      or item->>'sessionId' is distinct from p_session_id::text
      or item->>'difficulty' is distinct from s.difficulty
      or item->>'botVersion' is distinct from s.bot_version
      or (item->>'sessionStartedAt')::timestamptz is distinct from s.created_at
      then raise exception 'Record configuration mismatch'; end if;
    hand_id := (item->>'id')::uuid;
    seq := (item->>'sequence')::integer;
    if seq <= s.acknowledged_sequence then
      select record into existing from public.hands where session_id = p_session_id and sequence = seq;
      if found and existing <> item then raise exception 'Conflicting retained hand'; end if;
      continue;
    end if;
    if seq <> s.acknowledged_sequence + 1 then raise exception 'Out-of-order hand sequence'; end if;
    if jsonb_typeof(item->'decisions') <> 'array' or jsonb_typeof(item->'finalBoard') <> 'array' then raise exception 'Malformed hand record'; end if;
    insert into public.hands (id, user_id, session_id, sequence, completed_at, byte_count, record)
      values (hand_id, uid, p_session_id, seq, (item->>'completedAt')::timestamptz, bytes, item);
    did_vpip := exists (select 1 from jsonb_array_elements(item->'decisions') d where d#>>'{frame,actor}' = 'hero' and d#>>'{frame,street}' = 'preflop' and d#>>'{action,kind}' in ('call','raiseTo'));
    did_pfr := exists (select 1 from jsonb_array_elements(item->'decisions') d where d#>>'{frame,actor}' = 'hero' and d#>>'{frame,street}' = 'preflop' and d#>>'{action,kind}' = 'raiseTo');
    did_showdown := coalesce((item->>'reachedShowdown')::boolean, false);
    did_win := coalesce((item->>'heroWonShowdown')::boolean, false);
    insert into public.stat_totals (user_id, difficulty, bot_version, hands, net_chips, vpip, pfr, showdowns, showdown_wins)
      values (uid, s.difficulty, s.bot_version, 1, (item->>'heroNet')::bigint, did_vpip::integer, did_pfr::integer, did_showdown::integer, (did_showdown and did_win)::integer)
      on conflict (user_id, difficulty, bot_version, game_config) do update set
        hands = public.stat_totals.hands + 1,
        net_chips = public.stat_totals.net_chips + excluded.net_chips,
        vpip = public.stat_totals.vpip + excluded.vpip,
        pfr = public.stat_totals.pfr + excluded.pfr,
        showdowns = public.stat_totals.showdowns + excluded.showdowns,
        showdown_wins = public.stat_totals.showdown_wins + excluded.showdown_wins;
    s.acknowledged_sequence := seq;
  end loop;
  update public.sessions set acknowledged_sequence = s.acknowledged_sequence where id = p_session_id;
  -- Delete oldest retained details; bookmarks cascade, aggregates stay independent.
  while (select count(*) > c.max_hands or coalesce(sum(byte_count),0) > c.max_bytes from public.hands where user_id = uid) loop
    delete from public.hands where id = (select id from public.hands where user_id = uid order by completed_at, id limit 1);
  end loop;
  return jsonb_build_object('acknowledged_sequence', s.acknowledged_sequence);
end;
$$;

alter table public.service_controls enable row level security;
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.hands enable row level security;
alter table public.bookmarks enable row level security;
alter table public.stat_totals enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (user_id = auth.uid());
create policy sessions_read on public.sessions for select to authenticated using (user_id = auth.uid());
create policy hands_read on public.hands for select to authenticated using (user_id = auth.uid());
create policy bookmarks_read on public.bookmarks for select to authenticated using (user_id = auth.uid());
create policy bookmarks_insert on public.bookmarks for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.hands h where h.id = hand_id and h.user_id = auth.uid()));
create policy bookmarks_delete on public.bookmarks for delete to authenticated using (user_id = auth.uid());
create policy stats_read on public.stat_totals for select to authenticated using (user_id = auth.uid());
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.sessions, public.hands, public.bookmarks, public.stat_totals to authenticated;
grant insert, delete on public.bookmarks to authenticated;
revoke all on function public.enroll_user() from public, anon, authenticated;
revoke all on function public.start_sync_session(uuid,text,text,uuid,timestamptz) from public, anon;
revoke all on function public.sync_session_batch(uuid,jsonb,uuid) from public, anon;
grant execute on function public.start_sync_session(uuid,text,text,uuid,timestamptz) to authenticated;
grant execute on function public.sync_session_batch(uuid,jsonb,uuid) to authenticated;
