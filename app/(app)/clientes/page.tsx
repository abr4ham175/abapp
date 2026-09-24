"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Customer = {
  id: string;
  doc_type: string;
  doc_number: string;
  full_name: string;
  phone: string | null;
};

export default function ClientesPage() {
  const supabase = createClient();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState({ doc_type: "DNI", doc_number: "", full_name: "", phone: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("customers")
      .select("id, doc_type, doc_number, full_name, phone")
      .order("created_at", { ascending: false })
      .limit(200);
    setCustomers((data as Customer[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("customers").insert(form);
    setForm({ doc_type: "DNI", doc_number: "", full_name: "", phone: "" });
    setSaving(false);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Clientes</h1>

      <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tipo doc.</label>
          <select
            value={form.doc_type}
            onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="SIN_DOC">Sin documento</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Número</label>
          <input
            required
            value={form.doc_number}
            onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nombre / Razón social</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Teléfono</label>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="col-span-2 md:col-span-4">
          <button disabled={saving} className="bg-brand text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar cliente"}
          </button>
        </div>
      </form>

      <table className="w-full text-sm bg-white border rounded-xl">
        <thead>
          <tr className="text-left text-gray-500 border-b">
            <th className="py-2 px-3">Doc.</th>
            <th>Nombre</th>
            <th>Teléfono</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-b last:border-0">
              <td className="py-1.5 px-3">
                {c.doc_type} {c.doc_number}
              </td>
              <td>{c.full_name}</td>
              <td>{c.phone ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
