create table if not exists public.friendships (
    id uuid primary key default gen_random_uuid(),
    requester_id integer not null references public.users(id) on delete cascade,
    addressee_id integer not null references public.users(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'blocked')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint friendships_no_self check (requester_id <> addressee_id)
);

alter table if exists public.users
add column if not exists profile_icon text default 'snowball';

create unique index if not exists friendships_unique_pair
on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
);

create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_status_idx on public.friendships(status);

create table if not exists public.friend_presence (
    user_id integer primary key references public.users(id) on delete cascade,
    details text,
    state text,
    activity_type text not null default 'Snowball',
    remaining_tasks integer not null default 0,
    today_remaining_tasks integer not null default 0,
    score numeric not null default 0,
    updated_at timestamptz not null default now()
);

create index if not exists friend_presence_updated_idx on public.friend_presence(updated_at);

create table if not exists public.friend_messages (
    id uuid primary key default gen_random_uuid(),
    friendship_id uuid not null references public.friendships(id) on delete cascade,
    sender_id integer not null references public.users(id) on delete cascade,
    body text not null,
    created_at timestamptz not null default now()
);

create index if not exists friend_messages_friendship_created_idx
on public.friend_messages(friendship_id, created_at desc);

create index if not exists friend_messages_sender_idx on public.friend_messages(sender_id);

alter table if exists public.friendships enable row level security;
alter table if exists public.friendships force row level security;
alter table if exists public.friend_presence enable row level security;
alter table if exists public.friend_presence force row level security;
alter table if exists public.friend_messages enable row level security;
alter table if exists public.friend_messages force row level security;

comment on table public.friendships is
'Stores Snowball friend requests and accepted friendships. Access is intended through the backend service role only.';

comment on table public.friend_presence is
'Stores Discord-style Snowball activity visible to accepted friends through the backend service role only.';

comment on table public.friend_messages is
'Stores barebones one-to-one friend chat messages through the backend service role only.';
