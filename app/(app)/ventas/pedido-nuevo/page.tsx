"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ProductSearch, { ProductResult } from "@/components/ProductSearch";
import CameraBarcodeScanner from "@/components/CameraBarcodeScanner";
import { generateTicket80mm } from "@/lib/ticketPdf";

type Line = {
  product: ProductResult;
  quantity: number;
};

export default function NuevoPedidoPage() {
  const supabase = createClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [docType, setDocType] = useState<"DNI" | "RUC" | "SIN_DOC">("SIN_DOC");
  const [docNumber, setDocNumber] = useState("00000000");
  const [customerName, setCustomerName] = useState("Cliente Varios");
  const [showScanner, setShowScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedOrder, setSavedOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addProduct(product: ProductResult) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)));
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }

  const total = lines.reduce((acc, l) => acc + l.quantity * l.product.sale_price, 0);

  async function handleScanDetected(code: string) {
    setShowScanner(false);
    const { data } = await supabase
      .from("products")
      .select("id, internal_code, barcode, description, unit, sale_price, purchase_price")
      .eq("barcode", code)
      .maybeSingle();
    if (data) addProduct(data as ProductResult);
  }

  async function handleSave() {
    if (lines.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");

      // 1. Resolver/crear cliente por número de documento
      let customerId: string;
      const existingCustomer = await supabase
        .from("customers")
        .select("id")
        .eq("doc_number", docNumber)
        .maybeSingle();

      if (existingCustomer.data) {
        customerId = existingCustomer.data.id;
      } else {
        const created = await supabase
          .from("customers")
          .insert({ doc_type: docType, doc_number: docNumber, full_name: customerName })
          .select("id")
          .single();
        if (created.error) throw new Error("No se pudo registrar el cliente: " + created.error.message);
        customerId = created.data.id;
      }

      // 2. Obtener el perfil (ubicación/tienda del vendedor)
      const profile = await supabase.from("profiles").select("location_id, full_name").eq("id", user.id).single();
      if (profile.error) throw new Error("No se pudo leer tu perfil: " + profile.error.message);
      if (!profile.data.location_id) {
        throw new Error(
          "Tu usuario no tiene una tienda/ubicación asignada. Pide a un administrador que te la asigne en Administración → Usuarios y roles."
        );
      }

      // 3. Crear el pedido
      const order = await supabase
        .from("sales_orders")
        .insert({
          location_id: profile.data.location_id,
          seller_id: user.id,
          customer_id: customerId,
        })
        .select("id, order_number")
        .single();
      if (order.error) throw new Error("No se pudo crear el pedido: " + order.error.message);

      // 4. Crear los items
      const items = await supabase.from("sales_order_items").insert(
        lines.map((l) => ({
          order_id: order.data.id,
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.product.sale_price,
          subtotal: l.quantity * l.product.sale_price,
        }))
      );
      if (items.error) throw new Error("El pedido se creó pero no se pudieron guardar los productos: " + items.error.message);

      // 5. Generar e imprimir el ticket 80mm
      const doc = generateTicket80mm({
        orderNumber: order.data.order_number,
        customerName,
        customerDoc: `${docType} ${docNumber}`,
        sellerName: profile.data.full_name ?? "",
        items: lines.map((l) => ({
          description: l.product.description,
          quantity: l.quantity,
          unit_price: l.product.sale_price,
          subtotal: l.quantity * l.product.sale_price,
        })),
        total,
      });
      doc.autoPrint?.();
      doc.output("dataurlnewwindow");

      setSavedOrder(order.data.order_number);
      setLines([]);
      setDocType("SIN_DOC");
      setDocNumber("00000000");
      setCustomerName("Cliente Varios");
    } catch (err: any) {
      setError(err.message ?? "Ocurrió un error inesperado al guardar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-xl font-semibold">Nuevo pedido</h1>

      {savedOrder && (
        <div className="bg-green-50 text-green-700 border border-green-200 rounded-lg px-4 py-2 text-sm">
          Pedido {savedOrder} guardado. Se abrió el ticket en una nueva pestaña para imprimir.
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm">{error}</div>
      )}

      <div className="bg-white border rounded-xl p-4">
        <div className="flex gap-2 mb-1">
          <div className="flex-1">
            <ProductSearch onSelect={addProduct} autoFocus />
          </div>
          <button
            onClick={() => setShowScanner(true)}
            className="border rounded-lg px-3 text-sm bg-white hover:bg-gray-50"
            type="button"
          >
            📷 Escanear
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Tip: si usas un lector de código de barras USB, apunta el cursor a este buscador y escanea directamente.
        </p>
      </div>

      {showScanner && <CameraBarcodeScanner onDetected={handleScanDetected} onClose={() => setShowScanner(false)} />}

      <div className="bg-white border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-2 px-3">Producto</th>
              <th className="w-24">Cant.</th>
              <th className="w-28 text-right">P. Unit.</th>
              <th className="w-28 text-right pr-3">Subtotal</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.product.id} className="border-b last:border-0">
                <td className="py-1.5 px-3">{l.product.description}</td>
                <td>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={l.quantity}
                    onChange={(e) => updateQuantity(l.product.id, Number(e.target.value))}
                    className="w-20 border rounded px-2 py-1"
                  />
                </td>
                <td className="text-right">S/ {l.product.sale_price.toFixed(2)}</td>
                <td className="text-right pr-3">S/ {(l.quantity * l.product.sale_price).toFixed(2)}</td>
                <td className="text-center">
                  <button onClick={() => removeLine(l.product.id)} className="text-red-500 text-xs">
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-400 py-6">
                  Busca productos arriba para agregarlos al pedido.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white border rounded-xl p-4 grid grid-cols-3 gap-3 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tipo doc.</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as any)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value="SIN_DOC">Sin documento</option>
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Número de documento</label>
          <input
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Nombre del cliente</label>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-lg font-semibold">Total: S/ {total.toFixed(2)}</p>
        <button
          onClick={handleSave}
          disabled={saving || lines.length === 0}
          className="bg-brand text-white rounded-lg px-6 py-2.5 font-medium disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar pedido e imprimir ticket"}
        </button>
      </div>
    </div>
  );
}
