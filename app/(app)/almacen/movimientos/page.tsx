"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductSearch, { ProductResult } from "@/components/ProductSearch";
import ExcelUploadButton from "@/components/ExcelUploadButton";

type Location = { id: string; name: string; type: string };
type Reason = { id: string; label: string; movement_type: string };
type PendingOC = { id: string; code: string };
type Line = { product: ProductResult; quantity: number };
type MovementType = "ingreso" | "salida" | "traslado";
type MovementRow = { id: string; code: string; movement_type: string; created_at: string };
type ExcelRow = { codigo_interno: string; cantidad: number };

export default function MovimientosPage() {
  const supabase = createClient();
  const [type, setType] = useState<MovementType>("ingreso");
  const [locations, setLocations] = useState<Location[]>([]);
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [pendingOCs, setPendingOCs] = useState<PendingOC[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [newReasonLabel, setNewReasonLabel] = useState("");
  const [originId, setOriginId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const loc = await supabase.from("locations").select("id, name, type").eq("active", true);
    setLocations(loc.data ?? []);

    const oc = await supabase.from("purchase_orders").select("id, code").in("status", ["pendiente", "recibido_parcial"]);
    setPendingOCs(oc.data ?? []);

    const mv = await supabase
      .from("stock_movements")
      .select("id, code, movement_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    setMovements((mv.data as any) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    supabase
      .from("movement_reasons")
      .select("id, label, movement_type")
      .eq("movement_type", type)
      .eq("active", true)
      .then(({ data }) => setReasons(data ?? []));
    setReasonId("");
    setPurchaseOrderId("");
    setLines([]);
  }, [type]);

  async function loadFromOC(ocId: string) {
    setPurchaseOrderId(ocId);
    if (!ocId) return;
    const oc = await supabase.from("purchase_orders").select("destination_location_id").eq("id", ocId).single();
    if (oc.data) setDestinationId(oc.data.destination_location_id);

    const { data } = await supabase
      .from("purchase_order_items")
      .select("quantity, quantity_received, products(id, internal_code, barcode, description, unit, sale_price, purchase_price)")
      .eq("purchase_order_id", ocId);

    setLines(
      (data ?? [])
        .filter((r: any) => Number(r.quantity) - Number(r.quantity_received) > 0)
        .map((r: any) => ({ product: r.products, quantity: Number(r.quantity) - Number(r.quantity_received) }))
    );
  }

  function addProduct(product: ProductResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product, quantity: 1 }];
    });
  }

  async function handleBulkRows(rows: ExcelRow[]) {
    for (const row of rows) {
      const { data } = await supabase
        .from("products")
        .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
        .eq("internal_code", String(row.codigo_interno).trim())
        .maybeSingle();
      if (data) setLines((prev) => [...prev, { product: data as ProductResult, quantity: Number(row.cantidad) || 1 }]);
    }
  }

  async function ensureReason(): Promise<string | null> {
    if (reasonId) return reasonId;
    if (!newReasonLabel.trim()) return null;
    const created = await supabase
      .from("movement_reasons")
      .insert({ movement_type: type, label: newReasonLabel.trim() })
      .select("id")
      .single();
    return created.data?.id ?? null;
  }

  async function handleSave() {
    setError(null);
    if (lines.length === 0) return;
    if (type !== "ingreso" && !originId) return setError("Selecciona la ubicación de origen.");
    if (type !== "salida" && !destinationId) return setError("Selecciona la ubicación de destino.");

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const finalReasonId = await ensureReason();

    const movement = await supabase
      .from("stock_movements")
      .insert({
        movement_type: type,
        reason_id: finalReasonId,
        origin_location_id: type === "ingreso" ? null : originId,
        destination_location_id: type === "salida" ? null : destinationId,
        purchase_order_id: purchaseOrderId || null,
        created_by: user!.id,
        notes,
      })
      .select("id")
      .single();

    if (movement.error) {
      setError(movement.error.message);
      setSaving(false);
      return;
    }

    const { error: itemsError } = await supabase.from("stock_movement_items").insert(
      lines.map((l) => ({ movement_id: movement.data!.id, product_id: l.product.id, quantity: l.quantity }))
    );

    if (itemsError) {
      setError("Error al aplicar el movimiento: " + itemsError.message);
      setSaving(false);
      return;
    }

    // Si el ingreso viene de una OC, actualizar cantidad recibida y su estado.
    if (type === "ingreso" && purchaseOrderId) {
      for (const l of lines) {
        await supabase
          .from("purchase_order_items")
          .select("id, quantity_received")
          .eq("purchase_order_id", purchaseOrderId)
          .eq("product_id", l.product.id)
          .single()
          .then(async ({ data }) => {
            if (data) {
              await supabase
                .from("purchase_order_items")
                .update({ quantity_received: Number(data.quantity_received) + l.quantity })
                .eq("id", data.id);
            }
          });
      }
      const items = await supabase.from("purchase_order_items").select("quantity, quantity_received").eq("purchase_order_id", purchaseOrderId);
      const allReceived = (items.data ?? []).every((i: any) => Number(i.quantity_received) >= Number(i.quantity));
      await supabase
        .from("purchase_orders")
        .update({ status: allReceived ? "recibido_total" : "recibido_parcial" })
        .eq("id", purchaseOrderId);
    }

    setLines([]);
    setNotes("");
    setPurchaseOrderId("");
    setSaving(false);
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Ingreso / Salida de Mercadería</h1>
      <p className="text-sm text-gray-500">
        Cada registro genera una guía de remisión. Recuerda: la mercadería llega primero a un almacén; si necesitas
        distribuirla a una tienda, registra un segundo movimiento tipo <strong>Traslado</strong>.
      </p>

      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div className="flex gap-2">
          {(["ingreso", "salida", "traslado"] as MovementType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-4 py-2 rounded-lg text-sm capitalize ${type === t ? "bg-brand text-white" : "bg-gray-100"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {type === "ingreso" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Jalar de una Orden de Compra (opcional)</label>
              <select value={purchaseOrderId} onChange={(e) => loadFromOC(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">— Ninguna —</option>
                {pendingOCs.map((oc) => (
                  <option key={oc.id} value={oc.id}>
                    {oc.code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type !== "ingreso" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Origen</label>
              <select value={originId} onChange={(e) => setOriginId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Selecciona...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type !== "salida" && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Destino</label>
              <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="">Selecciona...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">Motivo</label>
            <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">— Nuevo motivo —</option>
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {!reasonId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nuevo motivo (se guarda para reusar)</label>
              <input value={newReasonLabel} onChange={(e) => setNewReasonLabel(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Notas / referencia</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <ProductSearch onSelect={addProduct} />

        <ExcelUploadButton<ExcelRow>
          headers={["codigo_interno", "cantidad"]}
          example={{ codigo_interno: "PROD-0001", cantidad: 20 }}
          templateName="plantilla_movimiento.xlsx"
          onRows={handleBulkRows}
        />

        <table className="w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.product.id} className="border-b last:border-0">
                <td className="py-1.5">{l.product.description}</td>
                <td className="w-24">
                  <input
                    type="number"
                    value={l.quantity}
                    onChange={(e) => setLines((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value) } : x)))}
                    className="w-20 border rounded px-2 py-1"
                  />
                </td>
                <td className="w-16 text-right">
                  <button onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))} className="text-red-500 text-xs">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button onClick={handleSave} disabled={saving || lines.length === 0} className="bg-brand text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50">
          {saving ? "Guardando..." : "Registrar y generar guía de remisión"}
        </button>
      </div>

      <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
        <thead>
          <tr className="text-left text-gray-500 border-b bg-gray-50">
            <th className="py-2 px-3">Guía N°</th>
            <th>Tipo</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b last:border-0">
              <td className="py-1.5 px-3">{m.code}</td>
              <td className="capitalize">{m.movement_type}</td>
              <td>{new Date(m.created_at).toLocaleString("es-PE")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
