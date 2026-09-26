import jsPDF from "jspdf";

export type TicketItem = {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

const WIDTH_MM = 80;
const MARGIN = 4;
const MAX_TEXT_WIDTH = WIDTH_MM - MARGIN * 2;

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
  // Documento "de medida": jsPDF puede calcular cuántas líneas ocupará cada
  // descripción sin depender del tamaño final de la página. Esto evita que
  // descripciones largas se corten o que el ticket quede incompleto.
  const measurer = new jsPDF({ unit: "mm", format: [WIDTH_MM, 200] });
  measurer.setFontSize(8);

  const wrappedItems = items.map((item) => ({
    ...item,
    descriptionLines: measurer.splitTextToSize(item.description, MAX_TEXT_WIDTH) as string[],
  }));

  const headerHeight = 40; // título + N° de pedido/fecha + cliente/doc/vendedor + línea
  const footerHeight = 18; // línea + total
  const itemsHeight = wrappedItems.reduce(
    (acc, item) => acc + item.descriptionLines.length * 4 + 4, // líneas de descripción + línea de cantidad/precio
    0
  );
  const heightMm = headerHeight + itemsHeight + footerHeight;

  const doc = new jsPDF({ unit: "mm", format: [WIDTH_MM, heightMm] });
  let y = 8;

  doc.setFontSize(11);
  doc.text(storeName, WIDTH_MM / 2, y, { align: "center" });
  y += 5;
  doc.setFontSize(9);
  doc.text(`Pedido: ${orderNumber}`, WIDTH_MM / 2, y, { align: "center" });
  y += 4;
  doc.text(new Date().toLocaleString("es-PE"), WIDTH_MM / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(8);
  doc.text(`Cliente: ${customerName}`, MARGIN, y);
  y += 4;
  doc.text(`Doc: ${customerDoc}`, MARGIN, y);
  y += 4;
  doc.text(`Vendedor: ${sellerName}`, MARGIN, y);
  y += 5;
  doc.line(MARGIN, y, WIDTH_MM - MARGIN, y);
  y += 4;

  wrappedItems.forEach((item) => {
    item.descriptionLines.forEach((line) => {
      doc.text(line, MARGIN, y);
      y += 4;
    });
    doc.text(`${item.quantity} x S/ ${item.unit_price.toFixed(2)}`, MARGIN, y);
    doc.text(`S/ ${item.subtotal.toFixed(2)}`, WIDTH_MM - MARGIN, y, { align: "right" });
    y += 4;
  });

  y += 2;
  doc.line(MARGIN, y, WIDTH_MM - MARGIN, y);
  y += 5;
  doc.setFontSize(10);
  doc.text("TOTAL:", MARGIN, y);
  doc.text(`S/ ${total.toFixed(2)}`, WIDTH_MM - MARGIN, y, { align: "right" });

  return doc;
}

