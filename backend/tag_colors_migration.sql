alter table if exists public.users
add column if not exists tag_colors jsonb;

comment on column public.users.tag_colors is
'User-defined tag colors dictionary synced across devices';
