"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type StockRow = {
  quantity: number;
  products: { internal_code: string; description: string; unit: string } | null;
  locations: { name: string; type: string } | null;
};

export default function StockPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name")
      .then(({ data }) => setLocations(data ?? []));
    load();
  }, []);

  async function load() {
    let q = supabase
      .from("stock")
      .select("quantity, products(internal_code, description, unit), locations(name, type)")
      .gt("quantity", 0)
      .order("updated_at", { ascending: false })
      .limit(500);
    const { data } = await q;
    setRows((data as any) ?? []);
  }

  const filtered = rows.filter((r) => {
    const matchesSearch = r.products?.description.toLowerCase().includes(search.toLowerCase());
    const matchesLocation = !locationFilter || r.locations?.name === locationFilter;
    return matchesSearch && matchesLocation;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Stock disponible</h1>

      <div className="flex gap-2">
        <input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1"
        />
        <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las ubicaciones</option>
          {locations.map((l) => (
            <option key={l.id} value={l.name}>
              {l.name}
            </option>
          ))}
        </select>
      </div>

      <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
        <thead>
          <tr className="text-left text-gray-500 border-b bg-gray-50">
            <th className="py-2 px-3">Producto</th>
            <th>Ubicación</th>
            <th className="text-right pr-3">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5 px-3">
                {r.products?.description} <span className="text-gray-400">({r.products?.internal_code})</span>
              </td>
              <td>{r.locations?.name}</td>
              <td className="text-right pr-3">
                {Number(r.quantity).toFixed(2)} {r.products?.unit}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
