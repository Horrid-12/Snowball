create table if not exists public.token_blacklist (
    jti text primary key,
    exp bigint not null,
    created_at timestamptz not null default now()
);

create index if not exists token_blacklist_exp_idx on public.token_blacklist(exp);

alter table if exists public.token_blacklist enable row level security;
alter table if exists public.token_blacklist force row level security;

-- Prune expired tokens automatically (called on read)
create or replace function public.prune_expired_blacklist()
returns void
language plpgsql
security definer
as $$
begin
    delete from public.token_blacklist
    where exp <= extract(epoch from now())::bigint;
end;
$$;
