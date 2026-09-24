import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/components/SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "vendedor";
  const canAlmacen = role === "admin" || role === "almacenero";
  const canCaja = role === "admin" || role === "cajero";
  const canVentas = role === "admin" || role === "vendedor" || role === "cajero";

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-white border-r shrink-0 p-4 flex flex-col gap-1">
        <div className="mb-4">
          <p className="font-semibold">{profile?.full_name ?? user.email}</p>
          <p className="text-xs text-gray-500 uppercase">{role}</p>
        </div>

        {canVentas && (
          <>
            <NavHeader label="Ventas" />
            <NavLink href="/ventas/pedido-nuevo" label="Nuevo pedido" />
            <NavLink href="/ventas/pedidos" label="Pedidos" />
            <NavLink href="/clientes" label="Clientes" />
          </>
        )}

        {canCaja && (
          <>
            <NavHeader label="Caja" />
            <NavLink href="/caja" label="Cobrar pedido" />
          </>
        )}

        {canAlmacen && (
          <>
            <NavHeader label="Almacén" />
            <NavLink href="/almacen/requerimientos" label="Requerimientos" />
            <NavLink href="/almacen/ordenes-compra" label="Órdenes de compra" />
            <NavLink href="/almacen/movimientos" label="Ingreso / Salida" />
            <NavLink href="/almacen/stock" label="Stock" />
            <NavLink href="/productos" label="Productos" />
          </>
        )}

        {role === "admin" && (
          <>
            <NavHeader label="Administración" />
            <NavLink href="/admin/usuarios" label="Usuarios y roles" />
          </>
        )}

        <div className="mt-auto pt-4">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function NavHeader({ label }: { label: string }) {
  return <p className="text-xs font-semibold text-gray-400 mt-4 mb-1 uppercase">{label}</p>;
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block px-2 py-1.5 rounded-lg hover:bg-gray-100 text-sm">
      {label}
    </Link>
  );
}
