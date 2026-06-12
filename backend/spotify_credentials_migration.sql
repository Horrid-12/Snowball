drop table if exists public.spotify_credentials;

create table if not exists public.spotify_credentials (
    user_id integer primary key references public.users(id) on delete cascade,
    client_id text not null,
    client_secret text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table if exists public.spotify_credentials enable row level security;
alter table if exists public.spotify_credentials force row level security;

comment on table public.spotify_credentials is
'Stores per-user Spotify app credentials so self-hosted/dev users can authorize through their own Spotify Developer app.';
