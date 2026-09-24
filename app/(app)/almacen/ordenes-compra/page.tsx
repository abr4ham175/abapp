"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductSearch, { ProductResult } from "@/components/ProductSearch";
import ExcelUploadButton from "@/components/ExcelUploadButton";

type Location = { id: string; name: string };
type Supplier = { id: string; name: string };
type Requirement = { id: string; code: string };
type Line = { product: ProductResult; quantity: number; unit_cost: number };
type OrderRow = { id: string; code: string; status: string; suppliers: { name: string } | null; created_at: string };
type ExcelRow = { codigo_interno: string; cantidad: number; costo_unitario: number };

export default function OrdenesCompraPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingRequirements, setPendingRequirements] = useState<Requirement[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [requirementId, setRequirementId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  async function load() {
    const loc = await supabase.from("locations").select("id, name").eq("type", "almacen").eq("active", true);
    setLocations(loc.data ?? []);
    if (loc.data?.[0]) setDestinationId((prev) => prev || loc.data[0].id);

    const sup = await supabase.from("suppliers").select("id, name").order("name");
    setSuppliers(sup.data ?? []);

    const req = await supabase.from("purchase_requirements").select("id, code").eq("status", "pendiente");
    setPendingRequirements(req.data ?? []);

    const ord = await supabase
      .from("purchase_orders")
      .select("id, code, status, suppliers(name), created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setOrders((ord.data as any) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function loadFromRequirement(reqId: string) {
    setRequirementId(reqId);
    if (!reqId) return;
    const { data } = await supabase
      .from("purchase_requirement_items")
      .select("quantity, products(id, internal_code, barcode, description, unit, sale_price, purchase_price)")
      .eq("requirement_id", reqId);

    setLines(
      (data ?? []).map((r: any) => ({
        product: r.products,
        quantity: Number(r.quantity),
        unit_cost: Number(r.products.purchase_price) || 0,
      }))
    );
  }

  function addProduct(product: ProductResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product, quantity: 1, unit_cost: product.purchase_price }];
    });
  }

  async function handleBulkRows(rows: ExcelRow[]) {
    for (const row of rows) {
      const { data } = await supabase
        .from("products")
        .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
        .eq("internal_code", String(row.codigo_interno).trim())
        .maybeSingle();
      if (data) {
        setLines((prev) => [
          ...prev,
          { product: data as ProductResult, quantity: Number(row.cantidad) || 1, unit_cost: Number(row.costo_unitario) || 0 },
        ]);
      }
    }
  }

  async function ensureSupplier(): Promise<string | null> {
    if (supplierId) return supplierId;
    if (!newSupplierName.trim()) return null;
    const created = await supabase.from("suppliers").insert({ name: newSupplierName.trim() }).select("id").single();
    return created.data?.id ?? null;
  }

  async function handleSave() {
    if (lines.length === 0 || !destinationId) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const finalSupplierId = await ensureSupplier();

    const order = await supabase
      .from("purchase_orders")
      .insert({
        destination_location_id: destinationId,
        supplier_id: finalSupplierId,
        requirement_id: requirementId || null,
        created_by: user!.id,
      })
      .select("id")
      .single();

    await supabase.from("purchase_order_items").insert(
      lines.map((l) => ({
        purchase_order_id: order.data!.id,
        product_id: l.product.id,
        quantity: l.quantity,
        unit_cost: l.unit_cost,
      }))
    );

    if (requirementId) {
      await supabase.from("purchase_requirements").update({ status: "convertido" }).eq("id", requirementId);
    }

    setLines([]);
    setRequirementId("");
    setNewSupplierName("");
    setSaving(false);
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Órdenes de Compra</h1>

      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Jalar de un requerimiento (opcional)</label>
            <select value={requirementId} onChange={(e) => loadFromRequirement(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Ninguno —</option>
              {pendingRequirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Almacén de destino (recibirá la mercadería)</label>
            <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proveedor existente</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Nuevo proveedor —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {!supplierId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nombre del proveedor nuevo</label>
              <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        <ProductSearch onSelect={addProduct} />

        <ExcelUploadButton<ExcelRow>
          headers={["codigo_interno", "cantidad", "costo_unitario"]}
          example={{ codigo_interno: "PROD-0001", cantidad: 50, costo_unitario: 12.5 }}
          templateName="plantilla_orden_compra.xlsx"
          onRows={handleBulkRows}
        />

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-left border-b">
              <th className="py-1.5">Producto</th>
              <th className="w-24">Cant.</th>
              <th className="w-28">Costo unit.</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.product.id} className="border-b last:border-0">
                <td className="py-1.5">{l.product.description}</td>
                <td>
                  <input
                    type="number"
                    value={l.quantity}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value) } : x)))}
                    className="w-20 border rounded px-2 py-1"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={l.unit_cost}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, unit_cost: Number(e.target.value) } : x)))}
                    className="w-24 border rounded px-2 py-1"
                  />
                </td>
                <td className="text-right">
                  <button onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))} className="text-red-500 text-xs">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button onClick={handleSave} disabled={saving || lines.length === 0} className="bg-brand text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50">
          {saving ? "Guardando..." : "Guardar orden de compra"}
        </button>
      </div>

      <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
        <thead>
          <tr className="text-left text-gray-500 border-b bg-gray-50">
            <th className="py-2 px-3">Código</th>
            <th>Proveedor</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-1.5 px-3">{o.code}</td>
              <td>{o.suppliers?.name ?? "—"}</td>
              <td>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
