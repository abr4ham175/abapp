"use client";

import { useState } from "react";
import { readExcelFile, downloadExcelTemplate } from "@/lib/excelImport";

export default function ExcelUploadButton<T = Record<string, any>>({
  headers,
  example,
  templateName,
  onRows,
}: {
  headers: string[];
  example?: Record<string, any>;
  templateName: string;
  onRows: (rows: T[]) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage(null);
    try {
      const rows = await readExcelFile<T>(file);
      await onRows(rows);
      setMessage(`${rows.length} filas procesadas correctamente.`);
    } catch (err: any) {
      setMessage(`Error al procesar el archivo: ${err.message ?? err}`);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <button
        type="button"
        onClick={() => downloadExcelTemplate(templateName, headers, example)}
        className="text-brand underline"
      >
        Descargar plantilla Excel
      </button>
      <label className="border rounded-lg px-3 py-1.5 cursor-pointer bg-white hover:bg-gray-50">
        {loading ? "Procesando..." : "Subir Excel"}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
      </label>
      {message && <span className="text-gray-500">{message}</span>}
    </div>
  );
}
