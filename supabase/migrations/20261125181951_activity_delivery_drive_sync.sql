begin;
alter table public.activity_deliveries
  add column if not exists google_drive_status text not null default 'pending'
    check (google_drive_status in ('pending','synced','error')),
  add column if not exists google_drive_error text;
create index if not exists activity_deliveries_drive_pending
  on public.activity_deliveries(google_drive_status, created_at)
  where google_drive_status <> 'synced';
commit;
