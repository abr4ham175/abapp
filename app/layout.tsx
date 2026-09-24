import "./globals.css";

export const metadata = {
  title: "Sistema de Ventas y Almacén",
  description: "Control de stock, compras y ventas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
