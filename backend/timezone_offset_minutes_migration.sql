alter table public.users
add column if not exists timezone_offset_minutes integer;

comment on column public.users.timezone_offset_minutes is
'Client timezone offset in minutes from UTC, captured from the active device.';
