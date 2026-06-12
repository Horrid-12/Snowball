alter table public.users
add column if not exists appearance_settings jsonb;

comment on column public.users.appearance_settings is
'Cross-device dashboard appearance preferences such as theme, custom colors, and widget visibility.';
