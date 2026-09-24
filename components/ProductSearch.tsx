"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ProductResult = {
  id: string;
  internal_code: string;
  barcode: string | null;
  description: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
};

export default function ProductSearch({
  onSelect,
  placeholder = "Buscar producto por nombre, código o escanear código de barras...",
  autoFocus = false,
}: {
  onSelect: (product: ProductResult) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLoading(true);

      // Si el texto coincide exactamente con un código de barras, se resuelve directo
      // (esto es lo que permite usar un lector USB tipo "pistola" sin cambiar de UI:
      // el lector escribe el código + Enter en este mismo input).
      const exact = await supabase
        .from("products")
        .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
        .or(`barcode.eq.${query.trim()},internal_code.eq.${query.trim()}`)
        .eq("active", true)
        .limit(1);

      if (exact.data && exact.data.length === 1) {
        onSelect(exact.data[0] as ProductResult);
        setQuery("");
        setResults([]);
        setLoading(false);
        return;
      }

      // Búsqueda por palabras sin importar el orden: cada palabra debe
      // aparecer en la descripción (AND de ILIKE %palabra%).
      const words = query.trim().split(/\s+/).filter(Boolean);
      let q = supabase
        .from("products")
        .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
        .eq("active", true)
        .limit(20);

      words.forEach((w) => {
        q = q.ilike("description", `%${w}%`);
      });

      const { data } = await q;
      setResults((data as ProductResult[]) ?? []);
      setLoading(false);
    }, 200);

    return () => clearTimeout(timeout);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Enter con un solo resultado -> selecciona directo (útil para lector de código de barras)
    if (e.key === "Enter" && results.length === 1) {
      onSelect(results[0]);
      setQuery("");
      setResults([]);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2"
      />
      {loading && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
      {results.length > 0 && (
        <ul className="absolute z-10 w-full bg-white border rounded-lg shadow mt-1 max-h-72 overflow-auto">
          {results.map((p) => (
            <li
              key={p.id}
              onClick={() => {
                onSelect(p);
                setQuery("");
                setResults([]);
                inputRef.current?.focus();
              }}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer flex justify-between text-sm"
            >
              <span>
                {p.description}{" "}
                <span className="text-gray-400">({p.internal_code})</span>
              </span>
              <span className="font-medium">S/ {Number(p.sale_price).toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
