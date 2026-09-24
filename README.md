# Sistema de Ventas y Control de Almacén

Sistema web (Next.js + Supabase) con dos módulos interconectados:

- **Almacén**: Requerimiento de Mercadería → Órdenes de Compra → Ingreso/Salida de
  Mercadería (con Guía de Remisión) → Stock por ubicación.
- **Ventas**: el vendedor arma pedidos (buscador + código de barras) → genera un
  ticket 80mm → el cajero cobra el pedido y emite el comprobante (boleta/factura)
  vía SUNAT (Nubefact).

Roles de usuario (controlados con Supabase Auth + RLS):

| Rol | Acceso |
|---|---|
| `admin` | Todo el sistema |
| `almacenero` | Módulo Almacén completo + Productos. **Sin acceso a Caja** |
| `vendedor` | Crear pedidos, ver productos y clientes. **Sin acceso a Almacén ni Caja** |
| `cajero` | Cobrar pedidos y emitir comprobantes. **Sin acceso a Almacén** |

---

## 1. Requisitos

- Node.js 18 o superior
- Una cuenta gratuita en [Supabase](https://supabase.com)
- Una cuenta en [Vercel](https://vercel.com) para el despliegue
- (Cuando quieras emitir comprobantes reales) una cuenta en
  [Nubefact](https://www.nubefact.com) — empieza con su cuenta de **prueba**

---

## 2. Crear el proyecto en Supabase

1. Entra a supabase.com → **New Project**. Elige una contraseña de base de datos
   (guárdala) y la región más cercana (South America / São Paulo si está disponible).
2. Cuando el proyecto esté listo, ve a **SQL Editor** y ejecuta, en este orden,
   el contenido de:
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_sequences_and_seed.sql`
3. Ve a **Project Settings → API** y copia:
   - `Project URL` → será tu `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → será tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role key` → será tu `SUPABASE_SERVICE_ROLE_KEY` (**secreta**, nunca la
     subas al repositorio ni la uses en el navegador)
4. Ve a **Authentication → Providers** y confirma que "Email" esté habilitado.
   Para empezar rápido, en **Authentication → Settings** puedes desactivar
   "Confirm email" (así los usuarios nuevos no necesitan verificar su correo).

### Crear tu primer usuario administrador

Este es el **único paso que debes hacer manualmente desde Supabase** — todos
los usuarios siguientes ya se crean desde la propia app (menú
**Administración → Usuarios y roles**, solo visible para el rol `admin`).

1. Ve a **Authentication → Users → Add user** y crea tu propio usuario (correo +
   contraseña). Esto dispara automáticamente la creación de su fila en `profiles`
   con rol `vendedor`.
2. Ve a **SQL Editor** y ejecútalo para volverte `admin` (reemplaza el correo):

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
   ```

3. Inicia sesión en la app con ese usuario y entra a **Administración → Usuarios
   y roles**. Desde ahí puedes crear a tus demás usuarios (almacenero,
   vendedores, cajeros), asignarles su rol, su ubicación (tienda/almacén),
   activarlos/desactivarlos y cambiarles la contraseña — sin volver a tocar
   Supabase directamente.

> La pantalla de administración usa la `service_role key` **solo en el
> servidor** (en `app/api/admin/users/`), nunca se expone al navegador, y cada
> endpoint verifica que quien llama sea `admin` antes de hacer nada.

---

## 3. Probar el proyecto en tu computadora

```bash
npm install
cp .env.local.example .env.local
```

Edita `.env.local` con los 3 valores de Supabase del paso anterior. Las
variables de `NUBEFACT_*` puedes dejarlas vacías por ahora: el sistema
**simula** la respuesta de SUNAT automáticamente cuando no están configuradas,
así que puedes probar todo el flujo de Caja sin tener aún la cuenta Nubefact.

```bash
npm run dev
```

Abre `http://localhost:3000`, inicia sesión con el usuario admin que creaste.

---

## 4. Desplegar a Vercel

1. Sube esta carpeta a un repositorio de GitHub.
2. En Vercel: **Add New → Project** → importa el repositorio.
3. En **Environment Variables** agrega las mismas variables de tu `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, y `NUBEFACT_BASE_URL` / `NUBEFACT_TOKEN` cuando
   los tengas).
4. Deploy. Vercel te da una URL pública (ej. `tu-proyecto.vercel.app`).
5. En Supabase → **Authentication → URL Configuration**, agrega esa URL a
   "Site URL" y a "Redirect URLs".

---

## 5. Conectar la facturación electrónica (SUNAT vía Nubefact)

1. Crea tu cuenta en Nubefact y activa primero el **modo de prueba** (series
   `FFF1` para factura y `BBB1` para boleta).
2. Te entregarán una URL tipo `https://api.nubefact.com/api/v1/tu-ruta` y un
   `token`. Colócalos en `NUBEFACT_BASE_URL` y `NUBEFACT_TOKEN`.
3. El archivo `lib/nubefact.ts` arma el JSON con el formato público conocido de
   Nubefact (`operacion: generar_comprobante`, `items`, etc.). **Antes de pasar
   a producción**, valida cada campo contra la documentación que te entregan al
   crear tu cuenta — hay catálogos (tipo de IGV, unidad de medida) que pueden
   variar según tu configuración.
4. Cuando tengas tu RUC y series reales, cambia a modo producción en Nubefact y
   actualiza las variables de entorno en Vercel.

---

## 6. Códigos de barra

- **Lector USB tipo pistola**: no necesita configuración — funciona como un
  teclado. Simplemente ubica el cursor en el buscador de productos (en
  "Nuevo pedido", Requerimientos, Órdenes de Compra o Movimientos) y escanea;
  el sistema reconoce el código de barras automáticamente.
- **Cámara del celular/tablet**: usa el botón "📷 Escanear" en la pantalla de
  Nuevo Pedido (usa la librería `html5-qrcode`, funciona en cualquier
  navegador moderno con permiso de cámara).

---

## 7. Carga masiva por Excel

Cada módulo (Productos, Requerimiento, Orden de Compra, Movimientos) tiene un
botón **"Descargar plantilla Excel"** que genera el archivo con las columnas
exactas que el sistema espera, y un botón **"Subir Excel"** para procesarlo.
Los productos se identifican por `codigo_interno`, así que asegúrate de que tu
Excel use el mismo código con el que registraste el producto.

---

## 8. Estructura del proyecto

```
app/
  (auth)/login/           Página de inicio de sesión
  (app)/                  Layout con navegación según rol
    ventas/pedido-nuevo/  Armado de pedidos (vendedor)
    ventas/pedidos/       Listado de pedidos
    caja/                 Cobro + emisión de comprobante (cajero)
    almacen/
      requerimientos/     Requerimiento de Mercadería
      ordenes-compra/     Órdenes de Compra (puede jalar de un requerimiento)
      movimientos/        Ingreso/Salida/Traslado (Guía de Remisión)
      stock/              Consulta de stock por ubicación
    productos/            CRUD de productos + carga masiva
    clientes/             CRUD de clientes
  api/sunat/emitir/       Endpoint que arma y envía el comprobante a Nubefact
components/               Componentes reusables (buscador, escáner, Excel)
lib/                      Clientes de Supabase, PDF de ticket, cliente Nubefact
supabase/migrations/      Esquema SQL completo (tablas, triggers, RLS)
```

---

## 9. Qué falta / próximos pasos sugeridos

Este proyecto entrega un **sistema funcional de punta a punta** para los flujos
descritos (requerimiento → compra → ingreso → stock → pedido → cobro →
comprobante), con autenticación y permisos por rol ya aplicados a nivel de base
de datos (RLS) — no solo en la interfaz. Algunas mejoras que puedes pedir a
continuación según los uses:

- Pantalla de administración de usuarios/roles dentro de la app (hoy se hace
  desde el Table Editor de Supabase).
- Reportes (ventas por período, kardex de movimientos, valorización de stock).
- Anulación de comprobantes y notas de crédito.
- Reimpresión de tickets/comprobantes ya emitidos.
- Notificaciones cuando el stock de un producto llega a un mínimo.
