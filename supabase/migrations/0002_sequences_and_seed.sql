-- =====================================================================
-- Correlativos automáticos
-- =====================================================================
create sequence if not exists public.seq_requirement;
create sequence if not exists public.seq_purchase_order;
create sequence if not exists public.seq_movement;
create sequence if not exists public.seq_sales_order;

create or replace function public.next_code(prefix text, seq regclass)
returns text
language plpgsql
as $$
begin
  return prefix || '-' || lpad(nextval(seq)::text, 6, '0');
end;
$$;

alter table public.purchase_requirements alter column code set default public.next_code('REQ', 'public.seq_requirement');
alter table public.purchase_orders alter column code set default public.next_code('OC', 'public.seq_purchase_order');
alter table public.stock_movements alter column code set default public.next_code('GR', 'public.seq_movement');
alter table public.sales_orders alter column order_number set default public.next_code('PED', 'public.seq_sales_order');

-- =====================================================================
-- Crear perfil automáticamente cuando se registra un usuario en Supabase Auth
-- El rol por defecto es 'vendedor'; el admin lo cambia después desde el panel.
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'vendedor');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Datos semilla
-- =====================================================================
insert into public.movement_reasons (movement_type, label) values
  ('ingreso', 'Compra a proveedor'),
  ('ingreso', 'Devolución de cliente'),
  ('ingreso', 'Ajuste de inventario (sobrante)'),
  ('salida', 'Venta'),
  ('salida', 'Merma / producto dañado'),
  ('salida', 'Ajuste de inventario (faltante)'),
  ('traslado', 'Traslado a tienda'),
  ('traslado', 'Traslado entre almacenes');

insert into public.customers (doc_type, doc_number, full_name) values
  ('SIN_DOC', '00000000', 'Cliente Varios');

-- Ubicación de ejemplo (bórralas o ajústalas desde el panel de admin)
insert into public.locations (name, type) values
  ('Almacén Central', 'almacen'),
  ('Tienda Principal', 'tienda');
