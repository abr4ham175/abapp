"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ExcelUploadButton from "@/components/ExcelUploadButton";

type Product = {
  id: string;
  internal_code: string;
  barcode: string | null;
  description: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  active: boolean;
};

type ExcelRow = {
  codigo_interno: string;
  codigo_barras?: string;
  descripcion: string;
  unidad?: string;
  precio_compra?: number;
  precio_venta: number;
};

export default function ProductosPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState({
    internal_code: "",
    barcode: "",
    description: "",
    unit: "UND",
    purchase_price: "",
    sale_price: "",
  });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    const { data } = await supabase
      .from("products")
      .select("id, internal_code, barcode, description, unit, sale_price, purchase_price, active")
      .order("created_at", { ascending: false })
      .limit(200);
    setProducts((data as Product[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("products").insert({
      internal_code: form.internal_code,
      barcode: form.barcode || null,
      description: form.description,
      unit: form.unit,
      purchase_price: Number(form.purchase_price) || 0,
      sale_price: Number(form.sale_price) || 0,
    });
    setForm({ internal_code: "", barcode: "", description: "", unit: "UND", purchase_price: "", sale_price: "" });
    setSaving(false);
    load();
  }

  async function handleBulkRows(rows: ExcelRow[]) {
    const payload = rows
      .filter((r) => r.codigo_interno && r.descripcion)
      .map((r) => ({
        internal_code: String(r.codigo_interno).trim(),
        barcode: r.codigo_barras ? String(r.codigo_barras).trim() : null,
        description: String(r.descripcion).trim(),
        unit: r.unidad ? String(r.unidad).trim() : "UND",
        purchase_price: Number(r.precio_compra) || 0,
        sale_price: Number(r.precio_venta) || 0,
      }));

    // upsert por internal_code: si ya existe, actualiza precio/descr; si no, lo crea.
    const { error } = await supabase.from("products").upsert(payload, { onConflict: "internal_code" });
    if (error) throw error;
    load();
  }

  const filtered = products.filter((p) =>
    p.description.toLowerCase().includes(search.toLowerCase()) || p.internal_code.includes(search)
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold mb-1">Productos</h1>
        <p className="text-sm text-gray-500">
          Registra productos uno por uno o carga tu catálogo completo desde un Excel.
        </p>
      </div>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-medium mb-3">Carga masiva</h2>
        <ExcelUploadButton<ExcelRow>
          headers={["codigo_interno", "codigo_barras", "descripcion", "unidad", "precio_compra", "precio_venta"]}
          example={{
            codigo_interno: "PROD-0001",
            codigo_barras: "7750182000012",
            descripcion: "Martillo de uña 16oz",
            unidad: "UND",
            precio_compra: 15,
            precio_venta: 25,
          }}
          templateName="plantilla_productos.xlsx"
          onRows={handleBulkRows}
        />
      </section>

      <section className="bg-white rounded-xl border p-4">
        <h2 className="font-medium mb-3">Registrar producto</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Código interno" required value={form.internal_code} onChange={(v) => setForm({ ...form, internal_code: v })} />
          <Field label="Código de barras" value={form.barcode} onChange={(v) => setForm({ ...form, barcode: v })} />
          <Field label="Descripción" required value={form.description} onChange={(v) => setForm({ ...form, description: v })} className="col-span-2 md:col-span-1" />
          <Field label="Unidad" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
          <Field label="Precio compra" type="number" value={form.purchase_price} onChange={(v) => setForm({ ...form, purchase_price: v })} />
          <Field label="Precio venta" required type="number" value={form.sale_price} onChange={(v) => setForm({ ...form, sale_price: v })} />
          <div className="col-span-2 md:col-span-3">
            <button disabled={saving} className="bg-brand text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar producto"}
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white rounded-xl border p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-medium">Catálogo ({products.length})</h2>
          <input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Código</th>
              <th>Barras</th>
              <th>Descripción</th>
              <th>Unidad</th>
              <th className="text-right">P. Compra</th>
              <th className="text-right">P. Venta</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="py-1.5">{p.internal_code}</td>
                <td className="text-gray-500">{p.barcode ?? "—"}</td>
                <td>{p.description}</td>
                <td>{p.unit}</td>
                <td className="text-right">S/ {Number(p.purchase_price).toFixed(2)}</td>
                <td className="text-right">S/ {Number(p.sale_price).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm"
      />
    </div>
  );
}
