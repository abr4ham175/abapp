"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OrderInfo = {
  id: string;
  order_number: string;
  total: number;
  status: string;
  customers: { full_name: string; doc_type: string; doc_number: string } | null;
};

export default function CajaPage() {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("efectivo");
  const [receiptType, setReceiptType] = useState<"boleta" | "factura">("boleta");
  const [series, setSeries] = useState("BBB1");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const raw = search.trim();
    // Si el usuario escribe solo números (ej. "123"), se completa al formato
    // real del pedido (ej. "PED-000123"). Si escribe el código completo,
    // se usa tal cual.
    const orderNumber = /^\d+$/.test(raw) ? `PED-${raw.padStart(6, "0")}` : raw.toUpperCase();

    const { data } = await supabase
      .from("sales_orders")
      .select("id, order_number, total, status, customers(full_name, doc_type, doc_number)")
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (!data) {
      setError("No se encontró ningún pedido con ese número.");
      setOrder(null);
      return;
    }
    setOrder(data as any);
    setReceiptType(data.customers && (data.customers as any).doc_type === "RUC" ? "factura" : "boleta");
    setSeries(data.customers && (data.customers as any).doc_type === "RUC" ? "FFF1" : "BBB1");
  }

  async function handleCharge() {
    if (!order) return;
    setLoading(true);
    setError(null);
    const res = await fetch("/api/sunat/emitir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id, paymentMethod, receiptType, series }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(json.error ?? "Ocurrió un error al emitir el comprobante.");
      return;
    }

    setResult(
      json.sunat.simulated
        ? `Cobro registrado (modo simulado: configura NUBEFACT_BASE_URL/NUBEFACT_TOKEN para emitir de verdad).`
        : `Comprobante emitido: ${series}-${json.sale.receipt_number} (estado SUNAT: ${json.sale.sunat_status})`
    );
    setOrder(null);
    setSearch("");
  }

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-xl font-semibold">Caja — Cobrar pedido</h1>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Número de pedido (ej. 123 o PED-000123)"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button className="bg-brand text-white rounded-lg px-4">Buscar</button>
      </form>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2 text-sm">{result}</div>}

      {order && (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <div>
            <p className="font-medium">{order.order_number}</p>
            <p className="text-sm text-gray-500">{order.customers?.full_name}</p>
            <p className="text-lg font-semibold mt-1">Total: S/ {Number(order.total).toFixed(2)}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Método de pago</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="yape_plin">Yape / Plin</option>
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tipo de comprobante</label>
              <select
                value={receiptType}
                onChange={(e) => setReceiptType(e.target.value as any)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="boleta">Boleta</option>
                <option value="factura">Factura</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Serie</label>
              <input
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleCharge}
            disabled={loading}
            className="w-full bg-brand text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
          >
            {loading ? "Emitiendo..." : "Cobrar y emitir comprobante"}
          </button>
        </div>
      )}
    </div>
  );
}
