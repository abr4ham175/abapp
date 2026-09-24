import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildItemsFromSale, emitirComprobante } from "@/lib/nubefact";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { orderId, paymentMethod, receiptType, series } = await req.json();

  const order = await supabase
    .from("sales_orders")
    .select("id, order_number, total, status, customer_id, customers(doc_type, doc_number, full_name)")
    .eq("id", orderId)
    .single();

  if (!order.data) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (order.data.status !== "pendiente")
    return NextResponse.json({ error: "El pedido ya fue cobrado o anulado" }, { status: 400 });

  const items = await supabase
    .from("sales_order_items")
    .select("quantity, unit_price, subtotal, products(description)")
    .eq("order_id", orderId);

  const lines = (items.data ?? []).map((i: any) => ({
    description: i.products.description,
    quantity: Number(i.quantity),
    unit_price: Number(i.unit_price),
    subtotal: Number(i.subtotal),
  }));

  // Correlativo simple por serie: cuenta cuántos comprobantes de esa serie
  // existen y suma 1. Para producción real, Nubefact puede autoasignar el
  // número si se le indica; revisa tu configuración de series.
  const countRes = await supabase
    .from("sales")
    .select("id", { count: "exact", head: true })
    .eq("receipt_series", series);
  const numero = (countRes.count ?? 0) + 1;

  const customer = order.data.customers as any;

  const sunatResult = await emitirComprobante({
    tipoComprobante: receiptType,
    serie: series,
    numero,
    clienteTipoDoc: customer.doc_type,
    clienteNumeroDoc: customer.doc_number,
    clienteDenominacion: customer.full_name,
    items: buildItemsFromSale(lines),
    total: Number(order.data.total),
  });

  const sale = await supabase
    .from("sales")
    .insert({
      order_id: orderId,
      cashier_id: user.id,
      payment_method: paymentMethod,
      receipt_type: receiptType,
      receipt_series: series,
      receipt_number: String(numero).padStart(8, "0"),
      sunat_status: sunatResult.sunat_status,
      sunat_response: sunatResult.raw,
      pdf_url: sunatResult.pdf_url,
      xml_url: sunatResult.xml_url,
      total: order.data.total,
    })
    .select()
    .single();

  await supabase.from("sales_orders").update({ status: "cobrado" }).eq("id", orderId);

  return NextResponse.json({ sale: sale.data, sunat: sunatResult });
}
