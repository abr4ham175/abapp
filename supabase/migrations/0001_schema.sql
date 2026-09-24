-- =====================================================================
-- Sistema de Ventas y Control de Almacén — Esquema inicial
-- =====================================================================
-- Convenciones:
--   - Todas las tablas usan uuid como PK (default gen_random_uuid()).
--   - Los montos son numeric(12,2). Las cantidades son numeric(14,3)
--     (permite decimales para unidades como kg, m, etc).
--   - Multi-ubicación: toda ubicación (almacén o tienda) vive en
--     `locations`. El stock es por (product_id, location_id).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. ROLES Y USUARIOS
-- ---------------------------------------------------------------------
-- Roles del sistema:
--   admin      -> acceso total
--   almacenero -> módulo Almacén completo (sin acceso a caja/SUNAT)
--   vendedor   -> solo módulo Ventas: crear pedidos, ver productos/clientes
--   cajero     -> módulo Ventas: cobrar pedidos, emitir comprobantes
create type public.user_role as enum ('admin', 'almacenero', 'vendedor', 'cajero');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'vendedor',
  -- ubicación "home" del usuario (tienda donde vende / almacén donde trabaja)
  location_id uuid, -- FK se agrega tras crear `locations`
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Extiende auth.users con rol y ubicación asignada.';

-- ---------------------------------------------------------------------
-- 2. UBICACIONES (almacenes y tiendas)
-- ---------------------------------------------------------------------
create type public.location_type as enum ('almacen', 'tienda');

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.location_type not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_location_fk
  foreign key (location_id) references public.locations (id) on delete set null;

-- ---------------------------------------------------------------------
-- 3. PRODUCTOS
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null unique,      -- código propio/independiente
  barcode text unique,                     -- código de barras (EAN13, Code128, etc). Nullable.
  description text not null,
  unit text not null default 'UND',        -- unidad de medida (UND, KG, M, etc)
  category_id uuid references public.categories (id) on delete set null,
  purchase_price numeric(12,2) default 0,
  sale_price numeric(12,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create extension if not exists pg_trgm;
create index products_description_trgm on public.products using gin (description gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 4. STOCK (saldo por producto y ubicación)
-- ---------------------------------------------------------------------
create table public.stock (
  product_id uuid not null references public.products (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

-- ---------------------------------------------------------------------
-- 5. REQUERIMIENTO DE MERCADERÍA
-- ---------------------------------------------------------------------
create type public.requirement_status as enum ('pendiente', 'convertido', 'anulado');

create table public.purchase_requirements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- correlativo REQ-000001
  location_id uuid not null references public.locations (id),
  requested_by uuid not null references public.profiles (id),
  status public.requirement_status not null default 'pendiente',
  notes text,
  created_at timestamptz not null default now()
);

create table public.purchase_requirement_items (
  id uuid primary key default gen_random_uuid(),
  requirement_id uuid not null references public.purchase_requirements (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14,3) not null,
  notes text
);

-- ---------------------------------------------------------------------
-- 6. ÓRDENES DE COMPRA
-- ---------------------------------------------------------------------
create type public.purchase_order_status as enum ('pendiente', 'recibido_parcial', 'recibido_total', 'anulado');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  ruc text,
  name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- OC-000001
  supplier_id uuid references public.suppliers (id),
  requirement_id uuid references public.purchase_requirements (id), -- opcional: jalado de un requerimiento
  destination_location_id uuid not null references public.locations (id), -- almacén que recibirá
  status public.purchase_order_status not null default 'pendiente',
  created_by uuid not null references public.profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14,3) not null,
  unit_cost numeric(12,2) not null default 0,
  quantity_received numeric(14,3) not null default 0
);

-- ---------------------------------------------------------------------
-- 7. INGRESO / SALIDA DE MERCADERÍA (Guía de Remisión)
-- ---------------------------------------------------------------------
create type public.movement_type as enum ('ingreso', 'salida', 'traslado');

-- Catálogo editable de motivos (el usuario pidió "opciones editables")
create table public.movement_reasons (
  id uuid primary key default gen_random_uuid(),
  movement_type public.movement_type not null,
  label text not null,
  active boolean not null default true
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,               -- GR-000001 (número de guía de remisión)
  movement_type public.movement_type not null,
  reason_id uuid references public.movement_reasons (id),
  origin_location_id uuid references public.locations (id),
  destination_location_id uuid references public.locations (id),
  purchase_order_id uuid references public.purchase_orders (id), -- si el ingreso viene de una OC
  created_by uuid not null references public.profiles (id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.stock_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.stock_movements (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14,3) not null
);

-- ---------------------------------------------------------------------
-- 8. CLIENTES
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null default 'DNI',    -- DNI | RUC | SIN_DOC
  doc_number text not null default '00000000',
  full_name text not null default 'Cliente Varios',
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 9. VENTAS: PEDIDOS (armados por el vendedor)
-- ---------------------------------------------------------------------
create type public.order_status as enum ('pendiente', 'cobrado', 'anulado');

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,       -- correlativo visible en el ticket 80mm
  location_id uuid not null references public.locations (id), -- tienda donde se vende
  seller_id uuid not null references public.profiles (id),
  customer_id uuid not null references public.customers (id),
  status public.order_status not null default 'pendiente',
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders (id) on delete cascade,
  product_id uuid not null references public.products (id),
  quantity numeric(14,3) not null,
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- 10. VENTAS: COBRO / COMPROBANTE (cajero)
-- ---------------------------------------------------------------------
create type public.payment_method as enum ('efectivo', 'tarjeta', 'yape_plin', 'transferencia', 'otro');
create type public.receipt_type as enum ('boleta', 'factura', 'nota_venta');
create type public.sunat_status as enum ('pendiente', 'enviado', 'aceptado', 'rechazado', 'no_aplica');

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.sales_orders (id),
  cashier_id uuid not null references public.profiles (id),
  payment_method public.payment_method not null,
  receipt_type public.receipt_type not null,
  receipt_series text,                     -- ej. B001, F001
  receipt_number text,                     -- correlativo SUNAT
  sunat_status public.sunat_status not null default 'pendiente',
  sunat_response jsonb,                    -- respuesta cruda del PSE/OSE (Nubefact)
  pdf_url text,
  xml_url text,
  total numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- FUNCIONES / TRIGGERS
-- =====================================================================

-- Actualiza stock automáticamente al insertar items de un movimiento,
-- y valida que no se pueda dejar el stock negativo en una salida/traslado.
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
as $$
declare
  mv public.stock_movements%rowtype;
  current_qty numeric(14,3);
begin
  select * into mv from public.stock_movements where id = new.movement_id;

  if mv.movement_type = 'ingreso' then
    insert into public.stock (product_id, location_id, quantity)
    values (new.product_id, mv.destination_location_id, new.quantity)
    on conflict (product_id, location_id)
    do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();

  elsif mv.movement_type in ('salida', 'traslado') then
    select quantity into current_qty from public.stock
      where product_id = new.product_id and location_id = mv.origin_location_id
      for update;

    if current_qty is null or current_qty < new.quantity then
      raise exception 'Stock insuficiente para el producto % en la ubicación de origen', new.product_id;
    end if;

    update public.stock set quantity = quantity - new.quantity, updated_at = now()
      where product_id = new.product_id and location_id = mv.origin_location_id;

    if mv.movement_type = 'traslado' then
      insert into public.stock (product_id, location_id, quantity)
      values (new.product_id, mv.destination_location_id, new.quantity)
      on conflict (product_id, location_id)
      do update set quantity = public.stock.quantity + excluded.quantity, updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_apply_stock_movement
  after insert on public.stock_movement_items
  for each row execute function public.apply_stock_movement();

-- Nota de diseño: cuando el usuario registra la "recepción" de una OC,
-- la aplicación debe crear UN stock_movement tipo 'ingreso' (llega al
-- almacén) y, si corresponde traslado inmediato a tienda, un segundo
-- stock_movement tipo 'traslado' — tal como se describe en el
-- requerimiento funcional (el almacén traslada a tiendas al momento
-- de la recepción).

-- Recalcula el total del pedido de venta cuando cambian sus items.
create or replace function public.recalc_order_total()
returns trigger
language plpgsql
security definer
as $$
begin
  update public.sales_orders so
    set total = coalesce((
      select sum(subtotal) from public.sales_order_items where order_id = so.id
    ), 0)
    where so.id = coalesce(new.order_id, old.order_id);
  return null;
end;
$$;

create trigger trg_recalc_order_total
  after insert or update or delete on public.sales_order_items
  for each row execute function public.recalc_order_total();

-- =====================================================================
-- RLS (Row Level Security)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.categories enable row level security;
alter table public.stock enable row level security;
alter table public.purchase_requirements enable row level security;
alter table public.purchase_requirement_items enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.movement_reasons enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_movement_items enable row level security;
alter table public.customers enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.sales enable row level security;

-- Helper: rol del usuario autenticado
create or replace function public.current_role()
returns public.user_role
language sql stable
security definer
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- profiles: cada quien ve su propio perfil; admin ve todos
create policy profiles_self_or_admin on public.profiles
  for select using (id = auth.uid() or public.current_role() = 'admin');
create policy profiles_admin_write on public.profiles
  for all using (public.current_role() = 'admin');

-- Catálogos de lectura general para cualquier usuario autenticado
create policy read_all_authenticated on public.locations for select using (auth.role() = 'authenticated');
create policy read_all_authenticated on public.products for select using (auth.role() = 'authenticated');
create policy read_all_authenticated on public.categories for select using (auth.role() = 'authenticated');
create policy read_all_authenticated on public.customers for select using (auth.role() = 'authenticated');
create policy read_all_authenticated on public.stock for select using (auth.role() = 'authenticated');

-- Solo admin/almacenero pueden escribir catálogos y stock
create policy write_admin_almacen on public.locations for insert with check (public.current_role() in ('admin','almacenero'));
create policy update_admin_almacen on public.locations for update using (public.current_role() in ('admin','almacenero'));
create policy write_admin_almacen on public.products for insert with check (public.current_role() in ('admin','almacenero'));
create policy update_admin_almacen on public.products for update using (public.current_role() in ('admin','almacenero'));
create policy write_admin_almacen on public.categories for insert with check (public.current_role() in ('admin','almacenero'));

-- Clientes: cualquier usuario autenticado puede crear (vendedor los registra)
create policy write_customers on public.customers for insert with check (auth.role() = 'authenticated');
create policy update_customers on public.customers for update using (auth.role() = 'authenticated');

-- Módulo ALMACÉN: solo admin y almacenero (vendedor y cajero SIN acceso)
create policy almacen_only on public.purchase_requirements for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.purchase_requirement_items for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.suppliers for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.purchase_orders for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.purchase_order_items for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.movement_reasons for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.stock_movements for all using (public.current_role() in ('admin','almacenero'));
create policy almacen_only on public.stock_movement_items for all using (public.current_role() in ('admin','almacenero'));

-- Módulo VENTAS: vendedor crea/edita SUS pedidos; cajero y admin ven todos
create policy sales_orders_seller_own on public.sales_orders
  for select using (
    public.current_role() in ('admin','cajero')
    or seller_id = auth.uid()
  );
create policy sales_orders_seller_insert on public.sales_orders
  for insert with check (
    public.current_role() in ('admin','vendedor')
    and seller_id = auth.uid()
  );
create policy sales_orders_update on public.sales_orders
  for update using (
    public.current_role() in ('admin','cajero')
    or (public.current_role() = 'vendedor' and seller_id = auth.uid() and status = 'pendiente')
  );

create policy sales_order_items_rw on public.sales_order_items
  for all using (
    exists (
      select 1 from public.sales_orders so
      where so.id = order_id
        and (public.current_role() in ('admin','cajero')
             or (so.seller_id = auth.uid()))
    )
  );

-- Módulo CAJA: solo cajero y admin
create policy caja_only on public.sales
  for all using (public.current_role() in ('admin','cajero'));
