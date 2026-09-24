// Cliente para la API de Nubefact (PSE/OSE autorizado por SUNAT).
// Documentación oficial: https://api.nubefact.com (te la comparten al crear cuenta).
// IMPORTANTE: los nombres de campo siguen el formato público conocido de Nubefact,
// pero antes de pasar a producción debes validar cada campo contra la documentación
// que te entregue tu cuenta (algunos catálogos —unidad de medida, tipo de IGV—
// pueden variar). Usa primero tu cuenta de PRUEBA (serie "FFF1"/"BBB1").

const IGV_RATE = 0.18;

export type NubefactItem = {
  descripcion: string;
  cantidad: number;
  unidad_de_medida?: string; // "NIU" = unidad, catálogo SUNAT
  valor_unitario: number; // precio sin IGV
  precio_unitario: number; // precio con IGV
  subtotal: number;
  igv: number;
  total: number;
};

export function buildItemsFromSale(
  lines: { description: string; quantity: number; unit_price: number; subtotal: number }[]
): NubefactItem[] {
  return lines.map((l) => {
    const valorUnitario = l.unit_price / (1 + IGV_RATE);
    const subtotalSinIgv = valorUnitario * l.quantity;
    const igv = l.subtotal - subtotalSinIgv;
    return {
      descripcion: l.description,
      cantidad: l.quantity,
      unidad_de_medida: "NIU",
      valor_unitario: Number(valorUnitario.toFixed(2)),
      precio_unitario: l.unit_price,
      subtotal: Number(subtotalSinIgv.toFixed(2)),
      igv: Number(igv.toFixed(2)),
      total: l.subtotal,
    };
  });
}

export async function emitirComprobante(payload: {
  tipoComprobante: "boleta" | "factura";
  serie: string;
  numero: number;
  clienteTipoDoc: "DNI" | "RUC" | "SIN_DOC";
  clienteNumeroDoc: string;
  clienteDenominacion: string;
  items: NubefactItem[];
  total: number;
}) {
  const baseUrl = process.env.NUBEFACT_BASE_URL;
  const token = process.env.NUBEFACT_TOKEN;

  if (!baseUrl || !token) {
    // Sin credenciales configuradas: se devuelve una respuesta simulada para
    // poder probar el flujo completo de Caja antes de tener la cuenta Nubefact.
    return {
      ok: true,
      simulated: true,
      sunat_status: "no_aplica" as const,
      pdf_url: null,
      xml_url: null,
      raw: { info: "NUBEFACT_BASE_URL / NUBEFACT_TOKEN no configurados. Respuesta simulada." },
    };
  }

  const tipoDeComprobanteCodigo = payload.tipoComprobante === "factura" ? 1 : 2;
  const clienteTipoDocCodigo =
    payload.clienteTipoDoc === "RUC" ? 6 : payload.clienteTipoDoc === "DNI" ? 1 : 0;

  const body = {
    operacion: "generar_comprobante",
    tipo_de_comprobante: tipoDeComprobanteCodigo,
    serie: payload.serie,
    numero: payload.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: clienteTipoDocCodigo,
    cliente_numero_de_documento: payload.clienteNumeroDoc,
    cliente_denominacion: payload.clienteDenominacion,
    fecha_de_emision: new Date().toISOString().slice(0, 10),
    moneda: 1, // 1 = Soles
    porcentaje_de_igv: IGV_RATE * 100,
    total_gravada: payload.items.reduce((a, i) => a + i.subtotal, 0),
    total_igv: payload.items.reduce((a, i) => a + i.igv, 0),
    total: payload.total,
    items: payload.items,
  };

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();

  return {
    ok: res.ok,
    simulated: false,
    sunat_status: res.ok ? ("enviado" as const) : ("rechazado" as const),
    pdf_url: json.enlace_del_pdf ?? null,
    xml_url: json.enlace_del_xml ?? null,
    raw: json,
  };
}
