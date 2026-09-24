import * as XLSX from "xlsx";

// Lee la primera hoja de un archivo .xlsx/.csv y devuelve un array de objetos
// usando la primera fila como encabezados. Se usa para TODAS las cargas
// masivas del sistema (productos, requerimientos, órdenes de compra,
// ingresos/salidas).
export async function readExcelFile<T = Record<string, any>>(file: File): Promise<T[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<T>(sheet, { defval: "" });
}

// Genera y descarga una plantilla .xlsx en blanco con los encabezados dados,
// para que el usuario sepa exactamente qué columnas llenar.
export function downloadExcelTemplate(filename: string, headers: string[], example?: Record<string, any>) {
  const rows = example ? [example] : [];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Plantilla");
  XLSX.writeFile(workbook, filename);
}
