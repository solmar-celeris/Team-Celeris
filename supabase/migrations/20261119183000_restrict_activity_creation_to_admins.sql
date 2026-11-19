-- Restrict activity creation to administrators only.
drop policy if exists activities_developer_insert on public.activities;
drop policy if exists activities_lead_insert on public.activities;
create policy activities_admin_insert
on public.activities
for insert
to authenticated
with check (
  public.is_team_admin()
  and public.is_active_member()
  and public.can_access_workspace_area(area_id)
);
