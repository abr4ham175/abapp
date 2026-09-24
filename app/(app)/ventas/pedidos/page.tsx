"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  customers: { full_name: string } | null;
};

export default function PedidosPage() {
  const supabase = createClient();
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    supabase
      .from("sales_orders")
      .select("id, order_number, status, total, created_at, customers(full_name)")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setOrders((data as any) ?? []));
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Pedidos</h1>
      <table className="w-full text-sm bg-white border rounded-xl overflow-hidden">
        <thead>
          <tr className="text-left text-gray-500 border-b bg-gray-50">
            <th className="py-2 px-3">N° Pedido</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th className="text-right pr-3">Total</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-b last:border-0">
              <td className="py-1.5 px-3 font-medium">{o.order_number}</td>
              <td>{o.customers?.full_name ?? "—"}</td>
              <td>
                <span
                  className={
                    "px-2 py-0.5 rounded-full text-xs " +
                    (o.status === "cobrado"
                      ? "bg-green-100 text-green-700"
                      : o.status === "anulado"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700")
                  }
                >
                  {o.status}
                </span>
              </td>
              <td className="text-right pr-3">S/ {Number(o.total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
