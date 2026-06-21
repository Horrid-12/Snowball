create table if not exists public.rate_limits (
    key       text primary key,       -- 'ip:path'
    count     integer not null default 1,
    reset_at  bigint not null          -- epoch ms
);

create index if not exists rate_limits_reset_at_idx on public.rate_limits(reset_at);

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
-- No RLS policies → only service role can access (correct — this is server-side only)

create or replace function public.prune_expired_rate_limits()
returns void
language plpgsql
security definer
as $$
begin
    delete from public.rate_limits
    where reset_at <= extract(epoch from now())::bigint * 1000;
end;
$$;
