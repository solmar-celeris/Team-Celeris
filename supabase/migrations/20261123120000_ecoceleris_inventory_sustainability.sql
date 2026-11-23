begin;

create table if not exists public.ecoceleris_logs (
  id uuid primary key default gen_random_uuid(),
  log_type text not null check (log_type in ('reuse','purchase','use','waste','loss','rework','training')),
  item_id uuid references public.inventory_items(id) on delete set null,
  material_label text not null default '',
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  unit text not null default 'unidade',
  hours numeric(8,2) not null default 0 check (hours >= 0),
  cycle text not null default '',
  task_reference text not null default '',
  responsible_id uuid references public.profiles(user_id) on delete set null,
  destination text not null default '',
  notes text not null default '',
  occurred_on date not null default current_date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint ecoceleris_logs_quantity_or_hours check ((log_type = 'training' and hours > 0) or (log_type <> 'training' and quantity > 0))
);
create index if not exists ecoceleris_logs_cycle_date_idx on public.ecoceleris_logs(cycle, occurred_on desc);
create index if not exists ecoceleris_logs_type_date_idx on public.ecoceleris_logs(log_type, occurred_on desc);

create table if not exists public.ecoceleris_indicator_reviews (
  id uuid primary key default gen_random_uuid(),
  cycle text not null check (length(btrim(cycle)) between 1 and 80),
  metric_key text not null check (metric_key in ('reuse_rate','purchased_vs_used','training_hours','member_retention')),
  value numeric(14,3) not null,
  unit text not null,
  management_question text not null,
  responsible text not null,
  periodicity text not null,
  source text not null,
  decision text not null,
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique(cycle, metric_key)
);
alter table public.ecoceleris_logs enable row level security;
alter table public.ecoceleris_indicator_reviews enable row level security;
revoke all on public.ecoceleris_logs, public.ecoceleris_indicator_reviews from anon, authenticated;
grant select, insert, update, delete on public.ecoceleris_logs to authenticated;
grant select, insert, update on public.ecoceleris_indicator_reviews to authenticated;
create policy ecoceleris_logs_active_read on public.ecoceleris_logs for select to authenticated using (public.is_active_member());
create policy ecoceleris_logs_member_insert on public.ecoceleris_logs for insert to authenticated with check (public.is_active_member() and created_by = auth.uid());
create policy ecoceleris_logs_admin_update on public.ecoceleris_logs for update to authenticated using (public.is_active_member() and public.is_team_admin()) with check (public.is_active_member() and public.is_team_admin());
create policy ecoceleris_logs_admin_delete on public.ecoceleris_logs for delete to authenticated using (public.is_active_member() and public.is_team_admin());
create policy ecoceleris_reviews_active_read on public.ecoceleris_indicator_reviews for select to authenticated using (public.is_active_member());
create policy ecoceleris_reviews_admin_write on public.ecoceleris_indicator_reviews for all to authenticated using (public.is_active_member() and public.is_team_admin()) with check (public.is_active_member() and public.is_team_admin() and updated_by = auth.uid());
commit;