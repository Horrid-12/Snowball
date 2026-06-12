alter table if exists public.users
add column if not exists profile_icon text default 'snowball';
