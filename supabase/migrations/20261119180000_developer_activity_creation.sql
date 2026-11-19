-- Allow active developer profiles to create activities in accessible workspace areas.
create policy activities_developer_insert
on public.activities
for insert
to authenticated
with check (
  public.current_profile_role() = 'developer'
  and public.is_active_member()
  and public.can_access_workspace_area(area_id)
);
