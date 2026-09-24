"use client";

import { useEffect, useRef, useState } from "react";

// Escanea con la cámara del dispositivo usando html5-qrcode.
// Se usa como complemento del lector USB: el usuario abre este panel,
// apunta la cámara al código de barras y el sistema resuelve el producto.
export default function CameraBarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const containerId = "barcode-scanner-region";
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (!mounted) return;
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;

      scanner
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 260, height: 140 } },
          (decodedText: string) => {
            onDetected(decodedText);
          },
          () => {
            /* frame sin detección: se ignora */
          }
        )
        .catch(() => setError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));
    });

    return () => {
      mounted = false;
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-4 w-full max-w-sm">
        <div className="flex justify-between items-center mb-2">
          <p className="font-medium">Escanear código de barras</p>
          <button onClick={onClose} className="text-gray-500">
            Cerrar
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <div id={containerId} />
      </div>
    </div>
  );
}
