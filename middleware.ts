import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas de Almacén: solo admin y almacenero.
const ALMACEN_PREFIX = "/almacen";
// Rutas de Caja: solo admin y cajero.
const CAJA_PREFIX = "/caja";
// Rutas de Administración: solo admin.
const ADMIN_PREFIX = "/admin";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !request.nextUrl.pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role;
    const path = request.nextUrl.pathname;

    // El vendedor y el cajero NUNCA entran al módulo Almacén.
    if (path.startsWith(ALMACEN_PREFIX) && !["admin", "almacenero"].includes(role ?? "")) {
      return NextResponse.redirect(new URL("/ventas/pedido-nuevo", request.url));
    }

    // Caja solo para cajero/admin.
    if (path.startsWith(CAJA_PREFIX) && !["admin", "cajero"].includes(role ?? "")) {
      return NextResponse.redirect(new URL("/ventas/pedido-nuevo", request.url));
    }

    // Administración solo para admin.
    if (path.startsWith(ADMIN_PREFIX) && role !== "admin") {
      return NextResponse.redirect(new URL("/ventas/pedido-nuevo", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/sunat).*)"],
};
