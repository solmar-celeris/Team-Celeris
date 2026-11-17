-- Team Celeris · Fundação do Inventário integrado
-- Patrimônio permanente + estoque de materiais.
-- Consulta para membros ativos; escrita e autorização somente para administradores ativos.

begin;

create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('asset', 'consumable')),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (item_type, name)
);

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  location_type text not null check (location_type in ('central', 'sector', 'other')),
  area_id uuid references public.areas(id) on delete restrict,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint inventory_location_area_check check (
    (location_type = 'sector' and area_id is not null)
    or (location_type in ('central', 'other') and area_id is null)
  )
);
create unique index if not exists inventory_one_central_location
  on public.inventory_locations(location_type) where location_type = 'central';
create unique index if not exists inventory_one_location_per_sector
  on public.inventory_locations(area_id) where location_type = 'sector';

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('asset', 'consumable')),
  code text not null unique check (length(btrim(code)) between 1 and 40),
  name text not null check (length(btrim(name)) between 1 and 160),
  description text not null default '',
  category_id uuid not null references public.inventory_categories(id) on delete restrict,
  unit text not null default 'unidade' check (length(btrim(unit)) between 1 and 24),
  minimum_quantity numeric(14,3) not null default 0 check (minimum_quantity >= 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
);
create index if not exists inventory_items_type_name_idx
  on public.inventory_items(item_type, name) where is_active;


create or replace function public.inventory_validate_item_category()
returns trigger
language plpgsql
set search_path = ''
as $
begin
  if not exists (
    select 1 from public.inventory_categories c
    where c.id = new.category_id and c.item_type = new.item_type and c.is_active
  ) then
    raise exception 'A categoria selecionada não corresponde ao tipo do item ou está inativa.'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$;
drop trigger if exists inventory_items_validate_category on public.inventory_items;
create trigger inventory_items_validate_category
  before insert or update on public.inventory_items
  for each row execute function public.inventory_validate_item_category();

create table if not exists public.inventory_assets (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  asset_tag text not null unique check (length(btrim(asset_tag)) between 1 and 60),
  serial_number text not null default '',
  brand text not null default '',
  model text not null default '',
  acquisition_date date,
  acquisition_value numeric(14,2) not null default 0 check (acquisition_value >= 0),
  current_estimated_value numeric(14,2) not null default 0 check (current_estimated_value >= 0),
  condition text not null default 'good' check (condition in ('new', 'good', 'fair', 'damaged', 'inoperative')),
  status text not null default 'available' check (status in ('available', 'in_use', 'loaned', 'maintenance', 'damaged', 'written_off')),
  area_id uuid references public.areas(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete restrict,
  assigned_to uuid references public.profiles(user_id) on delete set null,
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inventory_assets_item_idx on public.inventory_assets(item_id);
create index if not exists inventory_assets_area_status_idx on public.inventory_assets(area_id, status);

create table if not exists public.inventory_stock_balances (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity numeric(14,3) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique(item_id, location_id)
);
create index if not exists inventory_stock_balances_location_idx
  on public.inventory_stock_balances(location_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  movement_type text not null check (movement_type in ('entry', 'exit', 'transfer', 'return', 'adjustment_in', 'adjustment_out')),
  source_location_id uuid references public.inventory_locations(id) on delete restrict,
  destination_location_id uuid references public.inventory_locations(id) on delete restrict,
  area_id uuid references public.areas(id) on delete restrict,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movement_locations_check check (
    (movement_type in ('entry', 'return', 'adjustment_in') and source_location_id is null and destination_location_id is not null)
    or (movement_type in ('exit', 'adjustment_out') and source_location_id is not null and destination_location_id is null)
    or (movement_type = 'transfer' and source_location_id is not null and destination_location_id is not null and source_location_id <> destination_location_id)
  )
);
create index if not exists inventory_movements_created_idx
  on public.inventory_movements(created_at desc);
create index if not exists inventory_movements_area_idx
  on public.inventory_movements(area_id, created_at desc);

create table if not exists public.inventory_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movement_items_movement_idx
  on public.inventory_movement_items(movement_id);

create table if not exists public.inventory_asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.inventory_assets(id) on delete restrict,
  event_type text not null check (event_type in ('assigned', 'returned', 'transferred', 'maintenance_started', 'maintenance_completed', 'condition_changed', 'value_updated', 'written_off')),
  from_area_id uuid references public.areas(id) on delete restrict,
  to_area_id uuid references public.areas(id) on delete restrict,
  from_location_id uuid references public.inventory_locations(id) on delete restrict,
  to_location_id uuid references public.inventory_locations(id) on delete restrict,
  from_responsible_id uuid references public.profiles(user_id) on delete set null,
  to_responsible_id uuid references public.profiles(user_id) on delete set null,
  previous_value numeric(14,2) check (previous_value is null or previous_value >= 0),
  new_value numeric(14,2) check (new_value is null or new_value >= 0),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists inventory_asset_events_asset_idx
  on public.inventory_asset_events(asset_id, created_at desc);

-- Saldo inicial sempre parte de zero; movimentações futuras são a fonte de alteração.
insert into public.inventory_locations(name, location_type, description)
values ('Almoxarifado Central', 'central', 'Local central de armazenamento da equipe.')
on conflict do nothing;

insert into public.inventory_locations(name, location_type, area_id, description)
select 'Setor — ' || a.name, 'sector', a.id, 'Local de guarda vinculado ao setor.'
from public.areas a
where a.is_active
on conflict do nothing;

-- A função registra e aplica uma movimentação em uma única transação.
-- Não há escrita direta nas tabelas de saldo/histórico para usuários autenticados.
create or replace function public.inventory_record_stock_movement(
  p_movement_type text,
  p_item_id uuid,
  p_quantity numeric,
  p_reason text,
  p_source_location_id uuid default null,
  p_destination_location_id uuid default null,
  p_area_id uuid default null,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item public.inventory_items%rowtype;
  v_movement_id uuid;
  v_source_balance numeric(14,3);
begin
  if v_actor is null or not public.is_active_member() or not public.is_team_admin() then
    raise exception 'Somente administradores ativos podem registrar movimentações do Inventário.'
      using errcode = '42501';
  end if;
  if p_movement_type not in ('entry', 'exit', 'transfer', 'return', 'adjustment_in', 'adjustment_out') then
    raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'A quantidade deve ser maior que zero.' using errcode = '22023';
  end if;
  if p_reason is null or length(btrim(p_reason)) < 3 then
    raise exception 'Informe o motivo da movimentação.' using errcode = '22023';
  end if;

  select * into v_item from public.inventory_items
  where id = p_item_id and item_type = 'consumable' and is_active
  for update;
  if not found then
    raise exception 'Material não encontrado ou inativo.' using errcode = 'P0002';
  end if;

  if p_movement_type in ('entry', 'return', 'adjustment_in') then
    if p_source_location_id is not null or p_destination_location_id is null then
      raise exception 'Informe somente o local de destino.' using errcode = '22023';
    end if;
  elsif p_movement_type in ('exit', 'adjustment_out') then
    if p_source_location_id is null or p_destination_location_id is not null then
      raise exception 'Informe somente o local de origem.' using errcode = '22023';
    end if;
  elsif p_movement_type = 'transfer' then
    if p_source_location_id is null or p_destination_location_id is null
      or p_source_location_id = p_destination_location_id then
      raise exception 'Informe locais de origem e destino diferentes.' using errcode = '22023';
    end if;
  end if;

  if p_source_location_id is not null and not exists (
    select 1 from public.inventory_locations where id = p_source_location_id and is_active
  ) then
    raise exception 'Local de origem inválido ou inativo.' using errcode = '22023';
  end if;
  if p_destination_location_id is not null and not exists (
    select 1 from public.inventory_locations where id = p_destination_location_id and is_active
  ) then
    raise exception 'Local de destino inválido ou inativo.' using errcode = '22023';
  end if;
  if p_area_id is not null and not exists (
    select 1 from public.areas where id = p_area_id and is_active
  ) then
    raise exception 'Setor inválido ou inativo.' using errcode = '22023';
  end if;

  if p_movement_type in ('exit', 'transfer', 'adjustment_out') then
    insert into public.inventory_stock_balances(item_id, location_id, quantity)
    values (p_item_id, p_source_location_id, 0)
    on conflict (item_id, location_id) do nothing;

    select quantity into v_source_balance
    from public.inventory_stock_balances
    where item_id = p_item_id and location_id = p_source_location_id
    for update;
    if v_source_balance < p_quantity then
      raise exception 'Saldo insuficiente. Disponível: %, solicitado: %.', v_source_balance, p_quantity
        using errcode = '23514';
    end if;
  end if;

  insert into public.inventory_movements(
    movement_type, source_location_id, destination_location_id, area_id,
    reason, notes, created_by, authorized_by
  ) values (
    p_movement_type, p_source_location_id, p_destination_location_id, p_area_id,
    btrim(p_reason), coalesce(p_notes, ''), v_actor, v_actor
  ) returning id into v_movement_id;

  insert into public.inventory_movement_items(movement_id, item_id, quantity, unit)
  values (v_movement_id, p_item_id, p_quantity, v_item.unit);

  if p_movement_type in ('entry', 'return', 'adjustment_in') then
    insert into public.inventory_stock_balances(item_id, location_id, quantity, updated_at)
    values (p_item_id, p_destination_location_id, p_quantity, now())
    on conflict (item_id, location_id) do update
      set quantity = public.inventory_stock_balances.quantity + excluded.quantity,
          updated_at = now();
  elsif p_movement_type in ('exit', 'adjustment_out') then
    update public.inventory_stock_balances
       set quantity = quantity - p_quantity, updated_at = now()
     where item_id = p_item_id and location_id = p_source_location_id;
  elsif p_movement_type = 'transfer' then
    update public.inventory_stock_balances
       set quantity = quantity - p_quantity, updated_at = now()
     where item_id = p_item_id and location_id = p_source_location_id;
    insert into public.inventory_stock_balances(item_id, location_id, quantity, updated_at)
    values (p_item_id, p_destination_location_id, p_quantity, now())
    on conflict (item_id, location_id) do update
      set quantity = public.inventory_stock_balances.quantity + excluded.quantity,
          updated_at = now();
  end if;

  return v_movement_id;
end;
$$;
revoke all on function public.inventory_record_stock_movement(text, uuid, numeric, text, uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.inventory_record_stock_movement(text, uuid, numeric, text, uuid, uuid, uuid, text)
  to authenticated;

alter table public.inventory_categories enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_assets enable row level security;
alter table public.inventory_stock_balances enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_movement_items enable row level security;
alter table public.inventory_asset_events enable row level security;

revoke all on public.inventory_categories, public.inventory_locations, public.inventory_items,
  public.inventory_assets, public.inventory_stock_balances, public.inventory_movements,
  public.inventory_movement_items, public.inventory_asset_events
  from anon, authenticated;

grant select on public.inventory_categories, public.inventory_locations, public.inventory_items,
  public.inventory_assets, public.inventory_stock_balances, public.inventory_movements,
  public.inventory_movement_items, public.inventory_asset_events to authenticated;

grant insert, update on public.inventory_categories, public.inventory_locations,
  public.inventory_items, public.inventory_assets to authenticated;
grant insert on public.inventory_asset_events to authenticated;

create policy inventory_categories_read_active on public.inventory_categories
  for select to authenticated using (public.is_active_member());
create policy inventory_categories_admin_write on public.inventory_categories
  for all to authenticated using (public.is_active_member() and public.is_team_admin())
  with check (public.is_active_member() and public.is_team_admin());

create policy inventory_locations_read_active on public.inventory_locations
  for select to authenticated using (public.is_active_member());
create policy inventory_locations_admin_write on public.inventory_locations
  for all to authenticated using (public.is_active_member() and public.is_team_admin())
  with check (public.is_active_member() and public.is_team_admin());

create policy inventory_items_read_active on public.inventory_items
  for select to authenticated using (public.is_active_member());
create policy inventory_items_admin_write on public.inventory_items
  for all to authenticated using (
    public.is_active_member() and public.is_team_admin()
  )
  with check (
    public.is_active_member() and public.is_team_admin()
    and created_by is not null and updated_by = auth.uid()
  );

create policy inventory_assets_read_active on public.inventory_assets
  for select to authenticated using (public.is_active_member());
create policy inventory_assets_admin_write on public.inventory_assets
  for all to authenticated using (public.is_active_member() and public.is_team_admin())
  with check (public.is_active_member() and public.is_team_admin() and updated_by = auth.uid());

create policy inventory_stock_balances_read_active on public.inventory_stock_balances
  for select to authenticated using (public.is_active_member());

create policy inventory_movements_read_active on public.inventory_movements
  for select to authenticated using (public.is_active_member());
create policy inventory_movement_items_read_active on public.inventory_movement_items
  for select to authenticated using (public.is_active_member());

create policy inventory_asset_events_read_active on public.inventory_asset_events
  for select to authenticated using (public.is_active_member());
create policy inventory_asset_events_admin_insert on public.inventory_asset_events
  for insert to authenticated with check (
    public.is_active_member() and public.is_team_admin() and created_by = auth.uid()
  );

commit;
