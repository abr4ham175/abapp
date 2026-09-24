"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductSearch, { ProductResult } from "@/components/ProductSearch";
import ExcelUploadButton from "@/components/ExcelUploadButton";

type Location = { id: string; name: string };
type Line = { product: ProductResult; quantity: number };
type Requirement = {
  id: string;
  code: string;
  status: string;
  created_at: string;
  locations: { name: string } | null;
};

type ExcelRow = { codigo_interno: string; cantidad: number };

export default function RequerimientosPage() {
  const supabase = createClient();
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [requirements, setRequirements] = useState<Requirement[]>([]);

  async function load() {
    const loc = await supabase.from("locations").select("id, name").eq("active", true);
    setLocations(loc.data ?? []);
    if (loc.data?.[0]) setLocationId((prev) => prev || loc.data[0].id);

    const req = await supabase
      .from("purchase_requirements")
      .select("id, code, status, created_at, locations(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    setRequirements((req.data as any) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function addProduct(product: ProductResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product, quantity: 1 }];
    });
  }

  async function handleBulkRows(rows: ExcelRow[]) {
    for (const row of rows) {
      if (!row.codigo_interno) continue;
      const { data } = await supabase
        .from("products")
        .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
        .eq("internal_code", String(row.codigo_interno).trim())
        .maybeSingle();
      if (data) {
        setLines((prev) => {
          const existing = prev.find((l) => l.product.id === data.id);
          const qty = Number(row.cantidad) || 1;
          if (existing) return prev.map((l) => (l.product.id === data.id ? { ...l, quantity: l.quantity + qty } : l));
          return [...prev, { product: data as ProductResult, quantity: qty }];
        });
      }
    }
  }

  async function handleSave() {
    if (lines.length === 0 || !locationId) return;
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const req = await supabase
      .from("purchase_requirements")
      .insert({ location_id: locationId, requested_by: user!.id, notes })
      .select("id")
      .single();

    await supabase.from("purchase_requirement_items").insert(
      lines.map((l) => ({ requirement_id: req.data!.id, product_id: l.product.id, quantity: l.quantity }))
    );

    setLines([]);
    setNotes("");
    setSaving(false);
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Requerimiento de Mercadería</h1>

      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Almacén / Tienda que requiere</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <ProductSearch onSelect={addProduct} />

        <ExcelUploadButton<ExcelRow>
          headers={["codigo_interno", "cantidad"]}
          example={{ codigo_interno: "PROD-0001", cantidad: 10 }}
          templateName="plantilla_requerimiento.xlsx"
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
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value) } : x)))
                    }
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

        <button
          onClick={handleSave}
          disabled={saving || lines.length === 0}
          className="bg-brand text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar requerimiento"}
        </button>
      </div>

      <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
        <thead>
          <tr className="text-left text-gray-500 border-b bg-gray-50">
            <th className="py-2 px-3">Código</th>
            <th>Ubicación</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {requirements.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-1.5 px-3">{r.code}</td>
              <td>{r.locations?.name}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
