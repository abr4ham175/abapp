import jsPDF from "jspdf";

export type TicketItem = {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export function generateTicket80mm({
  orderNumber,
  customerName,
  customerDoc,
  sellerName,
  items,
  total,
  storeName = "Tienda",
}: {
  orderNumber: string;
  customerName: string;
  customerDoc: string;
  sellerName: string;
  items: TicketItem[];
  total: number;
  storeName?: string;
}) {
  // 80mm de ancho; el alto se calcula dinámicamente según cantidad de items.
  const widthMm = 80;
  const lineHeight = 5;
  const heightMm = 45 + items.length * lineHeight;

  const doc = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
  let y = 8;

  doc.setFontSize(11);
  doc.text(storeName, widthMm / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.text(`Pedido: ${orderNumber}`, widthMm / 2, y, { align: "center" });
  y += 4;
  doc.text(new Date().toLocaleString("es-PE"), widthMm / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(8);
  doc.text(`Cliente: ${customerName}`, 4, y);
  y += 4;
  doc.text(`Doc: ${customerDoc}`, 4, y);
  y += 4;
  doc.text(`Vendedor: ${sellerName}`, 4, y);
  y += 5;
  doc.line(4, y, widthMm - 4, y);
  y += 4;

  items.forEach((item) => {
    doc.text(item.description.slice(0, 34), 4, y);
    y += 4;
    doc.text(`${item.quantity} x S/ ${item.unit_price.toFixed(2)}`, 4, y);
    doc.text(`S/ ${item.subtotal.toFixed(2)}`, widthMm - 4, y, { align: "right" });
    y += 4;
  });

  y += 2;
  doc.line(4, y, widthMm - 4, y);
  y += 5;
  doc.setFontSize(10);
  doc.text("TOTAL:", 4, y);
  doc.text(`S/ ${total.toFixed(2)}`, widthMm - 4, y, { align: "right" });

  return doc;
}
