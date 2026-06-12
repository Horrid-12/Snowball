alter table public.users
add column if not exists penalty_buffer_hours integer not null default 3;

comment on column public.users.penalty_buffer_hours is
'Overdue penalty grace window in hours. Use -1 to disable overdue penalties.';
